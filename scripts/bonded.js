// Bonded talent, ranks 1-3. [beta]
//  Choosing your Bondmate is a macro (the bondmate is stored as a flag on your mech):
//      game.modules.get('la-talents').api.setBondmate()          (uses the selected token; pick the other character)
//  Rank 1, I'm Your Huckleberry: mech skill checks and saves either of you makes while adjacent gain +1 Accuracy;
//    +2 if both of you have the talent and name each other. Two constant bonuses, put on every mech that holds the
//    talent or is named as a Bondmate by someone who does (GM sync, so the Bondmate also gets the benefit).
//  Rank 2, Sundance (Intercede): 1/round reaction, when you're adjacent to your Bondmate and they would take damage
//    from an attack. On accept the Bondmate becomes immune to that attack's damage and, once the attack finishes, you
//    take the damage rolled (your own armor and resistances apply, because it is rolled against you).
//    Only attacks are covered (not burn, hazards or other sources). Line of sight is not checked.
//  Rank 3, Cover Me!: when a character attacks your Bondmate and you can reach the attacker with a ranged weapon in
//    Range, you may spend your Reaction (Overwatch) to fire first at the attacker. The attacker is NOT given the
//    "pick a different target or attack anyway" choice: the shot simply resolves before theirs.

import { talentRank, card, tokenOf, weaponsOf, hasRange } from './common.js';

const KEY = 'bonded';
const FLAG_MATE = 'bondmate';

export const bondedRank = (actor) => talentRank(actor, KEY);

const holder = (a) => bondedRank(a) >= 1;

// Self-contained on purpose: serialized by lancer-automations. Two copies because each must stand alone.
const BOND_1 = {
    id: 'bonded-accuracy', name: 'Bonded (adjacent Bondmate)', type: 'accuracy', val: 1, rollTypes: ['check'],
    condition: (state) => {
        const me = state?.actor; if (!me) return false;
        const api = game.modules.get('lancer-automations')?.api;
        const has = (x) => !!x?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('bonded'));
        const myTok = me.token ? canvas.tokens.get(me.token.id) : me.getActiveTokens?.()[0];
        if (!myTok) return false;
        for (const t of canvas.tokens.placeables) {
            const b = t.actor; if (!b || b.id === me.id) continue;
            const mine = has(me) && me.getFlag('la-talents', 'bondmate') === b.id;
            const theirs = has(b) && b.getFlag('la-talents', 'bondmate') === me.id;
            if ((mine || theirs) && api.getTokenDistance(myTok, t) <= 1) return true;
        }
        return false;
    }
};
const BOND_2 = {
    id: 'bonded-accuracy-mutual', name: 'Bonded (mutual Bondmates)', type: 'accuracy', val: 1, rollTypes: ['check'],
    condition: (state) => {
        const me = state?.actor; if (!me) return false;
        const api = game.modules.get('lancer-automations')?.api;
        const has = (x) => !!x?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('bonded'));
        const myTok = me.token ? canvas.tokens.get(me.token.id) : me.getActiveTokens?.()[0];
        if (!myTok) return false;
        for (const t of canvas.tokens.placeables) {
            const b = t.actor; if (!b || b.id === me.id) continue;
            const mine = has(me) && me.getFlag('la-talents', 'bondmate') === b.id;
            const theirs = has(b) && b.getFlag('la-talents', 'bondmate') === me.id;
            if (mine && theirs && api.getTokenDistance(myTok, t) <= 1) return true;
        }
        return false;
    }
};

// All mechs / NPCs: who needs the bonuses depends on other actors, so this runs once over everyone.
export async function syncBondedAll(api) {
    const holders = game.actors.filter(a => a.type === 'mech' && holder(a));
    const named = new Set(holders.map(h => h.getFlag('la-talents', FLAG_MATE)).filter(Boolean));
    for (const actor of game.actors.filter(a => a.type === 'mech' || a.type === 'npc')) {
        const should = holders.includes(actor) || named.has(actor.id);
        for (const [bonus, want] of [[BOND_1, should], [BOND_2, should]]) {
            const has = api.getConstantBonuses(actor).some(b => b.id === bonus.id);
            if (want && !has) await api.addConstantBonus(actor, bonus);
            else if (!want && has) await api.removeConstantBonus(actor, bonus.id);
        }
    }
}

export async function setBondmate(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Bondmate: select the Bonded character first.');
    if (bondedRank(token.actor) < 1) return ui.notifications.warn(`Bondmate: ${token.name}'s pilot does not have Bonded.`);
    const picked = await a.chooseToken(token, { count: 1, includeSelf: false, title: 'BONDMATE', description: 'Choose your Bondmate.' });
    const mate = picked?.[0];
    if (!mate) return;
    await token.actor.setFlag('la-talents', FLAG_MATE, mate.actor.id);
    await card(token.actor, 'BONDMATE', `<b>${token.name}</b> is Bonded with <b>${mate.name}</b>.`);
}

const mateToken = (token) => {
    const id = token.actor.getFlag('la-talents', FLAG_MATE);
    return id ? canvas.tokens.placeables.find(t => t.actor?.id === id) : null;
};

