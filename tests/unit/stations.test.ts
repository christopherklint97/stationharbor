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

  it("groups codec variants and automatically selects the most compatible verified source", () => {
    const stations = normalizeStations([
      {
        stationuuid: "aac-http",
        name: "Example Sports Radio (AAC)",
        countrycode: "US",
        state: "California",
        homepage: "https://example.com/radio",
        url_resolved: "http://streams.example.com/live.aac",
        codec: "AAC",
        bitrate: 64,
        tags: "sports talk,nfl",
        lastcheckok: 1,
        clickcount: 50,
      },
      {
        stationuuid: "mp3-https",
        name: "Example Sports Radio",
        countrycode: "US",
        state: "California",
        homepage: "https://example.com/radio",
        url_resolved: "https://streams.example.com/live.mp3",
        codec: "MP3",
        bitrate: 128,
        tags: "sports,news",
        lastcheckok: 1,
        clickcount: 20,
      },
    ]);

    expect(stations).toHaveLength(1);
    expect(stations[0]).toEqual(expect.objectContaining({
      id: "mp3-https",
      name: "Example Sports Radio",
      codec: "MP3",
      streamUrl: "https://streams.example.com/live.mp3",
      tags: ["news", "nfl", "sports", "sports talk"],
      categories: ["news-talk", "sports"],
      sourceCount: 2,
    }));
    expect(stations[0]?.sources).toEqual([
      expect.objectContaining({ id: "mp3-https", codec: "MP3", isDirect: true }),
      expect.objectContaining({ id: "aac-http", codec: "AAC", isDirect: false }),
    ]);
  });

  it("moves trailing codec and bitrate details out of the station name", () => {
    expect(normalizeStations([
      { stationuuid: "technical-name", name: "Radio Paradise Main Mix (EU) 320K AAC", countrycode: "US", url_resolved: "https://example.com/live.aac", codec: "AAC", bitrate: 320, lastcheckok: 1 },
    ])[0]?.name).toBe("Radio Paradise Main Mix");
  });

  it("groups the same publisher stream even when directory regions disagree", () => {
    const stations = normalizeStations([
      { stationuuid: "one", name: "World Radio", countrycode: "DK", state: "Randers", url_resolved: "http://stream.example.dk/world-mp3", codec: "MP3", lastcheckok: 1 },
      { stationuuid: "two", name: "World Radio", countrycode: "DK", state: "Copenhagen", url_resolved: "http://stream.example.dk/world-aac", codec: "AAC", lastcheckok: 1 },
    ]);
    expect(stations).toHaveLength(1);
    expect(stations[0]?.sourceCount).toBe(2);
  });

  it("does not merge same-named stations that only share a CDN host or blank region", () => {
    const stations = normalizeStations([
      {
        stationuuid: "pulse-east",
        name: "Pulse FM",
        countrycode: "US",
        state: "",
        homepage: "https://pulse-east.example/",
        url_resolved: "https://shared-cdn.example/east/listen.mp3",
        codec: "MP3",
        lastcheckok: 1,
      },
      {
        stationuuid: "pulse-west",
        name: "Pulse FM",
        countrycode: "US",
        state: "California",
        homepage: "https://pulse-west.example/",
        url_resolved: "https://shared-cdn.example/west/listen.aac",
        codec: "AAC",
        lastcheckok: 1,
      },
    ]);

    expect(stations).toHaveLength(2);
    expect(stations.map((station) => station.id).sort()).toEqual(["pulse-east", "pulse-west"]);
    expect(stations.every((station) => station.sourceCount === 1)).toBe(true);
  });

  it("does not treat different co.uk stream hosts as the same publisher", () => {
    const stations = normalizeStations([
      { stationuuid: "community-one", name: "Community Radio", countrycode: "GB", url_resolved: "https://one.cdn.co.uk/community-mp3", codec: "MP3", lastcheckok: 1 },
      { stationuuid: "community-two", name: "Community Radio", countrycode: "GB", url_resolved: "https://two.cdn.co.uk/community-aac", codec: "AAC", lastcheckok: 1 },
    ]);

    expect(stations).toHaveLength(2);
  });

  it("does not expose internal grouping evidence on normalized stations", () => {
    const station = normalizeStations([
      { stationuuid: "public-shape", name: "Public Radio", countrycode: "GB", homepage: "https://public.example/", url_resolved: "https://streams.example/public.mp3", codec: "MP3", lastcheckok: 1 },
    ])[0];

    expect(station).not.toHaveProperty("canonicalName");
    expect(station).not.toHaveProperty("homepageHost");
    expect(station).not.toHaveProperty("streamHost");
    expect(station).not.toHaveProperty("source");
  });

  it("cleans directory placeholder regions", () => {
    expect(normalizeStations([
      { stationuuid: "placeholder-region", name: "Local Radio", countrycode: "SE", state: "Select One", url_resolved: "https://example.se/live.mp3", lastcheckok: 1 },
    ])[0]?.region).toBe("");
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
