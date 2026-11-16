// Shared helpers: escaping, formatting, classification, colours, tables and small SVG charts.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const sgn = (v, d = 2) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const f = 10 ** d, x = Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f;
  return (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toFixed(d);
};
export const pct = (p, d = 0) => (p == null ? "—" : p >= 0.995 && d === 0 ? ">99%" : p < 0.005 && d === 0 ? "<1%" : (p * 100).toFixed(d) + "%");
export const num = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
export const roundSym = (v, d) => Math.sign(v) * Math.round(Math.abs(v) * 10 ** d + 1e-9) / 10 ** d;

// classification with user-adjustable thresholds (same rounding as the decks)
export const classify = {
  draw: (diff, thr) => (diff == null ? "DNC" : roundSym(diff, 9) > thr ? "Lucky" : roundSym(diff, 9) < -thr ? "Unlucky" : "Neutral"),
  room: (v, thr) => (v == null ? "n/a" : roundSym(v, 1) > thr ? "Hard" : roundSym(v, 1) < -thr ? "Soft" : "Fair"),
  luck: (v, thr) => (v == null ? "n/a" : roundSym(v, 2) > thr ? "Lucky" : roundSym(v, 2) < -thr ? "Unlucky" : "Neutral"),
};
// good-for-the-team = green, bad = red, in every analysis
export const CLASS_TONE = { Lucky: "good", Soft: "good", Neutral: "mid", Fair: "mid", Unlucky: "bad", Hard: "bad", DNC: "na", "n/a": "na" };
export const pill = (c) => `<span class="pill tone-${CLASS_TONE[c] || "na"}">${esc(c)}</span>`;

// cell shading scales
export const seatShade = (v) => (v == null ? "" : v >= 1.75 ? "s-g2" : v >= 1.5 ? "s-g1" : v >= 1.25 ? "s-r1" : "s-r2");
export const roomShade = (h, thr) => (h == null ? "" : h >= 10 ? "s-r2" : h > thr ? "s-r1" : h >= -thr ? "s-n" : h > -10 ? "s-g1" : "s-g2");
export const luckShade = (v) => (v == null ? "" : v > 0.25 ? "t-good" : v < -0.25 ? "t-bad" : "t-mid");
export const pbShade = (p) => (p >= 0.75 ? "pb4" : p >= 0.5 ? "pb3" : p >= 0.25 ? "pb2" : p >= 0.1 ? "pb1" : "pb0");

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- interactive table ----------
// cols: [{ key, label, title?, cell(row) -> html, sort?(row) -> value, cls?, width? }]
export function dataTable({ rows, cols, onRow, initialSort = null, search = true, filters = [], pageSize = null, emptyText = "No teams match." }) {
  const wrap = el(`<div class="dt"></div>`);
  const tools = el(`<div class="dt-tools"></div>`);
  let q = "", sortKey = initialSort ? initialSort.key : null, sortDir = initialSort ? initialSort.dir : 1;
  const active = {};
  if (search) {
    const inp = el(`<input class="dt-search" type="search" placeholder="Search teams…" aria-label="Search teams">`);
    inp.addEventListener("input", () => { q = inp.value.toLowerCase(); draw(); });
    tools.appendChild(inp);
  }
  filters.forEach((f) => {
    const sel = el(`<select class="dt-filter" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: all</option>${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`);
    sel.addEventListener("change", () => { active[f.key] = sel.value; draw(); });
    tools.appendChild(sel);
  });
  const count = el(`<span class="dt-count"></span>`);
  tools.appendChild(count);
  if (search || filters.length) wrap.appendChild(tools);
  const scroller = el(`<div class="dt-scroll"></div>`);
  const table = el(`<table class="tbl"><thead><tr></tr></thead><tbody></tbody></table>`);
  scroller.appendChild(table); wrap.appendChild(scroller);
  const thr = table.querySelector("thead tr"), tb = table.querySelector("tbody");
  cols.forEach((c) => {
    const th = el(`<th class="${c.cls || ""}" ${c.title ? `title="${esc(c.title)}"` : ""} ${c.width ? `style="width:${c.width}"` : ""}>${esc(c.label)}${c.sort ? '<span class="sort-ind"></span>' : ""}</th>`);
    if (c.sort) {
      th.classList.add("sortable"); th.tabIndex = 0;
      const go = () => { if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = c.defaultDir || 1; } draw(); };
      th.addEventListener("click", go);
      th.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    }
    thr.appendChild(th);
  });
  function draw() {
    let rs = rows.filter((r) => (!q || (r._search || "").includes(q)) && filters.every((f) => !active[f.key] || f.test(r, active[f.key])));
    if (sortKey) {
      const c = cols.find((x) => x.key === sortKey);
      rs = rs.slice().sort((a, b) => {
        const va = c.sort(a), vb = c.sort(b);
        if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
      });
    }
    thr.querySelectorAll("th").forEach((th, k) => { th.dataset.sort = cols[k].key === sortKey ? (sortDir > 0 ? "asc" : "desc") : ""; });
    tb.innerHTML = rs.length ? rs.map((r) => `<tr data-i="${r.i}" class="${r._rowCls || ""}" tabindex="0">${cols.map((c) => `<td class="${c.cls || ""}">${c.cell(r)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${cols.length}" class="empty">${esc(emptyText)}</td></tr>`;
    count.textContent = `${rs.length} team${rs.length === 1 ? "" : "s"}`;
  }
  if (onRow) {
    tb.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const tr = e.target.closest("tr[data-i]"); if (tr) onRow(+tr.dataset.i);
    });
    tb.addEventListener("keydown", (e) => { const tr = e.target.closest("tr[data-i]"); if (tr && e.key === "Enter") onRow(+tr.dataset.i); });
  }
  draw();
  wrap.redraw = draw;
  return wrap;
}

