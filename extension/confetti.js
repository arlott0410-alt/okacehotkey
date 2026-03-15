// confetti.js
let confettiStyleInjected = false;

export function showConfetti(targetEl) {
  if (!document.body) return;

  if (!confettiStyleInjected) {
    const style = document.createElement("style");
    style.textContent = `
      .qp-confetti-piece {
        position: fixed;
        top: 0;
        transform-origin: left top;
        will-change: transform, opacity;
        pointer-events: none;
        --qp-x-move: 0px;
      }
      @keyframes qp-confetti-fall {
        0% {
          transform: translate3d(0, -100vh, 0) rotateZ(0deg);
          opacity: 0;
        }
        15% { opacity: 1; }
        100% {
          transform: translate3d(var(--qp-x-move), 110vh, 0) rotateZ(720deg);
          opacity: 0;
        }
      }
    `;
    document.documentElement.appendChild(style);
    confettiStyleInjected = true;
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "999999";
  document.body.appendChild(container);

  const colors = ["#ff4b4b", "#ffb400", "#4caf50", "#03a9f4", "#e91e63"];
  const pieces = 40;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement("span");
    const size = 6 + Math.random() * 8;

    piece.className = "qp-confetti-piece";
    piece.style.width = size + "px";
    piece.style.height = (size * 0.4) + "px";
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = (Math.random() * 100) + "%";

    const xMove = (Math.random() - 0.5) * 220;
    piece.style.setProperty("--qp-x-move", xMove + "px");
    piece.style.opacity = "0";

    const duration = 2.5 + Math.random() * 1.5;
    piece.style.animation = `qp-confetti-fall ${duration}s ease-out forwards`;
    piece.style.animationDelay = (Math.random() * 0.2) + "s";

    fragment.appendChild(piece);
  }

  container.appendChild(fragment);

  setTimeout(() => {
    container.remove();
  }, 5000);
}
