A major release on top of [1.2.0](https://github.com/FromChaosComesClarity/EmuLatte/releases/tag/v1.2.0), built around one change: **your ROM folder is the library.**

Until now EmuLatte was a database you fed by hand. You added a system, pointed it at a folder, ran a scan, and did it again every time something changed. That is not how ES-DE, Batocera or RetroBat work, and it is not how anyone thinks about a ROM collection. You have folders. The folders are the library.

**The version number is a 2 because of where things live.** EmuLatte's data folder is now `Emulatte_Stuff/` beside the AppImage, and it no longer shares anything with Clarity. If you are upgrading, see the last section: your old library is not picked up on its own, deliberately.

## The library is the ROMS folder

The first launch creates `Emulatte_Stuff/` next to the AppImage with `ROMS/` inside it, holding one folder for **every** system EmuLatte knows, all 56, each with a `systeminfo.txt` saying what belongs in it. Drop ROMs in. They are games the next time EmuLatte opens.

```
Emulatte_Stuff/
├── ROMS/
│   ├── snes/        drop .sfc here
│   ├── megadrive/   also reads genesis/, md/
│   ├── psx/         .cue sets grouped into one game
│   └── … 53 more
├── BIOS/
└── emulatte.db, images/, videos/, manuals/
```

**You no longer add systems.** All 56 exist from the first launch with their cores and scraper identifiers already set. Browsing by system lists only the ones that have games in them, so an empty library is not 56 empty shelves.

**Folders are named the way ES-DE names them**, and each system also answers to the names Batocera, RetroBat and RetroPie use. A collection already laid out by one of those is read as it stands. If it lives on an external drive, point EmuLatte at it rather than moving it.

Every launch makes the library match the disk: new files become games, rows whose file you deleted go with them. **Rescan Library** does it on demand, from the desktop rail, from Settings, or from the Couch Mode menu, and shows what it is doing while it does it.

### Moving a collection does not duplicate it

A file already in the library under the same system and filename is the **same game in a new place**. Its row is re-pointed, not duplicated, so the artwork, the description, the achievements and the play history move with it. An entry stranded on an unplugged drive comes back to life the moment a copy of its ROM appears in a system folder.

### Removal is careful

A folder that is not there, an unplugged drive say, is skipped rather than treated as empty, and a game kept outside your ROMS folder is never removed automatically.

## Ready to play, without being asked

**Cores are found where your package manager puts them.** EmuLatte only ever looked in `~/.config/retroarch/cores`. On Arch and Omarchy cores come from pacman and live in `/usr/lib/libretro`, so a machine with 42 working cores installed reported zero and could not launch a single game. It now searches the configured directory, the per-user folder, the Flatpak sandbox and the system-wide folders.

**It picks a video driver instead of inheriting a slow one.** RetroArch's default is the legacy `gl` driver. Measured on this hardware, NES fullscreen at 3440x1440 with a CRT shader: `gl` managed 29 fps against the 60 it should, half speed, while vulkan reached 58. `gl` cannot load slang shaders either, which is the only kind libretro still ships, so a chosen shader quietly did nothing while costing half the frame rate.

**Games open centred and full screen**, keeping their own shape, whatever the monitor's resolution, ratio or orientation.

**Shaders are EmuLatte's own**, downloaded into its own folder rather than borrowed from a root-owned system directory, and only the shader you picked is applied. RetroArch's habit of auto-loading presets nobody chose is off.

**When a core really is missing**, EmuLatte says which one and offers to fetch it, instead of a window that flashes and vanishes. Settings ▸ Library leads with a **Ready to play** card: which systems hold games, which cannot play, and one button to install the lot.

## BIOS

Drop BIOS and firmware into `BIOS/`, flat or in sub-folders, in whatever shape they arrived. Every launch files each one it recognises under the exact name a core expects, matched by **checksum**, so a correct file with the wrong name still lands in the right place. That folder is EmuLatte's RetroArch system directory: what is in it is what the cores read.

## Resume or start fresh

A game with a save behind it asks before it starts, on both faces: start fresh, or pick a save, each shown with the screenshot RetroArch wrote beside it.

## Your library on a drive

**Settings ▸ Library ▸ Where the library is kept.** Move the database, the artwork, the trailers and the manuals onto an external drive, and another computer can use that same library by pointing at the same folder instead of scraping everything again. Your ROMS and BIOS folders stay where they are. A drive that is not plugged in never quietly becomes a different library: it says so, in red.

## Around the app

- **Ctrl+Q** quits EmuLatte and closes any emulator it started. It asks first if a game, a scrape or a download is still going. Closing the window instead still leaves a running game alone, on purpose.
- **L3 + R3** opens RetroArch's own menu mid-game.
- **Add to Application Menu**, in Settings and on the first run, puts EmuLatte and Couch Mode in your launcher, with their icon.
- Settings opens on a **landing page**, and the first run is a short list of what to do rather than a wall.
- Couch Mode returns to full screen after a game, instead of coming back tiled.

## Scraper fixes

**Test Credentials now saves.** It used to validate your ScreenScraper account, say "Connected", and store nothing, so scraping failed with an account that looked configured. Worse, **Save wrote every credential field including blank ones**, so reopening Settings by a route that did not fill the form and pressing Save erased every API key in the app. Both fixed, and a failed scrape now names the reason instead of counting failures.

## Upgrading from 1.2.0

Drop the new AppImage over the old one. The first launch creates `Emulatte_Stuff/` and starts empty: **your old library in `GameManagerConfig/EmuLatte/` is left exactly where it is and is not adopted automatically.**

That is deliberate. An earlier build did adopt it, and it was right once and wrong ever after: putting the AppImage beside an existing Clarity install on a second machine silently pulled that machine's library and artwork in, and the only way to start clean was to move the binary somewhere else. `Emulatte_Stuff` is now the one place EmuLatte reads and writes.

To bring your old library forward, pick one:

- **Point at it.** Settings ▸ Library ▸ *Use A Library On A Drive*, and choose your old `GameManagerConfig/EmuLatte` folder. EmuLatte uses it where it is, artwork and all.
- **Move it.** Copy everything inside `GameManagerConfig/EmuLatte/` into `Emulatte_Stuff/`. Artwork paths re-point themselves on the next start.
- **Restore a backup.** Settings ▸ Data ▸ Restore from Backup still understands zips written by 1.2.0.

Nothing is deleted either way, and your ROMs are never touched.
