// ── Omarchy Linux integration ────────────────────────────────────────────────
// Omarchy is Arch with Hyprland and an opinionated set of defaults. It is NOT a platform
// backend: `host.id` is still `linux` and every path in platform/linux.js applies unchanged.
// What is different is the *desktop*, a Wayland tiling compositor instead of KDE, and the
// fact that a fresh install ships almost none of the gaming stack, because Omarchy is aimed
// at developers first. Both of those are things this module can answer questions about.
//
// This file deliberately imports nothing from the rest of the app: node builtins only. It is
// the same module the sibling app carries, kept as one file across both repos, so a fix to
// either belongs in both. What differs is the wiring, and the scope flags on INSTALLERS.
//
// ⚠️ Nothing here escalates privileges. Installing packages needs root, and the honest way
// to ask for root from a GUI app is to hand the command to a terminal the user can watch,
// see openInstallTerminal(). Omarchy's own guidance says the same: sudo where a terminal
// exists to type the password into.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const HOME = os.homedir();

function which(bin) {
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        if (!dir) continue;
        const p = path.join(dir, bin);
        try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
    }
    return '';
}

// ── Detection ────────────────────────────────────────────────────────────────
// os-release is the only thing that identifies the distribution. Omarchy 4 sets
// ID=omarchy with ID_LIKE=arch, which is why linux.js's pacman hints already fire
// correctly, its is() helper splits ID_LIKE. Do not assume ID_LIKE stays set: a future
// release dropping it would silently turn every "arch" branch off, so anything that needs
// "is this pacman-based" should ask isArchLike() rather than reading ID alone.
let _osRelease;
function osRelease() {
    if (_osRelease) return _osRelease;
    _osRelease = { id: '', idLike: '', versionId: '', prettyName: '', name: '' };
    try {
        const text = fs.readFileSync('/etc/os-release', 'utf8');
        const get = key => {
            const m = text.match(new RegExp('^' + key + '=(.*)$', 'm'));
            return m ? m[1].trim().replace(/^"(.*)"$/, '$1') : '';
        };
        _osRelease = {
            id: get('ID').toLowerCase(),
            idLike: get('ID_LIKE').toLowerCase(),
            versionId: get('VERSION_ID'),
            prettyName: get('PRETTY_NAME'),
            name: get('NAME'),
        };
    } catch {}
    return _osRelease;
}

function isOmarchy() { return osRelease().id === 'omarchy'; }
function isArchLike() {
    const { id, idLike } = osRelease();
    return id === 'arch' || id === 'omarchy' || idLike.split(/\s+/).includes('arch');
}
function version() { return osRelease().versionId || ''; }

// Hyprland is what Omarchy runs, but it is not exclusive to it, someone on plain Arch may
// well be running Hyprland too, and every window-management feature here works for them.
// Keep the two questions separate so neither gates the other.
function isHyprland() {
    const d = `${process.env.XDG_CURRENT_DESKTOP || ''} ${process.env.DESKTOP_SESSION || ''}`.toLowerCase();
    return d.includes('hyprland') || !!process.env.HYPRLAND_INSTANCE_SIGNATURE;
}

function hyprctlBin() { return which('hyprctl'); }

// hyprctl -j returns JSON for the query subcommands. A non-zero exit or unparseable output
// means the compositor is not listening (no session, or a version without that query), and
// every caller here treats that as "feature unavailable" rather than an error worth raising.
function hyprctl(args) {
    const bin = hyprctlBin();
    if (!bin) return null;
    try {
        const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
        if (r.status !== 0 || !r.stdout) return null;
        return r.stdout;
    } catch { return null; }
}

function hyprctlJson(args) {
    const out = hyprctl([...args, '-j']);
    if (!out) return null;
    try { return JSON.parse(out); } catch { return null; }
}

// The monitors Hyprland knows about, in its own order. `name` is the connector (eDP-1,
// LVDS-1, HDMI-A-1) and is what a window rule matches on, an index shifts when a monitor
// is unplugged, a connector name does not. Same reasoning as kwin-display.js.
function monitors() {
    const list = hyprctlJson(['monitors']);
    if (!Array.isArray(list)) return [];
    return list.map(m => ({
        name: String(m.name || ''),
        description: String(m.description || ''),
        width: Number(m.width) || 0,
        height: Number(m.height) || 0,
        refreshRate: Number(m.refreshRate) || 0,
        scale: Number(m.scale) || 1,
        focused: !!m.focused,
        id: Number(m.id),
    })).filter(m => m.name);
}

