import {
  autoKey,
  blobToDataUrl,
  letterBadge,
  normalizeImage,
  overrideKey,
  renderFavicon,
  type Badge,
  type Message,
  type Responses,
  type State,
} from './lib.ts';

const el = <T extends HTMLElement>(selector: string) => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};

const ui = {
  preview: el<HTMLImageElement>('#preview'),
  repo: el('#repo'),
  source: el('#source'),
  notice: el('#notice'),
  main: el('#main'),
  drop: el<HTMLLabelElement>('#drop'),
  file: el<HTMLInputElement>('#file'),
  search: el<HTMLInputElement>('#search'),
  grid: el('#grid'),
  text: el<HTMLInputElement>('#text'),
  color: el<HTMLInputElement>('#color'),
  applyText: el<HTMLButtonElement>('#apply-text'),
  reset: el<HTMLButtonElement>('#reset'),
};

const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const thumbs = new Map<string, Promise<string>>();
let tabId = 0;
let state: State = { nwo: null, resolved: null };
let paths: string[] = [];

const ask = async <T extends Message['type']>(msg: Extract<Message, { type: T }>) => {
  const reply = await chrome.tabs.sendMessage<Message, Responses[T] | { error: string }>(tabId, msg);
  if (typeof reply === 'object' && reply !== null && 'error' in reply) throw new Error(reply.error);
  return reply;
};

/** `hsl(…)` → `#rrggbb`, for the color input */
const toHex = (color: string) => {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return '#888888';
  ctx.fillStyle = color;
  return String(ctx.fillStyle);
};

const SOURCE_LABEL = {
  custom: () => 'Custom',
  repo: (b: Badge) => `From repo: ${b.type === 'image' ? b.path : ''}`,
  letter: () => 'Letter (no icon found in repo)',
};

const show = async () => {
  const { nwo, resolved } = state;
  if (!nwo || !resolved) return;
  ui.repo.textContent = nwo;
  ui.source.textContent = SOURCE_LABEL[resolved.source](resolved.badge);
  ui.preview.src = await renderFavicon(resolved.badge, dark);

  const fallback = letterBadge(nwo);
  const { badge, source } = resolved;
  ui.text.placeholder = fallback.text;
  ui.text.value = badge.type === 'text' && source === 'custom' ? badge.text : '';
  ui.color.value = toHex(badge.type === 'text' ? badge.bg : fallback.bg);
  renderGrid();
};

const setBadge = async (badge: Badge) => {
  if (!state.nwo) return;
  await chrome.storage.local.set({ [overrideKey(state.nwo)]: badge });
  state = await ask({ type: 'getState', refresh: true });
  await show();
};

const useFile = async (file: File | null | undefined) => {
  if (!file) return;
  try {
    await setBadge({ type: 'image', src: await normalizeImage(await blobToDataUrl(file)) });
  } catch {
    ui.source.textContent = `Could not read ${file.name}`;
  }
};

const thumb = (path: string) => {
  let src = thumbs.get(path);
  if (!src) {
    src = ask({ type: 'fetchImage', path });
    thumbs.set(path, src);
  }
  return src;
};

const renderGrid = () => {
  const q = ui.search.value.trim().toLowerCase();
  const current = state.resolved?.badge.type === 'image' ? state.resolved.badge.path : undefined;
  const matches = paths.filter((p) => p.toLowerCase().includes(q)).slice(0, 48);

  if (!matches.length) {
    ui.grid.textContent = paths.length ? 'No match' : 'No images in this repo';
    return;
  }
  ui.grid.replaceChildren(
    ...matches.map((path) => {
      const button = document.createElement('button');
      const img = document.createElement('img');
      const name = document.createElement('span');
      button.title = path;
      button.setAttribute('aria-pressed', String(path === current));
      name.textContent = path.split('/').pop() ?? path;
      button.append(img, name);
      thumb(path).then(
        (src) => (img.src = src),
        () => button.classList.add('broken'),
      );
      button.onclick = async () => setBadge({ type: 'image', src: await thumb(path), path });
      return button;
    }),
  );
};

const wire = () => {
  ui.file.onchange = () => useFile(ui.file.files?.[0]);
  ui.drop.ondragover = (e) => {
    e.preventDefault();
    ui.drop.classList.add('over');
  };
  ui.drop.ondragleave = () => ui.drop.classList.remove('over');
  ui.drop.ondrop = (e) => {
    e.preventDefault();
    ui.drop.classList.remove('over');
    void useFile(e.dataTransfer?.files[0]);
  };
  document.onpaste = (e) => {
    const file = e.clipboardData?.files[0];
    if (file) void useFile(file);
  };
  ui.search.oninput = renderGrid;
  ui.applyText.onclick = () => {
    if (!state.nwo) return;
    // max 2 characters, emoji kept whole
    const text = [...ui.text.value.trim()].slice(0, 2).join('') || letterBadge(state.nwo).text;
    void setBadge({ type: 'text', text, bg: ui.color.value });
  };
  ui.reset.onclick = async () => {
    if (!state.nwo) return;
    await chrome.storage.local.remove([overrideKey(state.nwo), autoKey(state.nwo)]);
    state = await ask({ type: 'getState', refresh: true });
    await show();
  };
};

const main = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? 0;
  try {
    state = await ask({ type: 'getState' });
  } catch {
    ui.notice.textContent = 'Open a GitHub repo tab. If it was open before installing, reload it.';
    return;
  }
  if (!state.nwo) {
    ui.notice.textContent = 'Not a repo page.';
    return;
  }
  ui.notice.hidden = true;
  ui.main.hidden = false;
  wire();
  await show();
  ui.grid.textContent = 'Loading repo images…';
  paths = await ask({ type: 'listImages' });
  renderGrid();
};

void main();
