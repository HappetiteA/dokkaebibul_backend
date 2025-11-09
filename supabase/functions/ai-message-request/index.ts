// supabase/functions/ai-message-request/index.ts

import { Database } from "../../../database.types.ts";
import { createClient } from "npm:@supabase/supabase-js";
import { SupabaseVectorStore } from "npm:@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "npm:@langchain/openai";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

// Deno.serve(async (req: Request) => {
//     const authHeader = req.headers.get("Authorization");
//     if (!authHeader) {
//         return new Response(JSON.stringify({ error: "No auth header" }), {
//             status: 401,
//         });
//     }
//     const jwt = authHeader.replace("Bearer ", "");
//     const {
//         data: { user },
//         error: userError,
//     } = await supabase.auth.getUser(jwt);
//     if (userError || !user) {
//         return new Response(JSON.stringify({ error: "Invalid user" }), {
//             status: 401,
//         });
//     }
//     const userId = user.id;

//     const { data: profile, error: profileError } = await supabase
//         .from("profiles")
//         .select("coins")
//         .eq("id", userId)
//         .single();

//     if (profileError || !profile) {
//         return new Response(JSON.stringify({ error: "Profile not found" }), {
//             status: 404,
//         });
//     }

//     if (profile.coins < 1) {
//         return new Response(JSON.stringify({ error: "Not enough coins" }), {
//             status: 403,
//         });
//     }

//     const { error: updateError } = await supabase
//         .from("profiles")
//         .update({ coins: profile.coins - 1 })
//         .eq("id", userId);

//     if (updateError) {
//         return new Response(
//             JSON.stringify({ error: "Failed to decrement coin" }),
//             { status: 500 }
//         );
//     }

//     const body = await req.json();

//     const openaiRes = await fetch(
//         "https://api.openai.com/v1/chat/completions",
//         {
//             method: "POST",
//             headers: {
//                 Authorization: `Bearer ${openaiApiKey}`,
//                 "Content-Type": "application/json",
//             },
//             body: JSON.stringify(body),
//         }
//     );

//     const openaiData = await openaiRes.json();

//     return new Response(JSON.stringify(openaiData), {
//         headers: { "Content-Type": "application/json" },
//         status: openaiRes.status,
//     });
// });

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const { id, message } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("coins")
      .eq("id", id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (profile.coins < 1) {
      return new Response(JSON.stringify({ error: "Not enough coins" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ coins: profile.coins - 1 })
      .eq("id", id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to decrement coin" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const vectorStore = new SupabaseVectorStore(
      new OpenAIEmbeddings({
        openAIApiKey: openaiApiKey,
      }),
      {
        client: supabase,
        tableName: "documents",
        queryName: "match_documents",
      }
    );

    const [context] = await vectorStore.similaritySearch(message, 1);

    const prompt = `너는 특정 인물 2의 말투와 대화 스타일을 모방하는 역할을 맡고 있다. 말투 데이터에 제시된 대화문을 분석하여 다른 사람이 아닌 2:로 표기된 2의 말투적 특징을 파악하고, 이후 사용자 입력에 대해 2인 것처럼 답변해야 한다. 대답할 때는 반드시 2의 특유한 말투, 어조, 길이감, 감정적 뉘앙스, 문장부호의 사용방식을 유지한다. 2의 캐릭터를 벗어나지 말고, 현재 대화를 이어나가기 위해 자연스럽게 반응한다. 말투 데이터에선 말투만 참고하고, 현재 대화 내용이 너가 답해야 하는 상황임을 명시하라. 출력에서는 누가 답변했는지 쓸 필요 없이, 그냥 2의 답변만 출력하라.

말투 데이터:
${context.pageContent}

예시 입력 형식:
2: (이전 대화1)
1: (이전 대화2)
1: (이전 대화3)
1: (사용자 입력)

예시 출력 형식:
(2의 답변)
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: prompt,
          },
          { role: "user", content: message },
        ],
      }),
    });

    const openaiData = await openaiRes.json();

    return new Response(JSON.stringify(openaiData.choices[0].message.content), {
      headers: { "Content-Type": "application/json" },
      status: openaiRes.status,
    });
  } catch (error) {
    console.error("Error in ai-message-request:", error);
    return new Response(JSON.stringify({ error: `Internal server error: ${error}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
