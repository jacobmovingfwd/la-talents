// Crack Shot talent, ranks 1-3 (Rifles). [beta]
//  Rank 1, Stable, Steady: using the Steady Aim protocol makes you Immobilized until the start of your next turn
//    and gives +1 Accuracy on attacks with Rifles. Hooked to the Steady Aim action from the talent sheet: the +1
//    Accuracy is a global bonus removed at your next turn start (as is the Immobilized status).
//  Rank 2, Zero In: 1/round, when you attack with a Rifle while steadying, you're offered a weak-point shot: +1
//    Difficulty on the roll, and +1d6 bonus damage if it crits.
//  Rank 3, Watch This: 1/round, a Rifle crit while steadying makes the target pass a Hull save, or you choose
//    Headshot (LOS limited to adjacent spaces: reminder only), Leg shot (Immobilized until the end of their next
//    turn) or Body shot (knocked Prone).

import { talentRank, card, hitResults, wType } from './common.js';

const KEY = 'crack_shot';
const STEADY_ID = 'crackshot-steady';
const ZERO_PREFIX = 'crackshot-zero';

export const crackShotRank = (actor) => talentRank(actor, KEY);

const steadying = (a, actor) => a.getGlobalBonuses(actor).some(b => b?.id === STEADY_ID);
const isRifle = (w) => w?.type === 'mech_weapon' && wType(w) === 'RIFLE';

async function steadyAim(a, token) {
    await a.removeGlobalBonus(token.actor, (b) => b?.id === STEADY_ID);
    // Self-contained on purpose: lancer-automations serializes these functions.
    await a.addGlobalBonus(token.actor, {
        id: STEADY_ID, name: 'Steady Aim: +1 Accuracy (Rifles)', type: 'accuracy', val: 1, rollTypes: ['attack'],
        condition: (st) => String(st?.item?.system?.active_profile?.type ?? st?.item?.system?.type ?? '').toUpperCase() === 'RIFLE'
    }, { duration: 'indefinite', origin: token });
    await a.applyEffectsToTokens({ tokens: [token], effectNames: ['immobilized'], note: 'Steady Aim', duration: { label: 'indefinite' } });
    await card(token.actor, 'STEADY AIM', `<b>${token.name}</b> steadies: <b>Immobilized</b> until the start of their next turn, <b>+1 Accuracy</b> with Rifles.`, 'crosshairs');
}

async function endSteady(a, token) {
    await a.removeGlobalBonus(token.actor, (b) => b?.id === STEADY_ID);
    await a.removeEffectsByNameFromTokens({ tokens: [token], effectNames: ['immobilized'], notify: false });
}

async function zeroIn(a, token, data) {
    const { confirmed } = await a.askCard({
        title: 'ZERO IN',
        description: `Steadying your aim: go for a weak point with <b>${data.weapon.name}</b>? <b>+1 Difficulty</b> on the roll, <b>+1d6</b> bonus damage on a critical hit.`,
        yesText: 'Zero in', noText: 'Normal shot', owner: token, originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'crackshot_zero'))) return;
    await a.addGlobalBonus(token.actor, {
        id: `${ZERO_PREFIX}-diff`, name: 'Zero In: +1 Difficulty', type: 'difficulty', val: 1, rollTypes: ['attack']
    }, { duration: 'indefinite', origin: token });
    await a.addActorFlags(token.actor, { crackShotZero: true });
    const drop = async () => {
        await a.removeGlobalBonus(token.actor, (b) => String(b?.id ?? '').startsWith(ZERO_PREFIX));
        await a.removeActorFlags(token.actor, { crackShotZero: true });
    };
    if (!a.afterFlow(data, drop)) setTimeout(drop, 30000);
}

