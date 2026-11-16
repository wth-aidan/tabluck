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
  const name = (j) => `<a class="tlink" href="#/report/${kind}/team/${j}">${esc(R.teamsBasic[j].name)}</a> <span class="muted">(${esc(R.teamsBasic[j].rank)})</span>`;
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
      <td class="c">${tb.results[r] ? `<b>${PLACE[tb.results[r]]}</b>` : "—"}</td>
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
    seat.exp && { key: "draw", label: "Draw audit", exp: seat.exp, real: parseInt(tb.rank, 10) || null, own: -(seat.diff * seat.played), luckName: "seat luck",
      pool: R.seat.teams.filter((t) => t.exp).map((t) => ({ i: t.i, real: parseInt(R.teamsBasic[t.i].rank, 10), exp: t.exp.rank })), runs: E.drawBoots, unit: "re-samples", verb: "ranked",
      what: `Seat luck taken out, with no model: its points minus (seat score − 1.5) × rounds, re-ranked against everyone else's. The bars come from re-sampling each round's rooms ${(E.drawBoots || 0).toLocaleString()} times, which shows how much the seat values themselves could wobble.`, lineLabel: "Without seat luck" },
    room && room.exp && { key: "room", label: "Room audit", exp: room.exp, real: room.place, own: room.exp.adjPts - tb.pts, luckName: "room luck",
      pool: R.room.teams.filter((t) => t.exp).map((t) => ({ i: t.i, real: t.place, exp: t.exp.rank })), runs: E.luckSamples, unit: "versions", verb: "ranked", fullOnly: true,
      what: `Room luck taken out: its points minus the luck model's room luck, re-ranked against everyone else's. The bars re-rank ${(E.luckSamples || 0).toLocaleString()} plausible versions of everyone's room luck, from the model's uncertainty.`, lineLabel: "Without room luck" },
    luck && luck.exp && { key: "luck", label: "Overall", exp: luck.exp, real: luck.tabPlace, own: luck.exp.adjPts - tb.pts, luckName: "draw luck",
      pool: R.model.teams.filter((t) => t.exp).map((t) => ({ i: t.i, real: t.tabPlace, exp: t.exp.rank })), runs: E.luckSamples, unit: "versions", verb: "ranked", fullOnly: true,
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
      : `Taking out its own ${v.luckName} ${v.own > 0 ? "adds" : "removes"} ${Math.abs(v.own).toFixed(2)} points (${tb.pts} → ${(tb.pts + v.own).toFixed(2)}).`;
    const names = (arr) => arr.slice(0, 4).map((o) => esc(R.teamsBasic[o.i].name)).join(", ") + (arr.length > 4 ? ` and ${arr.length - 4} more` : "");
    const others = [passedBy.length ? `${passedBy.length} team${passedBy.length === 1 ? "" : "s"} below it had worse ${v.luckName} and move${passedBy.length === 1 ? "s" : ""} past it (${names(passedBy)})` : "", passes.length ? `it moves past ${passes.length} team${passes.length === 1 ? "" : "s"} above it that had better ${v.luckName} (${names(passes)})` : ""].filter(Boolean);
    return `<p class="small pc-why">${own}${others.length ? ` Meanwhile ${others.join("; ")}.` : ""}</p>`;
  };
  const viewHTML = (v) => {
    const inBreak = v.exp.hist.slice(0, bk).reduce((a, c) => a + c, 0) / v.runs;
    // room/overall only cover teams that debated every round, so places are counted among those teams
    const poolNote = v.fullOnly ? `<p class="small muted">Places here are counted among the ${nFull} teams that debated every round (the luck model only covers them)${tabRank && tabRank !== v.real ? `, so its real finish shows as ${ordinal(v.real)} (it's ${ordinal(tabRank)} on the full tab)` : ""}.</p>` : "";
    return `<div class="pview" data-pview="${v.key}" ${v.key === active ? "" : "hidden"}>
      <p class="muted small">${v.what}</p>
      ${placeChart(v.exp.hist, { runs: v.runs, breakSize: bk, realPlace: v.real, expectedPlace: v.exp.rank, range80: v.exp.range80, unit: v.unit })}
      <p class="legend pc-legend"><span class="sw pc-in"></span>place inside the break <span class="sw pc-out"></span>outside it <span class="sw pc-real"></span>its real finish <span class="sw band80"></span>80% range (${ordinal(v.exp.range80[0])}–${ordinal(v.exp.range80[1])})</p>
      <p class="small pc-read"><b>${v.lineLabel}:</b> expected <b>${ordinal(v.exp.rank)}</b>, ${moveTxt(v.real, v.exp.rank)}. It ${v.verb} inside the top ${bk} in <b>${pct(inBreak)}</b> of ${v.unit}.</p>
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
    <div class="tp-stats">
      <div><b>${esc(tb.rank)}</b><span>finish</span></div>
      <div><b>${tb.pts}</b><span>team points</span></div>
      <div><b>${luck && luck.exp ? ordinal(luck.exp.rank) : "—"}</b><span>expected without luck</span></div>
      <div><b>${sim ? pct(sim.pBreak) : "—"}</b><span>break chance${luck && luck.exp ? `<br>without luck: ${pct(luck.exp.pBreak)}` : ""}</span></div>
    </div>
    <div class="tp-cards">
      <a class="tp-card" href="#/report/draw"><h4>Draw audit ${pill(drawCls)}</h4><p>Seat score <b>${num(seat.score, 3)}</b>, ${sgn(seat.diff, 3)} vs a neutral 1.5 (≈ ${sgn((seat.diff || 0) * seat.played, 1)} points over ${seat.played} rounds).${seat.exp ? `<br>Without seat luck: <b>${ordinal(seat.exp.rank)}</b> (80% range ${seat.exp.range80[0]}–${seat.exp.range80[1]}).` : ""}</p></a>
      <a class="tp-card" href="#/report/room"><h4>Room audit ${room ? pill(roomCls) : ""}</h4><p>${room ? `Opponents averaged <b>${sgn(room.meanPct, 1)}%</b> of the field ${room.meanPct >= 0 ? "stronger" : "weaker"} than billed. ${room.pullups ? `Pulled up ${room.pullups}×.` : "Never pulled up."}${room.exp ? `<br>Without room luck: <b>${ordinal(room.exp.rank)}</b> (80% range ${room.exp.range80[0]}–${room.exp.range80[1]}).` : ""}` : "Not analysed: the team missed rounds."}</p></a>
      <a class="tp-card" href="#/report/luck"><h4>Overall luck ${luck ? pill(luckCls) : ""}</h4><p>${luck ? `Seat ${sgn(luck.seatTot)} + room ${sgn(luck.roomTot)} = <b>${sgn(luck.total)}</b> points (80% range ${sgn(luck.totalCI[0], 1)} to ${sgn(luck.totalCI[1], 1)}).${luck.exp ? `<br>Without draw luck: <b>${ordinal(luck.exp.rank)}</b> (80% range ${luck.exp.range80[0]}–${luck.exp.range80[1]}).` : ""}` : "Not analysed: the team missed rounds."}</p></a>
    </div>
    <h3>Round by round</h3>
    <div class="dt-scroll"><table class="tbl tp-rounds"><thead><tr>
      <th>Rd</th><th>Seat</th><th>Result</th><th>Room billing</th><th>Opponents (finish)</th><th title="Seat value that round">Seat value</th><th title="Room audit difficulty">Room diff.</th><th title="Model seat luck, points">Seat luck</th><th title="Model room luck, points">Room luck</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${views.length ? `<h3>Where it would have finished</h3>
      <div class="ptabs" role="tablist">${views.map((v) => `<button type="button" role="tab" class="ptab ${v.key === active ? "on" : ""}" data-ptab="${v.key}" aria-selected="${v.key === active}">${v.label}</button>`).join("")}</div>
      ${views.map(viewHTML).join("")}
      <p class="small muted">Everyone's luck is taken out at once, so a team can move even when its own luck was close to zero. These figures also ignore power pairing's knock-on effects (losing early usually means easier rooms later), so big moves are an upper bound.</p>` : ""}
    <p class="disclaimer small"><b>AI-assisted estimate.</b> Built with AI assistance; small-sample statistics, not a verdict. <a href="#/how/limits">Limitations →</a></p>
  </div>`;
}
