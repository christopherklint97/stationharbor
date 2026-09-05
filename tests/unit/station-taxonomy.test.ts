import { describe, expect, it } from "vitest";
import { categoryLabels, formatStationLocation, getStationCategories, stationKnownFor } from "@/lib/station-taxonomy";

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
