# StationHarbor

Dark-first, iPhone-first live radio PWA for Sweden, Denmark, United Kingdom, and United States. Country coverage can expand without changing product identity.

## Status

Early development. Landing UI and Bun test/build baseline are working; station directory, playback, favorites, sleep timer, install flow, and Docker deployment follow.

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

Station metadata comes from Radio Browser, a community-run service. Directory availability and individual stream availability are not guaranteed. A secure HTTPS PWA cannot play plain HTTP streams due to browser mixed-content rules. StationHarbor will clearly show stream failures and will not proxy third-party streams in v1.

iPhone background audio and AirPlay routing are controlled by iOS/WebKit. Physical-device validation is required before release.

## License

MIT. See [LICENSE](LICENSE).
