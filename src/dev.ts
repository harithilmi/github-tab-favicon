import { loadImage } from './lib.ts';

// Same dot as kl-transit-v2's libs/shared/devIcon.ts (120-unit viewBox)
const SIZE = 128;
const DOT = { cx: 93, cy: 27, r: 24, stroke: 6, fill: '#f97316' };

const iconLinks = () => document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');

/** The app's favicon with an orange dot, so a dev tab is not taken for the live site */
const render = async (href: string) => {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  // no favicon at all → dot alone still says "dev"
  await loadImage(href).then(
    (img) => ctx.drawImage(img, 0, 0, SIZE, SIZE),
    () => undefined,
  );
  ctx.scale(SIZE / 120, SIZE / 120);
  ctx.beginPath();
  ctx.arc(DOT.cx, DOT.cy, DOT.r, 0, Math.PI * 2);
  ctx.fillStyle = DOT.fill;
  ctx.fill();
  ctx.lineWidth = DOT.stroke;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  return c.toDataURL('image/png');
};

let busy = false;

const sync = async () => {
  if (busy) return;
  const links = [...iconLinks()];
  // ours already, or an app that dots its own dev icon (kl-transit serves a data: svg)
  if (links.some((l) => l.dataset.ghtfDev !== undefined || l.href.startsWith('data:'))) return;
  busy = true;
  try {
    const href = await render(links[0]?.href ?? '/favicon.ico');
    if (!links.length) {
      const link = document.createElement('link');
      link.rel = 'icon';
      document.head.append(link);
      links.push(link);
    }
    for (const link of links) {
      link.dataset.ghtfDev = '';
      link.type = 'image/png';
      link.href = href;
    }
  } finally {
    busy = false;
  }
};

// Next/Vite can swap <head> links on navigation or HMR
new MutationObserver(() => void sync()).observe(document.head, { childList: true, subtree: true });
void sync();
