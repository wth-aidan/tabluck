// The three reports, rendered as a stack of slides.
import { esc, sgn, pct, num, classify, pill, seatShade, roomShade, luckShade, pbShade, dataTable, hbars, pairedColumns, el, csv, downloadText } from "./lib.js";

export const REPORTS = {
  draw: { label: "Draw audit", how: "draw", limits: "limits-draw" },
  room: { label: "Room audit", how: "room", limits: "limits-room" },
  luck: { label: "Overall luck", how: "luck", limits: "limits-luck" },
};

const SEATN = ["OG", "OO", "CG", "CO"];

function slideHead(kind, kicker, title, { dark = false } = {}) {
  const r = REPORTS[kind];
  return `<div class="slide-head"><div><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2></div>
    <div class="slide-links"><a class="slink" href="#/how/${r.how}">How this works</a><a class="slink ai" href="#/how/${r.limits}" title="AI-assisted analysis: read the limitations">AI-assisted · limitations</a></div></div>`;
}
const slide = (kind, id, kicker, title, body, { dark = false, cls = "" } = {}) =>
  `<section class="slide ${dark ? "dark" : ""} ${cls}" id="s-${kind}-${id}">${slideHead(kind, kicker, title, { dark })}<div class="slide-body">${body}</div></section>`;

const disclaimer = (kind) => `<div class="disclaimer" role="note"><b>AI-assisted estimate.</b> This analysis was built with AI assistance and rests on simplifying assumptions. Numbers are statistical estimates from a few rounds, not verdicts on any team or adjudicator.
  <a href="#/how/${REPORTS[kind].limits}">Read the limitations →</a></div>`;

const teamLink = (R, i) => `<a class="tlink" href="#/report/${R._kind}/team/${i}">${esc(R.teamsBasic[i].name)}</a>`;
const catChips = (R, i) => (R.teamsBasic[i].cats || []).map((c) => `<span class="chip">${esc(c)}</span>`).join("");
const rankCell = (R, i, broke) => `<span class="rk ${broke ? "broke" : ""}" title="${broke ? "Broke" : ""}">${esc(R.teamsBasic[i].rank)}</span>`;

function thresholdControl(kind, state, onChange) {
  const spec = { draw: { min: 0.01, max: 0.15, step: 0.01, unit: "", fmt: (v) => "±" + v.toFixed(3) }, room: { min: 0.5, max: 8, step: 0.5, fmt: (v) => "±" + v.toFixed(1) + "%" }, luck: { min: 0.1, max: 1.5, step: 0.1, fmt: (v) => "±" + v.toFixed(1) + " pts" } }[kind];
  const w = el(`<label class="thr">Threshold <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${state.thr[kind]}" aria-label="Classification threshold"> <output>${spec.fmt(state.thr[kind])}</output></label>`);
  const inp = w.querySelector("input"), out = w.querySelector("output");
  inp.addEventListener("input", () => { out.textContent = spec.fmt(+inp.value); });
  inp.addEventListener("change", () => onChange(+inp.value));
  return w;
}

// ---------------------------------------------------------------- data shaping
export function shape(R, thr) {
  const bk = R.sim.breakSize;
  const simBy = new Map(R.sim.teams.map((t) => [t.i, t]));
  const luckRows = R.model.teams.map((t) => {
    const s = simBy.get(t.i);
    return { ...t, ...{ pBreak: s.pBreak, pBreakNeutral: s.pBreakNeutral, meanPlace: s.meanPlace, place80: s.place80, broke: s.broke },
      cls: classify.luck(t.total, thr.luck), clear: t.totalCI[0] > 0 || t.totalCI[1] < 0,
      _search: (R.teamsBasic[t.i].name + " " + R.teamsBasic[t.i].longName).toLowerCase(), cats: R.teamsBasic[t.i].cats };
  });
  const brokeSet = new Set(luckRows.filter((t) => t.broke).map((t) => t.i));
  const drawRows = R.seat.teams.filter((t) => t.played > 0).map((t) => ({ ...t, cls: classify.draw(t.diff, thr.draw), broke: brokeSet.has(t.i), complete: R.teamsBasic[t.i].complete,
    _search: (R.teamsBasic[t.i].name + " " + R.teamsBasic[t.i].longName).toLowerCase(), cats: R.teamsBasic[t.i].cats, pts: R.teamsBasic[t.i].pts }));
  const roomRows = R.room.teams.map((t) => ({ ...t, cls: classify.room(t.meanPct, thr.room), broke: brokeSet.has(t.i),
    _search: (R.teamsBasic[t.i].name + " " + R.teamsBasic[t.i].longName).toLowerCase(), cats: R.teamsBasic[t.i].cats }));
  return { bk, luckRows, drawRows, roomRows };
}

