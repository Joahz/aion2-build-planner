/* global GAME, Engine */
'use strict';

const G = window.GAME;
const E = window.Engine;
const STORE = 'a2bp-v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const skillById = (cls, id) => G.classes[cls].skills.find((s) => s.id === id);
const itemById = new Map(G.items.map((i) => [i.id, i]));
const TYPE_LABEL = { active: 'Actives', stigma: 'Stigmas', passive: 'Passives' };

// ---- State -------------------------------------------------------------------

function newProfile(cls = 'assassin') {
  return {
    id: Math.random().toString(36).slice(2, 10), name: 'My ' + G.classes[cls].name, class: cls, level: 45,
    mode: 'pve', focus: 'single', race: 'light', loadout: null, levels: {}, gear: {}, keys: {},
    sim: { gcd: 1, seconds: 30 },
  };
}
let state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && Array.isArray(s.profiles) && s.profiles.length) {
      s.profiles.forEach((p) => { p.race = p.race || 'light'; p.sim = p.sim || { gcd: 1, seconds: 30 }; });
      return s;
    }
  } catch {}
  const p = newProfile();
  return { profiles: [p], current: p.id, tab: 'loadout' };
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
const P = () => state.profiles.find((p) => p.id === state.current) || state.profiles[0];

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 1800);
}

// The profile's loadout, or the recommendation when the user hasn't customised it.
function currentLoadout(p) {
  const rec = E.recommendLoadout(p.class, p, G);
  const ctx = { mode: p.mode, focus: p.focus, picks: E.buildPicks(p.class, G) };
  const out = {};
  for (const type of Object.keys(E.LOADOUT)) {
    if (p.loadout && p.loadout[type]) {
      out[type] = p.loadout[type].map((id) => skillById(p.class, id)).filter(Boolean).map((s) => {
        const r = rec[type].chosen.concat(rec[type].bench).find((x) => x.skill.id === s.id);
        return r || E.scoreSkill(s, ctx);
      });
    } else out[type] = rec[type].chosen;
  }
  return { out, rec };
}
function setLoadout(p, lo) {
  p.loadout = { active: lo.active.map((x) => x.skill.id), stigma: lo.stigma.map((x) => x.skill.id), passive: lo.passive.map((x) => x.skill.id) };
}
const flatLoadout = (lo) => [...lo.active, ...lo.stigma, ...lo.passive];
const initials = (name) => name.split(/[\s']+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Game icons live in app/icons/<name>.webp. If one is missing, the <img> is
// swapped for coloured initials (handled by the error listener below).
function skillIcon(s) {
  return `<div class="ic ${s.type}" title="${esc(s.name)}">${s.icon ? `<img src="icons/${esc(s.icon)}.webp" alt="" data-fallback="${esc(initials(s.name))}">` : esc(initials(s.name))}</div>`;
}
function itemIcon(i, size = 'sm') {
  if (!i || !i.icon) return '';
  return `<img class="item-ic ${size} gr-${esc(i.grade)}" src="icons/${esc(i.icon)}.webp" alt="" data-fallback="">`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-fallback')) return;
  const text = img.getAttribute('data-fallback');
  if (text) img.replaceWith(document.createTextNode(text)); else img.remove();
}, true);

// ---- Sidebar -----------------------------------------------------------------

function renderSide() {
  const p = P();
  $('profileSel').innerHTML = state.profiles.map((x) =>
    `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)} — ${esc(G.classes[x.class].name)} ${x.level}</option>`).join('');
  $('fName').value = p.name;
  $('fClass').value = p.class;
  $('fLevel').value = p.level;
  for (const [id, key] of [['fRace', 'race'], ['fMode', 'mode'], ['fFocus', 'focus']]) {
    $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === p[key]));
  }
  const c = G.classes[p.class];
  $('classCard').innerHTML = `<b>${esc(c.name)}</b> · ${esc(c.role)} · ${esc(c.weapon)}<br><br>${esc(c.summary)}
    <br><br><b>Stat priority:</b> ${esc(c.guide.suggestedStats.join(' > '))}`;
}

