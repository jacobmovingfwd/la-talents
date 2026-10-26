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
    const target = canvas.tokens.get(data.targets?.[0]?.id);
    if (!target || a.getTokenDistance(token, target) <= 1) return;
    const { confirmed } = await a.askCard({
        title: 'LUNGE',
        description: `Fly up to <b>3 spaces</b> toward <b>${target.name}</b> before attacking with <b>${data.weapon.name}</b>? Ignores engagement and doesn't provoke reactions.`,
        yesText: 'Lunge',
        noText: 'Skip',
        owner: token,
        originToken: token,
        relatedToken: target
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'hunter_lunge'))) return;
    await a.moveToken(token, {
        free: true,
        action: 'fly',
        range: 3,
        title: 'LUNGE',
        description: `Fly up to 3 spaces toward ${target.name}.`
    });
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
        // Registered before Lunge so the throw decision comes first (a thrown attack does not lunge).
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
                        if (data.flowState?.la_extraData?.is_throw) return false;
                        if (!data.targets?.length) return false;
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
