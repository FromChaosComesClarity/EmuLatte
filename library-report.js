'use strict';
/*
 * EmuLatte's library report: pure reductions over the games, systems, playlists and
 * RetroAchievements tables.
 *
 * The same idea and the same renderer design as Clarity's report, applied to what EmuLatte
 * actually knows. It has systems where Clarity has stores, ScreenScraper's 0-20 ratings where
 * Clarity has Metacritic, a players field that says which games are couch co-op, playlists, and
 * RetroAchievements. It has NO playtime: EmuLatte records when a game was last played, never for
 * how long, so "recent" means recently played and no section pretends to count hours.
 *
 * Every section says whether it has data (`available`) so the picker can grey out, say,
 * RetroAchievements for someone who never linked an account.
 */

const DAY = 86400000;
const clean = s => String(s == null ? '' : s).trim();
const int = v => { const m = String(v == null ? '' : v).match(/\d+/); return m ? parseInt(m[0], 10) : 0; };

const SECTION_ORDER = [
    'overview', 'systems', 'recent', 'genres', 'achievements', 'couch', 'ratings',
    'decades', 'studios', 'playlists', 'favourites', 'clarity',
];

// ScreenScraper genres read "Platform / Run & Jump Scrolling" or "Racing, Driving". The part
// before the first separator is the family a reader recognises.
const primaryGenre = g => clean(String(g || '').split(/\s\/\s|,/)[0]);

// "1-4" means up to four players.
const maxPlayers = p => { const nums = String(p || '').match(/\d+/g); return nums ? Math.max(...nums.map(Number)) : 0; };

// ScreenScraper rates out of 20. Shown out of 100 so it reads like every other score people know.
const score = g => { const r = parseFloat(g.rating); return Number.isFinite(r) && r > 0 && r <= 20 ? Math.round(r * 5) : null; };

const yearOf = g => { const y = int(String(g.year || '').slice(0, 4)); return y > 1970 && y < 2100 ? y : null; };

