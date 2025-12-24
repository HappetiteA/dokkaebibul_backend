// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Database } from "../../../database.types.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req) => {
  const { conversation_id: convId, partner_id, content } = await req.json();

  // insert ai chat to db
  const { error: insertError } = await supabase.from("messages").insert({
    content,
    conversation_id: convId,
    is_human: false,
    sender_id: partner_id,
  });
  if (insertError) {
    const errlog = JSON.stringify({ error: "Failed to insert ai chat", details: insertError });
    console.error(errlog);
    return new Response(errlog, { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify(content), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
});
