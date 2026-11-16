// Generate a synthetic BP tournament (power-paired, with drop-outs and swings) and time the full engine on it.
import { runAll } from "../site/engine/run.js";
import { rng } from "../site/engine/util.js";
export function synth({ teams = 337, rounds = 9, seed = 3, dropouts = 6 } = {}) {
  const rand = rng(seed), N = teams + ((4 - (teams % 4)) % 4);
  const str = Array.from({ length: N }, () => { let u = 0; for (let k = 0; k < 6; k++) u += rand(); return (u - 3) * 1.2; });
  const ids = Array.from({ length: N }, (_, i) => (i < teams ? `T${i}` : `Swing ${i}`));
  const pts = new Array(N).fill(0), res = ids.map(() => []), spk = ids.map(() => []);
  const ds = { name: `Synthetic ${teams}x${rounds}`, format: "bp", breakSize: 48, rounds: [], teams: [] };
  for (let r = 0; r < rounds; r++) {
    let active = ids.map((_, i) => i).filter((i) => !(i < dropouts && r >= rounds - 2));
    while (active.length % 4) active.pop();
    const order = active.map((i) => [pts[i] + rand(), i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const rooms = [];
    for (let k = 0; k < order.length; k += 4) {
      const room = order.slice(k, k + 4);
      const perf = room.map((i) => str[i] + -Math.log(-Math.log(rand())));
      const rank = perf.map((p) => perf.filter((q) => q > p).length);
      room.forEach((i, s) => { res[i][r] = rank[s] + 1; pts[i] += 3 - rank[s]; spk[i][r] = { sum: 150 + 4 * (3 - rank[s]) + Math.round(rand() * 6), n: 2 }; });
      rooms.push(room.map((i) => ids[i]));
    }
    ds.rounds.push({ name: `Round ${r + 1}`, abbr: `R${r + 1}`, rooms });
  }
  const order = ids.map((_, i) => i).sort((a, b) => pts[b] - pts[a] || a - b);
  ds.teams = order.map((i, k) => ({ id: ids[i], name: ids[i], cats: i % 7 === 0 ? ["ESL"] : [], rank: String(k + 1),
    results: Array.from({ length: rounds }, (_, r) => res[i][r] || null), spk: Array.from({ length: rounds }, (_, r) => spk[i][r] || null),
    spkTotal: spk[i].reduce((a, s) => a + (s ? s.sum : 0), 0) }));
  return ds;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [teams, rounds] of [[337, 9], [188, 9], [40, 3]]) {
    const ds = synth({ teams, rounds });
    const t0 = Date.now(); let last = "";
    const R = runAll(ds, { runs: 10000, onProgress: (l) => { if (l !== last) { last = l; } } });
    console.log(`${ds.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s total | complete ${R.meta.nComplete} | rooms/round ${[...new Set(R.meta.nRooms)].join("/")} | holdout model ${(R.validation.model.acc * 100).toFixed(1)}% vs points ${(R.validation.points.acc * 100).toFixed(1)}% | overlap ${R.sim.summary.overlapReal.toFixed(1)}/${R.sim.breakSize}`);
  }
}
