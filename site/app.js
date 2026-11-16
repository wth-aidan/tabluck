// App shell: routing, home page, running an analysis, progress, sharing.
import * as CONFIG from "./config.js";
const { RELAY_URL, RUNS } = CONFIG;
const DEMO = !!CONFIG.DEMO;
import { fetchTournament, makeRelay, parseTabInput } from "./scrape.js";
import { renderReport, REPORTS } from "./report.js";
import { teamHTML } from "./team.js";
import { howHTML } from "./how.js";
import { aboutHTML } from "./about.js";
import { downloadDeck } from "./decks.js";
import { esc, el } from "./lib.js";

const DEFAULT_THR = { luck: 0.5, draw: 0.05, room: 2.5 };
const state = { result: null, ds: null, input: "", thr: { ...DEFAULT_THR }, running: false, reportCache: {} };
const app = document.getElementById("app");
const drawer = document.getElementById("drawer");
const relayReady = DEMO || !/REPLACE-ME/.test(RELAY_URL);

const EXAMPLES = [
  { label: "Oxford IV 2026", url: "oxfordiv26.calicotab.com", sample: "data/sample_oxf.json", result: "data/result_oxf.json" },
  { label: "Cambridge IV 2026", url: "cambridgeiv2026.calicotab.com/cambridge2026/", sample: "data/sample_cam.json", result: "data/result_cam.json" },
];

// ------------------------------------------------------------------ routing
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "how") return showHow(parts[1]);
  if (parts[0] === "about") { closeTeam(false); return setPage(el(aboutHTML())); }
  if (parts[0] === "report") {
    if (!state.result) { location.hash = "#/"; return; }
    const kind = REPORTS[parts[1]] ? parts[1] : "draw";
    showReport(kind);
    if (parts[2] === "team" && parts[3] != null) openTeam(kind, +parts[3]); else closeTeam(false);
    return;
  }
  if (parts[0] === "run") return; // progress view is driven by analyse()
  if (parts[0] === "sample" && EXAMPLES[+parts[1]]) { const ex = EXAMPLES[+parts[1]]; return analyse(ex.url, { sample: ex.sample }); } // saved copy, for tests and offline use
  showHome();
}
window.addEventListener("hashchange", route);

function setPage(node, { keepScroll = false } = {}) {
  app.replaceChildren(node);
  app.dataset.view = "";
  if (!keepScroll) window.scrollTo(0, 0);
  const hh = location.hash || "#/";
  document.querySelectorAll(".topnav a").forEach((a) => {
    const href = a.getAttribute("href");
    const on = href === "#/" ? (hh === "#/" || hh === "#" || hh === "#/run")
      : href === "#/how" ? hh.startsWith("#/how") && !hh.startsWith("#/how/limits")
      : href.startsWith("#/report") ? hh.startsWith("#/report")
      : hh.startsWith(href);
    a.classList.toggle("on", on);
  });
}

