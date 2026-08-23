"use client";

import { useEffect, useRef, useState } from "react";
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
  const audioRef = useRef<HTMLAudioElement>(null);

  async function playStation(station: Station) {
    const audio = audioRef.current;
    if (!audio) return;
    setSelectedStation(station);
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
        <div className="section-heading"><div><p className="eyebrow">START HERE</p><h2>Popular stations</h2></div></div>
        {isLoading && <div className="loading-card" role="status">Loading live stations…</div>}
        {error && <div className="loading-card" role="alert">{error}</div>}
        {!isLoading && !error && stations.length === 0 && <div className="loading-card">No verified HTTPS stations found.</div>}
        <div className="station-list">
          {stations.map((station) => (
            <article className="station-card" key={station.id}>
              <div className="station-meta"><strong>{station.name}</strong><span>{[station.region, station.countryCode, station.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}</span></div>
              <button className="play-button" type="button" aria-label={`Play ${station.name}`} onClick={() => playStation(station)}>▶</button>
            </article>
          ))}
        </div>
      </div>
      <audio ref={audioRef} preload="none" playsInline />
      {selectedStation && (
        <aside className="player" aria-label="Player">
          <div className="player-art" aria-hidden="true">♫</div>
          <div className="player-copy"><strong>{selectedStation.name}</strong><span>Live · {selectedStation.countryCode}</span></div>
          <button className="play-button" type="button" aria-label={`Pause ${selectedStation.name}`} onClick={() => audioRef.current?.pause()}>Ⅱ</button>
        </aside>
      )}
    </section>
  );
}
