// Duelist talent, ranks 1-3.
//  Rank 1, Partisan: +1 Accuracy on the first attack you make with a Main Melee weapon on your turn.
//    A constant bonus on the mech (synced by rank, like Vanguard) with a once-per-turn gate.
//  Rank 2, Blademaster: 1/round, when you hit with a Main Melee weapon you gain 1 Blademaster Die (d6), max 3, which
//    lasts until spent or the scene changes. The count lives in an actor flag with the scene id.
//    Spent 1-for-1:
//      Parry   (reaction, a melee attack hits you): offered automatically; Resistance to all damage, heat and burn
//              from that attack.
//      Deflect (reaction, a ranged attack hits you): offered automatically; pick how many dice to roll, they are all
//              spent, and any 5+ gives the same Resistance.
//      Feint   (free action) and Trip (quick action): a macro menu,
//              game.modules.get('la-talents').api.blademaster()          (uses the selected token)
//    Parry/Deflect grant the Resist All status for the duration of that attack and remove it when the attack's flow
//    ends. "Melee" for this purpose = a weapon of type Melee (or an attack Lancer Automations reports as Melee);
//    everything else counts as ranged.
//    Feint grants Immunity: Provoke against that one character, so engagement is ignored and your movement
//    doesn't provoke their reactions, until the start of your next turn.
//    Trip: spends the die and a quick action, rolls their Agility save and knocks them Prone on a failure. Passing
//    through their space this turn is not enforced: move through it yourself.
//  Rank 3, Unstoppable: 1/round, when you hit with a melee attack on your turn, you may spend a Blademaster Die to
//    Grapple or Ram the target as a free action once the attack resolves (runs the core Grapple / Ram action).

const PARTISAN_ID = 'duelist-partisan';
const FLAG_DICE = 'blademasterDice';
const FEINT_PREFIX = 'blademaster-feint-';

export function duelistRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('duelist'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

// Self-contained on purpose: the functions below are serialized by lancer-automations.
const PARTISAN = {
    id: PARTISAN_ID,
    name: 'Duelist (Partisan)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    frequency: 'turn',
    condition: (state) => {
        const w = state?.item;
        if (!w || w.type !== 'mech_weapon') return false;
        if (String(w.system?.size ?? '').toLowerCase() !== 'main') return false;
        if (String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE') return false;
        const combat = game.combat;
        if (!combat?.started) return false;
        const who = state.actor;
        const tokenId = who?.token?.id ?? who?.getActiveTokens?.()?.[0]?.id;
        return !!tokenId && combat.combatant?.tokenId === tokenId;
    }
};

export async function syncDuelistMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === PARTISAN_ID);
    const should = duelistRank(mech) >= 1;
    if (should && !has) await api.addConstantBonus(mech, PARTISAN);
    else if (!should && has) await api.removeConstantBonus(mech, PARTISAN_ID);
}

// ---------------------------------------------------------------- helpers

const tokenOf = (t) => t?.actor ? t : (t?.getActiveTokens?.()[0] ?? canvas.tokens.controlled[0]);

const meleeType = (w) => String(w?.system?.active_profile?.type ?? w?.system?.type ?? '').toUpperCase() === 'MELEE';
const mainMelee = (w) => !!w && w.type === 'mech_weapon' && String(w.system?.size ?? '').toLowerCase() === 'main' && meleeType(w);

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-user-ninja"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

export function getDice(a, actor) {
    const f = a.getActorFlags(actor, FLAG_DICE);
    if (!f || typeof f !== 'object') return 0;
    if (f.sceneId !== canvas.scene?.id) return 0;
    return Math.max(0, Math.min(3, Number(f.count) || 0));
}

async function setDice(a, actor, count) {
    await a.addActorFlags(actor, { [FLAG_DICE]: { count: Math.max(0, Math.min(3, count)), sceneId: canvas.scene?.id ?? null } });
}

async function spendDice(a, actor, n) {
    const have = getDice(a, actor);
    if (have < n) return false;
    await setDice(a, actor, have - n);
    return true;
}

async function giveResistance(a, defender, data, source) {
    await a.applyEffectsToTokens({ tokens: [defender], effectNames: ['resistance_all'], note: source, duration: { label: 'indefinite' } });
    const drop = () => a.removeEffectsByNameFromTokens({ tokens: [defender], effectNames: ['resistance_all'], notify: false });
    if (!a.afterFlow(data, drop)) setTimeout(drop, 15000);
}

// ---------------------------------------------------------------- Rank 2: gaining dice

async function gainDie(a, token) {
    if (!(await a.consumeOncePerRound(token, 'blademaster_gain'))) return;
    const have = getDice(a, token.actor);
    if (have >= 3) {
        await card(token.actor, 'BLADEMASTER', `<b>${token.name}</b> hits, but already holds the maximum <b>3</b> Blademaster Dice.`);
        return;
    }
    await setDice(a, token.actor, have + 1);
    await card(token.actor, 'BLADEMASTER', `<b>${token.name}</b> gains a Blademaster Die: <b>${have + 1}/3</b>.`);
}

