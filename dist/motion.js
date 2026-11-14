const steps = [...document.querySelectorAll('.step')];
const shots = [...document.querySelectorAll('.shot')];
const hero = document.querySelector('.hero');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let activeIndex = 0;
let scheduled = false;

function updateCamera() {
  scheduled = false;
  const center = innerHeight / 2;
  const index = steps.findIndex(step => {
    const bounds = step.getBoundingClientRect();
    return bounds.top <= center && bounds.bottom > center;
  });

  if (index >= 0 && index !== activeIndex) {
    shots[activeIndex].classList.remove('active');
    shots[index].classList.add('active');
    activeIndex = index;
  }

  const drift = reduceMotion.matches ? 0 : Math.min(scrollY * 0.15, 90);
  hero.style.setProperty('--drift', drift + 'px');
}

function scheduleCamera() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(updateCamera);
}

addEventListener('scroll', scheduleCamera, { passive: true });
addEventListener('resize', scheduleCamera);
reduceMotion.addEventListener('change', scheduleCamera);
updateCamera();
