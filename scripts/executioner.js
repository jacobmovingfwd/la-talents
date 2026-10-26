// Executioner talent, ranks 1-3 (Heavy and Superheavy melee weapons). [beta]
//  Rank 1, Backswing Cut: 1/round, when you hit with a Heavy or Superheavy melee weapon you're offered a free attack
//    with the same weapon against a different character within Threat; it deals half damage.
//  Rank 2, Wide Arc Cleave: the first time each round you crit with a Heavy or Superheavy melee weapon, you pick the
//    characters within Threat (other than the target) who take 3 Kinetic. Objects aren't actors: apply their 3
//    Kinetic yourself (the chat card says so).
//  Rank 3, No Escape: 1/round, when a melee attack misses everything, you're offered a reroll with the same weapon
//    against a different character within Threat.
//  Line of sight to the new targets is not checked.

import { talentRank, card, weaponsOf, wType, wSize, characters, hitResults, anyHit } from './common.js';

const KEY = 'executioner';
export const executionerRank = (actor) => talentRank(actor, KEY);

const isHeavyMelee = (w) => !!w && w.type === 'mech_weapon' && wType(w) === 'MELEE' && ['heavy', 'superheavy'].includes(wSize(w));

const threatOf = (a, w) => a.getMaxWeaponRanges_WithBonus(w).Threat ?? 1;

async function otherTarget(a, token, weapon, exclude, title, description) {
    const near = characters(a, token, threatOf(a, weapon)).filter(t => !exclude.includes(t.id));
    if (!near.length) return null;
    const picked = await a.chooseToken(token, {
        range: threatOf(a, weapon), count: 1, includeSelf: false, selection: near, title, description
    });
    return picked?.[0] ?? null;
}

async function backswing(a, token, data) {
    const weapon = data.weapon;
    const hits = hitResults(data).filter(h => h?.hit).map(h => h.target?.id);
    const { confirmed } = await a.askCard({
        title: 'BACKSWING CUT',
        description: `Hit with <b>${weapon.name}</b>. Make another attack with it as a free action against a different character within Threat, for <b>half damage</b>?`,
        yesText: 'Swing back', noText: 'No', owner: token, originToken: token
    });
    if (!confirmed) return;
    const target = await otherTarget(a, token, weapon, hits, 'BACKSWING CUT', 'Choose a different character within Threat.');
    if (!target) return ui.notifications.warn('Backswing Cut: no other character within Threat.');
    if (!(await a.consumeOncePerRound(token, 'executioner_backswing'))) return;
    const id = `executioner-backswing-${target.id}`;
    await a.addGlobalBonus(token.actor, {
        id, name: 'Backswing Cut: half damage', type: 'target_modifier', subtype: 'half_damage',
        applyToCondition: `@@fn:(t) => t?.id === '${target.id}'`
    }, { duration: 'indefinite', origin: token });
    try { await a.attackWith(weapon, target); }
    finally { await a.removeGlobalBonus(token.actor, (b) => b?.id === id); }
}

async function cleave(a, token, data) {
    const crit = hitResults(data).find(h => h?.hit && h.crit && h.target);
    if (!crit) return;
    const weapon = data.weapon;
    const near = characters(a, token, threatOf(a, weapon)).filter(t => t.id !== crit.target.id);
    const { confirmed } = await a.askCard({
        title: 'WIDE ARC CLEAVE',
        description: `Critical hit with <b>${weapon.name}</b>. Deal <b>3 Kinetic</b> to characters and objects of your choice within Threat (other than ${crit.target.name})?`,
        yesText: 'Cleave', noText: 'No', owner: token, originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'executioner_cleave'))) return;
    let chosen = [];
    if (near.length) {
        chosen = await a.chooseToken(token, {
            range: threatOf(a, weapon), count: -1, includeSelf: false, selection: near, allowEmptyConfirm: true,
            title: 'WIDE ARC CLEAVE', description: 'Choose who takes 3 Kinetic.'
        }) ?? [];
    }
    if (chosen.length) await a.executeDamageRoll(token, chosen, 3, 'Kinetic', 'Wide Arc Cleave');
    await card(token.actor, 'WIDE ARC CLEAVE', `${chosen.length ? `<b>3 Kinetic</b> to ${chosen.map(t => t.name).join(', ')}.` : 'No characters hit.'} Objects within Threat of your choice also take <b>3 Kinetic</b> (apply by hand).`, 'axe');
}

async function noEscape(a, token, data) {
    const weapon = data.weapon;
    const missed = hitResults(data).map(h => h.target?.id);
    const { confirmed } = await a.askCard({
        title: 'NO ESCAPE',
        description: `<b>${weapon?.name ?? 'The attack'}</b> missed. Reroll it against a different character within Threat?`,
        yesText: 'Reroll', noText: 'No', owner: token, originToken: token
    });
    if (!confirmed) return;
    const target = await otherTarget(a, token, weapon, missed, 'NO ESCAPE', 'Choose a different character within Threat.');
    if (!target) return ui.notifications.warn('No Escape: no other character within Threat.');
    if (!(await a.consumeOncePerRound(token, 'executioner_no_escape'))) return;
    await a.attackWith(weapon, target);
}

export function registerExecutioner(api) {
    api.registerDefaultGeneralReactions({
        'Executioner': {
            category: 'General',
            reactions: [
                {
                    comments: 'Executioner rank 1: Backswing Cut and rank 2: Wide Arc Cleave',
                    triggers: ['onHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('executioner'));
                        if (!t) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon') return false;
                        if (String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE') return false;
                        return ['heavy', 'superheavy'].includes(String(w.system?.size ?? '').toLowerCase());
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const rank = executionerRank(reactorToken.actor);
                        const run = async () => {
                            if (rank >= 2 && a.checkGate(reactorToken, 'executioner_cleave')) await cleave(a, reactorToken, data);
                            if (a.checkGate(reactorToken, 'executioner_backswing')) await backswing(a, reactorToken, data);
                        };
                        if (!a.afterFlow(data, run)) await run();
                    }
                },
                {
                    comments: 'Executioner rank 3: No Escape reroll after a melee miss',
                    triggers: ['onMiss'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('executioner'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE') return false;
                        if ((data.flowState?.data?.hit_results ?? []).some(h => h?.hit)) return false;
                        return a.checkGate(reactorToken, 'executioner_no_escape');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const run = () => noEscape(a, reactorToken, data);
                        if (!a.afterFlow(data, run)) await run();
                    }
                }
            ]
        }
    });
    console.info('la-talents | Executioner registered');
}

export { isHeavyMelee, weaponsOf, anyHit };
