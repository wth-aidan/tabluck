import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const out = "/home/claude/webapp/tests/shots"; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const shot = async (name, full = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
await page.goto("http://localhost:8080/", { waitUntil: "networkidle" });
await shot("01_home");
await page.click(".runform input"); console.log("focus fills:", await page.inputValue(".runform input"));
await page.click("[data-ex='1']"); console.log("try fills:", await page.inputValue(".runform input"), "| still home:", await page.evaluate(() => location.hash || "#/"));
console.log("offline links gone:", (await page.$$("[data-sample]")).length === 0);
const t0 = Date.now();
await page.goto("http://localhost:8080/#/sample/0");
await page.waitForSelector(".report", { timeout: 60000 });
console.log("oxford sample analysed in", (Date.now() - t0) / 1000, "s");
await shot("02_luck_top");
await page.screenshot({ path: `${out}/03_luck_full.png`, fullPage: true });
for (const k of ["draw", "room"]) {
  await page.goto(`http://localhost:8080/#/report/${k}`); await page.waitForSelector(".report");
  await page.screenshot({ path: `${out}/04_${k}_full.png`, fullPage: true });
}
// team drawer via click
await page.goto("http://localhost:8080/#/report/luck"); await page.waitForSelector(".report");
await page.click("#s-luck-break tbody tr[data-i]");
await page.waitForSelector("#drawer.open"); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05_team.png` });
const tpH = await page.$eval("#drawer", (d) => d.scrollHeight);
console.log("drawer hash", await page.evaluate(() => location.hash), "drawer height", tpH);
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
console.log("after escape hash", await page.evaluate(() => location.hash));
// AI link from a slide goes to limitations subsection
await page.click("#s-luck-title .slink.ai");
await page.waitForTimeout(600);
console.log("ai link ->", await page.evaluate(() => location.hash), "visible:", await page.evaluate(() => { const r = document.getElementById("how-limits-luck").getBoundingClientRect(); return Math.round(r.top); }));
await shot("06_how_limits");
// threshold change
await page.goto("http://localhost:8080/#/report/luck"); await page.waitForSelector(".report");
const before = await page.$$eval("#s-luck-all .pill.tone-mid", (x) => x.length);
await page.$eval(".thr input[type=range]", (i) => { i.value = "1.0"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new Event("change")); });
await page.waitForTimeout(300);
const after = await page.$$eval("#s-luck-all .pill.tone-mid", (x) => x.length);
console.log("neutral count before/after threshold change:", before, after);
// search
await page.fill("#s-luck-all .dt-search", "harvard");
console.log("search rows:", await page.$$eval("#s-luck-all tbody tr[data-i]", (r) => r.length));
// pptx downloads
for (const k of ["luck", "draw", "room"]) {
  await page.goto(`http://localhost:8080/#/report/${k}`); await page.waitForSelector(".report");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click(".rtools .btn:not(.ghost)")]);
  const p = `${out}/${k}.pptx`; await dl.saveAs(p); console.log("downloaded", k, fs.statSync(p).size, "bytes");
}
// how page top and mobile view
await page.goto("http://localhost:8080/#/how"); await page.waitForTimeout(300); await shot("07_how");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://localhost:8080/#/report/luck"); await page.waitForSelector(".report"); await shot("08_mobile_luck");
await page.goto("http://localhost:8080/#/"); await page.waitForTimeout(300); await shot("09_mobile_home");
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