// ------------------------------------------------------------------ home
function showHome(message = "") {
  closeTeam(false);
  const prev = state.result ? `<div class="resume">Last analysis: <b>${esc(state.result.meta.name)}</b> · <a href="#/report/draw">open reports →</a></div>` : "";
  const node = el(`<div class="home">
    <section class="hero">
      <div class="hero-in">
        <div class="kicker">BRITISH PARLIAMENTARY · TABBYCAT TABS</div>
        <h1>How much of the tab was luck?</h1>
        <p class="lede">Paste a tab site. In a few seconds you get three reports: the seats each team drew, how hard its rooms really were, and a model that turns both into team points and break chances.</p>
        <div class="hero-warn" role="note">
          <b>Read this first.</b> This is a casual modelling exercise, built with AI assistance, as an afternoon thought experiment. Every number is a statistical estimate from a handful of rounds: it can be wrong, and it is never a verdict on any team or adjudicator. Please don't use it to have a go at anyone.
          <span class="hero-warn-links"><a href="#/about">Why this exists</a> · <a href="#/how/ai">How AI was used</a> · <a href="#/how/limits">Limitations</a></span>
        </div>
        <form class="runform" autocomplete="off">
          <input name="tab" type="text" inputmode="url" placeholder="e.g. ${DEMO ? "oxfordiv26.calicotab.com" : "eudc2026.calicotab.com"}" aria-label="Tab site address" value="${esc(state.input)}">
          <button class="btn big" type="submit">Analyse</button>
        </form>
        ${message ? `<div class="err">${esc(message)}</div>` : ""}
        <div class="examples">Try: ${EXAMPLES.map((e, k) => `<button class="link-btn" data-ex="${k}">${esc(e.label)}</button>`).join(" · ")}
</div>
        ${DEMO ? `<div class="demo-note"><b>Demo version.</b> Only Oxford IV 2026 and Cambridge IV 2026 are built in, from saved copies of their tabs. Type either address (any spacing or capitals) or pick one above, then press Analyse. Other addresses are checked and rejected the way the live site would, but nothing is fetched.</div>` : ""}
        ${relayReady ? "" : `<div class="err soft">The tab fetcher isn't set up yet, so live tabs won't load.</div>`}
        ${prev}
      </div>
    </section>
    <section class="three">
      <a class="three-card" href="#/how/draw"><span class="num">1</span><h3>Draw audit</h3><p>Were your seats good ones? Each seat in each round is valued by the points teams actually scored from it.</p><span class="more">How it works →</span></a>
      <a class="three-card" href="#/how/room"><span class="num">2</span><h3>Room audit</h3><p>Were your opponents stronger or weaker than your room was meant to be, judged by where they finished?</p><span class="more">How it works →</span></a>
      <a class="three-card" href="#/how/luck"><span class="num">3</span><h3>Overall luck</h3><p>Seats and opponents in one model, in team points, then the tournament re-run 10,000 times for break chances.</p><span class="more">How it works →</span></a>
    </section>
  </div>`);
  node.querySelector(".runform").addEventListener("submit", (e) => { e.preventDefault(); analyse(e.target.tab.value); });
  // examples fill the box; the visitor still presses Analyse
  const box = node.querySelector(".runform input");
  const fill = (v) => { box.value = v; box.focus(); box.setSelectionRange(v.length, v.length); };
  node.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => fill(EXAMPLES[+b.dataset.ex].url)));
  // clicking an empty box drops in the example address
  box.addEventListener("focus", () => { if (!box.value.trim()) fill(box.placeholder.replace(/^e\.g\.\s*/, "")); });
  setPage(node);
}

// ------------------------------------------------------------------ how it works
function showHow(section) {
  closeTeam(false);
  const node = el(`<div>${howHTML()}</div>`);
  setPage(node);
  if (section) {
    const target = document.getElementById("how-" + section);
    if (target) {
      requestAnimationFrame(() => {
        const y = target.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: "instant" });
        target.classList.add("flash"); setTimeout(() => target.classList.remove("flash"), 1600);
      });
    }
  }
}

