# StationHarbor

Dark-first, iPhone-first live radio PWA for Sweden, Denmark, United Kingdom, and United States. Country coverage can expand without changing product identity.

## Status

Active development. The directory, canonical stream grouping, playback with bounded fallback, favorites, sleep timer, station profiles, PWA shell, and Docker deployment are working.

## Stack

Next.js, React, TypeScript, Tailwind CSS, Bun, Vitest, Playwright, Dexie, Zustand, and Radio Browser directory data.

## Local development

```bash
bun install
bun run dev
bun run test
bun run lint
bun run build
```

## Radio data and playback limits

Station metadata comes from Radio Browser, a community-run service. Directory availability, stream availability, current programmes, and sports rights are not guaranteed. Compatible duplicate sources are grouped and ranked automatically. This self-hosted deployment has a narrowly validated relay for HTTP-only directory streams; direct HTTPS remains preferred.

When a station has an HTTPS homepage, the details sheet can fetch a bounded, cached page description through the station-profile endpoint. The endpoint resolves the station UUID through Radio Browser, rejects private/reserved network targets, validates redirects, and caps response size. Programme and live-event claims still require the broadcaster's schedule.

iPhone background audio and AirPlay routing are controlled by iOS/WebKit. Physical-device validation is required before release.

## License

MIT. See [LICENSE](LICENSE).
