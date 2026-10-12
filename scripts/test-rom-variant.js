// Checks for rom-variant.js. The filenames here are real ones out of a 32,829-game library,
// including the three Action Fighter releases that started this.
const path = require('path');
const V = require(path.join(__dirname, '..', 'rom-variant.js'));

let pass = 0, fail = 0;
function ok(name, cond, got) {
    if (cond) { pass++; console.log(`✓ ${name}`); }
    else { fail++; console.log(`✗ ${name}\n    got: ${JSON.stringify(got)}`); }
}
const label = (f) => V.variantLabel(f);
const eq = (name, file, want) => ok(`${name}`, label(file) === want, label(file));

console.log('\n── labels ──');
eq('plain filename has no label', 'Action Fighter.zip', '');
eq('region list', 'Action Fighter (USA, Europe) (v1.2).zip', 'USA/Europe · v1.2');
eq('region, revision and translation',
   'Action Fighter (Japan, Europe) (Rev 1) [T-BR] [T-Patryck] [V-1.0 A-2016].zip',
   'Japan/Europe · Rev 1 · Portuguese (BR) translation');
eq('single region', 'Alex Kidd BMX Trial (Japan).zip', 'Japan');
eq('unlicensed', 'Alibaba and 40 Thieves (Korea) (Unl).zip', 'Korea · Unlicensed');
eq('revision letter', 'Sonic (USA) (Rev A).zip', 'USA · Rev A');
eq('prototype', 'Thing (USA) (Proto).zip', 'USA · Prototype');
eq('beta', 'Thing (Europe) (Beta).zip', 'Europe · Beta');
eq('goodtools region letter', 'Thing (U).zip', 'USA');
eq('goodtools alt code', 'Thing (U) [a1].zip', 'USA · Alt');
eq('goodtools hack code', 'Thing (J) [h2].zip', 'Japan · Hack');
eq('bad dump', 'Thing (E) [b].zip', 'Europe · Bad dump');
eq('verified-good marker says nothing', 'Thing (U) [!].zip', 'USA');
eq('english translation', 'Thing (Japan) [T+Eng].zip', 'Japan · English translation');
eq('translation with a version', 'Thing (Japan) [T+Eng1.1].zip', 'Japan · English translation');
eq('prg revision', 'Thing (Japan) (PRG1).zip', 'Japan · PRG1');
eq('language list alone', 'Thing (En,Fr,De,Es,It).zip', 'English/French/German');
eq('language list is dropped when a region is known', 'Thing (Europe) (En,Fr,De).zip', 'Europe');
eq('nested folders are ignored', '/roms/nes/# DYNAVISION #/1942 (Japan).zip', 'Japan');

console.log('\n── noise that must not reach the interface ──');
eq('a translator handle is not a language', 'Thing [T-Patryck].zip', '');
eq('a dump year is not a variant', 'Thing (19xx).zip', '');
eq('a shop name is not a variant', 'Thing (Floppyshop).zip', '');
eq('a lone dash is not a variant', 'Thing (-).zip', '');
ok('unrecognised tags are recorded, not printed',
   V.parseRomTags('Thing (Floppyshop) [T-Patryck].zip').unknown.length === 2,
   V.parseRomTags('Thing (Floppyshop) [T-Patryck].zip').unknown);
ok('a label never runs away',
   label('Thing (USA, Europe) (Rev 1) (Beta) (Proto) (Unl) [T+Eng] [a1] [b] [h1].zip').split(' · ').length <= 3,
   label('Thing (USA, Europe) (Rev 1) (Beta) (Proto) (Unl) [T+Eng] [a1] [b] [h1].zip'));

console.log('\n── release identity ──');
const k = V.variantKey;
ok('the same release from two folders is one release',
   k('/a/Thing (USA).zip') === k('/b/Thing (USA).zip'), 'equal');
ok('different regions are different releases',
   k('Thing (USA).zip') !== k('Thing (Japan).zip'), 'different');
ok('different revisions are different releases',
   k('Thing (USA).zip') !== k('Thing (USA) (Rev 1).zip'), 'different');
ok('a translation is a different release',
   k('Thing (Japan).zip') !== k('Thing (Japan) [T+Eng].zip'), 'different');
ok('a prototype is a different release',
   k('Thing (USA).zip') !== k('Thing (USA) (Proto).zip'), 'different');
ok('the translator handle does not change the release',
   k('Thing (Japan) [T-BR].zip') === k('Thing (Japan) [T-BR] [T-Patryck].zip'), 'equal');
ok('a different extension is the same release',
   k('Thing (USA).zip') === k('Thing (USA).sms'), 'equal');
ok('tag order does not change the release',
   k('Thing (USA, Europe).zip') === k('Thing (Europe, USA).zip'), 'equal');

console.log('\n── robustness ──');
ok('no path at all', label('') === '' && label(null) === '' && label(undefined) === '', 'empty');
ok('unbalanced brackets do not throw', typeof label('Thing (USA.zip') === 'string', label('Thing (USA.zip'));
ok('empty tags are skipped', label('Thing () [] (USA).zip') === 'USA', label('Thing () [] (USA).zip'));

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
