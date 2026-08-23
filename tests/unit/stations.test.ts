import { describe, expect, it } from "vitest";
import { normalizeStations } from "@/lib/stations";

const rawStations = [
  {
    stationuuid: "se-1",
    name: "  Stockholm FM  ",
    countrycode: "SE",
    state: "Stockholm",
    tags: "Pop, news, pop",
    language: "Swedish",
    codec: "MP3",
    bitrate: 128,
    url_resolved: "https://radio.example.se/live.mp3",
    favicon: "https://radio.example.se/icon.png",
    homepage: "https://radio.example.se",
    lastcheckok: 1,
    clickcount: 12,
    votes: 5,
  },
  {
    stationuuid: "blocked-http",
    name: "Blocked",
    countrycode: "US",
    url_resolved: "http://radio.example.com/live.mp3",
    lastcheckok: 1,
  },
  {
    stationuuid: "other-country",
    name: "Elsewhere",
    countrycode: "NO",
    url_resolved: "https://radio.example.no/live.mp3",
    lastcheckok: 1,
  },
  {
    stationuuid: "se-1",
    name: "Duplicate",
    countrycode: "SE",
    url_resolved: "https://duplicate.example/live.mp3",
    lastcheckok: 1,
  },
];

describe("normalizeStations", () => {
  it("keeps verified HTTPS stations from initial countries and deduplicates by UUID", () => {
    expect(normalizeStations(rawStations)).toEqual([
      expect.objectContaining({
        id: "se-1",
        name: "Stockholm FM",
        countryCode: "SE",
        region: "Stockholm",
        tags: ["news", "pop"],
        streamUrl: "https://radio.example.se/live.mp3",
        isVerified: true,
      }),
    ]);
  });
});
