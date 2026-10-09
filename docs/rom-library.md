# The library is the ROMS folder

EmuLatte used to be a database you fed by hand: add a system, point it at a folder, scan.
It is now a folder you fill, read on every launch: the model ES-DE, Batocera and RetroBat use.

## Where everything lives

`Emulatte_Stuff/`, beside the binary. Not inside the sibling app's `GameManagerConfig/` any
more; the two apps share a parent folder and nothing else.

```
Emulatte_Stuff/
├── ROMS/                 one folder per system, 56 of them
│   ├── megadrive/        also read: genesis/, md/, segagenesis/, …
│   ├── psx/
│   └── …                 each with a systeminfo.txt
├── BIOS/                 EmuLatte's RetroArch system_directory
├── emulatte.db
├── images/ videos/ manuals/ playlists/ retroarch/ retroarch_overrides/
```

`roms_root` and `bios_root` in settings override the two folders, so a collection that already
lives on an external drive is pointed at rather than moved (Settings ▸ Library).

## Folder names

`assets/systems.json` carries `folder` (ES-DE's name) and `folder_aliases` (the names Batocera,
RetroBat and RetroPie use) for all 56 systems. **Only the primary name is created**; an alias is
read when it happens to exist. No name is claimed by two systems, and `scripts/test-rom-library.js`
asserts that, and `systems.folder` is editable per system.

## Seeding

Every preset exists as a system from the first launch. `seedSystems()` runs on every launch and
inserts what is missing, matching on `short_name`, and never overwrites a row the user has
edited. A deleted system is recorded in the `systems_dismissed` setting so seeding does not drag
it back; **Restore Default Systems** clears that list.

Browsing by system lists only systems with games in them, so 56 systems is not 56 empty shelves.
The full set is in Settings ▸ Library and in the Systems manager.

## The scan

`library.scan()` runs on every launch (just after `createWindow`, so a big collection never
holds the window back) and on demand from **Rescan Library**, in the desktop rail, Settings ▸
Library, or the Couch Mode menu under LIBRARY.

Two passes:

1. **The ROMS root.** Each system's folder plus any alias folder that exists, scanned with that
   system's extensions. New files become games; a game whose file has gone is dropped.
2. **Outside the root.** The folders existing games already sit in, for a collection kept
   elsewhere. New siblings are picked up. **Nothing here is ever removed.**

### Why removal is safe

Pruning is confined to folders the scan actually read. An unmounted drive reads as an absent
folder, and an absent folder is skipped, never treated as empty. A game whose `rom_path` is an
EmuLatte-generated `.m3u` goes only when none of its discs are left.

### The same game in a new place

Path-equality dedupe cannot see that `/mnt/roms/nes/castlevania (usa).nes` and
`ROMS/nes/castlevania (usa).nes` are one game, so copying a collection into the ROMS folder
would double the library. A found file is therefore also matched on **its own system plus its
filename**, and a row that already exists is **re-pointed** rather than a bare second row being
inserted. The art, description, achievements and play history stay with it.

Which row gets adopted: the one whose own file has gone first, because re-pointing that one is
what brings a game back to life, then whichever holds more metadata. A row already inside the
ROMS folder is left where it is, and a second copy found outside the root is skipped.

`merged` cleans up duplicates an earlier scan already created: same system, same filename, one
row carrying art and history and one bare. The richer row survives and takes over the file that
actually exists; the bare one goes. **Two rows that both hold something are never touched** (a
playlist link counts as holding something), because that judgement is the user's.

### Disc handling, and the `.bin` trap

`.sub` and `.ecm` are never games. `.bin`, `.img` and `.raw` are decided **per file**: a track
named by a `.cue`/`.gdi`/`.ccd`/`.mds` next to it is suppressed, anything else is a game. The
index file is looked for on disk as well as in the scan set, because a system's extension list
need not include it.

