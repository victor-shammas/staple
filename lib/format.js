export function fmtDate(d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(d).toLocaleDateString(undefined, opts);
}

export function fmtRange(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${left} – ${fmtDate(b)}`;
}

export function fmtHours(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtNumber(n) {
  return n.toLocaleString();
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

// A summary of at most about `n` characters that ends where a sentence does:
// cut at the last full stop that leaves a third or more of it, else at a word,
// with an ellipsis. One already cut off mid-sentence ("…") goes back to its
// last whole sentence too.
export function summary(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const cut = /(…|\.\.\.)$/.test(s);
  if (s.length <= n && !cut) return s;
  const window = s.slice(0, n);
  let last = -1;
  const ends = /[.!?。！？؟।]["”’)]?(?=\s|$)/g;
  for (let m; (m = ends.exec(window));) last = m.index + m[0].length;
  if (last >= window.length / 3 && !(cut && last === window.length)) return window.slice(0, last);
  if (s.length <= n) return s;
  const space = window.lastIndexOf(' ');
  return `${(space > n / 2 ? window.slice(0, space) : window).replace(/[\s,;:.–—-]+$/, '')}…`;
}
