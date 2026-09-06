import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/relay/route";
import { assertRelayUrl } from "@/lib/stream-relay";

afterEach(() => vi.restoreAllMocks());

describe("assertRelayUrl", () => {
  it("allows public HTTP stream URLs", () => {
    expect(assertRelayUrl("http://radio.example.com/live.mp3").toString()).toBe("http://radio.example.com/live.mp3");
  });

  it("rejects non-HTTP and private targets", () => {
    expect(() => assertRelayUrl("https://radio.example.com/live.mp3")).toThrow();
    expect(() => assertRelayUrl("http://127.0.0.1:3000/admin")).toThrow();
    expect(() => assertRelayUrl("http://localhost/admin")).toThrow();
  });
});

describe("relay route", () => {
  it("requests raw audio without interleaved ICY metadata", async () => {
    const upstreamFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "audio/mpeg" },
    }));

    const response = await GET(new NextRequest("https://stationharbor.test/api/relay?url=http%3A%2F%2Fradio.example.com%2Flive.mp3"));
    const [, options] = upstreamFetch.mock.calls[0]!;

    expect(response.status).toBe(200);
    expect(new Headers(options?.headers).has("Icy-MetaData")).toBe(false);
  });
});
