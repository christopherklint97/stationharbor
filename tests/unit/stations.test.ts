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
    clicktrend: 3,
    hls: 1,
    lastchecktime_iso8601: "2026-08-23T08:00:00Z",
    lastchangetime_iso8601: "2026-08-20T08:00:00Z",
    geo_lat: 59.3293,
    geo_long: 18.0686,
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
  it("keeps HTTP stations for discovery but marks them unavailable in secure web apps", () => {
    const stations = normalizeStations(rawStations);
    expect(stations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "blocked-http", streamUrl: "http://radio.example.com/live.mp3", isPlayable: false, availabilityReason: "HTTP stream blocked by secure web app" }),
    ]));
  });

  it("uses NPR's official HTTPS program stream and collapses duplicate directory entries", () => {
    const nprStations = normalizeStations([
      { stationuuid: "npr-mp3", name: "NPR 24 Hour Program Stream", countrycode: "US", codec: "MP3", bitrate: 96, url_resolved: "http://npr-ice.streamguys1.com/live.mp3", lastcheckok: 1 },
      { stationuuid: "npr-aac", name: "NPR 24 Hour Program Stream", countrycode: "US", codec: "AAC", bitrate: 64, url_resolved: "http://npr-ice.streamguys1.com/live.aac", lastcheckok: 1 },
    ]);

    expect(nprStations).toEqual([
      expect.objectContaining({
        id: "npr-mp3",
        streamUrl: "https://npr-ice.streamguys1.com/live.mp3",
        isPlayable: true,
        availabilityReason: null,
      }),
    ]);
  });

  it("keeps verified HTTPS stations from initial countries and deduplicates by UUID", () => {
    expect(normalizeStations(rawStations)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "se-1",
        name: "Stockholm FM",
        countryCode: "SE",
        region: "Stockholm",
        tags: ["news", "pop"],
        streamUrl: "https://radio.example.se/live.mp3",
        isVerified: true,
        hasHls: true,
        clickTrend: 3,
        lastCheckedAt: "2026-08-23T08:00:00Z",
        lastChangedAt: "2026-08-20T08:00:00Z",
        coordinates: { latitude: 59.3293, longitude: 18.0686 },
      }),
    ]));
  });
});
