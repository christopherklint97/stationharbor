import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("StationHarbor home", () => {
  it("shows four initial countries and radio discovery controls", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Live radio, everywhere" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sweden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Denmark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "United Kingdom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search stations" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toBeInTheDocument();
  });
});
