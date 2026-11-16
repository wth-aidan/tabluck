import worker from "../worker/worker.js";
let calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push(url);
  const mk = (body, finalUrl) => { const r = new Response(body, { status: 200, headers: { "Content-Type": "text/html" } }); Object.defineProperty(r, "url", { value: finalUrl }); return r; };
  if (url.includes("redirect-out")) return mk("x", "https://evil.example.com/");
  return mk("<html>ok</html>", url.replace(/\/$/, "/_/"));
};
const req = (u, o = {}) => new Request("https://relay.test/?url=" + encodeURIComponent(u), o);
const cases = [
  ["allowed calicotab", req("https://oxfordiv26.calicotab.com/"), 200],
  ["other host blocked", req("https://example.com/"), 403],
  ["http blocked", req("http://oxfordiv26.calicotab.com/"), 400],
  ["lookalike host blocked", req("https://calicotab.com.evil.com/"), 403],
  ["suffix trick blocked", req("https://evilcalicotab.com/"), 403],
  ["credentials blocked", req("https://user:pw@x.calicotab.com/"), 400],
  ["POST blocked", req("https://x.calicotab.com/", { method: "POST", body: "a" }), 405],
  ["redirect off-site blocked", req("https://x.calicotab.com/redirect-out"), 403],
  ["missing url", new Request("https://relay.test/"), 400],
];
let ok = true;
for (const [name, r, want] of cases) {
  const res = await worker.fetch(r, {});
  const pass = res.status === want;
  ok &&= pass;
  console.log(pass ? "PASS" : "FAIL", name, res.status, res.headers.get("Access-Control-Allow-Origin"));
}
// origin restriction
const env = { SITE_ORIGINS: "https://tab-luck.pages.dev" };
const r1 = await worker.fetch(req("https://a.calicotab.com/", { headers: { Origin: "https://tab-luck.pages.dev" } }), env);
const r2 = await worker.fetch(req("https://a.calicotab.com/", { headers: { Origin: "https://other.site" } }), env);
console.log(r1.status === 200 && r1.headers.get("Access-Control-Allow-Origin") === "https://tab-luck.pages.dev" ? "PASS" : "FAIL", "allowed origin", r1.status);
console.log(r2.status === 403 ? "PASS" : "FAIL", "foreign origin refused", r2.status);
const r3 = await worker.fetch(req("https://oxfordiv26.calicotab.com/"), {});
console.log(r3.headers.get("X-Final-Url") === "https://oxfordiv26.calicotab.com/_/" ? "PASS" : "FAIL", "final url exposed", r3.headers.get("X-Final-Url"));