// ------------------------------------------------------------------ running
const STEPS = [
  ["fetch", "Reading the tab site"], ["Draw audit", "Draw audit"], ["Room audit", "Room audit"],
  ["Fitting team strengths", "Fitting team strengths"], ["Measuring uncertainty", "Measuring uncertainty"], ["Re-running the tournament", "Re-running the tournament"],
];
function progressView(input) {
  const node = el(`<div class="progress-page"><div class="pcard">
    <div class="kicker">ANALYSING</div><h2>${esc(input)}</h2>
    <ol class="steps">${STEPS.map(([k, t]) => `<li data-k="${esc(k)}"><span class="dot"></span><span class="t">${esc(t)}</span><span class="d"></span></li>`).join("")}</ol>
    <div class="bar"><div class="fill"></div></div>
    <div class="pmsg muted">This takes a few seconds. Everything runs in your browser.</div>
  </div></div>`);
  setPage(node);
  return {
    set(key, detail = "", frac = null) {
      const idx = STEPS.findIndex(([k]) => k === key);
      node.querySelectorAll(".steps li").forEach((li, k) => { li.classList.toggle("done", k < idx); li.classList.toggle("on", k === idx); if (k === idx) li.querySelector(".d").textContent = detail; });
      const overall = (idx + (frac == null ? 0 : frac)) / STEPS.length;
      node.querySelector(".fill").style.width = `${Math.max(3, overall * 100)}%`;
    },
    choose(list) {
      return new Promise((resolve) => {
        const box = el(`<div class="choose"><p>This site hosts ${list.length} tournaments. Which one?</p><div class="choices"></div><a href="#/">Cancel</a></div>`);
        list.forEach((t) => {
          const b = el(`<button class="btn"></button>`); b.textContent = t.name || t.slug;
          b.onclick = () => { box.remove(); resolve(t); };
          box.querySelector(".choices").appendChild(b);
        });
        node.querySelector(".pcard").appendChild(box);
      });
    },
    error(msg) {
      node.querySelector(".pcard").appendChild(el(`<div class="err">${esc(msg)} <a href="#/">Back</a></div>`));
      node.querySelector(".steps li.on")?.classList.add("failed");
    },
  };
}

function runWorker(ds, prog) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./engine/worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") prog.set(STEPS.some(([k]) => k === m.label) ? m.label : "Draw audit", "", m.frac);
      else if (m.type === "done") { w.terminate(); resolve(m.result); }
      else if (m.type === "error") { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The analysis crashed.")); };
    w.postMessage({ ds, opts: { runs: RUNS } });
  });
}

async function analyse(input, { sample = null, breakSize = null } = {}) {
  if (state.running) return;
  input = String(input || "").trim();
  let precomputed = null;
  if (!sample && !breakSize) {
    let site;
    try { site = parseTabInput(input); } catch (e) { showHome(e.message); return; }
    if (DEMO) {
      const ex = EXAMPLES.find((x) => parseTabInput(x.url).host === site.host);
      if (!ex) { showHome(`This demo only has Oxford IV 2026 and Cambridge IV 2026 built in (${site.host} is a valid address, and the live site would fetch it).`); return; }
      sample = ex.sample; precomputed = ex.result; input = ex.url;
    }
  } else if (DEMO && sample) precomputed = EXAMPLES.find((x) => x.sample === sample)?.result || null;
  state.running = true;
  location.hash = "#/run";
  const prog = progressView(input);
  try {
    let ds;
    const cacheKey = "tabluck:" + (sample || input);
    if (breakSize && state.ds) ds = { ...state.ds, breakSize };
    else if (sample) {
      prog.set("fetch", "loading saved copy");
      ds = await (await fetch(sample)).json();
      ds.fetchWarnings = ["This is a saved copy of the tab, not a live read."];
    } else {
      if (!relayReady) throw new Error("The tab fetcher isn't set up on this site yet (see the README).");
      const relay = makeRelay(RELAY_URL);
      ds = await fetchTournament(input, relay, { onStep: (s) => prog.set("fetch", s), choose: (list) => prog.choose(list) });
    }
    if (!ds.teams.length || !ds.rounds.length) throw new Error("No completed preliminary rounds were found on this tab.");
    let result;
    if (precomputed) {
      // demo: the analysis was run ahead of time with the same engine; replay the steps briefly
      const pre = fetch(precomputed).then((r) => r.json());
      for (const [k] of STEPS.slice(1)) { prog.set(k, "", 0.5); await new Promise((r) => setTimeout(r, 220)); }
      result = await pre;
    } else result = await runWorker(ds, prog);
    result.meta.fetchWarnings = ds.fetchWarnings || [];
    result.meta.source = ds.source || result.meta.source;
    state.result = result; state.ds = ds; state.input = sample ? "" : input; state.reportCache = {};
    try { sessionStorage.setItem("tabluck:last", JSON.stringify({ input: state.input, sample, ds, result })); } catch { /* storage full or blocked: fine */ }
    state.running = false;
    location.hash = "#/report/draw";
  } catch (e) {
    state.running = false;
    prog.error(friendly(e));
  }
}
function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the tab fetcher. Check your connection, or try again in a minute.";
  return m;
}

