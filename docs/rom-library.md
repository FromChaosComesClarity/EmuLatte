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

## Ready to play, without being asked

Three things decide whether pressing Play works, and all three are settled at startup.

**Where the cores are.** Not one folder: `libretro_directory` from the configs, the per-user
folder, the Flatpak sandbox, and the system-wide folders a package manager uses.

⚠️ That last group is the one that matters on Arch and Omarchy. `pacman -S libretro-nestopia`
puts cores in `/usr/lib/libretro`, which looking in `~/.config/retroarch/cores` will never find.
Searching only the per-user folder meant a machine with **42 working cores installed reported
zero and could not launch a single game**. Dirs are deduped by *real* path, because `/usr/lib64`
is a symlink to `/usr/lib` here and the naive version found every core twice.

**The owned config, repaired on every start.** It used to be written once and never revisited,
so whatever the host config said at that moment was what EmuLatte was stuck with forever. If
RetroArch had not been run yet, the owned config got no `libretro_directory` at all and
`retroarch -L nestopia_libretro.so` could not resolve a thing: every game failed to launch,
silently, for the life of the install. `repairOwnedRaCfg()` now checks the essentials each time
and fills in what is missing from the host config, or from the machine itself.

⚠️ "Exists" is not "useful". RetroArch writes its own default `~/.config/retroarch/cores`
back into the config on exit (`config_save_on_exit`), and on a packaged install that folder
exists and is empty. A folder with no cores in it counts as stale, or the repair cheerfully
leaves a useless path in place.

**Absolute core paths.** `{core}` resolves to the core's full path instead of being passed
through as the bare filename it is stored as. A bare `-L` leaves RetroArch to find the core
under its own `libretro_directory`, so one wrong line in a config file means nothing launches.
The bare name stays as the fallback.

**When a core really is missing**, `playGame` returns `needCore` rather than spawning a window
that flashes and vanishes, and the desktop face offers to download it and start the game.
Settings ▸ Library leads with a readiness card: which systems hold games, which cannot play,
and one button to fetch the lot. The first-run screen shows the same card when there is
something to fix. Downloaded cores go somewhere writable, never `/usr/lib/libretro`, which is
root-owned and would fail with EACCES.

## Video: the defaults EmuLatte picks for itself

EmuLatte runs RetroArch on its own config and never touches the host's. That means RetroArch's
compiled-in defaults apply unless EmuLatte says otherwise, and on a modern desktop the default
`gl` driver is not a neutral choice, it is a slow one.

Measured on an RTX 4060 Ti, NES (nestopia), fullscreen at 3440x1440 with `crt-aperture`:

| driver | achieved | vs correct speed |
|---|---|---|
| `gl` | 29.1 fps | **207%** (half speed) |
| `vulkan` | 54.6 fps | 110% |
| `vulkan` + `video_threaded` | 58.6 fps | 103% |

The core runs at 800+ fps unthrottled, so none of that is emulation cost. Windowed, the same
comparison is 50.6 fps against 58.0.

⚠️ `gl` also cannot load **slang** shaders, which is the only kind libretro ships any more.
The log line is `[GLSL] Stock GLSL shaders will be used`. So a user picking a CRT shader got
nothing on screen *and* half the speed, with nothing said either way.

So `videoDefaults()` seeds `video_driver` (vulkan when a loader and an ICD are both present,
else `glcore`, which is the older driver that can still load slang), `video_threaded`,
`video_vsync`, `video_smooth = false` and fullscreen. They are seeded on creation and filled in
on an older install **only when absent**, so a driver somebody chose on purpose stands.

⚠️ Threaded video is a known problem for cores that render in hardware, so
`launchConfigFile` switches it back off for the systems in `HW_RENDERED_SYSTEMS` (GameCube,
Wii, PS2/PS3, PSP, Vita, Dreamcast, 3DS, Switch, Saturn). Global win, per-system exception.

### Shaders are EmuLatte's too

`video_shader_dir` is pinned to `Emulatte_Stuff/shaders` and excluded from the host import, for
the same reason the BIOS folder is: `/usr/share/libretro/shaders` is root-owned, so nothing can
be downloaded into it, and it belongs to the host. The Ready to play card offers to fetch
libretro's slang pack into EmuLatte's own folder when it is empty.

## Where the picture lands

RetroArch's native Wayland path puts the viewport in the wrong place when the output uses a
**fractional** scale. Measured with `grim` and a pixel count on a 3440x1440 monitor at scale
1.25, Master System content:

