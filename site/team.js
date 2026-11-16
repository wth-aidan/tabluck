// Team profile: one team's full picture across all three analyses.
import { esc, sgn, pct, num, classify, pill, seatShade, roomShade, luckShade, placeChart, ordinal } from "./lib.js";
import { billingText } from "./report.js";

const SEATN = ["OG", "OO", "CG", "CO"];
const PLACE = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

export function teamHTML(R, i, state, kind) {
  const tb = R.teamsBasic[i];
  if (!tb) return `<p>Team not found.</p>`;
  const seat = R.seat.teams[i];
  const room = R.room.teams.find((t) => t.i === i);
  const luck = R.model.teams.find((t) => t.i === i);
  const sim = R.sim.teams.find((t) => t.i === i);
  const A = R.seat.averages;
  const bill = R.room.billing.team[i];
  const broke = new Set(R.sim.teams.filter((t) => t.broke).map((t) => t.i));
  const name = (j) => `<a class="tlink" href="#/report/${kind}/team/${j}">${esc(R.teamsBasic[j].name)}</a> <span class="${broke.has(j) ? "opp-brk" : "muted"}" ${broke.has(j) ? 'title="Broke"' : ""}>(${esc(R.teamsBasic[j].rank)})</span>`;
  const drawCls = classify.draw(seat.diff, state.thr.draw);
  const roomCls = room ? classify.room(room.meanPct, state.thr.room) : null;
  const luckCls = luck ? classify.luck(luck.total, state.thr.luck) : null;

  const rows = R.rooms.map((rr, r) => {
    const k = tb.roomOf[r];
    if (k == null) return `<tr><th>${esc(R.rounds[r].abbr || "R" + (r + 1))}</th><td colspan="8" class="muted">Did not debate</td></tr>`;
    const s = tb.seat[r], others = rr[k].filter((j) => j !== i);
    const b = bill[r];
    return `<tr>
      <th>${esc(R.rounds[r].abbr || "R" + (r + 1))}</th>
      <td class="c"><span class="seat ${seatShade(A[r][s])}" title="Seat value ${num(A[r][s])}">${SEATN[s]}</span></td>
      <td class="c">${tb.results[r] ? `<span class="res res${tb.results[r]}">${PLACE[tb.results[r]]}</span>` : "—"}</td>
      <td>${b ? `${billingText(R, r, b.roomRank).replace(/^(\d)/, "Room $1")}${b.pullup ? ' <span class="chip warn">pulled up</span>' : ""}` : "—"}</td>
      <td class="opps">${others.map((j) => `<span class="oppseat">${SEATN[rr[k].indexOf(j)]}</span> ${name(j)}`).join("<br>")}</td>
      <td class="c">${num(A[r][s])}</td>
      <td class="c">${room ? `<span class="cellbox ${roomShade(room.hardPct[r], state.thr.room)}">${sgn(room.hardPct[r], 1)}%</span>` : "—"}</td>
      <td class="c ${luck ? luckShade(luck.seat[r]) : ""}">${luck ? sgn(luck.seat[r]) : "—"}</td>
      <td class="c ${luck ? luckShade(luck.room[r]) : ""}">${luck ? sgn(luck.room[r]) : "—"}</td>
    </tr>`;
  }).join("");

  const bk = R.sim.breakSize;
  // one view per analysis, each from that analysis's own expected-place data
  const E = R.meta.expected || {};
  const views = [
    seat.exp && { key: "draw", label: "Draw audit", exp: seat.exp, real: seat.exp.real, own: -(seat.diff * seat.played), luckName: "seat luck",
      pool: (E.order || {}).draw || [], runs: E.drawBoots, unit: "re-samples", verb: "ranked",
      what: `Seat luck taken out, with no model: its points minus (seat score − 1.5) × rounds, re-ranked against everyone else's. The bars come from re-sampling each round's rooms ${(E.drawBoots || 0).toLocaleString()} times, which shows how much the seat values themselves could wobble.`, lineLabel: "Without seat luck" },
    room && room.exp && { key: "room", label: "Room audit", exp: room.exp, real: room.exp.real, own: room.exp.adjPts - tb.pts, luckName: "room luck", ownNote: `its rooms were ${Math.abs(room.meanPct).toFixed(1)}% of the field ${room.meanPct >= 0 ? "harder" : "easier"} than billed on average, worth about ${Math.abs(room.exp.luckPts).toFixed(2)} points`,
      pool: (E.order || {}).room || [], runs: E.luckSamples, unit: "versions", verb: "ranked",
      what: `Room luck taken out using the room audit's own numbers: every 1% of the field harder than billed is worth about ${(E.roomRate || 0.02).toFixed(3)} points (a rate fitted from the luck model), so a team ${sgn(room.meanPct, 1)}% harder on average over ${R.meta.rounds} rounds gets ${sgn(-(room.exp.luckPts), 2)} points. Everyone is then re-ranked. The spread borrows its width from the model's uncertainty about room luck.`, lineLabel: "Without room luck" },
    luck && luck.exp && { key: "luck", label: "Overall", exp: luck.exp, real: luck.exp.real, own: luck.exp.adjPts - tb.pts, luckName: "draw luck",
      pool: (E.order || {}).luck || [], runs: E.luckSamples, unit: "versions", verb: "ranked",
      what: `All draw luck taken out: its points minus seat and room luck, re-ranked against everyone else's. The bars re-rank ${(E.luckSamples || 0).toLocaleString()} plausible versions of everyone's luck.`, lineLabel: "Without draw luck" },
  ].filter(Boolean);
  const active = views[0]?.key; // always start with the draw audit
  const moveTxt = (real, e) => (real == null ? "" : real === e ? "exactly its real finish" : real > e ? `${real - e} place${real - e === 1 ? "" : "s"} higher than its real ${ordinal(real)}` : `${e - real} place${e - real === 1 ? "" : "s"} lower than its real ${ordinal(real)}`);
  const nFull = R.meta.nComplete, tabRank = parseInt(tb.rank, 10) || null;
  // why it moved: its own adjustment, and who leapfrogged whom (everyone's luck comes out at once)
  const whyMoved = (v) => {
    const passedBy = v.pool.filter((o) => o.i !== i && o.real > v.real && o.exp < v.exp.rank);
    const passes = v.pool.filter((o) => o.i !== i && o.real < v.real && o.exp > v.exp.rank);
    const own = Math.abs(v.own) < 0.005 ? `Its own ${v.luckName} was about zero, so its points stay at ${tb.pts}.`
      : `Taking out its own ${v.luckName}${v.ownNote ? ` (${v.ownNote})` : ""} ${v.own > 0 ? "adds" : "removes"} ${Math.abs(v.own).toFixed(2)} points (${tb.pts} → ${(tb.pts + v.own).toFixed(2)}).`;
    const meRow = v.pool.find((o) => o.i === i), HAIR = 0.05;
    const myAdj = tb.pts + v.own + (meRow ? meRow.spread || 0 : 0), score = (o) => o.adj + (o.spread || 0);
    const names = (arr) => arr.slice(0, 4).map((o) => `${esc(R.teamsBasic[o.i].name)}${o.analysed === false ? " (missed rounds, unchanged)" : Math.abs(score(o) - myAdj) < HAIR ? " (by a hair)" : ""}`).join(", ") + (arr.length > 4 ? ` and ${arr.length - 4} more` : "");
    const others = [passedBy.length ? `${passedBy.length} team${passedBy.length === 1 ? "" : "s"} below it had worse ${v.luckName} and move${passedBy.length === 1 ? "s" : ""} past it (${names(passedBy)})` : "", passes.length ? `it moves past ${passes.length} team${passes.length === 1 ? "" : "s"} above it that had better ${v.luckName} (${names(passes)})` : ""].filter(Boolean);
    const hairs = [...passedBy, ...passes].filter((o) => Math.abs(score(o) - myAdj) < HAIR).length;
    return `<p class="small pc-why">${own}${others.length ? ` Meanwhile ${others.join("; ")}.` : ""}${hairs ? ` ${hairs === 1 ? "One of these swaps comes" : `${hairs} of these swaps come`} down to less than ${HAIR} points, well within the noise.` : ""}</p>`;
  };
  // the six expected places: draw / room / overall × (everyone's luck out, only its own luck out)
  const expGrid = () => {
    if (!views.length) return "";
    const cell = (v, own) => {
      if (!v) return `<td class="muted">not analysed</td>`;
      const e = v.exp, place = own ? e.ownRank : e.rank, d = v.real - place;
      const mark = own ? (d > 0 ? `<span class="mv mv-unl">▲${d}</span>` : d < 0 ? `<span class="mv mv-lk">▼${-d}</span>` : `<span class="mv">=</span>`)
        : !e.clear ? `<span class="mv nc" title="No clear change: the real finish is inside the 80% range (${e.range80[0]}–${e.range80[1]})">≈</span>`
        : e.byOthers ? `<span class="mv nc" title="Moved by other teams' luck, not its own">${d > 0 ? "▲" : "▼"}${Math.abs(d)} (others)</span>`
        : `<span class="mv ${d > 0 ? "mv-unl" : "mv-lk"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>`;
      return `<td><b>${ordinal(place)}</b> ${mark}${own ? "" : `<span class="rng">80%: ${e.range80[0]}–${e.range80[1]}</span>`}</td>`;
    };
    const by = Object.fromEntries(views.map((v) => [v.key, v]));
    return `<div class="exp-grid"><table class="tbl small">
      <thead><tr><th class="real-h">Real finish</th><th>Where it would have finished</th><th>Draw audit</th><th>Room audit</th><th>Overall</th></tr></thead>
      <tbody>
        <tr><td class="real-c" rowspan="2"><b>${ordinal(parseInt(tb.rank, 10) || 0)}</b><span>${tb.pts} team points</span></td><th title="The whole tab re-ranked with every team's luck taken out">Everyone's luck taken out</th>${["draw", "room", "luck"].map((k) => cell(by[k], false)).join("")}</tr>
        <tr><th title="Only this team's luck taken out; every other team keeps its real result">Only its own luck taken out</th>${["draw", "room", "luck"].map((k) => cell(by[k], true)).join("")}</tr>
      </tbody></table>
      <p class="small muted">Top row: the whole tab re-ranked with everyone's luck out, so neighbours move too (<span class="mv mv-unl">▲</span> red = its luck cost it places, <span class="mv mv-lk">▼</span> green = its luck gained it places, ≈ = inside its 80% range, no clear change). Bottom row: only this team's luck out, everyone else as they really finished. Teams level on points are spread out by their real order, so a tiny change can't jump a whole points group.</p></div>`;
  };
  const viewHTML = (v) => {
    const inBreak = v.exp.hist.slice(0, bk).reduce((a, c) => a + c, 0) / v.runs;
    // room/overall only cover teams that debated every round, so places are counted among those teams
    const poolNote = v.key !== "draw" && R.meta.nComplete < R.meta.nTeams ? `<p class="small muted">Teams that missed rounds aren't covered by the luck model, so they keep their real points here.</p>` : "";
    return `<div class="pview" data-pview="${v.key}" ${v.key === active ? "" : "hidden"}>
      <p class="muted small">${v.what}</p>
      ${placeChart(v.exp.hist, { runs: v.runs, breakSize: bk, realPlace: v.real, expectedPlace: v.exp.rank, ownPlace: v.exp.ownRank, range80: v.exp.range80, unit: v.unit })}
      <p class="legend pc-legend">${[["pc-in", "place inside the break"], ["pc-out", "outside it"], ["pc-real", "its real finish"], ["pm-mean-sw", "everyone's luck out"], ["pm-own-sw", "only its own luck out"], ["band80", `80% range (${ordinal(v.exp.range80[0])}–${ordinal(v.exp.range80[1])})`]].map(([c, t]) => `<span class="lg"><span class="sw ${c}"></span>${t}</span>`).join("")}</p>
      <p class="small pc-read"><b>${v.lineLabel}:</b> expected <b>${ordinal(v.exp.rank)}</b> (80% range ${ordinal(v.exp.range80[0])}–${ordinal(v.exp.range80[1])}). ${v.exp.clear ? `That's a clear move: ${moveTxt(v.real, v.exp.rank)}, outside the range.` : `Its real ${ordinal(v.real)} is inside that range, so <b>no clear change</b>.`} With only its own luck taken out it would be <b>${ordinal(v.exp.ownRank)}</b>. It ${v.verb} inside the top ${bk} in <b>${pct(inBreak)}</b> of ${v.unit}.</p>
      ${whyMoved(v)}
      ${poolNote}
    </div>`;
  };
  return `
  <div class="tp">
    <div class="tp-head">
      <div><div class="kicker">${esc(R.meta.name)} · TEAM PROFILE</div><h2>${esc(tb.name)}</h2>
        <div class="muted">${esc(tb.longName || "")} ${(tb.cats || []).map((c) => `<span class="chip">${esc(c)}</span>`).join(" ")}</div></div>
      <button class="btn ghost tp-close" aria-label="Close">Close ✕</button>
    </div>
    ${expGrid()}
    <div class="tp-cards">
      <a class="tp-card" href="#/report/draw"><h4>Draw audit ${pill(drawCls)}</h4><p>Seat score <b>${num(seat.score, 3)}</b>, ${sgn(seat.diff, 3)} vs a neutral 1.5 (≈ ${sgn((seat.diff || 0) * seat.played, 1)} points over ${seat.played} rounds).</p></a>
      <a class="tp-card" href="#/report/room"><h4>Room audit ${room ? pill(roomCls) : ""}</h4><p>${room ? `Opponents averaged <b>${sgn(room.meanPct, 1)}%</b> of the field ${room.meanPct >= 0 ? "stronger" : "weaker"} than billed. ${room.pullups ? `Pulled up ${room.pullups}×.` : "Never pulled up."}` : "Not analysed: the team missed rounds."}</p></a>
      <a class="tp-card" href="#/report/luck"><h4>Overall luck ${luck ? pill(luckCls) : ""}</h4><p>${luck ? `Seat ${sgn(luck.seatTot)} + room ${sgn(luck.roomTot)} = <b>${sgn(luck.total)}</b> points (80% range ${sgn(luck.totalCI[0], 1)} to ${sgn(luck.totalCI[1], 1)}).${sim ? `<br>Break chance ${pct(sim.pBreak)}${luck.exp ? `, ${pct(luck.exp.pBreak)} without luck` : ""}.` : ""}` : "Not analysed: the team missed rounds."}</p></a>
    </div>
    <h3>Round by round</h3>
    <div class="dt-scroll"><table class="tbl tp-rounds"><thead>
      <tr class="grp"><th colspan="5"></th><th>Draw audit</th><th>Room audit</th><th colspan="2">Overall</th></tr>
      <tr><th>Rd</th><th>Seat</th><th>Result</th><th>Room billing</th><th>Opponents (finish, <span class="opp-brk">gold</span> = broke)</th><th title="Average points teams scored from this seat this round">Seat value</th><th title="Opponents vs a typical room at this billing, % of the field (+ = harder)">Difficulty</th><th title="Seat luck in team points">Seat</th><th title="Room luck in team points">Room</th></tr>
    </thead><tbody>${rows}</tbody></table></div>
    ${views.length ? `<h3>Where it would have finished</h3>
      <div class="ptabs" role="tablist">${views.map((v) => `<button type="button" role="tab" class="ptab ${v.key === active ? "on" : ""}" data-ptab="${v.key}" aria-selected="${v.key === active}">${v.label}</button>`).join("")}</div>
      ${views.map(viewHTML).join("")}
      <p class="small muted">Everyone's luck is taken out at once, so a team can move even when its own luck was close to zero. These figures also ignore power pairing's knock-on effects (losing early usually means easier rooms later), so big moves are an upper bound.</p>` : ""}
    <p class="disclaimer small"><b>AI-assisted estimate.</b> Built with AI assistance; small-sample statistics, not a verdict. <a href="#/how/limits">Limitations →</a></p>
  </div>`;
}
