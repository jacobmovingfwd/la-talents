// Gunslinger talent.
//  Rank 1, Opening Argument: +1 Accuracy on the first attack roll you make with an Auxiliary ranged weapon on
//    your turn. A constant bonus on the mech (synced by rank, like Vanguard) with a once-per-turn gate.
//  Rank 2, From the Hip: gain the Return Fire reaction. 1/round, when a character hits you with a ranged attack,
//    you may immediately attack them with a single Auxiliary ranged weapon if they are within its Range. The
//    offer appears right after the hit is decided; the reaction and the once-per-round gate are spent only when
//    you accept. Only loaded, undestroyed weapons with the attacker in Range are offered.
//  Rank 3, I Kill With My Heart: the Gunslinger Die, 1d6 starting at 6.
//    - Each attack that hits with an Auxiliary ranged weapon lowers the die by 1 (once per attack, not per target).
//    - At 1, your next attack with an Auxiliary ranged weapon offers to reset the die to 6. Doing so gives that
//      attack +2d6 bonus damage on hit, AP, and ignores cover. The reset happens at the start of the attack, so
//      that attack's own hit already counts toward the new die.
//    - The die is an actor flag, so it persists between scenes. A Full Repair resets it to 6.
//      Resting has no trigger in Lancer Automations: a GM macro calls la-talents.api.resetGunslingerDie(actor) (see README).
//
// "Auxiliary ranged weapon" = a mech weapon of size Auxiliary whose active profile has a Range entry.

const FLAG_DIE = 'gunslingerDie';
const OPENING_ID = 'gunslinger-opening-argument';
const SPEND_PREFIX = 'gunslinger-spend';

