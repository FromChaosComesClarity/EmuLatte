# EmuLatte on Omarchy, the port plan

Agreed 2026-09-04. Clarity's Omarchy work is documented in that repo's `docs/omarchy-features.md`
and `docs/omarchy-tasklist.md`; this file records what carries over, what does not, and what is
different here because EmuLatte launches emulators rather than Proton.

**The name stays EmuLatte.** The earlier idea of renaming it was dropped.

Two modules in Clarity were written to be copied here unchanged (`packages/core/omarchy.js`,
`packages/core/omarchy-theme.js`): node builtins only, nothing imported from the rest of that
suite. They land at the repo root here, since EmuLatte is a flat single-package app.

## What is genuinely the same

- **Detection.** `/etc/os-release` for `ID=omarchy`, and `isHyprland()` kept as a separate
  question so a plain Arch + Hyprland user gets the window behaviour without being told they are
  on Omarchy.
- **The theme bridge.** EmuLatte's CSS tokens are *the same shape as Clarity's*, verified token
  by token: `--bg`, `--bg_panel`, `--bg_menu`, `--accent`, `--text_main`, `--text_sec`,
  `--text_dim`, `--border`, `--border_solid`. So the mapping from Omarchy's `colors.toml` drops
  in with no re-derivation, and an Omarchy palette becomes a real entry in `EL_THEMES`.
- **Idle inhibit and the power profile while a game runs.** Same reasoning, more force: a
  gamepad-only Couch session produces literally no keyboard or mouse input, and this app is
  gamepad-first by design.
- **The corner radius.** Read from `hyprctl getoption decoration:rounding`, not from
  `looknfeel.lua`, which is Lua in Omarchy 4 and would still be stale the moment it changed at
  runtime. Measured on this box: `int: 0`.
- **Package installs through a terminal the user can watch.** Nothing here runs `sudo`.
- **The system tuning report.** It reports, it never tunes.

## What is different here, and why

### The game window is not one class

Clarity launches everything through umu/Proton, so every game arrives as `steam_app_*` and one
regex covers the lot. EmuLatte does not have that luxury:

- **53 of the 56 shipped system presets launch RetroArch** (`retroarch -L {core} {rom}`).
- **3 launch a user-supplied binary** (`{emulator} {rom}`: Vita, PS3, Switch).
- **Any system can carry a fully custom launch command**, and a per-game `launch_override` can
  point at anything at all.

So a hardcoded class regex would be right for RetroArch and wrong for everyone with a standalone
emulator, which is exactly the population this app serves. Instead:

1. A small **seed table** of classes we know, applied at start.
2. Anything else is **learned**: after a launch, the class of the window that actually appeared is
   read back from `hyprctl clients` and remembered against that emulator binary, so the rule is
   applied on every launch after the first. A measurement, not a guess, and it covers emulators
   that did not exist when this was written.

> ⚠️ **Omarchy already ships a RetroArch rule** (`/usr/share/omarchy/default/hypr/apps/retroarch.lua`):
> fullscreen, full opacity, `idle_inhibit = "fullscreen"`. It matches `com.libretro.RetroArch`
> **only**. We do not duplicate it; the seed table exists to cover the classes that rule misses.

### The installer list points the other way

`omarchy.js` carries RetroArch flagged `emulation: true` precisely so this port can show it, and
Clarity filters it out. The complement is now explicit too: Steam and the 32-bit graphics drivers
are Clarity's business, and are flagged `pcGaming: true` so EmuLatte can leave them alone. One
module, each app reporting only what it is responsible for.

RetroArch is **not installed on the development box**, so `omarchy install gaming retroarch`,
which brings the full libretro core set in one step, is the headline offer here rather than an
afterthought.

### The tool list is an emulation tool list

Clarity probes for umu, DOSBox, wine, protontricks. None of that is load-bearing here. EmuLatte
needs archive tools for compressed ROMs, a controller stack, and the same optional extras.

### There is no titlebar to hide

EmuLatte is already `frame: false` with its own titlebar and an icon rail, so Clarity's "compact
chrome" workstream is a smaller job here: the drag region is dead weight under a tiling
compositor, and the three window buttons duplicate what the compositor already owns.

## Phase 1, this pass

| # | Item |
|---|---|
| 1 | `omarchy.js` and `omarchy-theme.js` ported, adapted, wired through IPC and preload |
| 2 | The Omarchy palette as a real theme, live-following `omarchy theme set`, applied before first paint |
| 3 | Window rules: EmuLatte's own transient windows float; emulator windows go fullscreen, by seed and by measurement |
| 4 | One launch choke point holding an idle inhibitor and the performance profile for exactly the life of the game |
| 5 | An Omarchy pane in Settings: what this host is, what it is missing, and a terminal to fix it in |
| 6 | The desktop's corner radius, while the desktop's palette is worn |
| 7 | `~/.config/emulatte/desktop.json`, so a bar widget can find this installation without guessing |

## Phase 2, not in this pass

- An `omarchy-emulatte` bar widget and launcher overlay, the shape of `omarchy-clarity`.
- Couch Mode following the Omarchy palette the way it follows the Manager's.
- Compact chrome and the responsive shell.
