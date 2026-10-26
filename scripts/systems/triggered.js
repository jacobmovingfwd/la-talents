// Triggered system automations, registered as item activations keyed by the system's LID. [beta]
//  Kinetic Compensator (SSC): a missed ranged attack gives your next ranged attack +1 Accuracy.
//  Type-I Flight System (GMS): at the end of your turn you say whether you flew; if so, Size +1 Heat.
//  Explosive Vents (HA): clearing all heat or taking stress unleashes a Burst 1 for 2 Heat and 2 Burn (1/round).
//  Deep Well Heat Sink (HA): start your turn in the Danger Zone, gain Resistance to heat until end of turn.
//  Reactive Weave (SSC): Bracing makes you Invisible until the end of your next turn and offers a free move of up to
//    your Speed.
//  Stable Structure (GMS): +1 Accuracy on a Hull or Agility save to avoid Prone or Knockback. Saves whose title or
//    source names Prone or Knockback get it automatically; any other Hull or Agility save asks first.
//  Armor-Lock Plating (IPS-N): Bracing gives +1 difficulty against you and Prone immunity until the end of your next turn.
//  Roland Chamber (IPS-N): after a reload, your next Loading weapon attack deals +1d6 explosive.
//  Siege Ram (IPS-N): a Ram that hits deals 2 kinetic damage. (The 10 AP against objects and terrain is a table ruling.)
//  Synthetic Muscle Netting (IPS-N): a card on Ram and Grapple showing the Size you count as against each target.
//  Flicker Field Projector (SSC): after a voluntary move you gain the Invisible status, removed after the next attack
//    against you resolves (hit or miss). Only one instance at a time.
//  External Batteries (HA): the system is destroyed when you take structure damage, with 1d6 AP explosive damage that
//    can't be reduced.
// Every evaluate() below repeats the installed-and-working check because evaluate functions are serialized.

import { card } from '../common.js';

const KC_ID = 'sys-kinetic-compensator';
const DWHS_ID = 'sys-deep-well-heat-sink';
const SS_ID = 'sys-stable-structure';
const ALP_DIFF_ID = 'sys-armor-lock-difficulty';
const ALP_PRONE_ID = 'sys-armor-lock-prone';
const ROLAND_ID = 'sys-roland-chamber';

