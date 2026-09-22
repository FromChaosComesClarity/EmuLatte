'use strict';
/*
 * EmuLatte, CRT Mode — navigation.
 *
 * A stack of menus and a cursor, which is the whole interaction model: Up and
 * Down move, A descends or acts, B goes back. That is deliberately the entire
 * vocabulary, because it is the vocabulary a D-pad has and the one a TV menu
 * has always had. Nothing here needs a pointer, a text field or a second hand.
 *
 * Screens are plain data — a title and an array of rows — rendered by one
 * function, so adding a branch is adding a screen builder rather than a view.
 *
 * This face has no backend of its own. Every handler it calls (getGames,
 * launchGame, listSaveStates, setGameFlag, …) is the one the desktop UI and
 * Couch Mode already use, so a ROM launched from the sofa goes through exactly
 * the same RetroArch config, overrides and shader path as one launched from the
 * library. A second launcher would be correct on the day it was written and
 * wrong by the next release.
 */

const $menu  = document.getElementById('menu');
const $crumb = document.getElementById('crumb');
const $tally = document.getElementById('tally');
const $empty = document.getElementById('empty');
const $status = document.getElementById('status');
const $hintOkLabel = document.getElementById('hintOkLabel');

/*
 * ⚠️ One CSS pixel must be one screen pixel here, and nothing else in the app
 * cares about that.
 *
 * Omarchy exports GDK_SCALE=2 for the desktop and Chromium turns that into a
 * fractional device scale factor of its own — on the machine this was built for,
 * 1.64, which laid a 720x480 window out in a 439x293 viewport. Every measurement
 * in this face is a scanline count: a 4px rule means "two scanlines, so both
 * fields draw it". Multiplied by 1.64 it becomes 6.56 physical pixels, lands on
 * a half pixel and strobes at 30Hz — precisely the artefact the stylesheet
 * exists to avoid.
 *
 * devicePixelRatio is deviceScaleFactor × zoom, so dividing the current zoom by
 * it lands on 1:1 in a single step, whatever zoom the previous face left behind.
 * main.js resets the zoom on the way out, so the desktop UI is unaffected.
 */
function lockPixels() {
    try {
        const zoom = (window.api.getZoom && window.api.getZoom()) || 1;
        const target = zoom / window.devicePixelRatio;
        if (Math.abs(target - zoom) > 0.001) window.api.setZoom(target);
    } catch (e) { /* an unscaled display needs nothing; a failure here is not fatal */ }
}

// ── Theme ────────────────────────────────────────────────────────────────────
// Every colour in the stylesheet is a variable, so following the user's desktop
// is writing six of them. The live feed means `omarchy theme set` restyles this
// face while it is open rather than at next launch.

function applyTheme(description) {
    const t = description && description.available && description.theme;
    if (!t) return;
    const root = document.documentElement.style;
    if (t.bg)           root.setProperty('--bg', t.bg);
    if (t.bg_menu)      root.setProperty('--panel', t.bg_menu);
    if (t.accent)       root.setProperty('--accent', t.accent);
    if (t.text_main)    root.setProperty('--text', t.text_main);
    if (t.text_dim)     root.setProperty('--text-dim', t.text_dim);
    if (t.border_solid) root.setProperty('--edge', t.border_solid);
}

// ── State ────────────────────────────────────────────────────────────────────

let games = [];
let systems = [];
let prefs = { sort: 'recent', system: 0 };
let query = '';                         // what has been typed on a search screen

/*
 * ⚠️ Matched on letters and digits alone, punctuation stripped from both sides.
 * A ROM set is full of titles a plain substring match cannot find — "Mega Man
 * X4 (USA)", "Sonic & Knuckles", "R-Type III" — and typing the punctuation of
 * something you are searching *for* is not a thing anyone does.
 */
const searchKey = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const stack = [];                       // [{ title, rows, index, okLabel, emptyText }]

const screen = () => stack[stack.length - 1];

// A row the cursor can land on. Information rows are drawn but never selected,
// so a screen that opens on one starts the cursor below it instead.
const selectable = (row) => !!row && row.kind !== 'info' && typeof row.run === 'function';
const firstSelectable = (rows) => Math.max(0, rows.findIndex(selectable));

function put(built, builder, arg) {
    stack.push({ title: built.title, rows: built.rows, index: firstSelectable(built.rows),
                 okLabel: built.okLabel, emptyText: built.emptyText,
                 // ⚠️ Kept so a screen can rebuild itself without the caller
                 // naming it again — needed by typing, and by coming back to a
                 // screen whose data has changed underneath.
                 builder, arg });
}

function push(builder, arg) {
    put(builder(arg), builder, arg);
    render();
}

/*
 * ⚠️ Rebuilt on the way back, not replayed. A screen's rows are a snapshot, and
 * returning to one is exactly when that snapshot is most likely stale: you went
 * away to add a system, install a core or scan a folder.
 */
function pop() {
    if (stack.length <= 1) return;      // the root is the floor; Esc there does nothing
    stack.pop();
    const here = screen();
    if (here && typeof here.builder === 'function') { refresh(here.builder, here.arg); return; }
    render();
}

