import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStations } from "@/lib/radio-browser";

afterEach(() => vi.unstubAllGlobals());

describe("fetchStations", () => {
  it("queries all initial countries and returns normalized stations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        stationuuid: "dk-1",
        name: "Copenhagen Radio",
        countrycode: "DK",
        url_resolved: "https://radio.example.dk/live.mp3",
        lastcheckok: 1,
        clickcount: 9,
      },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchStations({ country: "DK", query: "copenhagen" })).resolves.toEqual([
      expect.objectContaining({ id: "dk-1", countryCode: "DK" }),
    ]);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain("countrycode=DK");
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain("name=copenhagen");
  });
});
