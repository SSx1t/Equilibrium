import { chromium } from "playwright";

const URL = "http://localhost:3000/";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
// Wait for districts to load into the rankings/map
await page.waitForTimeout(2500);

// Switch to rankings tab and read district count text
await page.getByRole("button", { name: "rankings", exact: false }).click();
await page.waitForTimeout(500);
const rankingsText = await page.textContent("body");
const hasDistricts = /\d+ districts/.test(rankingsText ?? "");

// Click the first ranked district
const firstItem = page.locator("aside ul li button").first();
await firstItem.click();
await page.waitForTimeout(1200);

// Check detail panel shows a Gap Score
const bodyText = (await page.textContent("body")) ?? "";
const hasGapScore = bodyText.includes("Gap Score");

// Move population slider to trigger a simulate call
const slider = page.locator('input[type="range"]').first();
if ((await slider.count()) > 0) {
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
}
const hasWhatIf = ((await page.textContent("body")) ?? "").includes("WHAT-IF");

await page.screenshot({ path: "/workspace/frontend/smoke.png", fullPage: false });

console.log(JSON.stringify(
  {
    hasDistricts,
    hasGapScore,
    hasWhatIf,
    consoleErrors: errors,
  },
  null,
  2
));
await browser.close();
if (errors.length) process.exit(2);