| | picture | padding L/R |
|---|---|---|
| native Wayland | 2661x1440 | 779 / **0** (runs off the right edge) |
| XWayland | 2194x1440 | 623 / 623 (centred) |

The compositor places the window correctly either way (2752x1152 logical, the full monitor), so
this is inside RetroArch, and no combination of fullscreen mode, aspect index or hand-computed
custom viewport changes it. So the emulator is launched through XWayland, but **only when a
fractional scale is actually in use** and only when there is an X display to use. An
integer-scaled session renders correctly on Wayland natively, which is the better path. It
costs nothing measurable: 57.6 fps against 57.9.

⚠️ Switching toolkit backends means switching **all** of them. Omarchy exports
`GDK_BACKEND=wayland` for the whole session, so dropping `WAYLAND_DISPLAY` on its own leaves
GTK pointed at a Wayland display that no longer has a name: `cannot open display: :0`, and the
emulator exits before drawing a frame. `emulatorEnv()` sets `GDK_BACKEND`, `QT_QPA_PLATFORM`,
`SDL_VIDEODRIVER`, `CLUTTER_BACKEND` and `XDG_SESSION_TYPE` together, and bails out entirely if
`DISPLAY` is unset.

⚠️ This is the **emulator child process** only. Relaunching EmuLatte itself under XWayland was
tried and abandoned as fragile with the AppImage runtime (see `docs/omarchy-plan.md`). One
spawned process with a coherent environment is a different proposition.

`aspect_ratio_index = 22` ("core provided") is seeded too: left unset, RetroArch stretched a
Master System across the whole ultrawide. 22 means the core says what shape it is and RetroArch
fits the largest copy of that shape on the screen, centred, with `video_scale_integer = false`
so it fills rather than leaving bars for an integer multiple.

### Measuring this honestly

Two different quick scripts gave two different answers here, and both were wrong once: a
centre-row scan is fooled by a dark title screen, and a whole-image bounding box is fooled by a
single on-screen notification in a corner. What settled it was printing a **column occupancy
profile** of the screenshot and reading it. Any future claim about where the picture sits
should be made the same way, not from a glance at a screenshot.

## Obeying its own shader settings

Two separate reasons a shader chosen in Express did nothing.

**The preset was inert.** EmuLatte's curated presets are one line each:

    #reference "shaders_slang/crt/newpixie-crt.slangp"

They are pointers into libretro's slang pack, so installing them without the pack installs a
menu of shaders where every entry fails. RetroArch says so only in its log, `Could not read
root preset` then `Failed to create preset`, and then draws the game with no shader, which from
the outside looks like the setting being ignored. `install-bundled-presets` now fetches the
pack first, `shaderResolves()` follows the `#reference` chain to see whether a preset can
actually load, and the Ready to play card names the shader and says why it cannot.

**RetroArch was choosing its own.** `auto_shaders_enable` defaults to ON, which loads a preset
per core or per game from the config folder. That is why one system showed a shader nobody
picked while another showed none. It is seeded OFF: EmuLatte applies what its own pages say and
nothing else. The Express toggle still turns it back on for anyone who wants it.

## The Settings landing page

Settings opens on a `home` pane rather than dropping straight into General: wordmark, version
chip, a Check for Updates button that opens the releases page (there is no in-app updater, same
as the sibling app), and "Pick a section on the left." Cleanup is pinned to the foot of the
rail and jumps to the card that does the work rather than being a second implementation of it.

## The scraper credentials

Every scrape failed with "0 scraped, 48 failed" and no reason. The bundled developer
credentials were the obvious suspect and were **fine**: `assets/ss_dev.dat` is packaged,
decodes with the key in `ss-dev.js`, and fetches live data from `ssinfraInfos.php` on its own.
The user account was the empty half, and three things conspired to hide that.

**Test Credentials validated but never saved.** It called the API, said "Connected as ...", and
stopped there. Only the Save button persisted anything, so someone who tested successfully and
closed the window had an account that looked configured and was not. Test now writes `ss_user`
and `ss_pass` on success, because credentials that have just proved they work are exactly the
ones the user believes are stored.

⚠️ **Save wrote every credential field unconditionally, including blank ones.** Settings can be
reopened by routes that do not populate the form (coming back from the theme picker, and from
the RetroArch settings modal), so Themes → back → Save silently erased every API key in the
app. Saving is now gated on `_settingsPopulated`, every route that reopens Settings goes
through `loadSettingsCredentials()`, and the field list lives in one place so loading and
saving cannot drift apart.

**A failed scrape never said why.** 48 identical failures are one problem, not 48, and the
summary now names the first real error and calls out a rejected login specifically.
`ssApiCall` marks `authFailed` on 401/403 or an "Erreur de login" body, which is a different
thing from a game that simply is not in the database.

