// Spotter talent.
//  Rank 1, Particularize: handled by the Lancer system itself. When an ally adjacent to a Spotter attacks a
//    target and uses Lock On, the attack HUD shows "Spotter (*)" and rolls twice, keeping the better result.
//    Nothing to do here.
//  Rank 2, Panopticon:
//    - When you Lock On (the Quick Tech action), you learn the target's Armor, Speed, Evasion, E-Defense,
//      Mech Skills and current HP, and can share that with allies.
//    - At the end of your turn, if you did not move and took the Lock On action, you may Lock On once more
//      as a free action (same reveal).
//  Rank 3, Bentham/Foucault Elimination: after you Lock On, you may nominate an adjacent ally. They may
//    immediately take any quick action as a reaction, and your target's Lock On is consumed afterwards.
//
// Lancer Automations does not report who applied a Lock On, so a Spotter's Lock On action is marked when it
// starts (onInitActivation) and picked up when the status lands (onStatusApplied).

const FLAG_PENDING = 'spotterLockOnPending';   // timestamp: a Lock On action started and has not landed yet
const FLAG_TOOK_LOCKON = 'spotterTookLockOn';  // took the Lock On action this turn
const FLAG_ELIM = 'spotterElimination';        // on the nominated ally: { targetId, spotterId }
const FLAG_ELIM_ALLY = 'spotterEliminationAlly'; // on the Spotter: token id of the nominated ally
const PENDING_MS = 120000;
const ELIM_EFFECT = 'Elimination (free quick action)';

function spotterRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('spotter'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="cci cci-lock-on i--m"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

function targetStats(target) {
    const s = target.actor?.system ?? {};
    const num = (v) => (v === undefined || v === null || v === '' ? '?' : v);
    const hp = s.hp ? `${num(s.hp.value)} / ${num(s.hp.max)}` : '?';
    return `<table style="width:100%">
        <tr><td><b>Armor</b></td><td>${num(s.armor)}</td><td><b>Speed</b></td><td>${num(s.speed)}</td></tr>
        <tr><td><b>Evasion</b></td><td>${num(s.evasion)}</td><td><b>E-Defense</b></td><td>${num(s.edef)}</td></tr>
        <tr><td><b>HP</b></td><td colspan="3">${hp}</td></tr>
        <tr><td><b>Mech Skills</b></td><td colspan="3">HULL ${num(s.hull)} · AGI ${num(s.agi)} · SYS ${num(s.sys)} · ENG ${num(s.eng)}</td></tr>
    </table>`;
}

// Panopticon reveal: show it to the Spotter's player (and the GM), and offer to share it with allies.
async function revealTarget(a, spotter, target) {
    const title = `PANOPTICON: ${target.name}`;
    const body = targetStats(target);
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
    const ownerId = a.getTokenOwnerUserId(spotter);
    const privateIds = [...new Set([ownerId, ...gmIds].filter(Boolean))];

    const { confirmed } = await a.askCard({
        title: 'PANOPTICON',
        description: `You learn <b>${target.name}</b>'s Armor, Speed, Evasion, E-Defense, Mech Skills and current HP. Share it with your allies?`,
        yesText: 'Share with allies',
        noText: 'Keep to myself',
        owner: spotter,
        originToken: spotter,
        relatedToken: target
    });

    // Shared: ordinary public chat. Kept private: whispered to the Spotter's player and the GM.
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: spotter.actor }),
        ...(confirmed ? {} : { whisper: privateIds }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;">${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}
            <i>${confirmed ? 'Shared with allies.' : 'Only you know this.'}</i></div>
        </div>`
    });
}

// Rank 3: nominate an adjacent ally to take a free quick action that consumes the Lock On.
async function offerElimination(a, spotter, target) {
    const adjacent = canvas.tokens.placeables.filter(t => t.id !== spotter.id && t.actor
        && t.actor.type !== 'deployable'
        && !t.document.hidden
        && a.isFriendly(spotter, t)
        && a.getTokenDistance(spotter, t) <= 1);
    // The ally takes the action as a reaction, so it must have its Reaction to spend.
    const allies = adjacent.filter(t => a.hasReactionAvailable(t));
    if (!allies.length) {
        if (adjacent.length) ui.notifications.warn('Elimination: no adjacent ally has a Reaction available.');
        return;
    }

    const { confirmed } = await a.askCard({
        title: 'BENTHAM/FOUCAULT ELIMINATION',
        description: `Spend a <b>quick action</b> to nominate an adjacent ally? They spend their <b>Reaction</b> to immediately take any quick action, consuming <b>${target.name}</b>'s Lock On.`,
        yesText: 'Nominate',
        noText: 'Skip',
        owner: spotter,
        originToken: spotter,
        relatedToken: target
    });
    if (!confirmed) return;

    // Nominate, let that ally's player accept or decline. A decline returns to the Spotter to pick someone
    // else; it fizzles when nobody valid is left (or the Spotter gives up).
    const pool = [...allies];
    let ally = null;
    while (pool.length && !ally) {
        let candidate = pool[0];
        if (pool.length > 1) {
            const picked = await a.chooseToken(spotter, {
                title: 'ELIMINATION: NOMINATE ALLY',
                selection: pool,
                includeSelf: false,
                count: 1
            });
            candidate = picked?.[0];
            if (!candidate) return;
        } else if (pool.length < allies.length) {
            // Someone already declined: confirm before nominating the last one.
            const again = await a.askCard({
                title: 'BENTHAM/FOUCAULT ELIMINATION',
                description: `Nominate <b>${candidate.name}</b> instead?`,
                yesText: 'Nominate',
                noText: 'Give up',
                owner: spotter,
                originToken: spotter,
                relatedToken: candidate
            });
            if (!again.confirmed) return;
        }

        // The ally's player decides. Nothing is spent or changed unless they accept.
        const accepted = await a.askCard({
            title: 'BENTHAM/FOUCAULT ELIMINATION',
            description: `<b>${spotter.name}</b> nominates <b>${candidate.name}</b> to spend their <b>Reaction</b> and immediately take any quick action, consuming <b>${target.name}</b>'s Lock On. Accept?`,
            yesText: 'Accept',
            noText: 'Decline',
            owner: candidate,
            originToken: spotter,
            relatedToken: candidate
        });
        if (accepted.confirmed) {
            ally = candidate;
        } else {
            pool.splice(pool.indexOf(candidate), 1);
            await card(spotter.actor, 'BENTHAM/FOUCAULT ELIMINATION', `<b>${candidate.name}</b> declined. Nothing is spent.`);
        }
    }
    if (!ally) {
        await card(spotter.actor, 'BENTHAM/FOUCAULT ELIMINATION', 'No other ally is available. The Elimination fizzles.');
        return;
    }

    await a.setReaction(ally, false); // spend their Reaction
    await a.addActorFlags(ally.actor, { [FLAG_ELIM]: { targetId: target.id, spotterId: spotter.id } });
    await a.addActorFlags(spotter.actor, { [FLAG_ELIM_ALLY]: ally.id });
    try {
        await a.applyEffectsToTokens({
            tokens: [ally],
            effectNames: [{ name: ELIM_EFFECT, icon: 'icons/svg/target.svg', isCustom: true }],
            note: `Nominated by ${spotter.name}`,
            duration: { label: 'indefinite' }
        });
    } catch (err) {
        console.warn('la-talents | Elimination marker effect failed', err);
    }
    await card(spotter.actor, 'BENTHAM/FOUCAULT ELIMINATION',
        `<b>${ally.name}</b> spends their Reaction to immediately take any quick action. ${target.name}'s Lock On is consumed when they do. If they attack ${target.name}, they benefit from it.`);
}

