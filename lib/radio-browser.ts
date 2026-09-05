import { categoryTagQueries } from "@/lib/station-taxonomy";
import type { CategoryId } from "@/lib/station-query";
import { normalizeStations, type Station, type SupportedCountryCode } from "@/lib/stations";

type StationQuery = {
  countries: SupportedCountryCode[];
  query?: string;
  state?: string;
  category?: CategoryId;
};

const API_ROOT = "https://de1.api.radio-browser.info/json/stations/search";

function requestUrls({ countries, query = "", state = "", category = "all" }: StationQuery): string[] {
  const tags = category === "all" ? [""] : categoryTagQueries[category];
  return countries.flatMap((country) => tags.map((tag) => {
    const params = new URLSearchParams({
      countrycode: country,
      hidebroken: "true",
      order: "clickcount",
      reverse: "true",
      limit: "500",
    });
    const trimmedQuery = query.trim();
    if (trimmedQuery) params.set("name", trimmedQuery);
    if (tag) params.set("tag", tag);
    if (country === "US" && state) params.set("state", state);
    return `${API_ROOT}?${params.toString()}`;
  }));
}

async function fetchDirectoryPage(url: string): Promise<unknown[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "StationHarbor/0.1 (+https://github.com/christopherklint97/stationharbor)" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Radio directory unavailable (${response.status})`);
  const body: unknown = await response.json();
  return Array.isArray(body) ? body : [];
}

export async function fetchStations(query: StationQuery): Promise<Station[]> {
  const results = await Promise.allSettled(requestUrls(query).map(fetchDirectoryPage));
  const successful = results.filter((result): result is PromiseFulfilledResult<unknown[]> => result.status === "fulfilled");
  if (!successful.length) throw new Error("Radio directory unavailable");
  return normalizeStations(successful.flatMap((result) => result.value));
}
