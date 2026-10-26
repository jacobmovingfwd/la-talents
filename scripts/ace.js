// Ace talent, ranks 1-3. [beta]
//  Rank 1, Acrobatics: while flying, +1 Accuracy on Agility checks and saves (constant bonus, synced by rank), and
//    when an attack misses you, you may fly up to 2 spaces as a reaction (offered after the miss, spends your reaction).
//  Rank 2, Afterburners: when you Boost while flying, you may move an extra 1d6 spaces (free flight) and take Heat equal to
//    half of it, rounded up.
//  Rank 3, Supersonic: a macro to spin up (quick action):
//      game.modules.get('la-talents').api.spinUp()          (uses the selected token)
//    If you end that turn flying, you pick a character within your Speed; when their turn ends you may use your
//    reaction (1/round) to fly toward them. Flight range is distance - 1 so you can end adjacent; you pick the
//    exact space yourself. Ignores engagement and doesn't provoke reactions.

import { talentRank, card, tokenOf, statusOn } from './common.js';

const KEY = 't_ace';
const ACRO_ID = 'ace-acrobatics';
const FLAG_SPIN = 'aceSpinUp';
const FLAG_TARGET = 'aceSupersonicTarget';

export const aceRank = (actor) => talentRank(actor, KEY);

// Self-contained on purpose: serialized by lancer-automations.
const ACROBATICS = {
    id: ACRO_ID,
    name: 'Ace (Acrobatics)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['agility'],
    condition: (state) => {
        const a = state?.actor;
        return !!a && (!!a.statuses?.has?.('flying') || !!a.system?.statuses?.flying);
    }
};

export async function syncAceMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === ACRO_ID);
    const should = aceRank(mech) >= 1;
    if (should && !has) await api.addConstantBonus(mech, ACROBATICS);
    else if (!should && has) await api.removeConstantBonus(mech, ACRO_ID);
}

async function acrobatics(a, token, attacker) {
    const { confirmed } = await a.askCard({
        title: 'ACROBATICS',
        description: `An attack from <b>${attacker?.name ?? 'an enemy'}</b> missed <b>${token.name}</b>. Spend your Reaction to fly up to <b>2 spaces</b>?`,
        yesText: 'Fly', noText: 'Stay', owner: token, originToken: token
    });
    if (!confirmed) return;
    await a.setReaction(token, false);
    await a.moveToken(token, { free: true, action: 'fly', range: 2, title: 'ACROBATICS', description: 'Fly up to 2 spaces in any direction.' });
}

async function afterburners(a, token) {
    const { confirmed } = await a.askCard({
        title: 'AFTERBURNERS',
        description: `You Boosted while flying. Roll 1d6 and fly that many extra spaces, taking Heat equal to half of it (rounded up)?`,
        yesText: 'Burn', noText: 'No', owner: token, originToken: token
    });
    if (!confirmed) return;
    const roll = await new Roll('1d6').evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: token.actor }), flavor: 'Afterburners' });
    const n = roll.total, heat = Math.ceil(n / 2);
    await a.executeDamageRoll(token, [token], heat, 'Heat', 'Afterburners');
    await a.moveToken(token, { free: true, action: 'fly', range: n, title: 'AFTERBURNERS', description: `Fly up to ${n} extra spaces.` });
    await card(token.actor, 'AFTERBURNERS', `<b>${token.name}</b> rolls <b>${n}</b>: up to ${n} extra spaces, <b>${heat} Heat</b>.`);
}

export async function spinUp(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Spin Up: select the Ace token first.');
    if (aceRank(token.actor) < 3) return ui.notifications.warn(`Spin Up: ${token.name}'s pilot does not have Ace rank 3.`);
    await a.consumeAction(token, 'quick');
    await a.addActorFlags(token.actor, { [FLAG_SPIN]: true });
    await card(token.actor, 'SPIN UP THRUSTERS', `<b>${token.name}</b> spins up. If the turn ends with them flying, they nominate a Supersonic target.`);
}

async function nominate(a, token) {
    await a.removeActorFlags(token.actor, { [FLAG_SPIN]: true });
    if (!statusOn(token.actor, 'flying')) return;
    const picked = await a.chooseToken(token, {
        range: token.actor.system?.speed ?? 4, count: 1, includeSelf: false,
        title: 'SUPERSONIC', description: 'Nominate a character within a Range equal to your Speed and in line of sight.'
    });
    const target = picked?.[0];
    if (!target) return;
    await a.addActorFlags(token.actor, { [FLAG_TARGET]: target.id });
    await card(token.actor, 'SUPERSONIC', `<b>${token.name}</b> nominates <b>${target.name}</b>. When their turn ends, ${token.name} may fly to them.`);
}

async function supersonic(a, token, target) {
    const dist = a.getTokenDistance(token, target);
    if (dist <= 1) return a.removeActorFlags(token.actor, { [FLAG_TARGET]: true });
    const { confirmed } = await a.askCard({
        title: 'SUPERSONIC',
        description: `<b>${target.name}</b>'s turn ended. Spend your Reaction to fly next to them (ignores engagement, no reactions provoked)?`,
        yesText: 'Fly', noText: 'No', owner: token, originToken: token, relatedToken: target
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'ace_supersonic'))) return;
    await a.setReaction(token, false);
    await a.removeActorFlags(token.actor, { [FLAG_TARGET]: true });
    await a.moveToken(token, { free: true, action: 'fly', range: Math.max(1, Math.ceil(dist) - 1), title: 'SUPERSONIC', description: `Fly to a free space adjacent to ${target.name}.` });
}

export function registerAce(api) {
    api.registerDefaultGeneralReactions({
        'Ace': {
            category: 'General',
            reactions: [
                {
                    comments: 'Ace rank 1: Acrobatics after a miss while flying',
                    triggers: ['onMiss'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('t_ace'));
                        if (!t) return false;
                        if (!reactorToken.actor.statuses?.has?.('flying')) return false;
                        return (data.targets ?? []).some(x => x?.target?.id === reactorToken.id);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await acrobatics(a, reactorToken, data.triggeringToken);
                    }
                },
                {
                    comments: 'Ace rank 2: Afterburners when you Boost while flying',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('t_ace'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        if (String(data.actionName ?? '').toLowerCase() !== 'boost') return false;
                        return !!reactorToken.actor.statuses?.has?.('flying');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await afterburners(a, reactorToken);
                    }
                },
                {
                    comments: 'Ace rank 3: nominate a Supersonic target at the end of a spun-up turn',
                    triggers: ['onTurnEnd'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'aceSpinUp');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await nominate(a, reactorToken);
                    }
                },
                {
                    comments: 'Ace rank 3: Supersonic when the nominated character\'s turn ends',
                    triggers: ['onTurnEnd'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: false, autoActivate: true,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const id = a.getActorFlags(reactorToken.actor, 'aceSupersonicTarget');
                        return !!id && id === data.triggeringToken?.id && a.checkGate(reactorToken, 'ace_supersonic');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await supersonic(a, reactorToken, data.triggeringToken);
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), spinUp: (token) => spinUp(api, token) };
    console.info('la-talents | Ace registered');
}
