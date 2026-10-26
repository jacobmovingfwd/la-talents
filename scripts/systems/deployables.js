// Drone and area systems. [beta]  Needs Templatemacro (zones) and Lancer Automations' auras.
//  Hive Drone (HORUS): Burst 2 aura. Allies get soft cover; hostiles take 1 AP kinetic when they start a turn inside or
//    enter it for the first time in a round.
//  Tempest Drone (HORUS): Burst 1 aura. Anyone who starts a turn adjacent, or moves adjacent for the first time in a
//    round, makes a Hull save or takes 4 energy and is knocked back 3 from the drone.
//  Sentinel Drone (HORUS): hostiles within 2 of it take 3 kinetic before making an attack.
//  Lotus Projector (SSC): hostiles within 2 lose Hidden. (Ignoring Invisible is not automated yet, see TODO Questions.)
//  Caltrop Launcher (IPS-N): a Burst 1 zone within Range 5, difficult terrain for the scene; mechs take 1d3 AP explosive
//    the first time they enter it in a round or end a turn inside.
// The drones are deployed with the system's own Deploy action; these reactions fire on that deploy (onDeploy) and hang an
// aura on the new token. Aura macros and zone hooks are saved as source text, so they are self-contained and reach
// Lancer Automations through `api`. evaluate() functions are serialized too, so each repeats the installed check.

import { card } from '../common.js';

const FLAG_SENTINEL = 'sentinelDroneId';
const FLAG_CALTROPS = 'caltropZoneIds';
const FLAG_LOTUS = 'lotusDroneId';

