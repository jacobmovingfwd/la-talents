// Toggled and one-off protocol systems, second batch. [beta]
//  Retractable Profile (SSC): while on, +1 difficulty on ranged and tech attacks against you and you're Slowed. Using the
//    system again, or Deactivate, turns it off. "Can't make attacks" and the Hidden-location bonus are table rulings.
//  HyperDense Armor (IPS-N): while on, Resistance to damage from attackers beyond Range 3, you deal half damage beyond
//    Range 3, and you're Slowed.
//  Siege Stabilizers (HA): while extended, +5 Range on ranged weapons and you're Immobilized (no melee and no attacks
//    within Range 5 are table rulings).
//  Auto-Cooler (HA): activate; at the start of your next turn you clear all heat if you haven't taken damage, moved or
//    overheated since.
//  Lightning Generator (HA): activation deals 2 energy to everything adjacent; at the start of a turn in the Danger Zone
//    it fires automatically for 4 AP energy and 1 Heat.
//  Plasma Gauntlet (HA): Danger Zone only; Agility save or 4d6 energy and Prone (half and no Prone on a save); you become
//    Stunned until the start of your next turn. The Heat back to you (half the damage dealt) is a table ruling.
//  Aceso Stabilizer (IPS-N): an ally within Range 5 gains Overshield equal to GRIT + 4 and Impaired/Jammed immunity.
//  ASURA-Class NHP (HA): choose two extra quick actions or one extra full action this turn.
// Toggles match the activation by item id and flip a flag on the mech. evaluate() functions are serialized, so each
// repeats the installed-and-working check.

import { card } from '../common.js';

const FLAG = (lid) => `toggle_${lid}`;
const RP_ID = 'sys-retractable-profile';
const HD_RES = 'sys-hyperdense-resist';
const HD_HALF = 'sys-hyperdense-half';
const SS_RANGE = 'sys-siege-stabilizers';
const AUTO_FLAG = 'autoCoolerArmed';
const ACESO_ID = 'sys-aceso-immunity';

async function toggle(a, token, lid, on, off) {
    const key = FLAG(lid);
    const active = !!a.getActorFlags(token.actor, key);
    if (active) {
        await off();
        await a.removeActorFlags(token.actor, { [key]: true });
    } else {
        await on();
        await a.addActorFlags(token.actor, { [key]: true });
    }
}

const slowEffect = (a, token, note) => a.applyEffectsToTokens({ tokens: [token], effectNames: ['slow'], note, notify: false });
const clearEffect = (a, token, note) => a.removeEffectsByNameFromTokens({ tokens: [token], effectNames: ['slow'], note });

