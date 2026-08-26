import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StationBrowser } from "@/components/station-browser";

const station = {
  id: "se-1", name: "Sveriges Radio P1", countryCode: "SE", region: "Stockholm",
  tags: ["news"], language: "Swedish", codec: "MP3", bitrate: 128,
  streamUrl: "https://radio.example.se/live.mp3", favicon: null, homepage: null,
  isVerified: true, isPlayable: true, availabilityReason: null, clickCount: 3, votes: 1, clickTrend: 0, hasHls: false,
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

  it("opens station details without starting audio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    render(<StationBrowser />);
    fireEvent.click(await screen.findByRole("button", { name: "Details Sveriges Radio P1" }));
    expect(screen.getByRole("dialog", { name: "Station details" })).toBeInTheDocument();
    expect(screen.getByText(/128/)).toBeInTheDocument();
  });

  it("visibly marks a favorite station after toggle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    render(<StationBrowser />);
    const favorite = await screen.findByRole("button", { name: "Add Sveriges Radio P1 to favorites" });
    fireEvent.click(favorite);
    expect(screen.getByRole("button", { name: "Remove Sveriges Radio P1 from favorites" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts native audio after user presses a station play button", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    expect(play).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Now playing" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close now playing" }));
    expect(screen.getByRole("button", { name: "Open now playing" })).toBeInTheDocument();
  });

  it("shows pause control and playing marker after audio begins", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pause Sveriges Radio P1" })).toBeInTheDocument());
    expect(screen.getByText("Playing live")).toBeInTheDocument();
    expect(document.querySelector(".station-card")).toHaveAttribute("data-playing", "true");
  });

  it("changes main player control to resume when native audio pauses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations: [station] }))));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    fireEvent.pause(document.querySelector("audio")!);

    expect(screen.getByRole("button", { name: "Resume Sveriges Radio P1" })).toBeInTheDocument();
  });
});