// expected place with that analysis's luck taken out, plus how far it is from the real finish
const realPlace = (R, i) => parseInt(R.teamsBasic[i].rank, 10) || null;
function adjCell(real, exp) {
  if (!exp) return "—";
  const adj = exp.rank, d = real == null ? 0 : real - adj;
  const mv = d > 0 ? `<span class="mv" title="${d} place${d === 1 ? "" : "s"} higher than the real finish">▲${d}</span>` : d < 0 ? `<span class="mv" title="${-d} place${d === -1 ? "" : "s"} lower than the real finish">▼${-d}</span>` : `<span class="mv">=</span>`;
  return `<b>${adj}</b> ${mv}<span class="rng" title="80% range">${exp.range80[0]}–${exp.range80[1]}</span>`;
}
const counts = (rows, classes) => classes.map((c) => rows.filter((r) => r.cls === c).length);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const catFilter = (R) => {
  const cats = [...new Set(R.teamsBasic.flatMap((t) => t.cats || []))].sort();
  return cats.length ? [{ key: "cat", label: "Category", options: cats, test: (r, v) => (r.cats || []).includes(v) }] : [];
};
const clsFilter = (opts) => ({ key: "cls", label: "Class", options: opts, test: (r, v) => r.cls === v });

// ---------------------------------------------------------------- LUCK
function luckReport(R, S, state, rerender) {
  const { bk, luckRows } = S, V = R.validation, sum = R.sim.summary;
  const top = luckRows.slice(0, bk);
  const [l, n, u] = counts(top, ["Lucky", "Neutral", "Unlucky"]);
  const gain = V.model.acc - V.points.acc;
  const weak = V.model.acc < 0.58 || gain < 0.05;
  const out = [];

  out.push(slide("luck", "title", R.meta.name, "How much of the tab was luck?", `
    <p class="sub">One model for seats and opponents together, then ${R.sim.runs.toLocaleString()} re-runs of the tournament.</p>
    <div class="stats">
      <div class="stat"><b>${pct(V.model.acc)}</b><span>head-to-heads called right on rounds the model never saw</span><small>backing the team on more points: ${pct(V.points.acc)}</small></div>
      <div class="stat"><b>${sum.overlapReal.toFixed(1)}<i> / ${bk}</i></b><span>of the ${bk} strongest teams break in a typical re-run</span><small>with every seat made neutral: ${sum.overlapNeutral.toFixed(1)}</small></div>
      <div class="stat"><b>${sum.reBreak.toFixed(1)}<i> / ${bk}</i></b><span>of the real top ${bk} break again in a typical re-run</span><small>${sum.sureCount} team${sum.sureCount === 1 ? "" : "s"} had a 75%+ break chance</small></div>
    </div>
    <div class="classes"><div class="cls tone-good"><b>Lucky</b>draw gave more than +${state.thr.luck.toFixed(1)} points</div><div class="cls tone-mid"><b>Neutral</b>within ±${state.thr.luck.toFixed(1)} points</div><div class="cls tone-bad"><b>Unlucky</b>draw cost more than ${state.thr.luck.toFixed(1)} points</div></div>
    ${disclaimer("luck")}`, { dark: true }));

  const calib = V.buckets.filter((b) => b.n).map((b) => `<tr><td>${b.hi >= 1 ? `${Math.round(b.lo * 100)}%+` : `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`}</td><td>${b.n}</td><td>${pct(b.predicted)}</td><td>${pct(b.won)}</td></tr>`).join("");
  const R3 = R.meta.rounds * 3;
  const labels = Array.from({ length: R3 + 1 }, (_, k) => String(k));
  out.push(slide("luck", "trust", "MODEL CHECK", "Can you trust the model on this tournament?", `
    <div class="grid2">
      <div>
        <h3>Predicting rounds it never saw</h3>
        <p class="muted">For each round, the model is re-fitted without it and asked to predict all ${V.n.toLocaleString()} head-to-heads in it.</p>
        ${hbars([{ label: "Coin flip", value: 0.5, cls: "bar-n" }, { label: "Team on more points", value: V.points.acc, cls: "bar-n" }, { label: "Model", value: V.model.acc, cls: "bar-g" }], { max: 1, width: 520, labelW: 170 })}
        <div class="verdict ${weak ? "warn" : "ok"}">${weak
          ? `<b>Weak signal here.</b> The model barely beats simple alternatives on this tournament, so treat its luck figures with extra caution.`
          : `<b>The model adds real information here:</b> it calls ${Math.round(gain * 100)} percentage points more head-to-heads right than backing the team on more points.`}</div>
      </div>
      <div>
        <h3>Are its probabilities honest?</h3>
        <table class="tbl small"><thead><tr><th>Favourite given</th><th>Contests</th><th>Predicted</th><th>Actually won</th></tr></thead><tbody>${calib}</tbody></table>
        <h3>Do re-runs look like the real tournament?</h3>
        ${pairedColumns(R.sim.summary.realHist, R.sim.summary.simHist, { labels, names: ["Real: teams on each total", "Re-runs (average)"] })}
      </div>
    </div>`));

  out.push(`<div data-slot="luck-break"></div>`, `<div data-slot="luck-all"></div>`);

  const chartN = Math.min(luckRows.length, bk + 8);
  const items = luckRows.slice(0, chartN).map((t) => ({ i: t.i, label: `${t.rank}  ${R.teamsBasic[t.i].name}`.slice(0, 30), value: t.pBreak, cls: t.broke ? "bar-gold" : "bar-n" }));
  const luckyB = luckRows.filter((t) => t.broke).sort((a, b) => a.pBreak - b.pBreak).slice(0, 3);
  const unlM = luckRows.filter((t) => !t.broke).sort((a, b) => b.pBreak - a.pBreak).slice(0, 3);
  out.push(slide("luck", "line", "THE BREAK LINE", "Who was likely to break?", `
    <div class="grid2 wide-left">
      <div class="chart-click" data-chart="break">${hbars(items, { max: 1, width: 640, labelW: 220 })}<p class="legend"><span class="sw bar-gold"></span>Broke <span class="sw bar-n"></span>Missed · bar = chance of breaking in re-runs</p></div>
      <div class="cards">
        <div class="card"><h4>How settled was the break?</h4><p>The real top ${bk}'s break chances add up to ${sum.reBreak.toFixed(1)}: in a typical re-run about ${Math.round(sum.reBreak)} of them break again.</p></div>
        <div class="card"><h4>Luckiest breaks</h4><p>${luckyB.map((t) => `${teamLink(R, t.i)} (${esc(t.rank)}, ${pct(t.pBreak)})`).join(" · ")}</p></div>
        <div class="card"><h4>Unluckiest misses</h4><p>${unlM.map((t) => `${teamLink(R, t.i)} (${esc(t.rank)}, ${pct(t.pBreak)})`).join(" · ") || "—"}</p></div>
      </div>
    </div>`));

  out.push(`<div data-slot="luck-ext"></div>`);

  const st = R.stats.luck;
  const biggestBreak = luckRows.filter((t) => t.broke).sort((a, b) => b.total - a.total)[0];
  const worstBreak = luckRows.filter((t) => t.broke).sort((a, b) => a.total - b.total)[0];
  out.push(slide("luck", "readout", "READOUT", "What stands out", `
    <ul class="readout">
      <li><b>How much is the draw?</b> Even in a fair re-run, ${(bk - sum.overlapReal).toFixed(1)} of the ${bk} break places go to teams outside the ${bk} strongest. Making every seat neutral changes that by ${Math.abs(sum.overlapNeutral - sum.overlapReal).toFixed(1)} teams.</li>
      <li><b>Size of draw luck:</b> a typical team's total is about ±${st.sdTotal.toFixed(1)} points over ${R.meta.rounds} rounds, with 80% ranges about ${st.ciWidth.toFixed(1)} points wide; ${st.clear} team${st.clear === 1 ? "" : "s"} are clear of zero.</li>
      <li><b>Break zone:</b> ${l} lucky, ${n} neutral, ${u} unlucky (mean ${sgn(mean(top.map((t) => t.total)))} pts).${biggestBreak ? ` Biggest boost among breakers: ${teamLink(R, biggestBreak.i)} (${sgn(biggestBreak.total)}). Biggest cost: ${teamLink(R, worstBreak.i)} (${sgn(worstBreak.total)}).` : ""}</li>
      <li><b>Did luck sort the table?</b> Draw luck vs team points correlates at ${st.corrPts.toFixed(2)}; seat luck vs room luck at ${st.corrSeatRoom.toFixed(2)}.</li>
      <li><b>Model check:</b> ${pct(V.model.acc)} of unseen head-to-heads called right (team on more points: ${pct(V.points.acc)}).</li>
    </ul>`, { dark: true }));
  return out.join("");
}

