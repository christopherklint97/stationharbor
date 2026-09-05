import { NextRequest, NextResponse } from "next/server";
import { fetchStationWebsiteProfile } from "@/lib/station-profile";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const stationId = request.nextUrl.searchParams.get("id") ?? "";
  try {
    const profile = await fetchStationWebsiteProfile(stationId);
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ profile: null }, { headers: { "Cache-Control": "public, s-maxage=600" } });
  }
}
