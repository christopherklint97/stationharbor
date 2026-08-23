import { INITIAL_COUNTRY_CODES } from "@/lib/stations";

export function parseStationQuery(params: URLSearchParams) {
  const requestedCountry = params.get("country")?.toUpperCase() ?? "SE";
  const country = INITIAL_COUNTRY_CODES.includes(requestedCountry as (typeof INITIAL_COUNTRY_CODES)[number])
    ? requestedCountry as (typeof INITIAL_COUNTRY_CODES)[number]
    : "SE";
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  return { country, query };
}
