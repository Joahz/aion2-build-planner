// Recommendation engine: pure functions over window.GAME data. No DOM here, so
// it runs in the app and under `node --test`.
//
// NCSOFT doesn't publish damage formulas, so everything below ranks options
// using the numbers the game's own tooltips show (damage, cooldown, MP) and
// what each skill's text says it enables. Results are recommendations, not
// a combat simulation.
(function (root) {
  'use strict';

  const LOADOUT = { active: 8, stigma: 4, passive: 4 };
  const MAX_LEVEL = { active: 20, stigma: 20, passive: 1 };
  const GEAR_SLOTS = [
    ['weapon', 'Weapon'], ['helmet', 'Helmet'], ['shoulder', 'Shoulders'], ['torso', 'Chest'],
    ['pants', 'Pants'], ['gloves', 'Gloves'], ['boots', 'Boots'], ['cape', 'Cape'],
    ['necklace', 'Necklace'], ['earring1', 'Earring 1'], ['earring2', 'Earring 2'],
    ['ring1', 'Ring 1'], ['ring2', 'Ring 2'], ['bracelet', 'Bracelet'], ['belt', 'Belt'], ['amulet', 'Amulet'],
  ];
  const GRADE_ORDER = ['Common', 'Rare', 'Epic', 'Unique', 'Heroic', 'Legendary', 'Mythic'];

  // ---- Text parsing ----------------------------------------------------------

  // Some tooltips contain unfilled template ids (e.g. "13770007%") or raw
  // milliseconds ("for 3000"). Tidy them for display.
  function cleanText(s) {
    return String(s || '')
      .replace(/\b\d{6,}%?/g, '?')
      .replace(/\b(\d{4,5})%/g, (_, n) => `${+n / 100}%`)
      .replace(/\bfor (\d{4,5})\b(?!%)/g, (_, ms) => `for ${+ms / 1000}s`)
      .replace(/by(\d)/g, 'by $1');
  }

  const STATES = ['Stun', 'Blind', 'Slow', 'Root', 'Knockdown', 'Airborne', 'Seal', 'Bleed', 'Knock Back', 'Stagger',
    'Precision', 'Gale', 'Stealth', 'Insignia', 'Crimson Flames', 'Tenacity'];

  function durationSec(text) {
    const m = /for (\d+)s\b/.exec(text) || /for (\d{4,5})\b/.exec(text);
    if (!m) return 0;
    const n = +m[1];
    return n >= 1000 ? n / 1000 : n;
  }

  // Derive what a skill does from its tooltip text.
  function analyze(skill) {
    const t = skill.desc || '';
    const dmg = /[Dd]eals? (\d+)(?:-(\d+))? (?:damage|to\b)/.exec(t);
    const damage = dmg ? (dmg[2] ? (+dmg[1] + +dmg[2]) / 2 : +dmg[1]) : 0;
    const a = {
      damage,
      aoe: /up to \d+ enemies|AoE/.test(t),
      cdSec: (skill.cd || 0) / 1000,
      mp: skill.mp || 0,
      mpRestore: +((/restores? (\d+) MP/i.exec(t) || [])[1] || 0),
      // requires: groups of alternatives, all groups must hold ("Slow or Root").
      requires: [], prefers: [], grants: [], tags: [],
    };
    let m;
    // Hard: the skill can only target something in that state.
    if ((m = /\ba target afflicted with ([A-Za-z]+)(?: or ([A-Za-z]+))?/.exec(t))) a.requires.push([m[1], m[2]].filter(Boolean));
    // Soft: bonus damage or extra effect when the state is present.
    const soft = /(?:targets? afflicted with|if the caster has|while) ([A-Z][a-z]+)/g;
    while ((m = soft.exec(t))) if (!a.requires.some((g) => g.includes(m[1]))) a.prefers.push(m[1]);
    if (/Insignias?/.test(t) && /Damage and Stun chance incre/.test(t)) a.prefers.push('Insignia');
    if (/Triggers on landing a Critical Hit/.test(t)) a.tags.push('proc');
    if (/after using \[Dodge\]/.test(t)) a.tags.push('situational');
    const add = (g) => { if (!a.grants.some((x) => x.state === g.state)) a.grants.push(g); };
    const inflicts = /(?:inflicts?|inflict) ([A-Z][a-z]+(?: Back)?)/g;
    while ((m = inflicts.exec(t))) add({ state: m[1], on: 'target', sec: durationSec(t.slice(m.index)) || 3 });
    if ((m = /grants? ([A-Z][a-z]+) to the caster for (\d+)/.exec(t))) add({ state: m[1], on: 'self', sec: durationSec(m[0]) || 10 });
    if ((m = /grants ([A-Z][a-z]+) for (\d+)/i.exec(t)) && m[1] !== 'Stealth') add({ state: m[1], on: 'self', sec: durationSec(m[0]) || 7 });
    if (/[Ee]ngraves \d+ Insignia/.test(t)) add({ state: 'Insignia', on: 'target', sec: 10 });
    if (/Grants Stealth|Enter Stealth|grants Stealth/.test(t)) a.tags.push('stealth');
    a.needs = [...new Set(a.requires.flat().concat(a.prefers))];

    if (!damage && /Increases the caster's (Attack|Critical|Combat Speed)|extra damage for|Removes \[.*\] cooldown/.test(t)) a.tags.push('buff');
    if (/Gale: Increases Combat Speed/.test(t)) a.tags.push('buff');
    if (!damage && /Removes Stun|Reduces damage taken|evade all damage|Evasion by|Removes Slow/.test(t)) a.tags.push('defensive');
    if (a.cdSec === 0 && damage) a.tags.push('filler');
    if (a.requires.some((g) => g.includes('Stagger'))) a.tags.push('reactive');
    if (/Cannot be used in combat|Usable out of combat/.test(t)) a.tags.push('precombat');
    return a;
  }

  // ---- Loadout ---------------------------------------------------------------

  function skillsOf(classKey, G) { return (G.classes[classKey] || { skills: [] }).skills; }

  function buildPicks(classKey, G) {
    const counts = {};
    for (const b of G.builds) if (b.class === classKey) for (const id of b.skills) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }

  const PASSIVE_PVE = /Damage Boost|Critical|Attack|damage|Accuracy|Defense Break|Back Attack/;
  const PASSIVE_PVP = /Status Effect Resist|Evasion|HP|Resist|PvP/;
  const PVP_CC = /Stun|Seal|Root|Blind|Airborne|Knockdown|Removes up to \d+ buffs|Removes Stun|Reduces damage taken|Stealth|Slow/;

  // Score each skill for the chosen mode; higher = more worth a slot.
  function scoreSkill(skill, ctx) {
    const a = analyze(skill);
    const why = [];
    let score = 0;
    if (skill.type === 'passive') {
      if (PASSIVE_PVE.test(skill.desc)) { score += ctx.mode === 'pve' ? 6 : 3; why.push('raises damage'); }
      if (PASSIVE_PVP.test(skill.desc)) { score += ctx.mode === 'pvp' ? 6 : 1; why.push('survivability'); }
    } else {
      if (a.damage && a.cdSec > 0) {
        // Damage per second of cooldown: what the skill adds on top of filler.
        let dps = a.damage / a.cdSec;
        if (a.tags.includes('reactive') || a.tags.includes('situational')) dps *= 0.5;
        score += Math.min(10, dps / 4);
        why.push(`${Math.round(a.damage)} dmg every ${a.cdSec}s`);
      }
      if (a.grants.some((g) => ['Stun', 'Slow', 'Root', 'Precision', 'Insignia'].includes(g.state))) {
        score += 1.5; why.push(`applies ${a.grants.map((g) => g.state).join('/')}`);
      }
      if (a.aoe && ctx.focus === 'aoe') { score += 3; why.push('hits up to 4 targets'); }
      if (a.tags.includes('buff')) { score += ctx.mode === 'pve' ? 6 : 4; why.push('damage buff'); }
      if (a.tags.includes('filler')) {
        // Only one or two fillers are needed; MP-restoring ones keep the rotation going.
        const reactive = a.tags.includes('reactive');
        score += reactive ? 3 : 4 + (a.mpRestore ? 2 : 0);
        why.push(reactive ? 'free hits while the target is Staggered' : `no-cooldown filler${a.mpRestore ? ', restores MP' : ''}`);
      }
      if (a.tags.includes('defensive')) { score += ctx.mode === 'pvp' ? 7 : 1.5; why.push('defensive'); }
      if (ctx.mode === 'pvp' && PVP_CC.test(skill.desc)) { score += 3; why.push('crowd control'); }
      if (a.tags.includes('precombat')) score -= 1;
      if (a.tags.includes('situational')) score -= 1;
    }
    const picks = ctx.picks[skill.id] || 0;
    if (picks) { score += 2 * picks; why.push(`in ${picks} community build${picks > 1 ? 's' : ''}`); }
    return { skill, score, why, a };
  }

  function recommendLoadout(classKey, opts, G) {
    const ctx = { mode: opts.mode || 'pve', focus: opts.focus || 'single', picks: buildPicks(classKey, G) };
    const scored = skillsOf(classKey, G).map((s) => scoreSkill(s, ctx));
    const out = {};
    for (const type of Object.keys(LOADOUT)) {
      const pool = scored.filter((x) => x.skill.type === type).sort((x, y) => y.score - x.score);
      let chosen = pool.slice(0, LOADOUT[type]);
      // Keep skills that enable a chosen payoff (e.g. Snare Shot -> Burst Arrow).
      if (type === 'active') {
        for (const c of [...chosen]) {
          for (const need of c.a.requires.map((g) => g[0])) {
            if (need === 'Stagger') continue;
            const has = chosen.some((x) => x !== c && x.a.grants.some((g) => g.state === need));
            if (has) continue;
            const enabler = pool.find((x) => !chosen.includes(x) && x.a.grants.some((g) => g.state === need));
            if (enabler) {
              const weakest = chosen.filter((x) => x !== c).sort((x, y) => x.score - y.score)[0];
              if (weakest && weakest.score < c.score) {
                chosen = chosen.filter((x) => x !== weakest).concat(enabler);
                enabler.why.push(`enables ${c.skill.name} (${need})`);
              }
            }
          }
        }
      }
      out[type] = { chosen, bench: pool.filter((x) => !chosen.includes(x)) };
    }
    return out;
  }

  // ---- Skill leveling --------------------------------------------------------

  const SPEC_WEIGHTS = [
    [/cooldown|reset|Consecutive Cast|Combat Speed|Skill Speed/i, 4],
    [/Critical|Multi-Hit|damage|Attack|Ignores Block|Perfect|Double/i, 3.5],
    [/Chain Skill|AoE|Insignia|Removes MP|MP restored|-\d+% MP/i, 2.5],
    [/Absorbs|HP|Shield|Tolerance|reduction/i, 2],
    [/Stun|Seal|Root|Blind|Knock|Airborne|Slow|buffs|Immunity/i, 1.5],
    [/Range|Stamina|Move Speed|mobile/i, 0.8],
  ];
  function specValue(text, mode) {
    let v = 1;
    for (const [re, w] of SPEC_WEIGHTS) if (re.test(text)) { v = Math.max(v, w); }
    if (mode === 'pvp' && /Stun|Seal|Root|Blind|Knock|Airborne|buffs|Immunity|Tolerance|PvP/i.test(text)) v += 1.5;
    if (mode === 'pve' && /PvE/i.test(text)) v += 0.5;
    return v;
  }

  // levels: { skillId: currentLevel }. Returns the cheapest valuable upgrades first.
  function levelingPlan(loadoutSkills, levels, opts) {
    const mode = opts.mode || 'pve';
    const importance = {};
    loadoutSkills.forEach((x, i) => { importance[x.skill.id] = 1 + Math.max(0, 8 - i) * 0.12 + (x.a.damage ? 0.3 : 0); });
    const steps = [];
    for (const x of loadoutSkills) {
      const s = x.skill;
      if (s.type === 'passive') continue;
      const cur = Math.max(1, levels[s.id] || 1);
      const byLevel = {};
      for (const sp of s.specs) if (sp.lvl > cur) (byLevel[sp.lvl] = byLevel[sp.lvl] || []).push(sp.text);
      const next = Object.keys(byLevel).map(Number).sort((p, q) => p - q)[0];
      if (!next) continue;
      const gain = byLevel[next].reduce((sum, t) => sum + specValue(t, mode), 0);
      const cost = next - cur;
      steps.push({
        skill: s, from: cur, to: next, cost, unlocks: byLevel[next],
        score: (gain * (importance[s.id] || 1)) / cost,
        boosts: s.boosts,
      });
    }
    return steps.sort((p, q) => q.score - p.score);
  }

  // ---- Rotation --------------------------------------------------------------

  // Orders the active+stigma loadout into a priority list and groups.
  function buildRotation(loadoutSkills, opts) {
    const focus = opts.focus || 'single';
    const usable = loadoutSkills.filter((x) => x.skill.type !== 'passive');
    const groups = { precombat: [], buffs: [], setup: [], payoff: [], reactive: [], filler: [], defensive: [] };
    const neededStates = new Set();
    usable.forEach((x) => x.a.needs.forEach((s) => neededStates.add(s)));
    for (const x of usable) {
      const t = x.a.tags;
      if (t.includes('precombat') || (t.includes('stealth') && !x.a.damage)) groups.precombat.push(x);
      else if (t.includes('defensive')) groups.defensive.push(x);
      else if (t.includes('buff') && !x.a.damage) groups.buffs.push(x);
      else if (t.includes('reactive') || t.includes('proc') || t.includes('situational')) groups.reactive.push(x);
      else if (t.includes('filler')) groups.filler.push(x);
      else if (x.a.grants.some((g) => neededStates.has(g.state)) || t.includes('buff')) groups.setup.push(x);
      else groups.payoff.push(x);
    }
    const dmgKey = (x) => (x.a.damage * (focus === 'aoe' && x.a.aoe ? 2.5 : 1));
    groups.payoff.sort((p, q) => dmgKey(q) - dmgKey(p));
    groups.setup.sort((p, q) => p.a.cdSec - q.a.cdSec);
    groups.buffs.sort((p, q) => q.a.cdSec - p.a.cdSec);
    // Fillers that set up a needed state first, then by damage for the focus.
    const fillerKey = (x) => (x.a.grants.some((g) => neededStates.has(g.state)) ? 1000 : 0) + dmgKey(x);
    groups.filler.sort((p, q) => fillerKey(q) - fillerKey(p));
    const priority = [...groups.buffs, ...groups.setup, ...groups.payoff, ...groups.filler];
    return { groups, priority };
  }

  // Priority-list simulation: every `gcd` seconds use the first ready skill whose
  // requirements are met. Cast times aren't published, so each use takes one gcd.
  function simulate(priority, opts) {
    const seconds = opts.seconds || 30, gcd = opts.gcd || 1, maxMp = opts.maxMp || 1000;
    const ready = new Map(priority.map((x) => [x.skill.id, 0]));
    const states = {}; // state -> expires at
    const timeline = [];
    let mp = maxMp;
    for (let t = 0; t < seconds - 1e-9; t += gcd) {
      const has = (s) => (states[s] || 0) > t;
      const pick = priority.find((x) => ready.get(x.skill.id) <= t + 1e-9 && x.a.mp <= mp &&
        x.a.requires.every((alts) => alts.some(has)));
      if (!pick) continue;
      ready.set(pick.skill.id, t + Math.max(pick.a.cdSec, gcd));
      mp = Math.min(maxMp, mp - pick.a.mp + pick.a.mpRestore);
      for (const g of pick.a.grants) states[g.state] = t + g.sec;
      timeline.push({ t: Math.round(t * 10) / 10, skill: pick.skill, mp });
    }
    return timeline;
  }

  // ---- Gear ------------------------------------------------------------------

  const STAT_ALIASES = {
    'Attack': ['weapondamage', 'weaponmindamage', 'fixingdamage', 'weaponfixingdamage', 'attack'],
    'Critical': ['critical'],
    'Damage Boost': ['amplifyalldamage', 'pveamplifydamage'],
    'Accuracy': ['accuracy', 'weaponaccuracy'],
    'Frontal Attack': ['frontattack', 'amplifyfrontdamage'],
    'Move Speed': ['movespeed'],
  };
  function statWeights(classKey, G) {
    const order = (G.classes[classKey] || {}).guide?.suggestedStats || [];
    const w = {};
    order.forEach((label, i) => (STAT_ALIASES[label] || []).forEach((id) => { w[id] = Math.max(w[id] || 0, order.length - i); }));
    return w;
  }

  function slotKind(slot) { return slot.replace(/\d$/, ''); }

  // race: 'light' (Elyos) or 'dark' (Asmodian); faction gear only fits its own side.
  function itemsForSlot(slot, classKey, level, G, race) {
    const kind = slotKind(slot);
    const want = kind === 'weapon' ? G.classes[classKey].weapon : kind;
    return G.items.filter((i) => i.slot === want && (!level || (i.level || 1) <= level) &&
      (!race || !i.race || i.race === 'all' || i.race === race));
  }

  function itemScore(item, weights) {
    const stats = item.base || item.maxEnch || {};
    let s = 0;
    for (const [k, v] of Object.entries(stats)) if (weights[k]) s += weights[k] * Math.log10(1 + Math.abs(v));
    return (item.ilvl || 0) * 10 + GRADE_ORDER.indexOf(item.grade) * 2 + s;
  }

  function bestForSlot(slot, classKey, level, G, n = 3, race) {
    const w = statWeights(classKey, G);
    const seen = new Set();
    return itemsForSlot(slot, classKey, level, G, race)
      .map((i) => ({ item: i, score: itemScore(i, w) }))
      .sort((p, q) => q.score - p.score)
      .filter(({ item }) => (seen.has(item.name) ? false : seen.add(item.name)))
      .slice(0, n);
  }

  function upgradePlan(gear, classKey, level, G, race) {
    const byId = new Map(G.items.map((i) => [i.id, i]));
    return GEAR_SLOTS.map(([slot, label]) => {
      const cur = gear[slot] && byId.get(gear[slot].id);
      const best = bestForSlot(slot, classKey, level, G, 1, race)[0];
      const gap = best ? (best.item.ilvl || 0) - (cur ? cur.ilvl || 0 : 0) : 0;
      return { slot, label, current: cur || null, best: best ? best.item : null, gap };
    }).sort((p, q) => q.gap - p.gap);
  }

  // Sum known stats for equipped gear: base + cumulative enchant bonus.
  // Weapon block mechanics, not character stats; they'd only confuse the totals.
  const HIDDEN_STATS = new Set(['decreaseweaponblock', 'maxweaponblock']);

  function gearStats(gear, G) {
    const byId = new Map(G.items.map((i) => [i.id, i]));
    const total = {};
    const unknown = [];
    for (const [slot, g] of Object.entries(gear || {})) {
      const it = g && byId.get(g.id);
      if (!it) continue;
      if (!it.base) { unknown.push(it.name); continue; }
      const add = (o) => { for (const [k, v] of Object.entries(o || {})) if (!HIDDEN_STATS.has(k)) total[k] = (total[k] || 0) + v; };
      add(it.base);
      const e = Math.min(g.enchant || 0, (it.ench || []).length);
      if (e > 0) add(it.ench[e - 1]);
    }
    return { total, unknown };
  }

  function fmtStat(id, v, G) {
    const d = G.stats[id];
    const label = d ? d.label : id;
    return { label, value: d && d.pct ? `${(v / 100).toFixed(1).replace(/\.0$/, '')}%` : String(v) };
  }

  // ---- Macros ----------------------------------------------------------------

  function macroSequences(rotation, timeline, keys) {
    const k = (x) => keys[x.skill.id] || `[${x.skill.name}]`;
    const line = (list) => list.map(k).join(' → ');
    const opener = timeline.slice(0, 10).map((e) => keys[e.skill.id] || `[${e.skill.name}]`);
    const g = rotation.groups;
    return [
      { name: 'Pre-pull', note: 'Out of combat, before engaging', seq: line(g.precombat) },
      { name: 'Opener', note: 'First 10 presses from the simulation', seq: opener.join(' → ') },
      { name: 'Burst window', note: 'Buffs, then the biggest hits', seq: line([...g.buffs, ...g.setup, ...g.payoff]) },
      { name: 'Filler', note: 'Spam between cooldowns', seq: line(g.filler) },
      { name: 'When it lights up', note: 'Proc/conditional skills — press as soon as available', seq: line(g.reactive) },
      { name: 'Defensive', note: 'Break CC / survive', seq: line(g.defensive) },
    ].filter((m) => m.seq);
  }

  const api = {
    LOADOUT, MAX_LEVEL, GEAR_SLOTS, GRADE_ORDER, cleanText, analyze, scoreSkill, recommendLoadout,
    levelingPlan, buildRotation, simulate, statWeights, itemsForSlot, bestForSlot, upgradePlan,
    gearStats, fmtStat, macroSequences, buildPicks, specValue,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
