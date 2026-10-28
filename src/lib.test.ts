import { expect, test } from 'bun:test';
import { bestIcon, letterBadge, rankImages } from './lib.ts';

test('picks the project favicon over noise', () => {
  const ranked = rankImages([
    'README.md',
    '.repos/other/public/favicon.ico',
    'apps/web/src/components/avatar.png',
    'docs/logo.svg',
    'apps/admin/public/favicon.ico',
    'apps/web/public/icon-512.png',
  ]);
  expect(bestIcon(ranked)).toBe('apps/admin/public/favicon.ico');
  expect(ranked).not.toContain('README.md');
});

test('no confident pick when only random images', () => {
  expect(bestIcon(rankImages(['src/assets/bg-texture.png']))).toBeUndefined();
});

test('letter skips words shared with the owner', () => {
  expect(letterBadge('meetlive-livestream/meetlive-frontend').text).toBe('F');
  expect(letterBadge('Sonobee-Ultrasound/sonobee-mobile').text).toBe('M');
  expect(letterBadge('harithilmi/osm-editor').text).toBe('O');
  expect(letterBadge('sonobee/sonobee').text).toBe('S');
});