function tallyList(map, limit) {
    const list = [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return limit ? list.slice(0, limit) : list;
}
const bump = (map, key, by = 1) => { if (key) map.set(key, (map.get(key) || 0) + by); };

/**
 * @param {object[]} rows      SELECT * FROM games
 * @param {object}   opts
 * @param {object[]} opts.systems        SELECT id, name, short_name FROM systems
 * @param {object[]} [opts.playlists]    SELECT p.id, p.name, COUNT(pg.game_id) n ... per playlist, with a first game id
 * @param {object[]} [opts.achievements] SELECT * FROM ra_achievements
 * @param {object}   [opts.clarity]      { games, hours, stores } when Clarity's library sits beside this one
 * @param {number}   [opts.recentDays=30]
 * @param {number}   [opts.now]
 */
function buildReport(rows, opts = {}) {
    const now = opts.now || Date.now();
    const recentDays = opts.recentDays || 30;
    const games = (Array.isArray(rows) ? rows : []).filter(g => clean(g.title));
    const sysName = new Map((opts.systems || []).map(s => [s.id, clean(s.name) || clean(s.short_name)]));
    const byId = new Map(games.map(g => [g.id, g]));

    const tile = (g, extra = {}) => ({
        id: g.id, title: clean(g.title), system: sysName.get(g.system_id) || '',
        cover: clean(g.cover), hero: clean(g.hero), logo: clean(g.logo), shot: clean(g.screenshot),
        year: yearOf(g), genre: primaryGenre(g.genre), ...extra,
    });
    const played = g => int(g.last_played) > 0;
    const fav = g => int(g.fav) === 1;

    const sections = {};

    // ── Overview ────────────────────────────────────────────────────────────
    const sysMap = new Map();
    for (const g of games) bump(sysMap, sysName.get(g.system_id) || 'Other');
    const ra = (opts.achievements || []).filter(a => clean(a.date_earned));
    sections.overview = {
        available: games.length > 0,
        games: games.length, systems: sysMap.size,
        played: games.filter(played).length,
        favourites: games.filter(fav).length,
        playlists: (opts.playlists || []).length,
        achievements: ra.length,
    };

    // ── Systems ─────────────────────────────────────────────────────────────
    const playedBySys = new Map();
    for (const g of games) if (played(g)) bump(playedBySys, sysName.get(g.system_id) || 'Other');
    const topPlayedSys = tallyList(playedBySys, 1)[0] || null;
    sections.systems = {
        available: sysMap.size > 0,
        list: tallyList(sysMap),
        mostPlayed: topPlayedSys,
        art: games.filter(g => g.hero || g.cover).sort((a, b) => int(b.last_played) - int(a.last_played)).slice(0, 18).map(g => tile(g)),
    };

    // ── Recently played ─────────────────────────────────────────────────────
    const byLast = games.filter(played).sort((a, b) => int(b.last_played) - int(a.last_played));
    const since = now - recentDays * DAY;
    sections.recent = {
        available: byLast.length > 0,
        days: recentDays,
        playedInWindow: byLast.filter(g => int(g.last_played) >= since).length,
        games: byLast.slice(0, 8).map(g => tile(g, { daysAgo: Math.max(0, Math.floor((now - int(g.last_played)) / DAY)) })),
    };

    // ── Genres ──────────────────────────────────────────────────────────────
    const gMap = new Map();
    for (const g of games) bump(gMap, primaryGenre(g.genre));
    const genreList = tallyList(gMap, 8);
    const lead = genreList[0] ? genreList[0].label : null;
    sections.genres = {
        available: gMap.size > 0,
        classified: [...gMap.values()].reduce((a, b) => a + b, 0),
        distinct: gMap.size,
        byCount: genreList,
        lead,
        leadArt: lead ? games.filter(g => primaryGenre(g.genre) === lead && g.cover).sort((a, b) => (score(b) || 0) - (score(a) || 0)).slice(0, 9).map(g => tile(g)) : [],
    };

    // ── RetroAchievements ───────────────────────────────────────────────────
    const gameByRa = new Map();
    for (const g of games) if (clean(g.ra_game_id)) gameByRa.set(String(g.ra_game_id), g);
    const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
    const raSorted = ra.map(a => ({ a, t: Date.parse(a.date_earned) })).filter(x => Number.isFinite(x.t)).sort((x, y) => y.t - x.t);
    const raGames = new Map();
    for (const { a } of raSorted) bump(raGames, String(a.ra_game_id));
    sections.achievements = {
        available: raSorted.length > 0,
        earned: raSorted.length,
        points: raSorted.reduce((s, x) => s + int(x.a.points), 0),
        games: raGames.size,
        thisYear: raSorted.filter(x => x.t >= yearStart).length,
        topGames: tallyList(raGames, 5).map(x => { const g = gameByRa.get(x.label); return g ? tile(g, { earned: x.value }) : null; }).filter(Boolean),
        latest: raSorted.slice(0, 5).map(({ a, t }) => ({ name: clean(a.title), points: int(a.points), date: t, game: gameByRa.has(String(a.ra_game_id)) ? tile(gameByRa.get(String(a.ra_game_id))) : null })),
    };

    // ── Couch co-op ─────────────────────────────────────────────────────────
    const withPlayers = games.filter(g => maxPlayers(g.players) > 0);
    const multi = withPlayers.filter(g => maxPlayers(g.players) >= 2);
    const party = withPlayers.filter(g => maxPlayers(g.players) >= 4);
    const pMap = new Map();
    for (const g of withPlayers) { const n = maxPlayers(g.players); bump(pMap, n >= 4 ? '4+' : String(n)); }
    sections.couch = {
        available: multi.length > 0,
        known: withPlayers.length,
        multiplayer: multi.length,
        party: party.length,
        pct: withPlayers.length ? Math.round(multi.length / withPlayers.length * 100) : 0,
        breakdown: ['1', '2', '3', '4+'].map(label => ({ label, value: pMap.get(label) || 0 })).filter(x => x.value > 0),
        picks: party.concat(multi.filter(g => !party.includes(g))).filter(g => g.cover).sort((a, b) => (score(b) || 0) - (score(a) || 0)).slice(0, 8).map(g => tile(g, { players: maxPlayers(g.players) })),
    };

    // ── Ratings ─────────────────────────────────────────────────────────────
    const rated = games.map(g => ({ g, s: score(g) })).filter(x => x.s != null).sort((a, b) => b.s - a.s || clean(a.g.title).localeCompare(clean(b.g.title)));
    sections.ratings = {
        available: rated.length > 0,
        rated: rated.length,
        average: rated.length ? Math.round(rated.reduce((s, x) => s + x.s, 0) / rated.length) : null,
        bands: [['90+', 90, 101], ['80s', 80, 90], ['70s', 70, 80], ['60s', 60, 70], ['<60', 0, 60]].map(([label, lo, hi]) => ({ label, value: rated.filter(x => x.s >= lo && x.s < hi).length })),
        best: rated.slice(0, 6).map(x => tile(x.g, { score: x.s })),
    };

    // ── Decades ─────────────────────────────────────────────────────────────
    const dated = games.map(g => ({ g, y: yearOf(g) })).filter(x => x.y).sort((a, b) => a.y - b.y);
    const dMap = new Map();
    for (const { y } of dated) bump(dMap, `${Math.floor(y / 10) * 10}s`);
    sections.decades = {
        available: dated.length > 0,
        dated: dated.length,
        list: [...dMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
        oldest: dated[0] ? tile(dated[0].g) : null,
        newest: dated.length ? tile(dated[dated.length - 1].g) : null,
        span: dated.length ? dated[dated.length - 1].y - dated[0].y : 0,
    };

    // ── Studios ─────────────────────────────────────────────────────────────
    const devMap = new Map();
    for (const g of games) bump(devMap, clean(String(g.developer || '').split(/[,;]/)[0]));
    const devs = tallyList(devMap, 8);
    sections.studios = { available: devs.length > 0, byCount: devs };

    // ── Playlists ───────────────────────────────────────────────────────────
    const pls = (opts.playlists || []).filter(p => int(p.n) > 0).sort((a, b) => int(b.n) - int(a.n));
    sections.playlists = {
        available: pls.length > 0,
        count: pls.length,
        list: pls.slice(0, 6).map(p => { const g = byId.get(p.first_game_id); return { label: clean(p.name), value: int(p.n), art: g ? tile(g) : null }; }),
    };

    // ── Favourites ──────────────────────────────────────────────────────────
    const favs = games.filter(fav).sort((a, b) => int(b.last_played) - int(a.last_played));
    sections.favourites = { available: favs.length > 0, count: favs.length, games: favs.slice(0, 12).map(g => tile(g)) };

    // ── Clarity, when its library sits beside this one ──────────────────────
    const c = opts.clarity;
    sections.clarity = c && c.games ? { available: true, games: c.games, hours: c.hours || 0, stores: c.stores || [] } : { available: false };

    // Art to decorate with: recently played, favourites, best rated.
    const art = [];
    const add = g => { if (g && (g.hero || g.cover) && !art.some(t => t.id === g.id)) art.push(tile(g)); };
    byLast.slice(0, 12).forEach(add);
    favs.slice(0, 12).forEach(add);
    rated.slice(0, 12).forEach(x => add(x.g));

    return { generatedAt: now, order: SECTION_ORDER.filter(id => sections[id]), sections, art: art.slice(0, 24) };
}

const QUERIES = {
    games: 'SELECT * FROM games',
    systems: 'SELECT id, name, short_name FROM systems',
    playlists: 'SELECT p.id, p.name, COUNT(pg.game_id) AS n, (SELECT pg2.game_id FROM playlist_games pg2 WHERE pg2.playlist_id = p.id ORDER BY pg2.sort_order LIMIT 1) AS first_game_id FROM playlists p LEFT JOIN playlist_games pg ON pg.playlist_id = p.id GROUP BY p.id',
    achievements: 'SELECT * FROM ra_achievements',
};

module.exports = { buildReport, SECTION_ORDER, QUERIES };
