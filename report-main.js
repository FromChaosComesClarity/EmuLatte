'use strict';
/*
 * EmuLatte's library report, main-process half: gathers the data, resolves art and fonts, and
 * turns the rendered document into a web page, a PDF or images. The same pipeline as Clarity's
 * (report/report-main.js there), with EmuLatte's tables and paths.
 *
 * The preview points at art on disk so it redraws instantly; anything saved inlines its art and
 * fonts, scaled to what the layout can show, so it opens anywhere. Images are captured from an
 * offscreen window sized to the exact frame, so a 1080x1350 card is 1080x1350 on any screen.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildReport, QUERIES } = require('./library-report.js');
const { renderReport } = require('./report-render.js');

const FONT_DIR = path.join(__dirname, 'assets', 'fonts');

// Every family the styles can ask for, including the ones "My theme" borrows from EmuLatte's themes.
const FONT_FILES = {
    'Sora': [['Sora.ttf', '100 800']],
    'Fraunces': [['Fraunces.ttf', '100 900']],
    'JetBrains Mono': [['JetBrainsMono-Regular.ttf', 400]],
    'Raleway': [['Raleway-Regular.ttf', 400], ['Raleway-Bold.ttf', 700], ['Raleway-Black.ttf', 900]],
    'Inter': [['Inter.ttf', '100 900']],
    'Chicago': [['ChicagoFLF.ttf', 400]],
    'PxPlus IBM VGA8': [['PxPlusIBMVGA8.ttf', 400]],
    'BigBlue Terminal': [['BigBlueTerminal.ttf', 400]],
    'C64 Pro Mono': [['C64ProMono.ttf', 400]],
    'PressStart2P': [['PressStart2P.ttf', 400]],
};

const SIZES = { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 }, story: { w: 1080, h: 1920 }, landscape: { w: 1600, h: 900 } };
const MAX_WIDTH = { cover: 400, hero: 1500, logo: 820 };

// Clarity's store buckets, restated only as far as a one-card summary needs them.
function storeBucket(store) {
    const s = String(store || '').toLowerCase();
    for (const [needle, label] of [['steam', 'Steam'], ['gog', 'GOG'], ['epic', 'Epic'], ['itch', 'itch.io'], ['flatpak', 'Flatpak'], ['pico', 'PICO-8'], ['emulation', 'Emulation'], ['physical', 'Physical']])
        if (s.includes(needle)) return label;
    return 'Others';
}

function registerReportIpc({ ipcMain, getDb, baseDir, BrowserWindow, dialog, nativeImage }) {
    const dataUrlCache = new Map();
    const fontCache = new Map();

    const resolveArt = raw => {
        if (!raw) return null;
        const p = String(raw);
        if (/^https?:/i.test(p)) return null;                        // a saved report never reaches the network
        const abs = path.isAbsolute(p) ? p : path.join(baseDir, p);
        return fs.existsSync(abs) ? abs : null;
    };

    const inlineArt = (abs, kind) => {
        const key = `${abs}|${kind}`;
        if (dataUrlCache.has(key)) return dataUrlCache.get(key);
        let out = '';
        try {
            let im = nativeImage.createFromPath(abs);
            if (!im.isEmpty()) {
                const max = MAX_WIDTH[kind] || 1200;
                if (im.getSize().width > max) im = im.resize({ width: max, quality: 'best' });
                out = kind === 'logo' ? `data:image/png;base64,${im.toPNG().toString('base64')}`
                    : `data:image/jpeg;base64,${im.toJPEG(80).toString('base64')}`;
            } else {
                const mime = { webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' }[path.extname(abs).slice(1).toLowerCase()];
                if (mime) out = `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
            }
        } catch { out = ''; }
        dataUrlCache.set(key, out);
        return out;
    };

    const fontsFor = inline => {
        const out = {};
        for (const [family, files] of Object.entries(FONT_FILES)) {
            out[family] = files.map(([file, weight]) => {
                const abs = path.join(FONT_DIR, file);
                if (!inline) return { weight, data: pathToFileURL(abs).href };
                if (!fontCache.has(abs)) fontCache.set(abs, `data:font/ttf;base64,${fs.readFileSync(abs).toString('base64')}`);
                return { weight, data: fontCache.get(abs) };
            });
        }
        return out;
    };

    // Clarity keeps its library one folder up from EmuLatte's. Read-only, and optional.
    function claritySummary() {
        const file = path.join(baseDir, 'GameManagerConfig', 'games.db');
        if (!fs.existsSync(file)) return null;
        try {
            const Database = require('better-sqlite3');
            const c = new Database(file, { readonly: true, fileMustExist: true });
            try {
                const hidePico = c.prepare("SELECT value FROM settings WHERE key='hide_pico8'").get()?.value === '1';
                const rows = c.prepare("SELECT Store, Playtime FROM games WHERE IFNULL(Game,'') <> '' AND Game <> 'null' AND IFNULL(Hidden,0) <> 1").all()
                    .filter(r => !(hidePico && /pico/i.test(r.Store || '')));
                const stores = new Map();
                for (const r of rows) stores.set(storeBucket(r.Store), (stores.get(storeBucket(r.Store)) || 0) + 1);
                return {
                    games: rows.length,
                    hours: Math.round(rows.reduce((s, r) => s + (parseInt(r.Playtime, 10) || 0), 0) / 60),
                    stores: [...stores].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
                };
            } finally { c.close(); }
        } catch { return null; }
    }

    function gather(prefs = {}) {
        const db = getDb();
        if (!db) throw new Error('Library not ready.');
        const read = sql => { try { return db.prepare(sql).all(); } catch { return []; } };
        return buildReport(read(QUERIES.games), {
            systems: read(QUERIES.systems), playlists: read(QUERIES.playlists), achievements: read(QUERIES.achievements),
            clarity: claritySummary(), recentDays: Number(prefs.recentDays) || 30,
        });
    }

    function render(report, prefs, { layout, inline, only }) {
        return renderReport(report, {
            layout, only, dedupe: inline,
            style: prefs.style || 'emulatte', theme: prefs.theme || {},
            size: SIZES[prefs.size] || SIZES.portrait,
            sections: Array.isArray(prefs.sections) ? prefs.sections : undefined,
            title: prefs.title || '', subtitle: prefs.subtitle || '', lang: 'en',
            fonts: fontsFor(inline),
            img: (raw, kind) => { const abs = resolveArt(raw); return !abs ? '' : inline ? inlineArt(abs, kind) : pathToFileURL(abs).href; },
        });
    }

    ipcMain.handle('report-sections', (_e, prefs) => {
        try {
            const report = gather(prefs || {});
            return { ok: true, sections: report.order.map(id => ({ id, available: !!report.sections[id].available })) };
        } catch (e) { return { ok: false, error: e.message }; }
    });

    ipcMain.handle('report-preview', (_e, prefs = {}) => {
        try {
            const report = gather(prefs);
            const layout = prefs.layout === 'cards' ? 'cards-strip' : prefs.layout === 'poster' ? 'poster' : 'document';
            return { ok: true, html: render(report, prefs, { layout, inline: false }), size: SIZES[prefs.size] || SIZES.portrait };
        } catch (e) { return { ok: false, error: e.message }; }
    });

    const stamp = () => new Date().toISOString().slice(0, 10);
    const safeName = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

    async function loadAndSettle(win, file) {
        await win.loadFile(file);
        await win.webContents.executeJavaScript(`(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        })()`);
    }

    const SECTION_NAMES = { overview: 'The library', systems: 'Systems', recent: 'Lately', genres: 'Genres', achievements: 'RetroAchievements', couch: 'Couch co-op', ratings: 'Ratings', decades: 'Across the decades', studios: 'Studios', playlists: 'Playlists', favourites: 'Favourites', clarity: 'Clarity' };

    ipcMain.handle('report-export', async (event, prefs = {}, format) => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        let tmp = null, work = null;
        try {
            const report = gather(prefs);
            const base = safeName(prefs.title) || 'EmuLatte Report';

            if (format === 'html' || format === 'pdf') {
                const html = render(report, prefs, { layout: 'document', inline: true });
                const ext = format;
                const { canceled, filePath } = await dialog.showSaveDialog(parent, {
                    defaultPath: `${base} ${stamp()}.${ext}`, filters: [{ name: format === 'html' ? 'Web page' : 'PDF', extensions: [ext] }] });
                if (canceled || !filePath) return { ok: false, canceled: true };
                if (format === 'html') { fs.writeFileSync(filePath, html); return { ok: true, path: filePath }; }
                tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emulatte-report-'));
                const file = path.join(tmp, 'report.html');
                fs.writeFileSync(file, html);
                work = new BrowserWindow({ show: false, width: 1180, height: 1600, webPreferences: { offscreen: true } });
                await loadAndSettle(work, file);
                // 72% so A4 lays out at desktop width and the two-column sections survive.
                fs.writeFileSync(filePath, await work.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, scale: 0.72 }));
                return { ok: true, path: filePath };
            }

            if (format === 'png') {
                const size = SIZES[prefs.size] || SIZES.portrait;
                const poster = prefs.layout === 'poster';
                const picked = (Array.isArray(prefs.sections) ? prefs.sections : report.order).filter(id => report.sections[id] && report.sections[id].available);
                if (!picked.length) return { ok: false, error: 'nothing_selected' };
                let target;
                if (poster) {
                    const { canceled, filePath } = await dialog.showSaveDialog(parent, { defaultPath: `${base} ${stamp()}.png`, filters: [{ name: 'PNG image', extensions: ['png'] }] });
                    if (canceled || !filePath) return { ok: false, canceled: true };
                    target = filePath;
                } else {
                    const { canceled, filePaths } = await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] });
                    if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
                    target = path.join(filePaths[0], `${base} ${stamp()}`);
                    fs.mkdirSync(target, { recursive: true });
                }
                tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emulatte-report-'));
                work = new BrowserWindow({ show: false, useContentSize: true, width: size.w, height: size.h, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
                work.webContents.setFrameRate(30);
                const capture = async (html, out) => {
                    const file = path.join(tmp, 'frame.html');
                    fs.writeFileSync(file, html);
                    await loadAndSettle(work, file);
                    let image = await work.webContents.capturePage();
                    const got = image.getSize();
                    if (got.width !== size.w || got.height !== size.h) image = image.resize({ width: size.w, height: size.h, quality: 'best' });
                    fs.writeFileSync(out, image.toPNG());
                };
                if (poster) { await capture(render(report, prefs, { layout: 'poster', inline: true }), target); return { ok: true, path: target }; }
                for (let i = 0; i < picked.length; i++) {
                    await capture(render(report, { ...prefs, sections: picked }, { layout: 'cards', inline: true, only: i }),
                        path.join(target, `${String(i + 1).padStart(2, '0')} ${safeName(SECTION_NAMES[picked[i]] || picked[i])}.png`));
                }
                return { ok: true, path: target, count: picked.length };
            }
            return { ok: false, error: `Unknown format "${format}".` };
        } catch (e) {
            return { ok: false, error: e.message };
        } finally {
            try { if (work && !work.isDestroyed()) work.destroy(); } catch {}
            try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        }
    });
}

module.exports = { registerReportIpc, SIZES };