// ---------- small SVG charts ----------
export function hbars(items, { max = 1, width = 640, rowH = 22, labelW = 190, fmt = (v) => pct(v), tickFmt = (v) => Math.round(v * 100) + "%", marker = null } = {}) {
  const h = items.length * rowH + 24, plotW = width - labelW - 50;
  const x = (v) => labelW + (Math.max(0, v) / max) * plotW;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img" aria-label="Bar chart">
    ${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${h - 18}" class="grid"/><text x="${x(t)}" y="${h - 4}" class="tick" text-anchor="middle">${tickFmt(t)}</text>`).join("")}
    ${items.map((it, k) => {
      const y = k * rowH + 3;
      return `<g class="bar-row" data-i="${it.i ?? ""}">
        <text x="${labelW - 8}" y="${y + rowH / 2 + 1}" class="blabel" text-anchor="end" dominant-baseline="middle">${esc(it.label)}</text>
        <rect x="${labelW}" y="${y}" width="${Math.max(1, x(it.value) - labelW)}" height="${rowH - 6}" rx="3" class="${it.cls || "bar"}"><title>${esc(it.label)}: ${fmt(it.value)}</title></rect>
        <text x="${x(it.value) + 5}" y="${y + rowH / 2 + 1}" class="bval" dominant-baseline="middle">${fmt(it.value)}</text></g>`;
    }).join("")}
    ${marker != null ? `<line x1="${x(marker)}" x2="${x(marker)}" y1="0" y2="${h - 18}" class="marker"/>` : ""}
  </svg>`;
}

// vertical bars for a distribution; highlight = index to mark; cut = index after which a line is drawn
export function columns(values, { width = 520, height = 150, labels = null, highlight = null, cut = null, cls = "bar-n", fmtTip = (v) => v } = {}) {
  const n = values.length, max = Math.max(...values, 1e-9), bw = (width - 30) / n, ph = height - 24;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribution chart">
    ${values.map((v, k) => {
      const hgt = (v / max) * ph, x = 20 + k * bw;
      return `<rect x="${x + 1}" y="${ph - hgt + 2}" width="${Math.max(1, bw - 2)}" height="${hgt}" class="${k === highlight ? "bar-hi" : cls}"><title>${esc(labels ? labels[k] : k)}: ${esc(fmtTip(v))}</title></rect>`;
    }).join("")}
    ${cut != null ? `<line x1="${20 + cut * bw}" x2="${20 + cut * bw}" y1="0" y2="${ph + 2}" class="marker"/>` : ""}
    ${labels ? labels.map((l, k) => (k % Math.ceil(n / 12) === 0 || k === n - 1 ? `<text x="${20 + k * bw + bw / 2}" y="${height - 6}" class="tick" text-anchor="middle">${esc(l)}</text>` : "")).join("") : ""}
  </svg>`;
}

export const ordinal = (n) => { const v = Math.round(n), t = v % 100; return v + (t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][v % 10] || "th"); };

