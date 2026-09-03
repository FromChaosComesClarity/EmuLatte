A point release on top of [1.0.0](https://github.com/shampoo-is-a-lie/EmuLatte/releases/tag/v1.0.0). One new feature: **artwork elsewhere in the ecosystem can now link back to the game it belongs to**, and EmuLatte opens straight to that game's page.

Everything in the 1.0 notes still applies. Nothing was removed, and the database format is unchanged — drop the new AppImage over the old one.

## Open straight to a game

```sh
./EmuLatte.AppImage --game=100          # opens on that game's page
./EmuLatte.AppImage --couch --game=100  # same, on Couch Mode's game page
```

The id is the game's row in your library. Passing an id that isn't there just leaves you where you were — it never errors out.

If EmuLatte is **already running**, the request goes to the window that's already open: it restores if minimised, takes focus, and navigates. No second copy starts. In 1.0.0 the running instance ignored these arguments entirely, so the app simply came to the front showing whatever was already on screen.

**Couch Mode stays Couch Mode.** A deep link arriving while the fullscreen face is up navigates to the *couch* game page, on the couch layout you're using — it will not drop you onto the desktop UI from across the room. It's ignored outright while a game is running, so nothing can steal the screen mid-session. If the screensaver or a menu is up, both step aside first.

## Why it exists

[**ClarityClock**](https://github.com/shampoo-is-a-lie/ClarityClock) shows a slideshow of your library's art. Click the game name under a piece of art that came from EmuLatte and the ROM's page opens here, ready to launch. The Clock resolves art files against `emulatte.db` read-only — it never writes to your library, and it works whether or not EmuLatte is running.

That resolution is exact for EmuLatte art, because every art file EmuLatte writes is named `<romId>_<type>`.

## Notes

- The version in the About dialog now reads 1.1.0.
- `--game=` accepts digits only, so nothing else can ride in on the argument.
- It composes with the existing `--couch` and `--couch-display=` flags.
