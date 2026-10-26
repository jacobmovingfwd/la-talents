// Hunter talent.
//  Rank 1, Lunge: 1/round, when you attack with an Auxiliary melee weapon, you may fly up to 3 spaces toward the
//    target before the attack. Offered at the start of the attack (free movement: ignores engagement, provokes no
//    reactions, costs none of your movement). "Directly toward" is left to the player: the picker is not
//    constrained to a line.
//  Rank 2, Knife Juggler: your Auxiliary melee weapons gain Thrown 5 (a tag bonus, so Thrown weapons that
//    already have it go up to 5). Weapons with no native Thrown tag are offered a "throw it?" prompt at the start
//    of the attack. At the end of your turn every weapon you have thrown returns to you.
//  Rank 3, Disdainful Blade: 1/round, when you hit with a melee attack, you may also throw an Auxiliary melee
//    weapon at any character within Range as a free action. It cannot deal bonus damage.
//
// "Auxiliary melee weapon" = a mech weapon of size Auxiliary and type Melee.

const KJ_ID = 'hunter-knife-juggler';

export function hunterRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('hunter'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

function isAuxMelee(w) {
    return !!w && w.type === 'mech_weapon'
        && String(w.system?.size ?? '').toLowerCase() === 'auxiliary'
        && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE';
}

const hasNativeThrown = (w) => [...(w.system?.active_profile?.all_tags ?? []), ...(w.system?.tags ?? [])]
    .some(t => t?.lid === 'tg_thrown' || t?.id === 'tg_thrown');

function auxMeleeWeapons(actor) {
    return (actor?.system?.loadout?.weapon_mounts ?? [])
        .flatMap(m => (m.slots ?? []).map(s => s.weapon?.value))
        .filter(isAuxMelee);
}

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-hammer"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

// ---------------------------------------------------------------- Rank 2: Knife Juggler bonus

// Self-contained on purpose: the functions below are serialized by lancer-automations.
const KNIFE_JUGGLER = {
    id: KJ_ID,
    name: 'Hunter (Knife Juggler)',
    type: 'tag',
    tagId: 'tg_thrown',
    tagName: 'Thrown',
    tagMode: 'override',
    val: 5,
    condition: (state) => {
        const w = state?.item;
        return !!w && w.type === 'mech_weapon'
            && String(w.system?.size ?? '').toLowerCase() === 'auxiliary'
            && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'MELEE';
    }
};

export async function syncHunterMech(api, mech) {
    const has = api.getConstantBonuses(mech).some(b => b.id === KJ_ID);
    const should = hunterRank(mech) >= 2;
    if (should && !has) await api.addConstantBonus(mech, KNIFE_JUGGLER);
    else if (!should && has) await api.removeConstantBonus(mech, KJ_ID);
}

// ---------------------------------------------------------------- Thrown weapons

function thrownTokensOf(actor) {
    return canvas.tokens.placeables.filter(t => {
        const f = t.document.flags?.['lancer-automations'];
        return f?.thrownWeapon && f?.ownerActorUuid === actor.uuid;
    });
}

// Same job as lancer-automations' pickup: re-enable the weapon and remove the thrown token.
async function returnThrown(actor) {
    const tokens = thrownTokensOf(actor);
    for (const t of tokens) {
        const f = t.document.flags['lancer-automations'];
        if (game.user.isGM) {
            const weapon = actor.items.get(f.weaponId);
            if (weapon) await weapon.update({ 'system.disabled': false });
            await t.document.delete();
        } else {
            game.socket.emit('module.lancer-automations', {
                action: 'pickupWeapon',
                payload: {
                    sceneId: canvas.scene.id,
                    tokenId: t.document.id,
                    weaponId: f.weaponId,
                    ownerActorUuid: actor.uuid,
                    weaponName: f.weaponName
                }
            });
        }
    }
    if (tokens.length) {
        const names = tokens.map(t => t.document.flags['lancer-automations'].weaponName).join(', ');
        await card(actor, 'KNIFE JUGGLER', `${names} returns to ${actor.name}.`);
    }
}

async function offerThrow(a, token, data) {
    const { confirmed } = await a.askCard({
        title: 'KNIFE JUGGLER',
        description: `Throw <b>${data.weapon.name}</b> at the target (Thrown 5) instead of attacking in melee?`,
        yesText: 'Throw',
        noText: 'Melee',
        owner: token,
        originToken: token
    });
    if (!confirmed) return;
    const fs = data.flowState;
    fs.la_extraData = fs.la_extraData || {};
    fs.la_extraData.is_throw = true;
    if (fs.data?.acc_diff?.weapon) fs.data.acc_diff.weapon.thrown = true;
}

// ---------------------------------------------------------------- Rank 1: Lunge

async function lunge(a, token, data) {
    // Targets are usually not chosen yet at this point (the Attack HUD picks them later), so Lunge
    // works with or without a pre-selected target. Reach is 3 flown + the greater of the weapon's Threat and Thrown range. Only an adjacent target skips Lunge (a player may lunge just to become Engaged).
    // Thrown counts as a melee attack, so the attack reach is the greater of Threat and Thrown range.
    const ranges = a.getMaxWeaponRanges_WithBonus(data.weapon) ?? {};
    const threat = Math.max(Number(ranges.Threat) || 1, Number(ranges.Thrown) || 0);
    const REACH = threat + 3;
    let target = canvas.tokens.get(data.targets?.[0]?.id) ?? null;
    if (target && a.getTokenDistance(token, target) <= 1) return;
    if (target && a.getTokenDistance(token, target) > REACH) target = null;

    const { confirmed } = await a.askCard({
        title: 'LUNGE',
        description: target
            ? `Fly up to <b>3 spaces</b> toward <b>${target.name}</b> before attacking with <b>${data.weapon.name}</b>? Ignores engagement and doesn't provoke reactions.`
            : `Fly up to <b>3 spaces</b> toward a target before attacking with <b>${data.weapon.name}</b>? Ignores engagement and doesn't provoke reactions.`,
        yesText: 'Lunge',
        noText: 'Skip',
        owner: token,
        originToken: token,
        relatedToken: target ?? undefined
    });
    if (!confirmed) return;

    // If Lunge picks the target itself and is then cancelled, put the targets back as they were.
    const prevTargetIds = (data.targets ?? []).map(t => t?.id).filter(Boolean);
    const prevTargetUuids = prevTargetIds.map(id => canvas.tokens.get(id)?.document?.uuid).filter(Boolean);
    let targetSetByLunge = false;
    const undoTarget = () => {
        if (!targetSetByLunge) return;
        canvas.tokens.setTargets(prevTargetIds);
        data.flowState?.data?.acc_diff?.replaceTargets?.(prevTargetUuids);
    };

    if (!target) {
        const picked = await a.chooseToken(token, {
            range: REACH,
            count: 1,
            includeSelf: false,
            title: 'LUNGE',
            description: `Choose the target to lunge toward (within ${REACH} spaces: 3 flown + attack reach ${threat}).`
        });
        target = picked?.[0] ?? null;
        if (!target) return;
        if (a.getTokenDistance(token, target) <= 1) return;
        canvas.tokens.setTargets([target.id]);
        targetSetByLunge = true;
        // The Attack HUD built its target list before this prompt, so hand it the new target too.
        data.flowState?.data?.acc_diff?.replaceTargets?.([target.document.uuid]);
    }

    // "Fly up to 3 spaces directly toward the target": only spaces between you and the target count, i.e.
    // spaces on a shortest path (flown + remaining distance == the starting distance). The picker lights only
    // the spaces toward the target (like Knockback lights those away), but it can't refuse a click, so the
    // plan is checked BEFORE anything moves. A space outside the rule offers: ignore, choose again, or stop.
    const origin = token.center;
    const tc = target.center;
    const behind = { x: origin.x + (origin.x - tc.x), y: origin.y + (origin.y - tc.y) };
    const spaces = (from, to) => {
        const m = canvas.grid.measurePath([from, to]);
        return Math.round((m.spaces ?? (m.distance / (canvas.grid.distance || 1))) || 0);
    };
    const startDist = a.getTokenDistance(token, target);
    const centerOffset = spaces(origin, tc) - startDist;   // edge-to-edge vs centre-to-centre (token size)

    let plan = null;
    for (let attempt = 0; attempt < 10 && !plan; attempt++) {
        const plans = await a.moveTokenRuler(token, {
            free: true,
            action: 'fly',
            range: 3,
            planOnly: true,
            urgent: true,
            awayFrom: behind,
            title: 'LUNGE',
            description: `Fly up to 3 spaces directly toward ${target.name}. Only spaces between you and the target are lit.`
        });
        const candidate = plans?.[0];
        if (!candidate?.path || candidate.path.length < 2) { undoTarget(); return; }   // cancelled: nothing moved, nothing spent
        const end = candidate.path.at(-1);
        const endCenter = token.document.getCenterPoint({ x: end.x, y: end.y });
        const flown = spaces(origin, endCenter);
        const remaining = spaces(endCenter, tc) - centerOffset;
        if (flown >= 1 && flown <= 3 && remaining >= 1 && flown + remaining === startDist) { plan = candidate; break; }

        ui.notifications.warn(`Lunge: that space isn't within 3 spaces directly toward ${target.name}.`);
        const pick = await a.startChoiceCard({
            title: 'LUNGE',
            icon: 'fas fa-triangle-exclamation',
            description: `That space isn't within 3 spaces directly toward <b>${target.name}</b> (between you and the target).`,
            originToken: token,
            userIdControl: a.getTokenOwnerUserId(token),
            choices: [
                { text: 'Ignore restrictions and fly there', icon: 'fas fa-ban', callback: async () => {} },
                { text: 'Choose another space', icon: 'fas fa-location-crosshairs', callback: async () => {} },
                { text: 'Stop (cancel Lunge)', icon: 'fas fa-hand', callback: async () => {} }
            ]
        });
        if (pick?.choiceIdx === 0) plan = candidate;
        else if (pick?.choiceIdx !== 1) { undoTarget(); return; }
    }
    if (!plan) { undoTarget(); return; }

    // Commit exactly as the picker would for a free move (no drag flag), then wait for the animation.
    await token.document.move(plan.path.slice(1).map(w => ({ elevation: token.document.elevation, ...w })), { method: 'api', showRuler: true });
    for (let i = 0; i < 240 && token.document.movement?.state === 'pending'; i++) await new Promise(r => setTimeout(r, 50));
    if (token.document.object?.movementAnimationPromise) await token.document.object.movementAnimationPromise;

    // The use is only spent if the flight actually happens.
    await a.consumeOncePerRound(token, 'hunter_lunge');
}

// ---------------------------------------------------------------- Rank 3: Disdainful Blade

async function disdainfulBlade(a, token) {
    const weapons = auxMeleeWeapons(token.actor).filter(w => !w.system?.disabled && !w.system?.destroyed);
    if (!weapons.length) return;
    const { confirmed } = await a.askCard({
        title: 'DISDAINFUL BLADE',
        description: 'You hit with a melee attack. Throw an Auxiliary melee weapon at any character within Range as a free action? It cannot deal bonus damage.',
        yesText: 'Throw',
        noText: 'Skip',
        owner: token,
        originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'hunter_disdainful_blade'))) return;

    let weapon = weapons[0];
    if (weapons.length > 1) {
        const pick = await a.startChoiceCard({
            title: 'DISDAINFUL BLADE',
            icon: a.getActivationIcon('free'),
            description: 'Choose the weapon to throw.',
            originToken: token,
            userIdControl: a.getTokenOwnerUserId(token),
            choices: weapons.map(w => ({ text: w.name, icon: 'fas fa-hammer', callback: async () => {} }))
        });
        weapon = weapons[pick?.choiceIdx];
        if (!weapon) return;
    }
    const range = a.getMaxWeaponRanges_WithBonus(weapon).Thrown || 5;
    const picked = await a.chooseToken(token, {
        range,
        count: 1,
        includeSelf: false,
        title: 'DISDAINFUL BLADE',
        description: `Choose a target within Range ${range}.`
    });
    const target = picked?.[0];
    if (!target) return;
    canvas.tokens.setTargets([target.id]);
    await a.beginWeaponThrowFlow(weapon, {}, { _csmNoBonusDmg: { enabled: true } });
}