// ------------------------------------------------------------------ reports
function showReport(kind, { keep = false } = {}) {
  const key = `${kind}|${state.thr[kind]}|${state.result.sim.breakSize}`;
  if (app.dataset.view === key) return;
  const node = renderReport(kind, state.result, state, {
    onThreshold: (k, v) => { state.thr[k] = v; app.dataset.view = ""; showReport(k, { keep: true }); },
    onRerun: (n) => { if (n >= 2 && n !== state.result.sim.breakSize) analyse(state.input, { breakSize: n }); },
    onDownloadPptx: async (k, btn) => {
      const old = btn.textContent; btn.disabled = true; btn.textContent = "Building slides…";
      try { btn.textContent = (await downloadDeck(k, state.result, state)) ? "Downloaded ✓" : "Cancelled"; }
      catch (e) { btn.textContent = "Couldn't build slides"; console.error(e); }
      setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2500);
    },
    onShare: DEMO ? null : async (btn) => {
      const link = state.input ? `${location.origin}${location.pathname}?tab=${encodeURIComponent(state.input)}#/report/${kind}` : location.href;
      try { await navigator.clipboard.writeText(link); btn.textContent = "Link copied ✓"; }
      catch {
        const box = el(`<input class="sharebox" readonly>`); box.value = link;
        btn.replaceWith(box); box.focus(); box.select();
      }
      setTimeout(() => (btn.textContent = "Share link"), 2500);
    },
  });
  const same = keep || (app.dataset.view || "").startsWith(kind + "|");
  setPage(node, { keepScroll: same });
  app.dataset.view = key;
}

// ------------------------------------------------------------------ team drawer
function openTeam(kind, i) {
  drawer.innerHTML = teamHTML(state.result, i, state, kind);
  drawer.classList.add("open"); document.body.classList.add("drawer-open");
  drawer.scrollTop = 0;
  drawer.querySelector(".tp-close")?.addEventListener("click", () => (location.hash = `#/report/${kind}`));
  drawer.querySelectorAll("[data-ptab]").forEach((btn) => btn.addEventListener("click", () => {
    drawer.querySelectorAll("[data-ptab]").forEach((b) => { const on = b === btn; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    drawer.querySelectorAll("[data-pview]").forEach((p) => { p.hidden = p.dataset.pview !== btn.dataset.ptab; });
  }));
  drawer.querySelector(".tp-close")?.focus();
}
function closeTeam(updateHash = true) {
  if (!drawer.classList.contains("open")) return;
  drawer.classList.remove("open"); document.body.classList.remove("drawer-open");
  if (updateHash) location.hash = location.hash.replace(/\/team\/\d+$/, "");
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) closeTeam(true); });
document.getElementById("scrim").addEventListener("click", () => closeTeam(true));

// ------------------------------------------------------------------ start
(function start() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("tabluck:last") || "null");
    if (saved && saved.result) { state.result = saved.result; state.ds = saved.ds; state.input = saved.input || ""; }
  } catch { /* ignore */ }
  const q = new URLSearchParams(location.search).get("tab");
  if (q && (!state.result || state.input !== q)) {
    const target = location.hash.startsWith("#/report/") ? location.hash : "#/report/draw";
    analyse(q).then(() => { if (state.result) location.hash = target.replace(/\/team\/\d+$/, ""); });
    return;
  }
  if (location.hash.startsWith("#/run")) location.hash = state.result ? "#/report/draw" : "#/";
  route();
})();
