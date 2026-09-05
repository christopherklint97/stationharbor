import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStations } from "@/lib/radio-browser";

afterEach(() => vi.unstubAllGlobals());

describe("fetchStations", () => {
  it("queries every selected country and merges normalized stations", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      const country = url.searchParams.get("countrycode")!;
      return Promise.resolve(new Response(JSON.stringify([
        {
          stationuuid: `${country.toLowerCase()}-1`,
          name: `${country} Radio`,
          countrycode: country,
          url_resolved: `https://radio.example/${country.toLowerCase()}.mp3`,
          lastcheckok: 1,
          clickcount: 9,
        },
      ]), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const stations = await fetchStations({ countries: ["DK", "US"], query: "radio", state: "", category: "all" });

    expect(stations.map((station) => station.countryCode)).toEqual(["DK", "US"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url.toString()).searchParams.get("countrycode"))).toEqual(["DK", "US"]);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain("name=radio");
  });

  it("expands News & Talk into server-side tag searches and applies state only to US", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchStations({ countries: ["DK", "US"], query: "", state: "California", category: "news-talk" });

    const urls = fetchMock.mock.calls.map(([url]) => new URL(url.toString()));
    expect(urls).toHaveLength(4);
    expect(urls.map((url) => url.searchParams.get("tag"))).toEqual(["news", "talk", "news", "talk"]);
    expect(urls.filter((url) => url.searchParams.get("countrycode") === "US").every((url) => url.searchParams.get("state") === "California")).toBe(true);
    expect(urls.filter((url) => url.searchParams.get("countrycode") === "DK").every((url) => !url.searchParams.has("state"))).toBe(true);
  });
});
