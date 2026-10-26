// Timed protocols and quick-action systems, applied as temporary bonuses or effects when you activate them. [beta]
//  Active Camouflage (SSC): Invisible until you take damage or the end of your next turn.
//  Core Siphon (SSC): +1 Accuracy on your first attack this turn, +1 difficulty on every other attack until turn end.
//  Type-3 Projected Shield (GMS): nominate a character; attacks between you and them get +2 difficulty until the
//    start of your next turn.
//  Hunter Lock (HORUS): choose a character; your first successful attack against them each round deals +3 bonus damage
//    for the rest of the scene (the target is replaced when you choose again).
//  Ramjet (IPS-N): until the start of your next turn, +2 spaces on Boost and Knockback +2 on melee attacks. The
//    straight-line movement restriction is a table ruling.
// Each reaction matches the activation by item id (these actions have no name of their own). evaluate() functions are
// serialized, so each repeats the installed-and-working check.

import { card } from '../common.js';

const CAMO_NOTE = 'Active Camouflage';
const SIPHON_ACC = 'sys-core-siphon-accuracy';
const SIPHON_DIFF = 'sys-core-siphon-difficulty';
const FLAG_SIPHON = 'coreSiphonArmed';
const SHIELD_ID = 'sys-type3-shield';
const HLOCK_ID = 'sys-hunter-lock';
const RAMJET_BOOST = 'sys-ramjet-boost';
const RAMJET_KNOCK = 'sys-ramjet-knockback';

export function registerSystemProtocols(api) {
    api.registerDefaultItemReactions({
        'ms_active_camouflage': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Active Camouflage: Invisible until you take damage or the end of your next turn',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return data.item?.id === item.id;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    await a.applyEffectsToTokens({
                        tokens: [reactorToken], effectNames: ['invisible'], note: CAMO_NOTE, duration: a.untilEndOfTurn(reactorToken)
                    }, {
                        stack: 1, consumption: { trigger: 'onDamage', originId: reactorToken.id, role: 'target' }
                    });
                    await card(reactorToken.actor, 'ACTIVE CAMOUFLAGE', `<b>${reactorToken.name}</b> is <b>Invisible</b> until they take damage or the end of their next turn.`, 'user-secret');
                }
            }]
        },

        'ms_core_siphon': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Core Siphon: arm +1 Accuracy for the first attack this turn',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                        return data.item?.id === item.id;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === SIPHON_ACC || b?.id === SIPHON_DIFF);
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: SIPHON_ACC, name: 'Core Siphon (+1 Accuracy)', type: 'accuracy', val: 1, rollTypes: ['attack'],
                            uses: 1, consumeOnUsage: true
                        }, { duration: 'end', durationTurns: 0, origin: reactorToken });
                        await a.addActorFlags(reactorToken.actor, { [FLAG_SIPHON]: true });
                        await card(reactorToken.actor, 'CORE SIPHON', `<b>${reactorToken.name}</b>: <b>+1 Accuracy</b> on the first attack roll this turn, then <b>+1 difficulty</b> on every other attack until the end of the turn.`, 'bolt');
                    }
                },
                {
                    comments: 'Core Siphon: after the first attack, +1 difficulty on the rest of the turn',
                    triggers: ['onAttack'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'coreSiphonArmed');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_SIPHON]: true });
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: SIPHON_DIFF, name: 'Core Siphon (+1 difficulty)', type: 'difficulty', val: 1, rollTypes: ['attack']
                        }, { duration: 'end', durationTurns: 0, origin: reactorToken });
                    }
                }
            ]
        },

        'ms_type_3_projected_shield': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Type-3 Projected Shield: nominate a character, +2 difficulty on attacks between you both',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return data.item?.id === item.id;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const picked = await a.chooseToken(reactorToken, {
                        title: 'PROJECT SHIELD', description: 'Nominate a character within line of sight.',
                        range: Number(reactorToken.actor?.system?.sensor_range) || 10, count: 1, includeSelf: false
                    });
                    const target = picked?.[0];
                    if (!target) return;
                    const id = `${SHIELD_ID}:${reactorToken.id}`;
                    for (const t of canvas.tokens.placeables) if (t.actor) await a.removeGlobalBonus(t.actor, (b) => b?.id === id);
                    const opts = { duration: 'start', durationTurns: 1, origin: reactorToken };
                    await a.addGlobalBonus(reactorToken.actor, { id, name: 'Projected Shield (+2 difficulty vs nominee)', type: 'difficulty', val: 2, rollTypes: ['attack'], applyTo: [target.id] }, opts);
                    await a.addGlobalBonus(target.actor, { id, name: 'Projected Shield (+2 difficulty vs shielder)', type: 'difficulty', val: 2, rollTypes: ['attack'], applyTo: [reactorToken.id] }, opts);
                    await card(reactorToken.actor, 'PROJECT SHIELD', `Attacks between <b>${reactorToken.name}</b> and <b>${target.name}</b> gain <b>+2 difficulty</b> until the start of ${reactorToken.name}'s next turn.`, 'shield-alt');
                }
            }]
        },

        'ms_hunter_lock': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Hunter Lock: +3 bonus damage on your first successful attack against the chosen character each round',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return data.item?.id === item.id;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const picked = await a.chooseToken(reactorToken, {
                        title: 'HUNTER LOCK', description: 'Choose a character within Sensors.',
                        range: Number(reactorToken.actor?.system?.sensor_range) || 10, count: 1, includeSelf: false
                    });
                    const target = picked?.[0];
                    if (!target) return;
                    await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === HLOCK_ID);
                    await a.addGlobalBonus(reactorToken.actor, {
                        id: HLOCK_ID, name: `Hunter Lock (${target.name}, +3 damage)`, type: 'damage', damageMode: 'add',
                        damage: [{ type: 'Variable', val: '3' }], rollTypes: ['damage'], applyTo: [target.id], frequency: 'round'
                    }, { duration: 'encounter', origin: reactorToken });
                    await card(reactorToken.actor, 'HUNTER LOCK', `<b>${reactorToken.name}</b> locks on to <b>${target.name}</b>: the first successful attack each round deals <b>+3 bonus damage</b> for the rest of the scene.`, 'crosshairs');
                }
            }]
        },

        'ms_ramjet': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Ramjet: +2 Boost and melee Knockback 2 until the start of your next turn',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return data.item?.id === item.id;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === RAMJET_BOOST || b?.id === RAMJET_KNOCK);
                    const opts = { duration: 'start', durationTurns: 1, origin: reactorToken };
                    await a.addGlobalBonus(reactorToken.actor, { id: RAMJET_BOOST, name: 'Ramjet (+2 Boost)', type: 'movement_extra', subtype: 'boost', val: 2 }, opts);
                    await a.addGlobalBonus(reactorToken.actor, {
                        id: RAMJET_KNOCK, name: 'Ramjet (Knockback 2)', type: 'tag', tagId: 'tg_knockback', tagName: 'Knockback', tagMode: 'add', val: 2,
                        rollTypes: ['attack'],
                        condition: (state) => {
                            const w = state?.item;
                            if (!w) return true; // Ram, Grapple and other basic melee attacks
                            return w.type === 'mech_weapon' && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE';
                        }
                    }, opts);
                    await card(reactorToken.actor, 'RAMJET', `<b>${reactorToken.name}</b> lights the ramjet until the start of their next turn: <b>+2 spaces</b> on Boost and melee attacks gain <b>Knockback 2</b>. Table ruling: you must move your full Speed in a straight line.`, 'rocket');
                }
            }]
        }
    });
    console.info('la-talents | System protocols registered');
}
