A fix release on top of [2.0.0](https://github.com/FromChaosComesClarity/EmuLatte/releases/tag/v2.0.0), for one thing that was broken in it: **moving your library to an external drive did not work.** EmuLatte closed and never came back, on more than one machine.

## Why it happened

Two separate faults, both certain, both now fixed.

**EmuLatte could not restart itself.** After a move it restarts to pick the library up from its new home. It asked the operating system to run `process.execPath`, which for an AppImage is a path inside a temporary mount (`/tmp/.mount_XXXXXX/...`) that is thrown away the instant the app exits. So EmuLatte exited and the thing it asked to start no longer existed. It now restarts by its own file on disk. The same fault was waiting in **Restore from Backup**, which restarts the same way, and is fixed with it.

**It depended on the desktop's folder chooser.** On Wayland that is a request to a separate process, and when that process falls over the app asking it inherits the failure. A feature whose whole job is to be careful with your library should not be built on something it cannot see or control, so EmuLatte now browses folders itself: a plain list of directories, your mounted drives offered as shortcuts, and nothing outside the app involved. The same browser is used for picking your ROMS and BIOS folders.

## While it works, it tells you

Moving the library now opens a window showing what is happening, file by file, with a progress bar: preparing, copying, checking the copy, then the result. The copy is done asynchronously, one file at a time, so the window stays alive and drawable throughout. Before, it blocked the whole app from the first byte to the last, which on a large library looked exactly like a freeze.

Nothing about the move's safety changed: the copy is verified before anything is stood down, the originals are renamed rather than deleted, your ROMS and BIOS folders are pinned where they are and not dragged along, and a drive that is not plugged in still says so instead of quietly becoming a different library.
