// The library layer, exercised end to end against a real SQLite database and a real folder
// tree in /tmp. Run it with:  npm test
//
// better-sqlite3 is built against Electron's ABI, so the runner is Electron with
// ELECTRON_RUN_AS_NODE=1, because plain `node` cannot load it.
const fs = require('fs'), path = require('path'), os = require('os');
const Database = require('better-sqlite3');
const REPO = path.join(__dirname, '..');
const romLib = require(path.join(REPO, 'rom-library.js'));
const presets = JSON.parse(fs.readFileSync(path.join(REPO, 'assets/systems.json'), 'utf8'));
const biosDb  = JSON.parse(fs.readFileSync(path.join(REPO, 'assets/bios_db.json'), 'utf8'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'el-test-'));
const cfg  = path.join(root, 'Emulatte_Stuff');
fs.mkdirSync(cfg, { recursive: true });

const db = new Database(path.join(cfg, 'emulatte.db'));
db.pragma('journal_mode = WAL');
db.prepare(`CREATE TABLE systems (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, short_name TEXT,
  folder TEXT, extensions TEXT, default_core TEXT, default_emulator TEXT, launch_template TEXT, screenscraper_id INTEGER)`).run();
db.prepare(`CREATE TABLE games (id INTEGER PRIMARY KEY AUTOINCREMENT, system_id INTEGER, title TEXT NOT NULL,
  rom_path TEXT, cover TEXT, hero TEXT, logo TEXT, screenshot TEXT, description TEXT,
  screenscraper_id INTEGER, ra_game_id INTEGER, last_played INTEGER DEFAULT 0,
  fav INTEGER DEFAULT 0, want INTEGER DEFAULT 0, launch_override TEXT, core_override TEXT)`).run();