function luckTables(R, S, state, open) {
  const { bk, luckRows } = S;
  const cols = (full) => [
    { key: "rank", label: "Rank", cell: (t) => rankCell(R, t.i, t.broke), sort: (t) => t.tabPlace, cls: "c" },
    { key: "team", label: "Team", cell: (t) => `${esc(R.teamsBasic[t.i].name)} ${catChips(R, t.i)}`, sort: (t) => R.teamsBasic[t.i].name.toLowerCase() },
    { key: "pts", label: "Pts", cell: (t) => t.pts, sort: (t) => t.pts, cls: "c", defaultDir: -1 },
    { key: "exp", label: "Expected", title: "Where it would have finished without draw luck: points − (seat luck + room luck), re-ranked, speaks break ties. ▲/▼ = places higher/lower than the real finish; small numbers = 80% range from the model's uncertainty", cell: (t) => adjCell(t.tabPlace, t.exp), sort: (t) => t.exp?.rank ?? 1e9, cls: "c nowrap" },
    { key: "seat", label: "Seat", title: "Seat luck, team points", cell: (t) => `<span class="${luckShade(t.seatTot)}">${sgn(t.seatTot)}</span>`, sort: (t) => t.seatTot, cls: "c", defaultDir: -1 },
    { key: "room", label: "Room", title: "Room luck, team points", cell: (t) => `<span class="${luckShade(t.roomTot)}">${sgn(t.roomTot)}</span>`, sort: (t) => t.roomTot, cls: "c", defaultDir: -1 },
    { key: "total", label: "Total", cell: (t) => `<b class="${luckShade(t.total)}">${sgn(t.total)}${t.clear ? "*" : ""}</b>`, sort: (t) => t.total, cls: "c", defaultDir: -1 },
    ...(full ? [] : [{ key: "range", label: "80% range", cell: (t) => `${sgn(t.totalCI[0], 1)} to ${sgn(t.totalCI[1], 1)}`, cls: "c muted" }]),
    { key: "pb", label: "Break chance", title: "Share of re-runs (from team strengths) in which it breaks", cell: (t) => `<span class="pbc ${pbShade(t.pBreak)}">${pct(t.pBreak)}</span>`, sort: (t) => t.pBreak, cls: "c", defaultDir: -1 },
    { key: "pbn", label: "Without luck", title: "Break chance with all draw luck taken out: share of the model's plausible versions of everyone's luck in which its points − luck land inside the break", cell: (t) => (t.exp ? `<span class="pbc ${pbShade(t.exp.pBreak)}">${pct(t.exp.pBreak)}</span>` : "—"), sort: (t) => t.exp?.pBreak ?? -1, cls: "c", defaultDir: -1 },
    { key: "cls", label: "Luck", cell: (t) => pill(t.cls), sort: (t) => t.total, cls: "c", defaultDir: -1 },
  ];
  const brk = el(slide("luck", "break", "BREAK ZONE", `Places 1–${bk}`, `<p class="sub">${counts(luckRows.slice(0, bk), ["Lucky", "Neutral", "Unlucky"]).map((c, k) => `${c} ${["lucky", "neutral", "unlucky"][k]}`).join(" · ")} · luck in team points over ${R.meta.rounds} rounds · * = 80% range excludes zero · click a team for its full profile</p>`));
  brk.querySelector(".slide-body").appendChild(dataTable({ rows: luckRows.slice(0, bk), cols: cols(false), onRow: open, search: false }));
  const all = el(slide("luck", "all", "ALL TEAMS", `Every team (${luckRows.length})`, `<p class="sub">Sort any column, search, or filter. Gold rank = broke. Teams that missed rounds are left out.</p>`));
  all.querySelector(".slide-body").appendChild(dataTable({ rows: luckRows, cols: cols(false), onRow: open, filters: [...catFilter(R), clsFilter(["Lucky", "Neutral", "Unlucky"])] }));
  const ext = el(slide("luck", "ext", "EXTREMES", "Luckiest and unluckiest draws", ""));
  const two = el(`<div class="grid2"></div>`);
  const extCols = [
    { key: "team", label: "Team", cell: (t) => `${rankCell(R, t.i, t.broke)} ${esc(R.teamsBasic[t.i].name)}` },
    { key: "total", label: "Total", cell: (t) => `<b class="${luckShade(t.total)}">${sgn(t.total)}${t.clear ? "*" : ""}</b>`, cls: "c" },
    { key: "pb", label: "Break chance", cell: (t) => `<span class="pbc ${pbShade(t.pBreak)}">${pct(t.pBreak)}</span>`, cls: "c" },
  ];
  const lucky = luckRows.slice().sort((a, b) => b.total - a.total).slice(0, 20), unl = luckRows.slice().sort((a, b) => a.total - b.total).slice(0, 20);
  [[`20 luckiest (avg ${sgn(mean(lucky.map((t) => t.total)))})`, lucky], [`20 unluckiest (avg ${sgn(mean(unl.map((t) => t.total)))})`, unl]].forEach(([h, rows]) => {
    const box = el(`<div><h3>${esc(h)}</h3></div>`); box.appendChild(dataTable({ rows, cols: extCols, onRow: open, search: false })); two.appendChild(box);
  });
  ext.querySelector(".slide-body").appendChild(two);
  return { "luck-break": brk, "luck-all": all, "luck-ext": ext };
}

