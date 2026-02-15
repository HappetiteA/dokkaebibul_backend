// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Database } from "../../../database.types.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { SupabaseVectorStore } from "npm:@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "npm:@langchain/openai";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: openaiApiKey,
  modelName: "text-embedding-3-small",
  dimensions: 384,
});

const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabase,
  tableName: "documents",
  queryName: "match_documents",
});

Deno.serve(async (req) => {
  try {
    const { conversation_id, sender_id, partner_id, last_message: lastMsg } = await req.json();

    // 0. 나와의 대화 여부 확인
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .select("user1_id, user2_id")
      .eq("id", conversation_id)
      .single();
    if (convError || !convData) {
      throw new Error(`Conversation not found: ${convError?.message}`);
    }

    const isSelf = convData.user1_id === convData.user2_id;

    // 1. 과거 채팅 검색, 주인 맥락 로드, 현재 채팅 로드
    const [dynamicStyleContext, personaContext, convertedMsg] = await Promise.all([
      getRagContext(lastMsg, partner_id),
      getPersonaContext(sender_id),
      loadConversation(conversation_id, lastMsg, partner_id, isSelf),
    ]);

    // 2. 시스템 프롬프트 구성 (JSON 포맷 강제)
    const systemPrompt = `
너는 지금부터 '주인'을 대신해서 대화하는 AI야.
주인의 프로필과 검색된 '과거 대화 기록'을 바탕으로 답변을 생성해.

*** 출력 포맷 (JSON) ***
실제 메신저처럼 짧게 끊어치기 위해 아래 포맷을 반드시 지켜.
{
    "messages": [
        "메시지1",
        "메시지2"
    ]
}
반드시 위 JSON 문자열만 반환하고 추가 텍스트를 포함하지 마.
${personaContext}
${dynamicStyleContext}
    `.trim();

    // 4. OpenAI Chat Completion 호출
    const { error: rpcError } = await supabase.rpc("subtract_coin", {
      target_user_id: partner_id,
    });
    if (rpcError) throw rpcError;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "system", content: systemPrompt }, ...convertedMsg],
        max_completion_tokens: 100,
        temperature: 0.8,
        response_format: { type: "json_object" }, // JSON 모드 활성화
      }),
    });

    const openaiData = await openaiRes.json();
    if (!openaiRes.ok) throw new Error("OpenAI API call failed");

    // 5. 응답 처리 및 저장
    const rawContent = openaiData.choices[0].message.content;
    let finalMessages: string[] = [];

    try {
      const parsed = JSON.parse(rawContent);
      finalMessages = parsed.messages || [rawContent];
    } catch (e) {
      console.error("JSON Parsing failed, using raw content", JSON.stringify(e));
      finalMessages = [rawContent];
    }

    // 각 메시지를 순차적으로 DB에 저장 (비동기)
    for (const msg of finalMessages) {
      fetch(`${supabaseUrl}/functions/v1/insert-ai-msg`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          conversation_id: conversation_id,
          partner_id: partner_id,
          content: msg,
        }),
      });
    }

    return new Response(JSON.stringify({ messages: finalMessages }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Main Trigger Error:", (error as any).message);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500 });
  }
});

/**
 * 대화 기록 불러오기 및 변환
 */
async function loadConversation(
  convId: string,
  lastMsg: string,
  partner_id: string,
  isSelf: boolean,
) {
  const { data: msgs, error: msgError } = await supabase
    .from("messages")
    .select("sender_id, content, is_human")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (msgError || !msgs) throw new Error("Messages not found");

  const convertedMsg = convert_msgs(
    [{ sender_id: "", content: lastMsg, is_human: true }, ...msgs],
    partner_id,
    isSelf,
  );
  return convertedMsg;
}

/**
 * 주인 맥락 프롬프트 구성
 */
async function getPersonaContext(sender_id: string) {
  try {
    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .select("*")
      .eq("user_id", sender_id)
      .limit(1);

    if (personaError) throw personaError;
    if (!persona) return "";

    const { name, age, job, hobby, memo, memory } = persona[0];
    const personaContext = `
[주인 프로필]
${JSON.stringify({ name, age, job, hobby })}

[주인 특징 및 메모]
${memo.trim()}

${memory.trim()}
`;
    return personaContext;
  } catch {
    return "";
  }
}

/**
 * RAG: 유사한 과거 대화 기록 검색
 */
async function getRagContext(lastMsg: string, partner_id: string) {
  try {
    // 현재 사용자 입력과 유사한 스타일 로그 3개 검색
    const similarDocs = await vectorStore.similaritySearch(lastMsg, 3, {
      user_id: partner_id,
      match_threshold: 0,
    });
    const logsText = similarDocs.map((doc) => doc.pageContent).join("\n---\n");

    const dynamicStyleContext = `
[주인의 과거 대화 기록 (참고용)]
현재 상황과 유사한 과거 대화야. 이 말투와 대응 방식을 참고해서 답변해.

${logsText}
    `;
    return dynamicStyleContext;
  } catch {
    return "";
  }
}

function convert_msgs(
  msgs: {
    sender_id: string;
    content: string;
    is_human: boolean;
  }[],
  partnerId: string, // The ID of the primary user/assistant we are tracking as 'assistant'
  isSelf: boolean, // flag of self
): { role: "user" | "assistant"; content: string }[] {
  const converted: { role: "user" | "assistant"; content: string }[] = [];

  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    const currentRole: "user" | "assistant" =
      (isSelf && msg.is_human) || msg.sender_id !== partnerId ? "user" : "assistant";
    const lastConverted = converted[converted.length - 1];
    if (lastConverted && lastConverted.role === currentRole) {
      lastConverted.content = msg.content + "\n" + lastConverted.content;
    } else {
      converted.push({
        role: currentRole,
        content: msg.content,
      });
    }
  }

  return converted;
}
