A ROM library manager for people who alphabetise things. **EmuLatte 1.0** keeps your emulation collection in order across 56 systems — importing, scraping, launching — and then hands you a second, fullscreen, gamepad-first face for the TV when you're done managing and want to actually play something.

It's the emulation pillar of the Cafe Neurotico ecosystem, and a completely standalone app. Nothing here needs the rest of the suite.

*"I use RetroArch BTW"*

## Install

1. Download `EmuLatte.AppImage` below
2. `chmod +x EmuLatte.AppImage`
3. Run it

On first launch it creates a `GameManagerConfig` folder **next to the AppImage** — that folder is your entire library. Put the AppImage somewhere permanent before you start building one. If you already run Cafe Neurotico, drop EmuLatte alongside it so both share the same folder; that's what makes credential import and export work with no configuration.

```sh
./EmuLatte.AppImage            # the desktop face — where the managing happens
./EmuLatte.AppImage --couch    # Couch Mode — fullscreen, gamepad-first
```

Both faces read and write the same database.

## What's in it

**56 systems, with opinions.** Every preset arrives with a RetroArch core already chosen and the platform identifiers the scrapers need, so you are not starting from zero. Point it at a folder and it sweeps for ROMs. Your files are **never moved, copied or renamed** — EmuLatte stores paths and leaves your collection where you put it. Removing a game removes a database row, never a ROM.

**It finds your emulators for you.** The emulator scanner sweeps the machine for what's already installed — RetroArch native, Flatpak, standalone cores — and maps them to systems without you typing a single launch command. And RetroArch is the default, not a requirement: any system or individual game can use a fully custom command instead.

**Its own RetroArch, untouched by yours.** EmuLatte drives a config of its own. Your host `retroarch.cfg` is never read and never written, so nothing here can disturb a setup you already rely on. Full settings tree inside the app, or open RetroArch's own menu running on EmuLatte's config and have the changes save back. **Express** rewrites the settings that matter in plain language, with a ★ on the recommended pick.

**Five scraping sources, one picker.** ScreenScraper, SteamGridDB, TheGamesDB, IGDB and MobyGames — take metadata from one and artwork from another, per game. Covers, hero art, logos and screenshots land on your disk and stay there. Every source has a Test button, so you find out a key is wrong before a scrape rather than during one.

**Achievements, trailers, and the actual manual.** RetroAchievements progress per game, with earned/unearned filtering. Trailers searched and downloaded with a bundled yt-dlp and ffmpeg, played in-app. And the **scanned booklet that came in the box**, pulled from ScreenScraper and opened in its own window.

**The awkward parts, handled.** *Repair Disc References* fixes `.m3u` and `.cue` files whose internal paths point somewhere that no longer exists — the thing that quietly breaks half a multi-disc collection the moment you move or re-rip it. BIOS handling knows what each platform requires, tells you what's missing, and files what you already own into the right folder. Per-game core overrides for the one game on a platform that needs something different.

**Couch Mode.** Fullscreen, gamepad-first, play-only — it reads the same library and deliberately cannot edit anything. Three real layouts, not one layout scaled down: Horizontal, Vertical, and a genuine 640×480 **CRT mode**. Full gamepad navigation with keyboard equivalents throughout, a save-state manager, a screenshot screensaver, ambient music and SFX, a now-playing screen, RetroArch Simple Setup with shaders, and a Refresh that rescans for new games without leaving the sofa. The **Return Combo** is a button combination held during a game to come back — match it to RetroArch's own Close combo and one press does both.

**92 themes across 10 families.** Both faces carry all of them — Catppuccin, Gruvbox, Nord, Dracula, Game Boy, Pip-Boy, BrewBalance, and twenty retro operating systems (MS-DOS, Commodore 64, Amiga Workbench, BeOS, NeXTSTEP, Windows 3.1/95/XP, ZX Spectrum, Teletext, amber and green phosphor…), each with **its own era typeface**. All fonts are bundled; nothing is fetched from the network.

**Local-only. Yours.** Everything lives in one folder next to the AppImage. No account, no telemetry, no cloud. Back up EmuLatte alone or the whole Cafe Neurotico suite in one archive.

## Working with Cafe Neurotico

Games reach Cafe Neurotico by **exporting them from inside EmuLatte** — the `ADD TO CAFENEUROTICO` button on a game page. Cafe Neurotico does not read EmuLatte's database and has no "show emulation" toggle. An exported game becomes an ordinary row in CN's library with its **Store** set to `Emulation`, carrying a copy of its art and EmuLatte's own launch command, so it launches from Cafe Neurotico or CREMA exactly as it does here.

Export is one-directional and per-game; re-exporting updates in place. **Management of the ROM collection always stays in EmuLatte.**

## Requirements

- A 64-bit Linux desktop, and FUSE for the AppImage
- RetroArch (native or Flatpak) for the default launch path — auto-detected
- ScreenScraper, SteamGridDB, TheGamesDB, IGDB and MobyGames each need their own free account or key, and RetroAchievements needs a free account for achievements

Everything else works out of the box. BIOS files are never supplied or downloaded — EmuLatte only tells you what's missing and files what you already own.

## Documentation

The full manual ships **inside the app** — 22 searchable sections reachable from the About dialog or Settings → General, covering every feature including the complete Couch Mode control reference, BIOS handling, backups and the Cafe Neurotico export.

## Also on the menu

[**Cafe Neurotico**](https://github.com/shampoo-is-a-lie/CafeNeurotico) — the rest of the library: Steam, GOG, Epic, Flatpak, itch.io and PICO-8, in one binary with three faces. EmuLatte works perfectly without it.

[**CafeNeuroticoClock**](https://github.com/shampoo-is-a-lie/CafeNeuroticoClock) — a desk clock that runs a slideshow of your library's art.

## Notes

- Linux only. There are no Windows or macOS builds.
- English only in this release.
- On Wayland, applications cannot choose which display they open on. Leave Couch Mode's **Target Screen** on *Current screen*, drag EmuLatte onto your TV, then go fullscreen. The setting works on X11.
- The AppImage is large (~200 MB) because it bundles yt-dlp, ffmpeg and ffprobe for trailer support. Building from source requires placing those in `assets/bin/linux/` yourself; they are not tracked in git.
