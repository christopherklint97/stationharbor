import { describe, expect, it } from "vitest";
import { parseStationQuery } from "@/lib/station-query";

describe("parseStationQuery", () => {
  it("defaults to every supported country", () => {
    expect(parseStationQuery(new URLSearchParams())).toEqual({
      countries: ["SE", "DK", "GB", "US"],
      query: "",
      state: "",
      category: "all",
    });
  });

  it("keeps unique supported countries and clamps user search input", () => {
    expect(parseStationQuery(new URLSearchParams({ countries: "US,GB,US,NO", q: ` ${"j".repeat(100)} ` }))).toEqual({
      countries: ["US", "GB"],
      query: "j".repeat(80),
      state: "",
      category: "all",
    });
  });

  it("accepts a US state only when United States is selected", () => {
    expect(parseStationQuery(new URLSearchParams({ countries: "US,DK", state: "California", category: "news-talk" }))).toEqual({
      countries: ["US", "DK"],
      query: "",
      state: "California",
      category: "news-talk",
    });
    expect(parseStationQuery(new URLSearchParams({ countries: "DK", state: "California" })).state).toBe("");
  });

  it("falls back to all countries and categories for invalid values", () => {
    expect(parseStationQuery(new URLSearchParams({ countries: "NO", state: "Atlantis", category: "anything" }))).toEqual({
      countries: ["SE", "DK", "GB", "US"],
      query: "",
      state: "",
      category: "all",
    });
  });
});
