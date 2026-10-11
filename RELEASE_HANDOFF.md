# EmuLatte 1.0 — Release Handoff

**Written:** 2026-07-20, from the Clarity monorepo session that shipped Clarity 1.0.
**For:** a fresh Claude session started in `/home/jose/Documents/DEVELOPMENT/CLAUDE/EmuLatte_Electron_Build/`.

Open that session and say: **"Read RELEASE_HANDOFF.md and let's start."**

This document is the complete plan to take EmuLatte to a 1.0 release the same way Clarity
1.0 was taken there: code audit, version/About plumbing, in-app manual, README rewrite, a website
in the same visual language, a screenshot gallery, and the GitHub release.

Everything in **§2 (State of the repo)** was verified by reading this repo on 2026-07-20. Facts are
marked ✅ verified or ⚠️ needs checking. Do not trust the ⚠️ ones without looking.

---

## 1. Who you're working for, and how

Jose (`shampoo-is-a-lie`, joserobertoazevedo@gmail.com). Read these before making style choices:

- **Autonomous.** `bypassPermissions` is on. Don't stop to ask permission for edits, builds or
  greps. **Do** stop before anything outward-facing: pushing to GitHub, publishing a website,
  creating a release, merging to `main`. Those are gated on his explicit say-so.
- **Branch workflow.** Work on `experimental`. Fast-forward merge to `main`, push both, and only
  when he says so. This repo is already on `experimental` and it is clean.
- **Build after changes.** `npm run dist` after code changes — no need to ask. Takes a while and
  produces a ~213 MB AppImage.
- **No emojis in the README.** Clarity's README had them stripped deliberately. Use the `◈` / box-drawing
  style already in EmuLatte's README.
- **Bundle fonts locally.** Never Google Fonts / remote fonts *in the app*. Per-app `assets/fonts/`.
  (The **website** is the exception — Clarity's site does load Google Fonts, and that's fine and intended.)
- **Capitalization is exact:** `EmuLatte`. Never "Emulatte", "EmuLatté", "emuLatte".
- **Tagline:** "I use RetroArch BTW".
- He writes prompts casually and expects you to infer scope. When a task has several parts, do them
  all in one pass rather than checking in between each.

---

## 2. State of the repo (verified 2026-07-20)

| Thing | State |
|---|---|
| Path | `/home/jose/Documents/DEVELOPMENT/CLAUDE/EmuLatte_Electron_Build/` ✅ |
| Remote | `https://github.com/shampoo-is-a-lie/EmuLatte.git` ✅ |
| Branches | on `experimental`; `main` exists; both pushed to origin; **working tree clean** ✅ |
| Last commit | `e7cc1b5` Game Manual viewer (SS PDF, independent window); 5 BrewBalance themes; persist gallery sort ✅ |
| Version | `package.json` already says **1.0.0** ✅ |
| License | `LICENSE` present, GPL-3.0 ✅ |
| Build | `npm run dist` → `dist/EmuLatte.AppImage`, currently **213 MB** ✅ |
| `postdist` | copies the AppImage to `/home/jose/Games/Clarity/` ✅ |
| Electron | 41.3.0; deps `better-sqlite3`, `adm-zip` ✅ |

**Shape of the app** — two faces in one binary, like Clarity:
- `index.html` + `renderer.js` (267 KB) — the desktop face.
- `couch.html` + `couch.js` (111 KB) — **Couch Mode**, EmuLatte's own gamepad/TV face. It has
  display types (Horizontal/Vertical/CRT), a screensaver, ambient BGM/SFX, a now-playing screen,
  a save-states manager and CRT shaders. This is a *major* feature and the current README barely
  mentions it. It needs full README + website + manual coverage.
- `main.js` (167 KB) — IPC, scraping, launching.
- `manual.html` + `manual.js` — ⚠️ **this is NOT a user manual.** It is a viewer window for
  *scanned game manual PDFs* pulled from ScreenScraper. Don't confuse the two.

**Data:** `GameManagerConfig/EmuLatte/` — `emulatte.db`, `images/{covers,heroes,logos,screenshots}/`,
`trailers/`, `systems.json`.

**Secrets:** `assets/ss_dev.json` (plaintext ScreenScraper dev creds) is gitignored and excluded from
the build; `scripts/scramble-ssdev.js` runs on `predist` and XOR-scrambles it into `ss_dev.dat`,
which *is* shipped. That's deliberate obfuscation, not a bug. Leave the design alone; just verify
in §3 that no plaintext leaked into the built AppImage.