// Where a team finished across the re-runs: one bar per place, break-zone bars tinted,
// the middle 80% shaded, and labelled markers for the break line, the real finish and the average re-run finish.
export function placeChart(hist, { runs, breakSize, realPlace = null, expectedPlace = null, range80 = null, width = 680, unit = "re-runs" } = {}) {
  const n = hist.length, share = hist.map((v) => v / runs), maxV = Math.max(...share, 1e-9);
  const L = 44, Rm = 12, top = 66, ph = 150, height = top + ph + 46;
  const bw = (width - L - Rm) / n;
  const xc = (place) => L + (place - 0.5) * bw;           // centre of a place's bar
  const xEdge = (k) => L + k * bw;                         // left edge of bar k (0-based)
  const yMax = niceUp(maxV), y = (v) => top + ph - (v / yMax) * ph;
  const pctTxt = (v) => (v >= 0.1 ? `${Math.round(v * 100)}%` : `${(v * 100).toFixed(v >= 0.01 ? 1 : 2).replace(/\.?0+$/, "")}%`);
  const parts = [];
  // y grid
  [0, 0.5, 1].forEach((f) => { const v = yMax * f, yy = y(v); parts.push(`<line x1="${L}" x2="${width - Rm}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" class="tick" text-anchor="end">${pctTxt(v)}</text>`); });
  // middle-80% band
  if (range80) parts.push(`<rect x="${xEdge(range80[0] - 1)}" y="${top}" width="${(range80[1] - range80[0] + 1) * bw}" height="${ph}" class="band80"><title>Middle 80% of ${unit}: ${ordinal(range80[0])} to ${ordinal(range80[1])}</title></rect>`);
  // bars
  share.forEach((v, k) => {
    const place = k + 1, h = Math.max(v > 0 ? 1 : 0, (v / yMax) * ph);
    const c = place === realPlace ? "pc-real" : place <= breakSize ? "pc-in" : "pc-out";
    parts.push(`<rect x="${xEdge(k) + (bw > 3 ? 0.5 : 0)}" y="${top + ph - h}" width="${Math.max(0.6, bw - (bw > 3 ? 1 : 0))}" height="${h}" class="${c}"><title>${ordinal(place)}: ${pctTxt(v)} of ${unit}</title></rect>`);
  });
  // markers + labels (labels stacked in rows above the plot so they never overlap)
  const marks = [];
  if (breakSize && breakSize < n) marks.push({ x: xEdge(breakSize), cls: "pm-break", text: `Break line (top ${breakSize})` });
  if (realPlace) marks.push({ x: xc(realPlace), cls: "pm-real", text: `Real finish: ${ordinal(realPlace)}` });
  if (expectedPlace != null) marks.push({ x: xc(expectedPlace), cls: "pm-mean", text: `Expected: ${ordinal(expectedPlace)}` });
  const rows = [[], [], []], rowY = [16, 34, 52], cw = 6.4;
  marks.sort((a, b) => a.x - b.x).forEach((m) => {
    const w = m.text.length * cw + 8;
    const anchor = m.x + w > width - Rm ? "end" : m.x - w < 0 ? "start" : (m.x > width / 2 ? "end" : "start");
    const x0 = anchor === "end" ? m.x - w : m.x, x1 = anchor === "end" ? m.x : m.x + w;
    let r = rows.findIndex((row) => row.every(([a, b]) => x1 < a - 4 || x0 > b + 4));
    if (r < 0) r = 2;
    rows[r].push([x0, x1]); Object.assign(m, { r, anchor });
  });
  marks.forEach((m) => parts.push(`<line x1="${m.x}" x2="${m.x}" y1="${rowY[m.r] - 12}" y2="${top + ph}" class="${m.cls}"/>`));
  parts.push(`<text x="4" y="${top - 6}" class="tick axis-t">share of ${unit}</text>`);
  marks.forEach((m) => parts.push(`<text x="${m.x + (m.anchor === "end" ? -5 : 5)}" y="${rowY[m.r]}" text-anchor="${m.anchor}" class="pm-label ${m.cls}-t">${esc(m.text)}</text>`));
  // x axis ticks
  const step = niceStep(n / 8), ticks = new Set([1, n]);
  for (let p = step; p < n; p += step) ticks.add(p);
  [...ticks].sort((a, b) => a - b).forEach((p, idx, arr) => {
    if (idx > 0 && xc(p) - xc(arr[idx - 1]) < 22 && p !== n) return;
    parts.push(`<text x="${xc(p)}" y="${top + ph + 16}" class="tick" text-anchor="middle">${p}</text>`);
  });
  parts.push(`<text x="${L + (width - L - Rm) / 2}" y="${top + ph + 36}" class="tick axis-t" text-anchor="middle">Finishing place (1 = top of the tab)</text>`);
  return `<svg class="chart placechart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Finishing places across re-runs">${parts.join("")}</svg>`;
}
function niceUp(v) { const e = 10 ** Math.floor(Math.log10(v)), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
function niceStep(v) { const e = 10 ** Math.floor(Math.log10(Math.max(1, v))), m = v / e; return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e); }

