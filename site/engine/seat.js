// Draw (seat) audit: how good were the seats a team drew, by each round's motion-tab averages.
import { SEATS } from "./prep.js";
import { roundTo } from "./util.js";

export function seatAverages(P, { round2 = false } = {}) {
  return P.rooms.map((rr, r) => {
    const s = [0, 0, 0, 0], c = [0, 0, 0, 0];
    rr.forEach((room) => room.forEach((t, k) => { const p = P.pts[t][r]; if (p !== null) { s[k] += p; c[k]++; } }));
    return s.map((v, k) => (c[k] ? (round2 ? Math.round((v / c[k]) * 100) / 100 : v / c[k]) : null));
  });
}

export function seatAudit(P, { threshold = 0.05, round2 = false, averages = null } = {}) {
  const avg = averages || seatAverages(P, { round2 });
  const teams = P.T.map((t, i) => {
    const seq = P.seat[i].map((s) => (s === null ? null : SEATS[s]));
    const vals = [];
    P.seat[i].forEach((s, r) => { if (s !== null && P.pts[i][r] !== null && avg[r][s] !== null) vals.push(avg[r][s]); });
    const played = vals.length;
    const score = played ? vals.reduce((a, b) => a + b, 0) / played : null;
    const diff = score === null ? null : score - 1.5;
    const d = diff === null ? null : roundTo(diff, 9);
    const cls = d === null ? "DNC" : d > threshold ? "Lucky" : d < -threshold ? "Unlucky" : "Neutral";
    return { i, team: t.name, rank: t.rank, seq, played, score, diff, cls, perRound: P.seat[i].map((s, r) => (s === null ? null : avg[r][s])) };
  });
  return { averages: avg, threshold, teams };
}
