import {
  NotSignedInError, countWords, describeError, fetchPostBody, fetchSubscriptions, isSubstackHost,
  listPosts, mapLimit, normalizeBase, originPattern, readingMinutes, resolvePublication, summarize,
} from './lib/substack.js';
import { SUPPORT_URL } from './lib/config.js';
import { DEFAULT_TYPEFACE, TYPEFACES } from './lib/fonts.js';
import { showRateLimitNotices } from './lib/notice.js';
import { el, fmtDate, fmtHours, fmtNumber, fmtRange, summary } from './lib/format.js';

const $ = (id) => document.getElementById(id);

const SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS = {
  minWords: 400,
  includePreviews: false,
  order: 'newest',
  pageSize: /^en-(US|CA)$/.test(navigator.language) ? 'letter' : 'a4',
  imageScale: 100,
  typeface: DEFAULT_TYPEFACE,
};

const state = {
  sources: [], // { base, name, enabled }
  groups: [], // { id, name, bases: [] }
  activeGroup: 'all', // 'all', a group id, or null for a custom selection
  importedAt: null,
  groupForm: null, // { mode: 'new' | 'rename', restore? }
  settings: { ...DEFAULT_SETTINGS },
  posts: [], // summaries + { access, selected }
  errors: [], // { source, message } from the last search
  search: null, // { since, until } of the last search
  searching: false,
  titleEdited: false,
};

// ---------- persistence ----------

async function load() {
  const { sources, settings, groups, activeGroup, importedAt } =
    await chrome.storage.local.get(['sources', 'settings', 'groups', 'activeGroup', 'importedAt']);
  state.sources = Array.isArray(sources) ? sources : [];
  state.groups = Array.isArray(groups) ? groups : [];
  state.importedAt = importedAt || null;
  state.activeGroup = activeGroup === undefined
    ? (state.sources.every((s) => s.enabled) ? 'all' : null)
    : activeGroup;
  if (state.activeGroup && state.activeGroup !== 'all' && !state.groups.some((g) => g.id === state.activeGroup)) {
    state.activeGroup = null;
  }
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if ((settings?.version || 1) < SETTINGS_VERSION) {
    // v1 had a 1,500-word default and an on/off `images` switch.
    if (state.settings.minWords === 1500) state.settings.minWords = DEFAULT_SETTINGS.minWords;
    if (settings && 'images' in settings) state.settings.imageScale = settings.images ? 100 : 0;
    delete state.settings.images;
  }
  state.settings.version = SETTINGS_VERSION;
}

function save() {
  chrome.storage.local.set({
    sources: state.sources,
    settings: state.settings,
    groups: state.groups,
    activeGroup: state.activeGroup,
    importedAt: state.importedAt,
  });
}

// ---------- host permissions ----------

// Custom-domain publications need a host permission granted at runtime.
// chrome.permissions.request only works during a user gesture, so call this
// synchronously at the top of a click handler, before any await.
function requestOrigins(bases) {
  const origins = [...new Set(bases.filter((b) => !isSubstackHost(b)).map(originPattern))];
  if (!origins.length) return Promise.resolve(true);
  return chrome.permissions.request({ origins }).catch(() => false);
}

async function canFetch(base) {
  if (isSubstackHost(base)) return true;
  return chrome.permissions.contains({ origins: [originPattern(base)] });
}

// ---------- sources ----------

function hostOf(base) {
  return new URL(base).hostname;
}

function addSource(base, name, enabled = true) {
  const existing = state.sources.find((s) => s.base === base);
  if (existing) {
    if (name) existing.name = name;
    return false;
  }
  state.sources.push({ base, name: name || hostOf(base), enabled });
  return true;
}

function removeSource(source) {
  state.sources = state.sources.filter((s) => s !== source);
  for (const g of state.groups) g.bases = g.bases.filter((b) => b !== source.base);
  // Give back a custom domain's host permission once nothing uses it.
  if (!isSubstackHost(source.base)) {
    const pattern = originPattern(source.base);
    if (!state.sources.some((s) => !isSubstackHost(s.base) && originPattern(s.base) === pattern)) {
      chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
    }
  }
}