// Rebuild the screen under the cursor in place, keeping the cursor where it is.
// Used by toggles, which change the row they live on.
function refresh(builder, arg) {
    const here = screen();
    const at = here.index;
    const built = builder(arg);
    here.title = built.title;
    here.rows = built.rows;
    here.okLabel = built.okLabel;
    here.emptyText = built.emptyText;
    here.builder = builder;
    here.arg = arg;
    here.index = Math.max(0, Math.min(at, built.rows.length - 1));
    if (!selectable(here.rows[here.index])) here.index = firstSelectable(here.rows);
    render();
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
    const here = screen();
    if (!here) return;

    $crumb.textContent = stack.map(s => s.title).join('  ›  ');
    // Counted over the rows the cursor can reach, so the tally matches what
    // pressing Down actually does.
    const choices = here.rows.filter(selectable).length;
    const at = here.rows.slice(0, here.index + 1).filter(selectable).length;
    $tally.textContent = choices > 1 ? `${at} / ${choices}` : '';
    $hintOkLabel.textContent = here.okLabel || 'SELECT';

    $menu.replaceChildren();
    $empty.hidden = here.rows.length > 0;
    if (!here.rows.length) {
        $empty.textContent = here.emptyText || 'NOTHING HERE';
        return;
    }

    here.rows.forEach((row, i) => {
        const li = document.createElement('li');
        li.className = 'row';
        li.dataset.kind = row.kind || 'action';
        li.dataset.on = i === here.index ? '1' : '0';

        if (row.thumb) {
            const img = document.createElement('img');
            img.className = 'thumb';
            img.src = row.thumb;
            // A missing cover is common enough on an unscraped set that it has
            // to look deliberate rather than broken.
            img.onerror = () => img.remove();
            li.append(img);
        }

        if (row.fav) {
            const fav = document.createElement('span');
            fav.className = 'fav';
            li.append(fav);
        }

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = row.label;
        li.append(label);

        if (row.meta) {
            const meta = document.createElement('span');
            meta.className = 'meta';
            meta.textContent = row.meta;
            li.append(meta);
        }

        if (row.pill) {
            const pill = document.createElement('span');
            pill.className = 'pill';
            pill.textContent = row.pill;
            li.append(pill);
        }

        if (row.kind === 'nav') {
            const chev = document.createElement('span');
            chev.className = 'chev';
            chev.textContent = '›';
            li.append(chev);
        }

        $menu.append(li);
    });

    const on = $menu.children[here.index];
    if (on) on.scrollIntoView({ block: 'nearest' });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const byTitle  = (a, b) => String(a.title).localeCompare(String(b.title));
const byRecent = (a, b) => (Number(b.last_played || 0) - Number(a.last_played || 0)) || byTitle(a, b);
const sorted   = (list) => list.slice().sort(prefs.sort === 'name' ? byTitle : byRecent);

// A row for one game. The system's short name earns the pill because on a mixed
// set it is the thing that tells two ports of the same title apart.
function gameRow(g) {
    return {
        kind: 'game',
        game: g,
        label: g.title,
        thumb: g.cover || g.logo || '',
        fav: !!g.fav,
        meta: g.year ? String(g.year) : '',
        pill: g.system_short || '',
        run: () => openGame(g),
    };
}

// ⚠️ Save states are on disk, not in the database, so listing them is a
// directory walk — and the game screen needs the answer before it can decide
// whether to offer Resume. Loading it here, on the way in, is why that screen
// can stay synchronous; the cursor has usually already prefetched it.
async function openGame(g) {
    if (!stateCache.has(g.id)) {
        try { stateCache.set(g.id, await window.api.listSaveStates(g.id) || []); }
        catch (e) { stateCache.set(g.id, []); }
    }
    push(gameScreen, g);
}

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`.toUpperCase();

function ago(ms) {
    if (!ms) return '';
    const days = Math.floor((Date.now() - Number(ms)) / 86400000);
    if (days <= 0) return 'TODAY';
    if (days === 1) return 'YESTERDAY';
    if (days < 30) return plural(days, 'day');
    const months = Math.floor(days / 30);
    return months < 12 ? plural(months, 'month') : plural(Math.floor(months / 12), 'year');
}

// ── Screens ──────────────────────────────────────────────────────────────────

function rootScreen() {
    const rows = [];
    const last = games.filter(g => Number(g.last_played || 0) > 0).sort(byRecent)[0];

    // Continue leads, when there is something to continue. A launcher's most
    // likely answer is the thing you were just playing.
    if (last) {
        rows.push({ kind: 'action', label: 'Continue', meta: last.title, run: () => play(last) });
    }

    rows.push({ kind: 'nav', label: 'Search', run: () => { query = ''; push(searchScreen); } });
    rows.push({ kind: 'nav', label: 'Systems', meta: String(systems.length), run: () => push(systemsScreen) });
    rows.push({ kind: 'nav', label: 'All Games', meta: String(filtered().length),
                run: () => push(gamesScreen, { list: filtered(), title: 'ALL GAMES' }) });
    rows.push({ kind: 'nav', label: 'Collections', run: () => openCollections() });
    rows.push({ kind: 'nav', label: 'Filters', meta: filterSummary(), run: () => push(filtersScreen) });
    rows.push({ kind: 'action', label: 'Couch Mode',   run: () => window.api.enterCouch() });
    rows.push({ kind: 'action', label: 'Desktop Mode', run: () => window.api.exitCrt() });
    rows.push({ kind: 'nav',    label: 'Settings',     run: () => push(settingsScreen) });
    rows.push({ kind: 'action', label: 'Exit',         run: () => window.api.close() });

    return {
        title: 'EMULATTE',
        rows,
        emptyText: 'NO LIBRARY YET\nADD A SYSTEM IN SETTINGS',
    };
}

/*
 * ── Search, filters and collections ──────────────────────────────────────────
 *
 * A ROM set is long — thousands of files across a dozen systems — and scrolling
 * one from a sofa is hopeless. Typing a name is the only fast path, and
 * narrowing by system is the next best.
 */
function filtered() {
    let list = games;
    if (prefs.system) list = list.filter(g => g.system_id === prefs.system);
    return list;
}

function filterSummary() {
    if (!prefs.system) return 'NONE';
    const sys = systems.find(s => s.id === prefs.system);
    return sys ? (sys.short_name || sys.name).toUpperCase() : 'NONE';
}

function filtersScreen() {
    const rows = [{
        kind: 'action', label: 'All systems',
        pill: prefs.system ? '' : 'ON',
        run: async () => { prefs.system = 0; await saveSetting('crt_system', ''); refresh(filtersScreen); },
    }];

    for (const sys of systems) {
        rows.push({
            kind: 'action',
            label: sys.name,
            meta: String(games.filter(g => g.system_id === sys.id).length),
            pill: prefs.system === sys.id ? 'ON' : '',
            run: async () => {
                prefs.system = prefs.system === sys.id ? 0 : sys.id;
                await saveSetting('crt_system', String(prefs.system || ''));
                refresh(filtersScreen);
            },
        });
    }

    return { title: 'FILTERS', rows, okLabel: 'CHOOSE', emptyText: 'NO SYSTEMS YET' };
}

async function saveSetting(key, value) {
    try { await window.api.setSetting(key, value); } catch (e) { /* a lost preference is not worth failing over */ }
}

function searchScreen() {
    const q = searchKey(query);
    const matches = q ? filtered().filter(g => searchKey(g.title).includes(q)).slice(0, 200) : [];

    const rows = [{
        kind: 'query',
        label: query || 'Type to search',
        meta: q ? String(matches.length) : '',
        typing: true,
    }];

    for (const g of matches) rows.push(gameRow(g));

    return { title: 'SEARCH', rows, okLabel: 'OPEN', emptyText: 'NOTHING MATCHES' };
}

// Favourites, want-to-play and playlists together: they are the same shape — a
// named set of games — and separate root rows would have said otherwise.
let playlists = [];

async function openCollections() {
    $status.textContent = 'READING…';
    try { playlists = await window.api.getPlaylists() || []; } catch (e) { playlists = []; }
    $status.textContent = '';
    push(collectionsScreen);
}

function collectionsScreen() {
    const favs = games.filter(g => g.fav);
    const wants = games.filter(g => g.want);
    const rows = [
        { kind: 'nav', label: 'Favourites', meta: String(favs.length),
          run: () => push(gamesScreen, { list: favs, title: 'FAVOURITES' }) },
        { kind: 'nav', label: 'Want to play', meta: String(wants.length),
          run: () => push(gamesScreen, { list: wants, title: 'WANT TO PLAY' }) },
    ];

    for (const list of playlists) {
        rows.push({ kind: 'nav', label: list.name, run: () => openPlaylist(list) });
    }

    rows.push({ kind: 'action', label: 'New playlist', run: () => { query = ''; push(newPlaylistScreen); } });
    if (playlists.length) rows.push({ kind: 'nav', label: 'Delete a playlist', run: () => push(deletePlaylistScreen) });

    return { title: 'COLLECTIONS', rows, okLabel: 'OPEN' };
}

async function openPlaylist(list) {
    $status.textContent = 'READING…';
    let members = [];
    try { members = await window.api.getPlaylistGames(list.id) || []; } catch (e) {}
    $status.textContent = '';
    const ids = new Set(members.map(m => (typeof m === 'object' ? m.id : m)));
    push(gamesScreen, { list: games.filter(g => ids.has(g.id)), title: String(list.name).toUpperCase() });
}

function newPlaylistScreen() {
    const name = query.trim();
    return {
        title: 'NEW PLAYLIST',
        rows: [
            { kind: 'query', label: query || 'Type a name', typing: true, run: () => createPlaylist() },
            name ? { kind: 'action', label: `Create "${name}"`, run: () => createPlaylist() }
                 : { kind: 'info', label: 'Type a name, then press Enter' },
        ],
        okLabel: 'CREATE',
    };
}

async function createPlaylist() {
    const name = query.trim();
    if (!name) return;
    const id = await window.api.addPlaylist(name);
    if (!id) { fail('Could not create that playlist.'); return; }
    query = '';
    try { playlists = await window.api.getPlaylists() || []; } catch (e) {}
    $status.textContent = 'CREATED';
    setTimeout(() => { $status.textContent = ''; }, 4000);
    pop();
}

// ⚠️ Deleting asks first, on its own screen: one key does everything in this
// face, and a list you curated is not something to lose to a mis-press.
function deletePlaylistScreen() {
    return {
        title: 'DELETE A PLAYLIST',
        rows: playlists.map(list => ({
            kind: 'nav', label: list.name, run: () => push(confirmDeletePlaylistScreen, list),
        })),
        okLabel: 'CHOOSE',
        emptyText: 'NO PLAYLISTS',
    };
}

function confirmDeletePlaylistScreen(list) {
    return {
        title: String(list.name).toUpperCase(),
        rows: [
            { kind: 'info', label: 'The games themselves are not touched' },
            { kind: 'action', label: 'Delete it', run: async () => {
                const ok = await window.api.deletePlaylist(list.id);
                if (!ok) { fail('Could not delete that playlist.'); return; }
                try { playlists = await window.api.getPlaylists() || []; } catch (e) {}
                $status.textContent = 'DELETED';
                setTimeout(() => { $status.textContent = ''; }, 4000);
                pop(); pop();
            } },
            { kind: 'action', label: 'Keep it', run: () => pop() },
        ],
        okLabel: 'CONFIRM',
    };
}

function systemsScreen() {
    const rows = systems.map(s => {
        const list = games.filter(g => g.system_id === s.id);
        return {
            kind: 'nav',
            label: s.name,
            meta: String(list.length),
            pill: s.short_name || '',
            run: () => push(gamesScreen, { list, title: (s.short_name || s.name).toUpperCase() }),
        };
    });
    return { title: 'SYSTEMS', rows, emptyText: 'NO SYSTEMS CONFIGURED' };
}

function gamesScreen({ list, title }) {
    return {
        title,
        rows: sorted(list).map(gameRow),
        okLabel: 'OPEN',
        emptyText: 'NOTHING HERE YET',
    };
}

/*
 * One game. Everything that can be done to a ROM without a keyboard, and
 * nothing that needs one: play it, resume a save state, mark it a favourite.
 * Scraping, artwork and per-game RetroArch overrides stay in Desktop Mode,
 * where there is room to show what they did.
 */
function gameScreen(g) {
    const rows = [
        { kind: 'action', label: 'Play', run: () => play(g) },
    ];

    // Save states are read fresh each time this screen is built, because the
    // interesting case is the one written by the session that just ended.
    const states = statesFor(g.id);
    if (states.length) {
        rows.push({
            kind: 'nav', label: 'Resume', meta: `${states.length} SAVE${states.length > 1 ? 'S' : ''}`,
            run: () => push(savesScreen, g),
        });
    }

    rows.push({
        kind: 'toggle', label: 'Favourite', pill: g.fav ? 'ON' : 'OFF',
        run: async () => {
            g.fav = g.fav ? 0 : 1;
            try { await window.api.setGameFlag(g.id, 'fav', g.fav); } catch (e) {}
            refresh(gameScreen, g);
        },
    });

    // What is known about the ROM, stated rather than offered. These rows are
    // drawn flat and the cursor steps over them: a row that looks like every
    // other row but does nothing when pressed is the one thing a menu this
    // reduced cannot afford.
    const meta = [g.system_name, g.year, g.genre].filter(Boolean).join(' · ');
    if (meta) rows.push({ kind: 'info', label: meta });
    if (g.last_played) rows.push({ kind: 'info', label: `Last played ${ago(g.last_played).toLowerCase()}` });

    return { title: g.title.toUpperCase(), rows, okLabel: 'SELECT' };
}

// Save states arrive from the main process; this face keeps the last answer per
// game so building the game screen stays synchronous.
const stateCache = new Map();
function statesFor(id) { return stateCache.get(id) || []; }

function savesScreen(g) {
    const rows = statesFor(g.id).map(s => ({
        kind: 'action',
        label: s.label || (s.slot === 'auto' ? 'Auto save' : `Slot ${s.slot}`),
        meta: ago(s.mtime),
        pill: s.slot === 'auto' ? 'AUTO' : String(s.slot),
        run: () => play(g, { slot: s.slot }),
    }));
    return { title: 'RESUME', rows, okLabel: 'RESUME', emptyText: 'NO SAVE STATES' };
}

/*
 * ── Settings ─────────────────────────────────────────────────────────────────
 *
 * The same sections the desktop face has, because on this machine the desktop
 * is not a fallback: the screen is 720x480 and the input is a keyboard across a
 * room, so a settings window designed for a mouse cannot be used at all.
 * Everything needed to run EmuLatte — choosing a RetroArch, installing cores,
 * adding systems, finding ROMs — exists here as rows.
 *
 * ⚠️ RetroArch is the vessel. EmuLatte keeps its own config and its own cores
 * and never edits the host's, so these screens choose *which* RetroArch to run
 * and manage EmuLatte's own things, rather than configuring someone else's
 * install.
 */
function settingsScreen() {
    return {
        title: 'SETTINGS',
        rows: [
            { kind: 'nav', label: 'Systems',   meta: String(systems.length), run: () => push(setSystemsScreen) },
            { kind: 'nav', label: 'RetroArch', meta: (raInfo.active || '').toUpperCase(), run: () => openRetroArch() },
            { kind: 'nav', label: 'Cores',     meta: String(cores.length), run: () => openCores() },
            { kind: 'nav', label: 'Library',   run: () => push(setLibraryScreen) },
            { kind: 'nav', label: 'Display',   run: () => push(setDisplayScreen) },
        ],
        okLabel: 'OPEN',
    };
}

// ── Settings › Display ───────────────────────────────────────────────────────

function setDisplayScreen() {
    return {
        title: 'DISPLAY',
        rows: [
            {
                kind: 'toggle', label: 'Sort games by',
                pill: prefs.sort === 'name' ? 'NAME' : 'RECENT',
                run: async () => {
                    prefs.sort = prefs.sort === 'name' ? 'recent' : 'name';
                    try { await window.api.setSetting('crt_sort', prefs.sort); } catch (e) {}
                    refresh(setDisplayScreen);
                },
            },
            {
                // On a machine wired to a TV, CRT Mode is not a mode — it is
                // how the app is used.
                kind: 'toggle', label: 'Start in CRT Mode',
                pill: prefs.startInCrt ? 'ON' : 'OFF',
                run: async () => {
                    prefs.startInCrt = !prefs.startInCrt;
                    try { await window.api.setSetting('crt_start_on_launch', prefs.startInCrt ? '1' : '0'); } catch (e) {}
                    refresh(setDisplayScreen);
                },
            },
            { kind: 'action', label: 'Couch Mode',   run: () => window.api.enterCouch() },
            { kind: 'action', label: 'Desktop Mode', run: () => window.api.exitCrt() },
        ],
        okLabel: 'CHANGE',
    };
}

// ── Settings › RetroArch ─────────────────────────────────────────────────────

let raInfo = { native: false, flatpak: false, active: 'none', runner: '', configDir: '', coresDir: '' };

async function openRetroArch() {
    $status.textContent = 'READING…';
    try { raInfo = await window.api.retroarchInstalls() || raInfo; } catch (e) {}
    $status.textContent = '';
    push(setRetroArchScreen);
}

function setRetroArchScreen() {
    const rows = [];

    if (!raInfo.native && !raInfo.flatpak) {
        rows.push({ kind: 'info', label: 'RetroArch is not installed' });
        rows.push({ kind: 'info', label: 'Install it, then come back here' });
        return { title: 'RETROARCH', rows, okLabel: '' };
    }

    // ⚠️ Both can be installed at once, and they keep separate cores — so this
    // is a choice, not a status line.
    if (raInfo.native) {
        rows.push({
            kind: 'action', label: 'System package',
            pill: raInfo.active === 'native' ? 'IN USE' : '',
            run: () => chooseRetroArch('native'),
        });
    }
    if (raInfo.flatpak) {
        rows.push({
            kind: 'action', label: 'Flatpak',
            pill: raInfo.active === 'flatpak' ? 'IN USE' : '',
            run: () => chooseRetroArch('flatpak'),
        });
    }

    rows.push({ kind: 'action', label: 'Open RetroArch settings', run: () => window.api.launchRetroarchConfig() });
    rows.push({
        kind: 'action', label: 'Re-import folder paths',
        run: async () => {
            await window.api.raConfigReimportPaths();
            $status.textContent = 'PATHS RE-IMPORTED';
            setTimeout(() => { $status.textContent = ''; }, 5000);
        },
    });

    rows.push({ kind: 'info', label: `Runs: ${raInfo.runner || '—'}` });
    rows.push({ kind: 'info', label: `Cores: ${shortPath(raInfo.coresDir)}` });

    return { title: 'RETROARCH', rows, okLabel: 'CHOOSE' };
}

async function chooseRetroArch(variant) {
    $status.textContent = 'SWITCHING…';
    const r = await window.api.setRetroarchVariant(variant);
    if (!r || !r.ok) { fail((r && r.error) || 'Could not switch RetroArch.'); return; }
    try { raInfo = await window.api.retroarchInstalls() || raInfo; } catch (e) {}
    try { cores = await window.api.getCores() || []; } catch (e) {}
    $status.textContent = 'SWITCHED';
    setTimeout(() => { $status.textContent = ''; }, 5000);
    refresh(setRetroArchScreen);
}

// A path on a 720-pixel screen has to give up its middle.
function shortPath(p) {
    const text = String(p || '');
    return text.length > 46 ? '…' + text.slice(-44) : text;
}

// ── Settings › Cores ─────────────────────────────────────────────────────────

let cores = [];
let availableCores = [];
let coreRun = null;

async function openCores() {
    $status.textContent = 'READING…';
    try { cores = await window.api.getCores() || []; } catch (e) { cores = []; }
    $status.textContent = '';
    push(setCoresScreen);
}

function setCoresScreen() {
    if (coreRun) {
        const pct = coreRun.total ? Math.round((coreRun.got / coreRun.total) * 100) : 0;
        return {
            title: 'CORES',
            rows: [
                { kind: 'info', label: coreRun.name },
                { kind: 'info', label: coreRun.extracting ? 'INSTALLING…' : `DOWNLOADING · ${pct}%` },
            ],
            okLabel: '',
        };
    }

    const rows = [
        { kind: 'nav', label: 'Install a core', run: () => { query = ''; openCoreCatalogue(); } },
        {
            kind: 'action', label: 'Rescan installed cores',
            run: async () => {
                $status.textContent = 'SCANNING…';
                const r = await window.api.scanCores();
                cores = await window.api.getCores() || [];
                $status.textContent = `${(r && r.count) || 0} FOUND`;
                setTimeout(() => { $status.textContent = ''; }, 5000);
                refresh(setCoresScreen);
            },
        },
    ];

    for (const core of cores) {
        rows.push({ kind: 'info', label: core.display_name || core.name, meta: core.system_names || '' });
    }

    return { title: 'CORES', rows, okLabel: 'SELECT', emptyText: 'NO CORES FOUND' };
}

async function openCoreCatalogue() {
    $status.textContent = 'FETCHING LIST…';
    try {
        const r = await window.api.listAvailableCores();
        availableCores = (r && r.ok && r.cores) || [];
        $status.textContent = availableCores.length ? '' : 'COULD NOT FETCH THE CORE LIST';
    } catch (e) {
        availableCores = [];
        $status.textContent = 'COULD NOT FETCH THE CORE LIST';
    }
    push(coreCatalogueScreen);
}

/*
 * ⚠️ Typed, not scrolled. The buildbot lists several hundred cores, and paging
 * through that from across a room is unusable — so the catalogue is a search
 * box, like every other long list in this face.
 */
function coreCatalogueScreen() {
    const q = searchKey(query);
    const matches = q
        ? availableCores.filter(c => searchKey(c.name).includes(q) || searchKey(c.base).includes(q)).slice(0, 60)
        : [];

    const rows = [{
        kind: 'query',
        label: query || 'Type a core or system name',
        meta: q ? String(matches.length) : String(availableCores.length),
        typing: true,
    }];

    for (const core of matches) {
        const installed = cores.some(c => String(c.path || '').endsWith('/' + core.so));
        rows.push({
            kind: 'action',
            label: core.name,
            pill: installed ? 'INSTALLED' : '',
            run: () => installCore(core),
        });
    }

    if (q && !matches.length) rows.push({ kind: 'info', label: 'Nothing matches' });

    return { title: 'INSTALL A CORE', rows, okLabel: 'INSTALL' };
}

async function installCore(core) {
    coreRun = { name: core.name, got: 0, total: 0 };
    pop();                               // back to the core list, which shows the progress
    refresh(setCoresScreen);

    const r = await window.api.installCore(core.base);
    coreRun = null;
    try { cores = await window.api.getCores() || []; } catch (e) {}

    $status.textContent = r && r.ok ? `INSTALLED ${String(core.name).toUpperCase()}`
                                    : ((r && r.error) || 'INSTALL FAILED').toUpperCase();
    setTimeout(() => { $status.textContent = ''; }, 8000);
    refresh(setCoresScreen);
}

window.api.onCoreInstallProgress((d) => {
    if (!coreRun || !d) return;
    coreRun = { ...coreRun, got: d.got || coreRun.got, total: d.total || coreRun.total, extracting: !!d.extracting };
    const here = screen();
    if (here && here.builder === setCoresScreen) refresh(setCoresScreen);
});

// ── Settings › Systems ───────────────────────────────────────────────────────

let presets = [];

function setSystemsScreen() {
    const rows = systems.map(sys => ({
        kind: 'nav',
        label: sys.name,
        pill: sys.short_name || '',
        meta: coreLabelFor(sys),
        run: () => push(systemSetupScreen, sys),
    }));
    rows.push({ kind: 'nav', label: 'Add a system', run: () => { query = ''; openPresets(); } });
    return { title: 'SYSTEMS', rows, okLabel: 'OPEN', emptyText: 'NO SYSTEMS YET' };
}

function coreLabelFor(sys) {
    const file = String(sys.default_core || '').split('/').pop();
    if (!file) return 'NO CORE';
    const core = cores.find(c => String(c.path || '').endsWith('/' + file));
    return (core && (core.display_name || core.name)) || file.replace('_libretro.so', '');
}

function systemSetupScreen(sys) {
    const list = games.filter(g => g.system_id === sys.id);
    return {
        title: (sys.short_name || sys.name).toUpperCase(),
        rows: [
            { kind: 'nav', label: 'Core', meta: coreLabelFor(sys), run: () => push(pickCoreScreen, sys) },
            { kind: 'nav', label: 'Add ROMs from a folder', run: () => browseFor(sys) },
            { kind: 'info', label: `${list.length} games` },
            { kind: 'info', label: sys.extensions ? `Reads: ${sys.extensions}` : 'No file extensions set' },
        ],
        okLabel: 'OPEN',
    };
}

/*
 * Which core runs this system.
 *
 * ⚠️ Cores whose own metadata claims this system come first. A list of 42 cores
 * in alphabetical order is a puzzle; "these three say they run SNES" is an
 * answer.
 */
function pickCoreScreen(sys) {
    const wanted = searchKey(sys.name + ' ' + (sys.short_name || ''));
    const scored = cores.map(c => {
        const claims = searchKey(c.system_names || '');
        const match = !!claims && (claims.includes(wanted) || wanted.includes(claims));
        return { core: c, match };
    }).sort((a, b) => (b.match ? 1 : 0) - (a.match ? 1 : 0)
                   || String(a.core.display_name || a.core.name).localeCompare(String(b.core.display_name || b.core.name)));

    const current = String(sys.default_core || '').split('/').pop();
    const rows = scored.map(({ core, match }) => ({
        kind: 'action',
        label: core.display_name || core.name,
        meta: match ? String(core.system_names || '') : '',
        pill: String(core.path || '').endsWith('/' + current) ? 'IN USE' : '',
        run: async () => {
            const r = await window.api.updateSystem(sys.id, { ...sys, default_core: core.path });
            if (r === false) { fail('Could not set that core.'); return; }
            systems = await window.api.getSystems() || systems;
            const fresh = systems.find(s => s.id === sys.id) || sys;
            $status.textContent = 'CORE SET';
            setTimeout(() => { $status.textContent = ''; }, 4000);
            pop();
            refresh(systemSetupScreen, fresh);
        },
    }));

    return { title: 'CORE', rows, okLabel: 'USE', emptyText: 'NO CORES INSTALLED' };
}

async function openPresets() {
    if (!presets.length) {
        $status.textContent = 'READING…';
        try { presets = await window.api.getSystemPresets() || []; } catch (e) { presets = []; }
        $status.textContent = '';
    }
    push(presetScreen);
}

function presetScreen() {
    const q = searchKey(query);
    const matches = q
        ? presets.filter(p => searchKey(p.name).includes(q) || searchKey(p.short_name || '').includes(q)).slice(0, 60)
        : presets.slice(0, 60);

    const rows = [{
        kind: 'query',
        label: query || 'Type a system name',
        meta: String(matches.length),
        typing: true,
    }];

    for (const preset of matches) {
        const already = systems.some(s => searchKey(s.name) === searchKey(preset.name));
        rows.push({
            kind: 'action',
            label: preset.name,
            pill: already ? 'ADDED' : String(preset.short_name || ''),
            run: () => addPreset(preset),
        });
    }

    return { title: 'ADD A SYSTEM', rows, okLabel: 'ADD' };
}

async function addPreset(preset) {
    // ⚠️ A preset's default core is a *file name*; a system needs the path of a
    // core that is actually installed, or every launch fails on a core that is
    // not there. When it is missing, the system is still added and the screen
    // says what is left to do.
    const wanted = String(preset.default_core || '');
    const installed = cores.find(c => String(c.path || '').endsWith('/' + wanted));

    const r = await window.api.addSystem({
        name: preset.name,
        short_name: preset.short_name || '',
        extensions: preset.extensions || '',
        default_core: installed ? installed.path : '',
        launch_template: preset.launch_template || 'retroarch -L {core} {rom}',
        screenscraper_id: preset.screenscraper_id || null,
    });
    if (r === false || r === null) { fail('Could not add that system.'); return; }

    systems = await window.api.getSystems() || systems;
    query = '';
    $status.textContent = installed ? 'SYSTEM ADDED' : 'ADDED — NOW CHOOSE A CORE';
    setTimeout(() => { $status.textContent = ''; }, 6000);
    pop();
    refresh(setSystemsScreen);
}

/*
 * ── Folder browsing ──────────────────────────────────────────────────────────
 *
 * ⚠️ Rows, not a file dialog. Electron's picker is a desktop window sized for a
 * mouse; at 720x480 it cannot be read or driven, and this face exists so the
 * desktop is never needed.
 */
let browser = { path: '', parent: null, dirs: [], fileCount: 0, target: null };

async function browseFor(sys) {
    browser.target = sys;
    await browseTo('');
    push(browseScreen);
}

async function browseTo(dirPath) {
    $status.textContent = 'READING…';
    try {
        const r = await window.api.listDir(dirPath);
        if (r && r.ok) browser = { ...browser, path: r.path, parent: r.parent, dirs: r.dirs, fileCount: r.fileCount };
        else fail((r && r.error) || 'Cannot read that folder.');
    } catch (e) { fail('Cannot read that folder.'); }
    $status.textContent = '';
}

function browseScreen() {
    const rows = [
        { kind: 'info', label: shortPath(browser.path) },
        {
            kind: 'action',
            label: 'Scan this folder',
            meta: browser.fileCount ? `${browser.fileCount} files` : '',
            run: () => scanFolder(browser.path, browser.target),
        },
    ];

    if (browser.parent) {
        rows.push({ kind: 'nav', label: '..', run: async () => { await browseTo(browser.parent); refresh(browseScreen); } });
    }
    for (const dir of browser.dirs) {
        rows.push({ kind: 'nav', label: dir.name, run: async () => { await browseTo(dir.path); refresh(browseScreen); } });
    }

    return { title: 'CHOOSE A FOLDER', rows, okLabel: 'OPEN' };
}

async function scanFolder(dirPath, sys) {
    $status.textContent = 'SCANNING…';
    const exts = String(sys.extensions || '').split(/[,|\s]+/).map(e => e.trim().replace(/^\./, '')).filter(Boolean);
    try {
        const found = await window.api.scanRomFolder(dirPath, exts);
        const list = Array.isArray(found) ? found : (found && found.files) || [];
        if (!list.length) { fail('No matching ROMs in that folder.'); return; }

        let added = 0;
        for (const file of list) {
            const romPath = typeof file === 'string' ? file : file.path;
            if (!romPath) continue;
            const title = String(romPath.split('/').pop() || '').replace(/\.[^.]+$/, '');
            const r = await window.api.addGame({ system_id: sys.id, title, rom_path: romPath });
            if (r !== false && r !== null) added++;
        }
        games = await window.api.getGames() || games;
        $status.textContent = `${added} ROMS ADDED`;
        setTimeout(() => { $status.textContent = ''; }, 8000);
        pop();
        refresh(systemSetupScreen, sys);
    } catch (e) {
        fail('Could not scan that folder.');
    }
}

// ── Settings › Library ───────────────────────────────────────────────────────

function setLibraryScreen() {
    return {
        title: 'LIBRARY',
        rows: [
            {
                kind: 'action', label: 'Look for new ROMs',
                run: async () => {
                    $status.textContent = 'SCANNING…';
                    const r = await window.api.rescanNewGames();
                    games = await window.api.getGames() || games;
                    const n = (r && (r.added ?? r.count)) || 0;
                    $status.textContent = `${n} ADDED`;
                    setTimeout(() => { $status.textContent = ''; }, 6000);
                    refresh(setLibraryScreen);
                },
            },
            { kind: 'info', label: `${games.length} games · ${systems.length} systems` },
        ],
        okLabel: 'RUN',
    };
}

// ── Actions ──────────────────────────────────────────────────────────────────

// Not a launcher: the command, the per-launch config, the shader and the
// last-played write all belong to the handlers the desktop UI uses. This picks
// which of the two to call and says so on screen.
async function play(g, opts) {
    if (!g) return;
    $status.textContent = 'LAUNCHING…';
    try {
        const res = opts ? await window.api.launchGameEx(g.id, opts)
                         : await window.api.launchGame(g.id);
        if (res && res.ok === false) {
            // The usual cause is a system with no launch template, which is
            // fixed in Desktop Mode — so say what is wrong, on screen, rather
            // than failing silently and looking broken.
            $status.textContent = 'CANNOT LAUNCH';
            return;
        }
        g.last_played = Date.now();
        $status.textContent = '';
    } catch (e) {
        $status.textContent = 'CANNOT LAUNCH';
    }
}

// ⚠️ A failure has to be visible here. On a television there is no console to
// check and no notification area to glance at.
function fail(message) {
    $status.textContent = String(message || 'SOMETHING WENT WRONG').toUpperCase();
    setTimeout(() => { $status.textContent = ''; }, 8000);
}

// ── Input ────────────────────────────────────────────────────────────────────
// Arrow keys, Enter and Escape, which is exactly what the OmaCRT gamepad daemon
// emits, so the pad needs nothing special here and a keyboard still works.

function move(delta) {
    const here = screen();
    if (!here || !here.rows.some(selectable)) return;
    // Step over information rows. The walk is bounded by the row count, so a
    // screen that is all information simply does not move.
    let i = here.index;
    for (let n = 0; n < here.rows.length; n++) {
        i = (i + delta + here.rows.length) % here.rows.length;
        if (selectable(here.rows[i])) break;
    }
    here.index = i;
    render();
    prefetchStates();
}

function page(delta) {
    const here = screen();
    if (!here || !here.rows.some(selectable)) return;
    const row = $menu.children[0];
    const step = Math.max(1, Math.floor($menu.clientHeight / ((row ? row.offsetHeight : 48) + 4)));
    let i = Math.min(here.rows.length - 1, Math.max(0, here.index + delta * step));
    // Having jumped, settle on the nearest row that can actually hold a cursor.
    while (i >= 0 && i < here.rows.length && !selectable(here.rows[i])) i += delta > 0 ? 1 : -1;
    if (i < 0 || i >= here.rows.length) i = delta > 0 ? here.rows.map(selectable).lastIndexOf(true)
                                                      : firstSelectable(here.rows);
    here.index = i;
    render();
    prefetchStates();
}

function activate() {
    const here = screen();
    const row = here && here.rows[here.index];
    if (row && typeof row.run === 'function') row.run();
}

window.addEventListener('keydown', (e) => {
    const here = screen();

    /*
     * Typing, on any screen whose first row is a query row.
     *
     * ⚠️ Narrow on purpose: one printable character, no modifier. Without the
     * modifier test Ctrl+W types a "w"; without the length test every named key
     * ("Shift", "Enter") arrives as a word and lands in the query.
     */
    if (here && here.rows[0] && here.rows[0].typing) {
        if (e.key === 'Backspace') {
            query = query.slice(0, -1);
            refresh(here.builder, here.arg);
            e.preventDefault();
            return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            query += e.key;
            refresh(here.builder, here.arg);
            e.preventDefault();
            return;
        }
    }

    switch (e.key) {
        case 'ArrowUp':    move(-1); break;
        case 'ArrowDown':  move(1); break;
        case 'PageUp':     page(-1); break;
        case 'PageDown':   page(1); break;
        case 'Enter':      activate(); break;
        case 'Escape':
        case 'Backspace':
        case 'ArrowLeft':  pop(); break;
        case 'ArrowRight': {
            // Right descends where descending is what the row means, and does
            // nothing where it is not, rather than acting as a second Enter.
            const here = screen();
            const row = here && here.rows[here.index];
            if (row && row.kind === 'nav') row.run();
            break;
        }
        default: return;
    }
    e.preventDefault();
});

// Walking a save directory for the row under the cursor — rather than for two
// thousand ROMs up front — is what keeps this menu instant on a modest machine.
// By the time A is pressed the answer is usually already here.
let prefetching = null;
async function prefetchStates() {
    const row = screen()?.rows[screen().index];
    const g = row && row.kind === 'game' && row.game;
    if (!g || stateCache.has(g.id) || prefetching === g.id) return;
    prefetching = g.id;
    try { stateCache.set(g.id, await window.api.listSaveStates(g.id) || []); }
    catch (e) { stateCache.set(g.id, []); }
    prefetching = null;
}

// ── Boot ─────────────────────────────────────────────────────────────────────

(async function start() {
    lockPixels();

    try { applyTheme(await window.api.omarchyTheme()); } catch (e) {}
    try { window.api.onOmarchyThemeChanged(applyTheme); } catch (e) {}

    try {
        const [sort, startInCrt, system] = await Promise.all([
            window.api.getSetting('crt_sort'),
            window.api.getSetting('crt_start_on_launch'),
            window.api.getSetting('crt_system'),
        ]);
        prefs.sort = sort === 'name' ? 'name' : 'recent';
        prefs.startInCrt = startInCrt === '1';
        prefs.system = Number(system || 0) || 0;
    } catch (e) { /* defaults are fine */ }

    try { [systems, games] = await Promise.all([window.api.getSystems(), window.api.getGames()]); }
    catch (e) { systems = []; games = []; }

    stack.length = 0;
    put(rootScreen());
    render();

    try { window.api.signalReady(); } catch (e) {}
})();