// The nominated ally has acted: consume the Lock On if the action did not already, and clear the marker.
async function finishElimination(a, ally) {
    const info = a.getActorFlags(ally.actor, FLAG_ELIM);
    if (!info) return;
    await a.removeActorFlags(ally.actor, { [FLAG_ELIM]: true });
    const spotter = canvas.tokens.get(info.spotterId);
    if (spotter?.actor) await a.removeActorFlags(spotter.actor, { [FLAG_ELIM_ALLY]: true });
    try {
        await a.removeEffectsByNameFromTokens({ tokens: [ally], effectNames: [ELIM_EFFECT], notify: false });
    } catch (err) { /* marker already gone */ }

    const target = canvas.tokens.get(info.targetId);
    if (!target?.actor) return;
    const had = a.findEffectsOnToken(target, 'lockon')?.length;
    if (had) {
        await a.removeEffectsByNameFromTokens({ tokens: [target], effectNames: ['lockon'], notify: false });
        await card(ally.actor, 'ELIMINATION', `${target.name}'s Lock On was consumed.`);
    }
}

export function registerSpotter(api) {
    api.registerDefaultGeneralReactions({
        // Rank 2/3: a Spotter's Lock On action starts. Remember it until the status lands.
        'Spotter - Lock On': {
            category: 'General',
            reactions: [
                {
                    comments: 'Spotter: mark the start of your Lock On action',
                    triggers: ['onInitActivation'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return data.actionName === 'Lock On' && spotterRank(reactorToken.actor) >= 2;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.addActorFlags(reactorToken.actor, { [FLAG_PENDING]: Date.now() });
                    }
                },
                {
                    comments: 'Spotter: Panopticon reveal, then Bentham/Foucault Elimination',
                    triggers: ['onStatusApplied'],
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (data.statusId !== 'lockon') return false;
                        const target = data.triggeringToken;
                        if (!target?.actor || target.id === reactorToken.id || target.actor.type === 'deployable') return false;
                        if (spotterRank(reactorToken.actor) < 2) return false;
                        const at = Number(a.getActorFlags(reactorToken.actor, 'spotterLockOnPending'));
                        return !!at && Date.now() - at < 120000;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const target = data.triggeringToken;
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_PENDING]: true });
                        await a.addActorFlags(reactorToken.actor, { [FLAG_TOOK_LOCKON]: true });
                        await revealTarget(a, reactorToken, target);
                        if (spotterRank(reactorToken.actor) >= 3) await offerElimination(a, reactorToken, target);
                    }
                },
                {
                    comments: 'Spotter: new turn, forget last turn',
                    triggers: ['onTurnStart'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return spotterRank(reactorToken.actor) >= 2
                            && (!!a.getActorFlags(reactorToken.actor, 'spotterTookLockOn')
                                || !!a.getActorFlags(reactorToken.actor, 'spotterLockOnPending'));
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_TOOK_LOCKON]: true, [FLAG_PENDING]: true });
                    }
                },
                {
                    comments: 'Spotter: Panopticon, a free Lock On at the end of a stationary turn',
                    triggers: ['onTurnEnd'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: false,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        if (spotterRank(reactorToken.actor) < 2) return false;
                        if (!a.getActorFlags(reactorToken.actor, 'spotterTookLockOn')) return false;
                        const hist = a.getMovementHistory(reactorToken.document.id);
                        return !hist?.exists || (hist.intentional?.total ?? 0) === 0;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_TOOK_LOCKON]: true });
                        const { confirmed } = await a.askCard({
                            title: 'PANOPTICON',
                            description: `<b>${reactorToken.name}</b> did not move and took Lock On. Lock On once more as a free action?`,
                            yesText: 'Lock On',
                            noText: 'Skip',
                            owner: reactorToken,
                            originToken: reactorToken
                        });
                        if (!confirmed) return;

                        const sensors = reactorToken.actor?.system?.sensor_range ?? 10;
                        const targets = await a.chooseToken(reactorToken, {
                            range: sensors,
                            glow: 'sensor',
                            count: 1,
                            title: 'PANOPTICON: FREE LOCK ON',
                            description: `Choose a target within Sensors (${sensors})`,
                            filter: t => t.actor?.type !== 'deployable' && t.id !== reactorToken.id
                        });
                        const target = targets?.[0];
                        if (!target) return;

                        // Not via the Lock On action, so the status handler above does not see it as pending.
                        await a.applyEffectsToTokens({ tokens: [target], effectNames: ['lockon'], note: 'Lock On (Panopticon)' });
                        await revealTarget(a, reactorToken, target);
                    }
                }
            ]
        },

        // Rank 3: the nominated ally acts, so the Lock On is consumed.
        'Spotter - Elimination': {
            category: 'General',
            reactions: [
                {
                    comments: 'Elimination: the nominated ally uses an action',
                    triggers: ['onActivation'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return !!a.getActorFlags(reactorToken.actor, 'spotterElimination');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await finishElimination(a, reactorToken);
                    }
                },
                {
                    comments: 'Elimination: the nominated ally attacks (the attack uses the Lock On, then we sweep up)',
                    triggers: ['onAttack', 'onTechAttack'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return !!a.getActorFlags(reactorToken.actor, 'spotterElimination');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        // After the attack's flow, so the roll still gets its Lock On benefit.
                        if (!a.afterFlow(data, () => finishElimination(a, reactorToken))) {
                            await finishElimination(a, reactorToken);
                        }
                    }
                },
                {
                    comments: 'Elimination: the Spotter finishes their turn, so an unused nomination ends',
                    triggers: ['onTurnEnd'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const spotterRank = (actor) => { const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('spotter')); return t ? (Number(t.system?.curr_rank) || 1) : 0; };
                        return !!a.getActorFlags(reactorToken.actor, 'spotterEliminationAlly');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const ally = canvas.tokens.get(a.getActorFlags(reactorToken.actor, 'spotterEliminationAlly'));
                        await a.removeActorFlags(reactorToken.actor, { [FLAG_ELIM_ALLY]: true });
                        if (ally?.actor) await finishElimination(a, ally);
                    }
                }
            ]
        }
    });

    console.info('la-talents | Spotter registered');
}