async function intercede(a, token, mate, data) {
    const attacker = data.triggeringToken;
    const { confirmed } = await a.askCard({
        title: 'INTERCEDE',
        description: `<b>${attacker?.name ?? 'An attacker'}</b> hit your Bondmate <b>${mate.name}</b>. Spend your Reaction to take the damage instead?`,
        yesText: 'Intercede', noText: 'Let it land', owner: token, originToken: token, relatedToken: mate
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'bonded_intercede'))) return;
    await a.setReaction(token, false);
    const id = `bonded-intercede-${mate.id}`;
    await a.removeGlobalBonus(mate.actor, (b) => b?.id === id);
    await a.addGlobalBonus(mate.actor, {
        id, name: 'Intercede', type: 'immunity', subtype: 'damage', damageTypes: ['all']
    }, { duration: 'indefinite', origin: token, consumption: { trigger: 'onDamage', evaluate: 'return true;' } });

    const settle = async (flow) => {
        await a.removeGlobalBonus(mate.actor, (b) => b?.id === id);
        const st = flow?.state?.data;
        const results = (st?.has_crit_hit ? st?.crit_damage_results : st?.damage_results) ?? [];
        const totals = new Map();
        for (const r of results) {
            const n = Number(r.roll?.total ?? r.total ?? 0);
            if (n > 0) totals.set(r.d_type, (totals.get(r.d_type) ?? 0) + n);
        }
        for (const [type, n] of totals) await a.executeDamageRoll(attacker ?? token, [token], n, type, 'Intercede');
        await card(token.actor, 'INTERCEDE', totals.size
            ? `<b>${token.name}</b> takes the hit meant for <b>${mate.name}</b>: ${[...totals].map(([t, n]) => `${n} ${t}`).join(', ')}.`
            : `<b>${token.name}</b> stepped in, but no damage was rolled.`);
    };
    if (!a.afterFlow(data, settle)) await settle(null);
}

async function coverMe(a, token, mate, attacker) {
    const dist = a.getTokenDistance(token, attacker);
    const weapons = weaponsOf(token.actor).filter(w => hasRange(w) && w.system?.loaded !== false
        && (a.getMaxWeaponRanges_WithBonus(w).Range ?? 0) >= dist);
    if (!weapons.length) return;
    const { confirmed } = await a.askCard({
        title: 'COVER ME!',
        description: `<b>${attacker.name}</b> is about to attack your Bondmate <b>${mate.name}</b>. Spend your Overwatch to shoot them first?`,
        yesText: 'Cover', noText: 'Hold', owner: token, originToken: token, relatedToken: attacker
    });
    if (!confirmed) return;
    await a.setReaction(token, false);
    let weapon = weapons[0];
    if (weapons.length > 1) {
        const pick = await a.startChoiceCard({
            title: 'COVER ME!', icon: 'fas fa-crosshairs',
            description: `Choose the weapon to fire at <b>${attacker.name}</b>.`,
            originToken: token, relatedToken: attacker, userIdControl: a.getTokenOwnerUserId(token),
            choices: weapons.map(w => ({ text: w.name, icon: 'fas fa-crosshairs', callback: async () => {} }))
        });
        weapon = weapons[pick?.choiceIdx];
        if (!weapon) return;
    }
    await a.attackWith(weapon, attacker);
}

export function registerBonded(api) {
    api.registerDefaultGeneralReactions({
        'Bonded': {
            category: 'General',
            reactions: [
                {
                    comments: 'Bonded rank 2: Intercede',
                    triggers: ['onPreDamage'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('bonded'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const mateId = reactorToken.actor.getFlag('la-talents', 'bondmate');
                        if (!mateId) return false;
                        const mate = (data.targets ?? []).find(x => x?.actor?.id === mateId);
                        if (!mate || mate.id === reactorToken.id) return false;
                        return a.getTokenDistance(reactorToken, mate) <= 1 && a.checkGate(reactorToken, 'bonded_intercede');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const mateId = reactorToken.actor.getFlag('la-talents', FLAG_MATE);
                        const mate = (data.targets ?? []).find(x => x?.actor?.id === mateId);
                        if (mate) await intercede(a, reactorToken, mate, data);
                    }
                },
                {
                    comments: 'Bonded rank 3: Cover Me! before an attack on your Bondmate',
                    triggers: ['onInitAttack'],
                    triggerSelf: false, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    isReaction: true, checkReaction: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (data.weapon?.system?.disabled || data.weapon?.system?.destroyed) return false;   // the attack will be refused anyway
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('bonded'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        const mateId = reactorToken.actor.getFlag('la-talents', 'bondmate');
                        if (!mateId) return false;
                        return (data.targets ?? []).some(x => (x?.actor ?? x?.target?.actor)?.id === mateId);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const mate = mateToken(reactorToken);
                        const attacker = data.triggeringToken;
                        if (mate && attacker) await coverMe(a, reactorToken, mate, attacker);
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), setBondmate: (token) => setBondmate(api, token) };
    console.info('la-talents | Bonded registered');
}
