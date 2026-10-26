// Heavy Gunner talent, ranks 1-3. [beta]
//  Rank 1, Covering Fire (quick action, hooked to the sheet's Covering Fire action): pick a character within LOS, 10
//    spaces and Range of one of your Heavy ranged weapons. They're Impaired until the start of your next turn. If they
//    move more than 1 space you may attack them as a reaction with a Heavy ranged weapon for half damage, then the
//    effect ends. Only one target at a time (a new use replaces the old one). It also ends if they damage you.
//    The reaction is offered at the end of their move, not mid-path; line of sight is not checked.
//  Rank 2, Hammerbeat: if that reaction attack hits, the target is Immobilized until the end of their next turn.
//  Rank 3, Bracketing Fire: Covering Fire can pick two targets; each triggers and resolves separately.

import { talentRank, card, weaponsOf, wType, wSize, characters } from './common.js';

const KEY = 'heavy_gunner';
const FLAG = 'heavyCoverTargets';

export const heavyGunnerRank = (actor) => talentRank(actor, KEY);

const isHeavyRanged = (w) => !!w && w.type === 'mech_weapon' && ['heavy', 'superheavy'].includes(wSize(w))
    && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');

const heavyWeapons = (token) => weaponsOf(token.actor).filter(isHeavyRanged);

const targetsOf = (a, actor) => a.getActorFlags(actor, FLAG) ?? [];

async function clearTarget(a, token, targetId) {
    const left = targetsOf(a, token.actor).filter(id => id !== targetId);
    if (left.length) await a.addActorFlags(token.actor, { [FLAG]: left });
    else await a.removeActorFlags(token.actor, { [FLAG]: true });
    const t = canvas.tokens.get(targetId);
    if (t) await a.removeEffectsByNameFromTokens({ tokens: [t], effectNames: ['impaired'], notify: false });
}

async function clearAll(a, token) {
    for (const id of [...targetsOf(a, token.actor)]) await clearTarget(a, token, id);
}

async function coveringFire(a, token) {
    const weapons = heavyWeapons(token);
    if (!weapons.length) return ui.notifications.warn(`Covering Fire: ${token.name} has no Heavy ranged weapon.`);
    await clearAll(a, token);
    const reach = characters(a, token, 10).filter(t => weapons.some(w => (a.getMaxWeaponRanges_WithBonus(w).Range ?? 0) >= a.getTokenDistance(token, t)));
    if (!reach.length) return ui.notifications.warn('Covering Fire: no character within 10 spaces and weapon Range.');
    const count = heavyGunnerRank(token.actor) >= 3 ? 2 : 1;
    const picked = await a.chooseToken(token, {
        range: 10, count, includeSelf: false, selection: reach,
        title: 'COVERING FIRE', description: count === 2 ? 'Choose up to two targets.' : 'Choose a target.'
    });
    if (!picked?.length) return;
    await a.applyEffectsToTokens({ tokens: picked, effectNames: ['impaired'], note: 'Covering Fire', duration: { label: 'indefinite' } });
    await a.addActorFlags(token.actor, { [FLAG]: picked.map(t => t.id) });
    await card(token.actor, 'COVERING FIRE', `<b>${picked.map(t => t.name).join(', ')}</b> ${picked.length > 1 ? 'are' : 'is'} <b>Impaired</b> until the start of ${token.name}'s next turn. If they move more than 1 space, ${token.name} may shoot for half damage.`, 'shield-halved');
}

