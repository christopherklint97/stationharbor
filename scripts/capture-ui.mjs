import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 1000 } })) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://127.0.0.1:3004", { waitUntil: "networkidle" });
  await page.locator(".station-card").first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: `/tmp/stationharbor-${name}-after.png`, fullPage: true });
  console.log(`${name}: ${await page.locator(".station-card").count()} cards`);
  await page.close();
}
await browser.close();
