A bugfix release on top of [1.1.0](https://github.com/shampoo-is-a-lie/EmuLatte/releases/tag/v1.1.0). Two things that were quietly wrong: **Recently Played wasn't a recently-played list**, and the **hero banner cycled games alphabetically** instead of at random.

No new features, nothing removed, database format unchanged — drop the new AppImage over the old one.

## Recently Played actually means recently played

The filter had two faults stacked on top of each other:

- It sorted the **whole library** by last-played time and took the top 50, without ever excluding ROMs you've never launched. Unless you'd played 50+ games, the list was padded out with untouched ROMs.
- Whatever survived that was then handed to the gallery sort, so the default **A — Z** re-alphabetised it — throwing away the recency order the filter exists for.

Now only games you've actually played appear, newest first. Picking a sort from the dropdown still overrides that; leaving it on A — Z no longer silently undoes the filter.

Launching a game also only recorded the timestamp in the database, not in the running app — so the game you *just* played was missing from the list until you restarted EmuLatte. It now appears immediately, and the view refreshes under you if you're sitting on Recently Played when you launch.

Couch Mode's **RECENT** category had all of the same faults, and is fixed alongside the desktop one. It now hides itself entirely when you haven't played anything yet, rather than offering a category full of games you've never touched.

## The hero banner picks at random

The banner at the top of the gallery walked the filtered list in order, which is the gallery's own A — Z sequence — so it always opened on the same game and always in the same order.

It now shuffles. Every game with hero artwork gets a turn before any repeats, then the order is reshuffled for the next pass. It still follows the gallery: filter to one system, search, or open a playlist, and the banner draws only from what's on screen.

## Notes

- The version in the About dialog now reads 1.1.1.
- Save Manager launches (resume from a slot / start fresh) count towards Recently Played too.
