import Link from "next/link";

const countries = ["Sweden", "Denmark", "United Kingdom", "United States"];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="StationHarbor home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>StationHarbor</span>
        </Link>
        <button className="quiet-button" type="button">Favorites</button>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">LIVE RADIO DIRECTORY</p>
        <h1 id="page-title">Live radio, everywhere</h1>
        <p className="intro">Find a station. Press play. Keep it close.</p>
      </section>

      <section className="discovery" aria-label="Discover stations">
        <label className="search-label" htmlFor="station-search">Search stations</label>
        <input
          id="station-search"
          className="search-input"
          type="search"
          placeholder="Name, genre, city, language…"
        />
        <div className="country-list" aria-label="Country filter">
          {countries.map((country) => (
            <button className="country-chip" key={country} type="button">
              {country}
            </button>
          ))}
        </div>
      </section>

      <section className="station-section" aria-labelledby="popular-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">START HERE</p>
            <h2 id="popular-title">Popular near you</h2>
          </div>
          <button className="quiet-button" type="button">Filters</button>
        </div>
        <div className="loading-card" role="status">
          Stations loading soon. Your live directory will appear here.
        </div>
      </section>

      <aside className="player" aria-label="Player">
        <div className="player-art" aria-hidden="true">♫</div>
        <div className="player-copy">
          <strong>Choose a station</strong>
          <span>Ready for live radio</span>
        </div>
        <button className="play-button" type="button" aria-label="Play selected station">▶</button>
      </aside>
    </main>
  );
}
