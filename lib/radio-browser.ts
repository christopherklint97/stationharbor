import { categoryTagQueries } from "@/lib/station-taxonomy";
import type { CategoryId } from "@/lib/station-query";
import { normalizeStations, type Station, type SupportedCountryCode } from "@/lib/stations";

type StationQuery = {
  countries: SupportedCountryCode[];
  query?: string;
  state?: string;
  category?: CategoryId;
};

type SearchDimension = { name?: string; state?: string; tag?: string };

const API_ROOT = "https://de1.api.radio-browser.info/json/stations/search";
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_REQUESTS_PER_SEARCH = 36;

function requestUrls({ countries, query = "", state = "", category = "all" }: StationQuery): string[] {
  const trimmedQuery = query.trim();
  const urls: string[] = [];

  for (const country of countries) {
    const dimensions: SearchDimension[] = [];
    if (category !== "all") dimensions.push(...categoryTagQueries[category].map((tag) => ({ tag })));
    if (trimmedQuery) {
      dimensions.push({ name: trimmedQuery }, { tag: trimmedQuery });
      if (!(country === "US" && state)) dimensions.push({ state: trimmedQuery });
      else dimensions.push({});
    }
    if (!dimensions.length) dimensions.push({});

    for (const dimension of dimensions) {
      const params = new URLSearchParams({
        countrycode: country,
        hidebroken: "true",
        order: "clickcount",
        reverse: "true",
        limit: dimensions.length > 1 ? "200" : "500",
      });
      if (dimension.name) params.set("name", dimension.name);
      if (dimension.tag) {
        params.set("tag", dimension.tag);
        params.set("tagExact", "false");
      }
      if (country === "US" && state) params.set("state", state);
      else if (dimension.state) params.set("state", dimension.state);
      urls.push(`${API_ROOT}?${params.toString()}`);
    }
  }

  return [...new Set(urls)];
}

async function fetchDirectoryPage(url: string): Promise<unknown[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "StationHarbor/0.1 (+https://github.com/christopherklint97/stationharbor)" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Radio directory unavailable (${response.status})`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Radio directory returned an invalid response");
  return body;
}

function matchesFreeText(station: Station, query: string): boolean {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("en");
  return [station.name, station.region, station.language, ...station.tags]
    .some((value) => value.toLocaleLowerCase("en").includes(needle));
}

export async function fetchStations(query: StationQuery): Promise<Station[]> {
  const urls = requestUrls(query);
  if (urls.length > MAX_REQUESTS_PER_SEARCH) throw new Error("Radio directory search is too broad");
  const rawStations: unknown[] = [];
  try {
    for (let offset = 0; offset < urls.length; offset += MAX_CONCURRENT_REQUESTS) {
      const pages = await Promise.all(urls.slice(offset, offset + MAX_CONCURRENT_REQUESTS).map(fetchDirectoryPage));
      rawStations.push(...pages.flat());
    }
  } catch {
    throw new Error("Radio directory partially unavailable");
  }
  const normalized = normalizeStations(rawStations);
  const category = query.category ?? "all";
  const freeText = query.query?.trim() ?? "";
  return normalized.filter((station) =>
    (category === "all" || station.categories.includes(category)) && matchesFreeText(station, freeText),
  );
}
