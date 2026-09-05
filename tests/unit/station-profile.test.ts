import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ default: { lookup: network.lookup }, lookup: network.lookup }));
vi.mock("node:https", () => ({ default: { request: network.request }, request: network.request }));

import { extractWebsiteProfile, fetchStationWebsiteProfile, isPublicAddress } from "@/lib/station-profile";

afterEach(() => {
  vi.unstubAllGlobals();
  network.lookup.mockReset();
  network.request.mockReset();
});

describe("station website profiles", () => {
  it("extracts and cleans broadcaster-provided page metadata", () => {
    expect(extractWebsiteProfile(`
      <html><head>
        <meta property="og:site_name" content="Example Radio">
        <meta name="description" content="Local news &amp; live sports for the whole Bay Area.">
        <title>Listen live | Example Radio</title>
      </head></html>
    `)).toEqual({
      siteName: "Example Radio",
      description: "Local news & live sports for the whole Bay Area.",
    });
  });

  it("ignores empty or suspiciously long metadata", () => {
    expect(extractWebsiteProfile(`<meta name="description" content="${"x".repeat(1200)}"><title>   </title>`)).toEqual({
      siteName: null,
      description: null,
    });
  });

  it("pins every website redirect hop to its validated public address", async () => {
    const directoryFetch = vi.fn(async (input: string | URL | Request) => {
      if (!String(input).startsWith("https://de1.api.radio-browser.info/")) throw new Error("Website request bypassed the pinned HTTPS client");
      return new Response(JSON.stringify([{ homepage: "https://station.example/start" }]), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", directoryFetch);

    const addresses: Record<string, string> = {
      "station.example": "93.184.216.34",
      "publisher.example": "8.8.8.8",
    };
    network.lookup.mockImplementation(async (hostname: string) => [{ address: addresses[hostname], family: 4 }]);

    const responses: Array<{ statusCode: number; headers: Record<string, string>; body: string }> = [
      { statusCode: 302, headers: { location: "https://publisher.example/home" }, body: "" },
      { statusCode: 200, headers: { "content-type": "text/html" }, body: "<title>Pinned Radio</title>" },
    ];
    const connections: Array<{ hostname: string; address: string; servername?: string }> = [];
    network.request.mockImplementation((url: URL, options: {
      lookup: (
        hostname: string,
        settings: { all?: boolean },
        callback: (error: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
      ) => void;
      servername?: string;
    }, onResponse: (response: Readable & { statusCode: number; headers: Record<string, string> }) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void };
      request.end = () => options.lookup(url.hostname, { all: false }, (error, address) => {
        if (error) {
          request.emit("error", error);
          return;
        }
        const pinnedAddress = typeof address === "string" ? address : address[0]?.address ?? "";
        connections.push({ hostname: url.hostname, address: pinnedAddress, servername: options.servername });
        const responseData = responses.shift()!;
        const response = Readable.from([responseData.body]) as Readable & { statusCode: number; headers: Record<string, string> };
        response.statusCode = responseData.statusCode;
        response.headers = responseData.headers;
        onResponse(response);
      });
      return request;
    });

    await expect(fetchStationWebsiteProfile("95019533-f24b-4eb2-ba07-2ccdf1ea683e")).resolves.toEqual({
      homepage: "https://station.example/start",
      siteName: "Pinned Radio",
      description: null,
    });
    expect(network.lookup.mock.calls.map(([hostname]) => hostname)).toEqual(["station.example", "publisher.example"]);
    expect(connections).toEqual([
      { hostname: "station.example", address: "93.184.216.34", servername: "station.example" },
      { hostname: "publisher.example", address: "8.8.8.8", servername: "publisher.example" },
    ]);
    expect(directoryFetch).toHaveBeenCalledOnce();
  });

  it("rejects private and reserved network addresses", () => {
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("192.168.1.10")).toBe(false);
    expect(isPublicAddress("169.254.10.2")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("0:0:0:0:0:0:0:1")).toBe(false);
    expect(isPublicAddress("fc00::1")).toBe(false);
    expect(isPublicAddress("fec0::1")).toBe(false);
    expect(isPublicAddress("::ffff:7f00:1")).toBe(false);
    expect(isPublicAddress("64:ff9b:1::7f00:1")).toBe(false);
    expect(isPublicAddress("2002:7f00:1::")).toBe(false);
    expect(isPublicAddress("2001:db8::1")).toBe(false);
    expect(isPublicAddress("2001:100::1")).toBe(false);
    expect(isPublicAddress("2001:30::1")).toBe(false);
    expect(isPublicAddress("192.88.99.2")).toBe(false);
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(false);
  });
});
