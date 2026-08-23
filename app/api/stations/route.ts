import { NextRequest, NextResponse } from "next/server";
import { fetchStations } from "@/lib/radio-browser";
import { parseStationQuery } from "@/lib/station-query";

export async function GET(request: NextRequest) {
  const query = parseStationQuery(request.nextUrl.searchParams);
  const tag = request.nextUrl.searchParams.get("tag")?.trim().slice(0, 40) ?? "";
  try {
    const stations = await fetchStations({ ...query, tag });
    return NextResponse.json({ stations, query }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "Live station directory is temporarily unavailable." }, { status: 503 });
  }
}