// A publication's address changed (e.g. bare domain → www): update it and
// its groups, merging into an existing entry with the new address.
function moveSource(source, to) {
  if (source.base === to) return source;
  const from = source.base;
  for (const g of state.groups) g.bases = [...new Set(g.bases.map((b) => (b === from ? to : b)))];
  const existing = state.sources.find((s) => s !== source && s.base === to);
  if (existing) {
    existing.enabled = existing.enabled || source.enabled;
    state.sources = state.sources.filter((s) => s !== source);
    return existing;
  }
  source.base = to;
  return source;
}

// ---------- groups ----------

function enabledBases() {
  return new Set(state.sources.filter((s) => s.enabled).map((s) => s.base));
}

function groupBases(id) {
  if (id === 'all') return new Set(state.sources.map((s) => s.base));
  const group = state.groups.find((g) => g.id === id);
  if (!group) return null;
  const known = new Set(state.sources.map((s) => s.base));
  return new Set(group.bases.filter((b) => known.has(b)));
}

function selectionMatchesActive() {
  const bases = state.activeGroup ? groupBases(state.activeGroup) : null;
  if (!bases) return false;
  const on = enabledBases();
  return bases.size === on.size && [...on].every((b) => bases.has(b));
}

function applyGroup(id) {
  const bases = groupBases(id);
  if (!bases) return;
  closeGroupForm({ restore: false });
  for (const s of state.sources) s.enabled = bases.has(s.base);
  state.activeGroup = id;
  save();
  renderSources();
}

function openGroupForm(mode) {
  const group = state.groups.find((g) => g.id === state.activeGroup);
  if (mode === 'new-empty') {
    // Start from nothing ticked; Cancel puts the previous selection back
    // (the one from before the form first opened, if it's already open).
    const restore = state.groupForm?.restore || { on: enabledBases(), activeGroup: state.activeGroup };
    state.groupForm = { mode: 'new', restore };
    for (const s of state.sources) s.enabled = false;
    state.activeGroup = null;
    $('group-hint').textContent = 'Tick the publications for this group below, name it, then save.';
    $('group-name').value = '';
  } else if (mode === 'rename' && group) {
    state.groupForm = { mode: 'rename', id: group.id };
    $('group-hint').textContent = `Rename “${group.name}”.`;
    $('group-name').value = group.name;
  } else {
    state.groupForm = { mode: 'new' };
    $('group-hint').textContent = `Save the ${enabledBases().size} ticked publications as a new group.`;
    $('group-name').value = '';
  }
  $('group-error').textContent = '';
  $('group-form').hidden = false;
  renderSources();
  $('group-name').focus();
}

function closeGroupForm({ restore = true } = {}) {
  const form = state.groupForm;
  if (!form) return;
  state.groupForm = null;
  $('group-form').hidden = true;
  if (restore && form.restore) {
    for (const s of state.sources) s.enabled = form.restore.on.has(s.base);
    state.activeGroup = form.restore.activeGroup;
    save();
  }
}

function onGroupSubmit(event) {
  event.preventDefault();
  const form = state.groupForm;
  const name = $('group-name').value.trim();
  const error = (msg) => { $('group-error').textContent = msg; };
  if (!form) return;
  if (!name) return error('Give the group a name.');
  const clash = state.groups.find((g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== form.id);
  if (clash || name.toLowerCase() === 'all') return error(`There’s already a group called “${name}”.`);

  if (form.mode === 'rename') {
    state.groups.find((g) => g.id === form.id).name = name;
  } else {
    const bases = [...enabledBases()];
    if (!bases.length) return error('Tick at least one publication first.');
    const group = { id: crypto.randomUUID(), name, bases };
    state.groups.push(group);
    state.activeGroup = group.id;
  }
  closeGroupForm({ restore: false });
  save();
  renderSources();
}

function updateActiveGroup() {
  const group = state.groups.find((g) => g.id === state.activeGroup);
  if (!group) return;
  group.bases = [...enabledBases()];
  save();
  renderSources();
}

function deleteButton(group) {
  let armed = false;
  let timer;
  const button = el('button', { class: 'link danger', text: 'Delete group' });
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = `Click again to delete “${group.name}”`;
      timer = setTimeout(() => { armed = false; button.textContent = 'Delete group'; }, 4000);
      return;
    }
    clearTimeout(timer);
    state.groups = state.groups.filter((g) => g !== group);
    state.activeGroup = null;
    save();
    renderSources();
  });
  return button;
}