// ---------------------------------------------------------------- DRAW
function drawReport(R, S, state) {
  const { bk, drawRows } = S, A = R.seat.averages;
  const top = drawRows.slice(0, bk);
  const [l, n, u] = counts(top, ["Lucky", "Neutral", "Unlucky"]);
  const out = [];
  out.push(slide("draw", "title", R.meta.name, "Who got the draw?", `
    <p class="sub">A seat-by-seat audit of every team, using each round's motion-tab seat values.</p>
    <div class="stats">
      <div class="stat"><b>${drawRows.length}</b><span>teams with at least one round</span><small>${R.meta.rounds} preliminary rounds</small></div>
      <div class="stat"><b>${l} · ${n} · ${u}</b><span>lucky · neutral · unlucky in places 1–${bk}</span><small>mean vs 1.5: ${sgn(mean(top.map((t) => t.diff)), 3)}</small></div>
      <div class="stat"><b>±${state.thr.draw.toFixed(3)}</b><span>luck threshold</span><small>around the 1.5 neutral line</small></div>
    </div>
    <div class="classes"><div class="cls tone-good"><b>Lucky</b>&gt; +${state.thr.draw.toFixed(3)} above 1.5</div><div class="cls tone-mid"><b>Neutral</b>within ±${state.thr.draw.toFixed(3)}</div><div class="cls tone-bad"><b>Unlucky</b>&lt; −${state.thr.draw.toFixed(3)} below 1.5</div></div>
    ${disclaimer("draw")}`, { dark: true }));

  const hasMotions = R.rounds.some((r) => r.motion);
  const rows = A.map((r, k) => `<tr><th>${esc(R.rounds[k].name)}</th>${r.map((v) => `<td class="${seatShade(v)}">${num(v)}</td>`).join("")}${hasMotions ? `<td class="motion">${esc(R.rounds[k].motion || "")}</td>` : ""}</tr>`).join("");
  const rooms = Math.min(...R.meta.nRooms);
  out.push(slide("draw", "seats", "SEAT VALUES", "What each seat was worth, round by round", `
    <p class="sub">Average team points scored from each seat. Neutral = 1.50. Calculated from the draws and results (the same numbers as the motions tab).</p>
    <div class="dt-scroll"><table class="tbl heat"><thead><tr><th>Round</th>${SEATN.map((s) => `<th>${s}</th>`).join("")}${hasMotions ? "<th>Motion</th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="legend"><span class="sw s-g2"></span>≥ 1.75 <span class="sw s-g1"></span>1.50–1.74 <span class="sw s-r1"></span>1.25–1.49 <span class="sw s-r2"></span>&lt; 1.25</p>
    <p class="note">Caution: with ${rooms} rooms a round, a seat's average wanders by about ±${(1.118 / Math.sqrt(rooms)).toFixed(2)} points from chance alone. <a href="#/how/limits-draw">Why this matters →</a></p>`));

  out.push(`<div data-slot="draw-break"></div>`, `<div data-slot="draw-all"></div>`, `<div data-slot="draw-ext"></div>`);
  let best = { v: -1 }, worst = { v: 9 };
  A.forEach((r, k) => r.forEach((v, s) => { if (v > best.v) best = { v, k, s }; if (v < worst.v) worst = { v, k, s }; }));
  const sorted = drawRows.filter((t) => t.played === R.meta.rounds).sort((a, b) => b.diff - a.diff);
  out.push(slide("draw", "readout", "READOUT", "What stands out", `
    <ul class="readout">
      <li><b>Break zone:</b> ${l} lucky, ${n} neutral, ${u} unlucky; mean vs 1.5 = ${sgn(mean(top.map((t) => t.diff)), 3)} (≈ ${sgn(mean(top.map((t) => t.diff)) * R.meta.rounds, 1)} team points).</li>
      <li><b>Best and worst seats:</b> ${esc(R.rounds[best.k].name)} ${SEATN[best.s]} (${num(best.v)}) and ${esc(R.rounds[worst.k].name)} ${SEATN[worst.s]} (${num(worst.v)}).</li>
      <li><b>Biggest tailwind:</b> ${sorted.length ? `${teamLink(R, sorted[0].i)} (${sgn(sorted[0].diff, 3)}, finished ${esc(sorted[0].rank)})` : "—"}. <b>Biggest headwind:</b> ${sorted.length ? `${teamLink(R, sorted[sorted.length - 1].i)} (${sgn(sorted[sorted.length - 1].diff, 3)}, finished ${esc(sorted[sorted.length - 1].rank)})` : "—"}.</li>
      <li><b>Seats explain little of the standings:</b> seat value vs team points correlates at ${R.stats.seat.corrPts.toFixed(2)}.</li>
      <li>For a version that adjusts for who sat in each seat, see the <a href="#/report/luck">overall luck</a> report.</li>
    </ul>`, { dark: true }));
  return out.join("");
}

