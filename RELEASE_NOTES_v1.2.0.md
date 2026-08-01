A feature release on top of [1.1.1](https://github.com/shampoo-is-a-lie/EmuLatte/releases/tag/v1.1.1), built around one problem: **what happens when your ROMs move.**

If the drive holding your ROMs changes mount point — a new machine, a fresh distro, a USB enclosure that comes back with a different name — every game in your library goes dead at once. The library itself is still perfect: the artwork, the favourites, the play history, the RetroAchievements links are all still there, correctly attached to games that simply can't be found any more.

Until now EmuLatte had no way to say "they're over here now". The only tool that looked like it might help was the folder scan, and it is exactly the wrong one: it re-imports the same ROMs as brand-new, blank entries, filed under whichever system happened to be selected — leaving you with two copies of everything, and the copy that has all your art is still the broken one.

Database format is unchanged — drop the new AppImage over the old one.

## ROM Locations

**Settings → Data → ROM Locations** lists every folder your library actually points at:

```
/run/media/you/GAMES/roms                     3610 games — all found     [ Move… ]
/home/you/…/EmuLatte/playlists                   2 games — all found     [ Move… ]
```

A folder whose files have gone missing turns red and tells you how bad it is — `3610 of 3610 games not found here` — and its button becomes **Re-point…**. Nothing is hidden behind a scan you have to run first; open the pane and you can see whether your library is healthy.

### It shows you the result before it does anything

Choose where the ROMs live now and EmuLatte previews the outcome:

> **3610** games would be re-pointed.
> **3610 of 3610** would be found on disk afterwards.
> Also updates 3 RetroArch path settings (system_directory, rgui_browser_directory, cheat_database_path).
> Also updates 2 multi-disc playlists.

If you pick the wrong folder it says so just as plainly — `0 of 3610 would be found on disk afterwards` — and shows you a few of the paths it looked for, so you can see *why* it's wrong. The button stays disabled until there is something to do.

### It fixes the things that break alongside your ROMs

A moved drive doesn't only break `rom_path`. Your `.m3u` multi-disc playlists contain absolute paths to each disc, and EmuLatte's own RetroArch config points at the BIOS, cheats and browser folders on that same drive. All of them are found and rewritten in the same operation, so multi-disc games keep swapping discs and RetroArch keeps finding your BIOS.

### It is not a re-import

Every game keeps its row: its artwork, favourite flag, play history, achievements, per-game core and launch overrides, and its place in your playlists. No game is added and none is removed — only the folder they point at changes. The database is backed up first, to `emulatte.db.bak-relocate-<date>` next to your library, and the rewrite runs as a single transaction.

## A guard on bulk imports

The folder scanner now notices when you're about to import a large batch of ROMs that you already own from somewhere else — the signature of trying to recover a moved drive the wrong way. It stops and points you at the tool that will actually work, instead of silently doubling your library:

> 3453 of these 3754 ROMs are already in your library from a different folder. If your ROM drive moved, importing them again creates blank duplicates — the copies you already have keep the art, favourites and play history. Close this and use Settings → Data → ROM Locations → Re-point instead.

Importing a large batch into a single system now asks for confirmation too, naming the system, so a mis-set dropdown doesn't quietly file two thousand arcade ROMs under the NES.

## Fixed: missing cores were never forgotten

Scanning for RetroArch cores only ever added to the list — it never dropped cores that had been deleted from disk. A core you removed (or that didn't come back after reinstalling RetroArch) stayed in the picker forever and could still be set as a system's default, where it failed only at the moment you tried to launch a game.

Scanning now prunes cores whose file is gone, and reports it: *"95 cores found. 10 missing cores removed."*

## Notes

- The version in the About dialog now reads 1.2.0.
- ROM Locations groups folders by their shared parent, so a library spread across many per-system subfolders is offered as one entry to re-point rather than dozens.
- Re-pointing to a folder where some games are missing is allowed — it reports how many, and you can re-point again afterwards.
