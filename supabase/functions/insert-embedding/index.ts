// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Database } from "../../../database.types.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { OpenAIEmbeddings } from "npm:@langchain/openai";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: openaiApiKey,
  modelName: "text-embedding-3-small",
  dimensions: 384,
});

Deno.serve(async (req) => {
  try {
    // 트리거 또는 요청에서 데이터 추출
    const { conversation_id, sender_id, content: newMessageContent } = await req.json();

    // 1. 해당 대화방의 바로 직전 메시지 1개 가져오기
    const { data: previousMessages, error: fetchError } = await supabase
      .from("messages")
      .select("content, sender_id")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(1); // 트리거 시점에 이미 새 메시지가 저장되어 있다면 limit(2) 후 2번째 것을 사용해야 할 수 있습니다.

    if (fetchError) throw fetchError;

    // 2. 텍스트 조립 (나/상대 구분)
    let combinedText = "";

    if (previousMessages && previousMessages.length > 0) {
      const prev = previousMessages[0];
      const prevPrefix = prev.sender_id === sender_id ? "나: " : "상대: ";
      combinedText += `${prevPrefix}${prev.content}\n`;
    }

    // 현재 메시지 추가
    combinedText += `나: ${newMessageContent}`;

    // 3. 임베딩 생성
    const [embedding] = await embeddings.embedDocuments([combinedText]);
    const embeddingString = `[${embedding.join(",")}]`;

    // 4. documents 테이블에 저장
    const { error: insertError } = await supabase.from("documents").insert({
      user_id: sender_id,
      body: combinedText,
      embedding: embeddingString,
    });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, processed_text: combinedText }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Main Trigger Error:", (error as any).message);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500 });
  }
});