## Coming back from a game

**Couch Mode returned tiled.** Hyprland takes fullscreen away from the window underneath when
the game fullscreens, and does not give it back when the game exits. Measured: Couch Mode goes
from 2752x1152 fullscreen to a tiled 688x563 the moment the emulator appears, and stays tiled
afterwards. Electron's own `isFullScreen()` follows the compositor down to false, so
re-requesting is a real request rather than a no-op, but only once the game's window has
actually gone, which is why `restoreCouchFullscreen()` retries instead of firing once and
hoping. It is gated on `couchMode`, because a game taking the screen is indistinguishable,
from the compositor's side, from the user leaving.

**The scrape offer came back.** `lastScan` lives for the whole session and every face that
loads reads it, so leaving Couch Mode reloaded the desktop face, which read the launch scan
again and offered to scrape games that had been scraped half an hour earlier. The ids are now
consumed on delivery: `takeScanOffer()` hands them over once and blanks them, while the counts
stay, because those describe what happened rather than name a job to do.

⚠️ Delivery is one-shot **and** must not be lost. The `library-scanned` event is useless before
a face is listening, and since delivery consumes the offer, sending it early would take the ids
down with it. So the event goes out only once a renderer has announced itself, and otherwise
the face claims the offer through `get-last-scan` as it initialises. Exactly one of the two
paths runs. A second guard in the renderer drops any id that already has art or a scrape id,
because whatever the plumbing does, a scraped game is not a pending job.

## Resume or start fresh

A game with a save behind it asks before it starts, on both faces: Start Fresh, or one card per
save with the screenshot RetroArch wrote beside it, its label and when it was made. Couch Mode
already had this; the desktop face now has the same thing, and `savestate_thumbnail_enable` is
seeded so the screenshots exist to show.

Both choices have to override the config rather than hope it agrees: Start Fresh forces
`savestate_auto_load = false`, and picking the auto save forces it **true**, or the choice just
made is silently ignored in one direction or the other.

`launchPreflight()` is shared by `playGame` and `launch-game-ex`, so resuming a save cannot
skip the missing-ROM and missing-core checks that starting fresh performs.

## Only Emulatte_Stuff

⚠️ There is deliberately **no** migration from the sibling app's `GameManagerConfig` folder any
more. EmuLatte used to adopt a `GameManagerConfig/EmuLatte` folder it found beside itself,
which was right once and wrong ever after: dropping the AppImage next to an existing Clarity
install on a second machine silently pulled that machine's library and artwork in, and the only
way to start clean was to move the binary somewhere else. `Emulatte_Stuff` is the one place
EmuLatte reads and writes.

What remains is explicit and user-pressed, never automatic: exporting a game to Clarity,
importing Clarity's API keys, and the Suite backup. Restoring a backup zip still understands
the old `GameManagerConfig/EmuLatte/` prefix, which is now the only way to carry an old library
forward, and it is an act somebody chooses.

## Saying what the scan is doing

A rescan on a large collection is several seconds of nothing, and nothing looks like a hang.
`scan()` takes an `onProgress` callback and reports each phase as it happens: the BIOS folder,
then each system's folder as it is read, then importing, folding in duplicates, and checking
for files that have gone. `runLibraryScan` forwards those to the renderer.

The scan is synchronous, which does not matter here: the renderer is a separate process and
paints each message as it arrives while the main process is still working.

⚠️ Two backdrop-filter overlays must not stack, so a rescan started from inside Settings
reports on the card that started it rather than opening a window over the top. Same progress,
different destination, picked by whether the Settings modal is open.

Orphaned artwork was already handled: **Settings ▸ Data ▸ Clean Unused Images & Videos**, also
reachable from Cleanup at the foot of the Settings rail. It compares every file in
`images/`, `videos/` and `manuals/` against what the database references, reports the count and
the megabytes, and deletes only after a confirmation.

## Traps

- `rom-library.js` is on `package.json` `build.files`. A root module that is not listed is simply
  absent from the AppImage and the app dies with `Cannot find module`.
- `ensureOwnedRaCfg()` pins `system_directory` at creation, so the BIOS folder a launch reads
  must be captured *before* `pinBiosDir()` runs. The startup block does this deliberately.
- `retroarch_variant` must be written to settings **first**, before anything resolves a
  RetroArch path. Every lookup goes through `getRetroArchCfgDir()`, which reads that setting; on
  a fresh database it is absent, the host config is looked for in the wrong place, and the owned
  config gets seeded with nothing in it.
