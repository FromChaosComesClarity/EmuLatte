// ── THE ROM LIBRARY ──────────────────────────────────────────────────────────
// EmuLatte's library is the ROMS folder. It is not a list the user curates by hand: it is
// read off the disk, the way ES-DE, Batocera and RetroBat read theirs. Everything that
// decides what a system's folder is called, what counts as a launchable file inside it, and
// what the library gains or loses when the folder changes, lives here.
//
// Nothing in this file imports Electron, so the scanner can be exercised from plain node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── DISC-AWARE FOLDER SCANNING ───────────────────────────────────────────────
const DISC_PLAYLIST_EXTS = new Set(['m3u']);
const DISC_INDEX_EXTS    = new Set(['cue', 'gdi', 'ccd', 'mds', 'toc']);
// Never a game on their own, whatever else is in the folder.
const DISC_SIDECAR_EXTS  = new Set(['sub', 'ecm']);
// A game on their own OR a track belonging to an index file — which one depends on the folder,
// so they are decided per file in scanFolderEntries. A Mega Drive library is .bin files and a
// PlayStation one is .bin + .cue; a flat sidecar rule would have swallowed the first.
const DISC_TRACK_EXTS    = new Set(['bin', 'img', 'raw']);
const DISC_FORMAT_EXTS   = new Set([
    ...DISC_PLAYLIST_EXTS, ...DISC_INDEX_EXTS, ...DISC_SIDECAR_EXTS, ...DISC_TRACK_EXTS,
    'chd', 'iso', 'cdi', 'pbp', 'cso', 'nrg', 'mdf'
]);
const extOf = f => path.extname(f).replace(/^\./, '').toLowerCase();
const stripExt = f => path.basename(f).replace(/\.[^.]+$/, '');
// A (Disc 1), [CD2], Disk 3, Side A… token used to recognise & strip multi-disc names.
const DISC_TOKEN_RE = /[\s._-]*[\(\[]?\s*(?:disc|disk|cd)\s*([0-9]+)\s*(?:of\s*[0-9]+)?\s*[\)\]]?/i;
const discNumberOf  = base => { const m = base.match(DISC_TOKEN_RE); return m ? parseInt(m[1], 10) : null; };
const discGameKey   = base => base.replace(DISC_TOKEN_RE, ' ').replace(/\s{2,}/g, ' ').trim().toLowerCase();
const discCleanTitle = base => base.replace(DISC_TOKEN_RE, ' ').replace(/\s{2,}/g, ' ').replace(/[\s._-]+$/, '').trim();

// Absolute paths of the files an index/playlist file points at.
function discReferencedFiles(indexFile) {
    const dir = path.dirname(indexFile);
    const ext = extOf(indexFile);
    const abs = p => path.resolve(path.isAbsolute(p) ? p : path.join(dir, p));
    if (ext === 'ccd') { const b = stripExt(indexFile); return [abs(`${b}.img`), abs(`${b}.sub`)]; }
    if (ext === 'mds') { return [abs(`${stripExt(indexFile)}.mdf`)]; }
    let text = '';
    try { text = fs.readFileSync(indexFile, 'utf8'); } catch { return []; }
    const refs = [];
    for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        if (!l || l.startsWith('#')) continue;
        const q = l.match(/"([^"]+)"/);
        if (q) { refs.push(q[1]); continue; }
        if (ext === 'cue') { const m = l.match(/^FILE\s+(\S+)\s+\w+/i); if (m) refs.push(m[1]); }
        else if (ext === 'gdi') { const m = l.match(/(\S+\.(?:bin|raw|iso))\b/i); if (m) refs.push(m[1]); }
        else if (ext === 'm3u' || ext === 'toc') { refs.push(l); }
        else refs.push(l);
    }
    return refs.map(abs);
}

