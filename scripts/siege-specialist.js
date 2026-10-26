// Siege Specialist talent, ranks 1-3 (rank 3, Collateral Damage, is in siege-collateral.js).
//  Rank 1, Jackhammer: needs a Cannon. As a quick action, fire a jackhammer round at a Size 1 section of an
//    object within Range: 10 AP Kinetic to the object, and every character adjacent to the target is knocked back
//    2 spaces and takes 2 Kinetic. This is a quick action with no item to click, so it is a macro:
//      game.modules.get('la-talents').api.jackhammer()          (uses the selected token)
//    You pick the target hex on the map (a Blast 1 marker, removed afterwards). Damage to the object itself is
//    shown in chat but not applied: objects are not actors.
//  Rank 2, Impact: 1/round, before rolling an attack with a Cannon, all characters adjacent to you must pass a
//    Hull save or be knocked back 1 space and knocked Prone. You are then pushed 1 space in any direction.
//    Offered at the start of the attack. The save is rolled against your Save target.

export function siegeRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('siege'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

const isCannon = (w) => !!w && w.type === 'mech_weapon'
    && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'CANNON';

const cannonsOf = (actor) => (actor?.system?.loadout?.weapon_mounts ?? [])
    .flatMap(m => (m.slots ?? []).map(s => s.weapon?.value))
    .filter(w => isCannon(w) && !w.system?.destroyed);

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-hammer"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

// ---------------------------------------------------------------- Rank 1: Jackhammer (macro)

export async function jackhammer(a, tokenLike) {
    const token = tokenLike?.actor ? tokenLike : (tokenLike?.getActiveTokens?.()[0] ?? canvas.tokens.controlled[0]);
    if (!token?.actor) return ui.notifications.warn('Jackhammer: select the Siege Specialist token first.');
    if (siegeRank(token.actor) < 1) return ui.notifications.warn(`Jackhammer: ${token.name}'s pilot does not have Siege Specialist.`);
    const cannons = cannonsOf(token.actor);
    if (!cannons.length) return ui.notifications.warn(`Jackhammer: ${token.name} has no Cannon.`);
    const range = Math.max(...cannons.map(w => a.getMaxWeaponRanges_WithBonus(w).Range ?? 0));

    const zones = await a.placeZone(token, {
        type: 'Blast',
        size: 1,
        range,
        title: 'JACKHAMMER ROUND',
        description: `Choose the Size 1 section of an object within Range ${range}. Characters in the marker are adjacent to it.`
    });
    const zone = zones?.[0];
    if (!zone) return;
    await a.consumeAction(token, 'quick');

    const chars = a.tokensInTemplate(zone);
    await card(token.actor, 'JACKHAMMER ROUND',
        `<b>${token.name}</b> fires a jackhammer round: <b>10 AP Kinetic</b> to the targeted object section (apply it to the object yourself). `
        + (chars.length ? `Adjacent: ${chars.map(c => c.name).join(', ')}, each knocked back <b>2 spaces</b> and taking <b>2 Kinetic</b>.` : 'No characters are adjacent.'));
    if (chars.length) {
        await a.executeDamageRoll(token, chars, 2, 'Kinetic', 'Jackhammer Round');
        await a.knockBackToken(chars, 2, {
            triggeringToken: token,
            actionName: 'Jackhammer',
            title: 'JACKHAMMER: KNOCKBACK',
            description: 'Knocked back 2 spaces directly away from the target.'
        });
    }
    try { await zone.template.delete(); } catch (err) { /* already gone */ }
}

// ---------------------------------------------------------------- Rank 2: Impact

async function impact(a, token) {
    const adjacent = canvas.tokens.placeables.filter(t => t.id !== token.id && t.actor
        && t.actor.type !== 'deployable' && !t.document.hidden && a.getTokenDistance(token, t) <= 1);
    const { confirmed } = await a.askCard({
        title: 'IMPACT',
        description: `Before this Cannon attack: ${adjacent.length ? `<b>${adjacent.map(t => t.name).join(', ')}</b> must` : 'adjacent characters must'} pass a <b>Hull save</b> or be knocked back 1 space and knocked Prone. You are then pushed 1 space in any direction. Use Impact?`,
        yesText: 'Impact',
        noText: 'Skip',
        owner: token,
        originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'siege_impact'))) return;

    if (adjacent.length) {
        const { results } = await a.executeForceCheck('HULL', adjacent, { saveVs: token });
        const failed = (results ?? []).filter(r => r.completed && !r.passed).map(r => r.token);
        if (failed.length) {
            await a.applyEffectsToTokens({ tokens: failed, effectNames: ['prone'], note: 'Impact' });
            await a.knockBackToken(failed, 1, { triggeringToken: token, actionName: 'Impact', title: 'IMPACT: KNOCKBACK' });
            await card(token.actor, 'IMPACT', `${failed.map(t => t.name).join(', ')} failed the save: knocked back 1 and Prone.`);
        } else {
            await card(token.actor, 'IMPACT', 'Everyone passed the Hull save.');
        }
    }
    await a.moveToken(token, {
        range: 1,
        action: 'forced',
        title: 'IMPACT: PUSHED',
        description: 'You are pushed 1 space in any direction.'
    });
}

export function registerSiegeSpecialist(api) {
    api.registerDefaultGeneralReactions({
        'Siege Specialist - Impact': {
            category: 'General',
            reactions: [
                {
                    comments: 'Siege Specialist rank 2: Impact before a Cannon attack',
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
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('siege'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'CANNON') return false;
                        return a.checkGate(reactorToken, 'siege_impact');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await impact(a, reactorToken);
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), jackhammer: (token) => jackhammer(api, token) };

    console.info('la-talents | Siege Specialist registered');
}
