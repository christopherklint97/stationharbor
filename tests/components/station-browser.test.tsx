import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StationBrowser } from "@/components/station-browser";

const station = {
  id: "se-1", name: "Sveriges Radio P1", countryCode: "SE", region: "Stockholm",
  tags: ["news"], language: "Swedish", codec: "MP3", bitrate: 128,
  streamUrl: "https://radio.example.se/live.mp3", favicon: null, homepage: null,
  isVerified: true, clickCount: 3, votes: 1, clickTrend: 0, hasHls: false,
  lastCheckedAt: null, lastChangedAt: null, coordinates: null,
};

describe("StationBrowser", () => {
  it("loads stations for selected country and renders a playable card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    render(<StationBrowser />);

    expect(await screen.findByText("Sveriges Radio P1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Sveriges Radio P1" })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/stations?country=SE", expect.any(Object)));
  });

  it("starts native audio after user presses a station play button", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    expect(play).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Now playing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Sveriges Radio P1" })).toBeInTheDocument();
  });
});
