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
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">LIVE RADIO DIRECTORY</p>
        <h1 id="page-title">Live radio, everywhere</h1>
        <p className="intro">Find a station. Press play. Keep it close.</p>
      </section>

      <StationBrowser />

    </main>
  );
}
