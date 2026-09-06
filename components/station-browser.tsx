"use client";
/* eslint-disable @next/next/no-img-element -- remote station artwork is displayed directly instead of being proxied */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, ExternalLink, Info, MapPin, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { toggleFavorite } from "@/lib/favorites";
import { categoryLabels, countryLabels, formatStationLocation, getStationCategories, stationKnownFor } from "@/lib/station-taxonomy";
import { CATEGORY_IDS, US_STATES, type CategoryId } from "@/lib/station-query";
import { INITIAL_COUNTRY_CODES, type Station, type StationSource, type SupportedCountryCode } from "@/lib/stations";

const INITIAL_VISIBLE_COUNT = 40;
type WebsiteProfile = { siteName: string | null; description: string | null; homepage: string };
type PlaybackAttempt = { generation: number; station: Station; sourceIndex: number; handled: boolean };

function PlayIcon() {
  return <svg aria-hidden="true" className="player-control-icon" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z" fill="currentColor" /></svg>;
}

function PauseIcon() {
  return <svg aria-hidden="true" className="player-control-icon" viewBox="0 0 24 24"><path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" /></svg>;
}

function AudioBars() {
  return <span aria-label="Playing" className="audio-bars"><i /><i /><i /></span>;
}

function StationArtwork({ station, className, lazy = false }: { station: Station; className: string; lazy?: boolean }) {
  return <span aria-hidden="true" className={className}><span>{station.name.slice(0, 1).toUpperCase()}</span>{station.favicon && <img alt="" hidden={false} loading={lazy ? "lazy" : undefined} onError={(event) => { event.currentTarget.hidden = true; }} referrerPolicy="no-referrer" src={station.favicon} />}</span>;
}

function sleepDeadlineFromNow(minutes: number) {
  return new Date().getTime() + minutes * 60_000;
}

function stationSources(station: Station): StationSource[] {
  if (station.sources?.length) return station.sources;
  return [{
    id: station.id,
    streamUrl: station.streamUrl,
    codec: station.codec,
    bitrate: station.bitrate,
    hasHls: station.hasHls,
    isVerified: station.isVerified,
    isDirect: station.streamUrl.startsWith("https:"),
    availabilityReason: station.availabilityReason,
  }];
}

function stationCategories(station: Station) {
  return station.categories?.length ? station.categories : getStationCategories(station.tags);
}

function sourceUrl(source: StationSource) {
  return source.streamUrl.startsWith("http:") ? `/api/relay?url=${encodeURIComponent(source.streamUrl)}` : source.streamUrl;
}