$('fName').oninput = (e) => { P().name = e.target.value || 'Unnamed'; save(); renderSide(); };
$('fClass').onchange = (e) => {
  const p = P();
  if (p.class === e.target.value) return;
  Object.assign(p, { class: e.target.value, loadout: null, levels: {}, gear: {}, keys: {} });
  save(); render();
};
$('fLevel').onchange = (e) => { P().level = Math.max(1, Math.min(45, +e.target.value || 1)); save(); render(); };
for (const [id, key] of [['fRace', 'race'], ['fMode', 'mode'], ['fFocus', 'focus']]) {
  $(id).onclick = (e) => { const v = e.target.dataset.v; if (!v) return; P()[key] = v; save(); render(); };
}
$('profileSel').onchange = (e) => { state.current = e.target.value; save(); render(); };
$('btnNew').onclick = () => { const p = newProfile(P().class); state.profiles.push(p); state.current = p.id; save(); render(); };
$('btnDup').onclick = () => {
  const p = JSON.parse(JSON.stringify(P())); p.id = newProfile().id; p.name += ' (copy)';
  state.profiles.push(p); state.current = p.id; save(); render();
};
$('btnDel').onclick = () => {
  if (state.profiles.length === 1) { toast('You need at least one character'); return; }
  if (!confirm(`Delete "${P().name}"?`)) return;
  state.profiles = state.profiles.filter((p) => p.id !== state.current);
  state.current = state.profiles[0].id; save(); render();
};
$('btnExport').onclick = () => {
  const p = P();
  const blob = new Blob([JSON.stringify({ app: 'aion2-build-planner', profile: p }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[^\w -]/g, '') || 'character'}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};
$('fileImport').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const p = data.profile;
    if (!p || !G.classes[p.class]) throw new Error('bad file');
    const clean = Object.assign(newProfile(p.class), {
      name: String(p.name || 'Imported').slice(0, 40), level: Math.max(1, Math.min(45, +p.level || 45)),
      race: p.race === 'dark' ? 'dark' : 'light', mode: p.mode === 'pvp' ? 'pvp' : 'pve', focus: p.focus === 'aoe' ? 'aoe' : 'single',
      loadout: p.loadout || null, levels: p.levels || {}, gear: p.gear || {}, keys: p.keys || {},
    });
    state.profiles.push(clean); state.current = clean.id; save(); render(); toast('Character imported');
  } catch { toast("That file isn't a planner character"); }
};

// ---- Tabs --------------------------------------------------------------------

$('tabs').onclick = (e) => { const t = e.target.dataset.tab; if (!t) return; state.tab = t; save(); render(); };

