// ── ROM VARIANTS ──────────────────────────────────────────────────────────────
// Scraping replaces a ROM's filename with the canonical game name, which is the right thing to
// do until a system holds three of the same game. A Master System library has
//
//   Action Fighter.zip
//   Action Fighter (USA, Europe) (v1.2).zip
//   Action Fighter (Japan, Europe) (Rev 1) [T-BR] [T-Patryck] [V-1.0 A-2016].zip
//
// and after a scrape all three are "Action Fighter" with the same cover. Everything that told
// them apart was in the filename, so that is where it is read back from.
//
// The filename conventions are No-Intro's parentheses and GoodTools' brackets, with TOSEC and a
// long tail of scene tags mixed in. Across a 32,829-game library there are 1,339 distinct tags,
// most of them noise: dump dates, shop names, the handle of whoever made a translation patch.
// So tags are *classified* rather than printed. Anything unrecognised is dropped, which is what
// keeps the label short and stops "[T-Patryck]" or "[V-1.0 A-2016]" from reaching the interface.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RomVariant = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    const REGIONS = {
        usa: 'USA', u: 'USA', us: 'USA', america: 'USA', 'north america': 'USA',
        europe: 'Europe', e: 'Europe', eu: 'Europe', eur: 'Europe', pal: 'Europe',
        japan: 'Japan', j: 'Japan', jp: 'Japan', jpn: 'Japan', ntsc: 'NTSC',
        world: 'World', w: 'World',
        korea: 'Korea', k: 'Korea', kor: 'Korea',
        brazil: 'Brazil', b: 'Brazil', br: 'Brazil',
        china: 'China', c: 'China', chn: 'China', taiwan: 'Taiwan', tw: 'Taiwan',
        'hong kong': 'Hong Kong', hk: 'Hong Kong',
        asia: 'Asia', australia: 'Australia', a: 'Australia', au: 'Australia',
        canada: 'Canada', ca: 'Canada', uk: 'UK', 'united kingdom': 'UK',
        france: 'France', f: 'France', fr: 'France',
        germany: 'Germany', g: 'Germany', de: 'Germany',
        spain: 'Spain', s: 'Spain', es: 'Spain',
        italy: 'Italy', i: 'Italy', it: 'Italy',
        netherlands: 'Netherlands', nl: 'Netherlands', holland: 'Netherlands',
        sweden: 'Sweden', sw: 'Sweden', denmark: 'Denmark', norway: 'Norway', finland: 'Finland',
        scandinavia: 'Scandinavia', russia: 'Russia', ru: 'Russia', poland: 'Poland',
        portugal: 'Portugal', greece: 'Greece', mexico: 'Mexico', argentina: 'Argentina',
        'latin america': 'Latin America', israel: 'Israel', india: 'India',
        'south africa': 'South Africa', unknown: 'Unknown', unk: 'Unknown',
    };

    // Tags that say what KIND of release this is. The label is worth more than the region here:
    // a prototype is a different thing to play, not merely a different territory.
    const STATUS = {
        beta: 'Beta', proto: 'Prototype', prototype: 'Prototype', sample: 'Sample',
        demo: 'Demo', kiosk: 'Kiosk', promo: 'Promo', preview: 'Preview',
        unl: 'Unlicensed', unlicensed: 'Unlicensed', pirate: 'Pirate', aftermarket: 'Aftermarket',
        homebrew: 'Homebrew', hack: 'Hack', trainer: 'Trained', cracked: 'Cracked',
        alt: 'Alt', alternate: 'Alt', 'bad dump': 'Bad dump', overdump: 'Overdump',
        fixed: 'Fixed', 'public domain': 'Public domain', pd: 'Public domain',
        enhanced: 'Enhanced', 'debug version': 'Debug', competition: 'Competition',
    };

    // GoodTools single-letter bracket codes, e.g. [a1] [h2] [b] [o1] [f1] [t1] [!]
    const GOOD_CODES = { a: 'Alt', h: 'Hack', b: 'Bad dump', o: 'Overdump', f: 'Fixed',
                         t: 'Trained', p: 'Pirate', cr: 'Cracked' };

    const LANG_NAMES = {
        en: 'English', eng: 'English', ja: 'Japanese', jap: 'Japanese', jp: 'Japanese',
        fr: 'French', fre: 'French', de: 'German', ger: 'German', es: 'Spanish', spa: 'Spanish',
        it: 'Italian', ita: 'Italian', nl: 'Dutch', dut: 'Dutch', pt: 'Portuguese',
        'pt-br': 'Portuguese (BR)', br: 'Portuguese (BR)', ptbr: 'Portuguese (BR)',
        sv: 'Swedish', swe: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
        ru: 'Russian', rus: 'Russian', pl: 'Polish', pol: 'Polish', ko: 'Korean', kor: 'Korean',
        zh: 'Chinese', chs: 'Chinese (Simp.)', cht: 'Chinese (Trad.)', tr: 'Turkish',
        cs: 'Czech', hu: 'Hungarian', el: 'Greek', he: 'Hebrew', ar: 'Arabic', ca: 'Catalan',
    };

    const stripExt  = (s) => String(s || '').replace(/\.[^.\/]+$/, '');
    const baseName  = (s) => String(s || '').split(/[\\\/]/).pop();
    const norm      = (s) => String(s || '').trim().toLowerCase();

    // Every (...) and [...] group, in order, with the brackets recorded: GoodTools means
    // something different by [a1] than No-Intro means by (a1).
    function rawTags(filename) {
        const out = [];
        for (const m of stripExt(baseName(filename)).matchAll(/([(\[])([^)\]]*)[)\]]/g))
            out.push({ square: m[1] === '[', text: m[2].trim() });
        return out.filter(t => t.text);
    }

    function parseRomTags(filename) {
        const res = { regions: [], revision: '', status: [], translation: '', languages: [], unknown: [] };
        const seen = new Set();
        const addRegion = (r) => { if (!res.regions.includes(r)) res.regions.push(r); };
        const addStatus = (s) => { if (!res.status.includes(s)) res.status.push(s); };

        for (const { square, text } of rawTags(filename)) {
            const t = norm(text);
            if (seen.has(square + t)) continue;
            seen.add(square + t);

            // Translation: [T+Eng], [T-BR], [T+Eng1.1]. The '+' / '-' is "current" vs "outdated"
            // in GoodTools, which is not worth surfacing; the target language is.
            // Only a code that is actually a language. "[T-Patryck]" is the handle of whoever
            // made the patch and matches this shape too, so an unknown word longer than a code
            // is left alone rather than printed as if it were a language.
            const tr = /^t([+-])\s*([a-z-]{2,8})/i.exec(text);
            if (square && tr) {
                const code = norm(tr[2]);
                if (LANG_NAMES[code]) { if (!res.translation) res.translation = LANG_NAMES[code]; continue; }
                if (code.length <= 3) { if (!res.translation) res.translation = code.toUpperCase(); continue; }
                res.unknown.push(text);
                continue;
            }
            // Revision / version: (Rev 1), (Rev A), (v1.2), (Version 1.1), (PRG1)
            const rev = /^(?:rev(?:ision)?\s*([0-9a-z]+)|v(?:ersion)?\s*([0-9][0-9a-z.]*)|(prg[0-9]+))$/i.exec(text);
            if (rev) {
                if (!res.revision) res.revision = rev[1] ? `Rev ${rev[1].toUpperCase()}`
                                                 : rev[2] ? `v${rev[2]}`
                                                 : rev[3].toUpperCase();
                continue;
            }
            if (STATUS[t]) { addStatus(STATUS[t]); continue; }
            // [a1] [h2] [b] [o] [f1] [t1] and plain [!]
            if (square) {
                const gc = /^([a-z]{1,2})([0-9]*)$/i.exec(text);
                if (gc && GOOD_CODES[norm(gc[1])]) { addStatus(GOOD_CODES[norm(gc[1])]); continue; }
                if (text === '!') continue;                       // "verified good dump": says nothing new
            }
            // A comma list is either regions (USA, Europe) or languages (En,Fr,De,Es,It).
            if (t.includes(',')) {
                const parts = t.split(',').map(x => x.trim()).filter(Boolean);
                if (parts.length && parts.every(x => REGIONS[x])) { parts.forEach(x => addRegion(REGIONS[x])); continue; }
                if (parts.length && parts.every(x => LANG_NAMES[x])) {
                    res.languages = parts.map(x => LANG_NAMES[x]); continue;
                }
            }
            if (REGIONS[t])   { addRegion(REGIONS[t]); continue; }
            if (LANG_NAMES[t]) { if (!res.languages.length) res.languages = [LANG_NAMES[t]]; continue; }
            res.unknown.push(text);
        }
        return res;
    }

    // Short, human, and in the order that tells two releases apart fastest. Everything
    // unclassified is left out on purpose.
    function variantLabel(filename, opts = {}) {
        const t = parseRomTags(filename);
        const parts = [];
        if (t.regions.length)  parts.push(t.regions.join('/'));
        if (t.revision)        parts.push(t.revision);
        if (t.status.length)   parts.push(t.status.join(', '));
        if (t.translation)     parts.push(`${t.translation} translation`);
        // Languages only when nothing better was found: most releases list them and it is noise.
        if (!parts.length && t.languages.length) parts.push(t.languages.slice(0, 3).join('/'));
        const max = opts.max || 3;
        return parts.slice(0, max).join(' · ');
    }

    // Two files are the same release when everything classified about them matches. Used to tell
    // a genuine duplicate from a different region or revision, so nothing irreplaceable is
    // offered up for deletion as "a duplicate".
    function variantKey(filename) {
        const t = parseRomTags(filename);
        return JSON.stringify([t.regions.slice().sort(), t.revision, t.status.slice().sort(),
                               t.translation, t.languages.slice().sort()]);
    }

    return { parseRomTags, variantLabel, variantKey, rawTags, stripExt, baseName };
});
