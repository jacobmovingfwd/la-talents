// Infiltrator talent, ranks 1-3. [beta]
//  Rank 1, Prowl: Lancer Automations doesn't manage the Hidden status or enemy spaces, so this rank stays a table
//    ruling: during your turn you can Hide in plain sight, keep Hidden when entering LOS or leaving cover, and pass
//    (not stop) through enemy spaces. Remember to put Hidden back on / take it off by hand at the end of your turn.
//  Rank 2, Ambush: if you start your turn Hidden, the first attack roll of any type you make, on a hit, makes the
//    target pass a Hull save or become Slowed and Impaired until the end of their next turn, and unable to take
//    reactions for the same time (the no-reactions part is a chat reminder).
//  Rank 3, Mastermind: when you lose Hidden by any means, you're offered a flash bomb on an adjacent character (Systems
//    save or their line of sight is limited to adjacent spaces until the end of their next turn: reminder only), then a
//    free move up to your Speed that ignores engagement and provokes no reactions.

import { talentRank, card, characters, statusOn } from './common.js';

const KEY = 'infiltrator';
const FLAG_AMBUSH = 'infiltratorAmbush';

export const infiltratorRank = (actor) => talentRank(actor, KEY);

const handled = new WeakSet();   // one Ambush resolution per attack flow

async function ambush(a, token, data, hit) {
    await a.removeActorFlags(token.actor, { [FLAG_AMBUSH]: true });
    const target = (data.hitTokens ?? [])[0];
    if (!hit || !target) {
        await card(token.actor, 'AMBUSH', `<b>${token.name}</b>'s first attack misses: Ambush is spent.`, 'user-ninja');
        return;
    }
    const run = async () => {
        const { results } = await a.executeForceCheck('HULL', [target], { saveVs: token });
        const failed = (results ?? []).some(r => r.completed && !r.passed);
        if (failed) await a.applyEffectsToTokens({ tokens: [target], effectNames: ['slowed', 'impaired'], note: 'Ambush', duration: { label: 'end', turns: 1, rounds: 0 } });
        await card(token.actor, 'AMBUSH', failed
            ? `<b>${target.name}</b> is sent reeling: <b>Slowed and Impaired</b> and <b>cannot take reactions</b> until the end of their next turn.`
            : `<b>${target.name}</b> passes the Hull save.`, 'user-ninja');
    };
    if (!a.afterFlow(data, run)) await run();
}

async function mastermind(a, token) {
    const near = characters(a, token, 1);
    const { confirmed } = await a.askCard({
        title: 'MASTERMIND',
        description: `<b>${token.name}</b> lost Hidden. Throw a flash bomb at an adjacent character, then move up to your Speed (ignores engagement, no reactions)?`,
        yesText: 'Flash and move', noText: 'No', owner: token, originToken: token
    });
    if (!confirmed) return;
    if (near.length) {
        const picked = await a.chooseToken(token, { range: 1, count: 1, includeSelf: false, selection: near, allowEmptyConfirm: true, title: 'FLASH BOMB', description: 'Choose an adjacent character.' });
        const foe = picked?.[0];
        if (foe) {
            const { results } = await a.executeForceCheck('SYSTEMS', [foe], { saveVs: token });
            const failed = (results ?? []).some(r => r.completed && !r.passed);
            await card(token.actor, 'FLASH BOMB', failed
                ? `<b>${foe.name}</b> fails the Systems save: line of sight limited to <b>adjacent spaces</b> until the end of their next turn (track by hand).`
                : `<b>${foe.name}</b> passes the Systems save.`, 'bolt');
        }
    }
    await a.moveToken(token, { free: true, range: token.actor.system?.speed ?? 4, title: 'MASTERMIND', description: 'Move up to your Speed. Ignores engagement and provokes no reactions.' });
}

export function registerInfiltrator(api) {
    api.registerDefaultGeneralReactions({
        'Infiltrator': {
            category: 'General',
            reactions: [
                {
                    comments: 'Infiltrator rank 2: remember that you started the turn Hidden',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('infiltrator'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        return !!(reactorToken.actor.statuses?.has?.('hidden') || reactorToken.actor.system?.statuses?.hidden);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.addActorFlags(reactorToken.actor, { [FLAG_AMBUSH]: true });
                        await card(reactorToken.actor, 'AMBUSH READY', `<b>${reactorToken.name}</b> starts the turn Hidden: the first attack roll this turn can send its target reeling.`, 'user-ninja');
                    }
                },
                {
                    comments: 'Infiltrator rank 2: Ambush resolves on the first attack roll',
                    triggers: ['onHit', 'onMiss', 'onTechHit', 'onTechMiss'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (!a.getActorFlags(reactorToken.actor, 'infiltratorAmbush')) return false;
                        const isMiss = triggerType === 'onMiss' || triggerType === 'onTechMiss';
                        return !(isMiss && (data.hitTokens ?? []).length > 0);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const fs = data.flowState;
                        if (fs && handled.has(fs)) return;
                        if (fs) handled.add(fs);
                        await ambush(a, reactorToken, data, (data.hitTokens ?? []).length > 0);
                    }
                },
                {
                    comments: 'Infiltrator rank 2: Ambush ends with the turn',
                    triggers: ['onTurnEnd'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: false, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'infiltratorAmbush');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_AMBUSH]: true });
                    }
                },
                {
                    comments: 'Infiltrator rank 3: Mastermind when Hidden is lost',
                    triggers: ['onStatusRemoved'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('infiltrator'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        return data.statusId === 'hidden';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await mastermind(a, reactorToken);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Infiltrator registered');
}

export { statusOn };