export function gunslingerRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('gunslinger'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

function isAuxRanged(weapon) {
    if (!weapon || weapon.type !== 'mech_weapon') return false;
    if (String(weapon.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
    return (weapon.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
}

const isSpendBonus = (b) => String(b?.id ?? '').startsWith(SPEND_PREFIX);

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-bullseye"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

export function getGunslingerDie(a, actor) {
    const v = Number(a.getActorFlags(actor, FLAG_DIE));
    return Number.isFinite(v) && v >= 1 && v <= 6 ? v : 6;
}

export async function resetGunslingerDie(a, actor, why) {
    const had = getGunslingerDie(a, actor);
    await a.addActorFlags(actor, { [FLAG_DIE]: 6 });
    await a.removeGlobalBonus(actor, isSpendBonus);
    if (had !== 6 && why) await card(actor, 'GUNSLINGER DIE', `${why} The die resets to <b>6</b>.`);
}

// ---------------------------------------------------------------- Rank 1: Opening Argument

// Self-contained on purpose: the functions below are serialized by lancer-automations.
const OPENING_ARGUMENT = {
    id: OPENING_ID,
    name: 'Gunslinger (Opening Argument)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    frequency: 'turn',
    condition: (state, actor, data, context) => {
        const w = state?.item;
        if (!w || w.type !== 'mech_weapon') return false;
        if (String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
        if (!(w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range')) return false;
        const combat = game.combat;
        if (!combat?.started) return false;
        const who = state.actor;
        const tokenId = who?.token?.id ?? who?.getActiveTokens?.()?.[0]?.id;
        return !!tokenId && combat.combatant?.tokenId === tokenId;
    }
};

export async function syncGunslingerMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === OPENING_ID);
    const should = gunslingerRank(mech) >= 1;
    if (should && !has) await api.addConstantBonus(mech, OPENING_ARGUMENT);
    else if (!should && has) await api.removeConstantBonus(mech, OPENING_ID);
}

// ---------------------------------------------------------------- Rank 3: I Kill With My Heart

async function dieHit(a, token) {
    const actor = token.actor;
    const before = getGunslingerDie(a, actor);
    if (before <= 1) return;
    const now = before - 1;
    await a.addActorFlags(actor, { [FLAG_DIE]: now });
    await card(actor, 'GUNSLINGER DIE', now === 1
        ? `<b>${token.name}</b> hits. The die falls to <b>1</b>. Your next Auxiliary ranged attack can reset it for +2d6 damage, AP, and ignoring cover.`
        : `<b>${token.name}</b> hits. The die falls to <b>${now}</b>.`);
}

async function offerSpend(a, token, weapon) {
    const actor = token.actor;
    const { confirmed } = await a.askCard({
        title: 'I KILL WITH MY HEART',
        description: `The Gunslinger Die is at <b>1</b>. Reset it to <b>6</b> to give this attack with <b>${weapon.name}</b> <b>+2d6 bonus damage</b> on hit and <b>AP</b>, and have it <b>ignore cover</b>?`,
        yesText: 'Reset die',
        noText: 'Keep',
        owner: token,
        originToken: token
    });
    if (!confirmed) return;

    await a.addActorFlags(actor, { [FLAG_DIE]: 6 });
    await a.removeGlobalBonus(actor, isSpendBonus);

    const damageType = weapon.system?.active_profile?.damage?.[0]?.type ?? 'Kinetic';
    // The bonuses wait for the next Auxiliary ranged weapon attack and the first damage roll that follows.
    // No shared groupId on purpose: the module deletes every member of a group when one is removed.
    const options = {
        duration: 'indefinite',
        origin: token,
        consumption: { trigger: 'onDamage', evaluate: 'return !!triggerData.weapon;' }
    };
    // Self-contained on purpose: lancer-automations serializes these functions.
    const condition = (st) => {
        const w = st?.item;
        if (!w || w.type !== 'mech_weapon') return false;
        if (String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
        return (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
    };
    await a.addGlobalBonus(actor, {
        id: `${SPEND_PREFIX}-damage`,
        name: 'I Kill With My Heart: +2d6 damage',
        type: 'damage',
        damage: [{ val: '2d6', type: damageType }],
        rollTypes: ['damage'],
        condition
    }, options);
    await a.addGlobalBonus(actor, {
        id: `${SPEND_PREFIX}-ap`,
        name: 'I Kill With My Heart: AP',
        type: 'target_modifier',
        subtype: 'ap',
        condition
    }, options);
    await a.addGlobalBonus(actor, {
        id: `${SPEND_PREFIX}-no-cover`,
        name: 'I Kill With My Heart: ignore cover',
        type: 'target_modifier',
        subtype: 'no_cover',
        condition
    }, options);

    await card(actor, 'I KILL WITH MY HEART',
        `<b>${token.name}</b> resets the Gunslinger Die to <b>6</b>. This attack with ${weapon.name} gets <b>+2d6 ${damageType}</b> on hit, <b>AP</b>, and <b>ignores cover</b>.`);
}

// Auxiliary ranged weapons that can Return Fire at `attacker`: loaded, not destroyed, attacker within Range.
function returnFireWeapons(a, token, attacker) {
    const dist = a.getTokenDistance(token, attacker);
    return (token.actor?.system?.loadout?.weapon_mounts ?? [])
        .flatMap(m => (m.slots ?? []).map(s => s.weapon?.value))
        .filter(w => isAuxRanged(w) && !w.system?.destroyed && w.system?.loaded !== false
            && (a.getMaxWeaponRanges_WithBonus(w).Range ?? 0) >= dist);
}

export function registerGunslinger(api) {
    api.registerDefaultGeneralReactions({
        'Gunslinger - I Kill With My Heart': {
            category: 'General',
            reactions: [
                {
                    comments: 'Gunslinger: at die 1, offer to reset it for the next Auxiliary ranged attack',
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
                        const rankOf = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('gunslinger')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (rankOf(reactorToken.actor) < 3) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
                        if (!(w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range')) return false;
                        if (Number(a.getActorFlags(reactorToken.actor, 'gunslingerDie')) !== 1) return false;
                        // Already spent for an attack that has not rolled damage yet.
                        return !a.getGlobalBonuses(reactorToken.actor).some(b => String(b?.id ?? '').startsWith('gunslinger-spend'));
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await offerSpend(a, reactorToken, data.weapon);
                    }
                },
                {
                    comments: 'Gunslinger: a hit with an Auxiliary ranged weapon lowers the die',
                    triggers: ['onHit'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const rankOf = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('gunslinger')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (rankOf(reactorToken.actor) < 3) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
                        return (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await dieHit(a, reactorToken);
                    }
                },
                {
                    comments: 'Gunslinger: a full miss with the spent attack loses the bonuses (they need a hit)',
                    triggers: ['onMiss'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
                        const hits = (data.flowState?.data?.hit_results ?? []).filter(h => h.hit).length;
                        if (hits > 0) return false;
                        return a.getGlobalBonuses(reactorToken.actor).some(b => String(b?.id ?? '').startsWith('gunslinger-spend'));
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeGlobalBonus(reactorToken.actor, isSpendBonus);
                        await card(reactorToken.actor, 'I KILL WITH MY HEART', `The attack missed. The bonus damage, AP, and cover-ignoring are lost.`);
                    }
                },
                {
                    comments: 'Gunslinger: a Full Repair resets the die',
                    triggers: ['onFullRepair'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const rankOf = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('gunslinger')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return rankOf(reactorToken.actor) >= 3;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await resetGunslingerDie(a, reactorToken.actor, 'Full Repair.');
                    }
                }
            ]
        },

        'Gunslinger - Return Fire': {
            category: 'General',
            reactions: [
                {
                    comments: 'Gunslinger rank 2 (From the Hip): offer Return Fire',
                    triggers: ['onHit'],
                    triggerDescription: 'A character hits you with a ranged attack (Gunslinger, From the Hip)',
                    effectDescription: 'Immediately attack them with a single Auxiliary ranged weapon if they are within Range.',
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
                        const attacker = data.triggeringToken;
                        if (!attacker || attacker.id === reactorToken.id) return false;
                        const talent = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
                            && String(i.system?.lid ?? '').toLowerCase().includes('gunslinger'));
                        if (!talent || (Number(talent.system?.curr_rank) || 1) < 2) return false;
                        if (!(data.hitTokens ?? []).some(t => t.id === reactorToken.id)) return false;
                        if (typeof data.isRangedAttack === 'function' && !data.isRangedAttack()) return false;
                        if (!a.checkGate(reactorToken, 'gunslinger_return_fire')) return false;
                        const dist = a.getTokenDistance(reactorToken, attacker);
                        return (reactorToken.actor?.system?.loadout?.weapon_mounts ?? [])
                            .flatMap(m => (m.slots ?? []).map(s => s.weapon?.value))
                            .some(w => w && w.type === 'mech_weapon'
                                && String(w.system?.size ?? '').toLowerCase() === 'auxiliary'
                                && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range')
                                && !w.system?.destroyed && w.system?.loaded !== false
                                && (a.getMaxWeaponRanges_WithBonus(w).Range ?? 0) >= dist);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const attacker = data.triggeringToken;
                        const { confirmed, responderIds } = await a.askCard({
                            title: 'RETURN FIRE',
                            description: `<b>${attacker.name}</b> hit you with a ranged attack. Spend your Reaction to attack them with an Auxiliary ranged weapon?`,
                            yesText: 'Return fire',
                            noText: 'Let pass',
                            owner: reactorToken,
                            originToken: reactorToken,
                            relatedToken: attacker
                        });
                        if (!confirmed) return;
                        if (!(await a.consumeOncePerRound(reactorToken, 'gunslinger_return_fire'))) return;
                        await data.startRelatedFlowToReactor(responderIds?.[0], { attackerTokenId: attacker.id });
                    }
                },
                // The attack itself: one Auxiliary ranged weapon against the attacker.
                {
                    comments: 'Gunslinger rank 2 (From the Hip): the attack',
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
                        const attackerId = data.extraData?.attackerTokenId ?? null;
                        const attacker = attackerId ? canvas.tokens.get(attackerId) ?? null : null;
                        if (!attacker) return;
                        const weapons = returnFireWeapons(a, reactorToken, attacker);
                        if (!weapons.length) {
                            ui.notifications.warn(`Return Fire: ${reactorToken.name} has no Auxiliary ranged weapon that can reach ${attacker.name}.`);
                            return;
                        }
                        let weapon = weapons[0];
                        if (weapons.length > 1) {
                            const pick = await a.startChoiceCard({
                                title: 'RETURN FIRE',
                                icon: a.getActivationIcon('reaction'),
                                description: `Choose the Auxiliary weapon to fire at <b>${attacker.name}</b>.`,
                                originToken: reactorToken,
                                relatedToken: attacker,
                                userIdControl: a.getTokenOwnerUserId(reactorToken),
                                choices: weapons.map(w => ({ text: w.name, icon: 'fas fa-crosshairs', callback: async () => {} }))
                            });
                            weapon = weapons[pick?.choiceIdx];
                            if (!weapon) return;
                        }
                        await a.attackWith(weapon, attacker);
                    }
                }
            ]
        }
    });

    // For a GM macro when a pilot rests:  game.modules.get('la-talents').api.resetGunslingerDie(actor)
    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), resetGunslingerDie: (actor) => resetGunslingerDie(api, actor?.actor ?? actor, 'Rest.') };

    console.info('la-talents | Gunslinger registered');
}
