# 🍄 Shroom Buddies

A free app for daily practices, journaling, a calendar, guides and reels.

- **No app store, no accounts, no cost.** It's a web app you add to your home screen on Android or iPhone.
- **All personal data stays on each phone** (browser storage). Settings → Backup exports and imports it.
- **Works offline** after the first visit.
- Plain HTML, CSS and JavaScript only. No paid services or libraries.

## Features
- 🌱 **Today**: daily practice checklist, streak, quote of the day
- 📓 **Journal**: mood, energy, intention and notes (type or speak)
- 🍄 **Tracker**: microdose or grams per day, plus supplements and food with reminders
- 📅 **Calendar**: everything together, plus a mood, energy and dose graph
- 📖 **Guides**: folders of guides; the owner can edit the wording
- 🎬 **Reels**: videos shared with everyone, with previews
- ⚙️ **Settings**: install instructions, practices, backup, admin sign-in

## Publish it (free, GitHub Pages)
1. On GitHub, open this repo → **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main`, folder `/ (root)`, and press **Save**.
3. After a minute or two the app is live at **https://longzdalez.github.io/Shroom-Buddies-/**
4. Share that link. Anyone can then install it (see below). Nothing is paid and no app store is needed.

## How people install it
- **Android (Chrome):** open the link, tap ⋮ → **Install app** (or **Add to Home screen**).
- **iPhone (Safari):** open the link in *Safari* (not another browser), tap the Share button ⬆️ → **Add to Home Screen**.

The app also has an **📲 Install the app** card in Settings that does the same thing.

## Admin (only the owner can change guides and reels)
Changes that reach everyone are made through GitHub, and only people with write access to this repo can commit. The app's admin sign-in simply hides the editing tools from everyone else.

**One-time setup:**
1. Choose a long passphrase (at least 4 random words). Keep it private.
2. Create its fingerprint with: `printf '%s' 'shroombuddies-admin:YOUR PASSPHRASE' | sha256sum`
3. Put the 64-character code (without the trailing `-`) into `site.json` as `"adminHash"`, and commit.
4. On your phone: ⚙️ Settings → **Admin** → enter the passphrase → **Sign in**.

Admin mode is per phone and is not included in backups.

## Adding content (admin)
- **Guides:** in the app, open a guide while in admin mode, tick **Guide editing**, tap the text, then **Publish for everyone**. Or edit the `.md` files in `guides/` on GitHub.
- **New guide:** add a `.md` file to `guides/` and list it in `guides/guides.json`.
- **Reels for everyone:** on the Reels page (admin), paste a link and press **🌍 Share with everyone**, then commit `reels.json` on GitHub. Or add `{"title": "…", "url": "https://…"}` to `reels.json` directly.
- **Quotes:** edit `quotes.json`.
- **Website button:** put your address in `site.json` as `"website": "https://…"`. A "Visit our website" button then appears on the Reels page.

## Updating the app
When you change files, bump `CACHE` in `sw.js` (e.g. `sb-v12`) so phones pick up the new version.