// Every launchable thing in a folder tree, for one system's extension list:
//   { kind: 'single' | 'playlist' | 'multidisc', path, title, discs?, discCount? }
function scanFolderEntries(folderPath, extensions) {
    const exts = new Set(
        (extensions || '').split(',')
            .map(e => e.trim().toLowerCase().replace(/^\./, ''))
            .filter(Boolean)
    );
    const matched = [];
    (function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            const ext = extOf(e.name);
            if (exts.size === 0 || exts.has(ext)) matched.push(full);
        }
    })(folderPath);

    const single = p => ({ kind: 'single', path: p, title: stripExt(p) });
    const discAware = [...exts].some(e => DISC_FORMAT_EXTS.has(e));
    if (!discAware) return matched.map(single);

    // 1. Suppress every track/disc referenced from inside an index or playlist.
    const referenced = new Set();
    const indexBases = new Set();      // <dir>/<basename> of every index file we saw
    for (const f of matched) {
        if (DISC_INDEX_EXTS.has(extOf(f)) || DISC_PLAYLIST_EXTS.has(extOf(f)))
            for (const r of discReferencedFiles(f)) referenced.add(r);
    }
    // An index file need not be in this system's extension list (a .cue beside .bin on a system
    // whose list is "bin, zip"), so look for the index siblings on disk too.
    for (const f of matched) {
        if (!DISC_TRACK_EXTS.has(extOf(f))) continue;
        const base = path.join(path.dirname(f), stripExt(f));
        for (const ie of DISC_INDEX_EXTS) {
            const idx = `${base}.${ie}`;
            if (fs.existsSync(idx)) { indexBases.add(path.resolve(base)); for (const r of discReferencedFiles(idx)) referenced.add(r); }
        }
    }
    // 2. Launchable candidates: not referenced elsewhere, never an always-sidecar, and never a
    //    track whose own index file sits next to it.
    const candidates = matched.filter(f => {
        const e = extOf(f);
        if (DISC_SIDECAR_EXTS.has(e)) return false;
        if (referenced.has(path.resolve(f))) return false;
        if (DISC_TRACK_EXTS.has(e) && indexBases.has(path.resolve(path.join(path.dirname(f), stripExt(f))))) return false;
        return true;
    });

    // 3. Group multi-disc sets (by game name + format); a lone disc stays single.
    const entries = [];
    const groups  = new Map();
    const loose   = [];
    for (const f of candidates) {
        if (DISC_PLAYLIST_EXTS.has(extOf(f))) { entries.push({ kind: 'playlist', path: f, title: stripExt(f) }); continue; }
        const disc = discNumberOf(stripExt(f));
        if (disc == null) { loose.push(f); continue; }
        const key = `${discGameKey(stripExt(f))}::${extOf(f)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ path: f, disc });
    }
    for (const discs of groups.values()) {
        if (discs.length < 2) { loose.push(discs[0].path); continue; }
        discs.sort((a, b) => a.disc - b.disc);
        entries.push({
            kind: 'multidisc',
            path: discs[0].path,
            discs: discs.map(d => d.path),
            discCount: discs.length,
            title: discCleanTitle(stripExt(discs[0].path))
        });
    }
    for (const f of loose) entries.push(single(f));
    entries.sort((a, b) => a.title.localeCompare(b.title));
    return entries;
}

const commonAncestor = (dirs) => {
    const parts = dirs.map(d => path.resolve(d).split(path.sep));
    if (!parts.length) return null;
    const first = parts[0]; let n = first.length;
    for (const pr of parts) { let i = 0; while (i < n && i < pr.length && pr[i] === first[i]) i++; n = i; }
    return n <= 1 ? null : (first.slice(0, n).join(path.sep) || null);
};

// ── FOLDER NAMES ─────────────────────────────────────────────────────────────
// A system's folder name is ES-DE's, because that is the convention the user is most likely
// to already have on disk. `folder_aliases` in assets/systems.json carries the names the other
// front-ends use for the same system, so a collection laid out by Batocera or RetroPie is read
// without renaming a thing. Only the primary name is ever created.
const slugFolder = s => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
const folderOf = (system, preset) => system?.folder || preset?.folder || slugFolder(system?.short_name) || slugFolder(system?.name) || '';

// ── BIOS ─────────────────────────────────────────────────────────────────────
function md5File(p) {
    try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); } catch { return null; }
}
function walkFiles(dir, depth = 0, acc = []) {
    if (depth > 4 || acc.length > 20000) return acc;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkFiles(full, depth + 1, acc);
        else acc.push(full);
    }
    return acc;
}

// ── THE LIBRARY, BOUND TO ONE INSTALL ────────────────────────────────────────
// ctx: { getDb, configDir, presets, biosDb, insertGame, deleteGame, raCfg: {ensure, parse, writeKeys}, log }
function createLibrary(ctx) {
    const { getDb, configDir, presets, biosDb, raCfg } = ctx;
    const log = ctx.log || (() => {});
    const presetBy = new Map((presets || []).map(p => [p.short_name, p]));

    const setting = (k, d = null) => {
        try { return getDb()?.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value ?? d; } catch { return d; }
    };
    const putSetting = (k, v) => {
        try { getDb()?.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(k, String(v ?? '')); } catch {}
    };

    const defaultRomsRoot = () => path.join(configDir, 'ROMS');
    const defaultBiosRoot = () => path.join(configDir, 'BIOS');
    const romsRoot = () => setting('roms_root') || defaultRomsRoot();
    const biosRoot = () => setting('bios_root') || defaultBiosRoot();

    // ── Systems are seeded, not added by hand ────────────────────────────────
    // Every preset exists as a system from the first launch, configured exactly as the preset
    // says — the user never has to create one. A system the user deliberately deleted is
    // remembered in `systems_dismissed` so seeding does not drag it back; Restore Default
    // Systems clears that list.
    const dismissed = () => new Set(String(setting('systems_dismissed', '') || '').split(',').map(s => s.trim()).filter(Boolean));
    function dismiss(shortName) {
        if (!shortName) return;
        const d = dismissed(); d.add(shortName); putSetting('systems_dismissed', [...d].join(','));
    }
    function undismissAll() { putSetting('systems_dismissed', ''); }

    function seedSystems() {
        const db = getDb(); if (!db) return { inserted: 0, backfilled: 0 };
        const skip = dismissed();
        const have = new Map(db.prepare('SELECT id, short_name, folder FROM systems').all().map(r => [r.short_name, r]));
        const ins = db.prepare(`INSERT INTO systems
            (name, short_name, folder, extensions, default_core, default_emulator, launch_template, screenscraper_id)
            VALUES (@name, @short_name, @folder, @extensions, @default_core, @default_emulator, @launch_template, @screenscraper_id)`);
        const setFolder = db.prepare('UPDATE systems SET folder=? WHERE id=?');
        let inserted = 0, backfilled = 0;
        db.transaction(() => {
            for (const p of presets || []) {
                const row = have.get(p.short_name);
                if (!row) {
                    if (skip.has(p.short_name)) continue;
                    ins.run({
                        name: p.name, short_name: p.short_name, folder: p.folder || slugFolder(p.short_name),
                        extensions: p.extensions || '', default_core: p.default_core || '',
                        default_emulator: p.default_emulator || '', launch_template: p.launch_template || '',
                        screenscraper_id: p.screenscraper_id || null,
                    });
                    inserted++;
                } else if (!row.folder) {
                    setFolder.run(p.folder || slugFolder(p.short_name), row.id); backfilled++;
                }
            }
            // A system the user made themselves still needs a folder to be scanned.
            for (const row of db.prepare('SELECT id, name, short_name, folder FROM systems').all()) {
                if (row.folder) continue;
                const f = slugFolder(row.short_name) || slugFolder(row.name);
                if (f) { setFolder.run(f, row.id); backfilled++; }
            }
        })();
        if (inserted || backfilled) log(`systems: seeded ${inserted}, gave a folder to ${backfilled}`);
        return { inserted, backfilled };
    }

    // ── The folders themselves ───────────────────────────────────────────────
    // One folder per system under the ROMS root, each carrying a systeminfo.txt that says what
    // belongs in it. ES-DE does the same, and it is the only documentation most people read.
    function systemInfoText(sys) {
        const p = presetBy.get(sys.short_name);
        return [
            `${sys.name}`,
            ''.padEnd(String(sys.name).length, '='),
            '',
            `Drop ${sys.name} ROMs in this folder. EmuLatte adds them to the library the next`,
            'time it opens, or straight away when you press Rescan Library.',
            '',
            `Accepted file types: ${(sys.extensions || '').trim() || '(any)'}`,
            `Launched with:       ${(sys.launch_template || '').trim() || '(not set)'}`,
            `Default core:        ${(sys.default_core || '').trim() || '(none)'}`,
            `EmuLatte system key: ${sys.short_name}`,
            p?.folder_aliases?.length
                ? `Also read from:      ${p.folder_aliases.join(', ')} (folders other front-ends use for this system)`
                : null,
            '',
            'Sub-folders are read too, so one folder per game is fine. A multi-disc set',
            'named "... (Disc 1)", "... (Disc 2)" is grouped into a single entry.',
            '',
            'This file is written by EmuLatte and is not read back; editing it changes nothing.',
            '',
        ].filter(l => l !== null).join('\n');
    }

    function ensureFolders() {
        const db = getDb(); if (!db) return { ok: false, error: 'DB not ready' };
        const root = romsRoot(), bios = biosRoot();
        const created = [];
        try { fs.mkdirSync(root, { recursive: true }); } catch (e) { return { ok: false, error: e.message, root }; }
        try { fs.mkdirSync(bios, { recursive: true }); } catch {}
        const systems = db.prepare('SELECT * FROM systems ORDER BY name ASC').all();
        for (const s of systems) {
            const f = folderOf(s, presetBy.get(s.short_name));
            if (!f) continue;
            const dir = path.join(root, f);
            try {
                if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); created.push(f); }
                fs.writeFileSync(path.join(dir, 'systeminfo.txt'), systemInfoText(s), 'utf8');
            } catch {}
        }
        try {
            fs.writeFileSync(path.join(root, 'README.txt'), [
                'EmuLatte ROMS',
                '=============',
                '',
                'One folder per system. Drop ROMs into the folder for their system and EmuLatte',
                'picks them up the next time it opens, or when you press Rescan Library.',
                '',
                'Each folder has a systeminfo.txt saying which file types that system takes.',
                'Empty systems are hidden from the library until they have a game in them.',
                '',
                'Point EmuLatte at a different ROMS folder in Settings > Library if your',
                'collection already lives somewhere else, such as an external drive.',
                '',
            ].join('\n'), 'utf8');
        } catch {}
        if (created.length) log(`created ${created.length} system folder(s) under ${root}`);
        return { ok: true, root, bios, systems: systems.length, created };
    }

    // Folders this system's ROMs could be in: its own name plus the names the other front-ends
    // use, but only the ones that actually exist.
    function candidateFolders(sys, root) {
        const p = presetBy.get(sys.short_name);
        const names = [folderOf(sys, p), ...(p?.folder_aliases || [])].filter(Boolean);
        const seen = new Set(), out = [];
        for (const n of names) {
            const dir = path.join(root, n);
            const key = path.resolve(dir);
            if (seen.has(key)) continue;
            seen.add(key);
            let isDir = false;
            try { isDir = fs.statSync(dir).isDirectory(); } catch {}
            if (isDir) out.push(dir);
        }
        return out;
    }

    // ── .m3u for a multi-disc set ────────────────────────────────────────────
    // Written into EmuLatte's own data dir so it works even when the ROM folder is read-only.
    function createM3u(title, discs) {
        const dir = path.join(configDir, 'playlists');
        fs.mkdirSync(dir, { recursive: true });
        const safe = (String(title || 'game').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '')) || 'game';
        let file = path.join(dir, `${safe}.m3u`);
        for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${safe}_${n}.m3u`);
        fs.writeFileSync(file, (discs || []).join('\n') + '\n', 'utf8');
        return file;
    }
    const m3uDiscs = (m3u) => {
        try {
            return fs.readFileSync(m3u, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
                .map(l => path.isAbsolute(l) ? l : path.join(path.dirname(m3u), l));
        } catch { return []; }
    };

    // ── THE SCAN ─────────────────────────────────────────────────────────────
    // Reads every system's folder and makes the library match it: files that are not in the
    // library are added, rows whose file has gone are dropped. Dropping is deliberately
    // confined to folders the scan actually read — an unmounted drive reads as an absent
    // folder, and an absent folder is skipped, never emptied.
    //
    // A second pass covers games whose ROMs live outside the ROMS root (added by hand, or on a
    // drive the user would rather not move): their own folders are scanned for new siblings,
    // but nothing there is ever removed.
    function scan(opts = {}) {
        const db = getDb();
        if (!db) return { ok: false, error: 'DB not ready' };
        const root = romsRoot();
        const t0 = Date.now();
        const rootExists = fs.existsSync(root);

        const systems = db.prepare('SELECT * FROM systems').all();
        const sysById = new Map(systems.map(s => [s.id, s]));
        const games = db.prepare('SELECT id, system_id, rom_path FROM games').all();
        const playlistsDir = path.resolve(path.join(configDir, 'playlists'));

        // What the library already holds: every rom_path, plus the discs an .m3u game points at.
        const known = new Set();
        const gameDirs = [];                  // [system_id, dir] — the real folder of each game
        const byPath = new Map();             // resolved path -> game id (for pruning)
        for (const g of games) {
            if (!g.rom_path) continue;
            const rp = path.resolve(g.rom_path);
            known.add(rp);
            byPath.set(rp, g.id);
            let dirs;
            if (extOf(g.rom_path) === 'm3u') {
                const d = m3uDiscs(g.rom_path);
                d.forEach(x => { known.add(path.resolve(x)); byPath.set(path.resolve(x), g.id); });
                dirs = d.map(x => path.dirname(x));
            } else dirs = [path.dirname(g.rom_path)];
            for (const d of dirs) {
                const rd = path.resolve(d);
                if (rd === playlistsDir || !g.system_id) continue;
                gameDirs.push([g.system_id, rd]);
            }
        }

        const found = [];                     // new entries to import
        const scanned = [];                   // per-system report
        const readDirs = [];                  // folders actually read, for the prune step
        const seen = new Set();
        const onlySystems = opts.systemIds ? new Set(opts.systemIds.map(Number)) : null;

        // Pass 1 — the ROMS root, folder per system.
        if (rootExists) {
            for (const sys of systems) {
                if (onlySystems && !onlySystems.has(sys.id)) continue;
                const dirs = candidateFolders(sys, root);
                if (!dirs.length) continue;
                let added = 0;
                for (const dir of dirs) {
                    readDirs.push(path.resolve(dir));
                    for (const e of scanFolderEntries(dir, sys.extensions || '')) {
                        const dup = e.kind === 'multidisc'
                            ? (e.discs || []).some(d => known.has(path.resolve(d)))
                            : known.has(path.resolve(e.path));
                        if (dup) continue;
                        const key = path.resolve(e.path);
                        if (seen.has(key)) continue;
                        seen.add(key);
                        found.push({ ...e, system_id: sys.id, system_name: sys.name });
                        added++;
                    }
                }
                scanned.push({ system_id: sys.id, system: sys.name, folders: dirs.map(d => path.basename(d)), added });
            }
        }

        // Pass 2 — the folders existing games already live in, for libraries kept outside the
        // ROMS root. Same inference as the old Refresh: prefer the folder the games share when
        // it is deep enough and not shared with another system, else the immediate folders.
        const outsideRoot = d => !rootExists || !path.resolve(d).startsWith(path.resolve(root) + path.sep);
        const roots = new Map();
        for (const sys of systems) {
            if (onlySystems && !onlySystems.has(sys.id)) continue;
            const dirs = [...new Set(gameDirs.filter(([s]) => s === sys.id).map(([, d]) => d))].filter(outsideRoot);
            if (!dirs.length) continue;
            const anc = commonAncestor(dirs);
            const deepEnough = anc && anc.split(path.sep).filter(Boolean).length >= 2;
            const sharedWithOther = anc && gameDirs.some(([s, d]) => s !== sys.id && (d === anc || d.startsWith(anc + path.sep)));
            roots.set(sys.id, new Set(deepEnough && !sharedWithOther ? [anc] : dirs));
        }
        let extraFolders = 0;
        for (const [sysId, dirSet] of roots) {
            const sys = sysById.get(sysId); if (!sys) continue;
            let added = 0;
            for (const dir of dirSet) {
                if (!fs.existsSync(dir)) continue;          // drive not mounted — leave it alone
                extraFolders++;
                for (const e of scanFolderEntries(dir, sys.extensions || '')) {
                    const dup = e.kind === 'multidisc'
                        ? (e.discs || []).some(d => known.has(path.resolve(d)))
                        : known.has(path.resolve(e.path));
                    if (dup) continue;
                    const key = path.resolve(e.path);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    found.push({ ...e, system_id: sysId, system_name: sys.name });
                    added++;
                }
            }
            if (added) {
                const hit = scanned.find(s => s.system_id === sysId);
                if (hit) hit.added += added;
                else scanned.push({ system_id: sysId, system: sys.name, folders: ['(outside the ROMS folder)'], added });
            }
        }

        // ── Import ──
        const newIds = [];
        for (const e of found) {
            let romPath = e.path;
            if (e.kind === 'multidisc') {
                try { romPath = createM3u(e.title, e.discs); } catch { romPath = e.path; }
            }
            const id = ctx.insertGame({ system_id: e.system_id, title: e.title, rom_path: romPath });
            if (id) newIds.push(id);
        }

        // ── Prune ──
        // Only rows whose file sat in a folder this scan read. A game is gone when its file is
        // gone; an .m3u game is gone when none of its discs are left.
        const removed = [];
        if (!opts.noPrune) {
            const inReadDir = p => readDirs.some(d => p === d || p.startsWith(d + path.sep));
            for (const g of games) {
                if (!g.rom_path) continue;
                if (extOf(g.rom_path) === 'm3u') {
                    const discs = m3uDiscs(g.rom_path);
                    if (!discs.length) continue;
                    if (!discs.every(d => inReadDir(path.resolve(path.dirname(d))))) continue;
                    if (discs.some(d => fs.existsSync(d))) continue;
                    removed.push(g);
                    try { fs.unlinkSync(g.rom_path); } catch {}
                } else {
                    const rp = path.resolve(g.rom_path);
                    if (!inReadDir(path.resolve(path.dirname(rp)))) continue;
                    if (fs.existsSync(rp)) continue;
                    removed.push(g);
                }
            }
            for (const g of removed) { try { ctx.deleteGame(g.id); } catch {} }
        }

        const res = {
            ok: true, root, rootExists,
            added: newIds.length, removed: removed.length, newIds,
            folders: readDirs.length + extraFolders,
            systems: scanned.filter(s => s.added > 0).sort((a, b) => b.added - a.added),
            ms: Date.now() - t0,
        };
        log(`library scan: +${res.added} −${res.removed} across ${res.folders} folder(s) in ${res.ms}ms`);
        return res;
    }

    // What the Library pane shows: where the folders are and what is in them.
    function folderReport() {
        const db = getDb(); if (!db) return { ok: false, error: 'DB not ready' };
        const root = romsRoot();
        const counts = new Map(db.prepare('SELECT system_id, COUNT(*) n FROM games GROUP BY system_id').all().map(r => [r.system_id, r.n]));
        const rows = db.prepare('SELECT * FROM systems ORDER BY name ASC').all().map(s => {
            const f = folderOf(s, presetBy.get(s.short_name));
            const dir = path.join(root, f);
            return {
                id: s.id, name: s.name, short_name: s.short_name, folder: f, path: dir,
                exists: fs.existsSync(dir), games: counts.get(s.id) || 0,
                extras: candidateFolders(s, root).map(d => path.basename(d)).filter(n => n !== f),
            };
        });
        return {
            ok: true, root, rootExists: fs.existsSync(root), bios: biosRoot(),
            isDefaultRoot: path.resolve(root) === path.resolve(defaultRomsRoot()),
            systems: rows, dismissed: [...dismissed()],
        };
    }

    // ── BIOS ─────────────────────────────────────────────────────────────────
    // The BIOS folder is the real thing, not a staging area: EmuLatte points its own RetroArch
    // config's system_directory at it, so what the user drops in is what the cores read. The
    // startup scan files loose drops under the exact name a core expects (matched by MD5, so a
    // right file with a wrong name still lands correctly) and reports what is missing.
    function pinBiosDir() {
        const dir = biosRoot();
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
        try {
            const cfg = raCfg.ensure();
            if (raCfg.parse(cfg).system_directory !== dir) raCfg.writeKeys(cfg, { system_directory: dir });
        } catch {}
        return dir;
    }

    // One-time: bring across whatever the previous system_directory held, so a working setup
    // keeps working.
    //
    // `retry` is for a folder the user had actually configured: those often live on a drive that
    // is not always plugged in, so an absent one is remembered and tried again on later launches.
    // RetroArch's own default folder gets no such treatment — on a machine that never had one,
    // "waiting to import from a folder that does not exist" is a worry about nothing.
    function importOldBios(oldDir, { retry = false } = {}) {
        const dest = biosRoot();
        if (!oldDir || path.resolve(oldDir) === path.resolve(dest)) { putSetting('bios_import_from', ''); return { done: true, files: 0 }; }
        if (!fs.existsSync(oldDir)) {
            putSetting('bios_import_from', retry ? oldDir : '');
            return { done: !retry, pending: retry ? oldDir : null, files: 0 };
        }
        let files = 0, bytes = 0;
        const CAP = 4 * 1024 * 1024 * 1024;
        for (const f of walkFiles(oldDir)) {
            const rel = path.relative(oldDir, f);
            const out = path.join(dest, rel);
            let size = 0; try { size = fs.statSync(f).size; } catch { continue; }
            if (bytes + size > CAP) break;
            if (fs.existsSync(out)) continue;
            try { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.copyFileSync(f, out); files++; bytes += size; } catch {}
        }
        putSetting('bios_import_from', '');
        log(`BIOS: imported ${files} file(s) from ${oldDir}`);
        return { done: true, files, from: oldDir };
    }

    // Match loose drops against the BIOS database and file them under the expected name.
    function biosScan() {
        const root = biosRoot();
        try { fs.mkdirSync(root, { recursive: true }); } catch {}
        const byMd5 = {}, byName = {};
        for (const sys of Object.values(biosDb || {})) {
            for (const b of (sys.files || [])) {
                if (b.md5) byMd5[b.md5.toLowerCase()] = b.file;
                byName[b.file.toLowerCase()] = b.file;
            }
        }
        const filed = [], unknown = [];
        for (const f of walkFiles(root)) {
            const rel = path.relative(root, f);
            let size = 0; try { size = fs.statSync(f).size; } catch { continue; }
            const byHash = size <= 16 * 1024 * 1024 ? byMd5[md5File(f)] : null;   // hash only small files (never a ROM)
            const target = byHash || byName[path.basename(f).toLowerCase()];
            if (!target) { if (rel !== 'README.txt') unknown.push(rel); continue; }
            if (rel === target) continue;                                          // already where it belongs
            const dest = path.join(root, target);
            try {
                if (fs.existsSync(dest) && md5File(dest) === md5File(f)) continue;  // same file, two names
                fs.copyFileSync(f, dest); filed.push({ from: rel, to: target });
            } catch {}
        }
        try {
            fs.writeFileSync(path.join(root, 'README.txt'), [
                'EmuLatte BIOS',
                '=============',
                '',
                'Drop BIOS and firmware files in here, flat or in sub-folders, and EmuLatte files',
                'them under the exact name the emulator expects on the next launch (or when you',
                'press Rescan Library). Files are matched by checksum, so a correct file with the',
                'wrong name still lands in the right place.',
                '',
                'This folder is EmuLatte\'s RetroArch system directory: what is in here is what',
                'the cores read. Settings > BIOS lists what each system needs and whether it',
                'checks out.',
                '',
            ].join('\n'), 'utf8');
        } catch {}
        if (filed.length) log(`BIOS: filed ${filed.length} drop(s) under their expected names`);
        return { ok: true, root, filed, unknown: unknown.slice(0, 200), unknownCount: unknown.length };
    }

    function biosStatus(shortName) {
        const sysDir = biosRoot();
        const entry = (biosDb || {})[shortName];
        if (!entry || !entry.files) return { ok: true, files: [], note: '', systemDir: sysDir };
        const files = entry.files.map(b => {
            const dest = path.join(sysDir, b.file);
            let status = 'missing';
            if (fs.existsSync(dest)) status = (b.md5 && md5File(dest) === b.md5.toLowerCase()) ? 'verified' : 'present';
            return { file: b.file, required: !!b.required, region: b.region || '', status };
        });
        return { ok: true, files, note: entry.note || '', systemDir: sysDir };
    }

    // Everything the BIOS database knows, with where each file stands. Powers the BIOS pane's
    // overview and the startup report.
    function biosOverview() {
        const sysDir = biosRoot();
        const out = [];
        for (const [short, entry] of Object.entries(biosDb || {})) {
            if (!entry || !entry.files) continue;
            const st = biosStatus(short);
            out.push({
                short_name: short, note: entry.note || '',
                missingRequired: st.files.filter(f => f.required && f.status === 'missing').map(f => f.file),
                missing: st.files.filter(f => f.status === 'missing').map(f => f.file),
                verified: st.files.filter(f => f.status === 'verified').length,
                total: st.files.length,
            });
        }
        return { ok: true, root: sysDir, systems: out, pendingImport: setting('bios_import_from', '') || '' };
    }

    return {
        romsRoot, biosRoot, defaultRomsRoot, defaultBiosRoot,
        setRomsRoot: p => putSetting('roms_root', p),
        setBiosRoot: p => putSetting('bios_root', p),
        seedSystems, dismiss, undismissAll, ensureFolders, candidateFolders, folderReport,
        createM3u, scan,
        pinBiosDir, importOldBios, biosScan, biosStatus, biosOverview,
        setting, putSetting,
    };
}