**Bundled binaries:** `assets/bin/linux/` (yt-dlp, ffmpeg, ffprobe, ~156 MB) is gitignored. Anyone
building from source must place them manually. This is why the AppImage is 213 MB.

---

## 3. Audit — findings already confirmed

I ran Clarity's audit probes against this repo. **These four are real and already confirmed.** Start here.

### 3.1 ❌ README states the ecosystem integration backwards — HIGH PRIORITY

`README.md`, "Ecosystem Integration" says:

> "Clarity and Couch Mode can each optionally read EmuLatte's library and surface your ROMs under an
> **Emulation** category — no import, no duplication. **They read EmuLatte's DB directly** and use
> the same launch commands it stores."

**This is wrong**, and it's the exact claim that was corrected everywhere else in the ecosystem on
2026-07-20. The truth, confirmed in Clarity's code (`check-emulatte` only detects the AppImage for the
launcher button):

> Games reach Clarity **only by exporting them to Clarity from inside EmuLatte**. Clarity
> does not read EmuLatte's DB and has no "show emulation" toggle. Exported games land as ordinary
> `games.db` rows with `Store` = `Emulation`. Management of the ROM collection always stays in EmuLatte.

Clarity's README, in-app manual and website were all fixed. EmuLatte's README is the last place the old
claim survives. **Say "export", never "reads its DB".** The ASCII ecosystem diagram in the same
section also needs its `EmuLatte` line reworded.

### 3.2 ❌ System count is wrong in the README

`assets/systems.json` contains **56** systems. The README says "55 systems" in the subtitle and again
in the ROM Library box. Fix both, or make the README not state a number.

### 3.3 ❌ No version plumbing / no About dialog

`grep` for `get-app-version` and `app.getVersion` returns **nothing**. Clarity 1.0 added a `get-app-version`
IPC handler feeding an About dialog so the shipped version is visible in-app. EmuLatte has no
equivalent. Add:
- `ipcMain.handle('get-app-version', () => app.getVersion())` in `main.js`
- expose it in `preload.js`
- an About entry in the app menu showing name, version, GPL-3.0, the Clarity ecosystem line
  and the contact/GitHub links. Mirror Clarity's About wording.

### 3.4 ⚠️ Theme drift between the two faces

- `renderer.js` → `EL_THEMES` = **70** themes
- `couch.js` → `THEMES` = **69** themes
- The only difference is `Couch Mode`, present on the desktop face and missing from Couch Mode.

Decide with Jose whether that's intentional (a "Couch Mode" theme inside EmuLatte's couch face is a bit
odd) or an oversight. **The bigger question:** Clarity's three faces all carry **93 themes in 10
categories** after the LatteWrite "Systems" import. EmuLatte is at ~70 and never received the 20
retro-OS "Systems" themes. Ask whether 1.0 should bring EmuLatte to parity — it's a copy-paste of
the theme defs plus the era-font wiring, and it's the single most visible consistency gap in the
ecosystem.

**This is the known trap:** Couch Mode silently fell behind by exactly this mechanism and nobody noticed
for two waves, because a face that's missing a theme just falls back instead of erroring.

### 3.5 Probes that came back CLEAN — don't waste time re-checking

| Probe | Result |
|---|---|
| Duplicate element IDs in `index.html` / `couch.html` / `manual.html` | ✅ none (Clarity had a dead button from this) |
| Library search scanning every DB column | ✅ clean — search is title-scoped (`renderer.js:108`, `couch.js:891`). Clarity's bug was `Object.values` over 52 columns |
| Unbounded `textContent +=` log growth | ✅ none found |
| Games killed when the app quits | ✅ clean — `spawn(..., {detached:true, stdio:'ignore'}).unref()` at `main.js:670,809,850` |
| Hardcoded `/home/jose` in shipped code | ✅ only in the `postdist` npm script, which never ships |
| Dev database bundled into the asar | ✅ clean — `build.files` lists only source + `assets/**`, no config/db. Clarity shipped its dev `games.db` by accident; **still verify the built AppImage** per §3.6 |
| No i18n at all | ✅ confirmed absent — see §3.7 |

### 3.6 Verify the built artifact before releasing

Clarity's worst pre-release find was a personal games database bundled inside the asar. The `files` list
here looks safe, but prove it on the real artifact:

```bash
npx asar list dist/linux-unpacked/resources/app.asar | grep -iE 'config|\.db|ss_dev\.json|games\.db'
strings dist/linux-unpacked/resources/app.asar | grep -iE 'ssdev|devid|devpassword' | head
```

