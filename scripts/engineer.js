// Engineer talent, ranks 1-3. [beta]
//  A GM-side sync creates the Prototype Weapon for your rank (I, II, III: Main, Limited, Overkill, 1d6+2 / 1d6+2 /
//  1d6+4) in its own Integrated mount, and upgrades it on a rank-up while keeping your type, damage type and range.
//  The refit you do on a Full Repair (and on demand):
//      game.modules.get('la-talents').api.refitPrototype()          (uses the selected token)
//    - Choose a weapon type (Melee, CQB, Rifle, Cannon, Launcher, Nexus) and damage type (Kinetic, Explosive, Energy).
//      Range becomes Threat 1 for Melee and Range 10 for everything else.
//    - Limited is rerolled: 1d6+2 at ranks 1-2, 2d6 at rank 3 (Final Draft). The weapon is refilled to that many uses.
//    - Rank 2+: pick two of Tweaked Optics (+1 Accuracy: a constant bonus keyed on the weapon), Tweaked Computer
//      (the weapon gains the Smart tag), Stripped Reactor Shielding (a reminder only: choose the area when attacking).
//    The Full Repair hook offers the refit automatically. Rank 3's 1d6+4 damage is on the item the sync creates.

import { talentRank, card, tokenOf, ensureIntegratedMount, dropIntegratedMount } from './common.js';

const KEY = 'engineer';
const OPTICS_ID = 'engineer-tweaked-optics';

export const engineerRank = (actor) => talentRank(actor, KEY);

const TYPES = ['Melee', 'CQB', 'Rifle', 'Cannon', 'Launcher', 'Nexus'];
const DAMAGE = ['Kinetic', 'Explosive', 'Energy'];
const OPTIONS = ['Tweaked Optics', 'Tweaked Computer', 'Stripped Reactor Shielding'];

// Self-contained on purpose: serialized by lancer-automations.
const TWEAKED_OPTICS = {
    id: OPTICS_ID,
    name: 'Engineer (Tweaked Optics)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    condition: (state) => {
        const w = state?.item;
        return !!w && String(w.system?.lid ?? '').startsWith('mw_prototype') && !!w.getFlag?.('la-talents', 'optics');
    }
};

const LIMITED = { 1: '1d6+2', 2: '1d6+2', 3: '2d6' };
const DAMAGE_VAL = { 1: '1d6+2', 2: '1d6+2', 3: '1d6+4' };
const EFFECT = 'This weapon is an experimental prototype, customized according to your specific requirements. When you install it, or during a Full Repair, you may choose a new weapon type, damage type, and either Threat 1 (melee) or Range 10 (all other types). Each Full Repair, reroll its Limited uses. Use the "Refit Prototype" macro (la-talents api.refitPrototype) or accept the Full Repair prompt.';

const PROTOTYPE = (rank) => ({
    name: ['Prototype Weapon I', 'Prototype Weapon II', 'Prototype Weapon III'][rank - 1],
    type: 'mech_weapon',
    img: 'systems/lancer/assets/icons/mech_weapon.svg',
    system: {
        lid: `mw_prototype_${rank}`,
        size: 'Main',
        profiles: [{
            name: 'Prototype', type: 'Rifle',
            damage: [{ val: DAMAGE_VAL[rank], type: 'Kinetic' }],
            range: [{ type: 'Range', val: 10 }],
            tags: [{ lid: 'tg_limited', val: 3 }, { lid: 'tg_overkill', val: 1 }],
            description: '', effect: EFFECT, on_attack: '', on_hit: '', on_crit: '', cost: 0,
            skirmishable: true, barrageable: true, actions: [], bonuses: [], synergies: [], counters: []
        }]
    }
});

// GM sync: the Lancer system doesn't hand out talent items outside of a COMP/CON import, so create the right
// Prototype Weapon for the rank, slot it in its own Integrated mount, and carry the old one's setup over on a rank-up.
export async function syncEngineerMech(api, mech) {
    const rank = Math.min(3, engineerRank(mech));
    const owned = mech.items.filter(i => i.type === 'mech_weapon' && /^mw_prototype_\d$/.test(String(i.system?.lid ?? '')));
    const want = rank >= 1 ? `mw_prototype_${rank}` : null;

    const has = api.getConstantBonuses(mech).some(b => b.id === OPTICS_ID);
    if (rank >= 2 && !has) await api.addConstantBonus(mech, TWEAKED_OPTICS);
    else if (rank < 2 && has) await api.removeConstantBonus(mech, OPTICS_ID);

    if (!want) {
        if (owned.length) { await dropIntegratedMount(mech, owned.map(i => i.id)); await mech.deleteEmbeddedDocuments('Item', owned.map(i => i.id)); }
        return;
    }
    let current = owned.find(i => i.system.lid === want);
    const stale = owned.filter(i => i !== current);
    if (!current) {
        const data = PROTOTYPE(rank);
        const old = stale[0]?._source?.system?.profiles?.[0];
        if (old) {
            const p = data.system.profiles[0];
            p.type = old.type; p.range = old.range;
            p.damage = p.damage.map(d => ({ ...d, type: old.damage?.[0]?.type ?? d.type }));
            p.tags = old.tags;
        }
        const [created] = await mech.createEmbeddedDocuments('Item', [data]);
        current = created;
    }
    if (current) await ensureIntegratedMount(mech, current.id, stale.map(i => i.id));
    if (stale.length) await mech.deleteEmbeddedDocuments('Item', stale.map(i => i.id));
}