function drawTables(R, S, state, open) {
  const { bk, drawRows } = S, A = R.seat.averages;
  const cols = [
    { key: "rank", label: "Rank", cell: (t) => rankCell(R, t.i, t.broke), sort: (t) => t.i, cls: "c" },
    { key: "team", label: "Team", cell: (t) => `${esc(R.teamsBasic[t.i].name)}${t.played < R.meta.rounds ? " <span class='muted'>*</span>" : ""} ${catChips(R, t.i)}`, sort: (t) => R.teamsBasic[t.i].name.toLowerCase() },
    ...A.map((_, r) => ({ key: "r" + r, label: R.rounds[r].abbr || `R${r + 1}`, cell: (t) => (t.seq[r] ? `<span class="seat ${seatShade(A[r][SEATN.indexOf(t.seq[r])])}" title="${num(A[r][SEATN.indexOf(t.seq[r])])}">${t.seq[r]}</span>` : "—"), cls: "c" })),
    { key: "score", label: "Score", cell: (t) => num(t.score, 3), sort: (t) => t.score, cls: "c", defaultDir: -1 },
    { key: "diff", label: "vs 1.5", cell: (t) => `<b class="${t.cls === "Lucky" ? "t-good" : t.cls === "Unlucky" ? "t-bad" : "t-mid"}">${sgn(t.diff, 3)}</b>`, sort: (t) => t.diff, cls: "c", defaultDir: -1 },
    { key: "adj", label: "Expected", title: "Where it would have finished without seat luck: points − (score − 1.5) × rounds, re-ranked, speaks break ties (no model). Small numbers = 80% range from re-sampling each round's rooms. ▲/▼ = places higher/lower than the real finish", cell: (t) => adjCell(realPlace(R, t.i), t.exp), sort: (t) => t.exp?.rank ?? 1e9, cls: "c nowrap" },
    { key: "cls", label: "Draw", cell: (t) => pill(t.cls), sort: (t) => t.diff, cls: "c", defaultDir: -1 },
  ];
  const brk = el(slide("draw", "break", "BREAK ZONE", `Places 1–${bk}`, `<p class="sub">Seats shaded by that round's seat value · click a team for its full profile</p>`));
  brk.querySelector(".slide-body").appendChild(dataTable({ rows: drawRows.slice(0, bk), cols, onRow: open, search: false }));
  const all = el(slide("draw", "all", "ALL TEAMS", `Every team (${drawRows.length})`, `<p class="sub">* = missed rounds, averaged over rounds debated. Gold rank = broke.</p>`));
  all.querySelector(".slide-body").appendChild(dataTable({ rows: drawRows, cols, onRow: open, filters: [...catFilter(R), clsFilter(["Lucky", "Neutral", "Unlucky"])] }));
  const full = drawRows.filter((t) => t.played === R.meta.rounds);
  const ext = el(slide("draw", "ext", "EXTREMES", "Luckiest and unluckiest seat draws", `<p class="sub">Teams that debated every round.</p>`));
  const two = el(`<div class="grid2"></div>`);
  const extCols = [cols[0], cols[1], cols[cols.length - 2]];
  [["20 luckiest", full.slice().sort((a, b) => b.diff - a.diff).slice(0, 20)], ["20 unluckiest", full.slice().sort((a, b) => a.diff - b.diff).slice(0, 20)]].forEach(([h, rows]) => {
    const box = el(`<div><h3>${h}</h3></div>`); box.appendChild(dataTable({ rows, cols: extCols, onRow: open, search: false })); two.appendChild(box);
  });
  ext.querySelector(".slide-body").appendChild(two);
  return { "draw-break": brk, "draw-all": all, "draw-ext": ext };
}

