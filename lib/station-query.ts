import { INITIAL_COUNTRY_CODES, type SupportedCountryCode } from "@/lib/stations";

export const CATEGORY_IDS = [
  "all",
  "news-talk",
  "sports",
  "pop",
  "rock",
  "electronic",
  "hip-hop-rnb",
  "jazz-blues",
  "classical",
  "country-folk",
  "decades",
  "culture-community",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas",
  "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
] as const;

export function parseStationQuery(params: URLSearchParams) {
  const requestedCountries = (params.get("countries") ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is SupportedCountryCode => INITIAL_COUNTRY_CODES.includes(value as SupportedCountryCode));
  const countries = [...new Set(requestedCountries)];
  const selectedCountries = countries.length ? countries : [...INITIAL_COUNTRY_CODES];
  const query = (params.get("q") ?? "").trim().slice(0, 80);
  const requestedState = (params.get("state") ?? "").trim();
  const state = selectedCountries.includes("US") && US_STATES.includes(requestedState as (typeof US_STATES)[number])
    ? requestedState
    : "";
  const requestedCategory = params.get("category") ?? "all";
  const category = CATEGORY_IDS.includes(requestedCategory as CategoryId)
    ? requestedCategory as CategoryId
    : "all";

  return { countries: selectedCountries, query, state, category };
}
