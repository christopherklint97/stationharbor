import { z } from "zod";

export const INITIAL_COUNTRY_CODES = ["SE", "DK", "GB", "US"] as const;
type InitialCountryCode = (typeof INITIAL_COUNTRY_CODES)[number];

const rawStationSchema = z.object({
  stationuuid: z.string().trim().min(1),
  name: z.string().default(""),
  countrycode: z.string().default(""),
  state: z.string().optional().default(""),
  tags: z.string().optional().default(""),
  language: z.string().optional().default(""),
  codec: z.string().optional().default(""),
  bitrate: z.number().optional().default(0),
  url_resolved: z.string().optional().default(""),
  favicon: z.string().optional().default(""),
  homepage: z.string().optional().default(""),
  lastcheckok: z.number().optional().default(0),
  clickcount: z.number().optional().default(0),
  votes: z.number().optional().default(0),
  clicktrend: z.number().optional().default(0),
  hls: z.number().optional().default(0),
  lastchecktime_iso8601: z.string().optional().default(""),
  lastchangetime_iso8601: z.string().optional().default(""),
  geo_lat: z.number().optional().nullable().default(null),
  geo_long: z.number().optional().nullable().default(null),
});

export type Station = {
  id: string;
  name: string;
  countryCode: InitialCountryCode;
  region: string;
  tags: string[];
  language: string;
  codec: string;
  bitrate: number;
  streamUrl: string;
  favicon: string | null;
  homepage: string | null;
  isVerified: boolean;
  isPlayable: boolean;
  availabilityReason: string | null;
  clickCount: number;
  votes: number;
  clickTrend: number;
  hasHls: boolean;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  coordinates: { latitude: number; longitude: number } | null;
};

function safeStreamUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function optionalHttpsUrl(value: string): string | null {
  return safeHttpsUrl(value);
}

function canonicalTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

export function normalizeStations(rawStations: unknown[]): Station[] {
  const seen = new Set<string>();
  const stations: Station[] = [];

  for (const rawStation of rawStations) {
    const parsed = rawStationSchema.safeParse(rawStation);
    if (!parsed.success) continue;

    const raw = parsed.data;
    const countryCode = raw.countrycode.trim().toUpperCase();
    const streamUrl = safeStreamUrl(raw.url_resolved);
    if (!INITIAL_COUNTRY_CODES.includes(countryCode as InitialCountryCode) || !streamUrl || seen.has(raw.stationuuid)) continue;

    seen.add(raw.stationuuid);
    stations.push({
      id: raw.stationuuid,
      name: raw.name.trim() || "Unnamed station",
      countryCode: countryCode as InitialCountryCode,
      region: raw.state.trim(),
      tags: canonicalTags(raw.tags),
      language: raw.language.trim(),
      codec: raw.codec.trim().toUpperCase(),
      bitrate: Math.max(0, raw.bitrate),
      streamUrl,
      favicon: optionalHttpsUrl(raw.favicon),
      homepage: optionalHttpsUrl(raw.homepage),
      isVerified: Boolean(raw.lastcheckok),
      isPlayable: streamUrl.startsWith("https:") && Boolean(raw.lastcheckok),
      availabilityReason: !raw.lastcheckok ? "Stream has failed recent health checks" : streamUrl.startsWith("http:") ? "HTTP stream blocked by secure web app" : null,
      clickCount: Math.max(0, raw.clickcount),
      votes: Math.max(0, raw.votes),
      clickTrend: raw.clicktrend,
      hasHls: raw.hls === 1,
      lastCheckedAt: raw.lastchecktime_iso8601 || null,
      lastChangedAt: raw.lastchangetime_iso8601 || null,
      coordinates: raw.geo_lat !== null && raw.geo_long !== null ? { latitude: raw.geo_lat, longitude: raw.geo_long } : null,
    });
  }

  return stations.sort((a, b) => Number(b.isPlayable) - Number(a.isPlayable) || b.clickCount - a.clickCount || b.votes - a.votes || a.name.localeCompare(b.name));
}
