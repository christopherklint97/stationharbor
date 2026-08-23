import { describe, expect, it } from "vitest";
import { toggleFavorite } from "@/lib/favorites";

describe("toggleFavorite", () => {
  it("adds a station once and removes it on second toggle", () => {
    const station = { id: "se-1", name: "Sveriges Radio P1" };
    const added = toggleFavorite([], station);
    expect(added).toEqual([station]);
    expect(toggleFavorite(added, station)).toEqual([]);
  });
});