db.prepare(`CREATE TABLE playlist_games (playlist_id INTEGER, game_id INTEGER, sort_order INTEGER DEFAULT 0)`).run();
db.prepare(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`).run();

let inserted = 0, deleted = 0;
const lib = romLib.createLibrary({
  getDb: () => db, configDir: cfg, presets, biosDb,
  insertGame: d => { inserted++; return db.prepare('INSERT INTO games (system_id,title,rom_path) VALUES (?,?,?)').run(d.system_id, d.title, d.rom_path).lastInsertRowid; },
  deleteGame: id => { deleted++; db.prepare('DELETE FROM games WHERE id=?').run(id); return true; },
  raCfg: { ensure: () => path.join(cfg, 'retroarch', 'emulatte-retroarch.cfg'), parse: () => ({}), writeKeys: (f, u) => { fs.mkdirSync(path.dirname(f), {recursive:true}); fs.appendFileSync(f, Object.entries(u).map(([k,v])=>`${k} = "${v}"`).join('\n')+'\n'); } },
  log: m => console.log('   [lib]', m),
});

let fails = 0;
const ok = (cond, label, extra) => { console.log(`${cond ? ' ✓' : ' ✗'} ${label}${extra !== undefined && !cond ? '  → ' + JSON.stringify(extra) : ''}`); if (!cond) fails++; };

console.log('\n── seeding ──');
const seed = lib.seedSystems();
ok(seed.inserted === 56, `all 56 systems seeded (got ${seed.inserted})`);
ok(db.prepare('SELECT COUNT(*) n FROM systems WHERE folder IS NULL OR folder=\'\'').get().n === 0, 'every system has a folder');
ok(lib.seedSystems().inserted === 0, 'seeding twice inserts nothing');

console.log('\n── folders ──');
const ens = lib.ensureFolders();
ok(ens.ok && ens.created.length === 56, `56 folders created (got ${ens.created && ens.created.length})`);
ok(fs.existsSync(path.join(lib.romsRoot(), 'megadrive', 'systeminfo.txt')), 'megadrive/systeminfo.txt written');
ok(fs.existsSync(path.join(lib.romsRoot(), 'README.txt')), 'ROMS/README.txt written');
ok(fs.existsSync(lib.biosRoot()), 'BIOS folder created');
ok(path.basename(lib.romsRoot()) === 'ROMS' && lib.romsRoot().startsWith(cfg), 'ROMS sits inside Emulatte_Stuff');

console.log('\n── a collection on disk ──');
const R = lib.romsRoot();
const put = (rel, body = 'x') => { const f = path.join(R, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };
put('nes/Castlevania (USA).nes');
put('nes/homebrew/Alter Ego.nes');                       // sub-folder
put('megadrive/Sonic.bin');                              // a standalone .bin IS a Mega Drive game
put('megadrive/Altered Beast.zip');
put('psx/Final Fantasy VII (Disc 1).cue', 'FILE "ff7d1.bin" BINARY\n');
put('psx/ff7d1.bin');
put('psx/Final Fantasy VII (Disc 2).cue', 'FILE "ff7d2.bin" BINARY\n');
put('psx/ff7d2.bin');
put('psx/Crash Bandicoot.cue', 'FILE "Crash Bandicoot.bin" BINARY\n');
put('psx/Crash Bandicoot.bin');
put('psx/Loose Track.bin');                              // no .cue anywhere → a game in its own right
put('mastersystem/Alex Kidd.zip');                       // alias folder for sms (primary is mastersystem)
fs.mkdirSync(path.join(R, 'genesis'), { recursive: true });
put('genesis/Golden Axe.zip');                           // Batocera/RetroPie name for megadrive
put('snes/notes.txt');                                   // wrong extension → ignored

const r1 = lib.scan();
const rows = db.prepare('SELECT g.title, g.rom_path, s.short_name FROM games g JOIN systems s ON s.id=g.system_id ORDER BY s.short_name, g.title').all();
console.log(rows.map(r => `   ${r.short_name.padEnd(12)} ${r.title}`).join('\n'));
ok(r1.ok, 'scan ran');
ok(r1.added === 9, `9 games added (got ${r1.added})`, rows);
const titles = rows.map(r => r.title);
ok(titles.includes('Sonic'), 'a standalone .bin is a Mega Drive game');
ok(titles.includes('Loose Track'), 'an unreferenced .bin is a game');
ok(!titles.includes('ff7d1') && !titles.includes('Crash Bandicoot.bin'), 'tracks named by a .cue are not games');
ok(titles.includes('Final Fantasy VII'), 'a multi-disc set is one entry');
const ff7 = rows.find(r => r.title === 'Final Fantasy VII');
ok(ff7 && ff7.rom_path.endsWith('.m3u') && fs.existsSync(ff7.rom_path), 'the multi-disc entry points at a generated .m3u');
ok(titles.includes('Alex Kidd'), 'the sms folder is read');
ok(titles.includes('Golden Axe'), 'the genesis alias folder is read for Mega Drive');
ok(rows.filter(r => r.short_name === 'genesis').length === 3, 'Sonic, Altered Beast and Golden Axe all land on Mega Drive');
ok(titles.includes('Alter Ego'), 'a sub-folder inside a system folder is read');
ok(!titles.includes('notes'), 'a file with the wrong extension is ignored');

console.log('\n── scanning again changes nothing ──');
const r2 = lib.scan();
ok(r2.added === 0 && r2.removed === 0, `idempotent (got +${r2.added} -${r2.removed})`);

console.log('\n── a ROM taken off the disk ──');
fs.unlinkSync(path.join(R, 'nes/Castlevania (USA).nes'));
const r3 = lib.scan();
ok(r3.removed === 1 && r3.added === 0, `the row goes with the file (got +${r3.added} -${r3.removed})`);
ok(!db.prepare('SELECT 1 FROM games WHERE title=?').get('Castlevania (USA)'), 'Castlevania is out of the library');

console.log('\n── a game outside the ROMS folder is never pruned ──');
const away = path.join(root, 'elsewhere', 'n64');
fs.mkdirSync(away, { recursive: true });
fs.writeFileSync(path.join(away, 'Mario 64.z64'), 'x');
const n64 = db.prepare("SELECT id FROM systems WHERE short_name='n64'").get().id;
db.prepare('INSERT INTO games (system_id,title,rom_path) VALUES (?,?,?)').run(n64, 'Mario 64', path.join(away, 'Mario 64.z64'));
fs.writeFileSync(path.join(away, 'Zelda OOT.z64'), 'x');
const r4 = lib.scan();
ok(r4.added === 1, `a sibling of an outside game is picked up (got ${r4.added})`);
fs.unlinkSync(path.join(away, 'Mario 64.z64'));
const r5 = lib.scan();
ok(r5.removed === 0, `an outside game whose file is gone is left alone (got -${r5.removed})`);

console.log('\n── the same game in a new place is adopted, not duplicated ──');
// The case that matters: a collection on a drive that is no longer plugged in, then copied into
// the ROMS folder. The scraped row must be re-pointed at the copy, not shadowed by a bare one.
{
  const nes = db.prepare("SELECT id FROM systems WHERE short_name='nes'").get().id;
  const dead = '/nowhere/unplugged/roms/nes/Adopt Me (USA).nes';
  const id = db.prepare("INSERT INTO games (system_id,title,rom_path,cover,description,screenscraper_id,fav,last_played) VALUES (?,?,?,?,?,?,1,12345)")
    .run(nes, 'Adopt Me', dead, '/art/covers/adopt.jpg', 'A scraped description.', 999).lastInsertRowid;
  const before = db.prepare('SELECT COUNT(*) n FROM games').get().n;
  put('nes/Adopt Me (USA).nes');
  const r = lib.scan();
  const row = db.prepare('SELECT * FROM games WHERE id=?').get(id);
  ok(r.added === 0, `nothing was imported (got ${r.added})`);
  ok(r.adopted === 1 && r.revived === 1, `one row adopted and revived (got ${r.adopted}/${r.revived})`);
  ok(db.prepare('SELECT COUNT(*) n FROM games').get().n === before, 'the library did not grow');
  ok(row.rom_path === path.join(R, 'nes', 'Adopt Me (USA).nes'), 'it points at the file in the ROMS folder', row.rom_path);
  ok(fs.existsSync(row.rom_path), 'and that file is really there, so the game is playable again');
  ok(row.cover === '/art/covers/adopt.jpg' && row.description === 'A scraped description.'
     && row.screenscraper_id === 999 && row.fav === 1 && row.last_played === 12345,
     'the art, description, scrape id, favourite and play history all survived', row);
  ok(lib.scan().adopted === 0, 'scanning again adopts nothing further');
}

console.log('\n── a duplicate that already exists is folded back in ──');
// The state an earlier scan could leave behind: the scraped row on the dead path, plus a bare
// row on the copy. The bare one goes and the scraped one takes over its file.
{
  const nes = db.prepare("SELECT id FROM systems WHERE short_name='nes'").get().id;
  const dead = '/nowhere/unplugged/roms/nes/Dupe Me (USA).nes';
  const file = put('nes/Dupe Me (USA).nes');
  const rich = db.prepare("INSERT INTO games (system_id,title,rom_path,cover,screenscraper_id) VALUES (?,?,?,?,?)")
    .run(nes, 'Dupe Me', dead, '/art/covers/dupe.jpg', 777).lastInsertRowid;
  const bare = db.prepare("INSERT INTO games (system_id,title,rom_path) VALUES (?,?,?)")
    .run(nes, 'dupe me (usa)', file).lastInsertRowid;
  const r = lib.scan();
  ok(r.merged === 1, `one duplicate merged (got ${r.merged})`);
  ok(!db.prepare('SELECT 1 FROM games WHERE id=?').get(bare), 'the bare row is gone');
  const kept = db.prepare('SELECT * FROM games WHERE id=?').get(rich);
  ok(!!kept, 'the scraped row is the one that survived');
  ok(kept.rom_path === file, 'and it now points at the file that exists', kept.rom_path);
  ok(kept.cover === '/art/covers/dupe.jpg' && kept.screenscraper_id === 777, 'with its art and scrape id intact');
}

console.log('\n── two rows that both hold something are never merged ──');
{
  const snes = db.prepare("SELECT id FROM systems WHERE short_name='snes'").get().id;
  const f = put('snes/Both Rich.sfc');
  const a = db.prepare("INSERT INTO games (system_id,title,rom_path,cover) VALUES (?,?,?,?)")
    .run(snes, 'Both Rich A', '/elsewhere/snes/Both Rich.sfc', '/art/a.jpg').lastInsertRowid;
  const b = db.prepare("INSERT INTO games (system_id,title,rom_path,description) VALUES (?,?,?,?)")
    .run(snes, 'Both Rich B', f, 'has a description').lastInsertRowid;
  const r = lib.scan();
  ok(db.prepare('SELECT 1 FROM games WHERE id=?').get(a) && db.prepare('SELECT 1 FROM games WHERE id=?').get(b),
     'both rows are still there, the choice left to the user');
  ok(r.merged === 0, `nothing was merged (got ${r.merged})`);
}

console.log('\n── a playlist link alone is enough to protect a row ──');
{
  const gb = db.prepare("SELECT id FROM systems WHERE short_name='gb'").get().id;
  const f = put('gb/Protected.gb');
  const inPlaylist = db.prepare("INSERT INTO games (system_id,title,rom_path) VALUES (?,?,?)")
    .run(gb, 'Protected', f).lastInsertRowid;
  db.prepare('INSERT INTO playlist_games (playlist_id, game_id) VALUES (1, ?)').run(inPlaylist);
  const other = db.prepare("INSERT INTO games (system_id,title,rom_path) VALUES (?,?,?)")
    .run(gb, 'Protected copy', '/elsewhere/gb/Protected.gb').lastInsertRowid;
  lib.scan();
  ok(!!db.prepare('SELECT 1 FROM games WHERE id=?').get(inPlaylist), 'a row someone put in a playlist is kept');
}

console.log('\n── an unmounted ROMS folder empties nothing ──');
const before = db.prepare('SELECT COUNT(*) n FROM games').get().n;
lib.setRomsRoot(path.join(root, 'not-mounted'));
const r6 = lib.scan();
ok(db.prepare('SELECT COUNT(*) n FROM games').get().n === before, 'the library survives a missing ROMS folder');
ok(r6.rootExists === false, 'the scan says the folder is not there');
lib.setRomsRoot('');

console.log('\n── a system the user deleted stays deleted ──');
const wii = db.prepare("SELECT id FROM systems WHERE short_name='wii'").get().id;
db.prepare('DELETE FROM systems WHERE id=?').run(wii);
lib.dismiss('wii');
lib.seedSystems();
ok(!db.prepare("SELECT 1 FROM systems WHERE short_name='wii'").get(), 'seeding does not hand it back');
lib.undismissAll(); lib.seedSystems();
ok(!!db.prepare("SELECT 1 FROM systems WHERE short_name='wii'").get(), 'Restore Default Systems brings it back');

console.log('\n── BIOS ──');
const B = lib.biosRoot();
fs.mkdirSync(path.join(B, 'sony'), { recursive: true });
// scph5500.bin, by name only (its md5 will not match, so it is "present", not "verified")
fs.writeFileSync(path.join(B, 'sony', 'scph5500.bin'), 'not the real bios');
fs.writeFileSync(path.join(B, 'random-notes.txt'), 'hello');
const bs = lib.biosScan();
ok(bs.filed.some(f => f.to === 'scph5500.bin'), 'a BIOS file in a sub-folder is filed at the root under its expected name', bs.filed);
ok(fs.existsSync(path.join(B, 'scph5500.bin')), 'scph5500.bin is where a core will look');
const st = lib.biosStatus('ps1');
ok(st.files.find(f => f.file === 'scph5500.bin')?.status === 'present', 'status reads the BIOS folder', st.files);
ok(st.systemDir === B, 'BIOS status points at the BIOS folder');
const ov = lib.biosOverview();
ok(ov.ok && ov.systems.length > 0, `overview covers ${ov.systems.length} systems`);

console.log('\n── the folder report ──');
const rep = lib.folderReport();
ok(rep.ok && rep.systems.length === 56, `56 systems reported (got ${rep.systems.length})`);
ok(rep.isDefaultRoot === true, 'the default root is recognised as default');
const mdRow = rep.systems.find(r => r.short_name === 'genesis');
ok(mdRow.folder === 'megadrive' && mdRow.extras.includes('genesis'), 'Mega Drive reports its folder and the alias in use', mdRow);

console.log('\n── moving home ──');
const b2 = fs.mkdtempSync(path.join(os.tmpdir(), 'el-home-'));
const legacy = path.join(b2, 'GameManagerConfig', 'EmuLatte');
fs.mkdirSync(path.join(legacy, 'images', 'covers'), { recursive: true });
fs.writeFileSync(path.join(legacy, 'emulatte.db'), 'db');
fs.writeFileSync(path.join(legacy, 'images', 'covers', 'a.jpg'), 'img');
const newHome = path.join(b2, 'Emulatte_Stuff');
const mv = romLib.migrateHomeOnDisk(b2, newHome, m => console.log('   [home]', m));
ok(mv.moved === true, 'the old folder is moved');
ok(fs.existsSync(path.join(newHome, 'emulatte.db')) && fs.existsSync(path.join(newHome, 'images', 'covers', 'a.jpg')), 'everything came with it');
ok(!fs.existsSync(legacy), 'the old folder is gone');
ok(romLib.migrateHomeOnDisk(b2, newHome).moved === false, 'a second run does nothing');

// ⚠️ The sibling app's folder is NOT ours. Only the EmuLatte sub-folder inside it may move;
// GameManagerConfig itself, and everything else in it, has to come out untouched.
const b3 = fs.mkdtempSync(path.join(os.tmpdir(), 'el-sibling-'));
const gmc = path.join(b3, 'GameManagerConfig');
fs.mkdirSync(path.join(gmc, 'EmuLatte'), { recursive: true });
fs.mkdirSync(path.join(gmc, 'images', 'covers'), { recursive: true });
fs.mkdirSync(path.join(gmc, 'couch_wallpapers'), { recursive: true });
fs.writeFileSync(path.join(gmc, 'games.db'), 'SIBLING-LIBRARY');
fs.writeFileSync(path.join(gmc, 'audio.json'), '{"vol":1}');
fs.writeFileSync(path.join(gmc, 'images', 'covers', 'theirs.jpg'), 'THEIR-COVER');
fs.writeFileSync(path.join(gmc, 'couch_wallpapers', 'wall.jpg'), 'THEIR-WALL');
fs.writeFileSync(path.join(gmc, 'EmuLatte', 'emulatte.db'), 'OUR-DB');
const fingerprint = (dir) => {
    const out = [];
    (function walk(d, rel) {
        for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (r === 'EmuLatte' || r.startsWith('EmuLatte/')) continue;   // ours, it is allowed to move
            if (e.isDirectory()) { out.push('d ' + r); walk(path.join(d, e.name), r); }
            else out.push('f ' + r + ' = ' + fs.readFileSync(path.join(d, e.name), 'utf8'));
        }
    })(dir, '');
    return out.join('\n');
};
const before3 = fingerprint(gmc);
romLib.migrateHomeOnDisk(b3, path.join(b3, 'Emulatte_Stuff'), () => {});
ok(fs.existsSync(gmc) && fs.statSync(gmc).isDirectory(), 'GameManagerConfig is still there, still a directory');
ok(fingerprint(gmc) === before3, "nothing of the sibling app's changed", { before: before3, after: fingerprint(gmc) });
ok(!fs.existsSync(path.join(gmc, 'EmuLatte')), 'only the EmuLatte sub-folder moved out');
ok(fs.readFileSync(path.join(b3, 'Emulatte_Stuff', 'emulatte.db'), 'utf8') === 'OUR-DB', 'and it arrived intact');
ok(fs.readFileSync(path.join(gmc, 'games.db'), 'utf8') === 'SIBLING-LIBRARY', "the sibling's database is byte-for-byte untouched");
ok(!fs.existsSync(path.join(b3, 'GameManagerConfig.moved-to-Emulatte_Stuff')), 'the parent folder is never given a moved marker');
fs.rmSync(b3, { recursive: true, force: true });

const db2 = new Database(path.join(b2, 't.db'));
db2.prepare('CREATE TABLE games (id INTEGER PRIMARY KEY, rom_path TEXT)').run();
db2.prepare('INSERT INTO games (id, rom_path) VALUES (1, ?)').run('/home/x/Games/CNGM/GameManagerConfig/EmuLatte/playlists/shenmue2.m3u');
db2.prepare('INSERT INTO games (id, rom_path) VALUES (2, ?)').run('/mnt/roms/nes/mario.nes');
const cfgFile = path.join(b2, 'ra.cfg');
fs.writeFileSync(cfgFile, 'core_options_path = "/home/x/Games/CNGM/GameManagerConfig/EmuLatte/retroarch/opts.cfg"\nvideo_fullscreen = "true"\n');
const parse = f => { const m = {}; for (const l of fs.readFileSync(f,'utf8').split('\n')) { const x = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (x) m[x[1]] = x[2]; } return m; };
const mi = romLib.migrateHomeInDb(db2, newHome, { ensure: () => cfgFile, parse, writeKeys: (f, u) => { let t = fs.readFileSync(f,'utf8'); for (const [k,v] of Object.entries(u)) t = t.replace(new RegExp(`^${k} = ".*"$`,'m'), `${k} = "${v}"`); fs.writeFileSync(f,t); } }, m => console.log('   [home]', m));
ok(mi.rows === 1, 'the stale .m3u rom_path is re-homed');
ok(db2.prepare('SELECT rom_path FROM games WHERE id=1').get().rom_path === path.join(newHome, 'playlists', 'shenmue2.m3u'), 'and points into the new home');
ok(db2.prepare('SELECT rom_path FROM games WHERE id=2').get().rom_path === '/mnt/roms/nes/mario.nes', 'an unrelated ROM path is untouched');
ok(mi.cfgKeys === 1 && parse(cfgFile).core_options_path === path.join(newHome, 'retroarch', 'opts.cfg'), 'the RetroArch path key is re-homed', parse(cfgFile));

console.log(`\n${fails ? '✗ ' + fails + ' FAILED' : '✓ all checks passed'}`);
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(b2, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
