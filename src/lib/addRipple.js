/**
 * Material-style ripple on button click (visual only).
 * @param {HTMLElement} btn
 * @param {MouseEvent} e
 */
export function addRipple(btn, e) {
  if (!btn || !e) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const size = Math.max(btn.offsetWidth, btn.offsetHeight);
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(108, 71, 216, 0.12);
    width: ${size}px;
    height: ${size}px;
    left: ${e.clientX - rect.left - size / 2}px;
    top: ${e.clientY - rect.top - size / 2}px;
    transform: scale(0);
    animation: ripple-anim 0.5s ease-out forwards;
    pointer-events: none;
  `;
  btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}
