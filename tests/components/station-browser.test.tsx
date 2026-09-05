import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationBrowser } from "@/components/station-browser";

const station = {
  id: "se-1", name: "Sveriges Radio P1", countryCode: "SE" as const, region: "Stockholm",
  tags: ["news", "public radio", "talk"], categories: ["news-talk" as const], language: "Swedish", codec: "MP3", bitrate: 128,
  streamUrl: "https://radio.example.se/live.mp3",
  sources: [{ id: "se-1", streamUrl: "https://radio.example.se/live.mp3", codec: "MP3", bitrate: 128, hasHls: false, isVerified: true, isDirect: true, availabilityReason: null }],
  sourceCount: 1, favicon: null, homepage: "https://radio.example.se",
  isVerified: true, isPlayable: true, availabilityReason: null, clickCount: 3, votes: 1, clickTrend: 0, hasHls: false,
  lastCheckedAt: null, lastChangedAt: null, coordinates: null,
};

function mockStations(stations: unknown[] = [station]) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stations })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  document.body.style.overflow = "";
  Reflect.deleteProperty(navigator, "mediaSession");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StationBrowser", () => {
  it("loads all supported countries by default and renders clear location controls", async () => {
    const fetchMock = mockStations();
    render(<StationBrowser />);

    expect(await screen.findByText("Sveriges Radio P1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All countries" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("4 countries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play Sveriges Radio P1" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/stations", expect.any(Object)));
  });

  it("debounces free-text directory searches before upstream fan-out", async () => {
    const fetchMock = mockStations();
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stations" }), { target: { value: "Dallas" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(349));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls.at(-1)?.[0] as string, "https://stationharbor.test").searchParams.get("q")).toBe("Dallas");
  });

  it("does not leave loading active when a pending search normalizes to the current query", async () => {
    const fetchMock = mockStations();
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");
    vi.useFakeTimers();
    const search = screen.getByRole("searchbox", { name: "Search stations" });

    fireEvent.change(search, { target: { value: "Dallas" } });
    fireEvent.change(search, { target: { value: "" } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "   " } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("supports multiple countries and a US state drill-down", async () => {
    const fetchMock = mockStations();
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");

    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    const stateSelect = await screen.findByRole("combobox", { name: "US state" });
    fireEvent.change(stateSelect, { target: { value: "California" } });
    fireEvent.click(screen.getByRole("button", { name: "Denmark" }));

    await waitFor(() => {
      const url = new URL(fetchMock.mock.calls.at(-1)?.[0] as string, "https://stationharbor.test");
      expect(url.searchParams.get("countries")).toBe("US,DK");
      expect(url.searchParams.get("state")).toBe("California");
    });
    expect(screen.getByRole("button", { name: "United States" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Denmark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("United States · California")).toBeInTheDocument();
  });

  it("restores All countries when the final country chip is removed", async () => {
    const fetchMock = mockStations();
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");

    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove United States filter" }));

    expect(screen.getByRole("button", { name: "All countries" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("combobox", { name: "US state" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/stations", expect.any(Object)));
  });

  it("keeps the US state control visible when all four countries are individually selected", async () => {
    mockStations();
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");

    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    fireEvent.change(screen.getByRole("combobox", { name: "US state" }), { target: { value: "California" } });
    fireEvent.click(screen.getByRole("button", { name: "Sweden" }));
    fireEvent.click(screen.getByRole("button", { name: "Denmark" }));
    fireEvent.click(screen.getByRole("button", { name: "United Kingdom" }));

    expect(screen.getByRole("button", { name: "All countries" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "US state" })).toHaveValue("California");
    fireEvent.click(screen.getByRole("button", { name: "Remove Denmark filter" }));
    expect(screen.getByRole("button", { name: "Denmark" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "US state" })).toHaveValue("California");
  });

  it("presents listener-facing categories with News & Talk combined", async () => {
    const fetchMock = mockStations();
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");

    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "news-talk" } });

    await waitFor(() => {
      const url = new URL(fetchMock.mock.calls.at(-1)?.[0] as string, "https://stationharbor.test");
      expect(url.searchParams.get("category")).toBe("news-talk");
    });
    expect(screen.getByRole("button", { name: "Remove News & Talk filter" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Talk radio" })).not.toBeInTheDocument();
  });

  it("puts the selected category first on mixed-format station cards", async () => {
    const sportsStation = {
      ...station,
      id: "sports-1",
      name: "105.3 The Fan",
      tags: ["sports talk", "nfl", "news"],
      categories: ["news-talk" as const, "sports" as const],
    };
    mockStations([sportsStation]);
    render(<StationBrowser />);
    await screen.findByText("105.3 The Fan");

    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "sports" } });
    await waitFor(() => expect(document.querySelector(".category-badges > span")?.textContent).toBe("Sports"));
  });

  it("opens a useful station profile without starting audio", async () => {
    mockStations();
    render(<StationBrowser />);
    fireEvent.click(await screen.findByRole("button", { name: "Details for Sveriges Radio P1" }));

    expect(screen.getByRole("dialog", { name: "Station details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Known for" })).toBeInTheDocument();
    expect(screen.getByText("News & Talk from Stockholm.")).toBeInTheDocument();
    expect(screen.getByText("Audio format")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visit station website" })).toHaveAttribute("href", "https://radio.example.se");
  });

  it("enriches a station profile from broadcaster website metadata when available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve(new Response(JSON.stringify(
      input.startsWith("/api/station-profile")
        ? { profile: { siteName: "Sveriges Radio", description: "Independent news, culture, documentaries and live current-affairs programmes.", homepage: "https://radio.example.se/" } }
        : { stations: [station] },
    )))));
    render(<StationBrowser />);
    fireEvent.click(await screen.findByRole("button", { name: "Details for Sveriges Radio P1" }));

    expect(await screen.findByText("Independent news, culture, documentaries and live current-affairs programmes.")).toBeInTheDocument();
    expect(screen.getByText("From Sveriges Radio website")).toBeInTheDocument();
  });

  it("visibly marks a favorite station after toggle", async () => {
    mockStations();
    render(<StationBrowser />);
    const favorite = await screen.findByRole("button", { name: "Add Sveriges Radio P1 to favorites" });
    fireEvent.click(favorite);
    expect(screen.getByRole("button", { name: "Remove Sveriges Radio P1 from favorites" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts native audio and locks background scrolling while Now Playing is full screen", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mockStations();
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    expect(play).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Now playing" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Minimize now playing" }));
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Open now playing for Sveriges Radio P1" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Pause mini player" })).toBeInTheDocument();
  });

  it("shows pause controls and playing marker after audio begins", async () => {
    mockStations();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));

    const pauseButtons = await screen.findAllByRole("button", { name: "Pause Sveriges Radio P1" });
    expect(pauseButtons).toHaveLength(2);
    expect(screen.getByText("Playing live")).toBeInTheDocument();
    expect(document.querySelector(".station-card")).toHaveAttribute("data-playing", "true");
  });

  it("uses an explicit connecting state while a live stream buffers", async () => {
    mockStations();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    await screen.findAllByRole("button", { name: "Pause Sveriges Radio P1" });
    fireEvent.waiting(document.querySelector("audio")!);

    expect(screen.getByRole("button", { name: "Connecting to Sveriges Radio P1" })).toContainElement(document.querySelector(".buffer-spinner"));
    expect(screen.getByText("Connecting to live audio…")).toBeInTheDocument();
  });

  it("routes Media Session pause and resume through guarded playback attempts", async () => {
    const handlers: Record<string, (() => void) | null> = {};
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { metadata: null, setActionHandler: (name: string, handler: (() => void) | null) => { handlers[name] = handler; } },
    });
    vi.stubGlobal("MediaMetadata", class { constructor(value: unknown) { void value; } });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    mockStations();
    render(<StationBrowser />);
    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    await screen.findAllByRole("button", { name: "Pause Sveriges Radio P1" });

    await act(async () => { handlers.pause?.(); await Promise.resolve(); });
    expect(screen.getAllByRole("button", { name: "Resume Sveriges Radio P1" })).toHaveLength(2);
    await act(async () => { handlers.play?.(); await Promise.resolve(); });

    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button", { name: "Pause Sveriges Radio P1" })).toHaveLength(2);
  });

  it("does not double-advance sources when play rejects and an error event follows", async () => {
    let resolveAlternate!: () => void;
    const alternatePlay = new Promise<void>((resolve) => { resolveAlternate = resolve; });
    const rejectedStation = {
      ...station,
      sources: [
        station.sources[0],
        { ...station.sources[0], id: "se-2", streamUrl: "https://radio.example.se/alternate.aac", codec: "AAC" },
      ],
      sourceCount: 2,
    };
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("unsupported", "NotSupportedError"))
      .mockImplementationOnce(() => alternatePlay);
    mockStations([rejectedStation]);
    render(<StationBrowser />);
    await screen.findByText("Sveriges Radio P1");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Play Sveriges Radio P1" }));
    await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); });
    expect(play).toHaveBeenCalledTimes(2);
    expect(document.querySelector("audio")?.src).toBe("https://radio.example.se/alternate.aac");

    fireEvent.error(document.querySelector("audio")!);
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(play).toHaveBeenCalledTimes(2);
    await act(async () => { resolveAlternate(); await Promise.resolve(); });
  });

  it("ignores a late playback rejection after switching stations", async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const firstPlay = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementationOnce(() => firstPlay)
      .mockResolvedValue();
    const stationA = {
      ...station,
      sources: [
        station.sources[0],
        { ...station.sources[0], id: "se-a2", streamUrl: "https://radio.example.se/a-alternate.aac", codec: "AAC" },
      ],
      sourceCount: 2,
    };
    const stationB = {
      ...station,
      id: "se-b",
      name: "Sveriges Radio P2",
      streamUrl: "https://radio.example.se/p2.mp3",
      sources: [{ ...station.sources[0], id: "se-b", streamUrl: "https://radio.example.se/p2.mp3" }],
    };
    mockStations([stationA, stationB]);
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    fireEvent.click(screen.getByRole("button", { name: "Play Sveriges Radio P2" }));
    await act(async () => { rejectFirst(new Error("late failure")); await Promise.resolve(); });

    expect(play).toHaveBeenCalledTimes(2);
    expect(document.querySelector("audio")?.src).toBe("https://radio.example.se/p2.mp3");
    expect(screen.getByRole("heading", { name: "Sveriges Radio P2" })).toBeInTheDocument();
  });

  it("does not restart a pending retry after the listener pauses", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mockStations();
    render(<StationBrowser />);
    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    await screen.findAllByRole("button", { name: "Pause Sveriges Radio P1" });
    vi.useFakeTimers();

    fireEvent.error(document.querySelector("audio")!);
    fireEvent.click(screen.getByRole("button", { name: "Connecting to Sveriges Radio P1" }));
    await act(() => vi.advanceTimersByTimeAsync(1_500));

    expect(play).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button", { name: "Resume Sveriges Radio P1" })).toHaveLength(2);
  });

  it("stops after one bounded retry across all alternate streams", async () => {
    const failoverStation = {
      ...station,
      sources: [
        station.sources[0],
        { ...station.sources[0], id: "se-2", streamUrl: "https://radio.example.se/alternate.aac", codec: "AAC" },
      ],
      sourceCount: 2,
    };
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mockStations([failoverStation]);
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    await screen.findAllByRole("button", { name: "Pause Sveriges Radio P1" });
    vi.useFakeTimers();
    const audio = document.querySelector("audio")!;

    fireEvent.error(audio);
    fireEvent.play(audio);
    fireEvent.error(audio);
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    fireEvent.play(audio);
    fireEvent.error(audio);
    fireEvent.play(audio);
    fireEvent.error(audio);

    expect(screen.getByRole("alert")).toHaveTextContent("Sveriges Radio P1 stopped. Try again or choose another station.");
    expect(play).toHaveBeenCalledTimes(4);
  });

  it("changes player controls to resume when native audio pauses", async () => {
    mockStations();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<StationBrowser />);

    fireEvent.click(await screen.findByRole("button", { name: "Play Sveriges Radio P1" }));
    fireEvent.pause(document.querySelector("audio")!);

    expect(screen.getAllByRole("button", { name: "Resume Sveriges Radio P1" })).toHaveLength(2);
  });
});
