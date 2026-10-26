// Brutal talent, ranks 1-3. [beta]
//  Rank 1, Predator: a natural 20 that is also a critical hit deals the maximum possible damage. The weapon's base
//    damage is replaced by its maximum (each die at full value); extra bonus-damage rows from other sources are still
//    rolled normally, so "maximum bonus damage" is not automated.
//  Rank 2, Cull the Herd: your critical hits gain Knockback 1, applied once the attack finishes.
//  Rank 3, Relentless: every attack that misses everything adds +1 Accuracy to your following attacks; the stack
//    persists until you hit something, then resets.

import { talentRank, card, hitResults, anyHit, flagNum } from './common.js';

const KEY = 'brutal';
const PREDATOR_ID = 'brutal-predator';
const RELENTLESS_ID = 'brutal-relentless';
const FLAG_STREAK = 'brutalStreak';

export const brutalRank = (actor) => talentRank(actor, KEY);

const nat20 = (roll) => !!roll?.dice?.some(d => d.faces === 20 && d.total === 20);

const maxOf = (val) => {
    try { return new Roll(String(val ?? 0)).evaluateSync({ maximize: true }).total ?? 0; }
    catch { return Number(val) || 0; }
};

async function predator(a, token, data) {
    const hit = hitResults(data).find(h => h?.hit && h.crit && nat20(h.roll));
    if (!hit || !data.weapon) return;
    const base = data.weapon.system?.active_profile?.damage ?? data.weapon.system?.damage ?? [];
    const rows = base.map(d => ({ val: String(maxOf(d.val)), type: d.type })).filter(d => Number(d.val) > 0);
    if (!rows.length) return;
    await a.removeGlobalBonus(token.actor, (b) => b?.id === PREDATOR_ID);
    await a.addGlobalBonus(token.actor, {
        id: PREDATOR_ID, name: 'Predator: maximum damage', type: 'damage', damageMode: 'replace', damage: rows, rollTypes: ['damage']
    }, { duration: 'indefinite', origin: token, consumption: { trigger: 'onDamage', evaluate: 'return true;' } });
    await card(token.actor, 'PREDATOR', `Natural 20 and a critical hit: <b>${token.name}</b> deals <b>maximum damage</b> (${rows.map(r => `${r.val} ${r.type}`).join(' + ')}).`, 'skull');
}

async function cull(a, token, data) {
    const crits = hitResults(data).filter(h => h?.hit && h.crit).map(h => h.target).filter(Boolean);
    if (!crits.length) return;
    const run = async () => {
        for (const t of crits) await a.knockBackToken([t], 1, { triggeringToken: token, actionName: 'Cull the Herd', title: 'CULL THE HERD: KNOCKBACK', description: 'Critical hit: Knockback 1.' });
    };
    if (!a.afterFlow(data, run)) await run();
}

async function setStreak(a, token, n) {
    await a.addActorFlags(token.actor, { [FLAG_STREAK]: n });
    await a.removeGlobalBonus(token.actor, (b) => b?.id === RELENTLESS_ID);
    if (n > 0) {
        await a.addGlobalBonus(token.actor, {
            id: RELENTLESS_ID, name: `Relentless +${n}`, type: 'accuracy', val: n, rollTypes: ['attack']
        }, { duration: 'indefinite', origin: token });
    }
}

export function registerBrutal(api) {
    api.registerDefaultGeneralReactions({
        'Brutal': {
            category: 'General',
            reactions: [
                {
                    comments: 'Brutal rank 1: Predator, and rank 2: Cull the Herd, on a critical hit',
                    triggers: ['onHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('brutal'));
                        if (!t) return false;
                        return (data.flowState?.data?.hit_results ?? []).some(h => h?.hit && h.crit);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        if (brutalRank(reactorToken.actor) >= 1) await predator(a, reactorToken, data);
                        if (brutalRank(reactorToken.actor) >= 2) await cull(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Brutal rank 3: Relentless builds on a full miss and resets on a hit',
                    triggers: ['onHit', 'onMiss'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('brutal'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        return !!data.flowState;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const hit = anyHit(data);
                        const n = flagNum(a, reactorToken.actor, FLAG_STREAK, 0);
                        if (hit && n > 0) {
                            await setStreak(a, reactorToken, 0);
                            await card(reactorToken.actor, 'RELENTLESS', `<b>${reactorToken.name}</b> connects: the stack of +${n} Accuracy ends.`, 'skull');
                        } else if (!hit) {
                            await setStreak(a, reactorToken, n + 1);
                            await card(reactorToken.actor, 'RELENTLESS', `<b>${reactorToken.name}</b> misses: following attacks gain <b>+${n + 1} Accuracy</b> until one hits.`, 'skull');
                        }
                    }
                }
            ]
        }
    });
    console.info('la-talents | Brutal registered');
}
