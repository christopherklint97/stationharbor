import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type FetchEvent = {
  request: { method: string; mode: string; url: string };
  respondWith: (response: Promise<Response>) => void;
};

describe("service worker", () => {
  it("checks the network before a cached app shell for navigations", async () => {
    const handlers: Record<string, (event: FetchEvent) => void> = {};
    const fresh = new Response("fresh");
    const fetchMock = vi.fn().mockResolvedValue(fresh);
    const cacheMatch = vi.fn().mockResolvedValue(new Response("stale"));
    const respondWith = vi.fn();
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../public/sw.js"), "utf8");

    vm.runInNewContext(source, {
      URL,
      fetch: fetchMock,
      caches: {
        delete: vi.fn().mockResolvedValue(true),
        keys: vi.fn().mockResolvedValue([]),
        match: cacheMatch,
        open: vi.fn().mockResolvedValue({ addAll: vi.fn().mockResolvedValue(undefined) }),
      },
      self: {
        location: { origin: "https://stationharbor.test" },
        clients: { claim: vi.fn().mockResolvedValue(undefined) },
        skipWaiting: vi.fn(),
        addEventListener: (type: string, handler: (event: FetchEvent) => void) => { handlers[type] = handler; },
      },
    });

    handlers.fetch({
      request: { method: "GET", mode: "navigate", url: "https://stationharbor.test/" },
      respondWith,
    });
    const response = await respondWith.mock.calls[0][0];

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cacheMatch).not.toHaveBeenCalled();
    expect(response).toBe(fresh);
  });
});
