const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../app/engine.js');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../data/game-data.js'), 'utf8'), ctx);
const G = ctx.window.GAME;
const skill = (cls, name) => G.classes[cls].skills.find((s) => s.name === name);

test('data covers both classes', () => {
  for (const c of ['assassin', 'ranger']) {
    const types = G.classes[c].skills.map((s) => s.type);
    assert.ok(types.filter((t) => t === 'active').length >= 8);
    assert.ok(types.filter((t) => t === 'stigma').length >= 4);
    assert.ok(types.filter((t) => t === 'passive').length >= 4);
  }
  assert.ok(G.items.length > 1000);
});

test('analyze reads hard requirements as alternatives', () => {
  assert.deepStrictEqual(E.analyze(skill('ranger', 'Burst Arrow')).requires, [['Slow', 'Root']]);
  assert.deepStrictEqual(E.analyze(skill('assassin', 'Shadow Fall')).requires, [['Stun']]);
  // Deadshot only gets a bonus from Precision; it must still be usable without it.
  const dead = E.analyze(skill('ranger', 'Deadshot'));
  assert.deepStrictEqual(dead.requires, []);
  assert.ok(dead.prefers.includes('Precision'));
  assert.strictEqual(dead.damage, (509 + 1528) / 2);
});

test('loadouts fill every slot type for every mode', () => {
  for (const c of ['assassin', 'ranger']) for (const mode of ['pve', 'pvp']) for (const focus of ['single', 'aoe']) {
    const lo = E.recommendLoadout(c, { mode, focus }, G);
    for (const [type, n] of Object.entries(E.LOADOUT)) {
      assert.strictEqual(lo[type].chosen.length, n, `${c} ${mode} ${focus} ${type}`);
      assert.ok(lo[type].chosen.every((x) => x.skill.type === type));
    }
  }
});

test('a chosen skill that needs a state comes with a skill that applies it', () => {
  for (const c of ['assassin', 'ranger']) for (const mode of ['pve', 'pvp']) {
    const chosen = E.recommendLoadout(c, { mode }, G).active.chosen;
    for (const x of chosen) for (const alts of x.a.requires) {
      if (alts.includes('Stagger')) continue;
      assert.ok(chosen.some((y) => y.a.grants.some((g) => alts.includes(g.state))), `${c}/${mode}: ${x.skill.name} needs ${alts}`);
    }
  }
});

test('simulation respects cooldowns, MP and requirements', () => {
  const lo = E.recommendLoadout('ranger', { mode: 'pve' }, G);
  const all = [...lo.active.chosen, ...lo.stigma.chosen, ...lo.passive.chosen];
  const rot = E.buildRotation(all, {});
  assert.ok(rot.priority.every((x) => x.skill.type !== 'passive'));
  const tl = E.simulate(rot.priority, { seconds: 60, gcd: 1 });
  assert.ok(tl.length > 40);
  const last = {};
  for (const e of tl) {
    const a = E.analyze(e.skill);
    if (last[e.skill.id] !== undefined) assert.ok(e.t - last[e.skill.id] >= a.cdSec - 1e-9, `${e.skill.name} reused early`);
    last[e.skill.id] = e.t;
    assert.ok(e.mp >= 0);
  }
  // Burst Arrow can only appear after something applied Slow or Root.
  const burst = tl.find((e) => e.skill.name === 'Burst Arrow');
  if (burst) assert.ok(tl.some((e) => e.t < burst.t && ['Snare Shot', 'Explosion Trap'].includes(e.skill.name)));
});

test('leveling plan targets the next unlock and is sorted', () => {
  const lo = E.recommendLoadout('assassin', { mode: 'pve' }, G);
  const all = [...lo.active.chosen, ...lo.stigma.chosen];
  const id = all[0].skill.id;
  const plan = E.levelingPlan(all, { [id]: 8 }, { mode: 'pve' });
  const step = plan.find((p) => p.skill.id === id);
  if (step) assert.ok(step.to > 8);
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i - 1].score >= plan[i].score);
  assert.ok(plan.every((p) => p.cost > 0));
});

test('gear respects level and faction', () => {
  const best = E.bestForSlot('weapon', 'ranger', 30, G, 5, 'dark');
  assert.ok(best.length);
  assert.ok(best.every((b) => b.item.slot === 'bow' && b.item.level <= 30 && b.item.race !== 'light'));
  const neck = E.bestForSlot('necklace', 'assassin', 45, G, 3, 'light');
  assert.ok(neck.every((b) => !/Earrings$/.test(b.item.name)));
});

test('gear stats add base and enchant bonus', () => {
  const it = G.items.find((i) => i.base && i.ench && i.ench.length >= 5 && i.slot === 'dagger');
  const { total } = E.gearStats({ weapon: { id: it.id, enchant: 5 } }, G);
  const k = Object.keys(it.ench[4])[0];
  assert.strictEqual(total[k], (it.base[k] || 0) + it.ench[4][k]);
});

test('cleanText fixes template numbers', () => {
  assert.strictEqual(E.cleanText('a 3000% chance to inflict Blind for 3000.'), 'a 30% chance to inflict Blind for 3s.');
  assert.strictEqual(E.cleanText('Has a 13770007% chance'), 'Has a ? chance');
  assert.strictEqual(E.cleanText('100% chance on NPC'), '100% chance on NPC');
});

test('every skill and item icon is bundled', () => {
  const dir = path.join(__dirname, '../app/icons');
  const missing = [];
  for (const c of Object.values(G.classes)) for (const s of c.skills) if (!s.icon || !fs.existsSync(path.join(dir, s.icon + '.webp'))) missing.push(s.name);
  for (const i of G.items) if (!i.icon || !fs.existsSync(path.join(dir, i.icon + '.webp'))) missing.push(i.name);
  assert.deepStrictEqual(missing, []);
});