const prototypeOf = (actor) => actor.items.find(i => i.type === 'mech_weapon' && String(i.system?.lid ?? '').startsWith('mw_prototype'));

async function pick(a, token, title, description, labels) {
    const r = await a.startChoiceCard({
        title, icon: 'fas fa-screwdriver-wrench', description,
        originToken: token, userIdControl: a.getTokenOwnerUserId(token),
        choices: labels.map(text => ({ text, icon: 'fas fa-gear', callback: async () => {} }))
    });
    return labels[r?.choiceIdx] ?? null;
}

export async function refitPrototype(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Refit: select the Engineer token first.');
    const rank = engineerRank(token.actor);
    if (rank < 1) return ui.notifications.warn(`Refit: ${token.name}'s pilot does not have Engineer.`);
    const gun = prototypeOf(token.actor);
    if (!gun) return ui.notifications.warn(`Refit: ${token.name} has no Prototype Weapon item.`);

    const type = await pick(a, token, 'PROTOTYPE: WEAPON TYPE', `Choose a weapon type for <b>${gun.name}</b>.`, TYPES);
    if (!type) return;
    const dmg = await pick(a, token, 'PROTOTYPE: DAMAGE TYPE', 'Choose the damage type.', DAMAGE);
    if (!dmg) return;

    let options = [];
    if (rank >= 2) {
        const first = await pick(a, token, 'PROTOTYPE: REVISION (1 of 2)', 'Choose the first of two tweaks.', OPTIONS);
        if (!first) return;
        const second = await pick(a, token, 'PROTOTYPE: REVISION (2 of 2)', 'Choose the second tweak.', OPTIONS.filter(o => o !== first));
        if (!second) return;
        options = [first, second];
    }

    const roll = await new Roll(rank >= 3 ? '2d6' : '1d6+2').evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: token.actor }), flavor: 'Prototype: Limited uses' });
    const uses = roll.total;

    const profiles = foundry.utils.deepClone(gun._source.system.profiles);
    const p = profiles[0];
    p.type = type;
    p.damage = (p.damage?.length ? p.damage : [{ val: '1d6+2', type: dmg }]).map(d => ({ ...d, type: dmg }));
    p.range = type === 'Melee' ? [{ type: 'Threat', val: 1 }] : [{ type: 'Range', val: 10 }];
    p.tags = (p.tags ?? []).filter(t => t.lid !== 'tg_limited' && t.lid !== 'tg_smart');
    p.tags.push({ lid: 'tg_limited', val: uses });
    if (options.includes('Tweaked Computer')) p.tags.push({ lid: 'tg_smart', val: 1 });
    await gun.update({ 'system.profiles': profiles, 'system.uses': uses });
    await gun.setFlag('la-talents', 'optics', options.includes('Tweaked Optics'));

    await card(token.actor, 'PROTOTYPE REFIT',
        `<b>${gun.name}</b>: <b>${type}</b>, <b>${dmg}</b>, ${type === 'Melee' ? 'Threat 1' : 'Range 10'}, Limited <b>${uses}</b>.`
        + (options.length ? `<br>Tweaks: ${options.join(', ')}.` : '')
        + (options.includes('Stripped Reactor Shielding') ? `<br><i>Stripped shielding: when attacking you may pay 2 Heat for ${type === 'Melee' ? 'Burst 1' : 'Cone 3, Line 5 or Blast 1 (Range 10)'}; apply by hand.</i>` : ''),
        'screwdriver-wrench');
}

export function registerEngineer(api) {
    api.registerDefaultGeneralReactions({
        'Engineer': {
            category: 'General',
            reactions: [
                {
                    comments: 'Engineer: refit the prototype on a Full Repair',
                    triggers: ['onFullRepair'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('engineer'));
                        return !!t;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const { confirmed } = await a.askCard({
                            title: 'PROTOTYPE REFIT',
                            description: 'Full Repair: refit your Prototype Weapon (type, damage, tweaks) and reroll its Limited uses?',
                            yesText: 'Refit', noText: 'Later', owner: reactorToken, originToken: reactorToken
                        });
                        if (confirmed) await refitPrototype(a, reactorToken);
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), refitPrototype: (token) => refitPrototype(api, token) };
    console.info('la-talents | Engineer registered');
}
