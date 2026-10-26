// Hacker talent, ranks 1-3. [beta]
//  Rank 1, SNOW_CRASH: when you hit with a tech attack that consumes Lock On, the target chooses: take 2 Heat, or be
//    pushed 3 spaces in a direction you choose. The choice card goes to the target's controller; the push opens a
//    forced-move marker on whichever client runs it, so the person who picked the direction should be the one
//    moving the token (usually the GM).
//  Rank 2, SAFE_CRACKER: the three extra Invade options (Jam Cockpit, Disable Life Support, Hack./Slash) come from
//    the talent's own actions on the sheet. Their effects are narrative and are not automated.
//  Rank 3, Last Argument of Kings: after a hit with the Last Argument of Kings action, the target takes Burn equal to
//    its current Heat. If that overheats it, resolve the order against its Heat Cap by hand.

import { talentRank, card } from './common.js';

const KEY = 'hacker';
export const hackerRank = (actor) => talentRank(actor, KEY);

async function snowCrash(a, token, target) {
    const pick = await a.startChoiceCard({
        title: 'SNOW_CRASH', icon: 'fas fa-bug',
        description: `<b>${token.name}</b> hit <b>${target.name}</b> with a tech attack that consumed Lock On. Take <b>2 Heat</b>, or be <b>pushed 3 spaces</b> in a direction of the hacker's choice?`,
        originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(target),
        choices: [
            { text: 'Take 2 Heat', icon: 'fas fa-fire', callback: async () => {} },
            { text: 'Be pushed 3 spaces', icon: 'fas fa-arrows-up-down-left-right', callback: async () => {} }
        ]
    });
    if (pick?.choiceIdx === 0) {
        await a.executeDamageRoll(token, [target], 2, 'Heat', 'SNOW_CRASH');
        await card(token.actor, 'SNOW_CRASH', `<b>${target.name}</b> takes <b>2 Heat</b>.`, 'terminal');
    } else if (pick?.choiceIdx === 1) {
        await a.moveToken(target, { range: 3, action: 'forced', title: 'SNOW_CRASH: PUSHED', description: `${target.name} is pushed 3 spaces in a direction chosen by ${token.name}.` });
        await card(token.actor, 'SNOW_CRASH', `<b>${target.name}</b> is pushed <b>3 spaces</b>.`, 'terminal');
    }
}

async function lastArgument(a, token, target) {
    const heat = Number(target.actor?.system?.heat?.value) || 0;
    if (heat <= 0) return card(token.actor, 'LAST ARGUMENT OF KINGS', `<b>${target.name}</b> has no Heat: no Burn.`, 'terminal');
    await a.executeDamageRoll(token, [target], heat, 'Burn', 'Last Argument of Kings');
    await card(token.actor, 'LAST ARGUMENT OF KINGS', `<b>${target.name}</b> takes <b>${heat} Burn</b> (equal to its current Heat).`, 'terminal');
}

export function registerHacker(api) {
    api.registerDefaultGeneralReactions({
        'Hacker': {
            category: 'General',
            reactions: [
                {
                    comments: 'Hacker rank 1: SNOW_CRASH; rank 3: Last Argument of Kings',
                    triggers: ['onTechHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('hacker'));
                        if (!t) return false;
                        const lastArg = String(data.actionName ?? '').toLowerCase() === 'last argument of kings';
                        const lockOn = (data.flowState?.data?.hit_results ?? []).some(h => h?.hit && h.usedLockOn);
                        return lastArg || lockOn;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const rank = hackerRank(reactorToken.actor);
                        const lastArg = String(data.actionName ?? '').toLowerCase() === 'last argument of kings';
                        const run = async () => {
                            if (lastArg && rank >= 3) for (const t of data.hitTokens ?? []) await lastArgument(a, reactorToken, t);
                            const lockOn = (data.flowState?.data?.hit_results ?? []).filter(h => h?.hit && h.usedLockOn && h.target);
                            if (!lastArg || lockOn.length) for (const h of lockOn) await snowCrash(a, reactorToken, h.target);
                        };
                        if (!a.afterFlow(data, run)) await run();
                    }
                }
            ]
        }
    });
    console.info('la-talents | Hacker registered');
}
