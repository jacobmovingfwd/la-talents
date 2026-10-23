// Exemplar talent.
//
// Rank 1, Honorable Challenge: the first time on your turn that you attack a hostile character within
//   Range 3, hit or miss, you may give them the Exemplar's Mark as a free action. A character can only
//   carry one Exemplar's Mark, a new mark from anyone replaces the old one. It lasts until the start of your
//   next turn.
//   Valiant Aid, the reaction you gain while the mark is active: 1/round, when an ally attacks your mark and
//   misses, they may reroll the attack and must use the second result.
// Rank 2, Punishment: 1/round, when the character with your Mark attacks a character within Range 3 of
//   you, other than you, they trigger your Overwatch.
// Rank 3, To the Death: when you mark a character you may challenge them to a duel to the death. You and
//   they get +3 Difficulty on attacks against anyone other than each other until the end of the scene or
//   one of your mechs is destroyed. If they make an attack roll against you, their +3 stops until the start
//   of your next turn. While it is active your mark stays, you can't mark anyone new, and you get a
//   warning (which you can overrule) when you try to move away from them.
//   "End of the scene" is approximated as the end of combat.

const MARK_NAME = "Exemplar's Mark";
const MARK_FLAG = 'exemplarSourceId';
const GATE_MARK = 'exemplar_honorable_challenge';
const GATE_PUNISH = 'exemplar_punishment';

const DUEL_FLAG = 'exemplarDuel';                 // id of the dueled token, on the Exemplar's actor
const DUEL_SUSPENDED_FLAG = 'exemplarDuelSuspended'; // their +3 is paused until the Exemplar's next turn
const DUEL_BONUS_SELF = 'exemplar-duel-self';
const DUEL_BONUS_FOE = 'exemplar-duel-foe';

function exemplarRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('exemplar'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

// +3 Difficulty on attacks against anyone but `otherId`. lancer-automations only runs a string gate when
// it starts with "@@fn:", so the id is written into the function text and nothing else is captured.
function duelBonus(id, name, otherId) {
    return {
        id,
        name,
        type: 'difficulty',
        val: 3,
        rollTypes: ['attack', 'tech_attack'],
        applyToCondition: `@@fn:(target) => target?.id !== '${otherId}'`
    };
}

async function startDuel(a, exemplar, foe) {
    await a.addActorFlags(exemplar.actor, { [DUEL_FLAG]: foe.id });
    await a.removeActorFlags(exemplar.actor, { [DUEL_SUSPENDED_FLAG]: true });
    const options = { duration: 'indefinite' };
    await a.removeGlobalBonus(exemplar.actor, (b) => b.id === DUEL_BONUS_SELF);
    await a.removeGlobalBonus(foe.actor, (b) => b.id === DUEL_BONUS_FOE);
    await a.addGlobalBonus(exemplar.actor, duelBonus(DUEL_BONUS_SELF, 'To the Death (+3 Difficulty)', foe.id), options);
    await a.addGlobalBonus(foe.actor, duelBonus(DUEL_BONUS_FOE, 'To the Death (+3 Difficulty)', exemplar.id), options);
    // The mark now lasts until the duel ends.
    await a.removeEffectsByNameFromTokens({ tokens: [foe], effectNames: "Exemplar's Mark" });
    await a.applyMark(exemplar, [foe], {
        effect: { name: "Exemplar's Mark", icon: 'icons/svg/target.svg', isCustom: true },
        flagKey: 'exemplarSourceId',
        note: `Marked by ${exemplar.name}, to the death`,
        duration: { label: 'indefinite' }
    });
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: exemplar.actor }),
        content: `<b>${exemplar.name}</b> challenges <b>${foe.name}</b> to the death. Both get +3 Difficulty on attacks against anyone else.`
    });
}

async function endDuel(a, exemplar, reason) {
    const foeId = a.getActorFlags(exemplar.actor, DUEL_FLAG);
    if (!foeId) return;
    const foe = canvas.tokens.get(foeId);
    await a.removeActorFlags(exemplar.actor, { [DUEL_FLAG]: true, [DUEL_SUSPENDED_FLAG]: true });
    await a.removeGlobalBonus(exemplar.actor, (b) => b.id === DUEL_BONUS_SELF);
    if (foe?.actor) {
        await a.removeGlobalBonus(foe.actor, (b) => b.id === DUEL_BONUS_FOE);
        await a.removeEffectsByNameFromTokens({ tokens: [foe], effectNames: "Exemplar's Mark" });
    }
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: exemplar.actor }),
        content: `<b>${exemplar.name}</b>'s duel with <b>${foe?.name ?? 'their foe'}</b> is over (${reason}).`
    });
}

