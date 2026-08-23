import { NextRequest } from "next/server";
import { assertRelayUrl } from "@/lib/stream-relay";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return new Response("Missing stream URL", { status: 400 });

  try {
    const url = assertRelayUrl(source);
    const upstream = await fetch(url, {
      headers: { "User-Agent": "StationHarbor local relay/0.1", "Icy-MetaData": "1" },
      redirect: "follow",
    });
    if (!upstream.ok || !upstream.body) return new Response("Upstream stream unavailable", { status: 502 });

    const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "no-store");
    headers.set("X-StationHarbor-Relay", "local-http-stream");
    if (contentType.includes("mpegurl")) {
      const playlist = await upstream.text();
      const rewritten = playlist.split("\n").map((line) => {
        if (!line.trim() || line.startsWith("#")) return line;
        return `/api/relay?url=${encodeURIComponent(new URL(line.trim(), url).toString())}`;
      }).join("\n");
      return new Response(rewritten, { status: 200, headers });
    }
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response("Relay request rejected or upstream unavailable", { status: 502 });
  }
}
