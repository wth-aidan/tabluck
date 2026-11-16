// PowerPoint export for the three reports (PptxGenJS, loaded on demand).
// Same visual language as the original decks: navy title/readout slides, white table slides,
// green/grey/red classes, gold = broke.
import { shape } from "./report.js";
import { classify, saveFile } from "./lib.js";

const NAVY = "141B34", GOLD = "E3B341", INK = "1A1F2E", MUTED = "7A8599", CARD = "1F2848";
const TONE = { good: { fill: "CDEFD9", ink: "17663A" }, mid: { fill: "E6EAF0", ink: "3B4558" }, bad: { fill: "F9D6D1", ink: "9B2C22" } };
const CT = { Lucky: "good", Soft: "good", Neutral: "mid", Fair: "mid", Unlucky: "bad", Hard: "bad" };
const SEATN = ["OG", "OO", "CG", "CO"];
const BORDER = { type: "solid", pt: 0.75, color: "FFFFFF" };
const FONT = "Calibri";

const sgn = (v, d = 2) => { if (v == null) return "—"; const f = 10 ** d, x = Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f; return (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toFixed(d); };
const pct = (p) => (p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : Math.round(p * 100) + "%");
const short = (n, m) => (n.length > m ? n.slice(0, m - 1).trimEnd() + "…" : n);
const seatFill = (v) => (v == null ? "FFFFFF" : v >= 1.75 ? "A9DEBD" : v >= 1.5 ? "DDF3E4" : v >= 1.25 ? "FBE3DF" : "F2B6AD");
const roomFill = (h, thr) => (h >= 10 ? "F2B6AD" : h > thr ? "FBE3DF" : h >= -thr ? "F3F5F9" : h > -10 ? "DDF3E4" : "A9DEBD");
const pbFill = (p) => (p >= 0.75 ? "9DB7E0" : p >= 0.5 ? "C3D4EE" : p >= 0.25 ? "E1E9F6" : p >= 0.1 ? "F0F4FA" : "FFFFFF");
const lk = (v) => (v > 0.25 ? "17663A" : v < -0.25 ? "9B2C22" : "3B4558");
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

let loading = null;
function loadLib() {
  if (window.PptxGenJS) return Promise.resolve();
  if (!loading) loading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "vendor/pptxgen.bundle.js"; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the slide library."));
    document.head.appendChild(s);
  });
  return loading;
}

function makePres(R, kindLabel) {
  const pres = new window.PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = `${R.meta.name} – ${kindLabel}`;
  pres.defineSlideMaster({ title: "Dark", background: { color: NAVY }, objects: [] });
  pres.defineSlideMaster({
    title: "Table", background: { color: "FFFFFF" },
    objects: [{ text: { text: "AI-assisted statistical estimate, not a verdict. See the site's How it works → Limitations.", options: { x: 0.5, y: 7.05, w: 11.7, h: 0.3, fontSize: 10, color: MUTED, fontFace: FONT, margin: 0 } } }],
    slideNumber: { x: 12.4, y: 7.05, w: 0.45, h: 0.3, fontSize: 10, color: MUTED, align: "right", fontFace: FONT },
  });
  return pres;
}
const kicker = (s, t, dark) => s.addText(t.toUpperCase(), { x: dark ? 0.6 : 0.5, y: dark ? 0.45 : 0.3, w: 9, h: 0.33, fontSize: dark ? 12 : 11, bold: true, color: dark ? GOLD : MUTED, charSpacing: 2, fontFace: FONT, margin: 0, isTextBox: true });
const title = (s, t, dark) => s.addText(t, { x: dark ? 0.6 : 0.5, y: dark ? 0.8 : 0.6, w: dark ? 12.1 : 8.8, h: dark ? 0.8 : 0.6, fontSize: dark ? 36 : 30, bold: true, color: dark ? "FFFFFF" : NAVY, fontFace: FONT, margin: 0, isTextBox: true });
const sub = (s, t) => s.addText(t, { x: 0.5, y: 1.2, w: 12.3, h: 0.3, fontSize: 12, color: MUTED, fontFace: FONT, margin: 0, isTextBox: true });
function legend(s, names) {
  names.forEach((c, k) => s.addText(c, { shape: "roundRect", rectRadius: 0.08, x: 9.65 + k * 1.05, y: 0.72, w: 0.95, h: 0.32, fill: { color: TONE[CT[c]].fill }, color: TONE[CT[c]].ink, fontSize: 11, bold: true, align: "center", valign: "middle", margin: 0, fontFace: FONT }));
}
const H = (t, k, fs, left = [1]) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: NAVY }, fontSize: fs, align: left.includes(k) ? "left" : "center", valign: "middle", fontFace: FONT } });