export function registerExemplar(api) {
    api.registerDefaultGeneralReactions({
        // Rank 1: offer the mark when you attack a hostile within Range 3.
        'Exemplar - Honorable Challenge': {
            category: 'General',
            reactions: [{
                comments: "Exemplar rank 1: offer the Exemplar's Mark",
                triggers: ['onAttack'],
                triggerSelf: true,
                triggerOther: false,
                outOfCombat: true,
                autoActivate: true,
                activationType: 'code',
                activationMode: 'instead', // run our code only, no reaction card in chat
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    const actor = reactorToken.actor;
                    if (actor?.type !== 'mech') return false;
                    const talent = actor.system?.pilot?.value?.items?.find(i => i.type === 'talent'
                        && String(i.system?.lid ?? '').toLowerCase().includes('exemplar'));
                    if (!talent) return false;
                    if (!a.checkGate(reactorToken, 'exemplar_honorable_challenge')) return false;
                    // To the Death: no new marks while the duel lasts.
                    if (a.getActorFlags(actor, 'exemplarDuel')) return false;
                    return (data.targets ?? []).some(t => t.id !== reactorToken.id && t.actor
                        && !a.isFriendly(reactorToken, t) && a.getTokenDistance(reactorToken, t) <= 3);
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const candidates = (data.targets ?? []).filter(t => t.id !== reactorToken.id && t.actor
                        && !a.isFriendly(reactorToken, t) && a.getTokenDistance(reactorToken, t) <= 3);
                    if (!candidates.length) return;
                    // This is the first qualifying attack this turn, so the opportunity is used up either way.
                    if (!(await a.consumeOncePerTurn(reactorToken, 'exemplar_honorable_challenge'))) return;

                    let target = candidates[0];
                    if (candidates.length > 1) {
                        const picked = await a.chooseToken(reactorToken, {
                            title: "EXEMPLAR'S MARK: CHOOSE TARGET",
                            selection: candidates,
                            includeSelf: false,
                            count: 1
                        });
                        target = picked?.[0];
                        if (!target) return;
                    }

                    const { confirmed } = await a.askCard({
                        title: 'HONORABLE CHALLENGE',
                        description: `Give <b>${target.name}</b> the Exemplar's Mark? (free action) It lasts until the start of your next turn and replaces any mark they already have.`,
                        yesText: 'Mark',
                        noText: 'Skip',
                        owner: reactorToken,
                        originToken: reactorToken,
                        relatedToken: target
                    });
                    if (!confirmed) return;

                    // One mark per character: a new mark from anyone replaces the old one.
                    await a.removeEffectsByNameFromTokens({ tokens: [target], effectNames: "Exemplar's Mark" });
                    await a.applyMark(reactorToken, [target], {
                        effect: { name: "Exemplar's Mark", icon: 'icons/svg/target.svg', isCustom: true },
                        flagKey: 'exemplarSourceId',
                        note: `Marked by ${reactorToken.name}`,
                        duration: { label: 'start', turns: 1, overrideTurnOriginId: reactorToken.id }
                    });

                    // Rank 3, To the Death: offer the duel as a free action.
                    if (exemplarRank(reactorToken.actor) >= 3) {
                        const duel = await a.askCard({
                            title: 'TO THE DEATH',
                            description: `Challenge <b>${target.name}</b> to a duel to the death? You both get +3 Difficulty on attacks against anyone else, your mark lasts until the scene ends or one of your mechs is destroyed, and you can't mark anyone new.`,
                            yesText: 'Challenge',
                            noText: 'Not now',
                            owner: reactorToken,
                            originToken: reactorToken,
                            relatedToken: target
                        });
                        if (duel.confirmed) await startDuel(a, reactorToken, target);
                    }
                }
            }]
        },

        // To the Death upkeep: end it, pause their +3, resume it, warn about moving away.
        'Exemplar - To the Death': {
            category: 'General',
            reactions: [
                {
                    comments: 'To the Death: ends when combat ends or either mech is destroyed',
                    triggers: ['onExitCombat', 'onDestroyed'],
                    triggerSelf: true,
                    triggerOther: true,
                    outOfCombat: true,
                    autoActivate: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const foeId = a.getActorFlags(reactorToken.actor, 'exemplarDuel');
                        if (!foeId) return false;
                        if (triggerType === 'onExitCombat') return data.triggeringToken?.id === reactorToken.id;
                        const dead = data.triggeringToken?.id;
                        return dead === reactorToken.id || dead === foeId;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await endDuel(a, reactorToken, triggerType === 'onExitCombat' ? 'combat ended' : 'a mech was destroyed');
                    }
                },
                {
                    comments: 'To the Death: they attack you, so their +3 Difficulty stops until your next turn',
                    triggers: ['onAttack'],
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: true,
                    autoActivate: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const foeId = a.getActorFlags(reactorToken.actor, 'exemplarDuel');
                        if (!foeId || data.triggeringToken?.id !== foeId) return false;
                        if (a.getActorFlags(reactorToken.actor, 'exemplarDuelSuspended')) return false;
                        return (data.targets ?? []).some(t => t.id === reactorToken.id);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const foe = data.triggeringToken;
                        await a.addActorFlags(reactorToken.actor, { exemplarDuelSuspended: true });
                        await a.removeGlobalBonus(foe.actor, (b) => b.id === 'exemplar-duel-foe');
                        await ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: reactorToken.actor }),
                            content: `<b>${foe.name}</b> attacked <b>${reactorToken.name}</b>: their To the Death +3 Difficulty stops until the start of ${reactorToken.name}'s next turn.`
                        });
                    }
                },
                {
                    comments: 'To the Death: their +3 Difficulty comes back at the start of your turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !!a.getActorFlags(reactorToken.actor, 'exemplarDuel')
                            && !!a.getActorFlags(reactorToken.actor, 'exemplarDuelSuspended');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const foe = canvas.tokens.get(a.getActorFlags(reactorToken.actor, 'exemplarDuel'));
                        await a.removeActorFlags(reactorToken.actor, { exemplarDuelSuspended: true });
                        if (!foe?.actor) return;
                        await a.addGlobalBonus(foe.actor, duelBonus('exemplar-duel-foe', 'To the Death (+3 Difficulty)', reactorToken.id), { duration: 'indefinite' });
                    }
                },
                {
                    comments: 'To the Death: warn when you move away from your foe (you can overrule it)',
                    triggers: ['onPreMove'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        if (data.moveInfo?.isInvoluntary) return false;
                        const foe = canvas.tokens.get(a.getActorFlags(reactorToken.actor, 'exemplarDuel'));
                        if (!foe || !data.endPos) return false;
                        // Edge-to-edge distance to the foe, now and at the end of this move.
                        const unit = canvas.scene.grid.distance || 1;
                        const size = canvas.grid.size;
                        const reach = (t) => Math.max(0, (Math.max(t.document.width, t.document.height) - 1) / 2);
                        const edge = (from) => Math.round(canvas.grid.measurePath([from, foe.center]).distance / unit - reach(reactorToken) - reach(foe));
                        const endCenter = {
                            x: data.endPos.x + reactorToken.document.width * size / 2,
                            y: data.endPos.y + reactorToken.document.height * size / 2
                        };
                        return edge(endCenter) > edge(reactorToken.center);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const foe = canvas.tokens.get(a.getActorFlags(reactorToken.actor, 'exemplarDuel'));
                        data.cancelTriggeredMove?.(
                            `<b>${reactorToken.name}</b> is in a duel to the death with <b>${foe?.name ?? 'their foe'}</b> and can't voluntarily move away from them.`,
                            true,
                            a.getTokenOwnerUserId(reactorToken),
                            null,
                            null,
                            { originToken: reactorToken, relatedToken: foe }
                        );
                    }
                }
            ]
        },

        // Valiant Aid (rank 1): an ally misses your marked character, they may reroll.
        'Exemplar - Valiant Aid': {
            category: 'General',
            reactions: [{
                comments: "Exemplar rank 1: Valiant Aid, reroll an ally's miss against your mark",
                triggers: ['onRoll'],
                triggerDescription: "An ally attacks the character with your Exemplar's Mark and misses",
                effectDescription: 'Your ally may reroll the attack. They must use the second result, even if it is worse.',
                triggerSelf: false,
                triggerOther: true,
                outOfCombat: false,
                actionType: 'Reaction',
                frequency: '1/round',
                isReaction: true,
                checkReaction: true,
                autoActivate: true,
                awaitActivationCompletion: true,
                activationType: 'code',
                activationMode: 'instead',
                evaluate: function (triggerType, data, reactorToken, item, name, a) {
                    if (data.rollType !== 'attackRoll') return false;
                    const ally = data.triggeringToken;
                    if (!ally || ally.id === reactorToken.id || !a.isFriendly(reactorToken, ally)) return false;
                    if (a.getFlowFlag(data, '_valiantAidUsed')) return false;
                    if (!a.checkGate(reactorToken, 'exemplar_valiant_aid')) return false;
                    const talent = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
                        && String(i.system?.lid ?? '').toLowerCase().includes('exemplar'));
                    if (!talent) return false;
                    // Each onRoll target is { token, total, hit, crit }. It has to be a MISS against a
                    // character carrying THIS Exemplar's mark.
                    return (data.targets ?? []).some(entry => entry?.token && entry.hit === false
                        && a.findEffectsOnToken(entry.token, "Exemplar's Mark", { extraFlags: { exemplarSourceId: reactorToken.id } }).length > 0);
                },
                activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                    const ally = data.triggeringToken;
                    const { confirmed } = await a.askCard({
                        title: 'VALIANT AID',
                        description: [`Let <b>${ally?.name ?? 'your ally'}</b> reroll their missed attack against your mark? They must use the second result.`, data.rollSummary].filter(Boolean).join('<br>'),
                        yesText: 'Reroll',
                        noText: 'Skip',
                        owner: reactorToken,
                        originToken: reactorToken,
                        relatedToken: ally
                    });
                    if (!confirmed) return;
                    if (!(await a.consumeOncePerRound(reactorToken, 'exemplar_valiant_aid'))) return;
                    await data.startRelatedFlowToReactor();
                    a.setFlowFlag(data, '_valiantAidUsed');
                    // 'retry' keeps the second result, even when it is worse.
                    await data.reroll(`${reactorToken.name} gives Valiant Aid.`, 'retry');
                }
            }]
        },

        // Rank 2: the marked character attacks someone else near you, so you get an Overwatch against them.
        'Exemplar - Punishment': {
            category: 'General',
            reactions: [
                {
                    comments: 'Exemplar rank 2: offer the Overwatch',
                    triggers: ['onAttack'],
                    triggerDescription: "The character with your Exemplar's Mark attacks a character within Range 3 of you, other than you",
                    effectDescription: 'They trigger your OVERWATCH.',
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: false,
                    actionType: 'Reaction',
                    frequency: '1/round',
                    isReaction: true,
                    checkReaction: true,
                    requireCanProvoke: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const attacker = data.triggeringToken;
                        if (!attacker || attacker.id === reactorToken.id) return false;
                        const talent = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
                            && String(i.system?.lid ?? '').toLowerCase().includes('exemplar'));
                        if (!talent || (Number(talent.system?.curr_rank) || 1) < 2) return false;
                        if (!a.checkGate(reactorToken, 'exemplar_punishment')) return false;
                        // Only the character carrying THIS Exemplar's mark.
                        const marked = a.findEffectsOnToken(attacker, "Exemplar's Mark", { extraFlags: { exemplarSourceId: reactorToken.id } });
                        if (!marked.length) return false;
                        return (data.targets ?? []).some(t => t.id !== reactorToken.id
                            && a.getTokenDistance(reactorToken, t) <= 3);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const attacker = data.triggeringToken;
                        const { confirmed, responderIds } = await a.askCard({
                            title: 'PUNISHMENT',
                            description: `<b>${attacker.name}</b> (your Exemplar's Mark) is attacking near you. Trigger your Overwatch against them?`,
                            yesText: 'Fire',
                            noText: 'Let pass',
                            owner: reactorToken,
                            originToken: reactorToken,
                            relatedToken: attacker
                        });
                        if (!confirmed) return;
                        if (!(await a.consumeOncePerRound(reactorToken, 'exemplar_punishment'))) return;
                        await data.startRelatedFlowToReactor(responderIds?.[0], { moverTokenId: attacker.id });
                    }
                },
                // The Overwatch itself: a reaction Skirmish against the marked character.
                {
                    comments: 'Exemplar rank 2: the Skirmish',
                    triggers: ['onActivation'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    actionType: 'Reaction',
                    frequency: '1/round',
                    autoActivate: true,
                    onlyOnSourceMatch: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const moverId = data.extraData?.moverTokenId ?? null;
                        const attacker = moverId ? canvas.tokens.get(moverId) ?? null : null;
                        const distance = attacker ? a.getTokenDistance(reactorToken, attacker) : 0;
                        const isOrdnance = (w) => [...(w.system?.active_profile?.tags ?? []), ...(w.system?.all_base_tags ?? []), ...(w.system?.tags ?? [])]
                            .some(tag => tag.lid === 'tg_ordnance');
                        // Same weapon rule as the normal Overwatch: no Ordnance, and the target within the weapon's Threat.
                        const weaponFilter = (w) => {
                            if (isOrdnance(w)) return false;
                            if (distance <= 0) return true;
                            return (a.getMaxWeaponRanges_WithBonus(w).Threat || 1) >= distance;
                        };
                        await a.executeSkirmish(reactorToken.actor, null, attacker, weaponFilter, { noFX: true, asReaction: true });
                    }
                }
            ]
        }
    });
}
