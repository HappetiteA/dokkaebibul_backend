// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const REVERSE_GEOCODING_API_CLIENT_ID = Deno.env.get("REVERSE_GEOCODING_API_CLIENT_ID")!;
const REVERSE_GEOCODING_API_CLIENT_SECRET = Deno.env.get("REVERSE_GEOCODING_API_CLIENT_SECRET")!;

Deno.serve(async (req) => {
  const { lat, lon } = await req.json();
  const address = await fetchAddressFromCoords(+lat, +lon);
  return new Response(JSON.stringify({ address }), {
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * Calls Naver Reverse Geocoding API
 */
async function fetchAddressFromCoords(lat: number, lon: number): Promise<string> {
  try {
    // Naver expects coords in "lon,lat" format
    const coordString = `${lon},${lat}`;
    const url = `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${coordString}&output=json&orders=roadaddr,addr`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-ncp-apigw-api-key-id": REVERSE_GEOCODING_API_CLIENT_ID,
        "x-ncp-apigw-api-key": REVERSE_GEOCODING_API_CLIENT_SECRET,
        Accept: "application/json",
      },
    });

    const json = await response.json();

    if (json.status.code !== 0) {
      console.error("Geocoding Error:", json.status.message);
      return "주소 확인 오류";
    }

    // Attempt to find road address first, then standard address
    const result =
      json.results.find((r: any) => r.name === "roadaddr") ||
      json.results.find((r: any) => r.name === "addr");

    if (!result) return "주소 없음";

    // specific formatting depends on response structure, this is a safe generic builder
    const region = result.region;
    const land = result.land;

    // Example: "Seoul" "Gangnam-gu" ...
    let fullAddr = `${region.area1.name} ${region.area2.name} ${region.area3.name}`;

    // Add detailed road name/number if available
    if (land) {
      if (land.name) fullAddr += ` ${land.name}`;
      if (land.number1) fullAddr += ` ${land.number1}`;
      if (land.number2) fullAddr += `-${land.number2}`;
    }

    return fullAddr.trim();
  } catch (error) {
    console.error("Geocoding Fetch Error:", error);
    return "주소 확인 오류";
  }
}
