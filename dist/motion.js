const video = document.querySelector('#scene');
const journey = document.querySelector('#journey');
const viewport = document.querySelector('.viewport');
const copies = [...document.querySelectorAll('.copy')].map(element => ({
  element,
  from: Number(element.dataset.from),
  to: Number(element.dataset.to),
}));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const status = document.querySelector('#load-status');
const chapter = document.querySelector('#chapter');
const track = document.querySelector('#track');
const percent = document.querySelector('#percent');
const chapters = ['Inside the CPU', '01 / Fetch', '02 / Decode', '03 / Execute', '04 / Write', 'Dependencies & stalls', 'The clock', 'The pipeline'];
let target = 0;
let current = 0;
let animation = 0;
let previousTime = 0;
let duration = 0;
let distance = 1;
let objectURL;
let activeChapter = -1;

function paintCopy(progress) {
  let active = 0;
  copies.forEach(({ element, from, to }, index) => {
    if (progress >= from) active = index;
    const fadeIn = index === 0 ? 1 : Math.min(1, (progress - from) / 0.018);
    const fadeOut = Math.min(1, (to - progress) / 0.018);
    const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
    element.classList.toggle('visible', opacity > 0);
    element.style.opacity = opacity;
    element.style.transform = 'translateY(calc(-50% + ' + Math.round((1 - opacity) * 24) + 'px))';
    const hidden = opacity < 0.5;
    if (element.inert !== hidden) {
      element.inert = hidden;
      element.setAttribute('aria-hidden', String(hidden));
    }
  });
  if (active !== activeChapter) {
    activeChapter = active;
    chapter.textContent = chapters[active];
    viewport.dataset.side = copies[active].element.classList.contains('right') ? 'right' : active >= 6 ? 'center' : 'left';
  }
  track.style.transform = 'scaleX(' + progress + ')';
  percent.textContent = String(Math.round(progress * 100)).padStart(2, '0') + '%';
}

function schedule() {
  if (!animation) animation = requestAnimationFrame(tick);
}
function tick(time) {
  animation = 0;
  const elapsed = previousTime ? Math.min(time - previousTime, 50) : 16;
  previousTime = time;
  const difference = target - current;
  current = reducedMotion.matches ? target : current + difference * (1 - Math.exp(-elapsed / 100));
  if (Math.abs(target - current) < 0.0002) current = target;
  let frameProgress = current;
  if (reducedMotion.matches) frameProgress = Math.round(current * 8) / 8;
  const nextTime = frameProgress * duration;
  // Finish the current decode before seeking again, coalescing rapid scroll input.
  if (duration && !video.seeking && Math.abs(video.currentTime - nextTime) > 1 / 48) {
    video.currentTime = nextTime;
  }
  if (current !== target) schedule();
  else previousTime = 0;
}
function onScroll() {
  target = Math.max(0, Math.min(1, (scrollY - journey.offsetTop) / distance));
  schedule();
}
function resize() {
  distance = Math.max(1, journey.offsetHeight - innerHeight);
  onScroll();
}
video.addEventListener('loadedmetadata', () => {
  duration = Math.max(0, video.duration - 1 / 24);
  schedule();
});
video.addEventListener('loadeddata', () => {
  status.textContent = '';
  schedule();
});
video.addEventListener('seeked', () => {
  paintCopy(duration ? video.currentTime / duration : 0);
  schedule();
});
video.addEventListener('error', () => {
  status.textContent = 'Camera unavailable. Reload to retry.';
});
async function prepareVideo() {
  // Buffer one compressed asset so camera travel never waits on individual frame requests.
  try {
    const response = await fetch('cpu-scroll.mp4');
    if (!response.ok) throw new Error('Video unavailable');
    const total = Number(response.headers.get('Content-Length'));
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (total) status.textContent = 'Preparing camera ' + Math.min(100, Math.round(received / total * 100)) + '%';
    }
    objectURL = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.src = objectURL;
  } catch {
    // The media element can use native range loading if full-file buffering fails.
    video.src = 'cpu-scroll.mp4';
  }
  video.load();
}
function travel(progress) {
  scrollTo({ top: journey.offsetTop + progress * distance, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}
document.querySelectorAll('[data-progress]').forEach(button => {
  button.addEventListener('click', () => travel(Number(button.dataset.progress)));
});
document.querySelector('.explore').addEventListener('click', () => travel(0.19));
const dialog = document.querySelector('#learn');
document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelector('.close').addEventListener('click', () => dialog.close());
document.querySelector('#restart').addEventListener('click', () => { dialog.close(); travel(0.19); });
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', resize);
reducedMotion.addEventListener('change', onScroll);
paintCopy(0);
resize();
prepareVideo();
