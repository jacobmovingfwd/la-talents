// Skirmisher talent.
//  Rank 1, Integrated Chaff Launchers: at the start of your turn you gain soft cover. You lose it if you attack
//    or force another character to make a save. Only the cover this talent granted is ever removed; soft cover
//    you already had (terrain, a manual status) is left alone.
//  Rank 2, Lockbreaker: before or after you Skirmish (including as a reaction, e.g. Overwatch), you may move
//    2 spaces. The move is free movement: it ignores engagement, costs none of your movement, and fires only
//    the involuntary-move triggers, so it does not provoke Overwatch-style reactions.
//    A Skirmish is recognised by the "// SKIRMISH //" action card that Lancer Automations posts whenever a
//    Skirmish starts (its Skirmish button, Overwatch, Semper Vigilo, Punishment). One move per Skirmish: you
//    are offered it before the first attack and, if you skipped it, after the last attack.
//  Rank 3, Weave: the first attack taken as a reaction against you in any round automatically misses. This is a
//    "hit" immunity bonus kept on the mech (synced by rank, like Vanguard), limited to attacks made off the
//    attacker's own turn, once per round per Skirmisher.
//
// Known limits: Weave covers weapon and basic attacks (the flows that run Lancer Automations' hit immunity),
// not tech attacks. A forced save is recognised by a save rolled against the Skirmisher (a HULL/AGI/SYS/ENG
// "Save (>= N)" roll whose check target is the Skirmisher).

const FLAG_CHAFF = 'skirmisherChaff';          // true while the soft cover on this mech came from Chaff Launchers
const FLAG_SKIRMISH = 'skirmisherSkirmish';    // { msgId, left, offeredBefore, moved } for the current Skirmish card
const FLAG_WEAVE = 'skirmisherWeaveRound';     // combat round in which Weave last absorbed an attack
const COVER = 'cover_soft';
const WEAVE_ID = 'skirmisher-weave';
const SKIRMISH_MS = 300000;

export function skirmisherRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('skirmisher'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-bolt"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

// ---------------------------------------------------------------- Rank 1: Integrated Chaff Launchers

async function gainChaff(a, token) {
    const actor = token.actor;
    const hasCover = !!a.findEffectOnToken(token, e => e.statuses?.has(COVER));
    if (hasCover) return; // still up from last time, or granted by something else
    await a.applyEffectsToTokens({
        tokens: [token],
        effectNames: [COVER],
        note: 'Integrated Chaff Launchers',
        duration: { label: 'indefinite' },
        notify: false
    });
    await a.addActorFlags(actor, { [FLAG_CHAFF]: true });
    await card(actor, 'INTEGRATED CHAFF LAUNCHERS', `<b>${token.name}</b> gains <b>soft cover</b>. It is lost if they attack or force another character to make a save.`);
}

async function loseChaff(a, token, why) {
    const actor = token.actor;
    if (!a.getActorFlags(actor, FLAG_CHAFF)) return;
    await a.removeActorFlags(actor, { [FLAG_CHAFF]: true });
    try {
        await a.removeEffectsByNameFromTokens({ tokens: [token], effectNames: [COVER], notify: false });
    } catch (err) {
        console.warn('la-talents | Chaff Launchers cover removal failed', err);
    }
    await card(actor, 'INTEGRATED CHAFF LAUNCHERS', `${why} <b>${token.name}</b> loses soft cover.`);
}

// ---------------------------------------------------------------- Rank 2: Lockbreaker

// The newest "// SKIRMISH //" card this actor posted within the last few minutes.
function latestSkirmishCard(actor) {
    const msgs = game.messages.contents;
    const now = Date.now();
    for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 60; i--) {
        const m = msgs[i];
        if (now - m.timestamp > SKIRMISH_MS) break;
        if (!String(m.content).includes('// SKIRMISH //')) continue;
        if (ChatMessage.getSpeakerActor(m.speaker)?.uuid === actor.uuid) return m;
    }
    return null;
}

