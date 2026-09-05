import { afterEach, describe, expect, it, vi } from "vitest";
import { categoryTagQueries } from "@/lib/station-taxonomy";
import { fetchStations } from "@/lib/radio-browser";

afterEach(() => vi.unstubAllGlobals());

function repeatedJsonResponse(rows: unknown[]) {
  return vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(rows), { status: 200 })));
}

describe("fetchStations", () => {
  it("searches station names, locations, and tags in every selected country", async () => {
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
    const urls = fetchMock.mock.calls.map(([url]) => new URL(url.toString()));

    expect(stations.map((station) => station.countryCode)).toEqual(["DK", "US"]);
    expect(urls).toHaveLength(6);
    expect(urls.filter((url) => url.searchParams.get("name") === "radio")).toHaveLength(2);
    expect(urls.filter((url) => url.searchParams.get("state") === "radio")).toHaveLength(2);
    expect(urls.filter((url) => url.searchParams.get("tag") === "radio")).toHaveLength(2);
    expect(urls.filter((url) => url.searchParams.has("tag")).every((url) => url.searchParams.get("tagExact") === "false")).toBe(true);
  });

  it("expands News & Talk aliases server-side and applies a selected state only to US", async () => {
    const fetchMock = repeatedJsonResponse([]);
    vi.stubGlobal("fetch", fetchMock);

    await fetchStations({ countries: ["DK", "US"], query: "", state: "California", category: "news-talk" });

    const urls = fetchMock.mock.calls.map(([url]) => new URL(url.toString()));
    const aliases = categoryTagQueries["news-talk"];
    expect(urls).toHaveLength(aliases.length * 2);
    expect(urls.map((url) => url.searchParams.get("tag"))).toEqual([...aliases, ...aliases]);
    expect(urls.every((url) => url.searchParams.get("tagExact") === "false")).toBe(true);
    expect(urls.filter((url) => url.searchParams.get("countrycode") === "US").every((url) => url.searchParams.get("state") === "California")).toBe(true);
    expect(urls.filter((url) => url.searchParams.get("countrycode") === "DK").every((url) => !url.searchParams.has("state"))).toBe(true);
  });

  it("post-filters substring tag matches against the displayed taxonomy", async () => {
    vi.stubGlobal("fetch", repeatedJsonResponse([
      { stationuuid: "newsletter", name: "Newsletter FM", countrycode: "US", tags: "newsletter", url_resolved: "https://example.com/live.mp3", lastcheckok: 1 },
    ]));

    await expect(fetchStations({ countries: ["US"], category: "news-talk" })).resolves.toEqual([]);
  });

  it("keeps a city match found through the directory state field", async () => {
    vi.stubGlobal("fetch", repeatedJsonResponse([
      { stationuuid: "dallas", name: "The Fan", countrycode: "US", state: "Dallas, Texas", tags: "sports", url_resolved: "https://example.com/fan.mp3", lastcheckok: 1 },
    ]));

    await expect(fetchStations({ countries: ["US"], query: "Dallas", category: "all" })).resolves.toEqual([
      expect.objectContaining({ id: "dallas", region: "Dallas, Texas" }),
    ]);
  });

  it("rejects a successful response whose JSON shape is not a station array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "bad mirror" }), { status: 200 })));

    await expect(fetchStations({ countries: ["SE"], category: "all" })).rejects.toThrow("partially unavailable");
  });

  it("fails rather than silently presenting a partial multi-country result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockRejectedValueOnce(new Error("mirror failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchStations({ countries: ["SE", "DK"], category: "all" })).rejects.toThrow("partially unavailable");
  });
});