async function critEffects(a, token, data) {
    const crit = hitResults(data).find(h => h?.hit && h.crit && h.target);
    if (!crit) return;
    if (crackShotRank(token.actor) >= 2 && a.getActorFlags(token.actor, 'crackShotZero')) {
        await a.addGlobalBonus(token.actor, {
            id: `${ZERO_PREFIX}-dmg`, name: 'Zero In: +1d6', type: 'damage', damage: [{ val: '1d6', type: weaponDamageType(data.weapon) }], rollTypes: ['damage']
        }, { duration: 'indefinite', origin: token, consumption: { trigger: 'onDamage', evaluate: 'return true;' } });
    }
    if (crackShotRank(token.actor) >= 3 && a.checkGate(token, 'crackshot_watch') && await a.consumeOncePerRound(token, 'crackshot_watch')) {
        const target = crit.target;
        const run = async () => {
            const { results } = await a.executeForceCheck('HULL', [target], { saveVs: token });
            if (!(results ?? []).some(r => r.completed && !r.passed)) {
                await card(token.actor, 'WATCH THIS', `<b>${target.name}</b> passes the Hull save.`, 'crosshairs');
                return;
            }
            const pick = await a.startChoiceCard({
                title: 'WATCH THIS', icon: 'fas fa-crosshairs',
                description: `<b>${target.name}</b> failed the Hull save. Choose the shot.`,
                originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(token),
                choices: [
                    { text: 'Headshot: LOS to adjacent only', icon: 'fas fa-eye-slash', callback: async () => {} },
                    { text: 'Leg shot: Immobilized', icon: 'fas fa-person-walking', callback: async () => {} },
                    { text: 'Body shot: Prone', icon: 'fas fa-person-falling', callback: async () => {} }
                ]
            });
            if (pick?.choiceIdx === 0)
                await card(token.actor, 'HEADSHOT', `<b>${target.name}</b> only has line of sight to <b>adjacent spaces</b> until the end of their next turn (track by hand).`, 'crosshairs');
            else if (pick?.choiceIdx === 1) {
                await a.applyEffectsToTokens({ tokens: [target], effectNames: ['immobilized'], note: 'Leg shot', duration: { label: 'end', turns: 1, rounds: 0 } });
                await card(token.actor, 'LEG SHOT', `<b>${target.name}</b> is <b>Immobilized</b> until the end of their next turn.`, 'crosshairs');
            } else if (pick?.choiceIdx === 2) {
                await a.applyEffectsToTokens({ tokens: [target], effectNames: ['prone'], note: 'Body shot' });
                await card(token.actor, 'BODY SHOT', `<b>${target.name}</b> is knocked <b>Prone</b>.`, 'crosshairs');
            }
        };
        if (!a.afterFlow(data, run)) await run();
    }
}

const weaponDamageType = (w) => w?.system?.active_profile?.damage?.[0]?.type ?? 'Kinetic';

export function registerCrackShot(api) {
    api.registerDefaultGeneralReactions({
        'Crack Shot': {
            category: 'General',
            reactions: [
                {
                    comments: 'Crack Shot rank 1: the Steady Aim protocol',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('crack_shot'));
                        return !!t && String(data.actionName ?? '').toLowerCase() === 'steady aim';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await steadyAim(a, reactorToken);
                    }
                },
                {
                    comments: 'Crack Shot: Steady Aim ends at the start of your next turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return a.getGlobalBonuses(reactorToken.actor).some(b => b?.id === 'crackshot-steady');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await endSteady(a, reactorToken);
                    }
                },
                {
                    comments: 'Crack Shot rank 2: Zero In offered before a steadied Rifle attack',
                    triggers: ['onInitAttack'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (data.weapon?.system?.disabled || data.weapon?.system?.destroyed) return false;   // the attack will be refused anyway
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('crack_shot'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'RIFLE') return false;
                        if (!a.getGlobalBonuses(reactorToken.actor).some(b => b?.id === 'crackshot-steady')) return false;
                        return a.checkGate(reactorToken, 'crackshot_zero');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await zeroIn(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Crack Shot ranks 2-3: the +1d6 on a crit, and Watch This',
                    triggers: ['onHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('crack_shot'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const w = data.weapon;
                        if (!w || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'RIFLE') return false;
                        if (!a.getGlobalBonuses(reactorToken.actor).some(b => b?.id === 'crackshot-steady')) return false;
                        return (data.flowState?.data?.hit_results ?? []).some(h => h?.hit && h.crit);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await critEffects(a, reactorToken, data);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Crack Shot registered');
}

export { isRifle };