function renderGroups() {
  $('groups').hidden = state.sources.length < 2;
  const matches = selectionMatchesActive();
  const chips = [
    { id: 'all', name: 'All', count: state.sources.length },
    ...state.groups.map((g) => ({ id: g.id, name: g.name, count: groupBases(g.id).size })),
  ];
  $('group-chips').replaceChildren(
    ...chips.map((c) => {
      const active = c.id === state.activeGroup;
      return el('button', {
        class: `chip group-chip${active ? ' active' : ''}`,
        'aria-pressed': String(active),
        title: active && !matches ? 'Selection changed since you picked this group' : `Tick the ${c.count} publications in ${c.name}`,
        onclick: () => applyGroup(c.id),
      }, c.name, el('span', { class: 'chip-count', text: String(c.count) }), active && !matches && el('span', { class: 'chip-dot', text: '•' }));
    }),
    el('button', { class: 'chip chip-new', text: '+ New group', onclick: () => openGroupForm('new-empty') }),
  );

  const group = state.groups.find((g) => g.id === state.activeGroup);
  const actions = [];
  if (!state.groupForm) {
    if (!matches && enabledBases().size) {
      actions.push(el('span', { class: 'muted', text: group ? `Selection differs from “${group.name}”.` : 'Custom selection.' }));
      if (group) actions.push(el('button', { class: 'link', text: `Update “${group.name}”`, onclick: updateActiveGroup }));
      actions.push(el('button', { class: 'link', text: 'Save as new group', onclick: () => openGroupForm('new') }));
    } else if (group) {
      actions.push(el('button', { class: 'link', text: 'Rename', onclick: () => openGroupForm('rename') }));
      actions.push(deleteButton(group));
    }
  }
  $('group-actions').replaceChildren(...actions);
  $('group-actions').hidden = actions.length === 0;
}

function renderSources() {
  const list = $('sources');
  const filter = $('sources-filter').value.trim().toLowerCase();
  const sorted = [...state.sources].sort((a, b) => a.name.localeCompare(b.name));
  const selectedOnly = $('selected-only').checked;
  const shown = sorted.filter((s) => (!filter || s.name.toLowerCase().includes(filter) || s.base.includes(filter)) &&
    (!selectedOnly || s.enabled));

  list.replaceChildren(...shown.map((s) => el('li', {},
    el('label', { class: 'source' },
      el('input', { type: 'checkbox', checked: s.enabled, onchange: (e) => { s.enabled = e.target.checked; save(); renderSourceCount(); renderGroups(); } }),
      el('span', { class: 'source-name', text: s.name }),
      el('span', { class: 'source-host', text: hostOf(s.base) }),
    ),
    el('button', {
      class: 'icon', title: `Remove ${s.name}`, 'aria-label': `Remove ${s.name}`, text: '×',
      onclick: () => { removeSource(s); save(); renderSources(); },
    }),
  )));

  if (!state.sources.length) {
    list.replaceChildren(el('li', { class: 'empty', text: 'No publications yet. Import your subscriptions or add one by URL.' }));
  }
  else if (!shown.length) {
    list.replaceChildren(el('li', { class: 'empty', text: selectedOnly ? 'Nothing ticked.' : 'No publications match.' }));
  }
  $('sources-tools').hidden = state.sources.length < 2;
  renderSourceCount();
  renderGroups();
  renderImportState();
}

function renderImportState() {
  $('import').textContent = state.importedAt ? 'Refresh subscriptions' : 'Import my subscriptions';
}

function renderSourceCount() {
  const on = state.sources.filter((s) => s.enabled).length;
  $('sources-count').textContent = `${on} of ${state.sources.length} selected`;
}

async function importSubscriptions() {
  const status = $('import-status');
  status.className = 'status';
  status.textContent = 'Reading your Substack subscriptions…';
  $('import').disabled = true;
  try {
    const { publications: subs, partial } = await fetchSubscriptions();
    let added = 0;
    const inAll = state.activeGroup === 'all';
    for (const s of subs) if (addSource(s.base, s.name, inAll)) added++;
    if (subs.length && !partial) state.importedAt = Date.now();
    save();
    renderSources();
    status.textContent = subs.length
      ? `Found ${subs.length} subscriptions${added < subs.length ? ` (${added} new${added && !inAll ? ', not ticked' : ''})` : ''}.`
      : 'You don’t have any subscriptions yet — add publications by URL below.';
    if (partial) {
      status.className = 'status error';
      status.textContent += ' Substack stopped answering partway through — click Refresh subscriptions in a minute to get the rest.';
    }
  } catch (e) {
    status.className = 'status error';
    if (e instanceof NotSignedInError) {
      status.replaceChildren(
        'You’re not signed in to Substack in this browser. ',
        el('a', { href: 'https://substack.com/sign-in', target: '_blank', text: 'Sign in' }),
        ', then try again — or add publications by URL below.',
      );
    } else {
      status.textContent = `Couldn’t read your subscriptions: ${describeError(e)}. You can still add publications by URL below.`;
    }
  } finally {
    $('import').disabled = false;
  }
}

