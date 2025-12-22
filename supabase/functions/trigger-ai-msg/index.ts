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
  const { conversation_id: convId, sender_id: senderId, message } = await req.json();

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", convId)
    .single();
  if (convError || !conv) {
    const newLocal_1 = JSON.stringify({ error: "Conversation not found", details: convError });
    console.log(newLocal_1);
    return new Response(newLocal_1, {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // check if partner has enabled ai
  const partnerId = conv.user1_id === senderId ? conv.user2_id : conv.user1_id;

  const { data: partner, error: partnerError } = await supabase
    .from("profiles")
    .select("is_ai_enabled")
    .eq("user_id", partnerId)
    .single();
  if (partnerError || !partner) {
    const newLocal_2 = JSON.stringify({ error: "Partner not found", details: partnerError });
    console.log(newLocal_2);
    return new Response(newLocal_2, {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (
    (conv.user1_id === senderId &&
      !(partner.is_ai_enabled && conv.user2_chat_enabled && conv.user2_ai_enabled)) ||
    (conv.user2_id === senderId &&
      !(partner.is_ai_enabled && conv.user1_chat_enabled && conv.user1_ai_enabled))
  ) {
    return new Response(null, {
      status: 204,
      headers: { "Content-Type": "application/json" },
    });
  }

  // generate ai chat
  const targetFunctionUrl = `${supabaseUrl}/functions/v1/generate-ai-msg`;

  fetch(targetFunctionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      conversation_id: convId,
      sender_id: partnerId,
      last_message: message,
    }),
  });

  return new Response(null, { status: 204, headers: { "Content-Type": "application/json" } });
});