⚠️ This replaced a flat sidecar rule that dropped every `.bin`. Mega Drive's extension list is
`md, bin, smd, gen, 32x, zip`, so a Mega Drive library stored as `.bin` files produced **nothing**
from a folder scan. Covered by a test.

## BIOS

`BIOS/` is EmuLatte's RetroArch `system_directory`, pinned into the owned config on every launch
and excluded from `reimportRaPaths`. It is not a staging area that copies elsewhere. What is dropped
in is what the cores read.

The launch scan files loose drops under the exact name a core expects, matched by **MD5** first
and filename second, so a correct file with a wrong name still lands right. A folder BIOS files
used to be read from is imported once; if it is on a drive that is not plugged in, the path is
kept in `bios_import_from` and retried on later launches, but only when a human had configured
it, never for RetroArch's own default folder.

## Moving home, once

`migrateHomeOnDisk()` runs before the database is opened and renames the **`EmuLatte`
sub-folder** out of `GameManagerConfig/` to `Emulatte_Stuff`, beside the binary.

⚠️ **`GameManagerConfig/` itself is never touched**: not renamed, not moved, not deleted. It is
the sibling app's folder and its library lives in it. The only path this code mutates is
`<baseDir>/GameManagerConfig/EmuLatte`; the cross-filesystem fallback copies that sub-folder and
renames *it* to `EmuLatte.moved-to-Emulatte_Stuff`, still inside the parent. There is no
`rmSync`, `rmdirSync` or `unlinkSync` anywhere near either folder. Verified against a sandbox
mirroring a real `GameManagerConfig`: after the move, all 41 tree entries were still present,
all 30 files byte-for-byte identical, and `games.db` still opened with its 883 games.
`migrateHomeInDb()` then re-points the paths that pointed inside the old home: generated `.m3u`
`rom_path`s and path keys in the owned RetroArch config. It matches on the
`GameManagerConfig/EmuLatte` **segment** rather than one absolute prefix, so a folder that moved
more than once is caught too. Artwork needs nothing: `rehomeArtPaths()` already re-points
`images/<kind>/<file>` at the current folder on every start.

Verified against a copy of a real 3,612-game library: 3,612 games and 56 systems after the move,
672 covers re-homed and all resolving, 2 stale `.m3u` paths fixed, nothing pruned.

## Backups

**Back Up EmuLatte** zips `Emulatte_Stuff` under that prefix, **minus `ROMS/` and `BIOS/`**: a
backup of a library is its metadata, not the ROMs you already have, and the folder layout is
what makes them replaceable. **Back Up Clarity Suite** adds the sibling app's folder.

⚠️ `adm-zip`'s `addLocalFolder` filter is handed the path *inside* the zip, prefix included. The
first version of the exclusion tested the first segment of that and so matched `Emulatte_Stuff`
instead of `ROMS`, silently zipping the whole collection. Verified with a ROM and a BIOS file
sitting in those folders: 0 entries from either.

Restore accepts `Emulatte_Stuff/`, the pre-move `GameManagerConfig/EmuLatte/` (re-homed into the
new folder, so an old backup restores into a current install), and the sibling app's
`GameManagerConfig/`.

## Tests

`npm test` → `scripts/test-rom-library.js`: 66 checks over seeding, folder creation, the scanner
(standalone `.bin`, suppressed tracks, multi-disc grouping, alias folders, sub-folders,
idempotence), pruning and its safety rules, dismissal, BIOS filing and status, the folder report,
and both halves of the move.

better-sqlite3 is built against Electron's ABI, so the runner is Electron with
`ELECTRON_RUN_AS_NODE=1`; plain `node` cannot load it.

## Traps

- `rom-library.js` is on `package.json` `build.files`. A root module that is not listed is simply
  absent from the AppImage and the app dies with `Cannot find module`.
- `ensureOwnedRaCfg()` pins `system_directory` at creation, so the BIOS folder a launch reads
  must be captured *before* `pinBiosDir()` runs. The startup block does this deliberately.