export function registerHunter(api) {
    const base = { triggerSelf: true, triggerOther: false, outOfCombat: true, autoActivate: true,
        checkReaction: false, activationType: 'code', activationMode: 'instead' };

    api.registerDefaultGeneralReactions({
        // Registered before Lunge so the throw decision comes first (a thrown attack can still lunge).
        'Hunter - Knife Juggler': {
            category: 'General',
            reactions: [
                {
                    ...base,
                    comments: 'Hunter rank 2: offer to throw an Auxiliary melee weapon that has no native Thrown',
                    triggers: ['onInitAttack'],
                    awaitActivationCompletion: true,
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('hunter'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
                        if (String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE') return false;
                        if (data.flowState?.la_extraData?.is_throw) return false;
                        return ![...(w.system?.active_profile?.all_tags ?? []), ...(w.system?.tags ?? [])].some(x => x?.lid === 'tg_thrown' || x?.id === 'tg_thrown');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await offerThrow(a, reactorToken, data);
                    }
                },
                {
                    ...base,
                    comments: 'Hunter rank 2: thrown weapons return at the end of your turn',
                    triggers: ['onTurnEnd'],
                    outOfCombat: false,
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('hunter'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        return canvas.tokens.placeables.some(x => {
                            const f = x.document.flags?.['lancer-automations'];
                            return f?.thrownWeapon && f?.ownerActorUuid === reactorToken.actor.uuid;
                        });
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await returnThrown(reactorToken.actor);
                    }
                }
            ]
        },

        'Hunter - Lunge': {
            category: 'General',
            reactions: [
                {
                    ...base,
                    comments: 'Hunter rank 1: offer Lunge before an Auxiliary melee attack',
                    triggers: ['onInitAttack'],
                    awaitActivationCompletion: true,
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('hunter'));
                        if (!t) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.size ?? '').toLowerCase() !== 'auxiliary') return false;
                        if (String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'MELEE') return false;
                                                return a.checkGate(reactorToken, 'hunter_lunge');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await lunge(a, reactorToken, data);
                    }
                }
            ]
        },

        'Hunter - Disdainful Blade': {
            category: 'General',
            reactions: [
                {
                    ...base,
                    comments: 'Hunter rank 3: after a melee hit, offer a free thrown Auxiliary melee attack',
                    triggers: ['onHit'],
                    awaitActivationCompletion: true,
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('hunter'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        if (!data.weapon) return false;
                        if (typeof data.isRangedAttack === 'function' && data.isRangedAttack()) return false;
                        return a.checkGate(reactorToken, 'hunter_disdainful_blade');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await disdainfulBlade(a, reactorToken);
                    }
                }
            ]
        }
    });

    console.info('la-talents | Hunter registered');
}
