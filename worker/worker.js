// Tab fetcher: a read-only relay that lets the site read public Tabbycat tab pages.
//
// GET /?url=<https://something.calicotab.com/...>
//   - only https, only allowed hosts (calicotab by default), only GET
//   - follows redirects but re-checks the final host
//   - caches each page for an hour so repeated analyses don't load the tab site again
//   - adds CORS headers so the site's page is allowed to read the reply
//
// Settings (Cloudflare dashboard -> Worker -> Settings -> Variables), all optional:
//   SITE_ORIGINS   comma-separated origins allowed to use this relay, e.g. https://tab-luck.pages.dev
//                  (unset = any origin; set it once your site is live)
//   EXTRA_HOSTS    comma-separated extra Tabbycat hostnames to allow, e.g. tabbycat.myleague.org
//   CACHE_SECONDS  default 3600

const MAX_BYTES = 15 * 1024 * 1024;

function hostAllowed(host, env) {
  host = host.toLowerCase();
  if (host === "calicotab.com" || host.endsWith(".calicotab.com")) return true;
  const extra = (env.EXTRA_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return extra.includes(host);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.SITE_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  const h = new Headers();
  if (!allowed.length) h.set("Access-Control-Allow-Origin", "*");
  else if (allowed.includes(origin)) { h.set("Access-Control-Allow-Origin", origin); h.set("Vary", "Origin"); }
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Accept");
  h.set("Access-Control-Expose-Headers", "X-Final-Url, X-Cache");
  return h;
}

function reply(status, body, request, env, extra = {}) {
  const h = corsHeaders(request, env);
  h.set("Content-Type", "application/json; charset=utf-8");
  Object.entries(extra).forEach(([k, v]) => h.set(k, v));
  return new Response(JSON.stringify(body), { status, headers: h });
}

export default {
  async fetch(request, env = {}, ctx = { waitUntil() {} }) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (request.method !== "GET") return reply(405, { error: "Only GET is supported." }, request, env);

    const allowedOrigins = (env.SITE_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
    const origin = request.headers.get("Origin");
    if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) return reply(403, { error: "Origin not allowed." }, request, env);

    const self = new URL(request.url);
    const raw = self.searchParams.get("url");
    if (!raw) return reply(400, { error: "Pass the page to fetch as ?url=..." }, request, env);
    let target;
    try { target = new URL(raw); } catch { return reply(400, { error: "That is not a valid URL." }, request, env); }
    if (target.protocol !== "https:") return reply(400, { error: "Only https tab sites are supported." }, request, env);
    if (target.username || target.password || target.port) return reply(400, { error: "URL not allowed." }, request, env);
    if (!hostAllowed(target.hostname, env)) return reply(403, { error: `Host not allowed: ${target.hostname}. Only Tabbycat tab sites on calicotab.com are supported.` }, request, env);
    target.hash = "";

    const ttl = parseInt(env.CACHE_SECONDS || "3600", 10);
    const cache = typeof caches !== "undefined" ? caches.default : null;
    const cacheKey = new Request("https://tab-cache.invalid/" + encodeURIComponent(target.toString()));
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const h = corsHeaders(request, env);
        hit.headers.forEach((v, k) => { if (!k.toLowerCase().startsWith("access-control")) h.set(k, v); });
        h.set("X-Cache", "HIT");
        return new Response(hit.body, { status: hit.status, headers: h });
      }
    }

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "tab-luck-analyser (read-only; caches results)", Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      });
    } catch (e) {
      return reply(502, { error: "Could not reach the tab site." }, request, env);
    }
    const finalUrl = new URL(upstream.url || target.toString());
    if (!hostAllowed(finalUrl.hostname, env)) return reply(403, { error: "The tab site redirected somewhere that is not allowed." }, request, env);
    const len = parseInt(upstream.headers.get("Content-Length") || "0", 10);
    if (len > MAX_BYTES) return reply(413, { error: "Page too large." }, request, env);
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return reply(413, { error: "Page too large." }, request, env);

    const h = corsHeaders(request, env);
    h.set("Content-Type", upstream.headers.get("Content-Type") || "text/html; charset=utf-8");
    h.set("X-Final-Url", finalUrl.toString());
    h.set("X-Cache", "MISS");
    h.set("Cache-Control", `public, max-age=${ttl}`);
    const res = new Response(buf, { status: upstream.status, headers: h });
    if (cache && upstream.status === 200) {
      const store = new Response(buf, { status: 200, headers: { "Content-Type": h.get("Content-Type"), "X-Final-Url": finalUrl.toString(), "Cache-Control": `public, max-age=${ttl}` } });
      ctx.waitUntil(cache.put(cacheKey, store));
    }
    return res;
  },
};
