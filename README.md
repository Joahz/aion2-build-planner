# Aion 2 Build Planner

A Windows app for planning an **Assassin** or **Ranger** in Aion 2. You enter
your character and it recommends:

- **Skill loadout:** 8 actives, 4 stigmas and 4 passives for PvE or PvP, single target or AoE, with the reason for each pick.
- **What to level next:** which skill to raise, to which level, and what that unlocks.
- **Best gear for your level and faction**, with the slots to upgrade first and the stats your gear adds up to.
- **Rotation:** a priority list (buffs → setup → big hits → filler), plus a simulated first 30–60 seconds.
- **Macros:** key sequences built from your own keybinds for the opener, burst, filler and defensives.
- **Community builds:** compare against public builds, or load one with a click.

Characters are saved automatically. **Export** writes a character to a file you
can send to friends, and they load it with **Import**.

## Download

Get `Aion2BuildPlanner.exe` from the **Releases** page and double-click it.
It needs no install. Windows SmartScreen may warn you because the exe isn't
signed: click **More info → Run anyway**.

## Is it safe for my account?

Yes. The planner never reads the game, its memory or its network traffic, and
it never presses keys. Everything comes from what you type in.

## How recommendations work

NCSOFT doesn't publish combat formulas, so the planner ranks options from what
the game's own tooltips say:

- **Skills:** tooltip damage per second of cooldown, and what a skill sets up for
  others. For example, Shadowstrike stuns so Shadow Fall can land, Snare Shot
  slows so Burst Arrow can fire, and Marking Shot grants Precision for Deadshot.
  Skills that community builds use get a bonus.
- **Skill levels:** each next unlock is weighted (cooldown, crit and damage
  effects score highest, and crowd control scores higher in PvP), then divided
  by how many levels it costs.
- **Gear:** item level first, then the class stat priority.
- **Rotation simulation:** one press per "seconds per skill" step (you can change
  it), with MP tracked.

Treat the results as a strong starting point and adjust them in game.

## Data

Game data is a snapshot of the fan database at
[gamers4.life](https://gamers4.life/aion-2/database/en/). `data-src/` holds the
extracted JSON and `data-src/SOURCES.md` lists exactly what is and isn't covered.

- **Known gaps:** no cast times, no per-level damage tables, and full stats only
  for Heroic/Mythic gear and Unique weapons.
- **Updating the data:** replace the files in `data-src/`, then run
  `python3 scripts/build-data.py` to regenerate `data/game-data.js`.

## Development

```bash
npm install
npm start      # run the app
npm test       # engine tests
npm run dist   # build dist/Aion2BuildPlanner.exe
```

- `app/engine.js` holds the recommendation logic. It is pure functions and is
  unit-tested.
- `app/ui.js` holds the interface.

To publish a new version, bump `"version"` in `package.json` and push to
`main`. GitHub Actions runs the tests, builds the exe and attaches it to a new
release.

Fan-made and not affiliated with NCSOFT. Aion 2 is a trademark of NCSOFT Corporation.
