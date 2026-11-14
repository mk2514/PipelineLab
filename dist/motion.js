const canvas = document.querySelector('#scene');
const context = canvas.getContext('2d', { alpha: false });
const journey = document.querySelector('#journey');
const copies = [...document.querySelectorAll('.copy')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const frames = new Map();
const pending = new Set();
const failures = new Set();
const totalFrames = 1440;
const status = document.querySelector('#load-status');
const chapter = document.querySelector('#chapter');
const chapters = ['Inside the CPU', '01 / Fetch', '02 / Decode', '03 / Execute', '04 / Write', 'Dependencies & stalls', 'The clock', 'The pipeline'];
let current = 0;
let target = 0;
let requested = 0;
let lastDrawn = -1;
let raf = 0;
let width = 0;
let height = 0;

function resize() {
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  width = canvas.width = Math.round(innerWidth * ratio);
  height = canvas.height = Math.round(innerHeight * ratio);
  lastDrawn = -1;
  onScroll();
}
function draw(index) {
  const frame = frames.get(index);
  if (!frame || lastDrawn === index) return;
  const scale = Math.max(width / frame.width, height / frame.height);
  const w = frame.width * scale;
  const h = frame.height * scale;
  context.drawImage(frame, (width - w) / 2, (height - h) / 2, w, h);
  lastDrawn = index;
}
async function fetchFrame(index) {
  pending.add(index);
  try {
    const response = await fetch('frames/' + String(index).padStart(4, '0') + '.webp');
    if (!response.ok) throw new Error('Frame unavailable');
    const frame = await createImageBitmap(await response.blob());
    frames.set(index, frame);
    if (index === requested) {
      draw(index);
      status.textContent = '';
    }
  } catch {
    failures.add(index);
    if (index === requested) status.textContent = 'Scene loading — scroll to continue';
  } finally {
    pending.delete(index);
    fillCache();
  }
}
function fillCache() {
  // A bounded sliding window keeps decoded image memory independent of film length.
  for (const [index, frame] of frames) {
    if (Math.abs(index - requested) > 54) {
      frame.close();
      frames.delete(index);
    }
  }
  const direction = target >= current ? 1 : -1;
  const wanted = [requested];
  for (let offset = 1; offset <= 36; offset++) {
    wanted.push(requested + offset * direction);
    if (offset <= 12) wanted.push(requested - offset * direction);
  }
  for (const index of wanted) {
    if (pending.size >= 6) break;
    if (index < 0 || index >= totalFrames || frames.has(index) || pending.has(index) || failures.has(index)) continue;
    fetchFrame(index);
  }
}
function render() {
  raf = 0;
  current = reducedMotion.matches ? target : current + (target - current) * 0.12;
  if (Math.abs(current - target) < 0.00015) current = target;
  requested = Math.round(current * (totalFrames - 1));
  if (reducedMotion.matches) requested = Math.min(1439, Math.round(requested / 180) * 180);
  draw(requested);
  fillCache();
  let active = Math.max(0, copies.findLastIndex(copy => current >= Number(copy.dataset.from)));
  copies.forEach((copy, index) => {
    const from = Number(copy.dataset.from);
    const to = Number(copy.dataset.to);
    const fadeIn = index === 0 ? 1 : Math.min(1, (current - from) / 0.018);
    const fadeOut = Math.min(1, (to - current) / 0.018);
    const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
    copy.classList.toggle('visible', opacity > 0);
    copy.style.opacity = opacity;
    copy.style.transform = 'translateY(calc(-50% + ' + ((1 - opacity) * 24) + 'px))';
    copy.inert = opacity < 0.5;
    copy.setAttribute('aria-hidden', opacity < 0.5 ? 'true' : 'false');
    if (opacity > 0.5) active = index;
  });
  chapter.textContent = chapters[active];
  document.querySelector('#track').style.transform = 'scaleX(' + current + ')';
  document.querySelector('#percent').textContent = String(Math.round(current * 100)).padStart(2, '0') + '%';
  if (current !== target) raf = requestAnimationFrame(render);
}
function onScroll() {
  const distance = journey.offsetHeight - innerHeight;
  target = Math.max(0, Math.min(1, -journey.getBoundingClientRect().top / distance));
  if (!raf) raf = requestAnimationFrame(render);
}
function travel(progress) {
  scrollTo({ top: journey.offsetTop + progress * (journey.offsetHeight - innerHeight), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
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
resize();

