import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req) => {
  try {
    // 1. 모든 유저 ID 조회
    const { data: users, error: userError } = await supabase.from("profiles").select("user_id");

    if (userError) throw userError;
    if (!users || users.length === 0) return new Response("No users found");

    const CHUNK_SIZE = 10; // 한 번에 처리할 유저 수
    const results = [];

    console.log(`Starting batch update for ${users.length} users in chunks of ${CHUNK_SIZE}...`);

    // 2. Chunking 로직: 유저 리스트를 CHUNK_SIZE만큼 잘라서 순차 처리
    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);
      console.log(
        `Processing chunk: ${i / CHUNK_SIZE + 1} (Users ${i + 1} to ${Math.min(
          i + CHUNK_SIZE,
          users.length
        )})`
      );

      // 현재 청크의 유저들을 병렬로 처리
      const chunkResults = await Promise.all(
        chunk.map(async (user) => {
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/update-memo`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
              },
              body: JSON.stringify({ user_id: user.user_id }),
            });

            const data = await res.json();
            console.log(JSON.stringify(data));
            return { user_id: user.user_id, status: res.status, success: res.ok };
          } catch (e) {
            return { user_id: user.user_id, status: "error", error: (e as any).message };
          }
        })
      );

      results.push(...chunkResults);

      // 각 청크 사이에 아주 짧은 대기 시간을 주어 API 부하를 분산 (선택 사항)
      if (i + CHUNK_SIZE < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return new Response(
      JSON.stringify({
        message: "Batch update completed",
        total_users: users.length,
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Batch Update Error:", (error as any).message);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500 });
  }
});