// ── Window behaviour under Hyprland ──────────────────────────────────────────
// Two different problems, and they need different answers.
//
// EmuLatte's OWN windows are the easy half. The app is one Electron process that calls
// app.setName('emulatte'), so every window it opens arrives under the class `emulatte` and
// only the TITLE tells the manual viewer from the library. (Verified on a live Omarchy 4
// session: the sibling app shows in `hyprctl clients` as class `clarity`, from exactly the
// same call.) A tiling compositor tiles everything, including a reader you opened over the
// library to glance at, and tiling one halves the thing you opened it from.
//
// The EMULATOR window is the hard half, and it is where this diverges from Clarity. There,
// every game arrives through umu/Proton as `steam_app_*` and one regex covers the lot. Here,
// 53 of the 56 shipped presets launch RetroArch, three launch a binary the user supplies, and
// any system or single game can carry a fully custom launch command. A hardcoded class list
// would be right for RetroArch and wrong for precisely the people who run standalone
// emulators. So the classes are SEEDED with what is known and LEARNED for everything else:
// see learnGameClass() below.
//
// Applied with `hyprctl`, which is session-scoped and writes NOTHING to the user's Hyprland
// config. An emulator front-end has no business editing someone's window manager
// configuration. Re-applied at every start, since the rules die with the session.
//
// ⚠️ Hyprland 0.56 with Omarchy's Lua config runs a NON-LEGACY parser, and `hyprctl keyword`
// simply does not work there, it answers "keyword can't work with non-legacy parsers. Use
// eval." and changes nothing. Worse, it answers that on stdout with exit status 0, so a naive
// success check counts the refusal as a success and reports rules applied that were not. The
// runtime API is `hyprctl eval` with Omarchy's own Lua helper:
//
//     o.window({ class = "...", title = "..." }, { fullscreen = true })
//
// A plain Arch box running Hyprland with a .conf config still has the legacy parser, so the
// keyword form is kept as a fallback. Both are checked for a literal "ok".
// ⚠️ MEASURED, not assumed, and the first version of this was wrong. `app.setName('emulatte')`
// does NOT set the Wayland app_id: both a development run and the packaged AppImage report
// `emulatte_electron_build`, which is package.json's `name` field. The rules below previously
// matched `emulatte`, so they matched nothing at all and the manual windows never floated.
// Nothing in the app's own behaviour hinted at it; only `hyprctl clients` did.
//
// Both names are listed so that renaming the npm package to something less ugly, which would
// change the window class, cannot silently break these rules a second time.
const APP_CLASSES = ['emulatte_electron_build', 'emulatte'];
const APP_CLASS_RE = '(' + APP_CLASSES.join('|') + ')';

const WINDOW_RULES = [
    // Both manual windows carry "Manual" in their title, and both are readers opened beside
    // the library rather than panes of it.
    {
        lua: `o.window({ class = "^${APP_CLASS_RE}$", title = "^(.*Manual.*)$" }, { float = true, center = true, size = { 900, 940 } })`,
        keyword: ['float', `class:^${APP_CLASS_RE}$,title:^(.*Manual.*)$`],
    },
];

// ── Which window an emulator opens under ─────────────────────────────────────
// The seed. Deliberately small: it is a head start, not a catalogue, and everything missing
// from it is learned the first time the user launches it.
//
// ⚠️ Omarchy ALREADY ships a RetroArch rule of its own, in
// /usr/share/omarchy/default/hypr/apps/retroarch.lua: fullscreen, full opacity and
// idle_inhibit on fullscreen. It matches `com.libretro.RetroArch` and nothing else, so the
// native build's plain `retroarch` class falls through it. Ours covers what that one misses;
// a duplicate rule for the same class is harmless but says nothing.
//
// The three entries after RetroArch are the systems whose shipped preset has no default
// emulator (Vita, PS3, Switch), so the user supplies one and these are what they supply.
const SEED_GAME_CLASSES = [
    'retroarch', 'com.libretro.RetroArch', 'org.libretro.RetroArch',
    'rpcs3', 'Vita3K', 'Ryujinx',
];

// ── How an emulator's window opens ───────────────────────────────────────────
// Three answers, and the default is fullscreen.
//
// A game that opens TILED gets shoved into whatever slot the layout has free and resized to
// it. For an emulator that is worse than for a native game: the core is rendering an exact
// pixel grid, and a window sized by the layout rather than by the aspect ratio is the one
// thing that turns a clean 4:3 picture into a smeared one.
//
// FLOATING lets it open at the size it asked for, centred, which is the honest answer for
// anyone who wants to watch a core boot in a window.
//
// FULLSCREEN hands it the whole monitor at map time, which is what an emulator wants and what
// Omarchy's own RetroArch rule already does.
const GAME_WINDOW_MODES = {
    fullscreen: cls => ({
        lua: `o.window({ class = "^(${cls})$" }, { fullscreen = true, idle_inhibit = "fullscreen" })`,
        keyword: ['fullscreen', `class:^(${cls})$`],
    }),
    float: cls => ({
        lua: `o.window({ class = "^(${cls})$" }, { float = true, center = true })`,
        keyword: ['float', `class:^(${cls})$`],
    }),
    // 'tile' is the compositor's own behaviour, so it is the absence of a rule rather than
    // a rule of its own. ⚠️ Which also means switching TO it needs a fresh session: a
    // Hyprland rule cannot be withdrawn once set, only not re-applied.
    tile: () => null,
};

