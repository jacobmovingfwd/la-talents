// Leader talent, ranks 1-3. [beta]
//  Leadership Dice: a pool on the Leader (3 / 5 / 6 by rank), kept as an actor flag. The sheet counter is not touched.
//  Rank 1, Issue Order (free, 1/turn): hooked to the sheet's Issue Order action. Pick an allied PC (a mech, friendly,
//    without a die); the pool drops by 1 and they hold a die until it is used or the scene changes.
//  Rank 2, Open Channels: pool of 5, and Issue Command: when another player's turn starts you're offered the same
//    thing for them, as a reaction.
//  Rank 3, Inspiring Presence: pool of 6, and a held die can also give -1d6 damage or +1d6 bonus damage.
//  Using a held die (the ally runs this, selected token):
//      game.modules.get('la-talents').api.leadershipDie()
//    +1 Accuracy on their next attack, tech attack or check; return it to the Leader; and (rank 3) +1d6 bonus damage on
//    their next hit. "-1d6 damage" is offered automatically when they're hit while holding a die: it adds the roll as
//    Armor for that attack (so AP attacks ignore it, unlike the printed rule).
//  Pool returns: a Full Repair refills it; the rest rule (regain 1 when empty) is a macro:
//      game.modules.get('la-talents').api.restLeader(actor)

import { talentRank, card, tokenOf, relation, flagNum } from './common.js';

const KEY = 'leader';
const FLAG_POOL = 'leaderPool';
const FLAG_HELD = 'leaderDie';          // { leader: actorId, sceneId }

export const leaderRank = (actor) => talentRank(actor, KEY);
const maxPool = (rank) => (rank >= 3 ? 6 : rank >= 2 ? 5 : rank >= 1 ? 3 : 0);

const getPool = (a, actor) => Math.min(maxPool(leaderRank(actor)), Math.max(0, flagNum(a, actor, FLAG_POOL, maxPool(leaderRank(actor)))));
const setPool = (a, actor, n) => a.addActorFlags(actor, { [FLAG_POOL]: Math.max(0, Math.min(maxPool(leaderRank(actor)), n)) });

const heldBy = (a, ally) => {
    const f = a.getActorFlags(ally, FLAG_HELD);
    return f && f.sceneId === canvas.scene?.id ? f : null;
};
const leaderActor = (f) => game.actors.get(f?.leader);

async function giveDie(a, leader, ally) {
    const pool = getPool(a, leader.actor);
    if (pool < 1) return ui.notifications.warn('Leadership: your pool is empty.');
    if (heldBy(a, ally.actor)) return ui.notifications.warn(`Leadership: ${ally.name} already holds a die.`);
    await setPool(a, leader.actor, pool - 1);
    await a.addActorFlags(ally.actor, { [FLAG_HELD]: { leader: leader.actor.id, sceneId: canvas.scene?.id ?? null } });
    await card(leader.actor, 'LEADERSHIP DIE', `<b>${leader.name}</b> gives <b>${ally.name}</b> a Leadership Die. Pool: <b>${pool - 1}/${maxPool(leaderRank(leader.actor))}</b>.`, 'flag');
}

const allies = (a, leader) => canvas.tokens.placeables.filter(t => t.id !== leader.id && t.actor?.type === 'mech'
    && !t.document.hidden && relation(a, leader, t) === 'friendly' && !heldBy(a, t.actor));

async function issueOrder(a, leader, gate) {
    if (gate && !(await a.consumeOncePerTurn(leader, 'leader_order'))) return ui.notifications.warn('Issue Order: already used this turn.');
    const picked = await a.chooseToken(leader, { count: 1, includeSelf: false, selection: allies(a, leader), title: 'ISSUE ORDER', description: 'Choose an allied PC to receive a Leadership Die.' });
    if (picked?.[0]) await giveDie(a, leader, picked[0]);
}

export async function leadershipDie(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Leadership Die: select the character holding a die.');
    const held = heldBy(a, token.actor);
    if (!held) return ui.notifications.warn(`${token.name} does not hold a Leadership Die.`);
    const boss = leaderActor(held);
    const rank = leaderRank(boss);
    const choices = [
        { text: '+1 Accuracy (next roll)', icon: 'fas fa-bullseye', callback: async () => {
            await a.removeActorFlags(token.actor, { [FLAG_HELD]: true });
            await a.addGlobalBonus(token.actor, { id: 'leader-accuracy', name: 'Leadership Die: +1 Accuracy', type: 'accuracy', val: 1 },
                { duration: 'indefinite', origin: token, consumption: { trigger: ['onAttack', 'onTechAttack', 'onCheck'], evaluate: 'return true;' } });
            await card(token.actor, 'LEADERSHIP DIE', `<b>${token.name}</b> expends the die: <b>+1 Accuracy</b> on their next roll.`, 'flag');
        } },
        { text: 'Return it to the Leader', icon: 'fas fa-rotate-left', callback: async () => {
            await a.removeActorFlags(token.actor, { [FLAG_HELD]: true });
            if (boss) await setPool(a, boss, getPool(a, boss) + 1);
            await card(token.actor, 'LEADERSHIP DIE', `<b>${token.name}</b> returns the die to <b>${boss?.name ?? 'the Leader'}</b>.`, 'flag');
        } }
    ];
    if (rank >= 3) choices.splice(1, 0, { text: '+1d6 bonus damage (next hit)', icon: 'fas fa-dice-d6', callback: async () => {
        await a.removeActorFlags(token.actor, { [FLAG_HELD]: true });
        await a.addGlobalBonus(token.actor, { id: 'leader-damage', name: 'Leadership Die: +1d6', type: 'damage', damage: [{ val: '1d6', type: 'Variable' }], rollTypes: ['damage'] },
            { duration: 'indefinite', origin: token, consumption: { trigger: 'onDamage', evaluate: 'return !!triggerData.weapon;' } });
        await card(token.actor, 'LEADERSHIP DIE', `<b>${token.name}</b> expends the die: <b>+1d6</b> bonus damage on their next hit.`, 'flag');
    } });
    await a.startChoiceCard({
        title: 'LEADERSHIP DIE', icon: 'fas fa-flag',
        description: `<b>${token.name}</b> holds a Leadership Die from <b>${boss?.name ?? 'a Leader'}</b>.`,
        originToken: token, userIdControl: a.getTokenOwnerUserId(token), choices
    });
}