function render() {
  renderSide();
  const tab = state.tab || 'loadout';
  $('tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  ({ loadout: viewLoadout, gear: viewGear, rotation: viewRotation, macros: viewMacros, builds: viewBuilds, about: viewAbout }[tab] || viewLoadout)();
}

// ---- Skills & leveling -------------------------------------------------------

let selectedSkill = null;

function skillRow(x, p, { inLoadout, type }) {
  const s = x.skill;
  const lvl = p.levels[s.id] || 1;
  return `<div class="skill ${selectedSkill === s.id ? 'sel' : ''}" data-skill="${esc(s.id)}">
    ${skillIcon(s)}
    <div><div class="nm">${esc(s.name)}</div><div class="why">${esc(x.why.slice(0, 3).join(' · '))}</div></div>
    <div class="row">
      ${s.type !== 'passive' && inLoadout ? `<input type="number" min="1" max="${E.MAX_LEVEL[s.type]}" value="${lvl}" data-level="${esc(s.id)}" title="Your skill level">` : ''}
      <button class="small" data-${inLoadout ? 'remove' : 'add'}="${esc(s.id)}" data-type="${type}">${inLoadout ? '−' : '+'}</button>
    </div>
  </div>`;
}

function viewLoadout() {
  const p = P();
  const { out, rec } = currentLoadout(p);
  const chosenIds = new Set(flatLoadout(out).map((x) => x.skill.id));
  const plan = E.levelingPlan(flatLoadout(out), p.levels, p);
  const sel = selectedSkill && skillById(p.class, selectedSkill);

  let cols = '';
  for (const type of Object.keys(E.LOADOUT)) {
    const n = out[type].length, max = E.LOADOUT[type];
    const bench = rec[type].chosen.concat(rec[type].bench).filter((x) => !chosenIds.has(x.skill.id))
      .sort((a, b) => b.score - a.score);
    cols += `<div class="card">
      <div class="row spread"><h3>${TYPE_LABEL[type]}</h3><span class="count ${n === max ? 'full' : n > max ? 'over' : ''}">${n} / ${max}</span></div>
      ${out[type].map((x) => skillRow(x, p, { inLoadout: true, type })).join('')}
      ${bench.length ? `<details><summary class="muted small-text">Not equipped (${bench.length})</summary>
        ${bench.map((x) => skillRow(x, p, { inLoadout: false, type })).join('')}</details>` : ''}
    </div>`;
  }

  $('view').innerHTML = `
    <div class="row spread">
      <h2>Loadout <span class="muted small-text">${p.loadout ? 'customised' : 'recommended for ' + p.mode.toUpperCase() + ', ' + (p.focus === 'aoe' ? 'AoE' : 'single target')}</span></h2>
      <button class="primary" id="btnRecommend">Use recommended loadout</button>
    </div>
    <p class="note">Click a skill for details. Enter your current skill levels so the leveling plan knows what you've unlocked.</p>
    <div class="grid3">${cols}</div>
    <div class="grid2" style="margin-top:16px">
      <div class="card"><h3>What to level next</h3>
        ${plan.length ? `<ol class="steps">${plan.slice(0, 8).map((st) => `<li>
          <b>${esc(st.skill.name)}</b> <span class="muted">Lv ${st.from} → ${st.to} (${st.cost} level${st.cost > 1 ? 's' : ''})</span><br>
          ${st.unlocks.map((u) => `<span class="chip good">${esc(u)}</span>`).join('')}
          ${st.boosts.length ? `<div class="small-text muted">Also +${st.boosts.reduce((a, b) => a + b.plus, 0)} levels available from Daevanion: ${esc(st.boosts.map((b) => b.board).join(', '))}</div>` : ''}
        </li>`).join('')}</ol>` : '<p class="muted">Every equipped skill has all its upgrades unlocked.</p>'}
        <p class="note">Ranked by how much each unlock helps (cooldowns, crits and damage first${p.mode === 'pvp' ? ', crowd control boosted for PvP' : ''}) divided by the levels it costs.</p>
      </div>
      <div class="card detail" id="skillDetail">${sel ? skillDetail(sel, p) : '<p class="muted">Select a skill to see its full tooltip and upgrades.</p>'}</div>
    </div>`;

  $('btnRecommend').onclick = () => { p.loadout = null; save(); render(); toast('Recommended loadout applied'); };
  $('view').onclick = (e) => {
    const add = e.target.dataset.add, rem = e.target.dataset.remove, type = e.target.dataset.type;
    if (add || rem) {
      const lo = currentLoadout(p).out;
      if (add) {
        if (lo[type].length >= E.LOADOUT[type]) { toast(`Remove a ${type} skill first (max ${E.LOADOUT[type]})`); return; }
        lo[type].push(E.scoreSkill(skillById(p.class, add), { mode: p.mode, focus: p.focus, picks: {} }));
      } else lo[type] = lo[type].filter((x) => x.skill.id !== rem);
      setLoadout(p, lo); save(); render(); return;
    }
    const row = e.target.closest('[data-skill]');
    if (row && !e.target.matches('input')) { selectedSkill = row.dataset.skill; render(); }
  };
  $('view').onchange = (e) => {
    const id = e.target.dataset.level;
    if (!id) return;
    const s = skillById(p.class, id);
    p.levels[id] = Math.max(1, Math.min(E.MAX_LEVEL[s.type], +e.target.value || 1));
    save(); render();
  };
}

function skillDetail(s, p) {
  const lvl = p.levels[s.id] || 1;
  const a = E.analyze(s);
  const facts = [
    s.cd ? `${s.cd / 1000}s cooldown` : 'no cooldown', s.mp ? `${s.mp} MP` : null,
    s.range ? `${s.range / 100}m range` : null, a.aoe ? 'hits up to 4' : null,
  ].filter(Boolean);
  return `<div class="row">${skillIcon(s)}
      <div><h2 style="margin:0">${esc(s.name)}</h2><span class="muted">${esc(s.type)} · ${esc(facts.join(' · '))}</span></div></div>
    <p>${esc(E.cleanText(s.desc))}</p>
    ${s.specs.length ? `<h3 style="margin-top:12px">Upgrades by skill level</h3>
      ${s.specs.map((sp) => `<div class="spec ${sp.lvl <= lvl ? 'on' : 'off'}"><span class="lv">Lv ${sp.lvl}</span><span>${esc(sp.text)}</span></div>`).join('')}` : ''}
    ${a.requires.length ? `<p class="small-text"><b>Needs target:</b> ${esc(a.requires.map((g) => g.join(' or ')).join(', '))}</p>` : ''}
    ${a.grants.length ? `<p class="small-text"><b>Applies:</b> ${esc(a.grants.map((g) => g.state).join(', '))}</p>` : ''}
    ${s.boosts.length ? `<p class="small-text muted">Daevanion nodes that add levels: ${esc(s.boosts.map((b) => `${b.board} (+${b.plus})`).join(', '))}</p>` : ''}`;
}

// ---- Gear --------------------------------------------------------------------

function itemLabel(i) { return `${i.name} · ${i.grade} · Lv ${i.level} · iLvl ${i.ilvl}`; }

function viewGear() {
  const p = P();
  const race = p.race || 'light';
  const plan = E.upgradePlan(p.gear, p.class, p.level, G, race);
  const bySlot = Object.fromEntries(plan.map((x) => [x.slot, x]));
  const { total, unknown } = E.gearStats(p.gear, G);
  const rows = E.GEAR_SLOTS.map(([slot, label]) => {
    const options = E.itemsForSlot(slot, p.class, 0, G, race).sort((a, b) => (b.ilvl || 0) - (a.ilvl || 0) || a.name.localeCompare(b.name));
    const cur = p.gear[slot];
    const best = E.bestForSlot(slot, p.class, p.level, G, 3, race);
    const gap = bySlot[slot].gap;
    return `<tr>
      <td><b>${esc(label)}</b></td>
      <td><div class="row">${itemIcon(cur && itemById.get(cur.id))}<select data-slot="${slot}"><option value="">— empty —</option>
        ${options.map((i) => `<option value="${esc(i.id)}" ${cur && cur.id === i.id ? 'selected' : ''} ${i.level > p.level ? 'disabled' : ''}>${esc(itemLabel(i))}</option>`).join('')}
      </select></div></td>
      <td><input type="number" min="0" max="20" value="${cur ? cur.enchant || 0 : 0}" data-ench="${slot}" ${cur ? '' : 'disabled'} title="Enchant level"></td>
      <td>${best.length ? `<div class="row" style="align-items:flex-start">${itemIcon(best[0].item)}<div><span class="grade-${esc(best[0].item.grade)}">${esc(best[0].item.name)}</span>
        <span class="muted small-text">iLvl ${best[0].item.ilvl}</span>
        ${best[0].item.drops ? `<div class="small-text muted">Drops from ${esc(best[0].item.drops.join(', '))}</div>` : ''}
        ${best.length > 1 ? `<div class="small-text muted">or ${best.slice(1).map((b) => `${esc(b.item.name)} (${b.item.ilvl})`).join(', ')}</div>` : ''}</div></div>` : '<span class="muted">—</span>'}</td>
      <td>${gap > 0 ? `<span class="up">+${gap}</span>` : '<span class="muted">✓</span>'}</td>
    </tr>`;
  }).join('');
  const upgrades = plan.filter((x) => x.gap > 0 && x.best).slice(0, 6);
  const statRows = Object.entries(total).map(([k, v]) => E.fmtStat(k, v, G)).sort((a, b) => a.label.localeCompare(b.label));

  $('view').innerHTML = `
    <h2>Gear</h2>
    <p class="note">Pick what you're wearing and its enchant level. "Best at your level" ranks gear you can equip at Lv ${p.level} by item level, then by ${esc(G.classes[p.class].guide.suggestedStats.slice(0, 3).join(', '))}.</p>
    <div class="grid2">
      <div class="card"><table>
        <thead><tr><th>Slot</th><th>Equipped</th><th>+</th><th>Best at your level</th><th>iLvl gain</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div>
        <div class="card"><h3>Upgrade these first</h3>
          ${upgrades.length ? `<ol class="steps">${upgrades.map((u) => `<li>${itemIcon(u.best)} <b>${esc(u.label)}</b>: <span class="grade-${esc(u.best.grade)}">${esc(u.best.name)}</span>
            <span class="up">+${u.gap} iLvl</span>${u.current ? `<div class="small-text muted">replaces ${esc(u.current.name)}</div>` : ''}</li>`).join('')}</ol>`
            : '<p class="muted">You have the best item level available in every slot. Push enchants next.</p>'}
        </div>
        <div class="card"><h3>Stats from gear</h3>
          ${statRows.length ? `<table>${statRows.map((r) => `<tr><td>${esc(r.label)}</td><td style="text-align:right">${esc(r.value)}</td></tr>`).join('')}</table>`
            : '<p class="muted">Equip items to see their combined stats.</p>'}
          ${unknown.length ? `<p class="note">No stat data for: ${esc(unknown.join(', '))} (only Heroic/Mythic gear and Unique weapons have full stats in the database).</p>` : ''}
        </div>
      </div>
    </div>`;

  $('view').onchange = (e) => {
    const slot = e.target.dataset.slot, ench = e.target.dataset.ench;
    if (slot) { if (e.target.value) p.gear[slot] = { id: e.target.value, enchant: 0 }; else delete p.gear[slot]; }
    if (ench && p.gear[ench]) p.gear[ench].enchant = Math.max(0, Math.min(20, +e.target.value || 0));
    save(); render();
  };
  $('view').onclick = null;
}

// ---- Rotation ----------------------------------------------------------------

function rotationFor(p) {
  const lo = currentLoadout(p).out;
  const rot = E.buildRotation(flatLoadout(lo), p);
  const tl = E.simulate(rot.priority, { gcd: p.sim.gcd, seconds: p.sim.seconds });
  return { lo, rot, tl };
}

const GROUP_INFO = {
  precombat: ['Before the pull', 'Out-of-combat setup'],
  buffs: ['1. Buffs', 'Use at the start of every burst window'],
  setup: ['2. Setup', 'Apply the states your big hits need or benefit from'],
  payoff: ['3. Big hits', 'Highest damage first'],
  reactive: ['When it lights up', 'Proc and conditional skills — press as soon as they become usable'],
  filler: ['4. Filler', 'Spam between cooldowns (the first one listed takes priority)'],
  defensive: ['Defensive', 'Not part of the rotation — save for CC breaks and danger'],
};

function viewRotation() {
  const p = P();
  const { rot, tl } = rotationFor(p);
  const groups = Object.entries(GROUP_INFO).filter(([g]) => rot.groups[g].length).map(([g, [title, note]]) => `
    <div class="group"><h4>${esc(title)}</h4><div class="small-text muted">${esc(note)}</div>
      ${rot.groups[g].map((x) => `<span class="chip with-ic">${x.skill.icon ? `<img src="icons/${esc(x.skill.icon)}.webp" alt="" data-fallback="">` : ''}${esc(x.skill.name)}${x.a.cdSec ? ` · ${x.a.cdSec}s` : ''}</span>`).join('')}</div>`).join('');
  $('view').innerHTML = `
    <h2>Rotation — ${p.focus === 'aoe' ? 'AoE / packs' : 'single target'}</h2>
    <p class="note">Built from your equipped skills: buffs first, then skills that set up states your hitters need (Stun, Slow, Precision, Insignias…), then the biggest hits, with filler in between.</p>
    <div class="grid2">
      <div class="card"><h3>Priority</h3>${groups}</div>
      <div class="card"><h3>Priority list</h3>
        <ol class="steps">${rot.priority.map((x) => `<li>${x.skill.icon ? `<img class="item-ic" style="width:22px;height:22px;margin-right:4px" src="icons/${esc(x.skill.icon)}.webp" alt="" data-fallback="">` : ''}<b>${esc(x.skill.name)}</b>
          <span class="muted small-text">${x.a.requires.length ? 'only when target has ' + esc(x.a.requires.map((g) => g.join('/')).join(', ')) : x.a.prefers.length ? 'better with ' + esc(x.a.prefers.join(', ')) : ''}</span></li>`).join('')}</ol>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="row spread"><h3>First ${p.sim.seconds} seconds (simulated)</h3>
        <div class="row small-text">Seconds per skill
          <select id="simGcd">${[0.8, 1, 1.2, 1.5].map((g) => `<option ${g === p.sim.gcd ? 'selected' : ''}>${g}</option>`).join('')}</select>
          Length <select id="simLen">${[20, 30, 60].map((g) => `<option ${g === p.sim.seconds ? 'selected' : ''}>${g}</option>`).join('')}</select>s
        </div></div>
      <div class="timeline">${tl.map((e) => `<span class="tl"><b>${e.t}s</b>${e.skill.icon ? `<img src="icons/${esc(e.skill.icon)}.webp" alt="" data-fallback="">` : ''}${esc(e.skill.name)}</span>`).join('')}</div>
      <p class="note">Assumes each press takes the same time (cast times aren't published), MP starts full and every hit lands. Use it to learn the order, not as an exact DPS figure.</p>
    </div>`;
  $('simGcd').onchange = (e) => { p.sim.gcd = +e.target.value; save(); render(); };
  $('simLen').onchange = (e) => { p.sim.seconds = +e.target.value; save(); render(); };
  $('view').onclick = null; $('view').onchange = null;
}

// ---- Macros ------------------------------------------------------------------

function viewMacros() {
  const p = P();
  const { lo, rot, tl } = rotationFor(p);
  const usable = flatLoadout(lo).filter((x) => x.skill.type !== 'passive');
  const defaults = ['1', '2', '3', '4', '5', '6', '7', '8', 'Q', 'E', 'R', 'F'];
  usable.forEach((x, i) => { if (!p.keys[x.skill.id]) p.keys[x.skill.id] = defaults[i] || ''; });
  const seqs = E.macroSequences(rot, tl, p.keys);
  $('view').innerHTML = `
    <h2>Macros &amp; key sequences</h2>
    <p class="note">Set the key each skill is bound to in game, and the sequences below update to match. Copy them to practise, to keep on a second screen, or to paste into the game's macro window if your client has one. This app never presses keys for you: automated input is against the game's rules.</p>
    <div class="card"><h3>Your keybinds</h3><div class="keys">
      ${usable.map((x) => `<label><span class="row">${skillIcon(x.skill)}${esc(x.skill.name)}</span><input maxlength="12" value="${esc(p.keys[x.skill.id])}" data-key="${esc(x.skill.id)}"></label>`).join('')}
    </div></div>
    <div class="card">${seqs.map((m, i) => `<div class="macro">
      <div class="row spread"><div><b>${esc(m.name)}</b> <span class="muted small-text">${esc(m.note)}</span></div>
        <button class="small" data-copy="${i}">Copy</button></div>
      <code>${esc(m.seq)}</code></div>`).join('')}</div>`;
  $('view').onchange = (e) => {
    const id = e.target.dataset.key;
    if (id) { p.keys[id] = e.target.value.trim(); save(); render(); }
  };
  $('view').onclick = async (e) => {
    const i = e.target.dataset.copy;
    if (i === undefined) return;
    try { await navigator.clipboard.writeText(`${seqs[i].name}: ${seqs[i].seq}`); toast('Copied'); } catch { toast('Copy failed'); }
  };
}

// ---- Community builds --------------------------------------------------------

function viewBuilds() {
  const p = P();
  const lo = currentLoadout(p).out;
  const mine = new Set(flatLoadout(lo).map((x) => x.skill.id));
  const builds = G.builds.filter((b) => b.class === p.class).sort((a, b) => b.views - a.views);
  $('view').innerHTML = `
    <h2>Community builds — ${esc(G.classes[p.class].name)}</h2>
    <p class="note">Public builds from the gamers4.life build calculator (snapshot ${esc((G.builds[0] || {}).updated || '').slice(0, 10)}). The recommendations already give a bonus to skills these builds use.</p>
    ${builds.length ? builds.map((b) => {
      const skills = b.skills.map((id) => skillById(p.class, id)).filter(Boolean);
      const overlap = skills.filter((s) => mine.has(s.id)).length;
      const gear = Object.values(b.gear || {}).map((g) => g.name);
      return `<div class="card">
        <div class="row spread"><div><b>${esc(b.title)}</b> <span class="muted">by ${esc(b.author)} · ${b.views} views</span></div>
          <div class="row"><span class="muted small-text">${overlap}/${skills.length} skills match yours</span>
          ${skills.length >= 8 ? `<button class="small" data-apply="${b.id}">Use these skills</button>` : ''}</div></div>
        <div>${skills.map((s) => `<span class="chip with-ic ${mine.has(s.id) ? 'good' : ''}">${s.icon ? `<img src="icons/${esc(s.icon)}.webp" alt="" data-fallback="">` : ''}${esc(s.name)}</span>`).join('')}</div>
        ${gear.length ? `<details><summary class="muted small-text">Gear (${gear.length})</summary><div class="small-text">${esc([...new Set(gear)].join(', '))}</div></details>` : ''}
      </div>`;
    }).join('') : `<div class="card"><p class="muted">No public ${esc(G.classes[p.class].name)} builds with skills chosen yet. Recommendations use the skill data alone.</p></div>`}`;
  $('view').onclick = (e) => {
    const id = e.target.dataset.apply;
    if (!id) return;
    const b = G.builds.find((x) => String(x.id) === id);
    const lo2 = { active: [], stigma: [], passive: [] };
    for (const sid of b.skills) {
      const s = skillById(p.class, sid);
      if (s && lo2[s.type].length < E.LOADOUT[s.type]) lo2[s.type].push(sid);
    }
    p.loadout = lo2; save(); state.tab = 'loadout'; render(); toast(`Loaded skills from "${b.title}"`);
  };
  $('view').onchange = null;
}

// ---- About -------------------------------------------------------------------

function viewAbout() {
  $('view').innerHTML = `<div class="card" style="max-width:760px">
    <h2>About this planner</h2>
    <p>Everything is entered by you, so the planner never reads the game client and can't put your account at risk.</p>
    <p><b>Where the data comes from:</b> skills, items, Daevanion boosts and community builds are a snapshot of the fan database at
      <a href="https://gamers4.life/aion-2/database/en/" target="_blank">gamers4.life</a>. It covers ${G.items.length} Assassin/Ranger items
      and every Assassin and Ranger skill.</p>
    <p><b>How "best" is decided:</b> NCSOFT doesn't publish combat formulas. So:</p>
    <ul>
      <li>Skills are ranked by the damage and cooldown in their tooltip, what they enable for your other skills (Stun → Shadow Fall, Slow → Burst Arrow, Precision → Deadshot) and how often community builds use them.</li>
      <li>Gear is ranked by item level, then by your class's stat priority.</li>
      <li>The rotation is a priority list checked with a simple simulation.</li>
    </ul>
    <p>Treat the results as a strong starting point, then adjust with what you see in game.</p>
    <p><b>Known gaps:</b> no cast times, no per-level damage tables, and full stats only for Heroic/Mythic gear and Unique weapons.</p>
    <p class="muted small-text">Fan-made tool. Not affiliated with NCSOFT. Aion 2 is a trademark of NCSOFT Corporation.</p>
  </div>`;
  $('view').onclick = null; $('view').onchange = null;
}

render();
