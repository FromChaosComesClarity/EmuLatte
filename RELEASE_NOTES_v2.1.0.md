A feature release on top of [2.0.1](https://github.com/FromChaosComesClarity/EmuLatte/releases/tag/v2.0.1), for one thing: **scraping the same collection twice.**

If you run EmuLatte on two machines with the same ROMs, the second one starts blank. Everything the first one pulled down, the covers, the descriptions, the years and developers, the ScreenScraper ids, is sitting on the other computer, and the only way to get it was to scrape it all again: hours of work and a day of somebody's API quota, for files that are byte for byte identical.

## Export what you scraped, import it anywhere

**Settings ▸ Library ▸ Bring artwork over from another computer.**

On the machine that has the artwork, press **Export My Artwork**. EmuLatte writes an `EmuLatte_Artwork` folder wherever you point it, a USB stick being the obvious place. On the other machine, press **Import Artwork** and point at that folder. The covers, hero art, logos and screenshots are copied in, and the descriptions, years, developers, publishers, genres, player counts, ratings and scraper ids are filled in on the matching games.

### Only what you have actually scraped

A collection can be tens of thousands of games of which a few hundred have been scraped. The bundle carries those and nothing else, so it stays small enough to be worth carrying: in testing, 500 scraped games out of 32,829 came to 4 MB.

### It does not care where your ROMs live

This is the part that matters, and it is why the bundle is not simply a copy of the library. **Nothing in it is tied to a path.** Each entry names the system and the ROM's filename and nothing more:

```json
{
  "system": "nes",
  "file": "1942.zip",
  "description": "...",
  "year": "1986",
  "cover": "g2_cover.jpg"
}
```

Games are matched on that pair, which is the same way EmuLatte already recognises a ROM that has moved between folders. Your drives can be mounted anywhere, your folders can be named differently, the other machine's library can be organised nothing like yours, and the artwork still lands on the right games. Verified end to end against a 32,829-game library whose two copies had entirely different ROM paths: all 500 scraped games matched, 1,000 artwork files copied, and not one ROM path was changed.

By default it only fills in what is missing, so anything you have already scraped here is left alone. A checkbox lets you overwrite instead.

**Import also accepts a whole `Emulatte_Stuff` folder**, if you would rather point straight at the other machine's library than export a bundle first. It reads only the games that have something scraped on them, and writes nothing to the library it is reading.
