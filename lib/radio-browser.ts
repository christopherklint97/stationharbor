import { INITIAL_COUNTRY_CODES, normalizeStations, type Station } from "@/lib/stations";

type StationQuery = {
  country: (typeof INITIAL_COUNTRY_CODES)[number];
  query?: string;
};

const API_ROOT = "https://de1.api.radio-browser.info/json/stations/search";

export async function fetchStations({ country, query = "" }: StationQuery): Promise<Station[]> {
  const params = new URLSearchParams({
    countrycode: country,
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
    limit: "500",
  });
  const trimmedQuery = query.trim();
  if (trimmedQuery) params.set("name", trimmedQuery);

  const response = await fetch(`${API_ROOT}?${params.toString()}`, {
    headers: { "User-Agent": "StationHarbor/0.1 (+https://github.com/christopherklint97/stationharbor)" },
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Radio directory unavailable (${response.status})`);

  const body: unknown = await response.json();
  return normalizeStations(Array.isArray(body) ? body : []);
}
