<div align="center">

<img src="assets/icons/EmuLatte.svg" width="128" alt="EmuLatte"/>

<br>

# E M U L A T T E

**ROM library manager for the obsessively organized.**

*56 systems. Multi-source art. RetroAchievements. Trailers. All your emulation, one place.*

<br>

[![Version 1.0](https://img.shields.io/badge/Version-1.0-D4A373?style=flat-square&labelColor=2C1E16)](https://github.com/shampoo-is-a-lie/EmuLatte/releases/latest)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-8B5A2B?style=flat-square&labelColor=2C1E16)](LICENSE)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-D4A373?style=flat-square&labelColor=2C1E16)](https://github.com/shampoo-is-a-lie)
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron%2041-A47148?style=flat-square&labelColor=2C1E16)](https://electronjs.org)
[![Part of CN Ecosystem](https://img.shields.io/badge/Part%20of-Cafe%20Neurotico-D4A373?style=flat-square&labelColor=432818)](https://github.com/shampoo-is-a-lie)

</div>

<br>

---

<br>

## ◈ &nbsp; What It Is

EmuLatte is the emulation side of the [Cafe Neurotico Ecosystem](https://github.com/shampoo-is-a-lie). It manages your ROM libraries across every system you care about — scraping art and metadata from multiple sources, tracking achievements, downloading trailers, and launching games exactly the way you configured them.

It keeps everything emulation-related in one self-contained app so neither it nor CNGM gets in the other's way. It is also a fully standalone app in its own right — nothing here requires the rest of the suite.

Two faces, one binary: a **desktop face** for managing the collection, and **Couch Mode** — a fullscreen, gamepad-first, play-only face for a TV or a real CRT.

A full **user manual** ships inside the app: 22 sections covering every feature. Open it from the About dialog or **Settings → General**.

<br>

---

<br>

## ◈ &nbsp; ROM Library

```
┌─────────────────────────────────────────────────────────────┐
│  56 bundled system presets — SNES · Genesis · PS1 · N64     │
│  GBA · NDS · PSP · Dreamcast · Saturn · PC Engine and more  │
│                                                             │
│  Each preset ships with opinionated RetroArch core          │
│  defaults so you're not starting from zero.                 │
│                                                             │
│  Launch via RetroArch (native or Flatpak, auto-detected)    │
│  or any fully custom emulator command you define.           │
│  Per-game core override when the system default isn't right.│
└─────────────────────────────────────────────────────────────┘
```

An **Emulator Scanner** detects what's already installed on your system — RetroArch, standalone cores, Flatpak variants — and maps them automatically.

**Repair Disc References** fixes `.m3u` and `.cue` files whose internal paths point somewhere that no longer exists — the thing that silently breaks half a multi-disc collection the moment you move or re-rip it. Run it per game or across a whole system.

**BIOS handling** knows what each platform requires and tells you what's missing. Add a file you own, or point it at a folder and let it pick out the ones it recognises — they get filed into RetroArch's `system/` folder where the cores expect them. EmuLatte never supplies or downloads BIOS files.

> EmuLatte runs RetroArch on **its own config**. Your host `retroarch.cfg` is never read and never written, so nothing here can disturb a setup you already rely on.

<br>

---

<br>

## ◈ &nbsp; Game Page

Every game has a full-screen detail page:

- **Hero image** with Ken Burns slideshow if multiple screenshots exist
- **Cover art** sidebar with release year, genre, developer, players
- **Description** pulled from scrapers
- **RetroAchievements panel** — progress ring, unlock count, quick access to the full achievement list
- **Save states** — browse, label, launch straight into and delete RetroArch states
- **Game manual** — fetches the scanned booklet from ScreenScraper and opens it in its own window
- **Per-game RetroArch override** — different core or settings for the one game that needs it
- **▶ PLAY** button, **WATCH TRAILER**, **EDIT DETAILS**, **ADD TO CAFENEUROTICO**

<br>

---

<br>

## ◈ &nbsp; Art & Metadata Scraping

Five sources, one picker. Hit **SCRAPE** on any asset type and choose where to pull from:

| Source | Art | Metadata | Needs |
|:---|:---:|:---:|:---|
| **ScreenScraper.fr** | covers · heroes · screenshots | ✓ | Free account |
| **SteamGridDB** | covers · heroes · logos | — | Free API key |
| **TheGamesDB** | covers · heroes · screenshots | ✓ | Free API key |
| **IGDB** | covers · screenshots | ✓ | Client ID + secret |
| **MobyGames** | boxart · screenshots | ✓ | Free API key (approval) |

ScreenScraper is the best all-round source for console ROMs and the only one that also serves **scanned game manuals**. SteamGridDB is artwork-only but has the best-looking modern art. MobyGames and TheGamesDB have excellent retro coverage.

Scraped assets go directly into the game's record. You can also pick a **local file** for any asset type, or delete individual images with the ✕ button. Every source has a **Test** button so you find out a key is wrong before starting a scrape, not during one.

> **CNGM credential import** — if you already have SGDB or IGDB keys configured in CNGM, EmuLatte can import them so you don't enter them twice.

<br>

---

<br>

## ◈ &nbsp; RetroAchievements

Connect your RetroAchievements account and EmuLatte tracks your progress per game:

- Progress ring on the game page showing unlock percentage
- Full achievement list modal — filter by **All**, **Unlocked**, or **Locked**
- Achievements cached locally; refresh on demand
- MD5 ROM verification to match your file to the correct game entry

<br>

---

<br>

## ◈ &nbsp; Trailers

Search YouTube for a game's trailer directly inside EmuLatte. Pick a result, download it, and watch it in-app — no browser needed.

- Powered by **yt-dlp** + **ffmpeg** (bundled in the AppImage)
- Downloaded trailers cached locally — the **▶ WATCH TRAILER** button appears on the game page once one is saved
- Delete cached trailers individually from the edit modal

<br>

---

<br>

## ◈ &nbsp; Playlists

Create named collections and assign any game to as many playlists as you want. Filter the library by playlist from the sidebar — and from Couch Mode, which is where they really earn their keep.

<br>

---

<br>

## ◈ &nbsp; Couch Mode

```
┌─────────────────────────────────────────────────────────────┐
│  A fullscreen, gamepad-first, play-only face for the TV.    │
│  Same library, same database — it just can't edit anything. │
│                                                             │
│  Horizontal  ·  Vertical  ·  CRT Mode (640x480)             │
│  Three real layouts, not one layout scaled down.            │
└─────────────────────────────────────────────────────────────┘
```

Enter it with **▶ GO FULLSCREEN**, or set it to launch straight into Couch Mode on start.

- **Full gamepad navigation** — A/B/X/Y, shoulders for group jumps, triggers to jump by letter, Start for the menu. Every action has a keyboard equivalent.
- **Return Combo** — a button combination held *during a game* to come back. Six variants, including hold-for-2-seconds ones that won't fire by accident. Match it to RetroArch's own Close combo and one press does both.
- **Save-state manager** — browse, label, launch into and delete states without leaving the sofa
- **Screensaver** — a screenshot slideshow after 1/3/5/10 minutes idle
- **Ambient sound** — background music and interface SFX, with volume
- **Now-playing screen** — shows what launched, and what you're returning from
- **RetroArch Simple Setup** — the Express settings rebuilt for a gamepad, shaders included, synced with the desktop face
- **Refresh** — rescans your ROM folders for new games from within Couch Mode
- **Display density** for low-res TVs, on-screen button labels in Xbox / PlayStation / Nintendo lettering, and its own theme (or sync with the desktop's)

> **On Wayland**, apps can't choose their output. Leave **Target Screen** on *Current screen*, drag EmuLatte onto your TV, then go fullscreen. Target Screen works on X11, Windows and macOS.

<br>

---

<br>

## ◈ &nbsp; Themes

**92 themes across 10 categories**, and both faces carry all of them — from *Gaming Legends* and *Linux Ricing* to **Systems**: twenty retro-OS palettes reproducing MS-DOS, Windows 3.1/95/XP, Classic MacOS, Amiga Workbench, NeXTSTEP, BeOS, OS/2 Warp, RISC OS, Solaris CDE, ZX Spectrum, Commodore 64, GEOS, Atari ST, IBM 3270, Teletext, and amber and green CRT phosphor.

Each Systems theme carries **its own era typeface** — the interface actually changes font to match the OS it's imitating. All fonts are bundled in the AppImage; nothing is fetched from the network.

<br>

---

<br>

## ◈ &nbsp; Ecosystem Integration

```
  CNGM           Central hub — PC game library, store sync, launches all companion apps
    │
    ├──▸  CREMA       Fullscreen / gamepad counterpart for CNGM + EmuLatte
    │
    ├──▸  GRINDER     GOG & Epic install engine — feeds games back into CNGM
    │
    ├──▸  EmuLatte ◈  ROM library manager — exports games into CNGM's library
    │
    └──▸  CN Clock    Floating desktop clock — shows art from CNGM + EmuLatte
```

Games reach Cafe Neurotico by **exporting them from inside EmuLatte** — the `ADD TO CAFENEUROTICO` button on the game page. CNGM does not read EmuLatte's database and has no "show emulation" toggle. An exported game becomes an ordinary row in CNGM's `games.db` with its **Store** set to `Emulation`, carrying a copy of its art and EmuLatte's own launch command, so it launches from CNGM or CREMA exactly as it does here.

Management of the ROM collection always stays in EmuLatte. Export is one-directional and re-exporting an already-exported game updates it in place.

All data lives in `GameManagerConfig/EmuLatte/` — backs up with everything else.

<br>

---

<br>

## ◈ &nbsp; Screenshots

A full gallery of both faces — desktop, Couch Mode, CRT layout, themes — lives on the website:

**[shampoo-is-a-lie.github.io/CafeNeuroticoWebSite/emulatte.html](https://shampoo-is-a-lie.github.io/CafeNeuroticoWebSite/emulatte.html)**

<br>

---

<br>

## ◈ &nbsp; Installation

```bash
# Download EmuLatte.AppImage from the Releases page, then:
chmod +x EmuLatte.AppImage
./EmuLatte.AppImage
```

Place it alongside your CNGM installation (e.g. `~/Games/CNGM/`) so the shared `GameManagerConfig/` directory is found automatically.

EmuLatte stores its data in a `GameManagerConfig/` folder **next to the AppImage**, so put the AppImage somewhere permanent before building a library.

> **Language:** EmuLatte 1.0 is English-only. (Cafe Neurotico and CREMA also ship pt_BR; EmuLatte does not yet.)

<br>

### Building from Source

```bash
git clone https://github.com/shampoo-is-a-lie/EmuLatte
cd EmuLatte
npm install
npm run dist
```

> **Note:** The AppImage bundles yt-dlp, ffmpeg, and ffprobe for trailer support. These binaries are not tracked in git — place them in `assets/bin/linux/` before building if you want trailer functionality in dev mode.

<br>

---

<br>

<div align="center">

*Built by* **Shampoo is a Lie** &nbsp;·&nbsp; GPL-3.0 &nbsp;·&nbsp; *Made for Linux desktops that take emulation seriously*

```
◈ ─────────────────────────────────────── ◈
```

</div>