const GAME_WINDOW_MODE_DEFAULT = 'fullscreen';

// A window class is user data by the time it reaches here (it was read off whatever binary
// the user pointed a system at), so it is escaped before being pasted into a regex. An
// emulator called `mupen64plus-gui` would otherwise have its `-` and `+` read as syntax.
function escapeClass(cls) {
    return String(cls || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * Drop every window rule added at runtime, by re-reading the user's own Hyprland config.
 *
 * ⚠️ This exists because a Hyprland rule cannot be withdrawn, the Lua API has `unbind` for
 * keys and nothing at all for window rules (checked against 0.56.2's `hl` table). So the only
 * way to stop a rule applying is to make the compositor forget every dynamic one, which
 * `hyprctl reload` does: measured, a rule added by eval no longer matched afterwards, and the
 * monitor layout came back untouched because that lives in the user's config.
 *
 * ⚠️ It is therefore NOT free: rules other tools set at runtime this session go too, and only
 * ours are put back. That is why nothing calls this on its own, it happens when the user asks
 * for the change to take effect now, and the button says what it does.
 */
function reloadConfig() {
    if (!isHyprland() || !hyprctlBin()) return { ok: false };
    const out = hyprctl(['reload']);
    _appliedClasses.clear();          // the compositor forgot them, so must we
    return { ok: !!(out && /^ok\b/i.test(out.trim())) };
}

function applyRule(rule) {
    if (!rule) return false;
    let out = hyprctl(['eval', rule.lua]);
    // No Lua helper (a plain Hyprland with the legacy parser), try the classic form.
    if (!out || !/^ok\b/i.test(out.trim())) {
        out = hyprctl(['keyword', 'windowrulev2', `${rule.keyword[0]}, ${rule.keyword[1]}`]);
    }
    return !!(out && /^ok\b/i.test(out.trim()));
}

// Classes whose rule is already in this session's compositor. A rule cannot be withdrawn, so
// re-adding one on every launch would grow Hyprland's rule list for the life of the session
// with exact duplicates. Applied once each, and cleared when reloadConfig() makes the
// compositor forget them.
const _appliedClasses = new Set();

/*
 * The rule for one emulator window class, applied at most once per session.
 *
 * Called at start for every class already known, and again the moment a new one is learned,
 * which is why it has to be idempotent rather than a one-shot loop at boot.
 */
function applyGameWindowRule(cls, gameWindowMode = GAME_WINDOW_MODE_DEFAULT) {
    if (!cls || !isHyprland() || !hyprctlBin()) return false;
    if (_appliedClasses.has(cls)) return true;
    // ⚠️ `hasOwnProperty`, not `||`: 'tile' is a real mode whose rule is deliberately null, and
    // an `||` reads that as "unknown mode" and quietly substitutes fullscreen, so the one
    // setting that means "leave my windows alone" did the opposite.
    const make = Object.prototype.hasOwnProperty.call(GAME_WINDOW_MODES, gameWindowMode)
        ? GAME_WINDOW_MODES[gameWindowMode]
        : GAME_WINDOW_MODES[GAME_WINDOW_MODE_DEFAULT];
    const rule = make(escapeClass(cls));
    if (!rule) { _appliedClasses.add(cls); return true; }   // 'tile' wants no rule, and is done
    const ok = applyRule(rule);
    if (ok) _appliedClasses.add(cls);
    return ok;
}

/*
 * Everything at once: EmuLatte's own windows, plus a rule for every emulator class known so
 * far. `gameClasses` is the seed union whatever previous sessions learned, which the caller
 * persists; this module deliberately owns no storage.
 */
function applyWindowRules({ gameWindowMode = GAME_WINDOW_MODE_DEFAULT, gameClasses = [] } = {}) {
    if (!isHyprland() || !hyprctlBin()) return { ok: false, applied: 0, total: 0 };
    let applied = 0;
    for (const r of WINDOW_RULES) if (applyRule(r)) applied++;
    const classes = [...new Set([...SEED_GAME_CLASSES, ...gameClasses])];
    for (const c of classes) if (applyGameWindowRule(c, gameWindowMode)) applied++;
    return { ok: applied > 0, applied, total: WINDOW_RULES.length + classes.length };
}

// ── Learning what an emulator's window is called ─────────────────────────────
// The seed above cannot know about an emulator the user installed yesterday, and guessing a
// class from the binary's name is wrong often enough to be useless: RetroArch's binary is
// `retroarch` and its window is `com.libretro.RetroArch`; Ryujinx's binary is frequently a
// shell wrapper. So the class is not derived at all, it is READ BACK from the compositor
// once the window exists.
//
// Which means the first launch of a new emulator is not fullscreened, and every launch after
// it is. That is the honest trade: the alternative is a rule built on a guess, which is wrong
// silently and forever.

// Every descendant of `pid`, itself included. The launcher spawns `bash -c "<cmd>"`, and bash
// execs a lone simple command in place, so the emulator usually IS this pid. It is not when
// the command is a pipeline, has a `&&` in it, or is a wrapper script, and those are exactly
// the custom commands a user writes by hand, so the whole tree is searched rather than the
// one pid.
function processTree(pid) {
    const seen = new Set([Number(pid)]);
    let children = new Map();
    try {
        for (const entry of fs.readdirSync('/proc')) {
            if (!/^\d+$/.test(entry)) continue;
            let ppid = 0;
            try {
                const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
                // ⚠️ Fields are split on the CLOSING paren, not on spaces: a process whose
                // name contains a space (or a paren) sits in field 2 and would shift every
                // index after it. ppid is the second field after that paren.
                ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) || 0;
            } catch { continue; }
            if (!children.has(ppid)) children.set(ppid, []);
            children.get(ppid).push(Number(entry));
        }
    } catch { return seen; }
    const queue = [Number(pid)];
    while (queue.length) {
        for (const c of children.get(queue.shift()) || []) {
            if (seen.has(c)) continue;
            seen.add(c);
            queue.push(c);
        }
    }
    return seen;
}

/*
 * Watch for the window `pid`'s process tree opens, and answer with its class.
 *
 * Resolves with '' if nothing appears inside the window, which is a normal outcome: the game
 * may have failed to start, or the user may have closed it immediately. Nothing here is worth
 * reporting as an error.
 *
 * ⚠️ Our OWN windows are skipped. A launch is triggered from our own window, and on a slow
 * start ours can be the only thing in the tree matching for a moment. Learning our own class
 * as an emulator would then fullscreen the library itself on every later start.
 */
function learnGameClass(pid, { timeoutMs = 25000, everyMs = 700 } = {}) {
    return new Promise(resolve => {
        if (!pid || !isHyprland() || !hyprctlBin()) return resolve('');
        const deadline = Date.now() + timeoutMs;
        const tick = () => {
            const clients = hyprctlJson(['clients']);
            if (Array.isArray(clients)) {
                const tree = processTree(pid);
                const hit = clients.find(c => tree.has(Number(c.pid)) && c.class && !APP_CLASSES.includes(c.class));
                if (hit) return resolve(String(hit.class));
            }
            if (Date.now() >= deadline) return resolve('');
            setTimeout(tick, everyMs);
        };
        setTimeout(tick, everyMs);
    });
}

// ── System tuning for games ──────────────────────────────────────────────────
// A gaming-focused distribution sets a handful of kernel knobs that a general-purpose one
// leaves at defaults. Most of what those distributions are famous for does not apply on Arch
//, full Mesa and ffmpeg are already here, the kernel is newer, and the fsync work that once
// justified a patched kernel is upstream, so this list is deliberately short. Measured on a
// real Omarchy 4 box, two of the three below were already correct out of the box.
//
// ⚠️ This REPORTS. It does not tune anything. Kernel parameters belong to the distribution
// and to the person running the machine; an app that edits them is an app that eventually
// breaks somebody's system in a way they cannot trace back. The fix is handed over as a
// command, through a terminal, exactly like package installs.
const TUNING = [
    {
        key: 'max_map_count', label: 'Memory map limit',
        read: () => procNumber('/proc/sys/vm/max_map_count'),
        want: 1048576, cmp: 'gte', sysctl: 'vm.max_map_count=1048576',
        why: 'Some games, Proton titles especially, map far more memory regions than the old default allowed, and hit a wall that looks like a random crash. Modern kernels already ship a high value.',
    },
    {
        key: 'split_lock', label: 'Split-lock mitigation',
        read: () => procNumber('/proc/sys/kernel/split_lock_mitigate'),
        want: 0, cmp: 'eq', sysctl: 'kernel.split_lock_mitigate=0',
        why: 'The kernel penalises a program that performs unaligned atomic operations across a cache line. A few games do it constantly and lose noticeable frames to the penalty. Turning it off trades a hardening measure for that performance.',
    },
    {
        key: 'file_limit', label: 'Open file limit',
        // /proc/self/limits reflects what this process inherited, which is the same session
        // default a game launched from here will get, a truer answer than fs.file-max.
        read: () => {
            try {
                const line = fs.readFileSync('/proc/self/limits', 'utf8')
                    .split('\n').find(l => /max open files/i.test(l)) || '';
                const n = line.match(/(\d+|unlimited)\s+(\d+|unlimited)/);
                if (!n) return null;
                return n[2] === 'unlimited' ? Infinity : parseInt(n[2], 10);
            } catch { return null; }
        },
        want: 524288, cmp: 'gte', sysctl: '',   // not a sysctl, set by systemd, see `fix`
        fix: 'sudo mkdir -p /etc/systemd/system.conf.d && printf \'[Manager]\\nDefaultLimitNOFILE=524288:524288\\n\' | sudo tee /etc/systemd/system.conf.d/99-gaming-nofile.conf',
        why: 'esync gives every game thread its own file descriptor, so a low ceiling shows up as a game refusing to start once it is busy enough.',
    },
];

function procNumber(p) {
    try { const v = parseInt(String(fs.readFileSync(p, 'utf8')).trim(), 10); return Number.isFinite(v) ? v : null; }
    catch { return null; }
}

function systemTuning() {
    return TUNING.map(t => {
        const value = t.read();
        const ok = value === null ? null
                 : t.cmp === 'gte' ? value >= t.want
                 : value === t.want;
        return {
            key: t.key, label: t.label, why: t.why,
            value: value === Infinity ? 'unlimited' : value,
            want: t.want, ok,
        };
    });
}

// One command for everything that is off, written as a sysctl drop-in so it survives a
// reboot. Anything without a sysctl (the file limit) carries its own command.
function tuningCommand() {
    const bad = TUNING.filter(t => {
        const v = t.read();
        if (v === null) return false;
        return t.cmp === 'gte' ? v < t.want : v !== t.want;
    });
    if (!bad.length) return '';
    const parts = [];
    const sysctls = bad.filter(t => t.sysctl).map(t => t.sysctl);
    if (sysctls.length) {
        parts.push(`printf '${sysctls.join('\\n')}\\n' | sudo tee /etc/sysctl.d/99-clarity-gaming.conf`);
        parts.push('sudo sysctl --system');
    }
    for (const t of bad) if (!t.sysctl && t.fix) parts.push(t.fix);
    return parts.join('; ');
}

// ── The desktop's geometry ───────────────────────────────────────────────────
// Matching the palette makes the app look like the desktop; matching the geometry makes it
// sit in it. Omarchy's default is square corners (rounding = 0), and an app full of rounded
// cards on that desktop reads as foreign in a way that is hard to name until you see them
// side by side.
//
// ⚠️ Read from the compositor, not from ~/.config/hypr/looknfeel.lua. The config is Lua in
// Omarchy 4 and parsing it would mean writing a Lua reader for one integer, and it would
// still be wrong the moment the value is changed at runtime. `hyprctl getoption` reports what
// Hyprland is ACTUALLY using.
function hyprGeometry() {
    if (!isHyprland()) return null;
    const num = key => {
        const out = hyprctl(['getoption', key]);
        if (!out) return null;
        const m = out.match(/int:\s*(-?\d+)/i);
        return m ? parseInt(m[1], 10) : null;
    };
    const rounding = num('decoration:rounding');
    if (rounding === null) return null;
    return {
        rounding,
        borderSize: num('general:border_size'),
        gapsIn: num('general:gaps_in'),
    };
}

// ── Keeping the screen awake while a game runs ───────────────────────────────
// Omarchy locks on idle. A gamepad-only Couch session, a long cutscene or a turn spent
// reading a map produces no keyboard or mouse input at all, so the desktop's idea of "idle"
// and the player's are completely different, and the lock screen wins.
//
// Electron's powerSaveBlocker speaks the Wayland idle-inhibit protocol, which hypridle honours,
// so the app can hold the inhibitor for exactly as long as a game is running. That is better
// than toggling Omarchy's idle setting: a toggle left flipped by a crash would disable the
// user's lock screen indefinitely, whereas an inhibitor dies with the process that holds it.
//
// ⚠️ Deliberately NOT `omarchy toggle idle`. Persistent state that outlives a crash is exactly
// what a game launcher should not be leaving behind on someone's desktop.
let _idleBlockerId = null;
function inhibitIdle(on, powerSaveBlocker) {
    if (!powerSaveBlocker) return false;
    try {
        if (on) {
            if (_idleBlockerId !== null && powerSaveBlocker.isStarted(_idleBlockerId)) return true;
            _idleBlockerId = powerSaveBlocker.start('prevent-display-sleep');
            return true;
        }
        if (_idleBlockerId !== null) {
            if (powerSaveBlocker.isStarted(_idleBlockerId)) powerSaveBlocker.stop(_idleBlockerId);
            _idleBlockerId = null;
        }
        return true;
    } catch { return false; }
}

// ── Power profile ────────────────────────────────────────────────────────────
// Omarchy manages power profiles, and on a laptop the difference between `balanced` and
// `performance` is real. Switch for the duration of a game and put it back afterwards.
//
// ⚠️ The previous profile is captured at switch time and restored on the way out, so this
// cannot strand a machine in `performance` and eat someone's battery. If the profile cannot
// be read, nothing is changed at all, guessing what to restore to would be worse than not
// helping.
let _savedProfile = '';
function powerProfile(name) {
    const bin = which('powerprofilesctl');
    if (!bin) return '';
    try {
        const r = spawnSync(bin, name ? ['set', name] : ['get'], { encoding: 'utf8', timeout: 4000 });
        return r.status === 0 ? String(r.stdout || '').trim() : '';
    } catch { return ''; }
}

function setGamingPower(on) {
    if (!isOmarchy()) return false;
    if (on) {
        if (_savedProfile) return true;                 // already switched for another game
        const cur = powerProfile('');
        if (!cur || cur === 'performance') return false; // nothing to do, or nothing to restore to
        _savedProfile = cur;
        return !!powerProfile('performance') || true;
    }
    if (!_savedProfile) return false;
    powerProfile(_savedProfile);
    _savedProfile = '';
    return true;
}

// ── The gaming stack ─────────────────────────────────────────────────────────
// What a fresh Omarchy lacks for emulation. Omarchy is aimed at developers, so a clean
// install has almost none of it, and this list is what closes the gap.
//
// It is deliberately SHORT, and shorter than the sibling app's, because EmuLatte's
// dependencies genuinely are. Verified against the source rather than assumed: the only
// external binaries this app ever invokes by name are `retroarch`, `flatpak` and `wmctrl`.
// Everything else it needs it ships (yt-dlp and ffmpeg live in assets/bin/linux), and every
// DOS, ScummVM and arcade system in the 56 presets runs through a libretro core rather than
// a separate emulator, so there is no dosbox or scummvm to ask anyone to install.
//
// RetroArch itself is NOT here. Omarchy has its own installer for it, which brings the full
// libretro core set in one step, so it lives in INSTALLERS below and is handed to that
// instead. Listing it twice would offer the worse route alongside the better one.
//
// Every entry names the binary actually probed for, so nobody is told they need something
// this app does not use. `required: true` means something here degrades without it, and the
// `why` says what. The `extra` group is worth having for emulation but is never called by
// this app, and is labelled so nobody is told they need it.
//
// ⚠️ Package names are Arch's, and `repo` records where it comes from, repo and AUR packages
// take different commands and mixing them produces a "target not found".
const TOOLS = [
    { key: 'flatpak',  bin: 'flatpak',                  pkg: 'flatpak',            repo: 'extra',    required: false,
      label: 'Flatpak',
      why: 'lets this app find and launch the Flatpak build of RetroArch. Unnecessary if RetroArch is installed from the repos.' },
    { key: 'wmctrl',   bin: 'wmctrl',                   pkg: 'wmctrl',             repo: 'extra',    required: false,
      label: 'wmctrl',
      why: 'used to raise the window again after an emulator exits. It is an X11 tool, so on a Wayland session it does nothing even when installed, safe to skip on Hyprland.' },

    { key: 'gamemode', bin: 'gamemoderun',              pkg: 'gamemode',           repo: 'extra',    required: false, extra: true,
      label: 'GameMode',
      why: 'applies CPU governor and scheduling tweaks while a game runs. Worth having for the heavier cores; this app does not call it itself.' },
    { key: 'mangohud', bin: 'mangohud',                 pkg: 'mangohud',           repo: 'extra',    required: false, extra: true,
      label: 'MangoHud',
      why: 'an in-game overlay showing framerate and frame times, which is how you tell a core that is running full speed from one that is not. This app does not call it itself.' },
    { key: 'gamescope',bin: 'gamescope',                pkg: 'gamescope',          repo: 'extra',    required: false, extra: true,
      label: 'gamescope',
      why: 'a micro-compositor for integer scaling and framerate limiting. Emulators are the case it helps most: it can scale a low-resolution picture by a whole number instead of blurring it.' },
];

// ── Omarchy's own gaming installers ──────────────────────────────────────────
// Omarchy ships `omarchy install gaming <thing>`, and for anything it covers that command
// is strictly better than installing the package ourselves: `steam` also pulls the 32-bit
// graphics drivers picked for *this* GPU, which is the step people miss and the reason a
// fresh Arch install runs Proton games at software-rendering speed or not at all.
//
// So the rule is: if Omarchy has an installer for it, hand the user Omarchy's installer.
// We detect what is missing and get out of the way. Nothing here is installed by us.
//
// ⚠️ These are whole applications, not helper binaries, a missing one is never an error,
// only an offer. Steam missing is worth surfacing prominently because the library is built
// from it; the rest are opportunities.
const FLATPAK_EXPORTS = [
    path.join(HOME, '.local', 'share', 'flatpak', 'exports', 'bin'),
    '/var/lib/flatpak/exports/bin',
];

function flatpakInstalled(appId) {
    if (!appId) return false;
    return FLATPAK_EXPORTS.some(d => { try { return fs.existsSync(path.join(d, appId)); } catch { return false; } });
}

function pacmanHas(pkg) {
    try {
        const r = spawnSync('pacman', ['-Qq', pkg], { encoding: 'utf8', timeout: 4000 });
        return r.status === 0;
    } catch { return false; }
}

// The scope flags are what let one module serve both apps. `emulation: true` is EmuLatte's
// pillar and Clarity filters it out; `pcGaming: true` is the reverse, Clarity's business and
// not this app's. An entry with neither flag belongs to both.
//
// ⚠️ Keep this list in step with the sibling app's copy of this file. It is the same module
// in two repos on purpose, and the flags are the only thing that should differ in what each
// one shows.
const INSTALLERS = [
    // Omarchy installs RetroArch with the whole libretro core set in one step, which is the
    // difference between a working library and a list of games with no cores behind them.
    // 53 of the 56 shipped system presets launch through it, so this is the headline offer
    // rather than one item in a list.
    { key: 'retroarch', label: 'RetroArch', bin: 'retroarch', flatpak: 'org.libretro.RetroArch',
      command: 'omarchy install gaming retroarch', emulation: true, headline: true,
      why: 'almost every system here launches through RetroArch, and Omarchy installs it with the full libretro core set in one step. Without it, 53 of the 56 shipped presets have nothing to run.' },
    { key: 'xbox-controllers', label: 'Xbox controller support', pkg: 'xpadneo-dkms',
      command: 'omarchy install gaming xbox-controllers',
      why: 'wireless Xbox pads need this to pair properly. Couch Mode is gamepad-first, so it is worth having if you play from the couch.' },

    // Clarity's half of the ecosystem. Carried here so the module stays one file across both
    // repos, and filtered out of this app's UI by the `pcGaming` flag: a ROM library manager
    // has no business telling anyone their Steam install is missing.
    { key: 'steam', label: 'Steam', bin: 'steam', flatpak: 'com.valvesoftware.Steam',
      command: 'omarchy install gaming steam', pcGaming: true, headline: true,
      why: 'the Steam library is the largest part of most collections there, and that app reads it directly from disk. Omarchy\'s installer also pulls the 32-bit graphics drivers chosen for this GPU, which Proton needs.' },
    { key: 'gpu-lib32', label: '32-bit graphics drivers', pkg: 'lib32-vulkan-icd-loader',
      command: 'omarchy install gaming gpu-lib32', pcGaming: true,
      why: 'Proton and Wine are 32-bit-capable and need the lib32 Vulkan stack. Without it Windows games fail to start or fall back to software rendering.' },
    // ⚠️ Heroic and Lutris are deliberately absent from both apps. Neither is a missing
    // piece; each is a competing launcher, and offering to install one would undercut the
    // thing the app exists to do. Omarchy can install both; that is the user's business.
];

function installerStatus() {
    return INSTALLERS.map(i => {
        const binPath = i.bin ? which(i.bin) : '';
        const present = !!binPath || (i.flatpak ? flatpakInstalled(i.flatpak) : false) || (i.pkg ? pacmanHas(i.pkg) : false);
        return {
            key: i.key, label: i.label, command: i.command, why: i.why,
            headline: !!i.headline, emulation: !!i.emulation, pcGaming: !!i.pcGaming,
            present, path: binPath || null,
            via: binPath ? 'path' : (i.flatpak && flatpakInstalled(i.flatpak)) ? 'flatpak'
               : (i.pkg && pacmanHas(i.pkg)) ? 'package' : null,
        };
    });
}

// Same module, each app reporting only what it is actually responsible for: EmuLatte asks
// for `{ includeEmulation: true, includePcGaming: false }`, Clarity for the mirror image.
// The defaults are Clarity's, so its existing call sites keep meaning what they meant.
function missingInstallers({ includeEmulation = false, includePcGaming = true } = {}) {
    return installerStatus().filter(i => !i.present
        && (includeEmulation || !i.emulation)
        && (includePcGaming  || !i.pcGaming));
}

// Run one of Omarchy's installers in a terminal. Same reasoning as openInstallTerminal():
// these are `requires-sudo=true` scripts, and a terminal is where a password belongs.
function runInstaller(key) {
    const entry = INSTALLERS.find(i => i.key === key);
    if (!entry) return { ok: false, error: `Unknown installer: ${key}` };
    return openTerminalWith(entry.command);
}

// Resolve one tool against PATH, honouring the alternates: a tool that ships under more than
// one binary name is present if any of them is, and a user must never be told to install
// something they already have under a different name.
function resolveTool(t) {
    let found = which(t.bin);
    let via = found ? t.bin : '';
    if (!found && Array.isArray(t.alt)) {
        for (const a of t.alt) {
            const p = which(a);
            if (p) { found = p; via = a; break; }
        }
    }
    return {
        key: t.key, label: t.label, bin: t.bin, pkg: t.pkg, repo: t.repo,
        required: !!t.required, extra: !!t.extra, why: t.why,
        path: found || null, present: !!found, foundAs: via || null,
    };
}

function toolStatus() { return TOOLS.map(resolveTool); }
function missingTools({ includeExtras = true } = {}) {
    return toolStatus().filter(t => !t.present && (includeExtras || !t.extra));
}

// A one-line summary for the UI: how far this host is from the reference.
function gapSummary() {
    const all = toolStatus();
    const missing = all.filter(t => !t.present);
    return {
        total: all.length,
        present: all.length - missing.length,
        missingRequired: missing.filter(t => t.required).map(t => t.key),
        missingOptional: missing.filter(t => !t.required && !t.extra).map(t => t.key),
        missingExtras: missing.filter(t => t.extra).map(t => t.key),
    };
}

// ── Installing what is missing ───────────────────────────────────────────────
// AUR packages go through a different command than repo packages, so a mixed selection has
// to become two commands rather than one. `omarchy pkg add` is a no-op for anything already
// installed, which makes re-running it after a partial failure safe.
function installCommand(keys) {
    const want = toolStatus().filter(t => keys.includes(t.key) && !t.present);
    const repo = want.filter(t => t.repo !== 'aur').map(t => t.pkg);
    const aur  = want.filter(t => t.repo === 'aur').map(t => t.pkg);
    const parts = [];
    if (repo.length) parts.push(`omarchy pkg add ${repo.join(' ')}`);
    if (aur.length)  parts.push(`omarchy pkg aur add ${aur.join(' ')}`);
    // ⚠️ `;` and not `&&`. Chained with &&, a non-zero exit from the repo step, which
    // includes cases as harmless as "nothing to do", silently skips the AUR step, and the
    // user is left being told a package is still missing after watching an install succeed.
    // These are independent installs; one failing is not a reason to skip the other.
    return parts.join('; ');
}

// The terminal to hand a privileged command to. xdg-terminal-exec is the freedesktop
// indirection Omarchy itself uses (TERMINAL is set to it), so it honours whatever terminal
// the user actually chose; the rest are fallbacks for a non-Omarchy Hyprland box.
function terminalLauncher() {
    const xte = which('xdg-terminal-exec');
    if (xte) return { cmd: xte, wrap: args => args };
    for (const t of ['foot', 'alacritty', 'ghostty', 'kitty', 'wezterm']) {
        const p = which(t);
        if (p) return { cmd: p, wrap: args => (t === 'wezterm' ? ['start', '--', ...args] : ['-e', ...args]) };
    }
    return null;
}

// Open a terminal running a command, then keep it open so the result is readable, a
// terminal that closes the instant pacman finishes takes the error with it.
//
// ⚠️ detached + unref is what stops the install dying when the app is closed mid-way, and
// the 'error' listener is not optional: spawn reports a missing terminal asynchronously, so
// a try/catch alone would let an unhandled 'error' event take the whole app down. That is
// the same trap spawnOptional() exists for in linux.js.
function openTerminalWith(command) {
    if (!command) return { ok: false, error: 'Nothing to run.' };
    const term = terminalLauncher();
    if (!term) return { ok: false, error: 'No terminal emulator found to run this in.', command };
    const script = `${command}; echo; echo "── done. press enter to close ──"; read _`;
    try {
        const child = spawn(term.cmd, term.wrap(['bash', '-lc', script]), { detached: true, stdio: 'ignore' });
        child.on('error', () => {});   // a missing terminal must not take the app down
        child.unref();
        return { ok: true, command };
    } catch (e) {
        return { ok: false, error: e.message, command };
    }
}

function openInstallTerminal(keys) {
    const command = installCommand(keys);
    if (!command) return { ok: false, error: 'Nothing to install, every selected tool is already present.' };
    return openTerminalWith(command);
}

// ── Gate ─────────────────────────────────────────────────────────────────────
// Everything above is meaningful on any Arch-like host running Hyprland; the Omarchy-only
// parts (omarchy pkg, the theme bridge) need the real thing. Callers that only want window
// management should ask isHyprland() instead.
function isSupported() { return isOmarchy(); }

function describe() {
    return {
        isOmarchy: isOmarchy(),
        isArchLike: isArchLike(),
        isHyprland: isHyprland(),
        version: version(),
        prettyName: osRelease().prettyName,
        hyprland: isHyprland() ? (hyprctl(['version'])?.split('\n')[0] || '').trim() : '',
        monitors: isHyprland() ? monitors().length : 0,
    };
}

module.exports = {
    osRelease, isOmarchy, isArchLike, version, isHyprland,
    hyprctl, hyprctlJson, monitors,
    TOOLS, toolStatus, missingTools, gapSummary,
    INSTALLERS, installerStatus, missingInstallers, runInstaller,
    WINDOW_RULES, GAME_WINDOW_MODES, GAME_WINDOW_MODE_DEFAULT, APP_CLASSES, SEED_GAME_CLASSES,
    applyWindowRules, applyGameWindowRule, learnGameClass, reloadConfig,
    TUNING, systemTuning, tuningCommand, inhibitIdle, setGamingPower, powerProfile, hyprGeometry,
    installCommand, openInstallTerminal, openTerminalWith, terminalLauncher,
    isSupported, describe, which,
};
