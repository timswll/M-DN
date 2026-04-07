'use strict';

const BackgroundScene = (() => {
  const MARKUP = String.raw`
    <div class="madn-bg" aria-hidden="true">
      <svg class="madn-svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="madnGlowGreen" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="madnGlowBlue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="madnGlowRed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="madnGlowYellow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <radialGradient id="madnVignette" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stop-color="#081018" stop-opacity="0" />
            <stop offset="100%" stop-color="#020309" stop-opacity="0.82" />
          </radialGradient>

          <linearGradient id="madnLineGradientA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#00e676" stop-opacity="0.72" />
            <stop offset="100%" stop-color="#2979ff" stop-opacity="0.16" />
          </linearGradient>

          <linearGradient id="madnLineGradientB" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ff1744" stop-opacity="0.42" />
            <stop offset="100%" stop-color="#ffd600" stop-opacity="0.18" />
          </linearGradient>
        </defs>

        <rect width="1920" height="1080" fill="#05060d" />
        <rect width="1920" height="1080" fill="url(#madnVignette)" />

        <g class="madn-grid">
          <path d="M0 180 H1920" />
          <path d="M0 360 H1920" />
          <path d="M0 540 H1920" />
          <path d="M0 720 H1920" />
          <path d="M0 900 H1920" />

          <path d="M240 0 V1080" />
          <path d="M480 0 V1080" />
          <path d="M720 0 V1080" />
          <path d="M960 0 V1080" />
          <path d="M1200 0 V1080" />
          <path d="M1440 0 V1080" />
          <path d="M1680 0 V1080" />
        </g>

        <g class="madn-auras">
          <circle cx="260" cy="230" r="180" fill="#00e676" filter="url(#madnGlowGreen)" class="float-slow" />
          <circle cx="1620" cy="220" r="155" fill="#ffd600" filter="url(#madnGlowYellow)" class="float-medium" />
          <circle cx="320" cy="865" r="175" fill="#ff1744" filter="url(#madnGlowRed)" class="float-medium" />
          <circle cx="1575" cy="850" r="210" fill="#2979ff" filter="url(#madnGlowBlue)" class="float-slow" />
        </g>

        <g class="madn-lines">
          <path d="M220 200 C390 285, 540 170, 770 255" stroke="url(#madnLineGradientA)" class="pulse-line" />
          <path d="M1160 220 C1340 275, 1500 180, 1710 255" stroke="url(#madnLineGradientB)" class="pulse-line delay-1" />
          <path d="M240 840 C420 750, 620 925, 860 820" stroke="url(#madnLineGradientB)" class="pulse-line delay-2" />
          <path d="M1090 850 C1310 760, 1520 935, 1725 810" stroke="url(#madnLineGradientA)" class="pulse-line delay-3" />
        </g>

        <g class="madn-board-outline float-slow">
          <rect x="845" y="470" width="230" height="230" rx="34" />
          <rect x="915" y="148" width="90" height="90" rx="18" />
          <path d="M960 522 L970 548 L998 551 L977 568 L984 595 L960 580 L936 595 L943 568 L922 551 L950 548 Z" />
        </g>

        <g id="madn-floating-icons">
          <g class="madn-icon float-slow" data-depth="12">
            <circle cx="290" cy="180" r="22" class="stroke-green" />
            <circle cx="290" cy="180" r="6" class="fill-green" />
          </g>

          <g class="madn-icon float-medium" data-depth="18">
            <rect x="430" y="120" width="40" height="40" rx="8" class="stroke-green" />
          </g>

          <g class="madn-icon float-fast" data-depth="10">
            <path d="M615 270 l18 0 l0 -18 l18 0 l0 18 l18 0 l0 18 l-18 0 l0 18 l-18 0 l0 -18 l-18 0 z" class="stroke-green" />
          </g>

          <g class="madn-icon float-medium" data-depth="15">
            <circle cx="1570" cy="190" r="26" class="stroke-yellow" />
            <path d="M1570 170 L1576 184 L1591 186 L1580 196 L1583 211 L1570 203 L1557 211 L1560 196 L1549 186 L1564 184 Z" class="fill-yellow" />
          </g>

          <g class="madn-icon float-slow" data-depth="20">
            <rect x="1450" y="320" width="48" height="48" rx="10" class="stroke-yellow" />
            <circle cx="1464" cy="334" r="3.5" class="fill-yellow" />
            <circle cx="1484" cy="354" r="3.5" class="fill-yellow" />
          </g>

          <g class="madn-icon float-fast" data-depth="11">
            <path d="M1700 310 l24 24 m0 -24 l-24 24" class="stroke-yellow thin-stroke" />
          </g>

          <g class="madn-icon float-medium" data-depth="14">
            <circle cx="300" cy="820" r="20" class="stroke-red" />
            <path d="M290 820 h20 M300 810 v20" class="stroke-red thin-stroke" />
          </g>

          <g class="madn-icon float-fast" data-depth="16">
            <rect x="470" y="760" width="42" height="42" rx="10" class="stroke-red" />
          </g>

          <g class="madn-icon float-slow" data-depth="9">
            <path d="M640 900 C650 880, 675 880, 685 900 C695 920, 670 940, 662 950 C654 940, 629 920, 640 900 Z" class="stroke-red" />
          </g>

          <g class="madn-icon float-slow" data-depth="13">
            <circle cx="1620" cy="820" r="24" class="stroke-blue" />
            <circle cx="1620" cy="820" r="5" class="fill-blue" />
          </g>

          <g class="madn-icon float-medium" data-depth="19">
            <rect x="1450" y="720" width="44" height="44" rx="12" class="stroke-blue" />
          </g>

          <g class="madn-icon float-fast" data-depth="12">
            <path d="M1320 920 l22 0 l0 -22 l22 0 l0 22 l22 0 l0 22 l-22 0 l0 22 l-22 0 l0 -22 l-22 0 z" class="stroke-blue" />
          </g>

          <g class="madn-icon float-medium" data-depth="8">
            <rect x="925" y="170" width="70" height="70" rx="14" class="stroke-neutral wide-stroke" />
          </g>

          <g class="madn-icon float-slow" data-depth="10">
            <rect x="870" y="500" width="180" height="180" rx="28" class="stroke-neutral board-ghost" />
          </g>

          <g class="madn-icon float-fast" data-depth="7">
            <path d="M960 520 L970 545 L997 548 L977 565 L983 592 L960 578 L937 592 L943 565 L923 548 L950 545 Z" class="fill-neutral" />
          </g>
        </g>
      </svg>
    </div>
  `;

  let icons = [];
  let animationFrameId = null;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const updateIconOffsets = () => {
    icons.forEach((icon) => {
      const depth = Number(icon.dataset.depth || 10);
      icon.style.setProperty('--parallax-x', `${(currentX * depth).toFixed(2)}px`);
      icon.style.setProperty('--parallax-y', `${(currentY * depth).toFixed(2)}px`);
    });
  };

  const stopAnimation = () => {
    if (!animationFrameId) {
      return;
    }

    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  };

  const tick = () => {
    currentX += (targetX - currentX) * 0.06;
    currentY += (targetY - currentY) * 0.06;
    updateIconOffsets();
    animationFrameId = window.requestAnimationFrame(tick);
  };

  const startAnimation = () => {
    if (animationFrameId || reducedMotionQuery.matches) {
      return;
    }

    animationFrameId = window.requestAnimationFrame(tick);
  };

  const resetPointer = () => {
    targetX = 0;
    targetY = 0;
  };

  const handlePointerMove = (event) => {
    targetX = (event.clientX / window.innerWidth - 0.5) * 2;
    targetY = (event.clientY / window.innerHeight - 0.5) * 2;
  };

  /**
   * Inject the animated SVG backdrop once and attach a lightweight parallax loop.
   */
  const init = () => {
    if (!document.body || document.querySelector('.madn-bg')) {
      return;
    }

    document.body.insertAdjacentHTML('afterbegin', MARKUP);
    icons = Array.from(document.querySelectorAll('#madn-floating-icons .madn-icon'));
    updateIconOffsets();

    if (reducedMotionQuery.matches) {
      return;
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', resetPointer);
    document.addEventListener('mouseleave', resetPointer);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAnimation();
        resetPointer();
        currentX = 0;
        currentY = 0;
        updateIconOffsets();
        return;
      }

      startAnimation();
    });

    startAnimation();
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  BackgroundScene.init();
});