// ---------------------------------------------------------------- ROOM
function roomReport(R, S, state) {
  const { bk, roomRows } = S, thr = state.thr.room;
  const top = roomRows.slice(0, bk);
  const [s_, f_, h_] = counts(top, ["Soft", "Fair", "Hard"]);
  const out = [];
  out.push(slide("room", "title", R.meta.name, "Who got the hard rooms?", `
    <p class="sub">How strong each team's opponents turned out to be, against what its room was supposed to hold.</p>
    <div class="stats">
      <div class="stat"><b>${roomRows.length}</b><span>teams analysed</span><small>teams that debated every round</small></div>
      <div class="stat"><b>${s_} · ${f_} · ${h_}</b><span>soft · fair · hard in places 1–${bk}</span><small>mean ${sgn(mean(top.map((t) => t.meanPct)), 1)}% of field</small></div>
      <div class="stat"><b>±${thr.toFixed(1)}%</b><span>path threshold</span><small>of the field, averaged over ${R.meta.rounds} rounds</small></div>
    </div>
    <div class="classes"><div class="cls tone-good"><b>Soft</b>opponents weaker than billed, &lt; −${thr.toFixed(1)}%</div><div class="cls tone-mid"><b>Fair</b>within ±${thr.toFixed(1)}%</div><div class="cls tone-bad"><b>Hard</b>opponents stronger than billed, &gt; +${thr.toFixed(1)}%</div></div>
    ${disclaimer("room")}`, { dark: true }));

  const ex = roomRows.slice().sort((a, b) => b.meanPct - a.meanPct)[0];
  if (ex) {
    const N = R.room.N;
    out.push(slide("room", "example", "WORKED EXAMPLE", `${R.teamsBasic[ex.i].name}: the hardest path here`, `
      <div class="dt-scroll"><table class="tbl"><thead><tr><th></th>${ex.oppPlace.map((_, r) => `<th>${esc(R.rounds[r].abbr || "R" + (r + 1))}</th>`).join("")}</tr></thead><tbody>
        <tr><th>Room billing</th>${ex.roomRank.map((v, r) => `<td class="c">${billingText(R, r, v)}</td>`).join("")}</tr>
        <tr><th>Opponents' average place</th>${ex.oppPlace.map((v) => `<td class="c">${Math.round(v)}</td>`).join("")}</tr>
        <tr><th>Typical for that room</th>${ex.expPlace.map((v) => `<td class="c">${Math.round(v)}</td>`).join("")}</tr>
        <tr><th>Difficulty</th>${ex.hardPct.map((v) => `<td class="c ${roomShade(v, thr)}"><b>${sgn(v, 1)}%</b></td>`).join("")}</tr>
      </tbody></table></div>
      <p>Average <b>${sgn(ex.meanPct, 1)}%</b> → ${pill(ex.cls)}. Difficulty = (typical − actual) / ${N} teams. Round 1 rooms are all billed as average rooms.</p>`));
  }
  out.push(`<div data-slot="room-break"></div>`, `<div data-slot="room-all"></div>`, `<div data-slot="room-ext"></div>`);
  const srt = roomRows.slice().sort((a, b) => b.meanPct - a.meanPct);
  const pu = roomRows.filter((t) => t.pullups > 0), npu = roomRows.filter((t) => !t.pullups);
  out.push(slide("room", "readout", "READOUT", "What stands out", `
    <ul class="readout">
      <li><b>Break zone:</b> ${s_} soft, ${f_} fair, ${h_} hard (mean ${sgn(mean(top.map((t) => t.meanPct)), 1)}%).</li>
      <li><b>Hardest path:</b> ${srt.length ? `${teamLink(R, srt[0].i)} (${sgn(srt[0].meanPct, 1)}%, finished ${esc(srt[0].rank)})` : "—"}. <b>Softest:</b> ${srt.length ? `${teamLink(R, srt[srt.length - 1].i)} (${sgn(srt[srt.length - 1].meanPct, 1)}%, finished ${esc(srt[srt.length - 1].rank)})` : "—"}.</li>
      <li><b>Path difficulty vs points:</b> correlation ${R.stats.room.corrPts.toFixed(2)}; vs seat luck ${R.stats.room.corrSeat.toFixed(2)}.</li>
      <li><b>Pull-ups:</b> ${pu.length} teams were pulled up at least once; their paths averaged ${sgn(mean(pu.map((t) => t.meanPct)), 1)}% vs ${sgn(mean(npu.map((t) => t.meanPct)), 1)}% for the rest.</li>
      <li>Averages hide room make-up (one very strong team vs three middling ones). The <a href="#/report/luck">overall luck</a> report handles that.</li>
    </ul>`, { dark: true }));
  return out.join("");
}

