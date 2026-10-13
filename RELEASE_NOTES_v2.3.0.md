On top of [2.2.0](https://github.com/FromChaosComesClarity/EmuLatte/releases/tag/v2.2.0). One change: **Scrape All** stops meaning "all of it, again".

## Scrape All now asks which games

Pressing **Scrape All** on a system's header used to queue every ROM in that system, whether it had been scraped or not. On a system you have already done that is a long wait and a chunk of your API quota spent re-fetching files you already have.

It now asks, in the same dialog that asks which source:

| Which games | Means |
| --- | --- |
| **Not scraped yet** | Only games with nothing on them at all. The default. |
| **Favourites** | Only the games in this system you have starred. |
| **Everything** | All of them, including the ones already done. For re-fetching from a different source, or fixing a scrape that matched the wrong game. |

Each option carries its own count, so the choice is made against real numbers rather than a guess: a Master System folder of 687 games with three already done offers **684**, not 687. An option with nothing in it is greyed out instead of quietly doing nothing, and if a system turns out to be fully scraped the dialog moves itself off the empty choice.

### What counts as scraped

Anything at all on the game: any detail, or any artwork. It is deliberately the same test the artwork export uses, which has a useful consequence. A game the scraper simply could not find stays in **not scraped yet** rather than being written off, so a second pass picks it up after you fix your credentials, switch source, or rename a file that was never going to match.

The choice applies to every source in the dialog, not just ScreenScraper.
