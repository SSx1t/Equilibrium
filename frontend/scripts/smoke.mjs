import { chromium } from "playwright";
import fs from "fs";

const URL = "http://localhost:3000/";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2500);

// Pick a mid-range district so changes are visible
await page.locator("aside select").first().selectOption({ label: "Danet Abu Dhabi" });
await page.waitForTimeout(1200);

// sim panel theme: in light mode the sim card should NOT be the old hardcoded navy.
// (We just check no console errors + it renders.)
const hasSimConsole =
  ((await page.textContent("aside")) ?? "").includes("Simulation");

// Generate a planner briefing and check it renders formatted (not raw **)
await page.getByRole("button", { name: "Generate planner briefing" }).click();
await page.waitForTimeout(9000);
const briefHtml = (await page.locator(".md-content").first().innerHTML().catch(() => "")) || "";
const briefingFormatted = briefHtml.includes("<strong") || briefHtml.includes("<li") || briefHtml.includes("<h");
const noRawStars = !((await page.locator(".md-content").first().textContent().catch(() => "")) || "").includes("**");

// light analysis screenshot
await page.screenshot({ path: "/workspace/frontend/smoke-light.png" });

// Reports tab -> generate + add AI + download PDF
await page.getByRole("button", { name: "reports", exact: false }).click();
await page.waitForTimeout(2000);
const reportsLoaded = ((await page.textContent("body")) ?? "").includes("Reports & Briefings");

// investor report type
await page.getByRole("button", { name: "investor", exact: true }).first().click();
await page.waitForTimeout(1500);

let pdfOk = false;
try {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: /Download PDF/i }).click(),
  ]);
  const path = "/workspace/frontend/test-report.pdf";
  await dl.saveAs(path);
  pdfOk = fs.existsSync(path) && fs.statSync(path).size > 1000;
} catch (e) {
  errors.push("pdf: " + e.message);
}
await page.screenshot({ path: "/workspace/frontend/smoke-reports.png" });

// dark mode screenshot on analysis
await page.getByRole("button", { name: "analysis", exact: false }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Toggle theme" }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "/workspace/frontend/smoke-dark.png" });

console.log(
  JSON.stringify(
    {
      hasSimConsole,
      briefingFormatted,
      noRawStars,
      reportsLoaded,
      pdfOk,
      consoleErrors: errors,
    },
    null,
    2
  )
);
await browser.close();
if (errors.length) process.exit(2);
