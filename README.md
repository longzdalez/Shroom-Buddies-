# 🍄 Shroom Buddies

A free phone app for daily practices, journaling, a calendar and guides.

- **No app store, no accounts, no costs.** It's a web app (PWA) you install from the browser.
- **All data stays on your phone** (browser storage). Use Settings → Backup to export/import.
- **Works offline** after the first visit.
- Built with plain HTML/CSS/JavaScript only — no paid services or libraries.

## Features
- 🌱 **Today** – daily practice checklist, streak, today's journal entry
- 📓 **Journal** – mood, energy, intention and notes
- 📖 **Guides** – your own guides, written as simple text files in `guides/`
- 🍄 **Tracker** – log the days you took mushrooms (microdose or grams), plus supplements and food
- 📅 **Calendar** – everything together, plus a graph of practices, mood, energy and doses
- 🎬 **Reels** – Instagram, Facebook, TikTok and YouTube videos with previews
- ⚙️ **Settings** – edit practices, backup

## Put it on your phone (free)
1. In this repo on GitHub: **Settings → Pages → Branch: `main` / root → Save**
2. After a minute it's live at `https://longzdalez.github.io/Shroom-Buddies-/`
3. Open that link on your phone → **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android)

## Adding content
- **Guides:** add a `.md` file to `guides/` and list it in `guides/guides.json`
- **Quotes:** edit `quotes.json` to change the quote of the day
- **Reels for everyone:** add a line to `reels.json`, e.g.
  `{"title": "Morning routine", "url": "https://www.instagram.com/reel/ABC123/"}`
  (separate entries with commas). Instagram, Facebook, TikTok and YouTube links show a preview.
- **Website button:** put your website address in `site.json` (e.g. `"website": "https://shroombuddies.co.uk"`) and a "Visit our website" button appears on the Reels page.
