# TabLuck

**How much of a British Parliamentary tab was luck?** Paste a Tabbycat tab site and get three reports, entirely in the browser:

1. **Draw audit**: were a team's seats good ones, valued by the points teams actually scored from each seat in each round.
2. **Room audit**: were a team's opponents stronger or weaker than its room was billed as.
3. **Overall luck**: a head-to-head model of seats and opponents together, in team points, plus 10,000 re-runs of the tournament for break chances.

Every report also gives each team an **expected place**: its points with that report's luck taken out, re-ranked against the whole tab. It's shown two ways in each team's profile (everyone's luck taken out at once, and only that team's own luck), with an 80% range. Arrows (▲/▼) only appear when the real finish falls outside that range; otherwise it's ≈, no clear change.

Each report is a stack of interactive slides (sortable, searchable tables, team profiles, adjustable thresholds), with downloads as PowerPoint and CSV. A "How it works" page explains every method, and a limitations section covers each analysis.

> **Built with AI assistance.** The methods and code were developed with Claude (Anthropic) and checked against an independent Python implementation on Oxford IV 2026 and Cambridge IV 2026. Results are statistical estimates, not verdicts. Not affiliated with Tabbycat, calicotab or any tournament.

---

## How it fits together

```
 visitor's browser                         Cloudflare (free)                 tab site
┌───────────────────────────┐   ?url=…   ┌────────────────────────┐  GET  ┌──────────────────────┐
│ site/  (static page)      │ ─────────▶ │ worker/worker.js       │ ────▶ │ *.calicotab.com      │
│  · reads ~11 tab pages    │ ◀───────── │  read-only relay       │ ◀──── │  public API + team   │
│  · runs all analysis      │   + CORS   │  calicotab only, 1h    │       │  tab page            │
│    in a Web Worker        │            │  cache                 │       └──────────────────────┘
└───────────────────────────┘            └────────────────────────┘
```

Browsers don't let one website read another, so a tiny Worker fetches the public tab pages and hands them back. It accepts only calicotab addresses, only reads, and caches each page for an hour so the tab site isn't loaded repeatedly. All the maths runs in the visitor's browser.

```
site/            the website (plain HTML/CSS/JS, no build step)
  index.html  app.js  report.js  team.js  how.js  decks.js  lib.js  scrape.js  config.js  styles.css
  engine/        analysis: prep, seat (draw audit), room (room audit), model (luck), sim (re-runs), worker
  data/          saved copies of two tournaments (open #/sample/0 or #/sample/1; no Worker needed)
  vendor/        PptxGenJS (MIT) for the slide downloads
worker/          the Cloudflare Worker (tab fetcher) + optional wrangler.toml
tests/           engine vs. Python results, Worker safety rules, browser tests
```

---

## Deploying it (about 15 minutes, free)

You need a free **GitHub** account and a free **Cloudflare** account.

### 1. Put the code on GitHub
1. On github.com, click **New repository**, name it e.g. `tabluck`, and leave it empty.
2. Upload this folder: on the new repo's page, choose **uploading an existing file**, then drag in everything inside this folder (`site`, `worker`, `tests`, `README.md`, and the rest). Commit.
   *(Or from a terminal: `git init && git add . && git commit -m "TabLuck" && git branch -M main && git remote add origin https://github.com/YOU/tabluck.git && git push -u origin main`.)*

### 2. Deploy the tab fetcher (Worker)
1. In the Cloudflare dashboard: **Workers & Pages → Create → Create Worker**. Name it `tab-fetch` and click **Deploy**.
2. Click **Edit code**, delete the sample code, paste in the contents of `worker/worker.js`, then **Deploy**.
3. Copy its address, e.g. `https://tab-fetch.yourname.workers.dev/`.
4. Quick check: open `https://tab-fetch.yourname.workers.dev/?url=https://oxfordiv26.calicotab.com/api/v1/tournaments` in your browser. You should see some JSON.

### 3. Point the site at the Worker
Edit `site/config.js` on GitHub (pencil icon) and replace `https://REPLACE-ME.workers.dev/` with your Worker's address. Commit.

### 4. Deploy the site (Pages)
1. Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, then pick your `tabluck` repository.
2. Build settings: **Framework preset: None**, **Build command: (leave empty)**, **Build output directory: `site`**.
3. **Save and Deploy**. You get an address like `https://tabluck.pages.dev`.

### 5. Lock the Worker to your site (recommended)
In the Worker: **Settings → Variables and Secrets → Add**: name `SITE_ORIGINS`, value `https://tabluck.pages.dev` (your Pages address). Deploy. Now only your site can use the fetcher.

### 6. Test
Open your site and try `oxfordiv26.calicotab.com` and `cambridgeiv2026.calicotab.com/cambridge2026/`. Results should match the decks made earlier: for example, in Cambridge places 1–16, Oxford F is lucky (about +1.4 points) and broke with roughly a 39% break chance.

From now on, any change you push to GitHub redeploys the site automatically. To update the Worker, paste the new `worker.js` again (or run `npx wrangler deploy` in `worker/`).

**Optional:** a custom domain (Pages → Custom domains), about £10 a year from any registrar.

---

## Sharing

Every report has a **Share link** button. Links look like `https://tabluck.pages.dev/?tab=oxfordiv26.calicotab.com#/report/room`: opening one runs the analysis and lands on that report.

## Running it locally

```bash
npm run serve        # then open http://localhost:8080
npm test             # engine vs. Python results, expected-place checks, Worker safety rules
```
Without a Worker, the two saved copies still work: open `http://localhost:8080/#/sample/0` (Oxford IV 2026) or `#/sample/1` (Cambridge IV 2026).

`tests/ui.mjs` and `tests/live_mock.mjs` are browser tests (Playwright + Chrome). The second puts a fake tab site behind a fake relay to exercise the whole paste-a-URL flow.

## What's supported

- British Parliamentary tabs on `*.calicotab.com` (Tabbycat). Preliminary rounds only; the open break size is read from the tab (default 16).
- If the team tab is hidden, results come from the public ballots (slower). If the data API is off, the draw is rebuilt from the team tab. The site says when either happens.
- Teams that missed rounds, swing teams and no-shows are excluded from the team tables but count as opponents.
- Not yet: AP/WSDC, ESL/novice break modelling, self-hosted Tabbycat sites (add hostnames with the Worker's `EXTRA_HOSTS` variable; the site's own check in `scrape.js` also needs relaxing).

## Being a good neighbour

calicotab is run by volunteers. The Worker only reads public pages, caches them for an hour, and an analysis makes about a dozen requests. Please don't remove the cache or the host restriction.

## Licence

MIT. PptxGenJS is © Brent Ely, MIT (see `site/vendor/PPTXGENJS-LICENSE.txt`).
