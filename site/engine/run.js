// Runs all three analyses on one dataset.
import { prepare } from "./prep.js";
import { seatAudit } from "./seat.js";
import { roomAudit, billing } from "./room.js";
import { luckModel, holdout } from "./model.js";
import { simulate } from "./sim.js";
import { drawExpected, luckExpected, roomAuditExpected } from "./expected.js";
import { pearson, pstdev, mean } from "./util.js";

export function runAll(ds, { runs = 10000, nSamples = 600, onProgress = () => {} } = {}) {
  const t0 = Date.now();
  const P = prepare(ds);
  // keep very large tabs (e.g. Worlds) to a reasonable wait: fewer re-runs and samples, with floors
  const size = P.n * P.R;
  if (size > 1500) { runs = Math.max(4000, Math.round((runs * 1500) / size)); nSamples = Math.max(300, Math.round((nSamples * 1500) / size)); }
  onProgress("Draw audit", 0);
  const seat = seatAudit(P);
  onProgress("Room audit", 0);
  const bill = billing(P);
  const room = roomAudit(P, { bill });
  const model = luckModel(P, bill, { nSamples, onProgress });
  const validation = holdout(P, model.loo);
  const sim = simulate(P, model.full, { runs, breakSize: P.breakSize, onProgress });

  // expected places, each from its own analysis only (see expected.js): points − that analysis's luck, re-ranked
  const dExp = drawExpected(P, seat);
  const rExp = roomAuditExpected(P, room, model, { breakSize: P.breakSize });
  const oExp = luckExpected(P, model, { breakSize: P.breakSize });
  // real = the team's real place within the same pool; clear = the real place falls outside the 80% range
  // byOthers: a clear move that its own luck alone wouldn't produce (it moves only because others' luck came out)
  const pack = (e, real) => ({ rank: e.expRank, ownRank: e.ownRank, range80: e.range80, hist: e.placeHist, meanPlace: e.meanPlace, adjPts: e.adjPts, real,
    clear: real != null && (real < e.range80[0] || real > e.range80[1]),
    byOthers: real != null && (real < e.range80[0] || real > e.range80[1]) && (e.ownRank === real || Math.sign(real - e.ownRank) !== Math.sign(real - e.expRank)), ...(e.pBreak != null ? { pBreak: e.pBreak } : {}), ...(e.luckPts != null ? { luckPts: e.luckPts } : {}) });
  const dBy = new Map(dExp.teams.map((e) => [e.i, e])), rBy = new Map(rExp.teams.map((e) => [e.i, e])), oBy = new Map(oExp.teams.map((e) => [e.i, e]));
  seat.teams.forEach((t) => { if (dBy.has(t.i)) t.exp = pack(dBy.get(t.i), parseInt(P.T[t.i].rank, 10) || null); });
  // all three are on the real tab's scale: real = the team's tab place
  const tabPlace = (i) => parseInt(P.T[i].rank, 10) || null;
  room.teams.forEach((t) => { if (rBy.has(t.i)) t.exp = pack(rBy.get(t.i), tabPlace(t.i)); });
  model.teams.forEach((t) => { if (oBy.has(t.i)) t.exp = pack(oBy.get(t.i), tabPlace(t.i)); });
  // whole-tab orderings (including teams that missed rounds, who keep their real points) for the profile's "why it moved"
  const order = (rows) => rows.map((e) => ({ i: e.i, real: tabPlace(e.i), exp: e.expRank, adj: e.adjPts, spread: e.spread, analysed: e.analysed !== false }));
  const expMeta = { drawBoots: dExp.boots, drawPool: dExp.pool, luckSamples: oExp.samples, luckPool: oExp.teams.length, roomRate: rExp.rate,
    order: { draw: order(dExp.teams), room: order(rExp.teams), luck: order(oExp.teams) } };

  // light summaries used by the readouts
  const lt = model.teams;
  const luckStats = {
    sdSeat: pstdev(lt.map((t) => t.seatTot)), sdRoom: pstdev(lt.map((t) => t.roomTot)), sdTotal: pstdev(lt.map((t) => t.total)),
    corrPts: pearson(lt.map((t) => t.total), lt.map((t) => t.pts)),
    corrSeatRoom: pearson(lt.map((t) => t.seatTot), lt.map((t) => t.roomTot)),
    clear: lt.filter((t) => t.totalCI[0] > 0 || t.totalCI[1] < 0).length,
    ciWidth: mean(lt.map((t) => t.totalCI[1] - t.totalCI[0])),
  };
  const seatC = seat.teams.filter((t) => P.complete[t.i]);
  const roomStats = {
    corrPts: pearson(room.teams.map((t) => t.meanPct), room.teams.map((t) => t.pts)),
    corrSeat: pearson(room.teams.map((t) => t.meanPct), room.teams.map((t) => seat.teams[t.i].diff)),
  };
  const seatStats = { corrPts: pearson(seatC.map((t) => t.diff), seatC.map((t) => P.totalPts[t.i])) };

  // strip the heavy fit objects before sending to the page
  const modelOut = { teams: model.teams, seatBonus: model.seatBonus,
    strength: Object.fromEntries(model.full.s.map((v, i) => [i, v])) };
  return {
    meta: { name: ds.name, rounds: P.R, breakSize: P.breakSize, nTeams: P.n,
      nComplete: P.complete.filter(Boolean).length, nRooms: P.rooms.map((r) => r.length),
      speaksAvailable: P.speaksAvailable, warnings: P.warnings, seconds: (Date.now() - t0) / 1000, source: ds.source || "", nSamples, expected: expMeta },
    teamsBasic: P.T.map((t, i) => ({ i, id: t.id, name: t.name, longName: t.longName || t.name, cats: t.cats || [], rank: t.rank,
      results: t.results, complete: P.complete[i], pts: P.totalPts[i], seat: P.seat[i], roomOf: P.roomOf[i],
      spk: P.spk[i], spkTotal: t.spkTotal })),
    rounds: ds.rounds.map((r) => ({ name: r.name, motion: r.motion || "" })),
    rooms: P.rooms,
    seat, room: { ...room, billing: { team: room.billing.team } }, model: modelOut, validation, sim,
    stats: { luck: luckStats, room: roomStats, seat: seatStats },
  };
}
