# PDF Tag Simple
<img width="822" height="487" alt="Image" src="https://github.com/user-attachments/assets/8ae4f8b1-55fd-4be6-b14b-88670310449d" />
I have too many PDFs. All sitting on a HDD.

You know the feeling — open a folder with a few thousand files and wait a full minute just for Explorer to finish loading. Then you still can't find what you're looking for.

So I built this.

## Getting started

1. Click **Add Path** — select your PDF folder
2. Click **Update DB** — scans the folder and renders thumbnails (first time is slow, see benchmarks below)
3. Done — browse, search, and tag

Every time you add new files to the folder, click **Update DB** again to pick them up.

---



**Scan once. Browse forever.**

The app scans your PDF folder, then stores all metadata and thumbnails on your SSD. After that, browsing is instant — because you're reading from SSD cache, not spinning up the HDD every time.

For small libraries (a few hundred files) the first scan is quick. For large ones it takes longer — mostly because rendering thumbnails for that many PDFs is just slow. Rough benchmarks on a HDD:

| Files | Time |
|-------|------|
| ~500  | ~1 min |
| ~3000 | ~4 min |
| ~10000 | ~14 min |

If the app seems frozen during a large scan: it's probably still working in the background. Check `%AppData%\com.menco.pdftag\cache` — if files are appearing there, it's still running. Just leave it.

Once it's done, you can filter by tags, search by name, and browse everything at a speed that feels almost unreasonable for a HDD library.

## Features

- **One-time scan** — slow once, instant forever
- **AI Auto-Tag** — reads your filenames (and optionally cover thumbnails) and suggests tags automatically. Works with OpenAI or a local Ollama model.
- **Tag filter** — click any tag to filter instantly
- **Thumbnail grid** — actually see your files instead of just filenames
- **Search** — real-time search by filename
- **Star files** — mark favorites
- **Duplicate finder** — works, but it's basic. If you have serious duplicates, use a dedicated duplicate finder app instead. This one is just "good enough."
- **Import / Export** — backup your tag database

## What it doesn't do

- No subfolder tree — the app scans one folder at a time, no recursive subfolder adding
- No cloud sync
- Nothing fancy

That's fine. It does what I need.

## Download

Grab the latest release from the [Releases](../../releases) page.

Extract the zip and run `pdf-tag.exe`. Keep the `.dll` files in the same folder — the app needs them to render PDF thumbnails.

Built with Tauri, so it's fast and light.

## AI Auto-Tag

Supports two providers:

**OpenAI** — needs an API key. Go to AI Settings, paste your key, done. Get one at [platform.openai.com](https://platform.openai.com/).

**Ollama** — runs locally, no API key needed. Install [Ollama](https://ollama.com/), pull a model, point the app at `http://localhost:11434`.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + A` | Select all visible (respects current folder / search / tag filter) |
| `Ctrl + F` | Focus search box |
| `Esc` | Clear selection |
| `Shift + Click` | Select range |
| `Double click` | Open PDF |

## Source code

It's here on this GitHub. Not the cleanest code — built for me, shared in case it's useful for you.

## Buy meow a pizza 🍕

If this saved you some time, crypto tips are appreciated:

| Chain | Address |
|-------|---------|
| Bitcoin | `bc1qq22t5n273qxd9m4x6hhfalpffxhfhce5zy5vw7` |
| BNB | `0x93C9E2C8c40E23ebc09DB2a620a673E6024AaEed` |
| TON | `EQAVuIKvQvjY6_bRoCDrWvYygFmI0yP8wVfAUBBR6y2ZIIXm` |
| SOL | `8CqbAtwK22iQjSh9ZE7BVB9wLDwwVu1kQDBA42omcjeo` |

---

Built by [@mencolovepizza](https://github.com/mencolovepizza)