export function registerSystemDeployables(api) {
    api.registerDefaultItemReactions({
        'ms_hive_drone': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Hive Drone: Burst 2 greywash swarm aura on the deployed drone',
                triggers: ['onDeploy'],
                triggerSelf: true, triggerOther: false, onlyOnSourceMatch: true,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    return inst && !item.system?.destroyed && !item.system?.disabled && !!data.deployedTokens?.length;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const drone = data.deployedTokens[0];
                    await a.createAura(drone, {
                        name: 'Hive Drone Swarm', radius: 2, elevationAware: true,
                        macros: [
                            {
                                mode: 'ENTER_LEAVE',
                                function: async (token, parent, aura, options) => {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (token.id === parent.id || !api.isFriendly(parent, token)) return;
                                    if (options.hasEntered) await api.applyEffectsToTokens({ tokens: [token], effectNames: ['cover_soft'], note: 'Hive Drone', notify: false });
                                    else await api.removeEffectsByNameFromTokens({ tokens: [token], effectNames: ['cover_soft'], note: 'Hive Drone' });
                                }
                            },
                            {
                                mode: 'ENTER',
                                function: async (token, parent, aura, options) => {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (!options.hasEntered || token.id === parent.id || api.isFriendly(parent, token)) return;
                                    if (!(await api.consumeOncePerRound(token, 'hive-drone-' + parent.id))) return;
                                    await api.executeDamageRoll(parent, [token], 1, 'Kinetic', 'Hive Drone', { ap: true });
                                }
                            },
                            {
                                mode: 'TARGET_TURN_START',
                                function: async (token, parent, aura, options) => {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (token.id === parent.id || api.isFriendly(parent, token)) return;
                                    await api.executeDamageRoll(parent, [token], 1, 'Kinetic', 'Hive Drone', { ap: true });
                                }
                            }
                        ]
                    });
                    await card(reactorToken.actor, 'HIVE DRONE', `<b>${reactorToken.name}</b> deploys a hive drone: Burst 2 swarm. Allies gain <b>soft cover</b>; hostiles take <b>1 AP kinetic</b> when they start a turn inside or enter it for the first time in a round.`, 'bug');
                }
            }]
        },

        'ms_tempest_drone': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Tempest Drone: Burst 1 aura, Hull save or 4 energy and knockback 3',
                triggers: ['onDeploy'],
                triggerSelf: true, triggerOther: false, onlyOnSourceMatch: true,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    return inst && !item.system?.destroyed && !item.system?.disabled && !!data.deployedTokens?.length;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const drone = data.deployedTokens[0];
                    await a.createAura(drone, {
                        name: 'Tempest Drone', radius: 1, elevationAware: true,
                        macros: [
                            {
                                mode: 'ENTER',
                                function: async (token, parent, aura, options) => {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (!options.hasEntered || token.id === parent.id || token.actor?.type === 'deployable') return;
                                    if (!(await api.consumeOncePerRound(token, 'tempest-drone-' + parent.id))) return;
                                    await api.executeSaveVsEffect([token], {
                                        stat: 'HULL', title: 'Tempest Drone', origin: parent,
                                        onFail: async (t) => {
                                            await api.executeDamageRoll(parent, [t], 4, 'Energy', 'Tempest Drone');
                                            await api.knockBackToken([t], 3, { triggeringToken: parent, actionName: 'Tempest Drone', title: 'TEMPEST DRONE: KNOCKBACK', description: 'Knocked 3 spaces directly away from the drone.' });
                                        }
                                    });
                                }
                            },
                            {
                                mode: 'TARGET_TURN_START',
                                function: async (token, parent, aura, options) => {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (token.id === parent.id || token.actor?.type === 'deployable') return;
                                    await api.executeSaveVsEffect([token], {
                                        stat: 'HULL', title: 'Tempest Drone', origin: parent,
                                        onFail: async (t) => {
                                            await api.executeDamageRoll(parent, [t], 4, 'Energy', 'Tempest Drone');
                                            await api.knockBackToken([t], 3, { triggeringToken: parent, actionName: 'Tempest Drone', title: 'TEMPEST DRONE: KNOCKBACK', description: 'Knocked 3 spaces directly away from the drone.' });
                                        }
                                    });
                                }
                            }
                        ]
                    });
                    await card(reactorToken.actor, 'TEMPEST DRONE', `<b>${reactorToken.name}</b> deploys a tempest drone: anyone who starts a turn adjacent or first moves adjacent in a round makes a <b>Hull save</b> or takes <b>4 energy</b> and is knocked back 3.`, 'wind');
                }
            }]
        },

        'ms_sentinel_drone': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Sentinel Drone: remember the deployed drone and draw its Burst 2',
                    triggers: ['onDeploy'],
                    triggerSelf: true, triggerOther: false, onlyOnSourceMatch: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        return inst && !item.system?.destroyed && !item.system?.disabled && !!data.deployedTokens?.length;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const drone = data.deployedTokens[0];
                        await a.addActorFlags(reactorToken.actor, { [FLAG_SENTINEL]: drone.id });
                        await a.createAura(drone, { name: 'Sentinel Drone', radius: 2, elevationAware: true });
                        await card(reactorToken.actor, 'SENTINEL DRONE', `<b>${reactorToken.name}</b> deploys a sentinel drone: hostiles within 2 spaces take <b>3 kinetic</b> before making any attack.`, 'shield-alt');
                    }
                },
                {
                    comments: 'Sentinel Drone: 3 kinetic to a hostile in the perimeter before it attacks',
                    triggers: ['onAttack', 'onTechAttack'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const id = a.getActorFlags(reactorToken.actor, 'sentinelDroneId');
                        const drone = id ? canvas.tokens.get(id) : null;
                        const attacker = data.triggeringToken;
                        if (!drone || !attacker || attacker.document.disposition === reactorToken.document.disposition) return false;
                        return a.getTokenDistance(drone, attacker) <= 2;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const drone = canvas.tokens.get(a.getActorFlags(reactorToken.actor, FLAG_SENTINEL));
                        const attacker = data.triggeringToken;
                        await card(reactorToken.actor, 'SENTINEL DRONE', `<b>${attacker.name}</b> attacks inside the perimeter and takes <b>3 kinetic</b> from the drone's fire first.`, 'crosshairs');
                        await a.executeDamageRoll(drone ?? reactorToken, [attacker], 3, 'Kinetic', 'Sentinel Drone');
                    }
                }
            ]
        },

        'ms_lotus_projector': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Lotus Projector: Burst 2 field that exposes Hidden',
                triggers: ['onDeploy'],
                triggerSelf: true, triggerOther: false, onlyOnSourceMatch: true,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    return inst && !item.system?.destroyed && !item.system?.disabled && !!data.deployedTokens?.length;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const drone = data.deployedTokens[0];
                    await a.addActorFlags(reactorToken.actor, { [FLAG_LOTUS]: drone.id });
                    await a.createAura(drone, {
                        name: 'Lotus Projector', radius: 2, elevationAware: true,
                        macros: [{
                            mode: 'ENTER_LEAVE',
                            function: async (token, parent, aura, options) => {
                                    const api = game.modules.get('lancer-automations').api;
                                if (!options.hasEntered || token.id === parent.id || api.isFriendly(parent, token)) return;
                                await api.removeEffectsByNameFromTokens({ tokens: [token], effectNames: ['hidden'] });
                            }
                        }]
                    });
                    await card(reactorToken.actor, 'LOTUS PROJECTOR', `<b>${reactorToken.name}</b> deploys a scout drone: Burst 2. Hostiles inside lose <b>Hidden</b>. You know their location, HP, Evasion, E-Defense and Heat.`, 'eye');
                }
            }]
        },

        'ms_caltrop_launcher': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Caltrop Launcher: Burst 1 zone within Range 5, difficult terrain, 1d3 AP explosive on first entry per round or turn end inside',
                triggers: ['onActivation', 'onDeploy'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return data.item?.id === item.id;
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const placed = await a.placeZone(reactorToken, {
                        title: 'CALTROP LAUNCHER', type: 'Burst', size: 1, range: 5, centerLabel: 'Caltrops',
                        difficultTerrain: { movementPenalty: 1, isFlatPenalty: true },
                        hooks: {
                            entered: {
                                function: async function (template, scene, token) {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (token.actor?.type !== 'mech') return;
                                    if (!(await api.consumeOncePerRound(token, 'caltrops-' + template.id))) return;
                                    await api.executeDamageRoll(token, [token], '1d3', 'Explosive', 'Caltrop Launcher', { ap: true });
                                },
                                asGM: true
                            },
                            turnEnd: {
                                function: async function (template, scene, token) {
                                    const api = game.modules.get('lancer-automations').api;
                                    if (token.actor?.type !== 'mech') return;
                                    await api.executeDamageRoll(token, [token], '1d3', 'Explosive', 'Caltrop Launcher', { ap: true });
                                },
                                asGM: true
                            }
                        }
                    });
                    // Zones have no scene expiry; remember them so the end of the encounter (scene) clears them.
                    const ids = (placed ?? []).map(p => p?.template?.id ?? p?.id).filter(Boolean);
                    if (ids.length) {
                        let prev = [];
                        try { prev = JSON.parse(a.getActorFlags(reactorToken.actor, FLAG_CALTROPS) || '[]'); } catch (e) { /* ignore */ }
                        await a.addActorFlags(reactorToken.actor, { [FLAG_CALTROPS]: JSON.stringify([...prev, ...ids]) });
                    }
                    await card(reactorToken.actor, 'CALTROP LAUNCHER', `<b>${reactorToken.name}</b> blankets a Burst 1 area with explosive caltrops: difficult terrain for the scene, and mechs take <b>1d3 AP explosive</b> the first time they enter it in a round or end a turn inside.`, 'certificate');
                }
            },
            {
                comments: 'Caltrop Launcher: caltrops are cleared when the scene (encounter) ends',
                triggers: ['onExitCombat'],
                triggerSelf: true, triggerOther: false,
                outOfCombat: true, autoActivate: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    return !!a.getActorFlags(reactorToken.actor, 'caltropZoneIds');
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    let ids = [];
                    try { ids = JSON.parse(a.getActorFlags(reactorToken.actor, FLAG_CALTROPS) || '[]'); } catch (e) { /* ignore */ }
                    const live = ids.filter(id => canvas.scene.templates.get(id));
                    if (live.length) await canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', live);
                    await a.addActorFlags(reactorToken.actor, { [FLAG_CALTROPS]: '[]' });
                }
            }]
        }
    });
    console.info('la-talents | System deployables registered');
}
