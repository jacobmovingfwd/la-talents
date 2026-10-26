// System reactions, registered as item activations keyed by the system's LID. [beta]
//  Flash Anchor (HA): Flash Lock. When you or an allied character in Sensors would be pushed, pulled, knocked back or
//    knocked Prone, spend your Reaction and take 2 Heat to cancel it; the target is immune to Prone until their next
//    turn starts.
//  Singularity Motivator (HORUS): Exposed Singularity. When your mech takes damage, spend your Reaction to teleport to a
//    free space within 1d6 spaces.
//  //SCORPION V70.1 (HORUS): when you or an adjacent ally is missed by a tech attack, spend your Reaction to make the
//    attacker Impaired and take 2 Heat, or Jammed. (The "passes a save against a tech action" trigger is not automated.)
//  Mimic Mesh (HORUS): Activate Mimic Mesh picks an ally within Sensors; until the end of your next turn, each hostile
//    attack or tech attack against them offers Battlefield Awareness (move 3 toward them, free, no reaction cost).
// evaluate() functions are serialized by lancer-automations, so each repeats the installed-and-working check.

import { card } from '../common.js';

const FLASH_ID = 'sys-flash-anchor';
const FLAG_MIMIC = 'mimicMeshTarget';
const FLAG_MIMIC_TURNS = 'mimicMeshTurns';

