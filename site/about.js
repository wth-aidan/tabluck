// About page: the author's own words (only grammar and paragraphing edited).
export function aboutHTML() {
  return `
<div class="about">
  <div class="about-in">
    <h1>About</h1>
    <p>Hi, I'm Aidan, and I'm (primarily) a judge from Imperial.</p>
    <p>From time to time at different competitions, I hear people discuss the fairness of a competition, mainly through two metrics, one is whether the motions are balanced, and two is whether the draw strength is proportional to the points of that room. I decided to have a go at mathematically analysing both of these ideas, to measure whether a team has gotten lucky or not throughout a tournament.</p>
    <p>Eventually, I also tried to combine both of these ideas into an overall evaluation using some iterative modelling with AI assistance, and I'll be honest and say that I don't fully understand how it works. As such, I want to preface this work by flagging a few things.</p>
    <p>Firstly, the whole concept of the website is kind of about building on initial flawed data to try and find data that isn't flawed, so it's almost bound to be imperfect.</p>
    <p>Secondly, I am aware of the strong sentiment around AI usage on the circuit, so I do think it's worth mentioning that just because I'm using AI to analyse data, that is not reflective of my stance on whether AI would contribute positively or negatively to debate in general.</p>
    <p>Thirdly, I also know that we like to do ego jerks from this activity, but please avoid harassing or being mean to other people because of some results that some rando produced as an afternoon thought experiment.</p>
    <p>With all that being said, enjoy the analysis, and try to entertain yourself with this instead of taking it too seriously. If you have any suggestions for improvement, feel free to message me on <a href="https://www.facebook.com/profile.php?id=61587775741824" target="_blank" rel="noopener">Facebook</a>.</p>
  </div>
</div>`;
}
