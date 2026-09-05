import { describe, expect, it } from "vitest";
import { categoryLabels, categoryTagQueries, formatStationLocation, getStationCategories, stationKnownFor } from "@/lib/station-taxonomy";

describe("station taxonomy", () => {
  it("combines news, talk, speech, and public radio into News & Talk", () => {
    expect(getStationCategories(["news", "talk radio", "public radio", "speech"])).toEqual(["news-talk"]);
    expect(categoryLabels["news-talk"]).toBe("News & Talk");
  });

  it("maps noisy directory tags into a small listener-facing taxonomy", () => {
    expect(getStationCategories(["nfl", "sports talk", "rock", "alternative rock", "80s", "oldies"])).toEqual([
      "news-talk",
      "sports",
      "rock",
      "decades",
    ]);
  });

  it("keeps category aliases complete without excessive upstream fan-out", () => {
    expect(categoryTagQueries["news-talk"]).toEqual(["news", "talk", "speech"]);
    expect(categoryTagQueries.sports).toEqual(["sport", "football", "nfl"]);
    expect(categoryTagQueries.rock).toEqual(["rock", "metal", "punk"]);
    expect(categoryTagQueries.electronic).toEqual(["electronic", "dance", "techno"]);
    expect(categoryTagQueries["country-folk"]).toEqual(["country", "folk"]);
    expect(Math.max(...Object.values(categoryTagQueries).map((aliases) => aliases.length))).toBeLessThanOrEqual(6);
  });

  it("does not confuse classical rock with classical music", () => {
    expect(getStationCategories(["classic rock"])).toEqual(["rock"]);
  });

  it("formats US city and state abbreviations for display", () => {
    expect(formatStationLocation({ region: "Los Angeles CA", countryCode: "US" })).toBe("Los Angeles, CA");
    expect(formatStationLocation({ region: "California", countryCode: "US" })).toBe("California");
  });

  it("creates an honest known-for summary from directory metadata", () => {
    expect(stationKnownFor({ name: "KQED", region: "California", countryCode: "US", tags: ["public radio", "news", "culture"] })).toBe(
      "News & Talk and Culture & Community from California.",
    );
    expect(stationKnownFor({ name: "Plain FM", region: "", countryCode: "DK", tags: [] })).toBe("Live radio from Denmark. No programme description is supplied by the directory.");
  });
});