function roomTables(R, S, state, open) {
  const { bk, roomRows } = S, thr = state.thr.room;
  const cols = (wide) => [
    { key: "rank", label: "Rank", cell: (t) => rankCell(R, t.i, t.broke), sort: (t) => t.place, cls: "c" },
    { key: "team", label: "Team", cell: (t) => `${esc(R.teamsBasic[t.i].name)} ${catChips(R, t.i)}`, sort: (t) => R.teamsBasic[t.i].name.toLowerCase() },
    ...t0(R).map((r) => ({ key: "r" + r, label: R.rounds[r].abbr || `R${r + 1}`, title: "Opponents' average place" + (wide ? " vs typical" : ""),
      cell: (t) => `<span class="cellbox ${roomShade(t.hardPct[r], thr)}" title="${sgn(t.hardPct[r], 1)}%">${Math.round(t.oppPlace[r])}${wide ? ` <i>vs ${Math.round(t.expPlace[r])}</i>` : ""}</span>`, cls: "c" })),
    { key: "pu", label: "PU", title: "Pull-ups", cell: (t) => t.pullups || "–", sort: (t) => t.pullups, cls: "c", defaultDir: -1 },
    { key: "avg", label: "Avg", cell: (t) => `<b class="${t.cls === "Hard" ? "t-bad" : t.cls === "Soft" ? "t-good" : "t-mid"}">${sgn(t.meanPct, 1)}%</b>`, sort: (t) => t.meanPct, cls: "c", defaultDir: -1 },
    { key: "adj", label: "Expected", title: "Where it would have finished without room luck: points − the luck model's room luck, re-ranked, speaks break ties. Small numbers = 80% range from the model's uncertainty. ▲/▼ = places higher/lower than the real finish", cell: (t) => adjCell(t.place, t.exp), sort: (t) => t.exp?.rank ?? 1e9, cls: "c nowrap" },
    { key: "cls", label: "Path", cell: (t) => pill(t.cls), sort: (t) => t.meanPct, cls: "c", defaultDir: -1 },
  ];
  const brk = el(slide("room", "break", "BREAK ZONE", `Places 1–${bk}`, `<p class="sub">Cells: opponents' average place vs typical for that room, shaded by difficulty (red = stronger than billed) · click a team for its profile</p>`));
  brk.querySelector(".slide-body").appendChild(dataTable({ rows: roomRows.slice(0, bk), cols: cols(true), onRow: open, search: false }));
  const all = el(slide("room", "all", "ALL TEAMS", `Every team (${roomRows.length})`, `<p class="sub">Cells: opponents' average place (1–${R.room.N}) on the round-removed table. Gold rank = broke.</p>`));
  all.querySelector(".slide-body").appendChild(dataTable({ rows: roomRows, cols: cols(false), onRow: open, filters: [...catFilter(R), clsFilter(["Soft", "Fair", "Hard"])] }));
  const ext = el(slide("room", "ext", "EXTREMES", "Hardest and softest paths", ""));
  const two = el(`<div class="grid2"></div>`);
  const c = cols(false), extCols = [c[0], c[1], c[c.length - 2]];
  [["20 hardest", roomRows.slice().sort((a, b) => b.meanPct - a.meanPct).slice(0, 20)], ["20 softest", roomRows.slice().sort((a, b) => a.meanPct - b.meanPct).slice(0, 20)]].forEach(([h, rows]) => {
    const box = el(`<div><h3>${h}</h3></div>`); box.appendChild(dataTable({ rows, cols: extCols, onRow: open, search: false })); two.appendChild(box);
  });
  ext.querySelector(".slide-body").appendChild(two);
  return { "room-break": brk, "room-all": all, "room-ext": ext };
}
// "Room 3 of 33", or "all tied" when every room had the same billing (round 1)
export function billingText(R, r, v) {
  const ranks = new Set(R.room.billing.team.map((b) => (b && b[r] ? b[r].roomRank : null)).filter((x) => x != null));
  if (ranks.size === 1) return "all rooms tied";
  return `${num(v, v % 1 ? 1 : 0)} of ${R.meta.nRooms[r]}`;
}
const t0 = (R) => Array.from({ length: R.meta.rounds }, (_, r) => r);

