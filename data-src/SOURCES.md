# Sources: Aion 2 scout planner data (Assassin + Ranger)

Everything here comes from https://gamers4.life/aion-2/database (BASE below), downloaded on 2026-10-12. About 360 requests were made, one at a time.
The raw files are in `../raw/`. To rebuild the outputs, run `python3 -I ../scripts/build.py ../raw ../data`.
Nothing has been invented. When a value is not in the source, it is left out or set to null, and this file lists it below.

## classes.json (2 records)
- Sources:
  - `BASE/en/classes/assassin/` and `/ranger/`. The data comes from the RSC flight payload (`self.__next_f.push`): the `classDef`, the guide section and the FAQ.
  - The weapon slot comes from the build-calculator chunk `_next/static/chunks/2214-a9584c622723d72c.js`, which maps `assassin:{main:"dagger"}, ranger:{main:"bow"}`.
- Complete: name, Korean name, role, weapon, tagline, summary and playstyle, skill counts, guide text ("Suggested stat direction", gear priority) and the FAQ.
- Missing:
  - Base stats are null because the site has no per-class base stats.
  - The site uses the class key ("assassin") as its class id. There is no numeric game class id; the JS only has an emblem index (3 and 4).
  - Assassin uses daggers only. The site does not support swords for Assassin; swords belong to Templar.

## skills-assassin.json / skills-ranger.json (35 records each, plus 12 shared "commonSkills")
- Sources:
  - The skill list (id, name, icon, active/passive/stigma) and the `stigmaMax` map come from the class page RSC.
  - Details come from `BASE/db/skill/{id}.json`: 82 files.
- Complete: type, damage type, weapon, English description (as plain text, with the highlighted numbers pulled out separately), cooldown (ms), MP cost, range, icon, and `specs`. Specs are effects unlocked at certain skill levels: 8/12/16 for actives and 5/10/15/20 for stigmas.
- Relations:
  - `referencedSkills` lists skill names in [brackets] or mentioned in the text. This includes "Adds [X] Chain Skill" and "trigger [Y] on hit".
  - `daevanionBoostNodes` lists the daevanion nodes that give +N levels to the skill.
- Missing:
  - Cast time, required character level, and per-level damage or scaling tables. The description only shows numbers for one level.
  - `/db/skill/en/{id}.json` returns 404, and the HTML skill pages are empty shells.
  - `stigmaMaxLevel` is the site's own UI cap (values like 1/30/40/120). Where that number comes from is not documented.

## daevanion-assassin.json / daevanion-ranger.json (8 boards, 996 nodes each)
- Source: `BASE/db/daevanion/{assassin|ranger}.json`, which is complete.
- Boards: Nezekan, Zikel, Vaizel, Triniel, Ariel, Azphel, Marchutan and Yustiel. Each board has its point type, and each node has its row/column, cost, grade, type (stat/skill/start), stats and a +skill-level value.
- `edges` are derived, not stored on the site. They link grid neighbours that sit next to each other horizontally or vertically. This copies the rule in the planner chunk `daevanion-planner/page-17a94518255223dd.js`.
- Missing: point budgets and level gates per board.

## items-scout.json (2,736 items; 241 with `detail`)
- Sources:
  - `BASE/db/gear/en.json` is the full gear index with 5,356 entries. From it I kept every dagger and bow (402), all armor in 7 slots (1,848) and accessories (486).
  - Armor has no class restriction in the data, so all of it is marked as usable by both classes.
  - Family names come from the `/en/gear-families/` RSC.
- `detail` comes from `BASE/db/item/en/{id}.json`. It is only fetched for Heroic/Mythic gear in scout slots and for Unique daggers and bows, one id per name+slot. It includes:
  - base `mainStats`
  - the enchant table, usually +1..+20
  - exceed/breakthrough levels with gold and material costs and success chances
  - the random sub-stat pool with min/max/weight
  - the soul-bind cost
  - the NPCs that drop the item
- Warning: the `maxEnchantBonus` from the gear list is the bonus at the highest enchant level, not the base stats. I checked this on all 241 detailed items.
- Missing or partial:
  - Base stats and drop sources for the other 2,495 items (Common through Epic, and Unique armor and accessories). They can be fetched one at a time from `/db/item/en/{id}.json`.
  - Crafting and vendor sources.
  - Theostones (153 records on `/en/theostones/`) were not included.

## stats.json (91 stat definitions)
- Sources:
  - labels from the RSC `StatNamesProvider` names and the stat-calculator chunk
  - Offense/Defense/Vitality groups and percent-type stats from the 2214 and stat-calculator chunks
  - the calculator formula from `stat-calculator/page-cbbe6df546d94314.js`
- How percent stats are stored: the value is multiplied by 100 (500 = 5%).
- The calculator formula is either `(base+flat)*(1+pct)` or `base*(1+pct)+flat`.
- The site says itself that the calculator does not convert ratings to %, apply caps, or use an official combat formula.
- Class stat priority is the site's own guide text.
- Missing: damage formula, rating-to-% curves, caps, and character base stats by level.

## builds.json (6 builds: 0 Assassin, 6 Ranger)
- Source: the public API used by `/en/builds/`, which is `BASE/api/builds.php?class=assassin|ranger` (page 2 is empty), plus `?id=N`.
- The base64url `code` is decoded into skills, equipment (resolved to names), stigma levels, soul lines, daevanion node ids (with a count per board) and pantheon.
- Missing:
  - No Assassin builds exist.
  - None of the Ranger builds has a description, guide or rotation text, and they have no stigma levels set.
  - Author avatar URLs were left out on purpose.