async function absorb(a, ally, data) {
    const held = heldBy(a, ally.actor);
    if (!held) return;
    const { confirmed } = await a.askCard({
        title: 'INSPIRING PRESENCE',
        description: `<b>${ally.name}</b> is about to take damage and holds a Leadership Die. Expend it for <b>-1d6 damage</b>?`,
        yesText: 'Expend', noText: 'Keep', owner: ally, originToken: ally
    });
    if (!confirmed) return;
    await a.removeActorFlags(ally.actor, { [FLAG_HELD]: true });
    const roll = await new Roll('1d6').evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: ally.actor }), flavor: 'Inspiring Presence: damage reduction' });
    await a.addGlobalBonus(ally.actor, { id: 'leader-reduce', name: `Leadership Die: -${roll.total} damage`, type: 'stat', stat: 'system.armor', val: roll.total },
        { duration: 'indefinite', origin: ally, consumption: { trigger: 'onDamage', evaluate: 'return true;' } });
    await card(ally.actor, 'INSPIRING PRESENCE', `<b>${ally.name}</b> reduces the damage by <b>${roll.total}</b>.`, 'flag');
}

export async function restLeader(a, actor) {
    const target = actor?.actor ?? actor;
    if (!target || leaderRank(target) < 1) return;
    if (getPool(a, target) < 1) await setPool(a, target, 1);
    await card(target, 'LEADERSHIP DICE', `Rest: pool is <b>${getPool(a, target)}/${maxPool(leaderRank(target))}</b>.`, 'flag');
}

export function registerLeader(api) {
    api.registerDefaultGeneralReactions({
        'Leader': {
            category: 'General',
            reactions: [
                {
                    comments: 'Leader rank 1: the Issue Order action',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('leader'));
                        return !!t && String(data.actionName ?? '').toLowerCase() === 'issue order';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await issueOrder(a, reactorToken, true);
                    }
                },
                {
                    comments: 'Leader rank 2: Issue Command at the start of another player\'s turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: false, autoActivate: true, awaitActivationCompletion: true,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('leader'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const who = data.triggeringToken;
                        return who?.actor?.type === 'mech' && who.document.disposition === reactorToken.document.disposition;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const who = data.triggeringToken;
                        if (heldBy(a, who.actor) || getPool(a, reactorToken.actor) < 1) return;
                        const { confirmed } = await a.askCard({
                            title: 'ISSUE COMMAND',
                            description: `<b>${who.name}</b>'s turn is starting. Spend your Reaction to give them a Leadership Die (pool: ${getPool(a, reactorToken.actor)})?`,
                            yesText: 'Command', noText: 'No', owner: reactorToken, originToken: reactorToken, relatedToken: who
                        });
                        if (!confirmed) return;
                        await a.setReaction(reactorToken, false);
                        await giveDie(a, reactorToken, who);
                    }
                },
                {
                    comments: 'Leader rank 3: held die can reduce damage',
                    triggers: ['onPreDamage'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const f = a.getActorFlags(reactorToken.actor, 'leaderDie');
                        if (!f || f.sceneId !== canvas.scene?.id) return false;
                        if (!(data.targets ?? []).some(x => x?.id === reactorToken.id)) return false;
                        const boss = game.actors.get(f.leader);
                        const t = boss?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('leader'));
                        return !!t && (Number(t.system?.curr_rank) || 1) >= 3;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await absorb(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Leader: a Full Repair refills the Leadership Dice',
                    triggers: ['onFullRepair'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('leader'));
                        return !!t;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await setPool(a, reactorToken.actor, maxPool(leaderRank(reactorToken.actor)));
                        await card(reactorToken.actor, 'LEADERSHIP DICE', `Full Repair: pool refilled to <b>${maxPool(leaderRank(reactorToken.actor))}</b>.`, 'flag');
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}),
        leadershipDie: (token) => leadershipDie(api, token),
        restLeader: (actor) => restLeader(api, actor) };
    console.info('la-talents | Leader registered');
}
