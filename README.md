# GitHub Tab Favicon

Chromium extension (Chrome, Helium, Arc…) that gives each GitHub repo tab its own icon, so collapsed tabs are easy to tell apart.

- **Repo tabs**: the repo's own favicon with a small GitHub mark in the corner
- **Localhost tabs**: the dev server's favicon with an orange dot, so a dev tab is not taken for the live site

## Where the icon comes from

1. Your pick from the popup: an image file (drop, paste or choose), an image from the repo, or a letter/emoji with a color
2. The repo's favicon/icon/logo file, found automatically (works for private repos, uses your GitHub login, no token)
3. A letter + color from the repo name

## Install

```sh
bun install
bun run build
```

Open `chrome://extensions`, turn on Developer mode, then **Load unpacked** → `dist/`.

## Dev

```sh
bun run typecheck
bun test
```
