"use client";

import { useEffect, useRef, useState } from "react";
import { toggleFavorite } from "@/lib/favorites";
import type { Station } from "@/lib/stations";

const countries = [
  ["SE", "Sweden"],
  ["DK", "Denmark"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
] as const;

type CountryCode = (typeof countries)[number][0];

export function StationBrowser() {
  const [country, setCountry] = useState<CountryCode>("SE");
  const [query, setQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [favorites, setFavorites] = useState<Station[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("stationharbor:favorites") ?? "[]") as Station[]; } catch { return []; }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const displayedStations = favoritesOnly ? stations.filter((station) => favorites.some((favorite) => favorite.id === station.id)) : stations;

  function favoriteStation(station: Station) {
    setFavorites((current) => {
      const next = toggleFavorite(current, station);
      localStorage.setItem("stationharbor:favorites", JSON.stringify(next));
      return next;
    });
  }

  function startSleepTimer(minutes: number) {
    const deadline = Date.now() + minutes * 60_000;
    setSleepDeadline(deadline);
    setSecondsLeft(minutes * 60);
  }

  async function playStation(station: Station) {
    const audio = audioRef.current;
    if (!audio) return;
    setSelectedStation(station);
    document.title = `${station.name} — StationHarbor`;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: `${station.countryCode} live radio`, album: station.tags.join(" · "), artwork: station.favicon ? [{ src: station.favicon }] : [] });
      navigator.mediaSession.setActionHandler("play", () => { void audio.play(); });
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    }
    audio.src = station.streamUrl;
    try {
      await audio.play();
    } catch {
      setError(`Could not play ${station.name}. Try another station.`);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ country });
    if (query.trim()) params.set("q", query.trim());

    fetch(`/api/stations?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Live station directory is temporarily unavailable.");
        return response.json() as Promise<{ stations: Station[] }>;
      })
      .then(({ stations: nextStations }) => setStations(nextStations))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Live station directory is temporarily unavailable.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });

    return () => controller.abort();
  }, [country, query]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    if (!sleepDeadline) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((sleepDeadline - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next === 0) { audioRef.current?.pause(); setSleepDeadline(null); }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sleepDeadline]);

  return (
    <section className="discovery" aria-label="Discover stations">
      <label className="search-label" htmlFor="station-search">Search stations</label>
      <input
        id="station-search"
        className="search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name, genre, city, language…"
      />
      <div className="country-list" aria-label="Country filter">
        {countries.map(([code, label]) => (
          <button
            aria-pressed={country === code}
            className="country-chip"
            key={code}
            onClick={() => setCountry(code)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="station-section" aria-live="polite">
        <div className="section-heading"><div><p className="eyebrow">START HERE</p><h2>{favoritesOnly ? "Favorites" : "Popular stations"}</h2></div><button className="quiet-button" onClick={() => setFavoritesOnly((current) => !current)} type="button">{favoritesOnly ? "All stations" : `Favorites (${favorites.length})`}</button></div>
        {isLoading && <div className="loading-card" role="status">Loading live stations…</div>}
        {error && <div className="loading-card" role="alert">{error}</div>}
        {!isLoading && !error && stations.length === 0 && <div className="loading-card">No verified HTTPS stations found.</div>}
        <div className="station-list">
          {displayedStations.map((station) => (
            <article className="station-card" key={station.id}>
              <div className="station-meta"><strong>{station.name}</strong><span>{[station.region, station.countryCode, station.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}</span></div>
              <button className="favorite-button" type="button" aria-label={`${favorites.some((favorite) => favorite.id === station.id) ? "Remove" : "Add"} ${station.name} ${favorites.some((favorite) => favorite.id === station.id) ? "from" : "to"} favorites`} onClick={() => favoriteStation(station)}>★</button>
              <button className="play-button" type="button" aria-label={`Play ${station.name}`} onClick={() => playStation(station)}>▶</button>
            </article>
          ))}
        </div>
      </div>
      <audio ref={audioRef} preload="none" playsInline />
      {selectedStation && (
        <aside className="player" aria-label="Player">
          <div className="player-art" aria-hidden="true">{selectedStation.favicon ? <img src={selectedStation.favicon} alt="" /> : "♫"}</div>
          <div className="player-copy"><strong>{selectedStation.name}</strong><span>{selectedStation.tags.length ? selectedStation.tags.join(" · ") : `Live radio · ${selectedStation.countryCode}`}{sleepDeadline ? ` · sleep ${Math.ceil(secondsLeft / 60)}m` : ""}</span><span className="timeline-note">Live timeline available only when station provides programme metadata.</span></div>
          <button className="quiet-button" type="button" aria-label="Set 30 minute sleep timer" onClick={() => startSleepTimer(30)}>30m</button>
          <button className="play-button" type="button" aria-label={`Pause ${selectedStation.name}`} onClick={() => audioRef.current?.pause()}>Ⅱ</button>
        </aside>
      )}
    </section>
  );
}
