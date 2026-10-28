import {
  AUTO_TTL,
  autoKey,
  bestIcon,
  blobToDataUrl,
  letterBadge,
  mimeOf,
  normalizeImage,
  overrideKey,
  rankImages,
  renderFavicon,
  type Badge,
  type Message,
  type Resolved,
  type Responses,
} from './lib.ts';

type AutoEntry = { resolved: Resolved; at: number };

/** `owner/repo` on repo pages, null elsewhere */
const currentNwo = () =>
  document.querySelector<HTMLMetaElement>('meta[name="octolytics-dimension-repository_nwo"]')
    ?.content || null;

/** Every file path in the default branch. Same endpoint as GitHub's `t` file finder, so private repos work */
const listPaths = async (nwo: string) => {
  const res = await fetch(`/${nwo}/tree-list/HEAD`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const { paths }: { paths?: unknown } = await res.json();
  return Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [];
};

/** Repo file → small PNG data URL. `/raw/` redirects to raw.githubusercontent.com with a token for private repos */
const fetchRepoImage = async (nwo: string, path: string) => {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`/${nwo}/raw/HEAD/${encoded}`);
  if (!res.ok) throw new Error(`${res.status} for ${path}`);
  // raw.githubusercontent.com serves svg as text/plain, so set the type from the extension
  const blob = new Blob([await res.arrayBuffer()], { type: mimeOf(path) });
  return normalizeImage(await blobToDataUrl(blob));
};

const detect = async (nwo: string): Promise<Resolved> => {
  try {
    const path = bestIcon(rankImages(await listPaths(nwo)));
    if (path) {
      return { badge: { type: 'image', src: await fetchRepoImage(nwo, path), path }, source: 'repo' };
    }
  } catch (e) {
    console.warn('[github-tab-favicon]', e);
  }
  return { badge: letterBadge(nwo), source: 'letter' };
};

/** Your pick from the popup → cached auto pick → detect (and cache it) */
const resolve = async (nwo: string): Promise<Resolved> => {
  const [oKey, aKey] = [overrideKey(nwo), autoKey(nwo)];
  const stored = await chrome.storage.local.get<Record<string, Badge | AutoEntry | undefined>>([
    oKey,
    aKey,
  ]);
  const override = stored[oKey] as Badge | undefined;
  if (override) return { badge: override, source: 'custom' };

  const auto = stored[aKey] as AutoEntry | undefined;
  if (auto && Date.now() - auto.at < AUTO_TTL) return auto.resolved;

  const resolved = await detect(nwo);
  await chrome.storage.local.set({ [aKey]: { resolved, at: Date.now() } satisfies AutoEntry });
  return resolved;
};

const dark = matchMedia('(prefers-color-scheme: dark)');
const iconLinks = () => document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');

const setIcon = (href: string) => {
  for (const link of iconLinks()) {
    link.dataset.ghtfHref ??= link.href;
    link.dataset.ghtfType ??= link.type;
    if (link.href !== href) {
      link.href = href;
      link.type = 'image/png';
    }
  }
};

const restoreIcon = () => {
  for (const link of iconLinks()) {
    const { ghtfHref, ghtfType } = link.dataset;
    if (ghtfHref === undefined) continue;
    link.href = ghtfHref;
    link.type = ghtfType ?? '';
    delete link.dataset.ghtfHref;
    delete link.dataset.ghtfType;
  }
};

let applied: { nwo: string; href: string; resolved: Resolved } | null = null;
let pending: { nwo: string; done: Promise<void> } | null = null;
let run = 0;

const sync = (force = false): Promise<void> => {
  const nwo = currentNwo();
  if (!nwo) {
    if (applied) restoreIcon();
    applied = null;
    return Promise.resolve();
  }
  // head mutates a lot while loading, don't start detection twice
  if (!force && pending?.nwo === nwo) return pending.done;
  if (!force && applied?.nwo === nwo) {
    // GitHub swaps the favicon for CI status, put ours back
    if ([...iconLinks()].some((l) => l.href !== applied?.href)) setIcon(applied.href);
    return Promise.resolve();
  }
  const id = ++run;
  const done = (async () => {
    const resolved = await resolve(nwo);
    const href = await renderFavicon(resolved.badge, dark.matches);
    if (id !== run) return; // a newer sync started meanwhile
    applied = { nwo, href, resolved };
    setIcon(href);
  })()
    .catch((e: unknown) => console.warn('[github-tab-favicon]', e))
    .finally(() => {
      if (pending?.done === done) pending = null;
    });
  pending = { nwo, done };
  return done;
};

const handle = async (msg: Message): Promise<Responses[Message['type']]> => {
  const nwo = currentNwo();
  switch (msg.type) {
    case 'getState':
      await sync(msg.refresh);
      return { nwo, resolved: applied?.resolved ?? null };
    case 'listImages':
      return nwo ? rankImages(await listPaths(nwo)) : [];
    case 'fetchImage':
      if (!nwo) throw new Error('Not a repo page');
      return fetchRepoImage(nwo, msg.path);
  }
};

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: unknown) => sendResponse({ error: String(e) }));
  return true; // async response
});

chrome.storage.onChanged.addListener((changes) => {
  const nwo = currentNwo();
  if (nwo && (overrideKey(nwo) in changes || autoKey(nwo) in changes)) void sync(true);
});

dark.addEventListener('change', () => void sync(true));
// Covers Turbo navigation (title/meta change) and GitHub resetting the favicon
new MutationObserver(() => void sync()).observe(document.head, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['href', 'content'],
});
document.addEventListener('turbo:load', () => void sync());
void sync();
