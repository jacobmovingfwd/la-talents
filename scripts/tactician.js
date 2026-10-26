// Tactician talent, ranks 1-3. [beta]
//  Rank 1, Opportunist: 1/round, +1 Accuracy on a melee attack if at least one allied character is Engaged with the
//    target (constant bonus with a once-per-round gate). "Engaged with" = an ally of your disposition that is adjacent
//    to the target and carries the Engaged status.
//  Rank 2, Solar Backdrop: 1/round, +1 Accuracy on a ranged attack made from a higher elevation than the target
//    (constant bonus, compares token elevations).
//  Rank 3, Overlapping Fire (Flank): 1/round reaction, when an allied character hits a character, you may shoot that
//    character with Overwatch for half damage. Cover is not checked: the prompt reminds you the target must not have
//    cover from your position. Your own weapons in Range only.

import { talentRank, card, weaponsOf, hasRange, hitResults } from './common.js';

const KEY = 'tactician';
export const tacticianRank = (actor) => talentRank(actor, KEY);

// Self-contained on purpose: serialized by lancer-automations.
const OPPORTUNIST = {
    id: 'tactician-opportunist',
    name: 'Tactician (Opportunist)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    frequency: 'round',
    condition: (state) => {
        const w = state?.item;
        return (w && w.type === 'mech_weapon' && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE')
            || String(state?.data?.attack_type ?? '').toLowerCase() === 'melee';
    },
    applyToCondition: (target, state, reactorToken) => {
        const api = game.modules.get('lancer-automations')?.api;
        return canvas.tokens.placeables.some(t => t.id !== reactorToken.id && t.id !== target.id && t.actor
            && t.document.disposition === reactorToken.document.disposition
            && (t.actor.statuses?.has?.('engaged') || t.actor.system?.statuses?.engaged)
            && api.getTokenDistance(t, target) <= 1);
    }
};

const SOLAR = {
    id: 'tactician-solar-backdrop',
    name: 'Tactician (Solar Backdrop)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    frequency: 'round',
    condition: (state) => {
        const w = state?.item;
        if (!w || w.type !== 'mech_weapon') return false;
        return String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE'
            && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
    },
    applyToCondition: (target, state, reactorToken) => (reactorToken?.document?.elevation ?? 0) > (target?.document?.elevation ?? 0)
};

export async function syncTacticianMech(api, mech) {
    const rank = tacticianRank(mech);
    for (const [bonus, need] of [[OPPORTUNIST, 1], [SOLAR, 2]]) {
        const has = api.getConstantBonuses(mech).some(b => b.id === bonus.id);
        const should = rank >= need;
        if (should && !has) await api.addConstantBonus(mech, bonus);
        else if (!should && has) await api.removeConstantBonus(mech, bonus.id);
    }
}

async function flank(a, token, ally, target) {
    const dist = a.getTokenDistance(token, target);
    const weapons = weaponsOf(token.actor).filter(w => hasRange(w) && w.system?.loaded !== false
        && (a.getMaxWeaponRanges_WithBonus(w).Range ?? 0) >= dist);
    if (!weapons.length) return;
    const { confirmed } = await a.askCard({
        title: 'FLANK',
        description: `<b>${ally.name}</b> hit <b>${target.name}</b>. If they have no cover from your position, spend your Reaction to shoot them with Overwatch for <b>half damage, Heat or Burn</b>?`,
        yesText: 'Flank', noText: 'No', owner: token, originToken: token, relatedToken: target
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'tactician_flank'))) return;
    await a.setReaction(token, false);
    let weapon = weapons[0];
    if (weapons.length > 1) {
        const pick = await a.startChoiceCard({
            title: 'FLANK', icon: 'fas fa-crosshairs',
            description: `Choose the weapon to fire at <b>${target.name}</b>.`,
            originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(token),
            choices: weapons.map(w => ({ text: w.name, icon: 'fas fa-crosshairs', callback: async () => {} }))
        });
        weapon = weapons[pick?.choiceIdx];
        if (!weapon) return;
    }
    const id = `tactician-half-${target.id}`;
    await a.addGlobalBonus(token.actor, {
        id, name: 'Flank: half damage', type: 'target_modifier', subtype: 'half_damage',
        applyToCondition: `@@fn:(t) => t?.id === '${target.id}'`
    }, { duration: 'indefinite', origin: token });
    try { await a.attackWith(weapon, target); }
    finally { await a.removeGlobalBonus(token.actor, (b) => b?.id === id); }
}

export function registerTactician(api) {
    api.registerDefaultGeneralReactions({
        'Tactician': {
            category: 'General',
            reactions: [
                {
                    comments: 'Tactician rank 3: Flank after an ally hits a character',
                    triggers: ['onHit'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('tactician'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        const ally = data.triggeringToken;
                        if (!ally || ally.id === reactorToken.id || ally.document.disposition !== reactorToken.document.disposition) return false;
                        const hit = (data.hitTokens ?? []).find(x => x.id !== reactorToken.id && x.document.disposition !== reactorToken.document.disposition);
                        return !!hit && a.checkGate(reactorToken, 'tactician_flank');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const target = (data.hitTokens ?? []).find(x => x.id !== reactorToken.id && x.document.disposition !== reactorToken.document.disposition);
                        if (target) await flank(a, reactorToken, data.triggeringToken, target);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Tactician registered');
}

export { hitResults };
