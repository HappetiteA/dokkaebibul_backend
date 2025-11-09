// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Database } from "../../../database.types.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req) => {
  const { message_id } = await req.json();
  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .select("*")
    .eq("id", message_id)
    .single();
  if (msgError || !msg) {
    return new Response(JSON.stringify({ error: "Conversation not found", details: msgError }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // check if sended message is human's
  if (!msg.is_human) {
    return new Response(null, {
      status: 204,
      headers: { "Content-Type": "application/json" },
    });
  }

  const convId = msg.conversation_id;
  const senderId = msg.sender_id;

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("conversation_id", convId)
    .single();
  if (convError || !conv) {
    return new Response(JSON.stringify({ error: "Conversation not found", details: convError }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // check if partner has enabled ai
  if (
    (conv.user1_id === senderId && (!conv.user2_chat_enabled || !conv.user2_ai_enabled)) ||
    (conv.user2_id === senderId && (!conv.user1_chat_enabled || !conv.user1_ai_enabled))
  ) {
    return new Response(null, {
      status: 204,
      headers: { "Content-Type": "application/json" },
    });
  }

  // generate ai chat
  const targetFunctionUrl = `${supabaseUrl}/functions/v1/generate-ai-msg`;

  const newSenderId = conv.user1_id === senderId ? conv.user2_id : conv.user1_id;
  const chatRes = await fetch(targetFunctionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      conversation_id: convId,
      sender_id: newSenderId,
    }),
  });
  const chat = await chatRes.json();
  if (!chatRes.ok) {
    return new Response(JSON.stringify({ error: "Failed to generate ai chat", details: chat }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // insert ai chat to db
  const { error: insertError } = await supabase.from("messages").insert({
    content: chat.content,
    conversation_id: convId,
    is_human: false,
    sender_id: newSenderId,
  });
  if (insertError) {
    return new Response(
      JSON.stringify({ error: "Failed to insert ai chat", details: insertError }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(null, { status: 201, headers: { "Content-Type": "application/json" } });
});
