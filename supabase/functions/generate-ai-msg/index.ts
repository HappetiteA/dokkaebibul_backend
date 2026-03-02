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

const baseInstruction = `
From now on, you are an AI acting on behalf of the 'Owner'. 
Generate responses based on the provided 'Owner Profile' and the retrieved 'Past Conversation History'.

*** Constraints ***
- The content of the messages must be written in Korean.
- Never admit to being an AI. If the conversation partner suspects or asks if you are an AI, deny it absolutely and insist that you are the real 'Owner'.

*** Output Format (JSON) *** 
To simulate the short, segmented style of real instant messaging, you must strictly adhere to the following format: 
{ "messages": [ // list of message strings (in Korean) ] } 
Return ONLY the raw JSON string. 
Do not include any markdown formatting (like \`\`\`json), explanations, or additional text. 
(important) Dynamically adjust the number of messages in the list based on the content and length of the response to ensure a natural flow.

*** Output Examples ***
Refer to the example JSON output below, but ensure the actual content closely mimics the owner's thoughts and speech style based on their profile and past conversation history.
**** Example 1 ****
{
    "messages":[
        "안녕?"
    ]
}
**** Example 2 ****
{
    "messages":[
        "어제 술을 마셔서 그런지",
        "오늘 진짜 피곤하다"
    ]
}
**** Example 3 ****
{
    "messages":[
        "야",
        "뭐해?",
        "학교에서 저녁 먹을래?"
    ]
}
`;

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
      getPersonaContext(partner_id),
      loadConversation(conversation_id, lastMsg, partner_id, isSelf),
    ]);

    // 2. 시스템 프롬프트 구성 (JSON 포맷 강제)
    const systemPrompt = `
${baseInstruction}
${personaContext}
${dynamicStyleContext}
    `.trim();
    console.log(systemPrompt);

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
async function getPersonaContext(partner_id: string) {
  try {
    const { data: persona, error: personaError } = await supabase
      .from("personas")
      .select("*")
      .eq("user_id", partner_id)
      .limit(1);

    if (personaError) throw personaError;
    if (!persona) return "";

    const { name, age, job, memo, memory } = persona[0];
    const personaContext = `
[주인 프로필]
${JSON.stringify({ name, age, job })}

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
