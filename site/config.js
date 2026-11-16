// The address of your Cloudflare Worker (the tab fetcher). Set this after deploying it.
// Example: "https://tab-fetch.yourname.workers.dev/"
export const RELAY_URL = "https://tab-fetch.aidanwong918.workers.dev/";

// Number of simulated re-runs of each tournament.
export const RUNS = 10000;

// Demo build: only the built-in Oxford/Cambridge tabs, precomputed. Leave false for the real site.
export const DEMO = false;
