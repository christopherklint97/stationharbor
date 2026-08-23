import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of [['iphone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 1000 }]]) {
  const page = await browser.newPage({ viewport });
  await page.goto('http://127.0.0.1:3004', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/stationharbor-${name}.png`, fullPage: true });
  console.log(name, await page.title(), await page.locator('.station-card').count());
}
await browser.close();
