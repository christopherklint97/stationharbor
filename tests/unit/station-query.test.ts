import { describe, expect, it } from "vitest";
import { parseStationQuery } from "@/lib/station-query";

describe("parseStationQuery", () => {
  it("uses requested supported country and clamps user search input", () => {
    expect(parseStationQuery(new URLSearchParams({ country: "GB", q: " jazz " }))).toEqual({
      country: "GB",
      query: "jazz",
    });
  });

  it("falls back to Sweden for invalid country values", () => {
    expect(parseStationQuery(new URLSearchParams({ country: "NO" }))).toEqual({ country: "SE", query: "" });
  });
});
