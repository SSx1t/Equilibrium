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
await page.waitForTimeout(2500);

// Select a district via the dropdown
const select = page.locator("aside select").first();
await select.selectOption({ index: 1 });
await page.waitForTimeout(1200);

const body1 = (await page.textContent("body")) ?? "";
const hasGapBadge = /Gap \d+\/100/.test(body1);
const hasSupply = body1.includes("Current supply");
const hasSimConsole =
  body1.includes("Simulation") && /experimental/i.test(body1);

// Switch to Investor mode (header)
await page.getByRole("button", { name: "investor", exact: true }).first().click();
await page.waitForTimeout(1000);
const hasInvestment = ((await page.textContent("body")) ?? "").includes(
  "Investment outlook (ML)"
);

// Place a pin: pick healthcare in the sim console, click the map
const placeBtns = page.getByRole("button", { name: "healthcare", exact: true });
let placedPin = false;
if ((await placeBtns.count()) > 0) {
  await placeBtns.last().click();
  await page.waitForTimeout(300);
  const box = await page.locator(".leaflet-container").boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
    await page.waitForTimeout(1200);
  }
  placedPin = (await page.locator("path.leaflet-interactive").count()) > 0;
}

// Back to planner for a clean shot, light mode screenshot
await page.getByRole("button", { name: "planner", exact: true }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/workspace/frontend/smoke-light.png" });

// Toggle to dark mode
await page.getByRole("button", { name: "Toggle theme" }).click();
await page.waitForTimeout(1200);
const themeAttr = await page.evaluate(() =>
  document.documentElement.getAttribute("data-theme")
);
await page.getByRole("button", { name: "investor", exact: true }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/workspace/frontend/smoke-dark.png" });

console.log(
  JSON.stringify(
    {
      hasGapBadge,
      hasSupply,
      hasSimConsole,
      hasInvestment,
      placedPin,
      darkThemeApplied: themeAttr === "dark",
      consoleErrors: errors,
    },
    null,
    2
  )
);
await browser.close();
if (errors.length) process.exit(2);