function skirmishState(a, actor, msg) {
    const saved = a.getActorFlags(actor, FLAG_SKIRMISH);
    if (saved && saved.msgId === msg.id) return saved;
    const weapons = (String(msg.content).match(/width="24"/g) ?? []).length || 1;
    return { msgId: msg.id, left: weapons, offeredBefore: false, moved: false };
}

async function lockbreakerMove(a, token, when) {
    const { confirmed } = await a.askCard({
        title: 'LOCKBREAKER',
        description: `Move up to <b>2 spaces</b> ${when} this Skirmish? The move ignores engagement and doesn't provoke reactions.`,
        yesText: 'Move',
        noText: 'Skip',
        owner: token,
        originToken: token
    });
    if (!confirmed) return false;
    const moved = await a.moveToken(token, {
        free: true,
        range: 2,
        title: 'LOCKBREAKER',
        description: 'Move up to 2 spaces. Ignores engagement and does not provoke reactions.'
    });
    if (!moved) return false;
    await card(token.actor, 'LOCKBREAKER', `<b>${token.name}</b> moves ${when} their Skirmish.`);
    return true;
}

async function lockbreakerBefore(a, token) {
    const msg = latestSkirmishCard(token.actor);
    if (!msg) return;
    const st = skirmishState(a, token.actor, msg);
    if (st.offeredBefore || st.moved) return;
    st.offeredBefore = true;
    await a.addActorFlags(token.actor, { [FLAG_SKIRMISH]: st });
    if (await lockbreakerMove(a, token, 'before')) {
        st.moved = true;
        await a.addActorFlags(token.actor, { [FLAG_SKIRMISH]: st });
    }
}

// An attack of this Skirmish has finished. After the last one, offer the move if it was not taken yet.
async function lockbreakerAfterAttack(a, token) {
    const msg = latestSkirmishCard(token.actor);
    if (!msg) return;
    const st = skirmishState(a, token.actor, msg);
    st.left -= 1;
    if (st.left > 0) {
        await a.addActorFlags(token.actor, { [FLAG_SKIRMISH]: st });
        return;
    }
    if (!st.moved && await lockbreakerMove(a, token, 'after')) st.moved = true;
    st.left = 0;
    await a.addActorFlags(token.actor, { [FLAG_SKIRMISH]: st });
}

// ---------------------------------------------------------------- Rank 3: Weave

// Self-contained on purpose: the functions below are serialized by lancer-automations.
// A "hit" immunity: attacks that would hit the Skirmisher miss instead. It only applies to an attack made
// off the attacker's own turn (a reaction), and only until Weave has absorbed one this round.
const WEAVE_BONUS = {
    id: WEAVE_ID,
    name: 'Skirmisher (Weave)',
    type: 'immunity',
    subtype: 'hit',
    condition: (state, actor, data, context) => {
        const combat = game.combat;
        if (!combat?.started) return false;
        const attacker = state?.actor;
        if (!attacker) return false;
        const attackerTokenId = attacker.token?.id ?? attacker.getActiveTokens?.()?.[0]?.id;
        if (!attackerTokenId || combat.combatant?.tokenId === attackerTokenId) return false;
        const owner = context?.ownerTokenId ? canvas.tokens.get(context.ownerTokenId) : null;
        const api = game.modules.get('lancer-automations')?.api;
        return !!owner?.actor && api?.getActorFlags(owner.actor, 'skirmisherWeaveRound') !== combat.round;
    }
};

export async function syncSkirmisherMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === WEAVE_ID);
    const should = skirmisherRank(mech) >= 3;
    if (should && !has) await api.addConstantBonus(mech, WEAVE_BONUS);
    else if (!should && has) await api.removeConstantBonus(mech, WEAVE_ID);
}

