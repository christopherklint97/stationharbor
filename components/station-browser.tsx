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

function PlayIcon() {
  return <svg aria-hidden="true" className="player-control-icon" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z" fill="currentColor" /></svg>;
}

function PauseIcon() {
  return <svg aria-hidden="true" className="player-control-icon" viewBox="0 0 24 24"><path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" /></svg>;
}

function AudioBars() {
  return <span aria-label="Playing" className="audio-bars"><i /><i /><i /></span>;
}

export function StationBrowser() {
  const [country, setCountry] = useState<CountryCode>("SE");
  const [query, setQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [detailStation, setDetailStation] = useState<Station | null>(null);
  const [favorites, setFavorites] = useState<Station[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("stationharbor:favorites") ?? "[]") as Station[]; } catch { return []; }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [category, setCategory] = useState("all");
  const [language, setLanguage] = useState("all");
  const [codec, setCodec] = useState("all");
  const [hlsOnly, setHlsOnly] = useState(false);
  const [sort, setSort] = useState("popular");
  const [visibleCount, setVisibleCount] = useState(50);
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [customMinutes, setCustomMinutes] = useState("");
  const [playbackState, setPlaybackState] = useState<"idle" | "buffering" | "playing" | "paused" | "error">("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);

  const displayedStations = stations.filter((station) =>
    (!favoritesOnly || favorites.some((favorite) => favorite.id === station.id)) &&
    (language === "all" || station.language.toLowerCase().includes(language)) &&
    (codec === "all" || station.codec === codec) && (!hlsOnly || station.hasHls) &&
    (category === "all" || (category === "talk" ? station.tags.some((tag) => tag.includes("talk") || tag.includes("speech")) : station.tags.includes(category))),
  ).sort((a, b) => sort === "votes" ? b.votes - a.votes : sort === "checked" ? (b.lastCheckedAt ?? "").localeCompare(a.lastCheckedAt ?? "") : sort === "changed" ? (b.lastChangedAt ?? "").localeCompare(a.lastChangedAt ?? "") : b.clickCount - a.clickCount);

  function favoriteStation(station: Station) {
    setFavorites((current) => {
      const next = toggleFavorite(current, station);
      if (typeof localStorage !== "undefined") localStorage.setItem("stationharbor:favorites", JSON.stringify(next));
      return next;
    });
  }

  function startSleepTimer(minutes: number) {
    const deadline = Date.now() + minutes * 60_000;
    setSleepDeadline(deadline);
    setSecondsLeft(minutes * 60);
  }

  async function playStation(station: Station) {
    if (!station.isVerified) { setPlayerError(`${station.name}: ${station.availabilityReason ?? "stream unavailable"}.`); return; }
    const audio = audioRef.current;
    if (!audio) return;
    if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current);
    retryCountRef.current = 0;
    setPlayerError("");
    setIsPlaying(false);
    setPlaybackState("buffering");
    setSelectedStation(station);
    setIsPlayerOpen(true);
    document.title = `${station.name} — StationHarbor`;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: station.name, artist: `${station.countryCode} live radio`, album: station.tags.join(" · "), artwork: station.favicon ? [{ src: station.favicon }] : [] });
      navigator.mediaSession.setActionHandler("play", () => { void audio.play(); });
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    }
    audio.src = station.streamUrl.startsWith("http:") ? `/api/relay?url=${encodeURIComponent(station.streamUrl)}` : station.streamUrl;
    audio.load();
    try {
      await audio.play();
      setIsPlaying(true);
      setPlaybackState("playing");
    } catch {
      setIsPlaying(false);
      setPlaybackState("error");
      setPlayerError(`Could not play ${station.name}. Try another station.`);
    }
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !selectedStation) return;
    if (isPlaying) { audio.pause(); return; }
    setPlaybackState("buffering");
    void audio.play().then(() => {
      setIsPlaying(true);
      setPlaybackState("playing");
    }).catch(() => {
      setIsPlaying(false);
      setPlaybackState("error");
    });
  }

  function handleAudioError() {
    const audio = audioRef.current;
    const station = selectedStation;
    if (!audio || !station || retryCountRef.current >= 2) {
      setIsPlaying(false);
      setPlaybackState("error");
      setPlayerError(`${station?.name ?? "Station"} stopped. Try playing it again or choose another station.`);
      return;
    }
    retryCountRef.current += 1;
    setPlaybackState("buffering");
    retryTimeoutRef.current = window.setTimeout(() => {
      audio.load();
      void audio.play().catch(handleAudioError);
    }, 1500);
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ country });
    if (query.trim()) params.set("q", query.trim());
    if (category !== "all" && category !== "talk") params.set("tag", category);

    fetch(`/api/stations?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Live station directory is temporarily unavailable.");
        return response.json() as Promise<{ stations: Station[] }>;
      })
      .then(({ stations: nextStations }) => {
        setDirectoryError("");
        setStations(nextStations);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setDirectoryError("Live station directory is temporarily unavailable.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });

    return () => controller.abort();
  }, [country, query, category]);

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

  useEffect(() => {
    return () => { if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current); };
  }, []);

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
      <div className="metadata-filters" aria-label="Category filter">
        <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option><option value="talk">Talk radio</option><option value="news">News</option><option value="music">Music</option><option value="sports">Sports</option><option value="jazz">Jazz</option><option value="rock">Rock</option></select>
      </div>

      <div className="metadata-filters" aria-label="Advanced filters">
        <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{[...new Set(stations.map((station) => station.language.toLowerCase()).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Codec" value={codec} onChange={(event) => setCodec(event.target.value)}><option value="all">All codecs</option>{[...new Set(stations.map((station) => station.codec).filter(Boolean))].map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Sort stations" value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">Popular</option><option value="votes">Most voted</option><option value="checked">Recently checked</option><option value="changed">Recently changed</option></select>
        <button aria-pressed={hlsOnly} className="country-chip" type="button" onClick={() => setHlsOnly((current) => !current)}>HLS only</button>
      </div>

      <div className="active-filters" aria-label="Selected filters">
        {category !== "all" && <button type="button" onClick={() => setCategory("all")}>{category === "talk" ? "Talk radio" : category} ×</button>}
        {language !== "all" && <button type="button" onClick={() => setLanguage("all")}>{language} ×</button>}
        {codec !== "all" && <button type="button" onClick={() => setCodec("all")}>{codec} ×</button>}
        {hlsOnly && <button type="button" onClick={() => setHlsOnly(false)}>HLS only ×</button>}
        {sort !== "popular" && <button type="button" onClick={() => setSort("popular")}>Sort: {sort} ×</button>}
      </div>

      <div className="station-section" aria-live="polite">
        <div className="section-heading"><div><p className="eyebrow">START HERE</p><h2>{favoritesOnly ? "Favorites" : "Popular stations"}</h2></div><button className="quiet-button" onClick={() => setFavoritesOnly((current) => !current)} type="button">{favoritesOnly ? "All stations" : `Favorites (${favorites.length})`}</button></div>
        {isLoading && <div className="loading-card" role="status">Loading live stations…</div>}
        {directoryError && <div className="loading-card" role="alert">{directoryError}</div>}
        {!isLoading && !directoryError && stations.length === 0 && <div className="loading-card">No verified HTTPS stations found.</div>}
        <div className="station-list">
          {displayedStations.slice(0, visibleCount).map((station) => {
            const isCurrentStation = selectedStation?.id === station.id;
            const isCurrentStationPlaying = isCurrentStation && isPlaying;
            return (
            <article className={`station-card ${isCurrentStation ? "is-active" : ""}`} data-playing={isCurrentStationPlaying} key={station.id}>
              <div className="station-meta"><strong>{isCurrentStationPlaying && <AudioBars />}{station.name}</strong><span>{[station.region, station.countryCode, station.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}</span>{station.streamUrl.startsWith("http:") && station.isVerified && <small className="relay-note">HTTP stream — plays via local relay</small>}{!station.isVerified && <small className="unavailable">Unavailable: {station.availabilityReason}</small>}</div>
              <button className="details-button" type="button" aria-label={`Details ${station.name}`} onClick={() => setDetailStation(station)}>i</button>
              <button aria-pressed={favorites.some((favorite) => favorite.id === station.id)} className={`favorite-button ${favorites.some((favorite) => favorite.id === station.id) ? "is-favorite" : ""}`} type="button" aria-label={`${favorites.some((favorite) => favorite.id === station.id) ? "Remove" : "Add"} ${station.name} ${favorites.some((favorite) => favorite.id === station.id) ? "from" : "to"} favorites`} onClick={() => favoriteStation(station)}>{favorites.some((favorite) => favorite.id === station.id) ? "★" : "☆"}</button>
              <button className="play-button" disabled={!station.isVerified} type="button" aria-label={station.isVerified ? `${isCurrentStationPlaying ? "Pause" : isCurrentStation ? "Resume" : "Play"} ${station.name}` : `${station.name} unavailable`} onClick={() => isCurrentStation ? togglePlayback() : playStation(station)}>{isCurrentStationPlaying ? <PauseIcon /> : <PlayIcon />}</button>
            </article>
            );
          })}
        </div>
        {displayedStations.length > visibleCount && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => count + 50)}>Show 50 more stations</button>}
      </div>
      <audio
        ref={audioRef}
        preload="none"
        playsInline
        onError={handleAudioError}
        onPause={() => { setIsPlaying(false); setPlaybackState("paused"); }}
        onPlay={() => { retryCountRef.current = 0; setIsPlaying(true); setPlaybackState("playing"); }}
        onStalled={() => setPlaybackState("buffering")}
        onWaiting={() => setPlaybackState("buffering")}
      />
      {detailStation && <div className="details-sheet" role="dialog" aria-modal="true" aria-label="Station details"><button className="player-close" type="button" aria-label="Close station details" onClick={() => setDetailStation(null)}>×</button><h2>{detailStation.name}</h2><p>{detailStation.tags.join(" · ") || "Live radio"}</p><dl><dt>Language</dt><dd>{detailStation.language || "Unknown"}</dd><dt>Stream</dt><dd>{detailStation.codec} · {detailStation.bitrate} kbps{detailStation.hasHls ? " · HLS" : ""}</dd><dt>Votes</dt><dd>{detailStation.votes}</dd><dt>Last checked</dt><dd>{detailStation.lastCheckedAt ? new Date(detailStation.lastCheckedAt).toLocaleString() : "Unknown"}</dd></dl>{detailStation.homepage && <a href={detailStation.homepage} rel="noreferrer" target="_blank">Open station website</a>}</div>}
      {selectedStation && isPlayerOpen && (
        <div className="player-screen" role="dialog" aria-modal="true" aria-label="Now playing">
          <button className="player-close" type="button" aria-label="Close now playing" onClick={() => setIsPlayerOpen(false)}>⌄</button>
          <div className="player-cover">{selectedStation.favicon ? <img src={selectedStation.favicon} alt="" /> : "♫"}</div>
          <p className="eyebrow">NOW PLAYING</p>
          <h2>{selectedStation.name}</h2>
          <p className="player-description">{selectedStation.tags.length ? selectedStation.tags.join(" · ") : `Live radio · ${selectedStation.countryCode}`} · {selectedStation.codec} · {selectedStation.bitrate} kbps</p>
          <p className="timeline-note">Live timeline appears when broadcaster publishes programme metadata.</p>
          <div className="player-actions"><button className={`favorite-button ${favorites.some((favorite) => favorite.id === selectedStation.id) ? "is-favorite" : ""}`} aria-pressed={favorites.some((favorite) => favorite.id === selectedStation.id)} type="button" aria-label="Favorite current station" onClick={() => favoriteStation(selectedStation)}>{favorites.some((favorite) => favorite.id === selectedStation.id) ? "★" : "☆"}</button><button className="player-main-button" type="button" aria-label={`${isPlaying ? "Pause" : "Resume"} ${selectedStation.name}`} onClick={togglePlayback}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button></div>
          <p className="playback-status" aria-live="polite">{playbackState === "buffering" && isPlaying ? "Rebuffering live audio…" : isPlaying ? "Playing live" : playbackState === "paused" ? "Paused" : playbackState === "error" ? "Playback stopped — retrying is limited to protect your data." : "Connecting to live audio…"}</p>
          {playerError && <p className="player-error" role="alert">{playerError}</p>}
          <div className="timer-controls" aria-label="Sleep timer">{[5, 10, 15, 30, 45, 60].map((minutes) => <button className="quiet-button" key={minutes} type="button" onClick={() => startSleepTimer(minutes)}>{minutes}m</button>)}<input aria-label="Custom sleep timer minutes" inputMode="numeric" min="1" onChange={(event) => setCustomMinutes(event.target.value)} placeholder="Custom" type="number" value={customMinutes} /><button className="quiet-button" type="button" onClick={() => { const minutes = Number(customMinutes); if (minutes > 0) startSleepTimer(minutes); }}>Set</button></div>
          {sleepDeadline && <p className="sleep-status">Sleep timer: {Math.ceil(secondsLeft / 60)} min remaining</p>}
        </div>
      )}
      {selectedStation && !isPlayerOpen && (
        <button className="mini-player" type="button" aria-label="Open now playing" onClick={() => setIsPlayerOpen(true)}>
          <span className="mini-art">{selectedStation.favicon ? <img src={selectedStation.favicon} alt="" /> : "♫"}</span>
          <span className="mini-copy"><strong>{selectedStation.name}</strong><small>{selectedStation.tags.slice(0, 2).join(" · ") || "Live radio"}</small></span>
          <span className="mini-open">⌃</span>
        </button>
      )}
    </section>
  );
}
