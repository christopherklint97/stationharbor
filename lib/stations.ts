import * as z from "zod";
import { getStationCategories } from "@/lib/station-taxonomy";
import type { CategoryId } from "@/lib/station-query";

export const INITIAL_COUNTRY_CODES = ["SE", "DK", "GB", "US"] as const;
export type SupportedCountryCode = (typeof INITIAL_COUNTRY_CODES)[number];

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

export type StationSource = {
  id: string;
  streamUrl: string;
  codec: string;
  bitrate: number;
  hasHls: boolean;
  isVerified: boolean;
  isDirect: boolean;
  availabilityReason: string | null;
};

export type Station = {
  id: string;
  name: string;
  countryCode: SupportedCountryCode;
  region: string;
  tags: string[];
  categories: Exclude<CategoryId, "all">[];
  language: string;
  codec: string;
  bitrate: number;
  streamUrl: string;
  sources: StationSource[];
  sourceCount: number;
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

type Candidate = Omit<Station, "categories" | "sources" | "sourceCount"> & {
  source: StationSource;
  canonicalName: string;
  publisherHomepage: string;
  streamVariantKey: string;
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

function canonicalTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

function cleanStationName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\s*(?:\([a-z]{2,4}\)\s*)?\d+\s*k(?:bps)?\s*(?:mp3|aac\+?|flac|ogg|hls)\s*$/i, "")
    .replace(/\s*[([]\s*(?:mp3|aac\+?|flac|ogg|hls|\d+\s*kbps)\s*[)\]]\s*$/i, "")
    .replace(/\s+-\s+(?=[a-z]*\d)/i, " ")
    .replace(/\s+/g, " ");
  return cleaned || "Unnamed station";
}

function canonicalName(value: string): string {
  return cleanStationName(value)
    .toLocaleLowerCase("en")
    .replace(/\s+-\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function cleanRegion(value: string): string {
  const region = value.trim().replace(/\s+/g, " ");
  return /^(select one|n\/?a|none|unknown|-|undefined)$/i.test(region) ? "" : region;
}

function normalizedPublisherHomepage(value: string | null): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return "";
  }
}

function stripCodecVariantSuffix(value: string): string {
  return value
    .replace(/\.(?:m3u8?|pls)$/i, "")
    .replace(/[-_.]?(?:aacp|aacplus|aac\+?|mp3|ogg|flac|opus)(?:[-_.]?\d{2,3})?$/i, "")
    .replace(/[-_.]+$/, "");
}

function streamVariantKey(value: string): string {
  try {
    const url = new URL(value);
    const publisherHost = url.hostname.toLowerCase();
    const path = stripCodecVariantSuffix(decodeURIComponent(url.pathname).toLowerCase());
    const queryIdentity = [...url.searchParams.entries()]
      .filter(([key]) => !["ua", "user-agent"].includes(key.toLowerCase()))
      .map(([key, parameter]) => `${key.toLowerCase()}=${stripCodecVariantSuffix(parameter.toLowerCase())}`)
      .sort()
      .join("&");
    const basename = path.split("/").filter(Boolean).at(-1) ?? "";
    if (!queryIdentity && ["", "live", "listen", "stream", "icecast", "icecast.audio"].includes(basename)) return "";
    return `${publisherHost}:${url.port || "default"}:${path}${queryIdentity ? `?${queryIdentity}` : ""}`;
  } catch {
    return "";
  }
}

function preferredStreamUrl(name: string, streamUrl: string): string {
  if (name.trim().toLowerCase() === "npr 24 hour program stream" && /^http:\/\/npr-ice\.streamguys1\.com\/live\.(aac|mp3)$/i.test(streamUrl)) {
    return "https://npr-ice.streamguys1.com/live.mp3";
  }
  return streamUrl;
}

function sourceScore(source: StationSource): number {
  const codec = source.codec.toUpperCase();
  const codecScore = codec === "MP3" ? 220 : codec === "AAC" || codec === "AAC+" ? 180 : codec === "OGG" ? 100 : codec === "FLAC" ? 60 : 20;
  const videoPenalty = /H\.26|VIDEO/.test(codec) ? -300 : 0;
  const bitrateScore = Math.min(100, Math.max(0, source.bitrate)) / 4;
  return Number(source.isVerified) * 1000 + Number(source.isDirect) * 500 + codecScore + bitrateScore + videoPenalty;
}