async function onAdd(event) {
  event.preventDefault();
  const input = $('add-input');
  const base = normalizeBase(input.value);
  const status = $('import-status');
  if (!base) {
    status.className = 'status error';
    status.textContent = /substack\.com\/@/i.test(input.value)
      ? 'That’s a profile link. Paste the publication’s address instead, e.g. name.substack.com.'
      : 'That doesn’t look like a publication URL.';
    return;
  }
  const permission = requestOrigins([base]);
  input.value = '';
  addSource(base);
  save();
  renderSources();
  status.className = 'status';
  status.textContent = `Added ${hostOf(base)}.`;
  if (!(await permission) || !(await canFetch(base))) {
    status.className = 'status error';
    status.textContent = `Added ${hostOf(base)}, but Staple needs permission to read that site before it can find posts.`;
    return;
  }
  try {
    const resolved = await resolvePublication(base);
    const source = state.sources.find((s) => s.base === base);
    if (source) moveSource(source, resolved.base);
    addSource(resolved.base, resolved.name);
    save();
    renderSources();
    status.textContent = `Added ${resolved.name || hostOf(resolved.base)}.`;
  } catch (e) {
    status.className = 'status error';
    status.textContent = `Added ${hostOf(base)}, but couldn’t confirm it’s a Substack (${describeError(e)}).`;
  }
}

// ---------- date range ----------

function toInputDate(d) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function setRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  $('from').value = toInputDate(from);
  $('to').value = toInputDate(to);
  updateDefaultTitle();
}

// The date range from the inputs, or null if either is empty or invalid.
function rangeDates() {
  if (!$('from').value || !$('to').value) return null;
  const [fy, fm, fd] = $('from').value.split('-').map(Number);
  const [ty, tm, td] = $('to').value.split('-').map(Number);
  const since = new Date(fy, fm - 1, fd, 0, 0, 0);
  const until = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  return isNaN(since) || isNaN(until) ? null : { since, until };
}

function updateDefaultTitle() {
  const range = rangeDates();
  if (state.titleEdited || !range) return;
  const { since, until } = range;
  const days = Math.round((until - since) / 864e5);
  $('title').value = days <= 8 ? 'The Week’s Reading' : 'Collected Reading';
}

// ---------- finding posts ----------

function readFilterSettings() {
  state.settings.minWords = Math.max(0, Number($('min-words').value) || 0);
  state.settings.includePreviews = $('include-previews').checked;
  save();
}

function isLongform(post, minWords) {
  return post.type === 'newsletter' && (post.wordcount || 0) >= minWords;
}

