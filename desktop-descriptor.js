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

/*
 * The command a desktop integration should run to get this app back.
 *
 * Prefers an EmuLatte AppImage sitting beside the data directory over our own process:
 * `process.execPath` during development is the electron binary, which is correct for us and
 * useless to anyone else.
 */
function appExecutable(baseDir, selfExecutable) {
    try {
        const hit = fs.readdirSync(baseDir).find(f => /^EmuLatte.*\.AppImage$/i.test(f));
        if (hit) return path.join(baseDir, hit);
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
function publish({ version, baseDir, configDir, libraryDb, imagesDir, selfExecutable, gameClasses }) {
    return writeDescriptor({
        version: version || null,
        exec: appExecutable(baseDir, selfExecutable),
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
