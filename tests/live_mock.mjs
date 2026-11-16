// End-to-end test of the live path with a fake tab site behind a fake relay.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import fs from "fs";
const ds = JSON.parse(fs.readFileSync("tests/fixture_oxf.json"));
const HOST = "https://mockiv.calicotab.com";
const ids = new Map(ds.teams.map((t, k) => [t.id, String(1000 + k)]));
const ent = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
const SIDE = ["og", "oo", "cg", "co"], PL = ["", "1st", "2nd", "3rd", "4th"];
const api = {
  "/api/v1/tournaments": [{ slug: "_", name: "Mock Intervarsity", short_name: "Mock IV" }],
  "/api/v1/tournaments/_/rounds": [...ds.rounds.map((r, k) => ({ seq: k + 1, name: r.name, abbreviation: `R${k + 1}`, stage: "P", completed: true })), { seq: 9, name: "Grand Final", abbreviation: "GF", stage: "E", completed: true }],
  "/api/v1/tournaments/_/break-categories": [{ name: "Open", break_size: 16, is_general: true }, { name: "ESL", break_size: 4, is_general: false }],
  "/api/v1/tournaments/_/teams": ds.teams.map((t) => ({ id: +ids.get(t.id), short_name: t.name, long_name: t.name + " (long)" })),
  "/api/v1/tournaments/_/motions": [{ text: "This House would test the mock", rounds: [{ round: `${HOST}/api/v1/tournaments/_/rounds/1` }] }],
};
ds.rounds.forEach((r, k) => { api[`/api/v1/tournaments/_/rounds/${k + 1}/pairings`] = r.rooms.map((room) => ({ teams: room.map((id, s) => ({ team: `${HOST}/api/v1/tournaments/_/teams/${ids.get(id)}`, side: SIDE[s] })) })); });
const roomOf = ds.rounds.map((r) => { const m = new Map(); r.rooms.forEach((room) => room.forEach((id) => m.set(id, room))); return m; });
const rows = ds.teams.map((t) => [
  { text: t.rank }, { text: ent(t.name), popover: { title: ent(t.name + " (long)") } }, { text: (t.cats || []).join(", ") },
  ...t.results.map((p, r) => p ? { text: PL[p], subtext: String(t.spk[r].sum), popover: { content: [{ text: "Teams in debate:<br />" + roomOf[r].get(t.id).map((o, s) => (o === t.id ? `<strong>${ent(o)} (${SIDE[s].toUpperCase()})</strong>` : `${ent(o)} (${SIDE[s].toUpperCase()})`)).join("<br />") }, { text: "x" }] } } : { text: "—" }),
  { text: String(t.results.reduce((a, p) => a + (p ? 4 - p : 0), 0)) }, { text: t.spkTotal == null ? "—" : String(t.spkTotal) },
]);
const head = ["Rk", "team", "categories", "R1", "R2", "R3", "R4", "R5", "Pts", "Spk"].map((key) => ({ key }));
const teamTab = `<html><head><title>Mock IV | Team Tab</title></head><body><script>
  // Set table data as a global from template variable
  window.vueData = { tablesData: ${JSON.stringify([{ head, data: rows }])} };</script></body></html>`;
const served = [];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.route("**/config.js", (route) => route.fulfill({ contentType: "text/javascript", body: `export const RELAY_URL = "https://relay.mock.test/"; export const RUNS = 10000;` }));
await page.route("https://relay.mock.test/**", (route) => {
  const target = new URL(new URL(route.request().url()).searchParams.get("url"));
  served.push(target.pathname);
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Final-Url", "X-Final-Url": target.toString() };
  if (api[target.pathname.replace(/\/$/, "")]) return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(api[target.pathname.replace(/\/$/, "")]) });
  if (target.pathname === "/_/tab/team/") return route.fulfill({ status: 200, contentType: "text/html", headers, body: teamTab });
  return route.fulfill({ status: 404, headers, body: "not found" });
});
// share-link style entry: ?tab= auto-runs
await page.goto("http://localhost:8080/?tab=mockiv.calicotab.com#/report/room", { waitUntil: "load" });
await page.waitForSelector(".report", { timeout: 60000 });
console.log("landed on", await page.evaluate(() => location.hash), "| title:", await page.$eval(".rbar-title b", (b) => b.textContent));
console.log("requests through relay:", served.length, served.join(" "));
const res = await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem("tabluck:last")); return { motion: s.ds.rounds[0].motion, ucd: s.ds.teams.find((t) => t.name.startsWith("UCD L")).name, n: s.ds.teams.length, R: s.ds.rounds.length, breakSize: s.ds.breakSize, luck: s.result.model.teams.slice(0, 3).map((t) => [t.team, +t.total.toFixed(3)]), warn: s.ds.fetchWarnings }; });
console.log(JSON.stringify(res));
// multi-tournament host: chooser appears, picking one runs it
await page.unroute("https://relay.mock.test/**");
await page.route("https://relay.mock.test/**", (route) => {
  const target = new URL(new URL(route.request().url()).searchParams.get("url"));
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Final-Url", "X-Final-Url": target.toString() };
  const key = target.pathname.replace(/\/$/, "");
  if (key === "/api/v1/tournaments") return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify([{ slug: "_", name: "Mock Open" }, { slug: "masters", name: "Mock Masters" }]) });
  if (api[key]) return route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(api[key]) });
  if (target.pathname === "/_/tab/team/") return route.fulfill({ status: 200, contentType: "text/html", headers, body: teamTab });
  return route.fulfill({ status: 404, headers, body: "not found" });
});
await page.goto("http://localhost:8080/#/"); await page.fill(".runform input", "  Multi.calicotab.com  "); await page.click(".runform button");
await page.waitForSelector(".choose .btn", { timeout: 20000 });
console.log("chooser offers:", await page.$$eval(".choose .btn", (bs) => bs.map((b) => b.textContent).join(" | ")));
await page.click(".choose .btn >> text=Mock Open");
await page.waitForSelector(".report", { timeout: 60000 }); console.log("after choosing, report:", await page.$eval(".rbar-title b", (b) => b.textContent));
await page.unroute("https://relay.mock.test/**");
// error path: a tab site that isn't calicotab
await page.goto("http://localhost:8080/#/"); await page.fill(".runform input", "example.com"); await page.click(".runform button");
await page.waitForTimeout(300); console.log("bad host message:", await page.$eval(".err", (e) => e.textContent));
// error path: relay returns 404 for everything
await page.unroute("https://relay.mock.test/**");
await page.route("https://relay.mock.test/**", (route) => route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" }, body: "nope" }));
await page.goto("http://localhost:8080/#/"); await page.fill(".runform input", "nothing.calicotab.com"); await page.click(".runform button");
await page.waitForSelector(".pcard .err", { timeout: 20000 }); console.log("missing tab message:", await page.$eval(".pcard .err", (e) => e.textContent));
console.log("ERRORS:", errors.filter((e) => !/404/.test(e)).length ? errors : "none (404s expected)");
await browser.close();
