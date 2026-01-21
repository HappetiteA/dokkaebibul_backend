import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req) => {
  try {
    // 1. 요청 본문에서 user_id 추출
    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id is required");

    // 2. 최근 24시간 기준 시간 설정 (ISO String)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 3. 사용자가 참여한 모든 대화방 ID 및 기존 메모 가져오기
    const [{ data: convs }, { data: persona }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id")
        .or(`user1_id.eq.${user_id},user2_id.eq.${user_id}`),
      supabase.from("personas").select("memo").eq("user_id", user_id).single(),
    ]);

    if (!convs || convs.length === 0) {
      return new Response(JSON.stringify({ message: "No conversations found." }));
    }

    const conversationIds = convs.map((c) => c.id);

    if (persona === null) {
      return new Response(JSON.stringify({ message: "No persona found. Skipping AI update." }));
    }
    const currentMemo = persona.memo;

    // 실제 데이터 대신 갯수만 확인
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .gt("created_at", twentyFourHoursAgo);

    if (count === 0) {
      return new Response(
        JSON.stringify({ message: "No recent conversation. Skipping AI update." })
      );
    }

    // 4. 대화방들에서 최근 24시간 내 메시지 조회 (정렬 최적화)
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("conversation_id, sender_id, content")
      .in("conversation_id", conversationIds)
      .gt("created_at", twentyFourHoursAgo)
      // conversation_id로 먼저 묶고, 그 안에서 시간순 정렬
      .order("conversation_id", { ascending: true })
      .order("created_at", { ascending: true });

    if (msgError) throw msgError;
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ message: "No recent messages in last 24h." }));
    }

    // 5. 정렬된 데이터를 바탕으로 문자열 조립 (Map 없이 처리)
    let formattedHistory = "";
    let currentSessionId = "";
    let sessionCount = 0;

    for (const msg of messages) {
      // 새로운 세션이 시작될 때마다 헤더 추가
      if (msg.conversation_id !== currentSessionId) {
        currentSessionId = msg.conversation_id;
        sessionCount++;
        formattedHistory += `\n[대화 세션 ${sessionCount}]\n`;
      }

      const role = msg.sender_id === user_id ? "주인" : "상대";
      formattedHistory += `${role}: ${msg.content}\n`;
    }

    // 6. GPT 호출하여 메모 업데이트
    const prompt = `
너는 '주인'의 비서로서, 주인의 성격, 취향, 특이사항 등을 기록하는 메모를 관리하고 있어.

[현재 메모]
${currentMemo}

[최근 대화 기록 모음]
${formattedHistory}

위 대화 기록들은 주인이 여러 명의 다른 사람들과 나눈 대화야.
이 기록들에서 주인의 새로운 특징이나 취향, 사실 정보가 있다면 현재 메모에 추가하거나 수정해줘.
기존 내용은 유지하되, 모순되는 정보가 있다면 최신 대화 내용을 우선해.
출력은 오직 업데이트된 메모 내용(bullet point 형식)만 해줘.
`.trim();

    console.log(prompt);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "너는 사용자의 프로필 메모를 관리하는 에이전트야." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    const openaiData = await openaiRes.json();
    const newMemo = openaiData.choices[0].message.content;

    // 7. DB에 업데이트된 메모 저장
    const { error: updateError } = await supabase
      .from("personas")
      .update({ memo: newMemo })
      .eq("user_id", user_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        updated_memo: newMemo,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500 });
  }
});