// Search the ticked publications. With `only`, re-check just those sources
// (e.g. the ones that failed last time) and merge into the current results.
async function findPosts({ only = null } = {}) {
  if (state.searching) return;
  const status = $('find-status');
  status.className = 'status';
  const retry = Boolean(only);
  const sources = only || state.sources.filter((s) => s.enabled);
  if (!sources.length) {
    status.className = 'status error';
    status.textContent = 'Choose at least one publication first.';
    return;
  }
  const permission = requestOrigins(sources.map((s) => s.base));
  readFilterSettings();
  const range = retry ? state.search : rangeDates();
  if (!range) {
    status.className = 'status error';
    status.textContent = 'Pick a start and an end date.';
    return;
  }
  const { since, until } = range;
  if (since > until) {
    status.className = 'status error';
    status.textContent = 'The start date is after the end date.';
    return;
  }

  state.searching = true;
  $('find').disabled = true;
  try {
    await permission;
    const errors = retry ? state.errors.filter((e) => !sources.includes(e.source)) : [];
    state.errors = errors;
    if (!retry) state.search = { since, until };
    const allowed = [];
    for (const s of sources) {
      if (await canFetch(s.base).catch(() => false)) allowed.push(s);
      else errors.push({ source: s, message: `permission to read ${hostOf(s.base)} wasn’t granted` });
    }

    let done = 0;
    status.textContent = `Checking ${allowed.length} publications…`;
    let found = (await mapLimit(allowed, 3, async (source) => {
      try {
        let posts;
        try {
          posts = await listPosts(source.base, since, until);
        } catch (e) {
          // Bare custom domains sometimes only answer on www.
          if (e.status !== 404 || isSubstackHost(source.base)) throw e;
          const resolved = await resolvePublication(source.base);
          source = moveSource(source, resolved.base);
          save();
          posts = await listPosts(source.base, since, until);
        }
        return posts.filter((p) => isLongform(p, state.settings.minWords)).map((p) => summarize(p, source));
      } catch (e) {
        errors.push({ source, message: describeError(e) });
        return [];
      } finally {
        done++;
        status.textContent = `Checking publications… ${done} of ${allowed.length}`;
      }
    })).flat();

    // The same publication saved under two addresses would list posts twice.
    const seen = new Set(retry ? state.posts.map((p) => p.id) : []);
    found = found.filter((p) => !seen.has(p.id) && seen.add(p.id));

    // Paywalled posts: find out whether this reader can see the full text.
    const gated = found.filter((p) => p.audience !== 'everyone');
    for (const p of found) {
      p.access = p.audience === 'everyone' ? 'full' : 'checking';
      p.selected = usable(p);
    }
    state.posts = [...(retry ? state.posts : []), ...found].sort((a, b) => new Date(b.date) - new Date(a.date));
    renderPosts();

    if (gated.length) {
      let checked = 0;
      status.textContent = `Checking access to ${gated.length} paywalled ${gated.length === 1 ? 'post' : 'posts'}…`;
      await mapLimit(gated, 3, async (p) => {
        const body = await fetchPostBody(p).catch((e) => ({ access: 'error', reason: describeError(e) }));
        p.access = body.access;
        p.reason = body.reason;
        if (body.access === 'preview') p.previewWords = countWords(body.html);
        if (body.pubName) p.pubName = body.pubName;
        // Only these posts change; the reader's own ticks elsewhere stay.
        p.selected = usable(p);
        checked++;
        status.textContent = `Checking access to paywalled posts… ${checked} of ${gated.length}`;
      });
      renderPosts();
    }

    const total = state.posts.length;
    status.textContent = total
      ? `Found ${total} ${total === 1 ? 'post' : 'posts'} from ${fmtRange(since, until)}.`
      : `No posts of ${fmtNumber(state.settings.minWords)}+ words from ${fmtRange(since, until)}.`;
  } catch (e) {
    status.className = 'status error';
    status.textContent = `Something went wrong: ${describeError(e)}`;
  } finally {
    state.searching = false;
    $('find').disabled = false;
  }
}

// Posts that go into the book when ticked.
function usable(p) {
  return p.access === 'full' || (state.settings.includePreviews && p.access === 'preview');
}

// Posts whose access couldn't be checked can still be ticked: the book tries again.
function selectable(p) {
  return usable(p) || p.access === 'error';
}

const ACCESS_LABEL = {
  full: (p) => (p.audience === 'everyone' ? null : 'Paid · unlocked'),
  preview: () => 'Paid · preview only',
  none: () => 'Unavailable',
  checking: () => 'Checking access…',
  error: (p) => `Couldn’t check: ${p.reason || 'network error'}`,
};

function renderPosts() {
  const errors = state.errors;
  $('results-card').hidden = false;
  $('output-card').hidden = state.posts.length === 0;

  const list = $('posts');
  list.replaceChildren(...state.posts.map((p) => {
    const label = ACCESS_LABEL[p.access]?.(p);
    return el('li', { class: `post ${selectable(p) ? '' : 'post-locked'}` },
      el('label', {},
        el('input', {
          type: 'checkbox', checked: p.selected, disabled: !selectable(p),
          onchange: (e) => { p.selected = e.target.checked; renderSummary(); },
        }),
        el('span', { class: 'post-main' },
          el('span', { class: 'post-title', text: p.title }),
          el('span', { class: 'post-meta' },
            `${p.pubName} · ${fmtDate(p.date, { month: 'short', day: 'numeric' })} · ${fmtNumber(p.wordcount)} words`,
            label && el('span', { class: `badge badge-${p.access}`, text: label }),
          ),
        ),
      ),
      el('a', { class: 'open', href: p.url, target: '_blank', title: 'Open on Substack', 'aria-label': `Open “${p.title}” on Substack`, text: '↗' }),
    );
  }));
  if (!state.posts.length) list.replaceChildren(el('li', { class: 'empty', text: 'Nothing matched. Try a longer date range or a lower word count.' }));

  const box = $('errors');
  box.hidden = errors.length === 0;
  box.querySelector('summary').textContent = `${errors.length} ${errors.length === 1 ? 'publication' : 'publications'} couldn’t be checked`;
  box.querySelector('ul').replaceChildren(...errors.map((e) => el('li', { text: `${e.source.name}: ${e.message}` })));
  $('retry-failed').hidden = errors.length === 0;
  $('retry-failed').textContent = `Retry ${errors.length === 1 ? 'it' : `these ${errors.length}`}`;

  renderSummary();
}

