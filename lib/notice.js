// A live "Substack is rate-limiting — resuming in 42 s" line, shown while the
// shared cooldown in lib/substack.js is active.

import { onRateLimit } from './substack.js';

export function showRateLimitNotices(el) {
  let timer = null;
  onRateLimit((until) => {
    clearInterval(timer);
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        el.hidden = true;
        return;
      }
      el.textContent = `Substack is rate-limiting requests — resuming in ${left} s…`;
      el.hidden = false;
    };
    tick();
    timer = setInterval(tick, 1000);
  });
}