function languageValues(stations: Station[]) {
  return [...new Set(stations.flatMap((station) => station.language.split(",")).map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function displayLanguage(value: string) {
  return value.split(",").map((language) => language.trim()).filter(Boolean).map((language) => language.charAt(0).toLocaleUpperCase() + language.slice(1)).join(", ") || "Not listed";
}

export function StationBrowser() {
  const [selectedCountries, setSelectedCountries] = useState<SupportedCountryCode[]>([...INITIAL_COUNTRY_CODES]);
  const [usState, setUsState] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [detailStation, setDetailStation] = useState<Station | null>(null);
  const [websiteProfiles, setWebsiteProfiles] = useState<Record<string, { loading: boolean; profile: WebsiteProfile | null }>>({});
  const [favorites, setFavorites] = useState<Station[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("stationharbor:favorites") ?? "[]") as Station[]; } catch { return []; }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [category, setCategory] = useState<CategoryId>("all");
  const [language, setLanguage] = useState("all");
  const [codec, setCodec] = useState("all");
  const [hlsOnly, setHlsOnly] = useState(false);
  const [sort, setSort] = useState("popular");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [customMinutes, setCustomMinutes] = useState("");
  const [playbackState, setPlaybackState] = useState<"idle" | "buffering" | "playing" | "paused" | "error">("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const retryCountRef = useRef(0);
  const sourceIndexRef = useRef(0);
  const playbackGenerationRef = useRef(0);
  const activeAttemptRef = useRef<PlaybackAttempt | null>(null);
  const suppressNextMediaErrorRef = useRef<number | null>(null);
  const mediaActionsRef = useRef({ play: () => {}, pause: () => {} });
  const retryTimeoutRef = useRef<number | null>(null);
  const allCountriesSelected = selectedCountries.length === INITIAL_COUNTRY_CODES.length && !usState;

  const displayedStations = useMemo(() => stations.filter((station) => {
    const stationLanguages = station.language.toLowerCase().split(",").map((value) => value.trim());
    const sources = stationSources(station);
    return (!favoritesOnly || favorites.some((favorite) => favorite.id === station.id))
      && (language === "all" || stationLanguages.includes(language.toLowerCase()))
      && (codec === "all" || sources.some((source) => source.codec === codec))
      && (!hlsOnly || sources.some((source) => source.hasHls));
  }).sort((a, b) => sort === "votes"
    ? b.votes - a.votes
    : sort === "checked"
      ? (b.lastCheckedAt ?? "").localeCompare(a.lastCheckedAt ?? "")
      : sort === "changed"
        ? (b.lastChangedAt ?? "").localeCompare(a.lastChangedAt ?? "")
        : b.clickCount - a.clickCount), [stations, favoritesOnly, favorites, language, codec, hlsOnly, sort]);

  function favoriteStation(station: Station) {
    setFavorites((current) => {
      const next = toggleFavorite(current, station);
      if (typeof localStorage !== "undefined") localStorage.setItem("stationharbor:favorites", JSON.stringify(next));
      return next;
    });
  }

  function openStationDetails(station: Station) {
    setDetailStation(station);
    if (!station.homepage || websiteProfiles[station.id]) return;
    setWebsiteProfiles((current) => ({ ...current, [station.id]: { loading: true, profile: null } }));
    fetch(`/api/station-profile?id=${encodeURIComponent(station.id)}`)
      .then((response) => response.ok ? response.json() as Promise<{ profile: WebsiteProfile | null }> : { profile: null })
      .then(({ profile }) => setWebsiteProfiles((current) => ({ ...current, [station.id]: { loading: false, profile } })))
      .catch(() => setWebsiteProfiles((current) => ({ ...current, [station.id]: { loading: false, profile: null } })));
  }

  function startSleepTimer(minutes: number) {
    setSleepDeadline(sleepDeadlineFromNow(minutes));
    setSecondsLeft(minutes * 60);
  }

  function cancelPlaybackWork() {
    playbackGenerationRef.current += 1;
    activeAttemptRef.current = null;
    suppressNextMediaErrorRef.current = null;
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }

  function beginAudioAttempt(station: Station, index: number, generation: number) {
    const audio = audioRef.current;
    const source = stationSources(station)[index];
    if (!audio || !source || generation !== playbackGenerationRef.current) return;
    const attempt: PlaybackAttempt = { generation, station, sourceIndex: index, handled: false };
    activeAttemptRef.current = attempt;
    sourceIndexRef.current = index;
    setSourceIndex(index);
    setPlaybackState("buffering");
    audio.src = sourceUrl(source);
    void audio.play().then(() => {
      if (activeAttemptRef.current !== attempt || generation !== playbackGenerationRef.current) return;
      suppressNextMediaErrorRef.current = null;
      setIsPlaying(true);
      setPlaybackState("playing");
    }).catch(() => {
      window.setTimeout(() => {
        if (activeAttemptRef.current !== attempt || attempt.handled || generation !== playbackGenerationRef.current) return;
        suppressNextMediaErrorRef.current = generation;
        handleAudioError(attempt);
      }, 0);
    });
  }

  function playStation(station: Station) {
    if (!station.isVerified) {
      setPlayerError(`${station.name}: ${station.availabilityReason ?? "stream unavailable"}.`);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    cancelPlaybackWork();
    if (audio.getAttribute("src")) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    const generation = playbackGenerationRef.current;
    retryCountRef.current = 0;
    setPlayerError("");
    setIsPlaying(false);
    setSelectedStation(station);
    setIsPlayerOpen(true);
    beginAudioAttempt(station, 0, generation);
  }

  function pausePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    cancelPlaybackWork();
    audio.pause();
    setIsPlaying(false);
    setPlaybackState("paused");
  }

  function resumePlayback(station: Station) {
    cancelPlaybackWork();
    const generation = playbackGenerationRef.current;
    retryCountRef.current = 0;
    setPlayerError("");
    beginAudioAttempt(station, sourceIndexRef.current, generation);
  }

  function togglePlayback() {
    if (!audioRef.current || !selectedStation) return;
    if (isPlaying || playbackState === "buffering") {
      pausePlayback();
      return;
    }
    resumePlayback(selectedStation);
  }

  function handleAudioError(attempt: PlaybackAttempt) {
    if (attempt.handled || activeAttemptRef.current !== attempt || attempt.generation !== playbackGenerationRef.current) return;
    attempt.handled = true;
    const sources = stationSources(attempt.station);
    const nextSourceIndex = attempt.sourceIndex + 1;
    if (nextSourceIndex < sources.length) {
      setPlayerError(`Trying alternate stream ${nextSourceIndex + 1} of ${sources.length}…`);
      beginAudioAttempt(attempt.station, nextSourceIndex, attempt.generation);
      return;
    }
    if (retryCountRef.current < 1) {
      retryCountRef.current += 1;
      setPlaybackState("buffering");
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        if (attempt.generation !== playbackGenerationRef.current) return;
        beginAudioAttempt(attempt.station, 0, attempt.generation);
      }, 1500);
      return;
    }
    activeAttemptRef.current = null;
    setIsPlaying(false);
    setPlaybackState("error");
    setPlayerError(`${attempt.station.name} stopped. Try again or choose another station.`);
  }

  function currentMediaAttempt(media: HTMLAudioElement): PlaybackAttempt | null {
    const attempt = activeAttemptRef.current;
    if (!attempt || attempt.generation !== playbackGenerationRef.current) return null;
    const source = stationSources(attempt.station)[attempt.sourceIndex];
    if (!source) return null;
    const expectedSource = new URL(sourceUrl(source), window.location.href).href;
    return media.src === expectedSource ? attempt : null;
  }

  function toggleCountry(code: SupportedCountryCode) {
    setIsLoading(true);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
    setSelectedCountries((current) => {
      if (allCountriesSelected) {
        if (code !== "US") setUsState("");
        return [code];
      }
      if (current.includes(code)) {
        if (current.length === 1) {
          setUsState("");
          return [...INITIAL_COUNTRY_CODES];
        }
        if (code === "US") setUsState("");
        return current.filter((country) => country !== code);
      }
      return [...current, code];
    });
  }

  function resetFilters() {
    setIsLoading(true);
    setSelectedCountries([...INITIAL_COUNTRY_CODES]);
    setUsState("");
    setCategory("all");
    setLanguage("all");
    setCodec("all");
    setHlsOnly(false);
    setSort("popular");
    setSearchInput("");
    setDirectoryQuery("");
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }

  useEffect(() => {
    const normalizedQuery = searchInput.trim();
    if (normalizedQuery === directoryQuery) return;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setDirectoryQuery(normalizedQuery);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, directoryQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedCountries.length !== INITIAL_COUNTRY_CODES.length) params.set("countries", selectedCountries.join(","));
    if (directoryQuery) params.set("q", directoryQuery);
    if (category !== "all") params.set("category", category);
    if (usState && selectedCountries.includes("US")) params.set("state", usState);
    const endpoint = params.size ? `/api/stations?${params}` : "/api/stations";

    fetch(endpoint, { signal: controller.signal })
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
  }, [selectedCountries, usState, directoryQuery, category]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    if (!sleepDeadline) return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((sleepDeadline - new Date().getTime()) / 1000));
      setSecondsLeft(next);
      if (next === 0) {
        playbackGenerationRef.current += 1;
        activeAttemptRef.current = null;
        if (retryTimeoutRef.current) {
          window.clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        audioRef.current?.pause();
        setIsPlaying(false);
        setPlaybackState("paused");
        setSleepDeadline(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sleepDeadline]);

  useEffect(() => {
    if (!isPlayerOpen && !detailStation) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [isPlayerOpen, detailStation]);

  useEffect(() => {
    mediaActionsRef.current = {
      play: () => { if (selectedStation) resumePlayback(selectedStation); },
      pause: pausePlayback,
    };
  });

  useEffect(() => {
    if (!selectedStation) return;
    document.title = `${selectedStation.name} — StationHarbor`;
    if (!("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    mediaSession.metadata = new MediaMetadata({
      title: selectedStation.name,
      artist: stationKnownFor(selectedStation),
      album: "StationHarbor live radio",
      artwork: selectedStation.favicon ? [{ src: selectedStation.favicon }] : [],
    });
    mediaSession.setActionHandler("play", () => mediaActionsRef.current.play());
    mediaSession.setActionHandler("pause", () => mediaActionsRef.current.pause());
    return () => {
      mediaSession.setActionHandler("play", null);
      mediaSession.setActionHandler("pause", null);
    };
  }, [selectedStation]);

  useEffect(() => () => {
    playbackGenerationRef.current += 1;
    activeAttemptRef.current = null;
    if (retryTimeoutRef.current) window.clearTimeout(retryTimeoutRef.current);
  }, []);

  const activeFilterCount = Number(!allCountriesSelected) + Number(Boolean(usState)) + Number(category !== "all") + Number(language !== "all") + Number(codec !== "all") + Number(hlsOnly) + Number(sort !== "popular") + Number(Boolean(searchInput));
  const advancedFilterCount = Number(language !== "all") + Number(codec !== "all") + Number(hlsOnly) + Number(sort !== "popular");
  const currentSource = selectedStation ? stationSources(selectedStation)[sourceIndex] : null;
  const detailWebsiteProfile = detailStation ? websiteProfiles[detailStation.id] : null;
  const selectedWebsiteProfile = selectedStation ? websiteProfiles[selectedStation.id]?.profile : null;

  return (
    <section className="discovery" aria-label="Discover stations">
      <div className="filter-panel">
        <div className="search-row">
          <label className="search-label" htmlFor="station-search">Search stations</label>
          <div className="search-control"><Search aria-hidden="true" size={20} /><input id="station-search" className="search-input" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Station, city or team" /></div>
        </div>

        <fieldset className="filter-group">
          <legend>Countries <span>Choose one or more</span></legend>
          <div className="country-list" aria-label="Country filter">
            <button aria-pressed={allCountriesSelected} className="country-chip" onClick={() => { setIsLoading(true); setSelectedCountries([...INITIAL_COUNTRY_CODES]); setUsState(""); }} type="button">{allCountriesSelected && <Check aria-hidden="true" size={15} />}All countries</button>
            {INITIAL_COUNTRY_CODES.map((code) => {
              const selected = !allCountriesSelected && selectedCountries.includes(code);
              return <button aria-pressed={selected} className="country-chip" key={code} onClick={() => toggleCountry(code)} type="button">{selected && <Check aria-hidden="true" size={15} />}{countryLabels[code]}</button>;
            })}
          </div>
          {!allCountriesSelected && selectedCountries.includes("US") && (
            <label className="state-filter">US state<select aria-label="US state" value={usState} onChange={(event) => { setIsLoading(true); setUsState(event.target.value); setVisibleCount(INITIAL_VISIBLE_COUNT); }}><option value="">All US states</option>{US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
          )}
        </fieldset>

        <div className="filter-primary-row">
          <label className="select-field">Category<select aria-label="Category" value={category} onChange={(event) => { setIsLoading(true); setCategory(event.target.value as CategoryId); setVisibleCount(INITIAL_VISIBLE_COUNT); }}>{CATEGORY_IDS.map((id) => <option key={id} value={id}>{categoryLabels[id]}</option>)}</select><ChevronDown aria-hidden="true" size={16} /></label>
          <details className="advanced-filters">
            <summary><SlidersHorizontal aria-hidden="true" size={17} />More filters{advancedFilterCount > 0 && <span>{advancedFilterCount}</span>}</summary>
            <div className="advanced-grid">
              <label>Language<select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{languageValues(stations).map((value) => <option key={value} value={value.toLowerCase()}>{value}</option>)}</select></label>
              <label>Stream format<select aria-label="Codec" value={codec} onChange={(event) => setCodec(event.target.value)}><option value="all">All formats</option>{[...new Set(stations.flatMap((station) => stationSources(station).map((source) => source.codec)).filter(Boolean))].sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Sort by<select aria-label="Sort stations" value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">Most popular</option><option value="votes">Most voted</option><option value="checked">Recently checked</option><option value="changed">Recently changed</option></select></label>
              <label className="toggle-field"><input checked={hlsOnly} onChange={(event) => setHlsOnly(event.target.checked)} type="checkbox" />HLS streams only</label>
            </div>
          </details>
        </div>

        {activeFilterCount > 0 && <div className="active-filters" aria-label="Selected filters">
          {!allCountriesSelected && selectedCountries.map((code) => <button aria-label={`Remove ${countryLabels[code]} filter`} key={code} type="button" onClick={() => toggleCountry(code)}>{countryLabels[code]} <X aria-hidden="true" size={13} /></button>)}
          {usState && <button aria-label={`Remove ${usState} state filter`} type="button" onClick={() => { setIsLoading(true); setUsState(""); }}>United States · {usState} <X aria-hidden="true" size={13} /></button>}
          {category !== "all" && <button aria-label={`Remove ${categoryLabels[category]} filter`} type="button" onClick={() => { setIsLoading(true); setCategory("all"); }}>{categoryLabels[category]} <X aria-hidden="true" size={13} /></button>}
          {language !== "all" && <button type="button" onClick={() => setLanguage("all")}>{language} <X aria-hidden="true" size={13} /></button>}
          {codec !== "all" && <button type="button" onClick={() => setCodec("all")}>{codec} <X aria-hidden="true" size={13} /></button>}
          {hlsOnly && <button type="button" onClick={() => setHlsOnly(false)}>HLS only <X aria-hidden="true" size={13} /></button>}
          {sort !== "popular" && <button type="button" onClick={() => setSort("popular")}>Custom sort <X aria-hidden="true" size={13} /></button>}
          <button className="clear-filters" type="button" onClick={resetFilters}>Clear all</button>
        </div>}
      </div>

      <div className="station-section" aria-live="polite">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DISCOVER</p>
            <h2>{favoritesOnly ? "Your favorites" : category === "all" ? "Explore live radio" : categoryLabels[category]}</h2>
            <p className="result-scope"><span>{displayedStations.length.toLocaleString()} stations</span><span>{allCountriesSelected ? "4 countries" : selectedCountries.map((code) => countryLabels[code]).join(" · ")}{usState ? ` · ${usState}` : ""}</span></p>
          </div>
          <button aria-pressed={favoritesOnly} className="quiet-button favorites-filter" onClick={() => setFavoritesOnly((current) => !current)} type="button"><Star aria-hidden="true" fill={favoritesOnly ? "currentColor" : "none"} size={17} />{favoritesOnly ? "All stations" : `Favorites (${favorites.length})`}</button>
        </div>
        {isLoading && <div className="loading-card" role="status">Loading live stations…</div>}
        {directoryError && <div className="loading-card" role="alert">{directoryError}</div>}
        {!isLoading && !directoryError && displayedStations.length === 0 && <div className="loading-card">No stations match these filters. Clear a filter or try another search.</div>}
        <div className="station-list">
          {displayedStations.slice(0, visibleCount).map((station) => {
            const isCurrentStation = selectedStation?.id === station.id;
            const isCurrentStationPlaying = isCurrentStation && isPlaying;
            const stationCategoryList = stationCategories(station);
            const categories = category !== "all" && stationCategoryList.includes(category)
              ? [category, ...stationCategoryList.filter((item) => item !== category)]
              : stationCategoryList;
            const isFavorite = favorites.some((favorite) => favorite.id === station.id);
            return (
              <article className={`station-card ${isCurrentStation ? "is-active" : ""}`} data-playing={isCurrentStationPlaying} key={station.id}>
                <button className="station-summary" type="button" aria-label={`Details for ${station.name}`} onClick={() => openStationDetails(station)}>
                  <StationArtwork className="station-art" lazy station={station} />
                  <span className="station-meta">
                    <strong>{isCurrentStationPlaying && <AudioBars />}{station.name}</strong>
                    <span className="station-location"><MapPin aria-hidden="true" size={13} />{formatStationLocation(station)}</span>
                    <span className="category-badges">{categories.slice(0, 2).map((item) => <span key={item}>{categoryLabels[item]}</span>)}{station.sourceCount > 1 && <span>{station.sourceCount} streams grouped</span>}</span>
                  </span>
                  <Info aria-hidden="true" className="summary-info" size={19} />
                </button>
                <button aria-pressed={isFavorite} className={`favorite-button ${isFavorite ? "is-favorite" : ""}`} type="button" aria-label={`${isFavorite ? "Remove" : "Add"} ${station.name} ${isFavorite ? "from" : "to"} favorites`} onClick={() => favoriteStation(station)}><Star aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} size={21} /></button>
                <button className="play-button" disabled={!station.isVerified} type="button" aria-label={station.isVerified ? `${isCurrentStationPlaying ? "Pause" : isCurrentStation ? "Resume" : "Play"} ${station.name}` : `${station.name} unavailable`} onClick={() => isCurrentStation ? togglePlayback() : playStation(station)}>{isCurrentStationPlaying ? <PauseIcon /> : <PlayIcon />}</button>
              </article>
            );
          })}
        </div>
        {displayedStations.length > visibleCount && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE_COUNT)}>Show {Math.min(INITIAL_VISIBLE_COUNT, displayedStations.length - visibleCount)} more <span>{visibleCount} of {displayedStations.length} shown</span></button>}
      </div>

      <audio
        ref={audioRef}
        preload="none"
        playsInline
        onError={(event) => {
          const attempt = currentMediaAttempt(event.currentTarget);
          if (!attempt) return;
          if (suppressNextMediaErrorRef.current === attempt.generation) {
            suppressNextMediaErrorRef.current = null;
            return;
          }
          handleAudioError(attempt);
        }}
        onPause={(event) => {
          if (!currentMediaAttempt(event.currentTarget) || !event.currentTarget.paused) return;
          setIsPlaying(false);
          setPlaybackState("paused");
        }}
        onPlay={(event) => {
          const attempt = currentMediaAttempt(event.currentTarget);
          if (!attempt) return;
          suppressNextMediaErrorRef.current = null;
          setPlayerError("");
          setIsPlaying(true);
          setPlaybackState("playing");
        }}
        onPlaying={(event) => {
          const attempt = currentMediaAttempt(event.currentTarget);
          if (!attempt) return;
          suppressNextMediaErrorRef.current = null;
          setPlayerError("");
          setIsPlaying(true);
          setPlaybackState("playing");
        }}
        onTimeUpdate={(event) => {
          if (event.currentTarget.paused || !currentMediaAttempt(event.currentTarget)) return;
          suppressNextMediaErrorRef.current = null;
          setPlayerError("");
          setIsPlaying(true);
          setPlaybackState("playing");
        }}
        onStalled={(event) => { if (currentMediaAttempt(event.currentTarget)) setPlaybackState("buffering"); }}
        onWaiting={(event) => { if (currentMediaAttempt(event.currentTarget)) setPlaybackState("buffering"); }}
      />

      {detailStation && <div className="dialog-backdrop"><section className="details-sheet" role="dialog" aria-modal="true" aria-label="Station details">
        <button className="dialog-close" type="button" aria-label="Close station details" onClick={() => setDetailStation(null)}><X aria-hidden="true" /></button>
        <div className="detail-identity"><StationArtwork className="detail-art" station={detailStation} /><div><p className="eyebrow">STATION PROFILE</p><h2>{detailStation.name}</h2><p>{formatStationLocation(detailStation)} · {countryLabels[detailStation.countryCode]}</p></div></div>
        <div className="detail-categories">{stationCategories(detailStation).map((item) => <span key={item}>{categoryLabels[item]}</span>)}</div>
        <section className="known-for"><h3>{detailWebsiteProfile?.profile?.description ? "About this station" : "Known for"}</h3><p>{detailWebsiteProfile?.profile?.description ?? stationKnownFor(detailStation)}</p>{detailWebsiteProfile?.loading && <small>Checking the station website for a fuller description…</small>}{detailWebsiteProfile?.profile?.description && <small>From {detailWebsiteProfile.profile.siteName || detailStation.name} website</small>}{stationCategories(detailStation).includes("sports") && <div className="sports-note"><strong>Live game coverage is not verified</strong><span>The directory identifies this as sports radio, but NFL and other event rights vary by schedule and listener location. Check the broadcaster before kickoff.</span></div>}</section>
        <div className="detail-actions"><button className="detail-play" type="button" disabled={!detailStation.isVerified} onClick={() => { setDetailStation(null); void playStation(detailStation); }}><PlayIcon />Listen live</button>{detailStation.homepage && <a href={detailStation.homepage} rel="noreferrer" target="_blank">Visit station website <ExternalLink aria-hidden="true" size={15} /></a>}</div>
        <dl className="station-facts"><div><dt>Language</dt><dd>{displayLanguage(detailStation.language)}</dd></div><div><dt>Audio format</dt><dd>{detailStation.codec || "Unknown format"}{detailStation.bitrate ? ` · ${detailStation.bitrate} kbps` : ""}{detailStation.hasHls ? " · HLS" : ""}</dd></div><div><dt>Available streams</dt><dd>{detailStation.sourceCount || 1}{(detailStation.sourceCount || 1) > 1 ? " sources grouped; the best compatible source is selected and alternates are tried automatically" : " community directory stream"}</dd></div><div><dt>Last stream check</dt><dd>{detailStation.lastCheckedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(detailStation.lastCheckedAt)) : detailStation.isVerified ? "Passed; date not supplied" : "Recent check failed"}</dd></div></dl>
        <p className="data-note">StationHarbor summarizes community directory metadata. For current programmes and live sports schedules, visit the station website. Availability can vary by location and broadcast rights.</p>
      </section></div>}

      {selectedStation && isPlayerOpen && (
        <div className="player-screen" role="dialog" aria-modal="true" aria-label="Now playing">
          <button className="player-close" type="button" aria-label="Minimize now playing" onClick={() => setIsPlayerOpen(false)}><ChevronDown aria-hidden="true" /></button>
          <StationArtwork className="player-cover" station={selectedStation} />
          <div className="now-playing-copy"><p className="eyebrow">LIVE RADIO</p><h2>{selectedStation.name}</h2><p className="player-description">{selectedWebsiteProfile?.description ?? stationKnownFor(selectedStation)}</p>{!selectedWebsiteProfile?.description && <div className="detail-categories">{stationCategories(selectedStation).slice(0, 3).map((item) => <span key={item}>{categoryLabels[item]}</span>)}</div>}</div>
          <div className="player-actions"><button className={`favorite-button ${favorites.some((favorite) => favorite.id === selectedStation.id) ? "is-favorite" : ""}`} aria-pressed={favorites.some((favorite) => favorite.id === selectedStation.id)} type="button" aria-label="Favorite current station" onClick={() => favoriteStation(selectedStation)}><Star aria-hidden="true" fill={favorites.some((favorite) => favorite.id === selectedStation.id) ? "currentColor" : "none"} /></button><button className={`player-main-button ${playbackState === "buffering" ? "is-buffering" : ""}`} type="button" aria-label={`${playbackState === "buffering" ? "Connecting to" : isPlaying ? "Pause" : "Resume"} ${selectedStation.name}`} onClick={togglePlayback}>{playbackState === "buffering" ? <span className="buffer-spinner" /> : isPlaying ? <PauseIcon /> : <PlayIcon />}</button><button className="player-info-button" type="button" aria-label={`Station information for ${selectedStation.name}`} onClick={() => { setIsPlayerOpen(false); openStationDetails(selectedStation); }}><Info aria-hidden="true" /></button></div>
          <p className="playback-status" aria-live="polite"><span>{playbackState === "buffering" ? sourceIndex > 0 ? `Connecting to alternate stream ${sourceIndex + 1}…` : "Connecting to live audio…" : isPlaying ? "Playing live" : playbackState === "paused" ? "Paused" : playbackState === "error" ? "Playback stopped" : "Ready"}</span>{currentSource ? ` · ${currentSource.codec}${currentSource.bitrate ? ` ${currentSource.bitrate} kbps` : ""}` : ""}</p>
          {playerError && <p className="player-error" role="alert">{playerError}</p>}
          {stationCategories(selectedStation).includes("sports") && <p className="timeline-note">Sports station; live game coverage is not confirmed by the directory.{selectedStation.homepage && <> <a href={selectedStation.homepage} rel="noreferrer" target="_blank">Check station schedule</a>.</>}</p>}
          <details className="sleep-timer"><summary><Clock3 aria-hidden="true" size={15} />Sleep timer{sleepDeadline ? ` · ${Math.ceil(secondsLeft / 60)} min` : ""}</summary><div className="timer-controls">{[5, 10, 15, 30, 45, 60].map((minutes) => <button className="quiet-button" key={minutes} type="button" onClick={() => startSleepTimer(minutes)}>{minutes}m</button>)}<input aria-label="Custom sleep timer minutes" inputMode="numeric" min="1" onChange={(event) => setCustomMinutes(event.target.value)} placeholder="Custom" type="number" value={customMinutes} /><button className="quiet-button" type="button" onClick={() => { const minutes = Number(customMinutes); if (minutes > 0) startSleepTimer(minutes); }}>Set</button></div></details>
        </div>
      )}

      {selectedStation && !isPlayerOpen && (
        <div className="mini-player" role="region" aria-label="Mini player">
          <button className="mini-reopen" type="button" aria-label={`Open now playing for ${selectedStation.name}`} onClick={() => setIsPlayerOpen(true)}><StationArtwork className="mini-art" station={selectedStation} /><span className="mini-copy"><strong>{selectedStation.name}</strong><small>{playbackState === "buffering" ? "Connecting…" : isPlaying ? "Playing live" : "Paused"} · {categoryLabels[stationCategories(selectedStation)[0] ?? "all"]}</small></span></button>
          <button className="mini-play" type="button" aria-label={`${isPlaying ? "Pause" : "Resume"} mini player`} onClick={togglePlayback}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button>
        </div>
      )}
    </section>
  );
}