function candidateFrom(rawValue: unknown): Candidate | null {
  const parsed = rawStationSchema.safeParse(rawValue);
  if (!parsed.success) return null;
  const raw = parsed.data;
  const countryCode = raw.countrycode.trim().toUpperCase();
  if (!INITIAL_COUNTRY_CODES.includes(countryCode as SupportedCountryCode)) return null;

  const name = cleanStationName(raw.name);
  const rawStreamUrl = safeStreamUrl(raw.url_resolved);
  if (!rawStreamUrl) return null;
  const streamUrl = preferredStreamUrl(name, rawStreamUrl);
  const isVerified = Boolean(raw.lastcheckok);
  const isDirect = streamUrl.startsWith("https:");
  const availabilityReason = !isVerified
    ? "Stream has failed recent health checks"
    : !isDirect
      ? "HTTP stream blocked by secure web app"
      : null;
  const codec = raw.codec.trim().toUpperCase();
  const source: StationSource = {
    id: raw.stationuuid,
    streamUrl,
    codec,
    bitrate: Math.max(0, raw.bitrate),
    hasHls: raw.hls === 1,
    isVerified,
    isDirect,
    availabilityReason,
  };
  const homepage = safeHttpsUrl(raw.homepage);

  return {
    id: raw.stationuuid,
    name,
    canonicalName: canonicalName(name),
    publisherHomepage: normalizedPublisherHomepage(homepage),
    streamVariantKey: streamVariantKey(streamUrl),
    countryCode: countryCode as SupportedCountryCode,
    region: cleanRegion(raw.state),
    tags: canonicalTags(raw.tags),
    language: raw.language.trim(),
    codec,
    bitrate: source.bitrate,
    streamUrl,
    source,
    favicon: safeHttpsUrl(raw.favicon),
    homepage,
    isVerified,
    isPlayable: isDirect && isVerified,
    availabilityReason,
    clickCount: Math.max(0, raw.clickcount),
    votes: Math.max(0, raw.votes),
    clickTrend: raw.clicktrend,
    hasHls: source.hasHls,
    lastCheckedAt: raw.lastchecktime_iso8601 || null,
    lastChangedAt: raw.lastchangetime_iso8601 || null,
    coordinates: raw.geo_lat !== null && raw.geo_long !== null ? { latitude: raw.geo_lat, longitude: raw.geo_long } : null,
  };
}

function canGroup(candidate: Candidate, group: Candidate[]): boolean {
  const first = group[0];
  if (!first || first.countryCode !== candidate.countryCode || first.canonicalName !== candidate.canonicalName) return false;
  if (group.some((item) => item.source.streamUrl === candidate.source.streamUrl)) return true;
  if (candidate.publisherHomepage && group.some((item) => item.publisherHomepage === candidate.publisherHomepage)) return true;
  return Boolean(candidate.streamVariantKey && group.some((item) => item.streamVariantKey === candidate.streamVariantKey));
}

function mergeGroup(group: Candidate[]): Station {
  const sourceMap = new Map<string, StationSource>();
  for (const candidate of group) {
    const current = sourceMap.get(candidate.source.streamUrl);
    if (!current || sourceScore(candidate.source) > sourceScore(current)) sourceMap.set(candidate.source.streamUrl, candidate.source);
  }
  const sources = [...sourceMap.values()].sort((a, b) => sourceScore(b) - sourceScore(a));
  const primarySource = sources[0]!;
  const primaryCandidate = group.find((candidate) => candidate.source.id === primarySource.id) ?? group[0]!;
  const tags = [...new Set(group.flatMap((candidate) => candidate.tags))].sort();
  const bestName = [...group].sort((a, b) => a.name.length - b.name.length || b.clickCount - a.clickCount)[0]!.name;
  const region = group.find((candidate) => candidate.region)?.region ?? "";
  const homepage = group.find((candidate) => candidate.homepage)?.homepage ?? null;
  const favicon = group.find((candidate) => candidate.favicon)?.favicon ?? null;

  return {
    id: primarySource.id,
    name: bestName,
    countryCode: primaryCandidate.countryCode,
    region,
    tags,
    categories: getStationCategories(tags),
    language: group.find((candidate) => candidate.language)?.language ?? "",
    codec: primarySource.codec,
    bitrate: primarySource.bitrate,
    streamUrl: primarySource.streamUrl,
    sources,
    sourceCount: sources.length,
    homepage,
    favicon,
    isVerified: primarySource.isVerified,
    isPlayable: primarySource.isDirect && primarySource.isVerified,
    availabilityReason: primarySource.availabilityReason,
    clickCount: Math.max(...group.map((candidate) => candidate.clickCount)),
    votes: Math.max(...group.map((candidate) => candidate.votes)),
    clickTrend: Math.max(...group.map((candidate) => candidate.clickTrend)),
    hasHls: primarySource.hasHls,
    lastCheckedAt: group.map((candidate) => candidate.lastCheckedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    lastChangedAt: group.map((candidate) => candidate.lastChangedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    coordinates: primaryCandidate.coordinates,
  };
}

export function normalizeStations(rawStations: unknown[]): Station[] {
  const seenIds = new Set<string>();
  const groups: Candidate[][] = [];

  for (const rawStation of rawStations) {
    const candidate = candidateFrom(rawStation);
    if (!candidate || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    const group = groups.find((existing) => canGroup(candidate, existing));
    if (group) group.push(candidate);
    else groups.push([candidate]);
  }

  return groups
    .map(mergeGroup)
    .sort((a, b) => Number(b.isPlayable) - Number(a.isPlayable) || b.clickCount - a.clickCount || b.votes - a.votes || a.name.localeCompare(b.name));
}
