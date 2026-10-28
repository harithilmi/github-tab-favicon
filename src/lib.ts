/** What sits in the badge on top of the GitHub mark */
export type Badge =
  | { type: 'image'; src: string; path?: string }
  | { type: 'text'; text: string; bg: string };

export type TextBadge = Extract<Badge, { type: 'text' }>;

/** Where the badge came from, shown in the popup */
export type Source = 'custom' | 'repo' | 'letter';

export type Resolved = { badge: Badge; source: Source };

/** Popup → content script. `refresh` re-resolves after the popup changed storage */
export type Message =
  | { type: 'getState'; refresh?: boolean }
  | { type: 'listImages' }
  | { type: 'fetchImage'; path: string };

export type State = { nwo: string | null; resolved: Resolved | null };

/** Reply for each message type (or `{ error }` if it threw) */
export type Responses = {
  getState: State;
  listImages: string[];
  fetchImage: string;
};

export const overrideKey = (nwo: string) => `override:${nwo.toLowerCase()}`;
export const autoKey = (nwo: string) => `auto:${nwo.toLowerCase()}`;

/** Auto-detected icons are re-checked after a week */
export const AUTO_TTL = 7 * 24 * 60 * 60 * 1000;

const IMAGE_EXT = /\.(svg|png|ico|jpe?g|webp|gif)$/i;
const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const mimeOf = (path: string) =>
  MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** Folders that hold someone else's icons (deps, examples, tests, dot-folders) */
const NOISE =
  /(^|\/)(\.[^/]+|node_modules|vendor|third[_-]?party|examples?|fixtures?|__tests__|tests?|e2e|docs?|storybook|stories)\//i;

/** Higher = more likely to be the project's own icon. Negative = not worth showing first */
export const scorePath = (path: string): number => {
  const file = path.split('/').pop()?.toLowerCase() ?? '';
  const depth = path.split('/').length - 1;
  let score = 0;

  if (/^favicon\b/.test(file)) score += 100;
  else if (/^(apple-touch-)?icon\b|^app[-_]?icon/.test(file)) score += 70;
  else if (/logo/.test(file)) score += 40;
  else if (/icon/.test(file)) score += 10;

  if (/wordmark|banner|screenshot|social|og[-_]/.test(file)) score -= 50;
  if (/\.svg$/.test(file)) score += 15;
  else if (/\.(png|ico)$/.test(file)) score += 10;
  if (/(^|\/)(public|static|app|assets)\//.test(path)) score += 20;
  if (NOISE.test(path)) score -= 200;

  return score - depth * 5;
};

/** All image files, best icon candidates first */
export const rankImages = (paths: readonly string[]) =>
  paths
    .filter((p) => IMAGE_EXT.test(p))
    .map((p) => ({ p, s: scorePath(p) }))
    .sort((a, b) => b.s - a.s)
    .map(({ p }) => p);

/** Good enough to use automatically (a plain `foo.png` deep in src is not) */
export const bestIcon = (ranked: readonly string[]) => {
  const top = ranked[0];
  return top !== undefined && scorePath(top) >= 40 ? top : undefined;
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * Letter badge. Words shared with the owner are skipped, so
 * `meetlive-livestream/meetlive-frontend` → F instead of M
 */
export const letterBadge = (nwo: string): TextBadge => {
  const [owner = '', repo = ''] = nwo.toLowerCase().split('/');
  const split = (s: string) => s.split(/[-_.\s]+/).filter(Boolean);
  const ownerWords = new Set(split(owner));
  const word = split(repo).find((w) => !ownerWords.has(w)) ?? repo;
  return {
    type: 'text',
    text: (word[0] ?? '?').toUpperCase(),
    bg: `hsl(${hash(nwo.toLowerCase()) % 360} 60% 45%)`,
  };
};

// GitHub's `mark-github` octicon, 16×16
const GH_MARK =
  'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.27-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.25-.6-.86-1.23-.85-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });

const canvas = (size: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  return { c, ctx };
};

/** Any image (svg/ico/png/…) → small PNG data URL, so storage stays small */
export const normalizeImage = async (src: string, size = 128) => {
  const img = await loadImage(src);
  const w = img.naturalWidth || size;
  const h = img.naturalHeight || size;
  const scale = size / Math.max(w, h);
  const { c, ctx } = canvas(size);
  ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
  return c.toDataURL('image/png');
};

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Favicon: project icon big, small GitHub mark cut out at bottom-right.
 * Drawn in 64 units on a 128px canvas so it stays sharp on Retina
 */
export const renderFavicon = async (badge: Badge, dark: boolean) => {
  const { c, ctx } = canvas(128);
  ctx.scale(2, 2);
  const [cx, cy, r] = [28, 28, 28]; // project circle
  const mark = { x: 37, y: 37, size: 26, cut: 16 }; // GH mark, cut radius around its centre

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (badge.type === 'image') {
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(await loadImage(badge.src), cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = badge.bg;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${badge.text.length > 1 ? 26 : 36}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge.text, cx, cy + 2);
  }
  ctx.restore();

  // transparent ring so the mark reads on any tab background
  const centre = mark.x + mark.size / 2;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(centre, centre, mark.cut, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.translate(mark.x, mark.y);
  ctx.scale(mark.size / 16, mark.size / 16);
  ctx.fillStyle = dark ? '#ffffff' : '#1f2328';
  ctx.fill(new Path2D(GH_MARK));

  return c.toDataURL('image/png');
};
