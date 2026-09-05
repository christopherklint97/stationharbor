import type { CategoryId } from "@/lib/station-query";
import type { SupportedCountryCode } from "@/lib/stations";

export const categoryLabels: Record<CategoryId, string> = {
  all: "All categories",
  "news-talk": "News & Talk",
  sports: "Sports",
  pop: "Pop",
  rock: "Rock & Alternative",
  electronic: "Electronic & Dance",
  "hip-hop-rnb": "Hip-Hop & R&B",
  "jazz-blues": "Jazz & Blues",
  classical: "Classical",
  "country-folk": "Country & Folk",
  decades: "Oldies & Decades",
  "culture-community": "Culture & Community",
};

export const categoryTagQueries: Record<Exclude<CategoryId, "all">, string[]> = {
  "news-talk": ["news", "talk", "speech"],
  sports: ["sport", "football", "nfl"],
  pop: ["pop", "top 40", "hits"],
  rock: ["rock", "metal", "punk"],
  electronic: ["electronic", "dance", "techno"],
  "hip-hop-rnb": ["hip hop", "hiphop", "rap", "r&b", "rnb", "soul"],
  "jazz-blues": ["jazz", "blues"],
  classical: ["classical", "opera", "baroque"],
  "country-folk": ["country", "folk"],
  decades: ["oldies", "60s", "70s", "80s", "90s", "00s"],
  "culture-community": ["culture", "community", "local radio", "college radio", "world", "education"],
};

export const countryLabels: Record<SupportedCountryCode, string> = {
  SE: "Sweden",
  DK: "Denmark",
  GB: "United Kingdom",
  US: "United States",
};

const taxonomy: Array<[Exclude<CategoryId, "all">, RegExp]> = [
  ["news-talk", /(^|\s)(news|talk|speech)(\s|$)/],
  ["sports", /(^|\s)(sport(?:s)?|football|nfl)(\s|$)/],
  ["pop", /(^|\s)(pop|top 40|hits)(\s|$)/],
  ["rock", /(^|\s)(rock|metal|punk)(\s|$)/],
  ["electronic", /(^|\s)(electronic|dance|techno)(\s|$)/],
  ["hip-hop-rnb", /(^|\s)(hip hop|hiphop|rap|r&b|rnb|soul)(\s|$)/],
  ["jazz-blues", /(^|\s)(jazz|blues)(\s|$)/],
  ["classical", /^(classical|classical music|opera|baroque)$/],
  ["country-folk", /(^|\s)(country|folk)(\s|$)/],
  ["decades", /(^|\s)(oldies|60s|70s|80s|90s|00s)(\s|$)/],
  ["culture-community", /(^|\s)(culture|community|local radio|college radio|world|education)(\s|$)/],
];

function normalizedTag(tag: string) {
  return tag.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function getStationCategories(tags: string[]): Exclude<CategoryId, "all">[] {
  const normalized = tags.map(normalizedTag);
  return taxonomy
    .filter(([, pattern]) => normalized.some((tag) => pattern.test(tag)))
    .map(([category]) => category);
}

function naturalList(items: string[]) {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function formatStationLocation(station: Pick<import("@/lib/stations").Station, "region" | "countryCode">): string {
  const location = station.region || countryLabels[station.countryCode];
  if (station.countryCode !== "US" || location.includes(",")) return location;
  return location.replace(/^(.+\S)\s+([A-Z]{2})$/, "$1, $2");
}

export function stationKnownFor(station: Pick<import("@/lib/stations").Station, "name" | "region" | "countryCode" | "tags">): string {
  const location = formatStationLocation(station);
  const categories = getStationCategories(station.tags).slice(0, 2).map((category) => categoryLabels[category]);
  if (!categories.length) return `Live radio from ${location}. No programme description is supplied by the directory.`;
  return `${naturalList(categories)} from ${location}.`;
}