// The first chosen post's title and subtitle, set in the chosen typeface, so the names mean something.
function renderTypefaceSample() {
  const face = TYPEFACES[$('typeface').value] || TYPEFACES[DEFAULT_TYPEFACE];
  const post = state.posts.find((p) => p.selected && selectable(p));
  const sample = $('typeface-sample');
  sample.style.fontFamily = face.stack;
  sample.replaceChildren(
    post ? post.title : 'A week of essays, stapled into one collection.',
    el('small', { text: post?.subtitle ? summary(post.subtitle, 140) : `${face.label}: the text of every essay will look like this.` }),
  );
}

function renderSummary() {
  renderTypefaceSample();
  const chosen = state.posts.filter((p) => p.selected && selectable(p));
  const words = chosen.reduce((n, p) => n + (p.access === 'preview' ? p.previewWords || 0 : p.wordcount), 0);
  $('summary').textContent = chosen.length
    ? `${chosen.length} selected · ${fmtNumber(words)} words · about ${fmtHours(readingMinutes(words))} of reading`
    : 'Nothing selected.';
  $('make-pdf').disabled = chosen.length === 0;
  $('make-epub').disabled = chosen.length === 0;
  $('make-html').disabled = chosen.length === 0;
  renderPreviewsNote();
}

// Point out hidden paywalled previews right where the posts are listed.
function renderPreviewsNote() {
  const previews = state.posts.filter((p) => p.access === 'preview').length;
  const note = $('previews-note');
  note.hidden = previews === 0;
  if (!previews) return;
  const what = `${previews} paywalled ${previews === 1 ? 'post' : 'posts'}`;
  const toggle = (on) => () => {
    $('include-previews').checked = on;
    $('include-previews').dispatchEvent(new Event('change'));
  };
  note.replaceChildren(...(state.settings.includePreviews
    ? [`Previews of ${what} are included — handy for deciding whether to subscribe. `,
       el('button', { class: 'link', text: 'Leave them out', onclick: toggle(false) })]
    : [`${what} can only be included as free previews. `,
       el('button', { class: 'link', text: 'Include previews', onclick: toggle(true) })]));
}

// ---------- output ----------

const MAKE_BUTTONS = ['make-pdf', 'make-epub', 'make-html'];

async function makeBook(format) {
  const chosen = state.posts.filter((p) => p.selected && selectable(p));
  const range = state.search;
  if (!chosen.length || !range) return;
  // Guard against double clicks opening two tabs.
  for (const id of MAKE_BUTTONS) $(id).disabled = true;
  setTimeout(renderSummary, 1500);
  Object.assign(state.settings, {
    order: $('order').value,
    pageSize: $('page-size').value,
    imageScale: Number($('image-scale').value),
    typeface: $('typeface').value,
  });
  save();
  const title = $('title').value.trim() || 'Collected Reading';
  const job = {
    format,
    title,
    from: range.since.toISOString(),
    to: range.until.toISOString(),
    order: state.settings.order,
    pageSize: state.settings.pageSize,
    imageScale: state.settings.imageScale,
    typeface: state.settings.typeface,
    includePreviews: state.settings.includePreviews,
    posts: chosen.map(({ selected, access, reason, ...rest }) => rest),
    createdAt: Date.now(),
  };
  // Each book tab gets its own job; keep only the most recent few.
  const id = crypto.randomUUID();
  const all = await chrome.storage.local.get(null);
  const old = Object.entries(all)
    .filter(([k]) => k.startsWith('job:') || k === 'job')
    .sort(([, a], [, b]) => (b?.createdAt || 0) - (a?.createdAt || 0))
    .slice(9)
    .map(([k]) => k);
  if (old.length) await chrome.storage.local.remove(old);
  await chrome.storage.local.set({ [`job:${id}`]: job });
  chrome.tabs.create({ url: chrome.runtime.getURL(`book.html?job=${id}`) });
}