export function registerSystemTriggers(api) {
    api.registerDefaultItemReactions({
        'ms_kinetic_compensator': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Kinetic Compensator: +1 Accuracy on your next ranged attack after a ranged miss',
                triggers: ['onMiss'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    const w = data.weapon;
                    return !!w && w.type === 'mech_weapon' && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === KC_ID);
                    await a.addGlobalBonus(reactorToken.actor, {
                        id: KC_ID, name: 'Kinetic Compensator +1', type: 'accuracy', val: 1, rollTypes: ['attack'],
                        uses: 1, consumeOnUsage: true,
                        condition: (state) => {
                            const w = state?.item;
                            return !!w && w.type === 'mech_weapon' && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
                        }
                    }, { duration: 'indefinite', origin: reactorToken });
                    await card(reactorToken.actor, 'KINETIC COMPENSATOR', `<b>${reactorToken.name}</b> missed: the next ranged attack gains <b>+1 Accuracy</b>.`, 'crosshairs');
                }
            }]
        },

        'ms_type_i_flight_system': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Type-I Flight System: Size +1 Heat at the end of a turn you flew',
                triggers: ['onTurnEnd'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: false, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    return inst && !item.system?.destroyed && !item.system?.disabled;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const size = Math.max(1, Math.ceil(Number(reactorToken.actor?.system?.size) || 1));
                    const heat = size + 1;
                    const { confirmed } = await a.askCard({
                        title: 'TYPE-I FLIGHT SYSTEM',
                        description: `Did <b>${reactorToken.name}</b> count any movement as flying this turn? If so it takes <b>${heat} Heat</b> (Size +1).`,
                        yesText: `Flew (${heat} Heat)`, noText: 'Did not fly', owner: reactorToken, originToken: reactorToken
                    });
                    if (!confirmed) return;
                    await a.executeDamageRoll(reactorToken, [reactorToken], heat, 'Heat', 'Type-I Flight System');
                }
            }]
        },

        'ms_explosive_vents': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Explosive Vents: Burst 1, 2 Heat and 2 Burn, when you clear all heat or take stress (1/round)',
                triggers: ['onHeatLoss', 'onStress'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    if (triggerType === 'onHeatLoss') return (data.heatCleared ?? 0) > 0 && (data.currentHeat ?? 1) === 0;
                    return true;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    if (!(await a.consumeOncePerRound(reactorToken, 'sys_explosive_vents'))) return;
                    const targets = a.getTokensInRange(reactorToken, { range: 1 });
                    await card(reactorToken.actor, 'EXPLOSIVE VENTS', `<b>${reactorToken.name}</b>'s vents open: Burst 1, <b>2 Heat</b> and <b>2 Burn</b> to ${targets.length ? targets.map(t => t.name).join(', ') : 'nothing in range'}.`, 'fire');
                    if (!targets.length) return;
                    await a.executeDamageRoll(reactorToken, targets, 2, 'Heat', 'Explosive Vents');
                    await a.executeDamageRoll(reactorToken, targets, 2, 'Burn', 'Explosive Vents');
                }
            }]
        },

        'ms_deep_well_heat_sink': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Deep Well Heat Sink: Resistance to heat for the turn when you start it in the Danger Zone',
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
                    await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === DWHS_ID);
                    await a.addGlobalBonus(reactorToken.actor, {
                        id: DWHS_ID, name: 'Deep Well Heat Sink (Resist Heat)', type: 'resistance', damageTypes: ['Heat']
                    }, { duration: 'end', durationTurns: 0, origin: reactorToken });
                    await card(reactorToken.actor, 'DEEP WELL HEAT SINK', `<b>${reactorToken.name}</b> starts the turn in the Danger Zone: <b>Resistance to heat</b> until the end of the turn.`, 'snowflake');
                }
            }]
        },

        'ms_reactive_weave': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Reactive Weave: Bracing makes you Invisible until the end of your next turn and moves you up to your Speed',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return String(data.actionName ?? '').toLowerCase() === 'brace';
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    await a.applyEffectsToTokens({ tokens: [reactorToken], effectNames: ['invisible'], duration: a.untilEndOfTurn(reactorToken) });
                    await card(reactorToken.actor, 'REACTIVE WEAVE', `<b>${reactorToken.name}</b> braces and goes <b>Invisible</b> until the end of their next turn.`, 'user-secret');
                    const speed = Number(reactorToken.actor?.system?.speed) || 4;
                    const { confirmed } = await a.askCard({
                        title: 'REACTIVE WEAVE',
                        description: `Move up to <b>${speed}</b> spaces now?`,
                        yesText: 'Move', noText: 'Stay', owner: reactorToken, originToken: reactorToken
                    });
                    if (!confirmed) return;
                    await a.moveToken(reactorToken, { free: true, range: speed, title: 'REACTIVE WEAVE', description: `Move up to ${speed} spaces.` });
                }
            }]
        },

        'ms_stable_structure': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Stable Structure: +1 Accuracy on saves to avoid Prone or Knockback',
                triggers: ['onInitCheck'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    const stat = String(data.statName ?? '').toLowerCase();
                    return stat.includes('hull') || stat.includes('agi');
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    // Saves rolled with a title or source naming Prone or Knockback are recognised; any other Hull or
                    // Agility save asks first.
                    const label = [data.actionName, data.item?.name, data.flowState?.data?.title, data.flowState?.data?.la_extraData?.cardTitle]
                        .filter(Boolean).join(' ');
                    let apply = /prone|knock/i.test(label);
                    if (!apply) {
                        const { confirmed } = await a.askCard({
                            title: 'STABLE STRUCTURE',
                            description: `Is this save to avoid <b>Prone</b> or <b>Knockback</b>? If so it gains <b>+1 Accuracy</b>.`,
                            yesText: '+1 Accuracy', noText: 'No', owner: reactorToken, originToken: reactorToken
                        });
                        apply = confirmed;
                    }
                    if (!apply) return;
                    await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === SS_ID);
                    await a.addGlobalBonus(reactorToken.actor, {
                        id: SS_ID, name: 'Stable Structure +1', type: 'accuracy', val: 1, rollTypes: ['check'],
                        uses: 1, consumeOnUsage: true
                    }, { duration: 'indefinite', origin: reactorToken });
                    await card(reactorToken.actor, 'STABLE STRUCTURE', `<b>${reactorToken.name}</b> braces against being toppled: <b>+1 Accuracy</b> on this save.`, 'shield-alt');
                }
            }]
        },

        'ms_armor_lock_plating': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Armor-Lock Plating: Bracing grants +1 difficulty against you and Prone immunity until the end of your following turn',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return String(data.actionName ?? '').toLowerCase() === 'brace';
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const actor = reactorToken.actor;
                    await a.removeGlobalBonus(actor, (b) => b?.id === ALP_DIFF_ID || b?.id === ALP_PRONE_ID);
                    const opts = { duration: 'end', durationTurns: 1, origin: reactorToken };
                    await a.addGlobalBonus(actor, { id: ALP_DIFF_ID, name: 'Armor-Lock Plating (+1 difficulty against you)', type: 'difficulty', val: 1, rollTypes: ['attack'], applyToTargetter: true }, opts);
                    await a.addGlobalBonus(actor, { id: ALP_PRONE_ID, name: 'Armor-Lock Plating (immune to Prone)', type: 'immunity', subtype: 'effect', effects: ['Prone'] }, opts);
                    await card(actor, 'ARMOR-LOCK PLATING', `<b>${reactorToken.name}</b> locks down until the end of their next turn: attacks against them get <b>+1 difficulty</b> and they can't be knocked <b>Prone</b>. Also ended: any grapples on them. Table rulings: can't fail Agility or Hull saves or contested checks, immune to Knockback, Grapple and forced movement by anything smaller than Size 5. The system's 2 Heat is not applied automatically.`, 'lock');
                }
            }]
        },

        'ms_roland_chamber': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Roland Chamber: after a reload, your next Loading weapon attack deals +1d6 explosive on hit',
                triggers: ['onActivation'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return String(data.actionName ?? '').toLowerCase() === 'reload';
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === ROLAND_ID);
                    await a.addGlobalBonus(reactorToken.actor, {
                        id: ROLAND_ID, name: 'Roland Chamber (+1d6 explosive)', type: 'damage', damageMode: 'add',
                        damage: [{ type: 'Explosive', val: '1d6' }], rollTypes: ['damage'],
                        uses: 1, consumeOnUsage: true,
                        condition: (state) => {
                            const w = state?.item;
                            return !!w && w.type === 'mech_weapon' && (w.system?.tags ?? []).some(t => t?.is_loading || t?.lid === 'tg_loading');
                        }
                    }, { duration: 'indefinite', origin: reactorToken });
                    await card(reactorToken.actor, 'ROLAND CHAMBER', `<b>${reactorToken.name}</b> reloaded: the next Loading weapon attack deals <b>+1d6 explosive</b> on hit. Targets must pass a Hull save or be knocked Prone (table ruling).`, 'bomb');
                }
            }]
        },

        'ms_siege_ram': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Siege Ram: a Ram that hits deals 2 kinetic damage',
                triggers: ['onHit'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return String(data.actionName ?? '').toLowerCase() === 'ram' && (data.targets ?? []).length > 0;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const hit = (data.targets ?? []).map(t => t?.target ?? t).filter(Boolean);
                    const run = async () => {
                        await card(reactorToken.actor, 'SIEGE RAM', `<b>${reactorToken.name}</b>'s Ram connects: <b>2 kinetic</b> damage to ${hit.map(t => t.name).join(', ')}. (10 AP kinetic against objects and terrain is a table ruling.)`, 'hammer');
                        await a.executeDamageRoll(reactorToken, hit, 2, 'Kinetic', 'Siege Ram');
                    };
                    if (!a.afterFlow(data, run)) await run();
                }
            }]
        },

        'ms_synthetic_muscle_netting': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Synthetic Muscle Netting: shows the effective Size when you Ram or Grapple',
                triggers: ['onAttack'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    const n = String(data.actionName ?? '').toLowerCase();
                    return (n === 'ram' || n === 'grapple') && (data.targets ?? []).length > 0;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const own = Number(reactorToken.actor?.system?.size) || 1;
                    const verb = String(data.actionName ?? '').toLowerCase() === 'ram' ? 'Ram' : 'Grapple';
                    const fmt = (n) => n === 0.5 ? '1/2' : String(n);
                    const lines = (data.targets ?? []).map(t => t?.target ?? t).filter(Boolean).map(t => {
                        const theirs = Number(t.actor?.system?.size) || 1;
                        // Larger target: count as that Size. Same or smaller: count as at least one Size larger.
                        const effective = theirs > own ? theirs : Math.max(own < 1 ? 1 : own + 1, own);
                        const note = theirs > own ? `larger target, you count as Size ${fmt(effective)}` : `you count as at least Size ${fmt(effective)}`;
                        return `<b>${t.name}</b> (Size ${fmt(theirs)}): ${note}.`;
                    });
                    await card(reactorToken.actor, 'SYNTHETIC MUSCLE NETTING', `<b>${reactorToken.name}</b> (Size ${fmt(own)}) makes a ${verb}. You may target characters larger than you.<br>${lines.join('<br>')}`, 'dumbbell');
                }
            }]
        },

        'ms_flicker_field_projector': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Flicker Field Projector: after you move voluntarily you count as Invisible the next time you are attacked',
                triggers: ['onMove'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    const mi = data.moveInfo ?? {};
                    return !mi.isInvoluntary && !mi.isTeleport && (data.distanceMoved ?? 0) > 0;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    // One instance at a time: skip if the field's Invisible is already up.
                    if (a.findEffectOnToken(reactorToken, (e) => e.flags?.['lancer-automations']?.flickerField)) return;
                    await a.applyEffectsToTokens({
                        tokens: [reactorToken], effectNames: ['invisible'], note: 'Flicker Field Projector', notify: false
                    }, {
                        stack: 1, flickerField: true,
                        consumption: { trigger: ['onHit', 'onMiss'], originId: reactorToken.id, role: 'target' }
                    });
                    await card(reactorToken.actor, 'FLICKER FIELD PROJECTOR', `<b>${reactorToken.name}</b> leaves dazzling afterimages: <b>Invisible</b> the next time they are attacked.`, 'eye-slash');
                }
            }]
        },

        'ms_external_batteries': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'External Batteries: destroyed on structure damage, 1d6 AP explosive damage that cannot be reduced',
                triggers: ['onStructure'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    return inst && !item.system?.destroyed;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    await a.destroyItem(item);
                    await card(reactorToken.actor, 'EXTERNAL BATTERIES', `<b>${reactorToken.name}</b> took structure damage: the External Batteries are <b>destroyed</b> and explode for <b>1d6 AP explosive</b> damage that can't be reduced.`, 'bomb');
                    await a.executeDamageRoll(reactorToken, [reactorToken], '1d6', 'Explosive', 'External Batteries', { ap: true, paracausal: true });
                }
            }]
        }
    });
    console.info('la-talents | System triggers registered');
}