function titleSlide(pres, R, { kick, head, subt, stats, classes }) {
  const s = pres.addSlide({ masterName: "Dark" });
  kicker(s, kick, true); title(s, head, true);
  s.addText(subt, { x: 0.6, y: 1.7, w: 12, h: 0.5, fontSize: 20, color: "CADCFC", fontFace: FONT, margin: 0, isTextBox: true });
  stats.forEach(([b, l, sm], k) => {
    const x = 0.6 + k * 4.1;
    s.addShape("roundRect", { x, y: 2.75, w: 3.8, h: 1.9, rectRadius: 0.12, fill: { color: CARD }, line: { color: "2C3866", width: 1 } });
    s.addText(b, { x: x + 0.3, y: 2.9, w: 3.3, h: 0.85, fontSize: 40, bold: true, color: GOLD, fontFace: FONT, margin: 0, isTextBox: true });
    s.addText(l, { x: x + 0.3, y: 3.75, w: 3.3, h: 0.4, fontSize: 15, bold: true, color: "FFFFFF", fontFace: FONT, margin: 0, isTextBox: true });
    s.addText(sm, { x: x + 0.3, y: 4.15, w: 3.3, h: 0.4, fontSize: 12, color: "AFB8CC", fontFace: FONT, margin: 0, isTextBox: true });
  });
  classes.forEach(([a, b, c], k) => s.addText([{ text: a, options: { bold: true, fontSize: 14, breakLine: true } }, { text: b, options: { fontSize: 12 } }],
    { shape: "roundRect", rectRadius: 0.1, x: 0.6 + k * 4.1, y: 5.05, w: 3.8, h: 0.95, fill: { color: TONE[CT[c]].fill }, color: TONE[CT[c]].ink, align: "center", valign: "middle", margin: 0, fontFace: FONT }));
  s.addText("Built with AI assistance. Statistical estimates from a few rounds, not verdicts on any team or adjudicator. Read the limitations on the site.",
    { x: 0.6, y: 6.45, w: 12, h: 0.45, fontSize: 12, color: "AFB8CC", italic: true, fontFace: FONT, margin: 0, isTextBox: true });
}
function readoutSlide(pres, head, points) {
  const s = pres.addSlide({ masterName: "Dark" });
  kicker(s, "Readout", true); title(s, head, true);
  points.forEach(([h, b], k) => {
    const y = 1.85 + k * 1.0;
    s.addText(h, { x: 0.6, y, w: 12, h: 0.35, fontSize: 16, bold: true, color: GOLD, fontFace: FONT, margin: 0, isTextBox: true });
    s.addText(b, { x: 0.6, y: y + 0.36, w: 12, h: 0.6, fontSize: 13, color: "E6EAF0", fontFace: FONT, margin: 0, valign: "top", isTextBox: true });
  });
}

// split rows across slides as two-column tables
function denseSlides(pres, rows, { kick, note, legendNames, head, colW, rowFn, fs = 10 }) {
  const per = 40, n = Math.max(1, Math.ceil(rows.length / per)), each = Math.ceil(rows.length / n);
  for (let p = 0; p < n; p++) {
    const ch = rows.slice(p * each, (p + 1) * each);
    if (!ch.length) continue;
    const s = pres.addSlide({ masterName: "Table" });
    kicker(s, `${kick} · part ${p + 1} of ${n}`, false);
    title(s, `Places ${ch[0].rank.replace("=", "")}–${ch[ch.length - 1].rank.replace("=", "")}`, false);
    sub(s, note); legend(s, legendNames);
    const half = Math.ceil(ch.length / 2);
    [ch.slice(0, half), ch.slice(half)].forEach((c, ci) => {
      if (!c.length) return;
      const W = colW.reduce((a, b) => a + b, 0);
      s.addTable([head.map((t, k) => H(t, k, fs)), ...c.map((r, k) => rowFn(r, k, fs))], { x: 0.5 + ci * 6.3, y: 1.62, w: W, colW, rowH: 0.245, border: BORDER, margin: [0, 0.03, 0, 0.03], fontFace: FONT, autoPage: false });
    });
  }
}
const base = (k, fs) => ({ fontSize: fs, valign: "middle", fill: { color: k % 2 ? "F7F8FB" : "FFFFFF" }, color: INK, fontFace: FONT });

