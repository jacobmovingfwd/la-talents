// Juggernaut talent, ranks 1-3. [beta]
//  Rank 1, Momentum: when you Boost, your next Ram before the start of your next turn gains +1 Accuracy and knocks
//    the target back an additional 2 spaces. Boost sets a flag; a constant bonus adds the accuracy to a Ram; after the
//    Ram resolves the extra knockback happens and the flag clears (hit or miss: it's your "next Ram").
//  Rank 2, Kinetic Mass Transfer: 1/round, after a Ram hits you're asked what the target was driven into: another
//    character (pick them: Hull save or Prone), an obstruction (1d6 Kinetic to the target) or neither.
//  Rank 3, Unstoppable Force: 1/round, when you Boost you may supercharge: take 1d3+3 Heat and move your full Speed
//    (free movement: ignores engagement, provokes nothing). Afterwards you pick the characters you passed through;
//    each makes a Hull save or is knocked Prone. The straight-line rule, the 20 AP Kinetic to terrain and ignoring
//    difficult terrain are yours to adjudicate. Only characters the same Size as you or smaller should be picked.

import { talentRank, card, characters, hitResults } from './common.js';

const KEY = 'juggernaut';
const FLAG = 'juggMomentum';
const MOMENTUM_ID = 'juggernaut-momentum';

export const juggernautRank = (actor) => talentRank(actor, KEY);

// Self-contained on purpose: serialized by lancer-automations.
const MOMENTUM = {
    id: MOMENTUM_ID,
    name: 'Juggernaut (Momentum)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    condition: (state) => {
        if (!state?.actor?.getFlag?.('la-talents', 'juggMomentum')) return false;
        return String(state?.data?.title ?? '').toLowerCase() === 'ram';
    }
};

export async function syncJuggernautMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === MOMENTUM_ID);
    const should = juggernautRank(mech) >= 1;
    if (should && !has) await api.addConstantBonus(mech, MOMENTUM);
    else if (!should && has) await api.removeConstantBonus(mech, MOMENTUM_ID);
}

async function onBoost(a, token) {
    const rank = juggernautRank(token.actor);
    await token.actor.setFlag('la-talents', FLAG, true);
    await card(token.actor, 'MOMENTUM', `<b>${token.name}</b> boosts: the next Ram before the start of their next turn gains <b>+1 Accuracy</b> and <b>+2 knockback</b>.`, 'truck-fast');
    if (rank >= 3 && a.checkGate(token, 'juggernaut_force')) await supercharge(a, token);
}

async function supercharge(a, token) {
    const { confirmed } = await a.askCard({
        title: 'UNSTOPPABLE FORCE',
        description: `Supercharge your servos? Take <b>1d3+3 Heat</b> and move your maximum Speed in a straight line (ignores engagement, provokes nothing). Characters you pass through make a Hull save or are knocked Prone.`,
        yesText: 'Supercharge', noText: 'No', owner: token, originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'juggernaut_force'))) return;
    const roll = await new Roll('1d3+3').evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: token.actor }), flavor: 'Unstoppable Force: Heat' });
    await a.executeDamageRoll(token, [token], roll.total, 'Heat', 'Unstoppable Force');
    await a.moveToken(token, { free: true, range: token.actor.system?.speed ?? 4, title: 'UNSTOPPABLE FORCE', description: 'Move up to your maximum Speed in a straight line.' });
    const near = canvas.tokens.placeables.filter(t => t.id !== token.id && t.actor && t.actor.type !== 'deployable' && !t.document.hidden);
    const passed = await a.chooseToken(token, {
        count: -1, includeSelf: false, selection: near, allowEmptyConfirm: true,
        title: 'UNSTOPPABLE FORCE', description: 'Choose the characters you passed through (same Size as you or smaller).'
    });
    if (!passed?.length) return;
    const { results } = await a.executeForceCheck('HULL', passed, { saveVs: token });
    const down = (results ?? []).filter(r => r.completed && !r.passed).map(r => r.token);
    if (down.length) await a.applyEffectsToTokens({ tokens: down, effectNames: ['prone'], note: 'Unstoppable Force' });
    await card(token.actor, 'UNSTOPPABLE FORCE', down.length ? `${down.map(t => t.name).join(', ')} fail the save and are knocked <b>Prone</b>.` : 'Everyone passed the Hull save.', 'truck-fast');
}