export function registerSkirmisher(api) {
    api.registerDefaultGeneralReactions({
        'Skirmisher - Chaff Launchers': {
            category: 'General',
            reactions: [
                {
                    comments: 'Skirmisher: gain soft cover at the start of your turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: false,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const skirmisherRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('skirmisher')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return skirmisherRank(reactorToken.actor) >= 1;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await gainChaff(a, reactorToken);
                    }
                },
                {
                    comments: 'Skirmisher: attacking drops the chaff cover',
                    triggers: ['onAttack', 'onTechAttack'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'skirmisherChaff');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await loseChaff(a, reactorToken, 'Attacking disperses the chaff.');
                    }
                },
                {
                    comments: 'Skirmisher: forcing another character to make a save drops the chaff cover',
                    triggers: ['onCheck'],
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (!data.checkAgainstToken || data.checkAgainstToken.id !== reactorToken.id) return false;
                        if (data.triggeringToken?.id === reactorToken.id) return false;
                        if (!/save/i.test(String(data.statName ?? ''))) return false;
                        return !!a.getActorFlags(reactorToken.actor, 'skirmisherChaff');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await loseChaff(a, reactorToken, `Forcing <b>${data.triggeringToken?.name ?? 'another character'}</b> to make a save disperses the chaff.`);
                    }
                }
            ]
        },

        'Skirmisher - Lockbreaker': {
            category: 'General',
            reactions: [
                {
                    comments: 'Lockbreaker: offer the 2-space move before the first attack of a Skirmish',
                    triggers: ['onInitAttack'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const skirmisherRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('skirmisher')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (skirmisherRank(reactorToken.actor) < 2) return false;
                        const msgs = game.messages.contents;
                        const now = Date.now();
                        for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 60; i--) {
                            const m = msgs[i];
                            if (now - m.timestamp > 300000) return false;
                            if (String(m.content).includes('// SKIRMISH //') && ChatMessage.getSpeakerActor(m.speaker)?.uuid === reactorToken.actor.uuid) return true;
                        }
                        return false;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await lockbreakerBefore(a, reactorToken);
                    }
                },
                {
                    comments: 'Lockbreaker: offer the 2-space move after the last attack of a Skirmish',
                    triggers: ['onAttack'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const skirmisherRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('skirmisher')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (skirmisherRank(reactorToken.actor) < 2) return false;
                        const msgs = game.messages.contents;
                        const now = Date.now();
                        for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 60; i--) {
                            const m = msgs[i];
                            if (now - m.timestamp > 300000) return false;
                            if (String(m.content).includes('// SKIRMISH //') && ChatMessage.getSpeakerActor(m.speaker)?.uuid === reactorToken.actor.uuid) return true;
                        }
                        return false;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        // After the attack's flow, so the move never interrupts the roll.
                        if (!a.afterFlow(data, () => lockbreakerAfterAttack(a, reactorToken))) {
                            await lockbreakerAfterAttack(a, reactorToken);
                        }
                    }
                }
            ]
        },

        'Skirmisher - Weave': {
            category: 'General',
            reactions: [
                {
                    comments: 'Weave: the attack the immunity just turned into a miss uses up this round\'s Weave',
                    triggers: ['onHit', 'onMiss'],
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: false,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const skirmisherRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('skirmisher')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (skirmisherRank(reactorToken.actor) < 3) return false;
                        const combat = game.combat;
                        if (!combat?.started) return false;
                        if (!data.targets?.some(t => t?.target?.id === reactorToken.id)) return false;
                        const attacker = data.triggeringToken;
                        if (!attacker || combat.combatant?.tokenId === attacker.id) return false; // own turn: not a reaction
                        return a.getActorFlags(reactorToken.actor, 'skirmisherWeaveRound') !== combat.round;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.addActorFlags(reactorToken.actor, { [FLAG_WEAVE]: game.combat.round });
                        await card(reactorToken.actor, 'WEAVE',
                            `<b>${data.triggeringToken?.name ?? 'The attacker'}</b>'s reaction attack automatically misses <b>${reactorToken.name}</b>. Weave is spent until next round.`);
                    }
                }
            ]
        }
    });

    console.info('la-talents | Skirmisher registered');
}