export function registerSystemReactions(api) {
    api.registerDefaultItemReactions({
        'ms_flash_anchor': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Flash Anchor: cancel a push, pull or knockback on you or an ally in Sensors',
                    triggers: ['onPreInvoluntaryMove'],
                    triggerSelf: true, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                        const moved = data.triggeringToken;
                        if (!moved) return false;
                        if (moved.id === reactorToken.id) return true;
                        if (moved.document.disposition !== reactorToken.document.disposition) return false;
                        const sensors = Number(reactorToken.actor?.system?.sensor_range) || 10;
                        return a.getTokenDistance(reactorToken, moved) <= sensors;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const moved = data.triggeringToken;
                        const { confirmed } = await a.askCard({
                            title: 'FLASH LOCK',
                            description: `<b>${moved.name}</b> is about to be pushed, pulled or knocked back. Spend your Reaction and take <b>2 Heat</b> to prevent it?`,
                            yesText: 'Flash Lock', noText: 'Allow', owner: reactorToken, originToken: reactorToken, relatedToken: moved
                        });
                        if (!confirmed) return;
                        await a.setReaction(reactorToken, false);
                        data.cancelTriggeredMove?.(`Flash Lock: ${moved.name} holds its position.`);
                        await a.addGlobalBonus(moved.actor, {
                            id: FLASH_ID, name: 'Flash Anchor (immune to Prone)', type: 'immunity', subtype: 'effect', effects: ['Prone']
                        }, { duration: 'start', durationTurns: 1, origin: moved, refresh: true });
                        await card(reactorToken.actor, 'FLASH LOCK', `<b>${reactorToken.name}</b> anchors <b>${moved.name}</b>: the movement is prevented and they're immune to the effect until the start of their next turn. <b>2 Heat</b> to ${reactorToken.name}.`, 'anchor');
                        await a.executeDamageRoll(reactorToken, [reactorToken], 2, 'Heat', 'Flash Anchor');
                    }
                },
                {
                    comments: 'Flash Anchor: cancel being knocked Prone',
                    triggers: ['onPreStatusApplied'],
                    triggerSelf: true, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                        if (data.statusId !== 'prone') return false;
                        const target = data.triggeringToken;
                        if (!target) return false;
                        if (target.id === reactorToken.id) return true;
                        if (target.document.disposition !== reactorToken.document.disposition) return false;
                        const sensors = Number(reactorToken.actor?.system?.sensor_range) || 10;
                        return a.getTokenDistance(reactorToken, target) <= sensors;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const target = data.triggeringToken;
                        const { confirmed } = await a.askCard({
                            title: 'FLASH LOCK',
                            description: `<b>${target.name}</b> is about to be knocked Prone. Spend your Reaction and take <b>2 Heat</b> to prevent it?`,
                            yesText: 'Flash Lock', noText: 'Allow', owner: reactorToken, originToken: reactorToken, relatedToken: target
                        });
                        if (!confirmed) return;
                        await a.setReaction(reactorToken, false);
                        data.cancelChange?.();
                        await card(reactorToken.actor, 'FLASH LOCK', `<b>${reactorToken.name}</b> anchors <b>${target.name}</b>: Prone is prevented. <b>2 Heat</b> to ${reactorToken.name}.`, 'anchor');
                        await a.executeDamageRoll(reactorToken, [reactorToken], 2, 'Heat', 'Flash Anchor');
                    }
                }
            ]
        },

        'ms_singularity_motivator': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: 'Exposed Singularity: teleport 1d6 spaces when your mech takes damage',
                triggers: ['onDamage'],
                triggerSelf: true, triggerOther: true,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                isReaction: true, checkReaction: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    return data.target?.id === reactorToken.id && (data.damages ?? []).some(n => Number(n) > 0);
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const { confirmed } = await a.askCard({
                        title: 'EXPOSED SINGULARITY',
                        description: `<b>${reactorToken.name}</b> is taking damage. Spend your Reaction to teleport to a free space within 1d6 spaces?`,
                        yesText: 'Teleport', noText: 'Stay', owner: reactorToken, originToken: reactorToken
                    });
                    if (!confirmed) return;
                    await a.setReaction(reactorToken, false);
                    const roll = await new Roll('1d6').evaluate();
                    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: reactorToken.actor }), flavor: 'Exposed Singularity' });
                    const n = roll.total;
                    await card(reactorToken.actor, 'EXPOSED SINGULARITY', `<b>${reactorToken.name}</b> rolls <b>${n}</b>: teleport up to ${n} spaces.`, 'atom');
                    await a.moveToken(reactorToken, { teleport: true, range: n, title: 'EXPOSED SINGULARITY', description: `Teleport to a free space within ${n} spaces.` });
                }
            }]
        },

        'ms___scorpion_v70.1': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [{
                comments: '//SCORPION: when a tech attack misses you or an adjacent ally, Impair and heat the attacker, or Jam them',
                triggers: ['onTechMiss'],
                triggerSelf: true, triggerOther: true,
                outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                isReaction: true, checkReaction: true,
                activationType: 'code', activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                    if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                    const attacker = data.triggeringToken;
                    if (!attacker || attacker.id === reactorToken.id) return false;
                    return (data.targets ?? []).some(t => {
                        const tok = t?.target ?? t;
                        if (!tok) return false;
                        if (tok.id === reactorToken.id) return true;
                        return a.getTokenDistance(reactorToken, tok) <= 1 && tok.document.disposition === reactorToken.document.disposition;
                    });
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const attacker = data.triggeringToken;
                    const { confirmed } = await a.askCard({
                        title: '//SCORPION',
                        description: `<b>${attacker.name}</b>'s tech attack missed. Spend your Reaction to retaliate?`,
                        yesText: 'Retaliate', noText: 'Skip', owner: reactorToken, originToken: reactorToken, relatedToken: attacker
                    });
                    if (!confirmed) return;
                    const pick = await a.askCard({
                        title: '//SCORPION',
                        description: `Choose the effect on <b>${attacker.name}</b> until the end of their next turn.`,
                        yesText: 'Impaired + 2 Heat', noText: 'Jammed', owner: reactorToken, originToken: reactorToken, relatedToken: attacker
                    });
                    await a.setReaction(reactorToken, false);
                    if (pick.confirmed) {
                        await a.applyEffectsToTokens({ tokens: [attacker], effectNames: ['impaired'], note: '//SCORPION', duration: a.untilEndOfTurn(attacker) });
                        await a.executeDamageRoll(reactorToken, [attacker], 2, 'Heat', '//SCORPION');
                        await card(reactorToken.actor, '//SCORPION', `<b>${attacker.name}</b> is <b>Impaired</b> until the end of their next turn and takes <b>2 Heat</b>.`, 'skull');
                    } else {
                        await a.applyEffectsToTokens({ tokens: [attacker], effectNames: ['jammed'], note: '//SCORPION', duration: a.untilEndOfTurn(attacker) });
                        await card(reactorToken.actor, '//SCORPION', `<b>${attacker.name}</b> is <b>Jammed</b> until the end of their next turn.`, 'skull');
                    }
                }
            }]
        },

        'ms_mimic_mesh': {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Mimic Mesh: choose the ally to shadow',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                        return /activate mimic mesh/i.test(String(data.actionName ?? ''));
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const picked = await a.chooseToken(reactorToken, {
                            title: 'MIMIC MESH', description: 'Choose an allied character within Sensors.',
                            range: Number(reactorToken.actor?.system?.sensor_range) || 10, count: 1, includeSelf: false
                        });
                        const target = picked?.[0];
                        if (!target) return;
                        await a.addActorFlags(reactorToken.actor, { [FLAG_MIMIC]: target.id, [FLAG_MIMIC_TURNS]: 2 });
                        await card(reactorToken.actor, 'MIMIC MESH', `<b>${reactorToken.name}</b> shadows <b>${target.name}</b> until the end of their next turn: Battlefield Awareness is offered whenever a hostile acts against them.`, 'user-friends');
                    }
                },
                {
                    comments: 'Mimic Mesh: ends at the end of your next turn',
                    triggers: ['onTurnEnd'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'mimicMeshTarget');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const n = (Number(a.getActorFlags(reactorToken.actor, FLAG_MIMIC_TURNS)) || 1) - 1;
                        if (n > 0) return a.addActorFlags(reactorToken.actor, { [FLAG_MIMIC_TURNS]: n });
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_MIMIC]: true, [FLAG_MIMIC_TURNS]: true });
                    }
                },
                {
                    comments: 'Mimic Mesh: Battlefield Awareness when a hostile attacks the shadowed ally',
                    triggers: ['onAttack', 'onTechAttack'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const id = a.getActorFlags(reactorToken.actor, 'mimicMeshTarget');
                        if (!id) return false;
                        const attacker = data.triggeringToken;
                        if (!attacker || attacker.document.disposition === reactorToken.document.disposition) return false;
                        return (data.targets ?? []).some(t => (t?.target ?? t)?.id === id);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const id = a.getActorFlags(reactorToken.actor, FLAG_MIMIC);
                        const ally = canvas.tokens.get(id);
                        if (!ally || a.getTokenDistance(reactorToken, ally) <= 1) return;
                        const { confirmed } = await a.askCard({
                            title: 'BATTLEFIELD AWARENESS',
                            description: `A hostile is acting against <b>${ally.name}</b>. Move up to <b>3</b> spaces toward them (ignores engagement, no reaction cost)?`,
                            yesText: 'Move', noText: 'Stay', owner: reactorToken, originToken: reactorToken, relatedToken: ally
                        });
                        if (!confirmed) return;
                        await a.moveToken(reactorToken, { free: true, range: 3, title: 'BATTLEFIELD AWARENESS', description: `Move up to 3 spaces toward ${ally.name} by the most direct route.` });
                    }
                }
            ]
        }
    });
    console.info('la-talents | System reactions registered');
}
