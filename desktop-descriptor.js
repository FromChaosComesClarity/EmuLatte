'use strict';
/*
 * Where this installation lives, written down for the desktop to read.
 *
 * Companion pieces, a bar widget, a launcher overlay, the sibling app's "add to EmuLatte"
 * route, need things only this app knows for certain: which binary to run, where the
 * library database actually is, and where the artwork it stores lives. Every one of those is
 * a *lookup*, never a guess.
 *
 * ⚠️ That is not a hypothetical. EmuLatte keeps its database beside the AppImage
 * (`<baseDir>/GameManagerConfig/EmuLatte/emulatte.db`), not under ~/.config or the Electron
 * userData directory, so a consumer deriving "the obvious path" gets it wrong on every
 * machine rather than most of them. The app publishes the real answer instead.
 *
 * So every start rewrites ~/.config/emulatte/desktop.json, and anything on the desktop that
 * wants to talk to EmuLatte reads it there.
 *
 * ⚠️ For consumers: a missing file means "not installed, or never run". It is never a licence
 * to fall back to a guessed path. Report nothing rather than the wrong thing.
 *
 * ⚠️ Writes merge. The renderer may contribute later than main.js does, and neither half may
 * erase the other's keys.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const HOME = os.homedir();

function descriptorDir() {
    const xdg = process.env.XDG_CONFIG_HOME;
    return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(HOME, '.config'), 'emulatte');
}

function descriptorPath() {
    return path.join(descriptorDir(), 'desktop.json');
}

function isRunnable(file) {
    try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); }
    catch { return false; }
}

/*
 * The command a desktop integration should run to get this app back.
 *
 * ⚠️ When we ARE an AppImage this is not a search at all. The runtime sets $APPIMAGE to the
 * exact file we were launched from, which is the only answer that cannot be wrong, and it is
 * already what baseDir is derived from in main.js. Everything below it is the development
 * case and is a guess by comparison.
 *
 * ⚠️ The scan used to be `readdirSync(...).find(/^EmuLatte.*\.AppImage$/i)` and that was a
 * real bug, not a theoretical one: the deploy step renames the previous build to
 * `EmuLatte_old.AppImage` before copying the new one, so the two sit side by side, and that
 * pattern matches BOTH. readdirSync order is arbitrary, so roughly half the time the app
 * published the path of the build it had just replaced, and the bar widget opened a version
 * that could be months old. The same trap exists in the sibling app's copy of this file,
 * where a Clarity_old.AppImage is sitting next to Clarity.AppImage right now.
 *
 * So: never a superseded build, the canonical name wins outright, and where several remain
 * the newest does. A file that is not executable is not an answer either, since handing a
 * launcher a path it cannot run is the same failure wearing a different hat.
 */
function appExecutable(baseDir, selfExecutable, appImagePath) {
    if (appImagePath && isRunnable(appImagePath)) return appImagePath;
    try {
        const candidates = fs.readdirSync(baseDir)
            .filter(f => /^EmuLatte.*\.AppImage$/i.test(f))
            .filter(f => !/_old\.AppImage$/i.test(f));
        const exact = candidates.filter(f => f.toLowerCase() === 'emulatte.appimage');
        const rest = candidates
            .filter(f => f.toLowerCase() !== 'emulatte.appimage')
            .map(f => ({ f, at: (() => { try { return fs.statSync(path.join(baseDir, f)).mtimeMs; } catch { return 0; } })() }))
            .sort((a, b) => b.at - a.at)
            .map(x => x.f);
        for (const f of [...exact, ...rest]) {
            const full = path.join(baseDir, f);
            if (isRunnable(full)) return full;
        }
    } catch {}
    return selfExecutable || null;
}

function readDescriptor() {
    try { return JSON.parse(fs.readFileSync(descriptorPath(), 'utf8')) || {}; }
    catch { return {}; }
}

/*
 * Merge `patch` into the descriptor and write it out. Returns the path on success and null on
 * failure: a desktop integration that cannot be told where we are is a missing icon in
 * someone's bar, never a reason to interrupt the app.
 */
function writeDescriptor(patch) {
    try {
        const next = Object.assign(readDescriptor(), patch, {
            app: 'EmuLatte',
            updatedAt: Math.floor(Date.now() / 1000),
        });
        fs.mkdirSync(descriptorDir(), { recursive: true });
        fs.writeFileSync(descriptorPath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
        return descriptorPath();
    } catch { return null; }
}

/*
 * Called once per start with everything main.js has already resolved.
 */
function publish({ version, baseDir, configDir, libraryDb, imagesDir, selfExecutable, appImagePath, gameClasses }) {
    return writeDescriptor({
        version: version || null,
        exec: appExecutable(baseDir, selfExecutable, appImagePath),
        // The argv each face answers to, so a consumer never has to know our CLI by heart.
        // `game` and `play` are templates rather than flag lists because an id is interpolated
        // into them: `--game=` opens the page, `--play=` starts the game.
        faces: { library: [], couch: ['--couch'] },
        game: '--game=<id>',
        play: '--play=<id>',
        baseDir: baseDir || null,
        configDir: configDir || null,
        libraryDb: libraryDb || null,
        imagesDir: imagesDir || null,
        // The window classes an emulator launched from here arrives under, seeded and learned.
        // A widget asking "is a game running" reads this rather than keeping its own copy.
        gameClasses: Array.isArray(gameClasses) ? gameClasses : [],
    });
}

module.exports = { descriptorPath, readDescriptor, writeDescriptor, publish, appExecutable };