export function registerSystemToggles(api) {
    api.registerDefaultItemReactions({
        'ms_retractable_profile': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Retractable Profile: toggle',
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
                    await toggle(a, reactorToken, 'retractable', async () => {
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: RP_ID, name: 'Retractable Profile (+1 difficulty vs ranged and tech)', type: 'difficulty', val: 1,
                            rollTypes: ['attack'], applyToTargetter: true,
                            condition: (state) => {
                                const w = state?.item;
                                if (!w) return true;
                                return String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE';
                            }
                        }, { duration: 'indefinite', origin: reactorToken });
                        await slowEffect(a, reactorToken, 'Retractable Profile');
                        await card(reactorToken.actor, 'RETRACTABLE PROFILE', `<b>${reactorToken.name}</b> pulls in: ranged and tech attacks against them get <b>+1 difficulty</b>, they're <b>Slowed</b> and can't attack. Use the system again to end it.`, 'compress-arrows-alt');
                    }, async () => {
                        await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === RP_ID);
                        await clearEffect(a, reactorToken, 'Retractable Profile');
                        await card(reactorToken.actor, 'RETRACTABLE PROFILE', `<b>${reactorToken.name}</b> extends their profile again.`, 'expand-arrows-alt');
                    });
                }
            }]
        },

        'ms_hyperdense_armor': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'HyperDense Armor: toggle',
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
                    const forceOff = /deactivate/i.test(String(data.actionName ?? ''));
                    const on = !!a.getActorFlags(reactorToken.actor, FLAG('hyperdense'));
                    if (forceOff && !on) return;
                    await toggle(a, reactorToken, 'hyperdense', async () => {
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: HD_RES, name: 'HyperDense Armor (Resistance beyond Range 3)', type: 'resistance', damageTypes: ['all'],
                            applyToCondition: (target, state, reactorTok) => {
                                const api = game.modules.get('lancer-automations')?.api;
                                const d = api?.getTokenDistance(reactorTok, target);
                                return typeof d === 'number' && d > 3;
                            }
                        }, { duration: 'indefinite', origin: reactorToken });
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: HD_HALF, name: 'HyperDense Armor (half damage beyond Range 3)', type: 'target_modifier', subtype: 'half_damage',
                            applyToCondition: (target, state, reactorTok) => {
                                const api = game.modules.get('lancer-automations')?.api;
                                const d = api?.getTokenDistance(reactorTok, target);
                                return typeof d === 'number' && d > 3;
                            }
                        }, { duration: 'indefinite', origin: reactorToken });
                        await slowEffect(a, reactorToken, 'HyperDense Armor');
                        await card(reactorToken.actor, 'HYPERDENSE ARMOR', `<b>${reactorToken.name}</b> hardens: Resistance to attacks from beyond Range 3, half damage dealt beyond Range 3, and <b>Slowed</b>. Deactivate with its action.`, 'shield-alt');
                    }, async () => {
                        await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === HD_RES || b?.id === HD_HALF);
                        await clearEffect(a, reactorToken, 'HyperDense Armor');
                        await card(reactorToken.actor, 'HYPERDENSE ARMOR', `<b>${reactorToken.name}</b> deactivates the armor.`, 'shield-alt');
                    });
                }
            }]
        },

        'ms_siege_stabilizers': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Siege Stabilizers: extend or retract',
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
                    await toggle(a, reactorToken, 'stabilizers', async () => {
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: SS_RANGE, name: 'Siege Stabilizers (+5 Range)', type: 'range', rangeType: 'Range', rangeMode: 'add', val: 5,
                            condition: (state) => {
                                const w = state?.item;
                                return !!w && w.type === 'mech_weapon' && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
                            }
                        }, { duration: 'indefinite', origin: reactorToken });
                        await a.applyEffectsToTokens({ tokens: [reactorToken], effectNames: ['immobilized'], note: 'Siege Stabilizers', notify: false });
                        await card(reactorToken.actor, 'SIEGE STABILIZERS', `<b>${reactorToken.name}</b> extends the stabilizers: ranged attacks gain <b>+5 Range</b>, but they're <b>Immobilized</b>, can't make melee attacks and can't attack anything within Range 5.`, 'anchor');
                    }, async () => {
                        await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === SS_RANGE);
                        await a.removeEffectsByNameFromTokens({ tokens: [reactorToken], effectNames: ['immobilized'], note: 'Siege Stabilizers' });
                        await card(reactorToken.actor, 'SIEGE STABILIZERS', `<b>${reactorToken.name}</b> retracts the stabilizers.`, 'anchor');
                    });
                }
            }]
        },

        'ms_auto_cooler': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Auto-Cooler: arm the protocol',
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
                        await a.addActorFlags(reactorToken.actor, { [AUTO_FLAG]: true });
                        await card(reactorToken.actor, 'AUTO-COOLER', `<b>${reactorToken.name}</b> primes the cooler: all heat clears at the start of their next turn unless they take damage, move or exceed their Heat Cap first.`, 'snowflake');
                    }
                },
                {
                    comments: 'Auto-Cooler: damage, movement or stress breaks it',
                    triggers: ['onDamage', 'onMove', 'onStress'],
                    triggerSelf: true, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (!a.getActorFlags(reactorToken.actor, 'autoCoolerArmed')) return false;
                        if (triggerType === 'onDamage') return data.target?.id === reactorToken.id && (data.damages ?? []).some(n => Number(n) > 0);
                        return data.triggeringToken?.id === reactorToken.id;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeActorFlags(reactorToken.actor, { [AUTO_FLAG]: true });
                        await card(reactorToken.actor, 'AUTO-COOLER', `<b>${reactorToken.name}</b>'s Auto-Cooler is interrupted.`, 'snowflake');
                    }
                },
                {
                    comments: 'Auto-Cooler: clear all heat at the start of your turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'autoCoolerArmed');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeActorFlags(reactorToken.actor, { [AUTO_FLAG]: true });
                        await reactorToken.actor.update({ 'system.heat.value': 0 });
                        await card(reactorToken.actor, 'AUTO-COOLER', `<b>${reactorToken.name}</b> clears <b>all heat</b>.`, 'snowflake');
                    }
                }
            ]
        },

        'ms_lightning_generator': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Lightning Generator: 2 energy to everything adjacent when activated',
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
                        const targets = a.getTokensInRange(reactorToken, { range: 1, includeDeployables: true });
                        await card(reactorToken.actor, 'LIGHTNING GENERATOR', `<b>${reactorToken.name}</b> discharges: <b>2 energy</b> to ${targets.length ? targets.map(t => t.name).join(', ') : 'nothing adjacent'}.`, 'bolt');
                        if (targets.length) await a.executeDamageRoll(reactorToken, targets, 2, 'Energy', 'Lightning Generator');
                    }
                },
                {
                    comments: 'Lightning Generator: fires automatically for 4 AP energy at the start of a turn in the Danger Zone',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                        return a.inDangerZone(reactorToken);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const targets = a.getTokensInRange(reactorToken, { range: 1, includeDeployables: true });
                        await card(reactorToken.actor, 'LIGHTNING GENERATOR', `<b>${reactorToken.name}</b> starts the turn in the Danger Zone: the generator fires on its own for <b>4 AP energy</b> and <b>1 Heat</b> to ${reactorToken.name}.`, 'bolt');
                        if (targets.length) await a.executeDamageRoll(reactorToken, targets, 4, 'Energy', 'Lightning Generator', { ap: true });
                        await a.executeDamageRoll(reactorToken, [reactorToken], 1, 'Heat', 'Lightning Generator');
                    }
                }
            ]
        },

        'ms_plasma_gauntlet': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Plasma Gauntlet: Danger Zone only, Agility save or 4d6 energy and Prone',
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
                    if (!a.inDangerZone(reactorToken)) return ui.notifications.warn('Plasma Gauntlet can only be used in the Danger Zone.');
                    const picked = await a.chooseToken(reactorToken, { title: 'PLASMA GAUNTLET', description: 'Choose an adjacent character.', range: 1, count: 1, includeSelf: false });
                    const target = picked?.[0];
                    if (!target) return;
                    await a.executeSaveVsEffect([target], {
                        stat: 'AGI', title: 'Plasma Gauntlet', origin: reactorToken, effects: ['prone'],
                        halfDamageOnSave: { value: '4d6', type: 'Energy', title: 'Plasma Gauntlet' }
                    });
                    await a.applyEffectsToTokens({ tokens: [reactorToken], effectNames: ['stunned'], note: 'Plasma Gauntlet', duration: a.untilStartOfTurn(reactorToken) });
                    await card(reactorToken.actor, 'PLASMA GAUNTLET', `<b>${reactorToken.name}</b> is <b>Stunned</b> until the start of their next turn. Take <b>Heat equal to half the damage dealt</b> (before reduction) yourself.`, 'fire');
                }
            }]
        },

        'ms_aceso_stabilizer': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Aceso Stabilizer: an ally within Range 5 gains Overshield (GRIT + 4) and Impaired/Jammed immunity',
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
                    const picked = await a.chooseToken(reactorToken, { title: 'ACESO STABILIZER', description: 'Choose an allied mech within Range 5.', range: 5, count: 1, includeSelf: false });
                    const target = picked?.[0];
                    if (!target) return;
                    const grit = Number(reactorToken.actor?.system?.grit ?? reactorToken.actor?.system?.pilot?.value?.system?.grit) || 0;
                    const amount = grit + 4;
                    const cur = Number(target.actor?.system?.overshield?.value) || 0;
                    await a.removeGlobalBonus(target.actor, (b) => b?.id === ACESO_ID);
                    await target.actor.update({ 'system.overshield.value': Math.max(cur, amount) });
                    await a.addGlobalBonus(target.actor, {
                        id: ACESO_ID, name: 'Aceso Stabilizer (immune to Impaired and Jammed)', type: 'immunity', subtype: 'effect', effects: ['Impaired', 'Jammed']
                    }, { duration: 'indefinite', origin: reactorToken });
                    await card(reactorToken.actor, 'ACESO STABILIZER', `<b>${target.name}</b> gains <b>${amount} Overshield</b> (GRIT ${grit} + 4) and is immune to Impaired and Jammed while it lasts. Remove the immunity bonus when the Overshield is gone.`, 'plus-square');
                }
            }]
        },

        'ms_asura_class_nhp': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'ASURA Protocol: two extra quick actions or one extra full action',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return /asura/i.test(String(data.actionName ?? ''));
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const { confirmed } = await a.askCard({
                        title: 'ASURA PROTOCOL',
                        description: `Take <b>two additional quick actions</b> or <b>one additional full action</b> this turn?`,
                        yesText: 'Two quick', noText: 'One full', owner: reactorToken, originToken: reactorToken
                    });
                    if (confirmed) { await a.gainAction(reactorToken, 'quick'); await a.gainAction(reactorToken, 'quick'); }
                    else await a.gainAction(reactorToken, 'full');
                    await card(reactorToken.actor, 'ASURA PROTOCOL', `<b>${reactorToken.name}</b> takes ${confirmed ? 'two additional quick actions' : 'one additional full action'}. They must still obey the duplicate-action restrictions.`, 'bolt');
                }
            }]
        }
    });
    console.info('la-talents | System toggles registered');
}
