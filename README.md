# Packing for Parents

A dead-simple packing list web app for parents. Installs to any phone's home screen, works offline, no accounts.

Live at **[packingforparents.com](https://packingforparents.com)** (once deployed).

## What it is

A Progressive Web App (PWA) — a website that installs like an app. Users visit a URL, tap "Add to Home Screen," and it behaves like a native app. No App Store, no Play Store, no permissions prompts, no sign-ups.

Four curated trip templates (short trip, short overnight, long trip, Ruth's list for extended stays) plus a guided wizard that builds a personalized list from four questions. Users can customize any list with their own items. Everything saves locally on the user's phone.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Mobile-first styles |
| `app.js` | List logic, localStorage, error boundary |
| `templates.js` | The four curated trip templates — edit freely |
| `wizard.js` | The "Build me a list" wizard catalog and generator |
| `sw-register.js` | Service worker registration |
| `manifest.json` | PWA manifest (install-to-home-screen metadata) |
| `sw.js` | Service worker (offline cache) |
| `icon.svg`, `icon.png`, `icon-192.png`, `icon-512.png` | App icons |

## Try it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser. On desktop Chrome or Safari you can use the browser dev tools to simulate a mobile device.

## Deploy (pick the easiest for you)

### Option A — Netlify Drop (no account needed, fastest)

1. Go to https://app.netlify.com/drop
2. Drag the entire `parent_prep` folder onto the page
3. You get a public URL in ~10 seconds (e.g. `https://random-name-1234.netlify.app`)
4. Share that URL with your parenting group

You can claim the site with a free Netlify account later if you want a custom name.

### Option B — GitHub Pages (if you want the repo and the site linked)

1. Push this repo to GitHub
2. In repo Settings → Pages, set Source to `main` branch, `/` root
3. Your site will be at `https://<your-username>.github.io/parent_prep/`

### Option C — Cloudflare Pages / Vercel

Both work with a GitHub repo and are free. Connect the repo, no build command needed, publish directory is the root.

## How users install it on their phone

**iPhone (Safari):**
1. Open the URL in Safari (must be Safari, not Chrome)
2. Tap the Share button (square with arrow)
3. Scroll down, tap "Add to Home Screen"
4. Tap "Add"

**Android (Chrome):**
1. Open the URL in Chrome
2. Tap the three-dot menu
3. Tap "Install app" or "Add to Home Screen"

Once installed, the app opens full-screen from the home icon like any other app. Their lists stay on their phone.

## Customizing the templates

Open `templates.js`. Each template is an object with `id`, `name`, `emoji`, `description`, and `items`. Add, remove, or edit items freely — no other code needs to change. Reload the page (or bump the service worker version in `sw.js` after you redeploy) to see changes.

If you want your parenting group to collaborate on template changes, the easiest workflow is:

1. Put the repo on GitHub
2. During your meeting, edit `templates.js` together on a laptop
3. Commit and push
4. The deployed site updates automatically (if you used GitHub Pages / Netlify / Vercel)

## What it does NOT do (by design)

- No accounts, no login
- No cloud sync (each user's lists live on their own phone)
- No sharing lists between users (yet)
- No photos, no reminders, no notifications

Keeping it dead simple was the whole point. If your group wants sharing or sync later, that's a real backend and a real maintenance burden — worth discussing whether it's worth it before building it.

## Tech notes

- Vanilla JS, no framework, no build step
- ~500 lines total
- Works offline after first load (service worker caches everything)
- localStorage persistence (key: `parentprep.lists.v1`)
- Mobile-first, 48px minimum tap targets, safe-area insets for notched phones