// ── MOVING HOME ──────────────────────────────────────────────────────────────
// EmuLatte used to keep its data inside Clarity's GameManagerConfig folder. It keeps it in
// Emulatte_Stuff beside its own binary now, so the two apps share nothing. This runs once,
// before the database is opened, and is a move rather than a copy so there is one library and
// not two drifting ones.
const LEGACY_MARK = `${path.sep}GameManagerConfig${path.sep}EmuLatte`;
function migrateHomeOnDisk(baseDir, configDir, log = () => {}) {
    if (fs.existsSync(configDir)) return { moved: false };
    const legacy = path.join(baseDir, 'GameManagerConfig', 'EmuLatte');
    if (!fs.existsSync(legacy)) return { moved: false };
    try {
        fs.mkdirSync(path.dirname(configDir), { recursive: true });
        fs.renameSync(legacy, configDir);
        log(`moved the data folder from ${legacy} to ${configDir}`);
        return { moved: true, from: legacy };
    } catch (e) {
        // Different filesystem, or a permission problem: copy, then stand the old one down.
        try {
            fs.cpSync(legacy, configDir, { recursive: true });
            fs.renameSync(legacy, legacy + '.moved-to-Emulatte_Stuff');
            log(`copied the data folder from ${legacy} to ${configDir}`);
            return { moved: true, from: legacy, copied: true };
        } catch (e2) {
            log(`could not move the data folder: ${e2.message}`);
            return { moved: false, error: e2.message };
        }
    }
}

