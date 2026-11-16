// Runs the analysis off the main thread so the page stays responsive.
import { runAll } from "./run.js";

self.onmessage = (e) => {
  const { ds, opts } = e.data;
  let last = 0;
  try {
    const result = runAll(ds, {
      ...opts,
      onProgress: (label, frac) => {
        const now = Date.now();
        if (now - last > 80 || frac === 0) { last = now; self.postMessage({ type: "progress", label, frac }); }
      },
    });
    self.postMessage({ type: "done", result });
  } catch (err) {
    self.postMessage({ type: "error", message: err && err.message ? err.message : String(err) });
  }
};
