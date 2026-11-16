// Fetches a Tabbycat tournament through the relay and turns it into the engine's dataset.
//
// Sources (about a dozen requests per tournament):
//   API  /api/v1/tournaments, .../rounds, .../break-categories, .../teams, .../rounds/N/pairings, .../motions
//   Page /{slug}/tab/team/  -> per-round placings, per-round team speaker totals, official ranks
// Fallbacks: no team tab -> results from the API ballots; no API -> draws rebuilt from the team tab.

const PLACE = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
const SIDES = ["og", "oo", "cg", "co"];

export function decodeEntities(s) {
  if (s == null) return s;
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
const stripTags = (s) => decodeEntities(String(s || "").replace(/<[^>]*>/g, "")).trim();

// Pull `tablesData: [...]` out of a Tabbycat page's inline script
export function extractTables(html) {
  // the data lives in an inline script: window.vueData = { tablesData: [ ... ] }
  // ("tablesData" can also appear earlier as a template attribute, so match the assignment itself)
  const re = /tablesData\s*:\s*\[/g;
  let m, start = -1;
  const vd = html.indexOf("vueData");
  re.lastIndex = vd >= 0 ? vd : 0;
  if ((m = re.exec(html))) start = m.index + m[0].length - 1;
  if (start < 0) { re.lastIndex = 0; if ((m = re.exec(html))) start = m.index + m[0].length - 1; }
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

export function parseTabInput(input) {
  let s = String(input || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().replace(/^[<"'(\[]+|[>"')\],;.]+$/g, "").trim();
  if (!s) throw new Error("Paste the address of a tab site, e.g. oxfordiv26.calicotab.com");
  if (/\s/.test(s)) throw new Error("That address has spaces in it. Paste just the tab site's address, e.g. oxfordiv26.calicotab.com");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { throw new Error("That doesn't look like a web address."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("That doesn't look like a web address.");
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "calicotab.com" || host === "www.calicotab.com") throw new Error("That's calicotab's home page. Paste the tournament's own address, e.g. oxfordiv26.calicotab.com");
  if (!(host === "calicotab.com" || host.endsWith(".calicotab.com"))) throw new Error(`Only Tabbycat tab sites on calicotab.com are supported for now (got ${host}).`);
  const seg = u.pathname.split("/").filter(Boolean)[0] || null;
  return { origin: `https://${host}`, host, pathSlug: seg };
}

// Team-tab table -> rows keyed by team name
export function parseTeamTab(tables, roundAbbrs = null) {
  const tb = (tables || []).find((t) => (t.head || []).some((h) => (h.key || "").toLowerCase() === "team"));
  if (!tb) return null;
  const keys = tb.head.map((h) => h.key || h.title || "");
  const col = (name) => keys.findIndex((k) => k.toLowerCase() === name.toLowerCase());
  const rk = col("Rk"), tm = col("team"), cat = col("categories"), spk = col("Spk"), ptsC = col("Pts");
  let roundCols = [];
  if (roundAbbrs && roundAbbrs.length) {
    roundAbbrs.forEach((a) => { const i = keys.findIndex((k) => k.toLowerCase() === String(a).toLowerCase()); if (i >= 0) roundCols.push([keys[i], i]); });
    if (roundCols.length !== roundAbbrs.length) roundCols = [];
  }
  if (!roundCols.length) roundCols = keys.map((k, i) => [k, i]).filter(([k]) => /^R\d+$/i.test(k));
  if (!roundCols.length) {
    // last resort: columns whose cells are mostly placings
    roundCols = keys.map((k, i) => [k, i]).filter(([, i]) => {
      const vals = tb.data.slice(0, 30).map((r) => stripTags(r[i] && r[i].text));
      return vals.filter((v) => PLACE[v]).length >= vals.length * 0.5;
    });
  }
  const rows = tb.data.map((r) => {
    const name = stripTags(r[tm] && r[tm].text);
    const longName = r[tm] && r[tm].popover && r[tm].popover.title ? stripTags(r[tm].popover.title) : name;
    // the team's record link carries the same numeric id the API draws use
    const link = ((r[tm] && r[tm].popover && r[tm].popover.content) || []).map((x) => x.link || "").find((l) => /participants\/team\/\d+/.test(l));
    const teamId = link ? link.match(/participants\/team\/(\d+)/)[1] : null;
    const rounds = roundCols.map(([k, i]) => {
      const c = r[i] || {};
      const txt = stripTags(c.text);
      const place = PLACE[txt] || null;
      const spkV = c.subtext != null && c.subtext !== "" ? parseFloat(stripTags(c.subtext)) : null;
      let room = null;
      const pc = c.popover && c.popover.content && c.popover.content[0] && c.popover.content[0].text;
      if (pc && /Teams in debate/i.test(pc)) {
        room = pc.split(/<br\s*\/?>/i).slice(1).map((line) => {
          const m = stripTags(line).match(/^(.*)\s+\((OG|OO|CG|CO)\)\s*$/i);
          return m ? { name: m[1].trim(), side: m[2].toLowerCase() } : null;
        }).filter(Boolean);
      }
      return { key: k, place, spk: Number.isFinite(spkV) ? spkV : null, room };
    });
    const spkTot = spk >= 0 ? parseFloat(stripTags(r[spk] && r[spk].text)) : NaN;
    return {
      name, longName, teamId, rank: stripTags(r[rk] && r[rk].text),
      cats: cat >= 0 ? stripTags(r[cat] && r[cat].text).split(",").map((x) => x.trim()).filter(Boolean) : [],
      rounds, spkTotal: Number.isFinite(spkTot) ? spkTot : null,
      pts: ptsC >= 0 ? parseFloat(stripTags(r[ptsC] && r[ptsC].text)) : null,
    };
  });
  return { roundKeys: roundCols.map(([k]) => k), rows };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// relayGet(url) -> { status, text, finalUrl }
export async function fetchTournament(input, relayGet, { onStep = () => {}, choose = null } = {}) {
  const site = parseTabInput(input);
  const warnings = [];
  const getJSON = async (url) => {
    const r = await relayGet(url);
    if (r.status !== 200) return null;
    try { return JSON.parse(r.text); } catch { return null; }
  };

  onStep("Finding the tournament");
  const list = await getJSON(`${site.origin}/api/v1/tournaments`);
  let slug = site.pathSlug, name = null, api = !!(list && Array.isArray(list) && list.length);
  if (api) {
    let t = list.find((x) => x.slug === site.pathSlug);
    if (!t && list.length === 1) t = list[0];
    if (!t) {
      if (choose) t = await choose(list.map((x) => ({ slug: x.slug, name: x.name || x.short_name })));
      if (!t) throw new Error("This site hosts several tournaments. Paste the link to the one you want (it includes its name in the address).");
      t = list.find((x) => x.slug === t.slug) || t;
    }
    slug = t.slug; name = t.short_name || t.name;
  } else {
    warnings.push("The tab site's data API isn't available, so the draw is rebuilt from the team tab.");
    if (!slug) slug = "_";
  }
  const base = `${site.origin}/api/v1/tournaments/${slug}`;

  // rounds, break size, teams, motions
  let prelim = null, breakSize = 16, breakCats = [], teamsById = new Map(), motions = new Map();
  if (api) {
    onStep("Reading rounds and teams");
    const [rounds, bcs, teams, mot] = await Promise.all([getJSON(`${base}/rounds`), getJSON(`${base}/break-categories`), getJSON(`${base}/teams`), getJSON(`${base}/motions`)]);
    if (rounds) prelim = rounds.filter((r) => r.stage === "P" && r.completed !== false).sort((a, b) => a.seq - b.seq);
    if (rounds && !prelim.length) throw new Error("This tournament has no completed preliminary rounds yet.");
    if (bcs && bcs.length) {
      breakCats = bcs.map((b) => ({ name: b.name, size: b.break_size, general: !!b.is_general }));
      const g = bcs.find((b) => b.is_general) || bcs[0];
      if (g && g.break_size) breakSize = g.break_size;
    } else warnings.push("No break size published; assuming a 16-team break.");
    (teams || []).forEach((t) => teamsById.set(String(t.id), { id: String(t.id), name: decodeEntities(t.short_name), longName: decodeEntities(t.long_name || t.short_name) }));
    (mot || []).forEach((m) => (m.rounds || []).forEach((rr) => {
      const seq = parseInt(String(rr.round).split("/").filter(Boolean).pop(), 10);
      const txt = decodeEntities(m.text || m.reference || "");
      if (seq && txt) motions.set(seq, (motions.get(seq) ? motions.get(seq) + " / " : "") + txt);
    }));
  }

  onStep("Reading the team tab");
  const page = await relayGet(`${site.origin}/${slug}/tab/team/`);
  const tab = page.status === 200 ? parseTeamTab(extractTables(page.text), prelim ? prelim.map((r) => r.abbreviation) : null) : null;
  if (!tab && !api) {
    if (page.status === 404 || page.status >= 500 || !/tabbycat|calicotab/i.test(page.text || ""))
      throw new Error(`No Tabbycat tournament found at ${site.host}. Check the address (e.g. oxfordiv26.calicotab.com).`);
    throw new Error("Couldn't read this tournament: the team tab isn't public and the data API is off.");
  }
  if (!name) {
    const m = page.text && page.text.match(/<title>\s*([^|<]+)/i);
    name = m ? decodeEntities(m[1].trim()) : site.host;
  }

  // some tournaments keep the API team list private; the team tab's record links give the same ids
  if (api && !teamsById.size && tab && tab.rows.some((r) => r.teamId)) {
    tab.rows.forEach((r) => { if (r.teamId) teamsById.set(r.teamId, { id: r.teamId, name: r.name, longName: r.longName }); });
  }

  // draws
  onStep("Reading the draws");
  let roundsOut = [];
  let roomTeamIds = null; // per round: [[id x4]]
  if (api && prelim && prelim.length && teamsById.size) {
    const pairings = await pool(prelim, 3, (r) => getJSON(`${base}/rounds/${r.seq}/pairings`));
    roomTeamIds = pairings.map((ps, k) => {
      if (!ps) throw new Error(`Couldn't read the draw for ${prelim[k].name}.`);
      return ps.map((p) => {
        const bySide = {};
        (p.teams || []).forEach((x) => { bySide[x.side] = String(x.team).split("/").filter(Boolean).pop(); });
        if (!SIDES.every((s) => bySide[s])) {
          if ((p.teams || []).length === 2) throw new Error("This looks like a two-team format (e.g. Australs or WSDC). Only British Parliamentary is supported for now.");
          throw new Error(`${prelim[k].name} has a room without four teams; only British Parliamentary is supported.`);
        }
        return SIDES.map((s) => bySide[s]);
      });
    });
    roundsOut = prelim.map((r, k) => ({ name: r.name, abbr: r.abbreviation, seq: r.seq, motion: motions.get(r.seq) || "", rooms: roomTeamIds[k] }));
  }

  // results
  let teamRows; // [{id, name, longName, cats, rank, results, spk, spkTotal}]
  if (tab) {
    const nameToId = new Map();
    teamsById.forEach((t) => nameToId.set(t.name, t.id));
    const R = roundsOut.length || tab.roundKeys.length;
    if (roundsOut.length && tab.roundKeys.length !== roundsOut.length)
      warnings.push(`The team tab shows ${tab.roundKeys.length} rounds but ${roundsOut.length} preliminary rounds were found; using the first ${Math.min(R, tab.roundKeys.length)}.`);
    teamRows = tab.rows.map((row) => {
      let id = (row.teamId && teamsById.has(row.teamId)) ? row.teamId : nameToId.get(row.name);
      if (!id) { id = "name:" + row.name; if (teamsById.size) warnings.push(`${row.name} is on the team tab but not in the team list.`); }
      return {
        id, name: row.name, longName: (teamsById.get(id) || {}).longName || row.longName, cats: row.cats, rank: row.rank,
        results: Array.from({ length: R }, (_, r) => (row.rounds[r] ? row.rounds[r].place : null)),
        spk: Array.from({ length: R }, (_, r) => (row.rounds[r] && row.rounds[r].place ? { sum: row.rounds[r].spk || 0, n: row.rounds[r].spk != null ? 2 : 0 } : null)),
        spkTotal: row.spkTotal, _rounds: row.rounds,
      };
    });
    // no API draws: rebuild rooms from the team tab popovers
    if (!roundsOut.length) {
      if (api) warnings.push("The draw API wasn't readable, so the draw was rebuilt from the team tab.");
      const nameToRow = new Map(teamRows.map((t) => [t.name, t]));
      roundsOut = tab.roundKeys.map((k, r) => {
        const seen = new Set(), rooms = [];
        teamRows.forEach((t) => {
          const room = t._rounds[r] && t._rounds[r].room;
          if (!room || room.length !== 4) return;
          const key = room.map((x) => x.name).sort().join("|");
          if (seen.has(key)) return; seen.add(key);
          const bySide = {}; room.forEach((x) => (bySide[x.side] = x.name));
          if (!SIDES.every((s) => bySide[s] && nameToRow.has(bySide[s]))) return;
          rooms.push(SIDES.map((s) => nameToRow.get(bySide[s]).id));
        });
        const pr = prelim && prelim[r];
        return { name: pr ? pr.name : `Round ${r + 1}`, abbr: k, seq: pr ? pr.seq : r + 1, motion: pr ? motions.get(pr.seq) || "" : "", rooms };
      });
    }
    teamRows.forEach((t) => delete t._rounds);
    // teams in the draw but not on the tab (rare): add them with no results
    const known = new Set(teamRows.map((t) => t.id));
    roundsOut.forEach((rd) => rd.rooms.forEach((room) => room.forEach((id) => {
      if (!known.has(id)) {
        known.add(id);
        const t = teamsById.get(id) || { name: id, longName: id };
        teamRows.push({ id, name: t.name, longName: t.longName, cats: [], rank: "—", results: roundsOut.map(() => null), spk: roundsOut.map(() => null), spkTotal: null });
        warnings.push(`${t.name} is in the draw but not on the team tab; counted as an opponent only.`);
      }
    })));
  } else {
    // fallback: results from the API ballots (one request per room)
    warnings.push("The team tab isn't public, so results come from individual ballots and the ranking is rebuilt from points and speaks.");
    onStep("Reading ballots");
    const rec = new Map();
    teamsById.forEach((t) => rec.set(t.id, { ...t, cats: [], results: roundsOut.map(() => null), spk: roundsOut.map(() => null) }));
    for (let r = 0; r < prelim.length; r++) {
      const ps = await getJSON(`${base}/rounds/${prelim[r].seq}/pairings`);
      await pool(ps || [], 4, async (p) => {
        const bl = await getJSON(p._links && p._links.ballots ? p._links.ballots : `${p.url}/ballots`);
        const b = (bl || []).find((x) => x.confirmed !== false) || (bl || [])[0];
        const sheet = b && b.result && b.result.sheets && b.result.sheets[0];
        (sheet ? sheet.teams : []).forEach((x) => {
          const id = String(x.team).split("/").filter(Boolean).pop(), t = rec.get(id);
          if (!t || x.points == null) return;
          t.results[r] = 4 - x.points; t.spk[r] = { sum: x.score || 0, n: 2 };
        });
      });
    }
    teamRows = [...rec.values()].map((t) => ({ ...t, spkTotal: t.spk.reduce((a, s) => a + (s ? s.sum : 0), 0) }));
    teamRows.sort((a, b) => {
      const pa = a.results.reduce((s, v) => s + (v ? 4 - v : 0), 0), pb = b.results.reduce((s, v) => s + (v ? 4 - v : 0), 0);
      return pb - pa || b.spkTotal - a.spkTotal;
    });
    teamRows.forEach((t, k) => (t.rank = String(k + 1)));
  }

  // drop trailing rounds with no published results (draw out, results not yet)
  while (roundsOut.length && !teamRows.some((t) => t.results[roundsOut.length - 1])) {
    roundsOut.pop(); teamRows.forEach((t) => { t.results.pop(); t.spk.pop(); });
    warnings.push("Some rounds have a draw but no published results yet; they were left out.");
  }
  if (!teamRows.some((t) => t.results.some(Boolean))) throw new Error("This tournament hasn't published any results yet (the tab may not be released).");
  if (roundsOut.length < 2) throw new Error("At least two rounds with published results are needed.");
  const ds = { name, format: "bp", breakSize, breakCats, source: `${site.origin}/${slug === "_" ? "_" : slug}/`, slug, host: site.host,
    rounds: roundsOut.map(({ name, abbr, motion, rooms }) => ({ name, abbr, motion, rooms })), teams: teamRows, fetchWarnings: warnings };
  return ds;
}

// relay client used by the site
export function makeRelay(relayBase) {
  return async (url) => {
    const r = await fetch(`${relayBase}?url=${encodeURIComponent(url)}`, { headers: { Accept: "application/json, text/html" } });
    return { status: r.status, text: await r.text(), finalUrl: r.headers.get("X-Final-Url") || url };
  };
}
