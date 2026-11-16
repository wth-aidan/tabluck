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

  const hist = sim ? sim.placeHist : null;
  // expected finish: rank every team by its average re-run place, and take this team's position in that ranking
  const expectedPlace = sim ? 1 + R.sim.teams.filter((o) => o.meanPlace < sim.meanPlace).length : null;
  const bk = R.sim.breakSize;
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
      <div><b>${luck ? luck.modelPlace : "—"}</b><span>fair place (strength)</span></div>
      <div><b>${sim ? pct(sim.pBreak) : "—"}</b><span>break chance</span></div>
    </div>
    <div class="tp-cards">
      <a class="tp-card" href="#/report/draw"><h4>Draw audit ${pill(drawCls)}</h4><p>Seat score <b>${num(seat.score, 3)}</b>, ${sgn(seat.diff, 3)} vs a neutral 1.5 (≈ ${sgn((seat.diff || 0) * seat.played, 1)} points over ${seat.played} rounds).</p></a>
      <a class="tp-card" href="#/report/room"><h4>Room audit ${room ? pill(roomCls) : ""}</h4><p>${room ? `Opponents averaged <b>${sgn(room.meanPct, 1)}%</b> of the field ${room.meanPct >= 0 ? "stronger" : "weaker"} than billed. ${room.pullups ? `Pulled up ${room.pullups}×.` : "Never pulled up."}` : "Not analysed: the team missed rounds."}</p></a>
      <a class="tp-card" href="#/report/luck"><h4>Overall luck ${luck ? pill(luckCls) : ""}</h4><p>${luck ? `Seat ${sgn(luck.seatTot)} + room ${sgn(luck.roomTot)} = <b>${sgn(luck.total)}</b> points (80% range ${sgn(luck.totalCI[0], 1)} to ${sgn(luck.totalCI[1], 1)}).` : "Not analysed: the team missed rounds."}</p></a>
    </div>
    <h3>Round by round</h3>
    <div class="dt-scroll"><table class="tbl tp-rounds"><thead><tr>
      <th>Rd</th><th>Seat</th><th>Result</th><th>Room billing</th><th>Opponents (finish)</th><th title="Seat value that round">Seat value</th><th title="Room audit difficulty">Room diff.</th><th title="Model seat luck, points">Seat luck</th><th title="Model room luck, points">Room luck</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    ${hist ? `<h3>Where it finished across ${R.sim.runs.toLocaleString()} re-runs</h3>
      <p class="muted small">Each re-run replays the tournament with the same team strengths but a fresh draw and fresh luck on the day. Each bar is how often ${esc(tb.name)} ended up in that place.</p>
      ${placeChart(hist, { runs: R.sim.runs, breakSize: bk, realPlace: luck ? luck.tabPlace : null, expectedPlace, range80: sim.place80 })}
      <p class="legend pc-legend"><span class="sw pc-in"></span>place inside the break <span class="sw pc-out"></span>outside it <span class="sw pc-real"></span>its real finish <span class="sw band80"></span>middle 80% of re-runs (${ordinal(sim.place80[0])}–${ordinal(sim.place80[1])})</p>
      <p class="small pc-read">Reading it: it broke in <b>${pct(sim.pBreak)}</b> of re-runs (bars left of the red line). Ranking every team by its average place across the re-runs puts it <b>${ordinal(expectedPlace)}</b> (the green line)${luck ? `, against a real finish of <b>${ordinal(luck.tabPlace)}</b>: ${luck.tabPlace === expectedPlace ? "exactly where expected" : luck.tabPlace < expectedPlace ? `${expectedPlace - luck.tabPlace} place${expectedPlace - luck.tabPlace === 1 ? "" : "s"} higher than expected` : `${luck.tabPlace - expectedPlace} place${luck.tabPlace - expectedPlace === 1 ? "" : "s"} lower than expected`}` : ""}.</p>` : ""}
    <p class="disclaimer small"><b>AI-assisted estimate.</b> Built with AI assistance; small-sample statistics, not a verdict. <a href="#/how/limits">Limitations →</a></p>
  </div>`;
}