// The paths that pointed inside the old home are still in the database and in the owned
// RetroArch config. Matched on the GameManagerConfig/EmuLatte segment rather than one absolute
// prefix, so a folder that was moved more than once is caught too.
function migrateHomeInDb(db, configDir, raCfg, log = () => {}) {
    if (!db) return { rows: 0, cfgKeys: 0 };
    let rows = 0, cfgKeys = 0;
    const rehome = p => {
        const i = p.indexOf(LEGACY_MARK);
        return i < 0 ? null : path.join(configDir, p.slice(i + LEGACY_MARK.length));
    };
    try {
        const upd = db.prepare('UPDATE games SET rom_path=? WHERE id=?');
        db.transaction(() => {
            for (const g of db.prepare("SELECT id, rom_path FROM games WHERE rom_path LIKE '%GameManagerConfig%EmuLatte%'").all()) {
                const np = rehome(g.rom_path);
                if (np && np !== g.rom_path) { upd.run(np, g.id); rows++; }
            }
        })();
    } catch (e) { log(`rom_path re-home failed: ${e.message}`); }
    try {
        const file = raCfg.ensure();
        const parsed = raCfg.parse(file);
        const updates = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v !== 'string' || !v.includes(LEGACY_MARK)) continue;
            const np = rehome(v);
            if (np) updates[k] = np;
        }
        if (Object.keys(updates).length) { raCfg.writeKeys(file, updates); cfgKeys = Object.keys(updates).length; }
    } catch (e) { log(`RetroArch config re-home failed: ${e.message}`); }
    if (rows || cfgKeys) log(`re-homed ${rows} ROM path(s) and ${cfgKeys} RetroArch path(s) into ${configDir}`);
    return { rows, cfgKeys };
}

module.exports = {
    DISC_PLAYLIST_EXTS, DISC_INDEX_EXTS, DISC_SIDECAR_EXTS, DISC_TRACK_EXTS, DISC_FORMAT_EXTS,
    extOf, stripExt, discNumberOf, discGameKey, discCleanTitle, discReferencedFiles,
    scanFolderEntries, commonAncestor, slugFolder, folderOf, md5File, walkFiles,
    createLibrary, migrateHomeOnDisk, migrateHomeInDb, LEGACY_MARK,
};
