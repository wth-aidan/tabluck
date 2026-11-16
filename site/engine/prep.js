// Turns a normalised tournament dataset into index-based arrays every analysis uses.
//
// Dataset shape (produced by the fetcher or a sample file):
// {
//   name, format: "bp", breakSize,
//   rounds: [{ name, rooms: [[OG, OO, CG, CO], ...] }],     // team ids, seat order
//   teams: [{ id, name, cats: [], rank: "1" | "3=", results: [1..4 | null per round],
//             spk: [{ sum, n } | null per round], spkTotal }]  // teams in official tab order
// }

export const SEATS = ["OG", "OO", "CG", "CO"];

export function prepare(ds) {
  const T = ds.teams;
  const n = T.length;
  const R = ds.rounds.length;
  if (!R) throw new Error("No completed preliminary rounds found.");
  const idx = new Map(T.map((t, i) => [t.id, i]));
  const warnings = [];

  const rooms = ds.rounds.map((rd, r) =>
    rd.rooms.map((room) => {
      if (room.length !== 4) throw new Error(`Round ${r + 1} has a room with ${room.length} teams; only British Parliamentary (4 teams) is supported.`);
      return room.map((id) => {
        if (!idx.has(id)) throw new Error(`Round ${r + 1} lists a team that is not on the team tab (${id}).`);
        return idx.get(id);
      });
    })
  );

  // seat and room of each team in each round
  const seat = Array.from({ length: n }, () => new Array(R).fill(null));
  const roomOf = Array.from({ length: n }, () => new Array(R).fill(null));
  rooms.forEach((rr, r) => rr.forEach((room, k) => room.forEach((t, s) => {
    if (seat[t][r] !== null) throw new Error(`${T[t].name} appears twice in round ${r + 1}.`);
    seat[t][r] = s; roomOf[t][r] = k;
  })));

  // results -> points; reconcile with the draw
  const pts = T.map((t, i) => {
    const res = (t.results || []).slice(0, R);
    return Array.from({ length: R }, (_, r) => {
      const p = res[r];
      const inDraw = seat[i][r] !== null;
      if (p == null) {
        if (inDraw) warnings.push(`${t.name} is in the round ${r + 1} draw but has no result; treated as missing.`);
        return null;
      }
      if (!inDraw) { warnings.push(`${t.name} has a round ${r + 1} result but is not in that draw; ignored.`); return null; }
      return 4 - p;
    });
  });

  const complete = pts.map((p) => p.every((v) => v !== null));
  const inAnyDraw = seat.map((s) => s.some((v) => v !== null));

  // speaks per round; rounds where fewer than two speeches are listed (iron-person, swing)
  // get the missing part of the team-tab total, shared in proportion to what is listed
  let speaksAvailable = T.some((t) => (t.spk || []).some((v) => v && v.sum > 0));
  const spk = T.map((t, i) => {
    const s = (t.spk || []).slice(0, R);
    const known = Array.from({ length: R }, (_, r) => (s[r] ? s[r].sum : 0));
    const partial = Array.from({ length: R }, (_, r) => pts[i][r] !== null && (!s[r] || s[r].n < 2));
    const vals = known.slice();
    if (t.spkTotal != null) {
      const missing = t.spkTotal - known.reduce((a, b) => a + b, 0);
      const base = known.reduce((a, k, r) => a + (partial[r] ? k : 0), 0);
      for (let r = 0; r < R; r++) if (partial[r]) vals[r] = known[r] + (base ? (missing * known[r]) / base : 0);
    }
    return vals;
  });

  const totalPts = pts.map((p) => p.reduce((a, v) => a + (v || 0), 0));
  return { ds, T, n, R, idx, rooms, seat, roomOf, pts, complete, inAnyDraw, spk, speaksAvailable, totalPts, warnings,
    breakSize: ds.breakSize || 16 };
}