// ---------------------------------------------------------------- Rank 2: Parry and Deflect

async function parryOrDeflect(a, defender, data) {
    const actor = defender.actor;
    const dice = getDice(a, actor);
    if (dice < 1) return;
    const attacker = data.triggeringToken;
    const melee = String(data.attackType ?? '').toLowerCase() === 'melee' || meleeType(data.weapon);

    if (melee) {
        const { confirmed } = await a.askCard({
            title: 'PARRY',
            description: `<b>${attacker?.name ?? 'An attacker'}</b> hit <b>${defender.name}</b> with a melee attack. Spend a Blademaster Die (${dice} left) to gain <b>Resistance to all damage, heat and burn</b> from it?`,
            yesText: 'Parry',
            noText: 'Take it',
            owner: defender,
            originToken: defender
        });
        if (!confirmed) return;
        await a.setReaction(defender, false);
        await spendDice(a, actor, 1);
        await giveResistance(a, defender, data, 'Parry');
        await card(actor, 'PARRY', `<b>${defender.name}</b> parries: Resistance to all damage, heat and burn from this attack. Dice left: <b>${dice - 1}</b>.`);
        return;
    }

    const choices = [];
    for (let n = 1; n <= dice; n++) {
        choices.push({
            text: `Roll ${n} ${n === 1 ? 'die' : 'dice'}`,
            icon: 'fas fa-dice-d6',
            callback: async () => {
                await a.setReaction(defender, false);
                await spendDice(a, actor, n);
                const roll = await new Roll(`${n}d6`).evaluate();
                await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: 'Deflect' });
                const ok = roll.dice[0].results.some(r => r.result >= 5);
                if (ok) await giveResistance(a, defender, data, 'Deflect');
                await card(actor, 'DEFLECT', ok
                    ? `<b>${defender.name}</b> deflects: a 5+ gives Resistance to all damage, heat and burn from this attack. Dice left: <b>${dice - n}</b>.`
                    : `<b>${defender.name}</b> fails to deflect. Dice left: <b>${dice - n}</b>.`);
            }
        });
    }
    choices.push({ text: 'Decline', icon: 'fas fa-xmark', callback: async () => {} });
    await a.startChoiceCard({
        title: 'DEFLECT',
        icon: 'fas fa-user-ninja',
        description: `<b>${attacker?.name ?? 'An attacker'}</b> hit <b>${defender.name}</b> with a ranged attack. Roll any number of your <b>${dice}</b> Blademaster ${dice === 1 ? 'Die' : 'Dice'}, spending them: a 5+ on any gives <b>Resistance</b> to all damage, heat and burn from it.`,
        originToken: defender,
        userIdControl: game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, 'OWNER'))?.id ?? game.users.activeGM?.id,
        choices
    });
}

// ---------------------------------------------------------------- Rank 2: Feint and Trip (macro menu)

const adjacentTo = (a, token) => canvas.tokens.placeables.filter(t => t.id !== token.id && t.actor
    && !t.document.hidden && a.getTokenDistance(token, t) <= 1);

async function feint(a, token) {
    if (getDice(a, token.actor) < 1) return ui.notifications.warn('Feint: no Blademaster Dice left.');
    const picked = await a.chooseToken(token, {
        range: 1, count: 1, includeSelf: false, selection: adjacentTo(a, token),
        title: 'FEINT', description: 'Choose an adjacent character to feint.'
    });
    const foe = picked?.[0];
    if (!foe) return;
    if (!(await spendDice(a, token.actor, 1))) return;
    const id = FEINT_PREFIX + foe.id;
    await a.removeGlobalBonus(token.actor, (b) => b?.id === id);
    await a.addGlobalBonus(token.actor, {
        id,
        name: `Feint: ${foe.name}`,
        type: 'immunity',
        subtype: 'provoke',
        applyToCondition: `@@fn:(target) => target?.id === '${foe.id}'`
    }, { duration: 'indefinite', origin: token });
    await card(token.actor, 'FEINT',
        `<b>${token.name}</b> feints <b>${foe.name}</b>: ignores their engagement and doesn't provoke their reactions until the start of ${token.name}'s next turn. Dice left: <b>${getDice(a, token.actor)}</b>.`);
}

async function trip(a, token) {
    if (getDice(a, token.actor) < 1) return ui.notifications.warn('Trip: no Blademaster Dice left.');
    const picked = await a.chooseToken(token, {
        range: 1, count: 1, includeSelf: false, selection: adjacentTo(a, token),
        title: 'TRIP', description: 'Choose an adjacent character to trip.'
    });
    const foe = picked?.[0];
    if (!foe) return;
    if (!(await spendDice(a, token.actor, 1))) return;
    await a.consumeAction(token, 'quick');
    const { results } = await a.executeForceCheck('AGILITY', [foe], { saveVs: token });
    const failed = (results ?? []).some(r => r.completed && !r.passed);
    if (failed) await a.applyEffectsToTokens({ tokens: [foe], effectNames: ['prone'], note: 'Trip' });
    await card(token.actor, 'TRIP', failed
        ? `<b>${foe.name}</b> fails the Agility save and is knocked <b>Prone</b>. ${token.name} may pass through their space this turn but can't end there.`
        : `<b>${foe.name}</b> passes the Agility save. ${token.name} may still pass through their space this turn only if it is open.`);
}

