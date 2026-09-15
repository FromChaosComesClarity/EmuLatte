'use strict';
// ScreenScraper developer credentials identify EmuLatte itself; users supply their own account
// on top (ssid/sspassword). A shipped build carries them XOR-scrambled in assets/ss_dev.dat, so
// the AppImage holds no plaintext, the same approach ES-DE uses. assets/ss_dev.json is the
// plaintext source kept for local dev; both files are gitignored, and predist regenerates the
// .dat from the .json before packaging. This is obfuscation, not encryption: it only keeps the
// credentials out of reach of `strings` and secret scanners.
//
// ⚠️ The key lives HERE and nowhere else. main.js reads with it and scripts/scramble-ssdev.js
// writes with it. It used to be written out in both, and when the suite was renamed the key
// string changed while an existing ss_dev.dat did not, so a build unscrambled its own
// credentials into garbage, swallowed the error, and every ScreenScraper call failed with
// "Dev credentials missing". Changing KEY invalidates every ss_dev.dat made before it, which
// the scramble step now refuses to package.

const KEY = 'EmuLatte::clarity::ss-dev::xor::v1';

function xor(buf) {
    const out = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ KEY.charCodeAt(i % KEY.length);
    return out;
}

// JSON text in, the .dat's base64 text out.
function scramble(jsonText) {
    return xor(Buffer.from(jsonText, 'utf8')).toString('base64');
}

// The .dat's text in, the credentials object out. Throws when the file was scrambled with a
// different key, because what comes back is then not JSON at all.
function unscramble(datText) {
    const creds = JSON.parse(xor(Buffer.from(String(datText).trim(), 'base64')).toString('utf8'));
    if (!creds || typeof creds !== 'object' || !creds.devid || !creds.devpassword) {
        throw new Error('decoded, but devid or devpassword is missing');
    }
    return creds;
}

module.exports = { scramble, unscramble };