export function pairedColumns(a, b, { width = 560, height = 170, labels, names = ["A", "B"] } = {}) {
  const n = a.length, max = Math.max(...a, ...b, 1e-9), gw = (width - 30) / n, ph = height - 40;
  const bar = (v, k, off, c) => { const hh = (v / max) * ph; return `<rect x="${20 + k * gw + off}" y="${ph - hh + 2}" width="${gw / 2 - 2}" height="${hh}" class="${c}"><title>${esc(labels[k])}: ${v.toFixed(1)}</title></rect>`; };
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparison chart">
    ${a.map((v, k) => bar(v, k, 1, "bar-a") + bar(b[k], k, gw / 2, "bar-b")).join("")}
    ${labels.map((l, k) => `<text x="${20 + k * gw + gw / 2}" y="${ph + 16}" class="tick" text-anchor="middle">${esc(l)}</text>`).join("")}
    <rect x="20" y="${height - 14}" width="10" height="10" class="bar-a"/><text x="34" y="${height - 5}" class="tick">${esc(names[0])}</text>
    <rect x="${44 + names[0].length * 6}" y="${height - 14}" width="10" height="10" class="bar-b"/><text x="${58 + names[0].length * 6}" y="${height - 5}" class="tick">${esc(names[1])}</text>
  </svg>`;
}

// Inside a Claude artifact, files go through the host's download prompt; elsewhere, a plain link click.
let hostDownloads;
function getHostDownloads() {
  if (hostDownloads === undefined) hostDownloads = (window.claude && typeof window.claude.use === "function") ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
  return hostDownloads;
}
if (typeof window !== "undefined") setTimeout(getHostDownloads, 0);
export async function saveFile(name, blob) {
  const host = await getHostDownloads();
  if (host) {
    try { await host.save({ filename: name, data: blob }); return "saved"; }
    catch (e) { if (e && e.code === "declined") return "declined"; throw new Error((e && e.message) || "Download unavailable here."); }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return "saved";
}
export function downloadText(name, text, type = "text/csv") {
  return saveFile(name, new Blob([text], { type }));
}
export const csv = (rows) => rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
