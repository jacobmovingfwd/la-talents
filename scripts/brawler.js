// Brawler talent, ranks 1-3. [beta]
//  Rank 1, Hold and Lock: +1 Accuracy on melee attacks against a character you are Grappling (constant bonus; reads
//    the Grapple state Lancer Automations keeps on the token).
//  Rank 2, Sledgehammer: Improvised Attacks gain Knockback 2 and deal 2d6+2 Kinetic. The talent's own data already
//    carries these bonuses, so the Lancer system applies them: nothing is added here.
//  Rank 3, Knockout Blow: the Brawler Die (d6, starts at 6, an actor flag so it persists between scenes).
//    - Each Grapple, Ram or Improvised Attack lowers it by 1 (minimum 1).
//    - Using the Knockout Blow action while the die is at 1 resets it to 6, then asks which adjacent character; they
//      pass a Hull save or take 2d6+2 Kinetic and are Stunned until the end of their next turn. If the die is not at 1
//      you are told so and nothing happens.
//    - A Full Repair resets the die. Resting has no trigger: game.modules.get('la-talents').api.resetBrawlerDie(actor)
//    The talent sheet's own Brawler Die counter is NOT kept in step: use the chat cards (or the flag) as the truth.

import { talentRank, card, characters, flagNum } from './common.js';

const KEY = 'brawler';
const FLAG_DIE = 'brawlerDie';
const HOLD_ID = 'brawler-hold-and-lock';

export const brawlerRank = (actor) => talentRank(actor, KEY);

// Self-contained on purpose: serialized by lancer-automations.
const HOLD_AND_LOCK = {
    id: HOLD_ID,
    name: 'Brawler (Hold and Lock)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    condition: (state) => {
        const w = state?.item;
        const melee = (w && w.type === 'mech_weapon' && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE')
            || String(state?.data?.attack_type ?? '').toLowerCase() === 'melee';
        return !!melee;
    },
    applyToCondition: (target, state, reactorToken) => {
        const g = reactorToken?.document?.getFlag?.('lancer-automations', 'grappleState');
        return !!g?.grappledIds?.includes(target?.id);
    }
};

export async function syncBrawlerMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === HOLD_ID);
    const should = brawlerRank(mech) >= 1;
    if (should && !has) await api.addConstantBonus(mech, HOLD_AND_LOCK);
    else if (!should && has) await api.removeConstantBonus(mech, HOLD_ID);
}

const getDie = (a, actor) => Math.min(6, Math.max(1, flagNum(a, actor, FLAG_DIE, 6)));

export async function resetBrawlerDie(a, actor, why) {
    const had = getDie(a, actor);
    await a.addActorFlags(actor, { [FLAG_DIE]: 6 });
    if (had !== 6 && why) await card(actor, 'BRAWLER DIE', `${why} The die resets to <b>6</b>.`, 'hand-fist');
}

async function lowerDie(a, token, what) {
    const before = getDie(a, token.actor);
    if (before <= 1) return;
    const now = before - 1;
    await a.addActorFlags(token.actor, { [FLAG_DIE]: now });
    await card(token.actor, 'BRAWLER DIE', now === 1
        ? `<b>${what}</b>: the die falls to <b>1</b>. <b>Knockout Blow</b> is ready.`
        : `<b>${what}</b>: the die falls to <b>${now}</b>.`, 'hand-fist');
}

async function knockout(a, token) {
    if (getDie(a, token.actor) !== 1) {
        ui.notifications.warn(`Knockout Blow: the Brawler Die is at ${getDie(a, token.actor)}, it must be at 1.`);
        return;
    }
    const near = characters(a, token, 1);
    const picked = await a.chooseToken(token, {
        range: 1, count: 1, includeSelf: false, selection: near,
        title: 'KNOCKOUT BLOW', description: 'Choose an adjacent character.'
    });
    const foe = picked?.[0];
    if (!foe) return;
    await a.addActorFlags(token.actor, { [FLAG_DIE]: 6 });
    const { results } = await a.executeForceCheck('HULL', [foe], { saveVs: token });
    const failed = (results ?? []).some(r => r.completed && !r.passed);
    if (failed) {
        await a.executeDamageRoll(token, [foe], '2d6+2', 'Kinetic', 'Knockout Blow');
        await a.applyEffectsToTokens({ tokens: [foe], effectNames: ['stunned'], note: 'Knockout Blow', duration: { label: 'end', turns: 1, rounds: 0 } });
    }
    await card(token.actor, 'KNOCKOUT BLOW', failed
        ? `<b>${foe.name}</b> fails the Hull save: <b>2d6+2 Kinetic</b> and <b>Stunned</b> until the end of their next turn. The die resets to 6.`
        : `<b>${foe.name}</b> passes the Hull save. The die resets to 6.`, 'hand-fist');
}

export function registerBrawler(api) {
    api.registerDefaultGeneralReactions({
        'Brawler': {
            category: 'General',
            reactions: [
                {
                    comments: 'Brawler rank 3: Grapple, Ram and Improvised Attacks lower the Brawler Die',
                    triggers: ['onAttack'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('brawler'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        const n = String(data.actionName ?? '').toLowerCase();
                        return n.includes('grapple') || n === 'ram' || n.includes('improvised');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await lowerDie(a, reactorToken, data.actionName);
                    }
                },
                {
                    comments: 'Brawler rank 3: the Knockout Blow action',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('brawler'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        return String(data.actionName ?? '').toLowerCase() === 'knockout blow';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await knockout(a, reactorToken);
                    }
                },
                {
                    comments: 'Brawler rank 3: a Full Repair resets the die',
                    triggers: ['onFullRepair'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('brawler'));
                        return !!t && (Number(t.system?.curr_rank) || 1) >= 3;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await resetBrawlerDie(a, reactorToken.actor, 'Full Repair.');
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), resetBrawlerDie: (actor) => resetBrawlerDie(api, actor?.actor ?? actor, 'Rest.') };
    console.info('la-talents | Brawler registered');
}
