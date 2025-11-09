// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Database } from "../../../database.types.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

console.log("Hello from Functions!");

Deno.serve(async (req) => {
  const { conversation_id: convId, sender_id: senderId } = await req.json();

  const { data: msgs, error: msgError } = await supabase
    .from("messages")
    .select("sender_id, content, is_human")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (msgError || !msgs) {
    return new Response(JSON.stringify({ error: "Messages not found ${msgError.message}" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = `너는 사용자와 채팅을 하고 있다. 가장 최근 채팅 기록이 주어진다. 주어진 대화를 분석하여 대화 맥락과 너의 말투를 파악하고 사용자의 마지막 채팅에 이어질 채팅으로 가장 적절한 채팅을 출력하라. 출력은 오직 전송할 채팅만 포함하라.`;

  const convertedMsg = convert_msgs(msgs, senderId);
  if (convertedMsg.at(-1)?.role !== "user") {
    return new Response(JSON.stringify({ error: "Last message is not user's" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [{ role: "system", content: prompt }, ...convertedMsg],
      max_completion_tokens: 100,
    }),
  });

  const openaiData = await openaiRes.json();

  if (!openaiRes.ok) {
    return new Response(JSON.stringify({ error: "Openai API call failed", details: openaiData }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  const content = openaiData.choices[0].message.content;
  return new Response(JSON.stringify({ content }), {
    headers: { "Content-Type": "application/json" },
    status: openaiRes.status,
  });
});

function convert_msgs(
  msgs: {
    sender_id: string;
    content: string;
    is_human: boolean;
  }[],
  senderId: string // The ID of the primary user/assistant we are tracking as 'assistant'
): { role: "user" | "assistant"; content: string }[] {
  const converted: { role: "user" | "assistant"; content: string }[] = [];

  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    const currentRole: "user" | "assistant" = msg.sender_id === senderId ? "assistant" : "user";
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

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-ai-msg' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