async function fireOn(a, token, target) {
    const dist = a.getTokenDistance(token, target);
    const weapons = heavyWeapons(token).filter(w => w.system?.loaded !== false && (a.getMaxWeaponRanges_WithBonus(w).Range ?? 0) >= dist);
    if (!weapons.length) {
        await card(token.actor, 'COVERING FIRE', `<b>${target.name}</b> moved, but no Heavy ranged weapon can reach them.`, 'shield-halved');
        return;
    }
    const { confirmed } = await a.askCard({
        title: 'COVERING FIRE',
        description: `<b>${target.name}</b> moved more than 1 space. Spend your Reaction to shoot them with a Heavy ranged weapon for <b>half damage, Heat or Burn</b>?`,
        yesText: 'Fire', noText: 'Hold', owner: token, originToken: token, relatedToken: target
    });
    if (!confirmed) return;
    await a.setReaction(token, false);
    let weapon = weapons[0];
    if (weapons.length > 1) {
        const pick = await a.startChoiceCard({
            title: 'COVERING FIRE', icon: 'fas fa-crosshairs',
            description: `Choose the weapon to fire at <b>${target.name}</b>.`,
            originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(token),
            choices: weapons.map(w => ({ text: w.name, icon: 'fas fa-crosshairs', callback: async () => {} }))
        });
        weapon = weapons[pick?.choiceIdx];
        if (!weapon) return;
    }
    const id = `heavygunner-half-${target.id}`;
    await a.addGlobalBonus(token.actor, {
        id, name: 'Covering Fire: half damage', type: 'target_modifier', subtype: 'half_damage',
        applyToCondition: `@@fn:(t) => t?.id === '${target.id}'`
    }, { duration: 'indefinite', origin: token });
    let hit = false;
    try {
        const res = await a.attackWith(weapon, target);
        hit = !!res?.flow?.state?.data?.hit_results?.some(h => h?.hit);
    } finally {
        await a.removeGlobalBonus(token.actor, (b) => b?.id === id);
    }
    await clearTarget(a, token, target.id);
    if (hit && heavyGunnerRank(token.actor) >= 2) {
        await a.applyEffectsToTokens({ tokens: [target], effectNames: ['immobilized'], note: 'Hammerbeat', duration: { label: 'end', turns: 1, rounds: 0 } });
        await card(token.actor, 'HAMMERBEAT', `<b>${target.name}</b> is hit and <b>Immobilized</b> until the end of their next turn.`, 'shield-halved');
    }
}

export function registerHeavyGunner(api) {
    api.registerDefaultGeneralReactions({
        'Heavy Gunner': {
            category: 'General',
            reactions: [
                {
                    comments: 'Heavy Gunner rank 1: the Covering Fire quick action',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('heavy_gunner'));
                        return !!t && String(data.actionName ?? '').toLowerCase() === 'covering fire';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await coveringFire(a, reactorToken);
                    }
                },
                {
                    comments: 'Heavy Gunner rank 1: a Covering Fire target moves more than 1 space',
                    triggers: ['onMove'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const ids = a.getActorFlags(reactorToken.actor, 'heavyCoverTargets') ?? [];
                        if (!ids.includes(data.triggeringToken?.id)) return false;
                        return (Number(data.distanceMoved) || 0) > 1;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await fireOn(a, reactorToken, data.triggeringToken);
                    }
                },
                {
                    comments: 'Heavy Gunner rank 1: Covering Fire ends if the target damages you',
                    triggers: ['onHit', 'onTechHit'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const ids = a.getActorFlags(reactorToken.actor, 'heavyCoverTargets') ?? [];
                        if (!ids.includes(data.triggeringToken?.id)) return false;
                        return (data.hitTokens ?? []).some(t => t.id === reactorToken.id);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await clearTarget(a, reactorToken, data.triggeringToken.id);
                        await card(reactorToken.actor, 'COVERING FIRE', `<b>${data.triggeringToken.name}</b> hit ${reactorToken.name}: Covering Fire on them ends.`, 'shield-halved');
                    }
                },
                {
                    comments: 'Heavy Gunner: Covering Fire ends at the start of your next turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return (a.getActorFlags(reactorToken.actor, 'heavyCoverTargets') ?? []).length > 0;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await clearAll(a, reactorToken);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Heavy Gunner registered');
}

export { wType };