export async function blademaster(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Blademaster: select the Duelist token first.');
    if (duelistRank(token.actor) < 2) return ui.notifications.warn(`Blademaster: ${token.name}'s pilot does not have Duelist rank 2.`);
    const dice = getDice(a, token.actor);
    await a.startChoiceCard({
        title: 'BLADEMASTER',
        icon: 'fas fa-user-ninja',
        description: `<b>${token.name}</b> holds <b>${dice}/3</b> Blademaster ${dice === 1 ? 'Die' : 'Dice'}.`,
        originToken: token,
        choices: [
            { text: 'Feint (free action)', icon: 'fas fa-people-arrows', disabled: dice < 1, disabledReason: 'No dice', callback: () => feint(a, token) },
            { text: 'Trip (quick action)', icon: 'fas fa-person-falling', disabled: dice < 1, disabledReason: 'No dice', callback: () => trip(a, token) },
            { text: 'Close', icon: 'fas fa-xmark', callback: async () => {} }
        ]
    });
}

// ---------------------------------------------------------------- Rank 3: Unstoppable

async function unstoppable(a, token, target) {
    const dice = getDice(a, token.actor);
    if (dice < 1) return;
    const pick = (name) => async () => {
        if (!(await a.consumeOncePerRound(token, 'blademaster_unstoppable'))) return;
        if (!(await spendDice(a, token.actor, 1))) return;
        target?.setTarget?.(true, { releaseOthers: true, groupSelection: false });
        await a.executeSimpleActivation(token.actor, {
            title: name,
            action: { name, activation: 'Free' },
            detail: `Unstoppable: ${name} ${target?.name ?? 'the target'} as a free action.`
        });
    };
    await a.startChoiceCard({
        title: 'UNSTOPPABLE',
        icon: 'fas fa-user-ninja',
        description: `<b>${token.name}</b> hit <b>${target?.name ?? 'the target'}</b>. Spend a Blademaster Die (${dice} left) to Grapple or Ram them as a free action?`,
        originToken: token,
        userIdControl: game.users.find(u => u.active && !u.isGM && token.actor.testUserPermission(u, 'OWNER'))?.id ?? game.users.activeGM?.id,
        choices: [
            { text: 'Grapple', icon: 'fas fa-hand-fist', callback: pick('Grapple') },
            { text: 'Ram', icon: 'fas fa-truck-ramp-box', callback: pick('Ram') },
            { text: 'No thanks', icon: 'fas fa-xmark', callback: async () => {} }
        ]
    });
}

// ---------------------------------------------------------------- registration

export function registerDuelist(api) {
    api.registerDefaultGeneralReactions({
        'Duelist - Blademaster': {
            category: 'General',
            reactions: [
                {
                    comments: 'Duelist rank 2: gain a Blademaster Die on a Main Melee hit; rank 3: offer Unstoppable on any melee hit',
                    triggers: ['onHit'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('duelist'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const w = data.weapon;
                        if (!w || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE') return false;
                        return true;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const w = data.weapon;
                        const rank = duelistRank(reactorToken.actor);
                        if (mainMelee(w)) await gainDie(a, reactorToken);
                        if (rank >= 3 && game.combat?.started && game.combat.combatant?.tokenId === reactorToken.id
                            && a.checkGate(reactorToken, 'blademaster_unstoppable')) {
                            const target = (data.targets ?? []).find(x => x?.target)?.target;
                            const run = () => unstoppable(a, reactorToken, target);
                            if (!a.afterFlow(data, run)) await run();
                        }
                    }
                },
                {
                    comments: 'Duelist rank 2: Parry (melee) and Deflect (ranged) when you are hit',
                    triggers: ['onPreDamage'],
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    isReaction: true,
                    checkReaction: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('duelist'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        if (!(data.targets ?? []).some(x => x?.id === reactorToken.id)) return false;
                        const f = a.getActorFlags(reactorToken.actor, 'blademasterDice');
                        return !!f && typeof f === 'object' && f.sceneId === canvas.scene?.id && (Number(f.count) || 0) > 0;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await parryOrDeflect(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Duelist rank 2: Feint ends at the start of your next turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return a.getGlobalBonuses(reactorToken.actor).some(b => String(b?.id ?? '').startsWith('blademaster-feint-'));
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeGlobalBonus(reactorToken.actor, (b) => String(b?.id ?? '').startsWith(FEINT_PREFIX));
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), blademaster: (token) => blademaster(api, token) };

    console.info('la-talents | Duelist registered');
}
