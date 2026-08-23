import Link from "next/link";
import { StationBrowser } from "@/components/station-browser";

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

      <StationBrowser />

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
