// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req) => {
  const { conversation_id: convId, partner_id, message } = await req.json();

  // generate ai chat
  fetch(`${supabaseUrl}/functions/v1/generate-ai-msg`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      conversation_id: convId,
      partner_id,
      last_message: message,
    }),
  });

  return new Response(null, { status: 204, headers: { "Content-Type": "application/json" } });
});
