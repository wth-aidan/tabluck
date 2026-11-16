// Room audit: how strong each team's opponents turned out to be, against what its room was billed as.
//
// Billing: rooms ranked each round by the four teams' points going in, then speaks going in.
// Opponent strength: place on the final table with that round removed (points, then speaks),
// so a team's own result against them can't move them. Typical: what rooms at that billing held
// that round (when all rooms tie, e.g. round 1: the overall average; otherwise a straight-line fit).
import { linfit, mean, roundTo } from "./util.js";

export function billing(P) {
  const prePts = new Float64Array(P.n), preSpk = new Float64Array(P.n);
  const out = []; // per round: array of room records
  const teamBill = Array.from({ length: P.n }, () => new Array(P.R).fill(null));
  for (let r = 0; r < P.R; r++) {
    const rr = P.rooms[r], Rr = rr.length;
    const keys = rr.map((room) => [room.reduce((a, t) => a + prePts[t], 0), room.reduce((a, t) => a + preSpk[t], 0)]);
    const order = rr.map((_, k) => k).sort((a, b) => keys[b][0] - keys[a][0] || keys[b][1] - keys[a][1]);
    const rank = new Array(Rr);
    for (let i = 0; i < Rr;) {
      let j = i;
      while (j + 1 < Rr && keys[order[j + 1]][0] === keys[order[i]][0] && keys[order[j + 1]][1] === keys[order[i]][1]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) rank[order[k]] = avg;
      i = j + 1;
    }
    const recs = rr.map((room, k) => {
      const maxp = Math.max(...room.map((t) => prePts[t]));
      const rec = { round: r, roomRank: rank[k], R: Rr, teams: room, prePts: room.map((t) => prePts[t]), pct: (rank[k] - 0.5) / Rr };
      room.forEach((t, s) => { teamBill[t][r] = { roomRank: rank[k], R: Rr, pct: rec.pct, pullup: prePts[t] < maxp, prePts: prePts[t], room: k }; });
      return rec;
    });
    out.push(recs);
    rr.forEach((room) => room.forEach((t) => { prePts[t] += P.pts[t][r] || 0; preSpk[t] += P.spk[t][r] || 0; }));
  }
  return { rooms: out, team: teamBill };
}

export function roomAudit(P, { threshold = 2.5, bill = null } = {}) {
  const B = bill || billing(P);
  const comp = [];
  for (let i = 0; i < P.n; i++) if (P.complete[i]) comp.push(i);
  const Nc = comp.length;
  const isC = new Uint8Array(P.n); comp.forEach((t) => (isC[t] = 1));

  // place on the table with round r removed, complete teams only (ties keep tab order)
  const excl = [];
  for (let r = 0; r < P.R; r++) {
    const key = new Map(comp.map((t) => {
      let p = 0, s = 0;
      for (let i = 0; i < P.R; i++) if (i !== r) { p += P.pts[t][i]; s += P.spk[t][i]; }
      return [t, [p, s]];
    }));
    const ord = comp.slice().sort((a, b) => key.get(b)[0] - key.get(a)[0] || key.get(b)[1] - key.get(a)[1] || a - b);
    const place = new Map(ord.map((t, k) => [t, k + 1]));
    excl.push(place);
  }

  const per = new Map(comp.map((t) => [t, new Array(P.R).fill(null)]));
  for (let r = 0; r < P.R; r++) {
    const obs = [];
    B.rooms[r].forEach((rec) => rec.teams.forEach((t) => {
      if (!isC[t]) return;
      const opps = rec.teams.filter((o) => o !== t && isC[o]);
      if (!opps.length) return;
      obs.push({ t, p: rec.pct, roomRank: rec.roomRank, actual: mean(opps.map((o) => excl[r].get(o))), opps });
    }));
    const ps = obs.map((o) => o.p);
    const tied = Math.max(...ps) - Math.min(...ps) < 1e-12;
    const fit = tied ? { a: mean(obs.map((o) => o.actual)), b: 0 } : linfit(ps, obs.map((o) => o.actual));
    obs.forEach((o) => {
      o.expected = fit.a + fit.b * o.p;
      o.hardPlaces = o.expected - o.actual;
      o.hardPct = (o.hardPlaces / Nc) * 100;
      per.get(o.t)[r] = o;
    });
  }

  const teams = comp.map((t, k) => {
    const rr = per.get(t);
    const ok = rr.every((o) => o);
    const h = rr.map((o) => (o ? o.hardPct : null));
    const valid = h.filter((v) => v !== null);
    const meanPct = valid.length ? mean(valid) : null;
    const v1 = meanPct === null ? null : roundTo(meanPct, 1);
    const cls = v1 === null ? "n/a" : v1 > threshold ? "Hard" : v1 < -threshold ? "Soft" : "Fair";
    return {
      i: t, team: P.T[t].name, rank: P.T[t].rank, place: k + 1, pts: P.totalPts[t], complete: ok,
      roomRank: rr.map((o) => (o ? o.roomRank : null)), oppPlace: rr.map((o) => (o ? o.actual : null)),
      expPlace: rr.map((o) => (o ? o.expected : null)), hardPct: h, meanPct, cls,
      opps: rr.map((o) => (o ? o.opps : [])), pullups: B.team[t].filter((b) => b && b.pullup).length,
    };
  });
  return { N: Nc, threshold, teams, billing: B };
}