Expect: no `GameManagerConfig`, no `.db`, no `ss_dev.json`, and no plaintext ScreenScraper creds
(only the scrambled `ss_dev.dat`).

### 3.7 Decision needed: internationalization

Clarity and Couch Mode ship English + pt_BR. EmuLatte has **no i18n layer at all** (`main.js:1378` `LANG_PREF`
is only ScreenScraper's metadata-language preference, unrelated). Options: ship 1.0 English-only and
say so, or port Clarity's i18n system. **Ask Jose — do not decide this alone.** English-only is the
sensible 1.0 scope; the ecosystem memory has `project_i18n.md` if he wants it done.

### 3.8 Remaining audit passes to run yourself

Findings above came from targeted probes. Still to do:

1. `/code-review` at **high** effort on the full diff since the last release tag (Clarity's high review
   returned 6 real findings on the Save Manager alone, all worth fixing).
2. Every modal/overlay: confirm each one closes on **all** exit paths. Clarity's audit found a whole class
   of "config screen stays visible after transition" bugs — fixed by making all 4 transitions hide it.
3. Couch Mode input routing: whatever EmuLatte's equivalent of an overlay-state allowlist is, confirm
   a newly added menu is registered in it. In Couch Mode a missing state looks like a **total app freeze**,
   not a broken menu — it cost a whole bug on the font picker. There is no `gameState` symbol in
   `couch.js`, so the model differs; find it before assuming it's fine.
4. Dead code sweep — Clarity removed an unreachable pre-merge `manual.html` and a dead input handler.
5. First-run experience on a **clean** `GameManagerConfig/` — the single most under-tested path.
   Rename your config dir aside and launch cold.

---

## 4. Release checklist

Ordered. Each phase should be its own commit on `experimental`.

### Phase 1 — Audit and fix
- [ ] Fix §3.1 README ecosystem claim (also check `index.html`/`couch.js` for any in-app copy repeating it)
- [ ] Fix §3.2 system count (56)
- [ ] Add §3.3 `get-app-version` + About dialog
- [ ] Resolve §3.4 theme drift (ask about 93-theme parity)
- [ ] Run §3.6 artifact verification
- [ ] Decide §3.7 i18n scope
- [ ] Run §3.8 passes 1–5
- [ ] `npm run dist`, smoke-test the AppImage

### Phase 2 — In-app user manual
EmuLatte has **no user manual**. Clarity's is 22 sections in a themed in-app viewer and is the model.
Write one covering, at minimum:

1. What EmuLatte is · 2. Install & first run · 3. Adding systems · 4. Importing ROMs ·
5. The library & gallery views · 6. The game page · 7. Editing game details · 8. Art scraping
(SGDB / ScreenScraper / TGDB / IGDB — which source gives which asset) · 9. Metadata scraping ·
10. Clarity credential import · 11. Emulator Scanner · 12. RetroArch cores & per-game overrides ·
13. Custom emulator commands · 14. BIOS handling (`assets/bios_db.json`) · 15. Playlists ·
16. RetroAchievements setup · 17. Trailers · 18. Game manual PDFs (`manual.html`) ·
19. **Couch Mode** — display types, navigation, save states, screensaver, sound, shaders ·
20. Themes & fonts · 21. **Exporting games to Clarity** (get §3.1 right here) ·
22. Data layout, backup, and where everything lives.

Match the app's own theme tokens so it inherits the active theme. Keep Jose's voice: direct,
unfussy, faintly dry. No marketing filler.

### Phase 3 — README rewrite
Keep the existing `◈` visual style — it's good and it's his. Update: Couch Mode section (currently
missing), the corrected ecosystem story, 56 systems, a 1.0 badge, and a screenshots section linking
to the website. No emojis.

### Phase 4 — Website
See §5 for the full spec. Gate the publish on his say-so.

### Phase 5 — GitHub release
- [ ] ff-merge `experimental` → `main`, push both **(ask first)**
- [ ] Tag `v1.0.0` and push the tag
- [ ] Write `RELEASE_NOTES_v1.0.0.md` (Clarity has one at
      `/home/jose/Documents/DEVELOPMENT/CLAUDE/RELEASE_NOTES_v1.0.0.md` — mirror its structure)
- [ ] Create the GitHub release, attach `EmuLatte.AppImage` (213 MB — under GitHub's 2 GB limit, fine)
- [ ] Update the repo's About blurb, topics, and website field
- [ ] ⚠️ **`gh` CLI is NOT installed on this machine.** Either install it, or Jose does the release
      through the GitHub web UI. Don't assume `gh` exists — I checked.

> **Note on Clarity's tag:** as of 2026-07-20 Clarity itself is merged and pushed but the `v1.0.0`
> tag was still not created. If Jose wants the ecosystem tagged consistently, mention it.

---

## 5. Website spec

### 5.1 First decision: where it lives

**Recommended — add `emulatte.html` to the existing `ClarityWebSite` repo.**
`/home/jose/Documents/DEVELOPMENT/CLAUDE/CN_website/` → `github.com/shampoo-is-a-lie/ClarityWebSite`
→ published at `https://shampoo-is-a-lie.github.io/ClarityWebSite/`.
One repo, one Pages deploy, shared `assets/`, and Clarity's landing page **already links to EmuLatte**
(`index.html:358`) — that link just changes from the GitHub repo to `emulatte.html`. Cheapest to
maintain and keeps the ecosystem visually welded together.

**Alternative — a standalone `EmuLatteWebSite` repo** with its own Pages URL. Justifiable because
EmuLatte is deliberately framed as "a fully standalone app in its own right", but it doubles the
maintenance and splits the audience.

**Ask Jose which.** Don't just pick.

### 5.2 The visual language — copy it exactly

Read `/home/jose/Documents/DEVELOPMENT/CLAUDE/CN_website/index.html` in full before writing a line.
It is the reference implementation. The essentials:

**Palette (CSS custom properties, use verbatim):**
```css
--amber:#ffb000; --amber-dim:#9a6a00;
--chalk:#f4efe6; --chalk-dim:#bcae97;
--board:#1d2420; --board2:#161b18;
--couch:#D4A373; --kofi:#FF5E5B; --pix:#32BCAD;
```

**Type:** `Caveat` (handwritten — headings, captions, feature copy), `Raleway` 400/700/900
(wordmarks, labels — uppercase with wide letter-spacing), `VT323` (monospace — the boot terminal,
tags, counters). Loaded from Google Fonts on the site; that's fine here.

**The concept:** a chalkboard café menu. Dashed 2px `rgba(244,239,230,.18)` rules between sections,
handwritten Caveat headings in `--couch`, uppercase Raleway-900 labels, a faint chalk-dust grain
overlay, everything centred in a 780px column on a dark board-green ground.

**The boot terminal:** a fake amber CRT boot sequence with scanlines and flicker covers the page,
types a few `[ ok ]` lines, then fades to the chalkboard. Click or any key skips; a `sessionStorage`
flag (`cn_booted`) skips it for repeat visits in the same session. Reuse the mechanism with
EmuLatte's own boot lines — something like mounting ROM libraries, scanning cores, waking
RetroArch — ending on `▓▓ EMULATTE 1.0 ▓▓`. Use a **different sessionStorage key** so the two pages
don't suppress each other's intros.

**Tone:** lowercase handwritten headings ("what's in the cup", "a look inside", "also on the menu"),
dry one-liners, no marketing voice. EmuLatte's established quip is **"I use RetroArch BTW"** — it is
already on Clarity's site as EmuLatte's card and should headline the EmuLatte page.

### 5.3 Content outline

- Wordmark + kicker + "I use RetroArch BTW"
- Download button → `https://github.com/shampoo-is-a-lie/EmuLatte/releases/latest`, meta line
  "version 1.0 · single AppImage · GPL-3.0"
- A three-line menu block mirroring Clarity's Manager/Installer/Couch Mode list — e.g. Library / Scrapers /
  Couch Mode
- **"what's in the cup"** feature board (7-ish items): 56 systems with core defaults · emulator
  scanner · four scraping sources in one picker · RetroAchievements · trailers via yt-dlp ·
  **Couch Mode** · local-only data
- **"a look inside"** screenshot gallery — §5.4
- **"also on the menu"** — a card pointing back at Clarity (and the Clock), mirroring how Clarity's
  page points here. **Use the export wording from §3.1.**
- Support block: reuse Clarity's Ko-fi button, PIX modal (QR + key `b734a9e2-e479-42f9-abd6-c88d1b8b880e`)
  and GitHub button verbatim
- Footer: "Built by J.R.A.", contact `shampooisalie@gmail.com`, GPL-3.0-or-later

### 5.4 Screenshot gallery — the pipeline that already works

Built and shipped on Clarity's site (`ClarityWebSite/index.html`, commits `f6aa917`, `97ac086`, `ed05e1e`).
Copy the pattern; it's proven.

**Capture** to a folder, then convert — 33 MB of PNGs became **1.6 MB** of WebP:

```bash
# full size for the lightbox
magick "$f" -resize 1600x -strip -quality 82 -define webp:method=6 "$OUT/<name>.webp"
# thumbnail for the grid
magick "$f" -resize 640x  -strip -quality 78 -define webp:method=6 "$OUT/<name>-thumb.webp"
```

`cwebp` is not installed; ImageMagick (`magick`) is, and has WebP support. Name files semantically
(`couch-crt.webp`, not `07.webp`).

**Markup pattern:** `.shots` breaks out of the 780px column with
`width:min(1120px,92vw);position:relative;left:50%;transform:translateX(-50%)`. Inside, one
`.shots-group` per face with a VT323 `.glabel` header, then
`.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}`. Each item is
a `<figure class="shot" data-full="…">` with a lazy-loaded thumb and a Caveat `<figcaption>`.
Clicking opens a lightbox with prev/next, arrow keys, Escape and an `n / N` counter.

**Four traps I hit — don't repeat them:**

1. **`height:auto` is mandatory.** Setting `width`/`height` attributes for layout stability plus
   `width:100%` in CSS, *without* `height:auto`, makes the height attribute win and every image comes
   out vertically stretched. It is not obvious in a small thumbnail.
2. **A group with one image stretches to the full 1120px.** `auto-fit` + `1fr` does that. Add a
   `.grid.solo{max-width:540px}` modifier for single-shot groups.
3. **Set the width/height attributes from the real file**, not by guessing. Cheap script:
   `magick identify -format "%w %h" file.webp`.
4. **Replacing an image without renaming it does not reach anyone.** Browsers and the Pages CDN keep
   serving the cached bytes at that URL. Either rename the file or append `?v=2`. This bit us
   directly — the swap looked broken and wasn't.

**Verify by rendering, not by eye.** There's no `chromium` binary, but Chrome is a Flatpak:

```bash
flatpak run --filesystem=/tmp com.google.Chrome --headless --disable-gpu --no-sandbox \
  --hide-scrollbars --window-size=1280,4200 --screenshot=/tmp/out.png "file:///path/index.html"
```

The boot terminal covers the page and `--virtual-time-budget` does not reliably let it finish, so
render a **temp copy** with the boot div hidden and `#chalk` opacity forced to 1. Check 1280px and
420px widths. This is how both layout bugs above were caught.

### 5.5 Publishing
GitHub Pages serves from `main`. Push, wait under a minute, hard-reload. **Gate the push on Jose.**
Once live, update Clarity's `index.html:358` link and the EmuLatte repo's website field.

---

## 6. Reference material

| What | Where |
|---|---|
| Clarity website (the visual reference) | `/home/jose/Documents/DEVELOPMENT/CLAUDE/CN_website/index.html` |
| Clarity release notes (structure to mirror) | `/home/jose/Documents/DEVELOPMENT/CLAUDE/RELEASE_NOTES_v1.0.0.md` |
| The Clarity monorepo (manual, About, themes, i18n to copy from) | `/home/jose/Documents/DEVELOPMENT/CLAUDE/Clarity/` |
| EmuLatte architecture notes (DB schema, IPC handlers, hard parts) | Clarity memory `project_emulatte_plan.md` |
| EmuLatte concept + ecosystem rules | Clarity memory `project_emulatte_concept.md` |
| Couch Mode original plan | `docs/couch-mode-plan.md` (this repo) |

Memory lives at
`/home/jose/.claude/projects/-var-home-jose-Documents-DEVELOPMENT-CLAUDE-Clarity/memory/`.
A session started in the EmuLatte folder gets a **different** memory directory and will not see it —
read those files directly if you need them.

---

## 7. Definition of done

- [ ] Audit findings §3.1–§3.4 fixed; §3.6 artifact verified clean; §3.8 passes run
- [ ] About dialog shows 1.0.0
- [ ] In-app user manual covering all features including Couch Mode and Clarity export
- [ ] README rewritten, accurate, Couch Mode covered, no emojis
- [ ] Website live, same visual language, screenshot gallery working at desktop and mobile widths
- [ ] Clarity's site links to the EmuLatte page
- [ ] `experimental` ff-merged to `main`, both pushed, `v1.0.0` tagged
- [ ] GitHub release published with the AppImage attached
- [ ] AppImage smoke-tested from a clean config directory

---

*Written by the Clarity 1.0 session. If something here contradicts what you find in the code, the code
wins — say so rather than working around it.*
