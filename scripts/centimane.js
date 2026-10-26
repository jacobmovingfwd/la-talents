// Centimane talent, ranks 1-3. [beta] Works on Nexus weapons.
//  Rank 1, Ten Thousand Teeth: 1/round, a critical hit with a Nexus makes the target pass a Systems save or become
//    Impaired and Slowed until the end of their next turn.
//  Rank 2, Expose Weakness: a critical hit with a Nexus that consumed Lock On leaves the target Shredded until the
//    start of your next turn (removed by a reaction at your next turn start). Drone systems are not covered.
//  Rank 3, Tidal Suppression: replaces Ten Thousand Teeth. Same trigger; on a failed save you choose one swarm:
//    Harrying (Impaired + Slowed), Blinding (line of sight limited to adjacent spaces: reminder only),
//    Virulent (Shredded, plus a Systems save for adjacent characters of your choice or they are Shredded too),
//    Restricting (1 Burn per action or reaction: reminder only).
//    Both timed effects use "until the end of their next turn".

import { talentRank, card, hitResults, wType, characters } from './common.js';

const KEY = 'centimane';
const FLAG_SHRED = 'centimaneShred';

export const centimaneRank = (actor) => talentRank(actor, KEY);

const END_NEXT = { label: 'end', turns: 1, rounds: 0 };

async function failedSave(a, token, targets) {
    const { results } = await a.executeForceCheck('SYSTEMS', targets, { saveVs: token });
    return (results ?? []).filter(r => r.completed && !r.passed).map(r => r.token);
}

async function swarm(a, token, target) {
    const rank = centimaneRank(token.actor);
    const failed = await failedSave(a, token, [target]);
    if (!failed.length) {
        await card(token.actor, rank >= 3 ? 'TIDAL SUPPRESSION' : 'TEN THOUSAND TEETH', `<b>${target.name}</b> passes the Systems save.`, 'bugs');
        return;
    }
    if (rank < 3) {
        await a.applyEffectsToTokens({ tokens: [target], effectNames: ['impaired', 'slowed'], note: 'Ten Thousand Teeth', duration: END_NEXT });
        await card(token.actor, 'TEN THOUSAND TEETH', `<b>${target.name}</b> fails the save: <b>Impaired and Slowed</b> until the end of their next turn.`, 'bugs');
        return;
    }
    const pick = await a.startChoiceCard({
        title: 'TIDAL SUPPRESSION', icon: 'fas fa-bugs',
        description: `<b>${target.name}</b> failed the Systems save. Choose a swarm (lasts until the end of their next turn).`,
        originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(token),
        choices: [
            { text: 'Harrying: Impaired + Slowed', icon: 'fas fa-bug', callback: async () => {} },
            { text: 'Blinding: LOS to adjacent only', icon: 'fas fa-eye-slash', callback: async () => {} },
            { text: 'Virulent: Shredded (+ adjacent)', icon: 'fas fa-biohazard', callback: async () => {} },
            { text: 'Restricting: 1 Burn per action', icon: 'fas fa-fire', callback: async () => {} }
        ]
    });
    switch (pick?.choiceIdx) {
        case 0:
            await a.applyEffectsToTokens({ tokens: [target], effectNames: ['impaired', 'slowed'], note: 'Harrying Swarm', duration: END_NEXT });
            await card(token.actor, 'HARRYING SWARM', `<b>${target.name}</b> is <b>Impaired and Slowed</b> until the end of their next turn.`, 'bugs');
            break;
        case 1:
            await card(token.actor, 'BLINDING SWARM', `<b>${target.name}</b> only has line of sight to <b>adjacent spaces</b> until the end of their next turn (track by hand).`, 'bugs');
            break;
        case 2: {
            await a.applyEffectsToTokens({ tokens: [target], effectNames: ['shredded'], note: 'Virulent Swarm', duration: END_NEXT });
            const near = characters(a, target, 1).filter(t => t.id !== token.id);
            let spread = [];
            if (near.length) {
                const chosen = await a.chooseToken(token, {
                    count: -1, includeSelf: false, selection: near, allowEmptyConfirm: true,
                    title: 'VIRULENT SWARM', description: `Choose adjacent characters of ${target.name} to make a Systems save or become Shredded.`
                });
                if (chosen?.length) {
                    const bad = await failedSave(a, token, chosen);
                    if (bad.length) await a.applyEffectsToTokens({ tokens: bad, effectNames: ['shredded'], note: 'Virulent Swarm', duration: END_NEXT });
                    spread = bad;
                }
            }
            await card(token.actor, 'VIRULENT SWARM', `<b>${target.name}</b> is <b>Shredded</b> until the end of their next turn.${spread.length ? ` Also Shredded: ${spread.map(t => t.name).join(', ')}.` : ''}`, 'bugs');
            break;
        }
        case 3:
            await card(token.actor, 'RESTRICTING SWARM', `<b>${target.name}</b> takes <b>1 Burn</b> each time they take an action or reaction, until the end of their next turn (track by hand).`, 'bugs');
            break;
        default: break;
    }
}

async function expose(a, token, target) {
    await a.applyEffectsToTokens({ tokens: [target], effectNames: ['shredded'], note: 'Expose Weakness', duration: { label: 'indefinite' } });
    const list = a.getActorFlags(token.actor, FLAG_SHRED) ?? [];
    await a.addActorFlags(token.actor, { [FLAG_SHRED]: [...new Set([...list, target.id])] });
    await card(token.actor, 'EXPOSE WEAKNESS', `Lock On and a critical hit: <b>${target.name}</b> is <b>Shredded</b> until the start of ${token.name}'s next turn.`, 'bugs');
}

async function clearExposed(a, token) {
    const ids = a.getActorFlags(token.actor, FLAG_SHRED) ?? [];
    const tokens = ids.map(id => canvas.tokens.get(id)).filter(Boolean);
    if (tokens.length) await a.removeEffectsByNameFromTokens({ tokens, effectNames: ['shredded'], notify: false });
    await a.removeActorFlags(token.actor, { [FLAG_SHRED]: true });
}

export function registerCentimane(api) {
    api.registerDefaultGeneralReactions({
        'Centimane': {
            category: 'General',
            reactions: [
                {
                    comments: 'Centimane ranks 1-3: critical hits with a Nexus',
                    triggers: ['onHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('centimane'));
                        if (!t) return false;
                        const w = data.weapon;
                        if (!w || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'NEXUS') return false;
                        return (data.flowState?.data?.hit_results ?? []).some(h => h?.hit && h.crit);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const crits = hitResults(data).filter(h => h?.hit && h.crit && h.target);
                        const rank = centimaneRank(reactorToken.actor);
                        const run = async () => {
                            if (a.checkGate(reactorToken, 'centimane_crit') && await a.consumeOncePerRound(reactorToken, 'centimane_crit'))
                                await swarm(a, reactorToken, crits[0].target);
                            if (rank >= 2) for (const h of crits.filter(x => x.usedLockOn)) await expose(a, reactorToken, h.target);
                        };
                        if (!a.afterFlow(data, run)) await run();
                    }
                },
                {
                    comments: 'Centimane rank 2: Shredded ends at the start of your next turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return (a.getActorFlags(reactorToken.actor, 'centimaneShred') ?? []).length > 0;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await clearExposed(a, reactorToken);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Centimane registered');
}

export { wType };