// ------------------------------------------------------------------ decks
function luckDeck(pres, R, state) {
  const S = shape(R, state.thr), { bk, luckRows } = S, V = R.validation, sm = R.sim.summary, thr = state.thr.luck;
  titleSlide(pres, R, {
    kick: R.meta.name, head: "How much of the tab was luck?", subt: `One model for seats and opponents together, then ${R.sim.runs.toLocaleString()} re-runs of the tournament`,
    stats: [[pct(V.model.acc), "head-to-heads called right", `on unseen rounds (team on more points: ${pct(V.points.acc)})`], [`${sm.overlapReal.toFixed(1)} / ${bk}`, `of the ${bk} strongest break`, "in a typical re-run"], [`±${thr.toFixed(1)} pts`, "luck threshold", "total draw luck"]],
    classes: [["LUCKY", `draw gave more than +${thr.toFixed(1)} points`, "Lucky"], ["NEUTRAL", `within ±${thr.toFixed(1)} points`, "Neutral"], ["UNLUCKY", `draw cost more than ${thr.toFixed(1)} points`, "Unlucky"]],
  });
  const R_ = R.meta.rounds;
  // break zone
  let s = pres.addSlide({ masterName: "Table" });
  kicker(s, `${R.meta.name} · break zone`, false); title(s, `Places 1–${bk}`, false);
  sub(s, `Luck in team points over ${R_} rounds (+ = the draw gave points) · Fair = place on the strength table · * = 80% range excludes 0`); legend(s, ["Lucky", "Neutral", "Unlucky"]);
  const wide = (t, k, fs) => {
    const b = base(k, fs), tone = TONE[CT[t.cls]];
    return [{ text: t.rank, options: { ...b, align: "center", bold: true, fill: { color: t.broke ? "F6E7B8" : b.fill.color } } }, { text: short(R.teamsBasic[t.i].name, 34), options: { ...b } },
      { text: String(t.pts), options: { ...b, align: "center" } }, { text: String(t.modelPlace), options: { ...b, align: "center" } },
      { text: sgn(t.seatTot), options: { ...b, align: "center", color: lk(t.seatTot) } }, { text: sgn(t.roomTot), options: { ...b, align: "center", color: lk(t.roomTot) } },
      { text: sgn(t.total) + (t.clear ? "*" : ""), options: { ...b, align: "center", bold: true, color: tone.ink } },
      { text: `${sgn(t.totalCI[0], 1)} to ${sgn(t.totalCI[1], 1)}`, options: { ...b, align: "center" } },
      { text: pct(t.pBreak), options: { ...b, align: "center", fill: { color: pbFill(t.pBreak) } } }, { text: t.cls, options: { ...b, align: "center", bold: true, fill: { color: tone.fill }, color: tone.ink } }];
  };
  s.addTable([["Rank", "Team", "Pts", "Fair", "Seat", "Room", "Total", "80% range", "P(break)", "Luck"].map((t, k) => H(t, k, 12)), ...luckRows.slice(0, bk).map((t, k) => wide(t, k, 12))],
    { x: 0.5, y: 1.65, w: 12.33, colW: [0.65, 2.75, 0.6, 0.7, 1.0, 1.0, 1.1, 1.6, 1.2, 1.73], rowH: Math.min(0.28, 5.2 / (bk + 1)), border: BORDER, margin: [0, 0.06, 0, 0.06], fontFace: FONT, autoPage: false });
  denseSlides(pres, luckRows.slice(bk), {
    kick: `${R.meta.name} · places ${bk + 1}+`, note: "Gold rank = broke · Fair = place on the strength table · P(br) = break chance in re-runs", legendNames: ["Lucky", "Neutral", "Unlucky"],
    head: ["Rank", "Team", "Pts", "Fair", "Seat", "Room", "Total", "P(br)", "Luck"], colW: [0.45, 1.83, 0.37, 0.42, 0.5, 0.5, 0.6, 0.6, 0.76],
    rowFn: (t, k, fs) => { const b = base(k, fs), tone = TONE[CT[t.cls]]; return [{ text: t.rank, options: { ...b, align: "center", bold: true, fill: { color: t.broke ? "F6E7B8" : b.fill.color } } }, { text: short(R.teamsBasic[t.i].name, 24), options: b }, { text: String(t.pts), options: { ...b, align: "center" } }, { text: String(t.modelPlace), options: { ...b, align: "center" } }, { text: sgn(t.seatTot), options: { ...b, align: "center", color: lk(t.seatTot) } }, { text: sgn(t.roomTot), options: { ...b, align: "center", color: lk(t.roomTot) } }, { text: sgn(t.total) + (t.clear ? "*" : ""), options: { ...b, align: "center", bold: true, color: tone.ink } }, { text: pct(t.pBreak), options: { ...b, align: "center", fill: { color: pbFill(t.pBreak) } } }, { text: t.cls, options: { ...b, align: "center", bold: true, fill: { color: tone.fill }, color: tone.ink } }]; },
  });
  // break line chart
  s = pres.addSlide({ masterName: "Table" });
  kicker(s, `${R.meta.name} · the break line`, false); title(s, "Who was likely to break", false);
  sub(s, `Tab places 1–${Math.min(luckRows.length, bk + 8)} and each team's chance of finishing in the top ${bk} across ${R.sim.runs.toLocaleString()} re-runs`);
  const topN = luckRows.slice(0, Math.min(luckRows.length, bk + 8)), labels = topN.map((t) => `${t.rank}  ${short(R.teamsBasic[t.i].name, 22)}`);
  s.addChart("bar", [{ name: "Broke", labels, values: topN.map((t) => (t.broke ? t.pBreak : 0)) }, { name: "Missed", labels, values: topN.map((t) => (t.broke ? 0 : t.pBreak)) }], {
    x: 0.5, y: 1.6, w: 7.6, h: 5.35, barDir: "bar", barGrouping: "stacked", barGapWidthPct: 35, chartColors: [GOLD, "AFB8CC"],
    showValue: true, dataLabelPosition: "inEnd", dataLabelFormatCode: "0%;;;", dataLabelColor: NAVY, dataLabelFontSize: 9, dataLabelFontFace: FONT,
    catAxisOrientation: "maxMin", catAxisLabelColor: INK, catAxisLabelFontSize: 9, catAxisLabelFontFace: FONT,
    valAxisMinVal: 0, valAxisMaxVal: 1, valAxisLabelFormatCode: "0%", valAxisLabelColor: MUTED, valAxisLabelFontSize: 9, valAxisLabelFontFace: FONT,
    valGridLine: { color: "E6EAF0", size: 0.5 }, catGridLine: { style: "none" }, showLegend: true, legendPos: "b", legendColor: "3B4558", legendFontSize: 10, legendFontFace: FONT,
  });
  const lb = luckRows.filter((t) => t.broke).sort((a, b) => a.pBreak - b.pBreak).slice(0, 3), um = luckRows.filter((t) => !t.broke).sort((a, b) => b.pBreak - a.pBreak).slice(0, 3);
  [["How settled was the break?", `The real top ${bk}'s break chances add up to ${sm.reBreak.toFixed(1)}: in a typical re-run about ${Math.round(sm.reBreak)} break again.`],
   ["Luckiest breaks", lb.map((t) => `${R.teamsBasic[t.i].name} (${t.rank}, ${pct(t.pBreak)})`).join(" · ")],
   ["Unluckiest misses", um.map((t) => `${R.teamsBasic[t.i].name} (${t.rank}, ${pct(t.pBreak)})`).join(" · ") || "—"]].forEach(([h, b], k) => {
    const y = 1.75 + k * 1.6;
    s.addShape("roundRect", { x: 8.4, y, w: 4.43, h: 1.4, rectRadius: 0.1, fill: { color: "F3F5F9" }, line: { color: "E6EAF0", width: 0.75 } });
    s.addText(h, { x: 8.6, y: y + 0.12, w: 4.05, h: 0.35, fontSize: 15, bold: true, color: NAVY, fontFace: FONT, margin: 0, isTextBox: true });
    s.addText(b, { x: 8.6, y: y + 0.5, w: 4.05, h: 0.82, fontSize: 12, color: "3B4558", fontFace: FONT, margin: 0, valign: "top", isTextBox: true });
  });
  const st = R.stats.luck;
  readoutSlide(pres, "What stands out", [
    ["Most luck isn't the draw", `Even a fair re-run sends ${(bk - sm.overlapReal).toFixed(1)} of the ${bk} break places to teams outside the ${bk} strongest; neutral seats change that by ${Math.abs(sm.overlapNeutral - sm.overlapReal).toFixed(1)}.`],
    ["Model check", `On unseen rounds it called ${pct(V.model.acc)} of head-to-heads (team on more points: ${pct(V.points.acc)}).`],
    ["Draw luck is real but modest", `Typical team about ±${st.sdTotal.toFixed(1)} points, 80% ranges ~${st.ciWidth.toFixed(1)} points wide; ${st.clear} teams clear of zero.`],
    ["Did luck sort the table?", `Total draw luck vs team points correlates at ${st.corrPts.toFixed(2)}.`],
    ["Read the limitations", "AI-assisted, five-round statistics; see How it works → Limitations on the site."],
  ]);
}

