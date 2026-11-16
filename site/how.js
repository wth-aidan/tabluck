// "How it works" page. Every section has an id so reports can link straight to it:
// #/how/overview, ai, data, draw, room, luck, limits, limits-general, limits-draw, limits-room, limits-luck, limits-data

export const HOW_SECTIONS = [
  ["overview", "What this does"], ["ai", "AI assistance"], ["data", "Where the data comes from"],
  ["draw", "Draw audit"], ["room", "Room audit"], ["luck", "Overall luck model"], ["limits", "Limitations"],
];

export function howHTML() {
  return `
<div class="how">
  <aside class="how-nav" aria-label="Sections">
    ${HOW_SECTIONS.map(([id, t]) => `<a href="#/how/${id}">${t}</a>`).join("")}
    <div class="how-sub">
      <a href="#/how/limits-general">· General</a><a href="#/how/limits-draw">· Draw audit</a><a href="#/how/limits-room">· Room audit</a>
      <a href="#/how/limits-luck">· Luck model</a><a href="#/how/limits-data">· Data</a>
    </div>
  </aside>
  <article class="how-body">

  <section id="how-overview">
    <h1>How it works</h1>
    <p class="lede">Paste a British Parliamentary tab and this site measures how much of the tab came down to the draw rather than the debating. It runs three separate analyses, from simplest to most complete.</p>
    <div class="how-cards">
      <a class="how-card" href="#/how/draw"><b>Draw audit</b><span>Were your seats good ones? Each seat in each round is scored by how many points teams in it actually took.</span></a>
      <a class="how-card" href="#/how/room"><b>Room audit</b><span>Were your opponents stronger or weaker than your room was meant to be?</span></a>
      <a class="how-card" href="#/how/luck"><b>Overall luck model</b><span>One model for seats and opponents together, in team points, then the whole tournament re-run 10,000 times to estimate break chances.</span></a>
    </div>
    <p>Nothing here is a verdict on any team or adjudicator. All three are statistical estimates from a small number of rounds; read the <a href="#/how/limits">limitations</a> before drawing conclusions.</p>
  </section>

  <section id="how-ai" class="callout-section">
    <h2>Built with AI assistance</h2>
    <p>This site, its analysis code and these explanations were developed with the help of an AI assistant (Claude, made by Anthropic). The methods were designed in conversation with a person, and the code was checked against independent calculations: on two tournaments (Oxford IV 2026 and Cambridge IV 2026) the site's numbers match a separate Python implementation, and the data it reads matches the published tabs exactly.</p>
    <p>That reduces the risk of mistakes but doesn't remove it. AI-assisted analysis can contain errors in reasoning or code that no one has spotted yet, and the models themselves rest on simplifying assumptions (listed under <a href="#/how/limits">Limitations</a>).</p>
    <ul>
      <li>Treat every number as an estimate with uncertainty, not a fact about what "should" have happened.</li>
      <li>Don't use it to challenge results, adjudicators or tab decisions.</li>
      <li>This site is not affiliated with Tabbycat, calicotab or any tournament.</li>
    </ul>
  </section>

  <section id="how-data">
    <h2>Where the data comes from</h2>
    <p>Everything comes from the tournament's public tab site, read through a small relay because browsers don't let one website read another directly. About a dozen requests per tournament:</p>
    <ul>
      <li><b>Tabbycat's public data API:</b> rounds, the draw for each round (which teams were in which room, in which seat), the team list, break sizes and motions.</li>
      <li><b>The public team tab page:</b> each team's placing and team speaker total in every round, and the official ranking.</li>
    </ul>
    <p>If a tournament hides its team tab, results are read from the published ballots instead (slower). If the data API is switched off, the draw is rebuilt from the team tab. The site says when either happens.</p>
    <p>The seat values in the draw audit are calculated from the draws and results, so they match the tournament's motions tab without needing it.</p>
    <p><b>What's included:</b> preliminary rounds only. Teams that missed rounds, swing teams and no-shows are left out of the team tables but still count as opponents. The relay keeps a copy of each public page for an hour so repeated analyses don't load the tab site again. Nothing you enter is stored.</p>
  </section>

  <section id="how-draw">
    <h2>Draw audit</h2>
    <p class="lede">Question: were the seats a team drew good ones?</p>
    <ol>
      <li><b>Value every seat.</b> For each round, average the team points scored from each seat (OG, OO, CG, CO) across all rooms. A seat where teams averaged 2.1 points was a good seat that round; 1.0 was a bad one. These are the same numbers as the motions tab.</li>
      <li><b>Score each team.</b> Average the values of the five seats it drew.</li>
      <li><b>Compare with 1.5.</b> In a four-team room, a perfectly neutral seat is worth 1.5 points. "vs 1.5" is the team's score minus 1.5.</li>
      <li><b>Classify.</b> Lucky above +0.050, unlucky below −0.050, neutral in between (exactly ±0.050 counts as neutral). You can change the threshold on the report.</li>
    </ol>
    <p><b>Reading it:</b> "vs 1.5" × number of rounds is roughly the team points the seats were worth. +0.200 over five rounds is about one point.</p>
    <p><b>Expected place:</b> take the seat luck out of every team's points (points − "vs 1.5" × rounds), then re-rank everyone on what's left (ties handled as in the overall section below). There's no model involved. ▲3 means a clear move three places up without seat luck, ▼ down, ≈ no clear change. The small range under it comes from re-sampling each round's rooms 1,000 times, which shows how much the seat values themselves could wobble.</p>
    <p><a href="#/how/limits-draw">Limitations of the draw audit →</a></p>
  </section>

  <section id="how-room">
    <h2>Room audit</h2>
    <p class="lede">Question: were a team's opponents stronger or weaker than its room was supposed to be?</p>
    <ol>
      <li><b>Bill every room.</b> Each round, rooms are ranked by the four teams' points going in, then speaks going in. In round 1 everyone has zero, so every room is an average room.</li>
      <li><b>Rate the opponents.</b> Each opponent's strength is its place on the final table <i>with that round removed</i>, so a team's own result against them can't make them look weaker or stronger.</li>
      <li><b>Compare with billing.</b> "Typical" is what rooms at that billing actually held that round (round 1: the overall average; later rounds: a straight-line fit from top room to bottom room). Difficulty = typical place − opponents' average place, as a percentage of the field.</li>
      <li><b>Average and classify.</b> The mean over rounds. Hard above +2.5%, soft below −2.5%, fair in between.</li>
    </ol>
    <p>Example: if your round 1 opponents finished, on average, 15th of 83 when an average room's opponents finish around 42nd, that round was (42 − 15) / 83 = +32.5% harder than billed.</p>
    <p><b>Pull-ups (PU)</b> count the rounds a team was placed in a room with a team on more points than itself.</p>
    <p><b>Expected place:</b> uses the room audit's own numbers, so the ranking follows the percentages in the table. A percentage of the field can't be taken off team points directly, so it needs one conversion rate: across every team and round, the luck model values a room 1% of the field harder than billed at about 0.02 team points (0.0216 at Oxford IV 2026, 0.0207 at Cambridge IV 2026). Each team gets points + rate × (its difficulty, added up over the rounds), and everyone is re-ranked. The audit has no uncertainty of its own, so the 80% range borrows its width from the luck model's uncertainty about room luck.</p>
    <p><a href="#/how/limits-room">Limitations of the room audit →</a></p>
  </section>

  <section id="how-luck">
    <h2>Overall luck model</h2>
    <p class="lede">Question: how many team points did the draw (seats and opponents together) give or cost each team, and did it change who broke?</p>
    <h3>The key idea</h3>
    <p>In BP, a team's points equal the number of teams it beat in the room: 1st beats three (3 points), 2nd beats two, 3rd beats one. So every room is six head-to-head contests.</p>
    <h3>Stage 1: fit strengths</h3>
    <p>Each team gets one hidden strength, and each seat in each round gets a bonus. The stronger team in a head-to-head is more likely to win, adjusted for seats. The strengths and bonuses are set so that every team's real points equal what its strength predicts against the opponents and seats it actually had. A 1st against strong teams from a bad seat therefore counts for more than a 1st against weak teams from a good seat.</p>
    <p>This solves the "spiral" of using results to judge opponents and opponents to judge results: everything is fitted at once, and there is exactly one answer whatever the starting point. Two imaginary average results per team stop an unbeaten team's strength running off to infinity.</p>
    <h3>Stage 2: luck in points</h3>
    <ul>
      <li><b>Seat luck:</b> expected points from the real seats minus expected points if all four seats in the room had been neutral.</li>
      <li><b>Room luck:</b> expected points against the real opponents minus against a typical room at that billing, using strengths fitted <i>without</i> that round.</li>
      <li><b>80% range:</b> where the total plausibly sits, given how uncertain the strengths are. An asterisk (*) means the range excludes zero.</li>
      <li>Lucky above +0.5 points, unlucky below −0.5, neutral in between.</li>
    </ul>
    <h3>Stage 3: re-run the tournament</h3>
    <p>The tournament is simulated 10,000 times with the fitted strengths: random round 1, power pairing afterwards (random within a points bracket, leftovers pulled up), balanced seats, and results drawn from the model. A team's <b>break chance</b> is the share of runs where it finishes inside the open break. This is about how settled the break was given each team's estimated strength.</p>
    <h3>Stage 4: expected place without luck</h3>
    <p><b>Two versions of each.</b> The team profile shows six expected places: for each of the three reports, (1) <i>everyone's luck taken out</i>, which re-ranks the whole tab, so neighbours move too, and (2) <i>only its own luck taken out</i>, where every other team keeps its real result. The first is a proper ranking; the second always moves the way the team's own luck says. The tables show the first.</p>
    <p><b>Ties.</b> Whole team points are coarse, and one points group can hold 20 teams split only by speaks. So each points group is spread over half a point either side, in real tab order: to pass a team on the same points you have to gain more than the gap between you. Without this, taking 0.01 points off a team would drop it below its entire points group.</p>
    <p><b>Clear moves only.</b> In all three reports, an expected place gets a ▲ or ▼ only when the team's real finish falls outside its 80% range. Otherwise it shows ≈, "no clear change". A red ▲ means the team would have finished higher without its luck (the draw cost it places); a green ▼ means lower (the draw gained it places), matching the red Unlucky and green Lucky labels. In crowded points groups, teams often swap places over differences of a few hundredths of a point, which the data can't really tell apart.</p>
    <p>Every team's points minus its total luck (seat + room), re-ranked. If every team's luck were zero this would give back the real tab exactly. The 80% range and the <b>break chance without luck</b> come from re-ranking the model's 600 plausible versions of everyone's luck. All three reports work the same way, each with its own luck: the draw audit uses seat luck only (no model), the room audit room luck only, and this report both.</p>
    <p>We also tried re-drawing the whole tournament with each team's real performances held fixed. It looked attractive, but comparing teams who never met had to lean on the model's strengths, which are pulled towards average, so it moved bottom teams up and top teams down by about a point whatever their luck. We dropped it.</p>
    <h3>Checking the model</h3>
    <p>For every round, the model is re-fitted without that round and asked to predict it. On Oxford and Cambridge IV 2026 it called 66–68% of head-to-heads correctly, against 51–52% for simply backing the team with more points, because power pairing puts teams on equal points in the same room. Each report shows this check for the tournament you analysed.</p>
    <p><a href="#/how/limits-luck">Limitations of the luck model →</a></p>
  </section>

  <section id="how-limits">
    <h2>Limitations</h2>
    <p>Read these before treating any number as meaningful.</p>

    <h3 id="how-limits-general">General</h3>
    <ul>
      <li><b>Very little data per team.</b> Five rounds is five rooms. Most individual luck figures are leanings, not verdicts; small differences between teams are noise.</li>
      <li><b>Statistics, not causes.</b> These analyses show what the draw looked like and what that is usually worth. They can't say a team would have broken with a different draw.</li>
      <li><b>Judging isn't measured.</b> Adjudication quality and individual calls aren't visible in a tab, so their effect sits inside the general randomness.</li>
      <li><b>BP open break only.</b> ESL, novice and other category breaks aren't modelled; other formats aren't supported yet.</li>
      <li><b>AI-assisted.</b> See <a href="#/how/ai">AI assistance</a>.</li>
    </ul>

    <h3 id="how-limits-draw">Draw audit</h3>
    <ul>
      <li><b>Seat values are noisy.</b> Each comes from one round's rooms. With 21 rooms, a seat's average wanders by about ±0.24 points by chance alone, even if all seats were truly equal. Many "good" or "bad" seats are within that noise.</li>
      <li><b>Seat values partly reflect who sat there.</b> If strong teams happened to fill one seat in a round, that seat looks better than it was. The luck model corrects for this; the draw audit doesn't.</li>
      <li>All rounds count equally, and the ±0.050 threshold is a convention, not a natural cut-off.</li>
      <li><b>Expected places remove everyone's seat luck at once</b>, so a team can move even if its own seat luck was near zero. A move of one or two places is within the noise; the 80% range shows how much.</li>
    </ul>

    <h3 id="how-limits-room">Room audit</h3>
    <ul>
      <li><b>Opponent strength is itself uncertain.</b> It comes from a final placing over the other four rounds, which are affected by those teams' own draws.</li>
      <li><b>Averages hide room make-up.</b> One very strong team plus two weak ones averages the same as three middling teams, but the first room is easier to come second in. The luck model handles this; the room audit doesn't.</li>
      <li>"Typical" for later rounds is a straight-line fit from top room to bottom room, which is an approximation.</li>
      <li>It measures who you were drawn against, not how the debate went.</li>
      <li><b>The expected-place column borrows two things from the luck model:</b> the conversion rate from % of the field to team points (one number per tournament, about 0.02), and the width of its range. The ordering itself comes from the audit's own percentages. The model's room luck and the audit disagree on direction for a few teams (6 of 74 at Oxford, 8 of 51 at Cambridge among those labelled hard or soft), because the model also looks at how strong each opponent was rather than just their average.</li>
    </ul>

    <h3 id="how-limits-luck">Luck model</h3>
    <ul>
      <li><b>Strength is assumed constant</b> across motions and rounds; specialists and teams that warm up or fade are blurred.</li>
      <li><b>The six head-to-heads in a room aren't really independent.</b> Ranges are widened (variance doubled) to compensate; this is an approximation.</li>
      <li><b>The pull towards average</b> (two imaginary results) was tuned on two tournaments; it may not be ideal elsewhere.</li>
      <li><b>Slightly overconfident on lopsided matchups:</b> when it says 89%, the favourite has won about 80–84% in testing.</li>
      <li><b>The simulation approximates Tabbycat's rules</b> for pairing, pull-ups and seat balancing, and breaks ties on points using in-room performance as a stand-in for speaks.</li>
      <li>Teams that missed rounds are replaced in the simulation by average-strength fillers.</li>
      <li><b>Expected places ignore power pairing's knock-on effects.</b> They assume everything else stays the same when a team's luck is taken out. In reality, a team that lost early to a very strong room usually met easier rooms afterwards, so some of its bad luck came back. Big moves are therefore an upper bound.</li>
      <li><b>Room luck can't be judged in isolation.</b> Scoring each round on placings alone can't see room luck at all, because whether opponents were strong only shows in their other rounds. Some cross-round estimate is unavoidable; each opponent is judged with that round removed.</li>
      <li>Break chance and "break chance without luck" answer different questions: the first asks "given how strong teams seem, how settled was the break?", the second "on points with the draw luck taken out, how often would it make the cut?"</li>
    </ul>

    <h3 id="how-limits-data">Data</h3>
    <ul>
      <li>Only what the tab site publishes can be used. Unreleased or hidden tabs can't be analysed.</li>
      <li>Reading the team tab depends on how Tabbycat lays out its pages; a future Tabbycat change could break it until the site is updated.</li>
      <li>Iron-person rounds use the team speaker total shown on the tab; swing teams and no-shows are handled as described above.</li>
      <li>Results are only as accurate as the published tab.</li>
    </ul>
  </section>
  </article>
</div>`;
}
