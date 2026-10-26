// Combined Arms talent, ranks 1-3. [beta]
//  Rank 1, Shield of Blades: while you're Engaged, you and allies adjacent to you count as having soft cover.
//    Done per attack: when someone attacks you or an adjacent ally while you carry the Engaged status, a temporary
//    "soft cover" target modifier is put on the attacker, limited to those characters, and removed when the attack
//    ends. (If the attack roll window has already opened before the modifier lands, the cover is missed: tell me.)
//  Rank 2, CQB-Trained: the Difficulty Lancer adds for being Engaged is cancelled by a +1 Accuracy constant bonus on
//    ranged attacks while you carry the Engaged status.
//  Rank 3, Storm of Violence: hitting with a melee attack gives +1 Accuracy on your next ranged attack against that
//    character, and hitting with a ranged attack gives +1 on your next melee attack against them. Doesn't stack: one
//    pending bonus at a time, kept as a flag on your mech and cleared when the matching attack is made.

import { talentRank, card, relation, hitResults, wType } from './common.js';

const KEY = 'combined_arms';
const CQB_ID = 'combined-arms-cqb-trained';
const STORM_ID = 'combined-arms-storm';
const FLAG_STORM = 'caStorm';

export const combinedArmsRank = (actor) => talentRank(actor, 'combined');

// Self-contained on purpose: serialized by lancer-automations.
const CQB_TRAINED = {
    id: CQB_ID,
    name: 'Combined Arms (CQB-Trained)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    condition: (state) => {
        const a = state?.actor;
        if (!a || !(a.statuses?.has?.('engaged') || a.system?.statuses?.engaged)) return false;
        const w = state?.item;
        const melee = (w && w.type === 'mech_weapon' && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE')
            || String(state?.data?.attack_type ?? '').toLowerCase() === 'melee';
        return !melee;
    }
};

const STORM = {
    id: STORM_ID,
    name: 'Combined Arms (Storm of Violence)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    condition: (state) => {
        const f = state?.actor?.getFlag?.('la-talents', 'caStorm');
        if (!f) return false;
        const w = state?.item;
        const melee = (w && w.type === 'mech_weapon' && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE')
            || String(state?.data?.attack_type ?? '').toLowerCase() === 'melee';
        return f.kind === (melee ? 'melee' : 'ranged');
    },
    applyToCondition: (target, state, reactorToken) => {
        const f = reactorToken?.actor?.getFlag?.('la-talents', 'caStorm');
        return !!f && f.targetId === target?.id;
    }
};

export async function syncCombinedArmsMech(api, mech) {
    const rank = combinedArmsRank(mech);
    for (const [bonus, need] of [[CQB_TRAINED, 2], [STORM, 3]]) {
        const has = api.getConstantBonuses(mech).some(b => b.id === bonus.id);
        const should = rank >= need;
        if (should && !has) await api.addConstantBonus(mech, bonus);
        else if (!should && has) await api.removeConstantBonus(mech, bonus.id);
    }
}

const isMeleeAttack = (data) => wType(data.weapon) === 'MELEE' || String(data.attackType ?? '').toLowerCase() === 'melee';

async function shield(a, guard, data) {
    const attacker = data.triggeringToken;
    if (!attacker) return;
    const covered = canvas.tokens.placeables.filter(t => t.actor && !t.document.hidden
        && (t.id === guard.id || (relation(a, guard, t) === 'friendly' && a.getTokenDistance(guard, t) <= 1)));
    const ids = covered.map(t => t.id);
    const targeted = (data.targets ?? []).map(x => x?.target ?? x).filter(t => ids.includes(t?.id));
    if (!targeted.length) return;
    const id = `combined-arms-cover-${guard.id}`;
    await a.removeGlobalBonus(attacker.actor, (b) => b?.id === id);
    await a.addGlobalBonus(attacker.actor, {
        id, name: 'Shield of Blades', type: 'target_modifier', subtype: 'soft_cover',
        applyToCondition: `@@fn:(target) => ${JSON.stringify(ids)}.includes(target?.id)`
    }, { duration: 'indefinite', origin: guard });
    const drop = () => a.removeGlobalBonus(attacker.actor, (b) => b?.id === id);
    if (!a.afterFlow(data, drop)) setTimeout(drop, 20000);
}

async function storm(a, token, data) {
    const rank = combinedArmsRank(token.actor);
    if (rank < 3) return;
    const kind = isMeleeAttack(data) ? 'ranged' : 'melee';
    const hits = hitResults(data).filter(h => h?.hit && h.target);
    if (!hits.length) return;
    await token.actor.setFlag('la-talents', FLAG_STORM, { targetId: hits[0].target.id, kind });
    await card(token.actor, 'STORM OF VIOLENCE', `<b>${token.name}</b> hits <b>${hits[0].target.name}</b>: +1 Accuracy on the next <b>${kind}</b> attack against them.`, 'khanda');
}

async function stormSpent(a, token, data) {
    const f = token.actor.getFlag('la-talents', FLAG_STORM);
    if (!f) return;
    const kind = isMeleeAttack(data) ? 'melee' : 'ranged';
    const targets = (data.targets ?? []).map(x => x?.target ?? x);
    if (f.kind === kind && targets.some(t => t?.id === f.targetId)) await token.actor.unsetFlag('la-talents', FLAG_STORM);
}

export function registerCombinedArms(api) {
    api.registerDefaultGeneralReactions({
        'Combined Arms': {
            category: 'General',
            reactions: [
                {
                    comments: 'Combined Arms rank 1: soft cover for you and adjacent allies while Engaged',
                    triggers: ['onInitAttack'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (data.weapon?.system?.disabled || data.weapon?.system?.destroyed) return false;   // the attack will be refused anyway
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('combined'));
                        if (!t) return false;
                        if (!(reactorToken.actor.statuses?.has?.('engaged') || reactorToken.actor.system?.statuses?.engaged)) return false;
                        return (data.targets ?? []).length > 0;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await shield(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Combined Arms rank 3: remember the hit for the next attack of the other kind',
                    triggers: ['onHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('combined'));
                        return !!t && (Number(t.system?.curr_rank) || 1) >= 3;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await storm(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Combined Arms rank 3: spend the pending Storm of Violence bonus',
                    triggers: ['onAttack'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!reactorToken.actor?.getFlag?.('la-talents', 'caStorm');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await stormSpent(a, reactorToken, data);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Combined Arms registered');
}