function drawDeck(pres, R, state) {
  const S = shape(R, state.thr), { bk, drawRows } = S, A = R.seat.averages, thr = state.thr.draw, R_ = R.meta.rounds;
  const top = drawRows.slice(0, bk), cnt = (c) => top.filter((t) => t.cls === c).length;
  titleSlide(pres, R, {
    kick: R.meta.name, head: "Who got the draw?", subt: "A seat-by-seat audit of every team, using each round's motion-tab seat values",
    stats: [[String(drawRows.length), "teams ranked", `${R_} preliminary rounds`], [`${cnt("Lucky")} · ${cnt("Neutral")} · ${cnt("Unlucky")}`, `lucky · neutral · unlucky`, `in places 1–${bk}`], [`±${thr.toFixed(3)}`, "luck threshold", "around the 1.5 neutral line"]],
    classes: [["LUCKY", `> +${thr.toFixed(3)} above 1.5`, "Lucky"], ["NEUTRAL", `within ±${thr.toFixed(3)}`, "Neutral"], ["UNLUCKY", `< −${thr.toFixed(3)} below 1.5`, "Unlucky"]],
  });
  let s = pres.addSlide({ masterName: "Table" });
  kicker(s, `${R.meta.name} · seat values`, false); title(s, "What each seat was worth", false);
  sub(s, "Average team points from each seat, each round (neutral = 1.50); calculated from the draws and results");
  s.addTable([["Round", ...SEATN].map((t, k) => H(t, k, 12, [0])), ...A.map((r, k) => [{ text: R.rounds[k].name, options: { bold: true, fontFace: FONT, fontSize: 12 } }, ...r.map((v) => ({ text: v == null ? "—" : v.toFixed(2), options: { align: "center", fill: { color: seatFill(v) }, fontFace: FONT, fontSize: 12 } }))])],
    { x: 0.5, y: 1.7, w: 5.5, colW: [1.5, 1, 1, 1, 1], rowH: 0.36, border: BORDER, margin: [0, 0.06, 0, 0.06], fontFace: FONT });
  const seatCols = (t, k, fs) => t.seq.map((sq, r) => (sq ? { text: sq, options: { ...base(k, fs), align: "center", fill: { color: seatFill(A[r][SEATN.indexOf(sq)]) } } } : { text: "—", options: { ...base(k, fs), align: "center", color: MUTED } }));
  const rowFn = (t, k, fs, nm = 24) => { const b = base(k, fs), tone = TONE[CT[t.cls]] || TONE.mid; return [{ text: t.rank, options: { ...b, align: "center", bold: true, fill: { color: t.broke ? "F6E7B8" : b.fill.color } } }, { text: short(R.teamsBasic[t.i].name, nm) + (t.played < R_ ? " *" : ""), options: b }, ...seatCols(t, k, fs), { text: t.score.toFixed(3), options: { ...b, align: "center" } }, { text: sgn(t.diff, 3), options: { ...b, align: "center", bold: true, color: tone.ink } }, { text: t.cls, options: { ...b, align: "center", bold: true, fill: { color: tone.fill }, color: tone.ink } }]; };
  s = pres.addSlide({ masterName: "Table" });
  kicker(s, `${R.meta.name} · break zone`, false); title(s, `Places 1–${bk}`, false); sub(s, "Seats shaded by that round's seat value"); legend(s, ["Lucky", "Neutral", "Unlucky"]);
  const rw = 0.8 * Math.min(1, 5 / R_);
  s.addTable([["Rank", "Team", ...A.map((_, r) => R.rounds[r].abbr || `R${r + 1}`), "Score", "vs 1.5", "Draw"].map((t, k) => H(t, k, 12)), ...top.map((t, k) => rowFn(t, k, 12, 40))],
    { x: 0.5, y: 1.65, w: 12.33, colW: [0.7, 12.33 - 0.7 - rw * R_ - 3.6, ...A.map(() => rw), 1.1, 1.1, 1.4], rowH: Math.min(0.28, 5.2 / (bk + 1)), border: BORDER, margin: [0, 0.06, 0, 0.06], fontFace: FONT, autoPage: false });
  const sw = 0.42 * Math.min(1, 5 / R_);
  denseSlides(pres, drawRows.slice(bk), { kick: `${R.meta.name} · places ${bk + 1}+`, note: "* = missed rounds, averaged over rounds debated · gold rank = broke", legendNames: ["Lucky", "Neutral", "Unlucky"],
    head: ["Rank", "Team", ...A.map((_, r) => R.rounds[r].abbr || `R${r + 1}`), "Score", "vs 1.5", "Draw"], colW: [0.45, 6.0 - 0.45 - sw * R_ - 1.95, ...A.map(() => sw), 0.6, 0.6, 0.75], rowFn });
  const full = drawRows.filter((t) => t.played === R_).sort((a, b) => b.diff - a.diff);
  readoutSlide(pres, "What stands out", [
    ["Break zone", `${cnt("Lucky")} lucky, ${cnt("Neutral")} neutral, ${cnt("Unlucky")} unlucky; mean vs 1.5 = ${sgn(mean(top.map((t) => t.diff)), 3)}.`],
    ["Biggest tailwind", full.length ? `${R.teamsBasic[full[0].i].name} (${sgn(full[0].diff, 3)}, finished ${full[0].rank}).` : "—"],
    ["Biggest headwind", full.length ? `${R.teamsBasic[full[full.length - 1].i].name} (${sgn(full[full.length - 1].diff, 3)}, finished ${full[full.length - 1].rank}).` : "—"],
    ["Seats explain little of the standings", `Seat value vs team points correlates at ${R.stats.seat.corrPts.toFixed(2)}.`],
    ["Seat values are noisy", "Each comes from one round's rooms; see the limitations on the site. The overall luck report adjusts for who sat in each seat."],
  ]);
}