async function afterRam(a, token, data) {
    const hits = hitResults(data).filter(h => h?.hit && h.target).map(h => h.target);
    const rank = juggernautRank(token.actor);
    const hadMomentum = !!token.actor.getFlag('la-talents', FLAG);
    if (hadMomentum) await token.actor.unsetFlag('la-talents', FLAG);
    if (!hits.length) return;
    const run = async () => {
        if (hadMomentum) {
            for (const t of hits) await a.knockBackToken([t], 2, { triggeringToken: token, actionName: 'Momentum', title: 'MOMENTUM: KNOCKBACK', description: 'Knocked back an additional 2 spaces.' });
        }
        if (rank >= 2 && a.checkGate(token, 'juggernaut_mass')) await massTransfer(a, token, hits[0]);
    };
    if (!a.afterFlow(data, run)) await run();
}

async function massTransfer(a, token, target) {
    const pick = await a.startChoiceCard({
        title: 'KINETIC MASS TRANSFER', icon: 'fas fa-truck-fast',
        description: `<b>${target.name}</b> was rammed. What did they end up against?`,
        originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(token),
        choices: [
            { text: 'Another character', icon: 'fas fa-people-arrows', callback: async () => {} },
            { text: 'An obstruction', icon: 'fas fa-block-brick', callback: async () => {} },
            { text: 'Neither', icon: 'fas fa-xmark', callback: async () => {} }
        ]
    });
    if (pick?.choiceIdx === 0) {
        if (!(await a.consumeOncePerRound(token, 'juggernaut_mass'))) return;
        const near = characters(a, target, 2);
        const picked = await a.chooseToken(token, { count: 1, includeSelf: false, selection: near, title: 'KINETIC MASS TRANSFER', description: 'Choose the character that was hit.' });
        const other = picked?.[0];
        if (!other) return;
        const { results } = await a.executeForceCheck('HULL', [other], { saveVs: token });
        const failed = (results ?? []).some(r => r.completed && !r.passed);
        if (failed) await a.applyEffectsToTokens({ tokens: [other], effectNames: ['prone'], note: 'Kinetic Mass Transfer' });
        await card(token.actor, 'KINETIC MASS TRANSFER', failed ? `<b>${other.name}</b> fails the Hull save and is knocked <b>Prone</b>.` : `<b>${other.name}</b> passes the Hull save.`, 'truck-fast');
    } else if (pick?.choiceIdx === 1) {
        if (!(await a.consumeOncePerRound(token, 'juggernaut_mass'))) return;
        await a.executeDamageRoll(token, [target], '1d6', 'Kinetic', 'Kinetic Mass Transfer');
        await card(token.actor, 'KINETIC MASS TRANSFER', `<b>${target.name}</b> slams into an obstruction: <b>1d6 Kinetic</b>.`, 'truck-fast');
    }
}

export function registerJuggernaut(api) {
    api.registerDefaultGeneralReactions({
        'Juggernaut': {
            category: 'General',
            reactions: [
                {
                    comments: 'Juggernaut ranks 1 and 3: Boost sets up Momentum and offers Unstoppable Force',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('juggernaut'));
                        return !!t && String(data.actionName ?? '').toLowerCase() === 'boost';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await onBoost(a, reactorToken);
                    }
                },
                {
                    comments: 'Juggernaut ranks 1-2: a Ram resolves (extra knockback, Kinetic Mass Transfer)',
                    triggers: ['onHit', 'onMiss'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('juggernaut'));
                        if (!t) return false;
                        if (String(data.actionName ?? '').toLowerCase() !== 'ram') return false;
                        const isMiss = triggerType === 'onMiss';
                        return !(isMiss && (data.hitTokens ?? []).length > 0);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await afterRam(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Juggernaut rank 1: Momentum ends at the start of your next turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!reactorToken.actor?.getFlag?.('la-talents', 'juggMomentum');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await reactorToken.actor.unsetFlag('la-talents', FLAG);
                    }
                }
            ]
        }
    });
    console.info('la-talents | Juggernaut registered');
}