// ---------------------------------------------------------------- page
export function renderReport(kind, R, state, { onThreshold, onDownloadPptx, onShare, onRerun }) {
  R._kind = kind;
  const S = shape(R, state.thr);
  const open = (i) => { location.hash = `#/report/${kind}/team/${i}`; };
  const page = el(`<div class="report"></div>`);
  const warn = [...(R.meta.warnings || []), ...(R.meta.fetchWarnings || [])];
  page.appendChild(el(`<div class="rbar">
    <div class="rbar-title"><b>${esc(R.meta.name)}</b><span>${R.meta.nComplete} teams · ${R.meta.rounds} rounds · break of ${R.sim.breakSize}${R.meta.source ? ` · <a href="${esc(R.meta.source)}" target="_blank" rel="noopener">tab site ↗</a>` : ""}</span></div>
    <nav class="rtabs" aria-label="Reports">${Object.entries(REPORTS).map(([k, v]) => `<a href="#/report/${k}" class="${k === kind ? "on" : ""}">${v.label}</a>`).join("")}</nav>
    <div class="rtools"></div></div>`));
  const tools = page.querySelector(".rtools");
  tools.appendChild(thresholdControl(kind, state, (v) => onThreshold(kind, v)));
  const bsz = el(`<label class="thr">Break <input type="number" min="2" max="${R.meta.nComplete}" value="${R.sim.breakSize}" aria-label="Break size"></label>`);
  bsz.querySelector("input").addEventListener("change", (e) => onRerun(+e.target.value));
  tools.appendChild(bsz);
  const dl = el(`<button class="btn">Download slides (.pptx)</button>`); dl.addEventListener("click", () => onDownloadPptx(kind, dl)); tools.appendChild(dl);
  const dc = el(`<button class="btn ghost">CSV</button>`); dc.addEventListener("click", () => downloadCSV(kind, R, S)); tools.appendChild(dc);
  if (onShare) { const sh = el(`<button class="btn ghost">Share link</button>`); sh.addEventListener("click", () => onShare(sh)); tools.appendChild(sh); }
  if (warn.length) page.appendChild(el(`<details class="warns"><summary>${warn.length} note${warn.length > 1 ? "s" : ""} about this tab's data</summary><ul>${warn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>`));

  const body = el(`<div class="slides"></div>`);
  body.innerHTML = kind === "luck" ? luckReport(R, S, state) : kind === "draw" ? drawReport(R, S, state) : roomReport(R, S, state);
  const tables = kind === "luck" ? luckTables(R, S, state, open) : kind === "draw" ? drawTables(R, S, state, open) : roomTables(R, S, state, open);
  body.querySelectorAll("[data-slot]").forEach((slot) => slot.replaceWith(tables[slot.dataset.slot]));
  body.querySelectorAll(".chart-click .bar-row").forEach((g) => { if (g.dataset.i) { g.style.cursor = "pointer"; g.addEventListener("click", () => open(+g.dataset.i)); } });
  page.appendChild(body);
  return page;
}

function downloadCSV(kind, R, S) {
  const name = (R.meta.name || "tab").replace(/[^\w]+/g, "_");
  let rows;
  if (kind === "luck") rows = [["rank", "team", "points", "points_without_luck", "expected_place", "expected_range_10", "expected_range_90", "break_chance_without_luck", "fair_place", "seat_luck", "room_luck", "total_luck", "range_10", "range_90", "break_chance", "broke", "class"],
    ...S.luckRows.map((t) => [t.rank, R.teamsBasic[t.i].name, t.pts, t.exp ? t.exp.adjPts.toFixed(3) : "", t.exp?.rank ?? "", t.exp?.range80[0] ?? "", t.exp?.range80[1] ?? "", t.exp ? t.exp.pBreak.toFixed(4) : "", t.modelPlace, t.seatTot.toFixed(3), t.roomTot.toFixed(3), t.total.toFixed(3), t.totalCI[0].toFixed(3), t.totalCI[1].toFixed(3), t.pBreak.toFixed(4), t.broke, t.cls])];
  else if (kind === "draw") rows = [["rank", "team", ...R.rounds.map((r, k) => r.abbr || `R${k + 1}`), "rounds", "score", "vs_1.5", "class", "points_without_seat_luck", "expected_place", "expected_range_10", "expected_range_90"],
    ...S.drawRows.map((t) => [t.rank, R.teamsBasic[t.i].name, ...t.seq.map((s) => s || ""), t.played, t.score.toFixed(4), t.diff.toFixed(4), t.cls, t.exp ? t.exp.adjPts.toFixed(3) : "", t.exp?.rank ?? "", t.exp?.range80[0] ?? "", t.exp?.range80[1] ?? ""])];
  else rows = [["rank", "team", ...R.rounds.flatMap((r, k) => [`${r.abbr || "R" + (k + 1)}_opp_place`, `${r.abbr || "R" + (k + 1)}_typical`, `${r.abbr || "R" + (k + 1)}_difficulty_pct`]), "pullups", "mean_pct", "class", "points_without_room_luck", "expected_place", "expected_range_10", "expected_range_90"],
    ...S.roomRows.map((t) => [t.rank, R.teamsBasic[t.i].name, ...t.oppPlace.flatMap((v, r) => [v.toFixed(2), t.expPlace[r].toFixed(2), t.hardPct[r].toFixed(2)]), t.pullups, t.meanPct.toFixed(3), t.cls, t.exp ? t.exp.adjPts.toFixed(3) : "", t.exp?.rank ?? "", t.exp?.range80[0] ?? "", t.exp?.range80[1] ?? ""])];
  downloadText(`${name}_${kind}.csv`, csv(rows));
}