function roomDeck(pres, R, state) {
  const S = shape(R, state.thr), { bk, roomRows } = S, thr = state.thr.room, R_ = R.meta.rounds;
  const top = roomRows.slice(0, bk), cnt = (c) => top.filter((t) => t.cls === c).length;
  titleSlide(pres, R, {
    kick: R.meta.name, head: "Who got the hard rooms?", subt: "How strong each team's opponents turned out to be, against what its room was supposed to hold",
    stats: [[String(roomRows.length), "teams analysed", "debated every round"], [`${cnt("Soft")} · ${cnt("Fair")} · ${cnt("Hard")}`, "soft · fair · hard", `in places 1–${bk}`], [`±${thr.toFixed(1)}%`, "path threshold", "of the field, averaged over rounds"]],
    classes: [["SOFT", `opponents weaker than billed, < −${thr.toFixed(1)}%`, "Soft"], ["FAIR", `within ±${thr.toFixed(1)}%`, "Fair"], ["HARD", `opponents stronger than billed, > +${thr.toFixed(1)}%`, "Hard"]],
  });
  const rowFn = (wideCells) => (t, k, fs, nm = 24) => { const b = base(k, fs), tone = TONE[CT[t.cls]]; return [{ text: t.rank, options: { ...b, align: "center", bold: true, fill: { color: t.broke ? "F6E7B8" : b.fill.color } } }, { text: short(R.teamsBasic[t.i].name, nm), options: b },
    ...t.oppPlace.map((v, r) => ({ text: wideCells ? `${Math.round(v)} vs ${Math.round(t.expPlace[r])}` : String(Math.round(v)), options: { ...b, align: "center", fill: { color: roomFill(t.hardPct[r], thr) } } })),
    { text: t.pullups ? String(t.pullups) : "–", options: { ...b, align: "center" } }, { text: sgn(t.meanPct, 1) + "%", options: { ...b, align: "center", bold: true, color: tone.ink } }, { text: t.cls, options: { ...b, align: "center", bold: true, fill: { color: tone.fill }, color: tone.ink } }]; };
  const s = pres.addSlide({ masterName: "Table" });
  kicker(s, `${R.meta.name} · break zone`, false); title(s, `Places 1–${bk}`, false); sub(s, "Cells: opponents' average place vs typical for that room, shaded by difficulty (red = stronger than billed)"); legend(s, ["Soft", "Fair", "Hard"]);
  const rw = 1.05 * Math.min(1, 5 / R_);
  s.addTable([["Rank", "Team", ...t0(R_).map((r) => R.rounds[r].abbr || `R${r + 1}`), "PU", "Avg", "Path"].map((t, k) => H(t, k, 12)), ...top.map((t, k) => rowFn(true)(t, k, 12, 40))],
    { x: 0.5, y: 1.65, w: 12.33, colW: [0.7, 12.33 - 0.7 - rw * R_ - 3.18, ...t0(R_).map(() => rw), 0.7, 1.08, 1.4], rowH: Math.min(0.28, 5.2 / (bk + 1)), border: BORDER, margin: [0, 0.06, 0, 0.06], fontFace: FONT, autoPage: false });
  const sw = 0.42 * Math.min(1, 5 / R_);
  denseSlides(pres, roomRows.slice(bk), { kick: `${R.meta.name} · places ${bk + 1}+`, note: `Cells: opponents' average place (1–${R.room.N}) on the round-removed table · PU = pull-ups · gold rank = broke`, legendNames: ["Soft", "Fair", "Hard"],
    head: ["Rank", "Team", ...t0(R_).map((r) => R.rounds[r].abbr || `R${r + 1}`), "PU", "Avg", "Path"], colW: [0.48, 6.0 - 0.48 - sw * R_ - 1.6, ...t0(R_).map(() => sw), 0.35, 0.6, 0.65], rowFn: rowFn(false) });
  const srt = roomRows.slice().sort((a, b) => b.meanPct - a.meanPct);
  readoutSlide(pres, "What stands out", [
    ["Break zone", `${cnt("Soft")} soft, ${cnt("Fair")} fair, ${cnt("Hard")} hard (mean ${sgn(mean(top.map((t) => t.meanPct)), 1)}%).`],
    ["Hardest path", srt.length ? `${R.teamsBasic[srt[0].i].name} (${sgn(srt[0].meanPct, 1)}%, finished ${srt[0].rank}).` : "—"],
    ["Softest path", srt.length ? `${R.teamsBasic[srt[srt.length - 1].i].name} (${sgn(srt[srt.length - 1].meanPct, 1)}%, finished ${srt[srt.length - 1].rank}).` : "—"],
    ["Path difficulty vs points", `Correlation ${R.stats.room.corrPts.toFixed(2)}.`],
    ["Averages hide room make-up", "One very strong team plus two weak ones averages like three middling teams; the overall luck report handles this."],
  ]);
}
const t0 = (n) => Array.from({ length: n }, (_, r) => r);

export async function downloadDeck(kind, R, state) {
  await loadLib();
  const labels = { luck: "Overall luck", draw: "Draw audit", room: "Room audit" };
  const pres = makePres(R, labels[kind]);
  ({ luck: luckDeck, draw: drawDeck, room: roomDeck })[kind](pres, R, state);
  const fname = `${(R.meta.name || "tab").replace(/[^\w]+/g, "_")}_${kind}_audit.pptx`;
  const blob = await pres.write({ outputType: "blob" });
  return (await saveFile(fname, blob)) === "declined" ? null : fname;
}
// exposed for tests (Node)
export const _internal = { makePres, luckDeck, drawDeck, roomDeck };
