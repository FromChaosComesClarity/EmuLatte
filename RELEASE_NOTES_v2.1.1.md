A housekeeping release on top of [2.1.0](https://github.com/FromChaosComesClarity/EmuLatte/releases/tag/v2.1.0). No new features: this takes out the parts of the interface that still worked the way EmuLatte worked *before* the ROMS folder became the library, and fixes two places where the manual described behaviour that no longer exists.

## The buttons that the folder model replaced

Since 2.0.0 the library **is** your `ROMS` folder. You drop files into a system's folder and press Rescan. Several older controls still offered a second, parallel way of doing it, and a few of them actively contradicted how the scanner now behaves.

Removed:

- **Add ROM**, on the left rail and on the system header. Put the file in the system's folder instead, or point a symlink at it from there.
- **Scan ROM Folder**, on the left rail and on the system header, along with its modal. It imported one folder into one system you picked, with an extensions box you had to fill in yourself. A rescan does every system at once and applies the real extension rules, the multi-disc grouping and the adoption rules.
- **ROM Locations** and **Re-point ROM Folder**, in Settings ▸ Data.

### Why re-pointing is no longer a thing you do

ROM Locations existed for the day a drive comes back on a different mount point and every path in the library goes dead at once. You typed the old folder and the new one and it rewrote the prefix.

The scanner already handles this, and handles it better. A game whose file has gone is re-pointed the moment a file with the same system and filename turns up anywhere it reads, and it keeps its art, its description, its favourites and its play history. Nothing to type and nothing to get wrong. If the collection moved, point **Settings ▸ Library ▸ Change…** at where it lives now and press **Rescan Library**.

The old card also carried a warning that is simply no longer true: *"Don't re-scan for that: it re-imports the same ROMs as blank duplicates."* That was accurate once. Adoption is exactly what stops it happening.

## Manual corrections

- The manual still said that an older EmuLatte's folder inside Clarity's `GameManagerConfig` is **moved into the new one automatically, once, with your whole library intact.** That migration was taken out on purpose in 2.0.0, because dropping the AppImage beside somebody else's Clarity install silently adopted that machine's library and there was no way to start clean. The section now says what actually happens and points at the two real routes.
- 2.1.0's artwork transfer between computers was not documented at all. Section 22 now covers exporting and importing it.
- Restoring a backup on a different computer: your ROMs need nothing beyond a rescan. Only RetroArch's own folders need Re-import Paths.

## Under the hood

`confirmBulkImport` went with the folder importer, since its whole job was warning about duplicates that adoption prevents. The old desktop folder chooser (`select-directory`) had no callers left once the in-app folder browser took over, so it is gone too, and with it the `add-game`, `scan-rom-folder`, `create-m3u`, `rom-locations`, `rom-relocate-preview` and `rom-relocate-apply` IPC handlers. 624 lines removed, 123 added.

Checked before shipping: every element the interface reaches for still exists (identical to the previous build), both pages parse clean, the test suite passes, and the removals were confirmed inside the packaged AppImage rather than only in the source.
