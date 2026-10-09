#!/usr/bin/env node
// Build-time step (run by `predist`): scramble assets/ss_dev.json into assets/ss_dev.dat, using
// the key in ss-dev.js, so the shipped AppImage holds no plaintext developer credentials.
//
// Three situations, and only one of them is allowed to be quiet:
//   ss_dev.json present   scramble it, then read the result back to prove it decodes.
//   only ss_dev.dat       keep it if it decodes with the current key. If it does NOT, stop the
//                         build: it would ship looking complete while every ScreenScraper call
//                         fails, which is exactly how a renamed key broke it once.
//   neither               a contributor building without the credentials. Allowed, but said
//                         plainly, because the build will have no ScreenScraper at all.
const fs   = require('fs');
const path = require('path');
const { scramble, unscramble } = require('../ss-dev');

const jsonPath = path.join(__dirname, '..', 'assets', 'ss_dev.json');
const datPath  = path.join(__dirname, '..', 'assets', 'ss_dev.dat');

if (fs.existsSync(jsonPath)) {
    // Parse before scrambling, so a typo is caught here rather than at runtime.
    const raw = fs.readFileSync(jsonPath, 'utf8');
    JSON.parse(raw);
    fs.writeFileSync(datPath, scramble(raw));
    unscramble(fs.readFileSync(datPath, 'utf8'));
    console.log('scramble-ssdev: wrote assets/ss_dev.dat and confirmed it decodes');
    process.exit(0);
}

if (fs.existsSync(datPath)) {
    try {
        unscramble(fs.readFileSync(datPath, 'utf8'));
        console.log('scramble-ssdev: no ss_dev.json, keeping assets/ss_dev.dat, which decodes with the current key');
        process.exit(0);
    } catch {
        console.error(
            '\nscramble-ssdev: assets/ss_dev.dat does NOT decode with the key in ss-dev.js.\n' +
            '  It was scrambled with a different key, so this build would ship with ScreenScraper\n' +
            '  silently broken. Put assets/ss_dev.json back and build again, or delete\n' +
            '  assets/ss_dev.dat to build without ScreenScraper on purpose.\n');
        process.exit(1);
    }
}

console.warn(
    '\nscramble-ssdev: no ScreenScraper developer credentials (assets/ss_dev.json is absent).\n' +
    '  This build will run, but scraping from ScreenScraper will not work in it.\n');
