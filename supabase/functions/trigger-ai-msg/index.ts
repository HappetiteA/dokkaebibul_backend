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
  console.log(`Bearer ${supabaseAnonKey}`);
  try {
    // 1. 트리거로부터 전달받은 데이터 추출 (NEW 레코드)
    const { conversation_id, sender_id, content, is_human } = await req.json();

    // 사람이 보낸 메시지가 아니면 즉시 종료
    if (!is_human) {
      return new Response("Not a human message, skipping.", { status: 200 });
    }

    // --- 1.1. 임베딩 삽입 함수 호출 (비동기 처리 유도) ---
    // Edge Function은 비동기 fetch를 기다리지 않고 바로 다음 로직을 진행할 수 있습니다.
    fetch(`${supabaseUrl}/functions/v1/insert-embedding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ conversation_id, sender_id, content }),
    }).catch((err) => console.error("Embedding function error:", err));

    // --- 2. 대화 정보 및 상대방 프로필 조회 ---
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .select(
        `
        user1_id, user2_id, 
        user1_chat_enabled, user1_ai_enabled, 
        user2_chat_enabled, user2_ai_enabled
      `
      )
      .eq("id", conversation_id)
      .single();

    if (convError || !convData) {
      throw new Error(`Conversation not found: ${convError?.message}`);
    }

    // 상대방 ID 결정 (Trigger의 CASE WHEN 로직)
    const partner_id = convData.user1_id === sender_id ? convData.user2_id : convData.user1_id;

    // 상대방의 profile 정보 (is_ai_enabled 체크용)
    // .select() 내의 join을 통해 partner 데이터를 가져옵니다.
    const { data: partnerProfile, error: partnerError } = await supabase
      .from("profiles")
      .select("is_ai_enabled")
      .eq("user_id", partner_id)
      .single();
    if (partnerError || !partnerProfile) {
      throw new Error(`Conversation not found: ${partnerError?.message}`);
    }

    // --- 3. 로직 평가 ---
    let v_should_trigger = false;

    if (sender_id === convData.user1_id) {
      // 내가 유저1이면, 유저2(상대방)의 설정 확인
      if (
        partnerProfile.is_ai_enabled &&
        convData.user2_chat_enabled &&
        convData.user2_ai_enabled
      ) {
        v_should_trigger = true;
      }
    } else if (sender_id === convData.user2_id) {
      // 내가 유저2이면, 유저1(상대방)의 설정 확인
      if (
        partnerProfile.is_ai_enabled &&
        convData.user1_chat_enabled &&
        convData.user1_ai_enabled
      ) {
        v_should_trigger = true;
      }
    }

    console.log(JSON.stringify({ v_should_trigger, sender_id, partnerProfile, convData }));

    // --- 4. 조건 충족 시 AI 메시지 생성 함수 호출 ---
    if (v_should_trigger) {
      // 응답을 기다리지 않고 호출하여 트리거 속도 유지
      fetch(`${supabaseUrl}/functions/v1/generate-ai-msg`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          conversation_id,
          sender_id,
          partner_id,
          last_message: content,
        }),
      }).catch((err) => console.error("AI Generation function error:", err));

      return new Response(JSON.stringify({ triggered: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ triggered: false }), { status: 200 });
  } catch (error) {
    console.error("Main Trigger Error:", (error as any).message);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500 });
  }
});
