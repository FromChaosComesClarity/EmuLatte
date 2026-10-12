Four fixes on top of [2.1.1](https://github.com/FromChaosComesClarity/EmuLatte/releases/tag/v2.1.1), two of which were the same bug wearing different clothes.

## Artwork transfer was not broken, it was invisible

Every modal shared one stacking layer, so when two were open the winner was whichever happened to sit later in the markup. The folder picker sits *before* the Settings window it opens from, so pressing **Export My Artwork** opened the picker **underneath** Settings. You close Settings to find it, and in doing so you close the only place the progress was ever reported: one line of text inside the Settings pane. The feature ran perfectly and told you nothing.

Overlays now take their layer from what is actually open rather than from document order, so a modal opened on top of another is on top of it, full stop. Alerts and confirms sit in a band above everything, so a question can never hide behind the thing that asked it. This also fixes the folder picker, the rescan progress and the library-move progress, which were all doing the same disappearing act.

Export and import now get **their own progress window** with the phase, a running count and the result left on screen until you dismiss it. If nothing matches, it says so and tells you to point at the `EmuLatte_Artwork` folder itself rather than the drive it sits on.

Import was also genuinely slow for a dull reason: it wrote one row at a time with no transaction, which is one commit and one disk flush per game. On a thirty-thousand game library that was most of the wait. It is one transaction now.

## Opening the library

The window stays hidden until the interface is ready, so a large library used to mean several seconds of nothing at all followed by a window appearing. Two things changed.

**The gallery no longer builds itself all at once.** It used to assemble every game into a single block of HTML and hand it to the browser in one go: for 32,829 games that is roughly 40 MB of markup and half a million elements, every one of which has to be built before the window is allowed to appear. It now renders the first screenful and adds more as you scroll towards the bottom. The list view works the same way. Nothing about using it changes; it simply stops doing the other 32,709 games' work before showing you anything.

**There is a splash screen**, so the wait is visible instead of blank. It reports what is actually happening, from both halves of the app: opening the library, reading your ROM folders, reading your systems, reading your games. It wears your theme.

## Three copies of the same game

Scraping replaces a ROM's filename with the game's proper name. That is right until a system holds the same game more than once, and then a Master System library shows three entries called *Action Fighter* with the same cover and nothing to choose between them. Everything that told them apart was in the filename.

EmuLatte now reads the release back out of the filename and shows it under the title:

| File | Shown as |
| --- | --- |
| `Action Fighter.zip` | Action Fighter |
| `Action Fighter (USA, Europe) (v1.2).zip` | Action Fighter · **USA/Europe · v1.2** |
| `Action Fighter (Japan, Europe) (Rev 1) [T-BR] [T-Patryck] [V-1.0 A-2016].zip` | Action Fighter · **Japan/Europe · Rev 1 · Portuguese (BR) translation** |

Regions, revisions, prototypes, betas, unlicensed releases, hacks, bad dumps and translations are all recognised, in the shapes No-Intro, GoodTools and TOSEC write them. Tags are **classified rather than printed**, which is what makes it usable: a real collection throws up over a thousand distinct tags, most of them dump years, shop names and the handle of whoever made a translation patch. Anything unrecognised is left out instead of guessed at, so `[T-Patryck]` does not end up on the shelf next to the title.

A label appears **only when another game on the same system has the same title**, so this is invisible until the moment it is useful. On a game's own page the release is always shown, because there the question is always "which of these am I looking at". Two untagged copies are told apart by the folder they sit in. It works in Couch Mode too.

## A different region is not a duplicate

**Find Duplicate Games** grouped by title and pre-ticked every copy but the most complete one. On a 32,829-game library that selected **5,515 entries for deletion, of which only 1,278 were really another copy of something already there.** The other 4,237 were distinct regions, revisions, prototypes and translations: one click from gone, and no scraper can bring them back.

It now splits each group by release first. Only a genuine repeat of a release already in the library is ticked for you. A group that turns out to be several different releases **pre-selects nothing at all** and says so, and every row shows its release and its filename so the choice is an informed one. ROM files are still never deleted, only library entries.

## Also

- The rescan progress window no longer hides itself when Settings is open. That was a workaround for the stacking bug above.
- The manual gains a section on releases and a warning on the duplicate finder.
- The splash floats rather than being tiled into the layout on a tiling window manager.