// Another Staple tab changed the saved publications or groups: follow along
// instead of overwriting its changes with our stale copy.
function syncFromStorage(changes, area) {
  if (area !== 'local') return;
  let changed = false;
  for (const key of ['sources', 'groups', 'activeGroup', 'importedAt']) {
    if (!(key in changes)) continue;
    const value = changes[key].newValue;
    if (JSON.stringify(value) === JSON.stringify(state[key])) continue;
    if (key === 'sources' || key === 'groups') state[key] = Array.isArray(value) ? value : [];
    else state[key] = value ?? null;
    changed = true;
  }
  if (changed) {
    closeGroupForm({ restore: false });
    renderSources();
  }
}

// ---------- wiring ----------

async function init() {
  if (SUPPORT_URL) {
    $('support-link').href = SUPPORT_URL;
    $('support').hidden = false;
  }
  await load();
  $('min-words').value = state.settings.minWords;
  $('include-previews').checked = state.settings.includePreviews;
  $('order').value = state.settings.order;
  $('page-size').value = state.settings.pageSize;
  $('image-scale').value = String(state.settings.imageScale);
  // Each name in its own face where the menu can show it (Windows, Linux); the sample line below shows it everywhere.
  $('typeface').replaceChildren(...Object.entries(TYPEFACES).map(([key, t]) => el('option', { value: key, text: t.label, style: `font-family: ${t.stack}` })));
  $('typeface').addEventListener('change', renderTypefaceSample);
  $('typeface').value = TYPEFACES[state.settings.typeface] ? state.settings.typeface : DEFAULT_TYPEFACE;
  setRange(7);
  renderSources();
  if (state.importedAt) {
    $('import-status').textContent =
      `${state.sources.length} publications saved · subscriptions last imported ${fmtDate(state.importedAt)}.`;
  }

  $('import').addEventListener('click', importSubscriptions);
  $('add-form').addEventListener('submit', onAdd);
  $('sources-filter').addEventListener('input', renderSources);
  $('selected-only').addEventListener('change', renderSources);
  $('group-form').addEventListener('submit', onGroupSubmit);
  $('group-cancel').addEventListener('click', () => { closeGroupForm(); renderSources(); });
  $('sources-all').addEventListener('click', () => {
    // While building a group, "All" just ticks everything.
    if (state.groupForm) {
      state.sources.forEach((s) => { s.enabled = true; });
      save();
      renderSources();
    } else {
      applyGroup('all');
    }
  });
  $('sources-none').addEventListener('click', () => { state.sources.forEach((s) => { s.enabled = false; }); save(); renderSources(); });

  for (const chip of document.querySelectorAll('.quick .chip')) {
    chip.addEventListener('click', () => setRange(Number(chip.dataset.days)));
  }
  $('from').addEventListener('change', updateDefaultTitle);
  $('to').addEventListener('change', updateDefaultTitle);
  $('title').addEventListener('input', () => { state.titleEdited = true; });
  $('include-previews').addEventListener('change', () => {
    readFilterSettings();
    // Only previews change; other ticks stay as the reader left them.
    for (const p of state.posts) if (p.access === 'preview') p.selected = state.settings.includePreviews;
    if (state.posts.length) renderPosts();
  });

  $('find').addEventListener('click', () => findPosts());
  $('retry-failed').addEventListener('click', () => findPosts({ only: state.errors.map((e) => e.source) }));
  chrome.storage.onChanged.addListener(syncFromStorage);
  showRateLimitNotices($('rate-notice'));
  $('posts-all').addEventListener('click', () => { state.posts.forEach((p) => { p.selected = selectable(p); }); renderPosts(); });
  $('posts-none').addEventListener('click', () => { state.posts.forEach((p) => { p.selected = false; }); renderPosts(); });
  $('make-pdf').addEventListener('click', () => makeBook('pdf'));
  $('make-epub').addEventListener('click', () => makeBook('epub'));
  $('make-html').addEventListener('click', () => makeBook('html'));
}

init();
