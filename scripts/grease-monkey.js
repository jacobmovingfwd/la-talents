// Grease Monkey talent. Ranks 1-3.
//  Rank 1, Unsanctioned Capacity Upgrade: while resting, spend 2 Repairs to replenish 1 use of all Limited
//    weapons and systems. Resting has no trigger, so it is a macro (run it for the resting mech):
//      game.modules.get('la-talents').api.capacityUpgrade()      (uses the selected token)
//  Rank 2, Machine Bond: when you STABILIZE, you clear IMPAIRED, JAMMED, IMMOBILIZED, SLOWED and LOCK ON that
//    were not caused by your own systems or talents. Automatic. An effect counts as yours when Lancer
//    Automations recorded this token as its origin; conditions with no recorded origin are cleared.
//  Rank 3, Friends in High Places: once per mission while resting, call a supply drop: you and your allies
//    replenish 1 use of all Limited weapons and systems and restore 1 Structure, no Repairs needed, even at the
//    Repair Cap. A GM macro (it edits other players' mechs):
//      game.modules.get('la-talents').api.supplyDrop()           (uses the selected token)
//    "Once per mission" is a flag on the Grease Monkey's mech. To reset it for a new mission:
//      game.modules.get('la-talents').api.supplyDrop({ reset: true })

const FLAG_DROP = 'greaseMonkeySupplyDrop';
const STABILIZE_CLEARS = ['impaired', 'jammed', 'immobilized', 'slowed', 'lockon'];

export function greaseRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('grease'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-wrench"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

const tokenOf = (t) => t?.actor ? t : (t?.getActiveTokens?.()[0] ?? canvas.tokens.controlled[0]);

// Replenish 1 use of every Limited weapon and system on the mech. Returns the names that gained a use.
async function replenishLimited(actor) {
    const gained = [];
    for (const item of actor.items) {
        if (item.type !== 'mech_weapon' && item.type !== 'mech_system') continue;
        const uses = item.system?.uses;
        if (!uses || !(uses.max > 0) || uses.value >= uses.max) continue;
        await item.update({ 'system.uses.value': Math.min(uses.max, uses.value + 1) });
        gained.push(item.name);
    }
    return gained;
}

// ---------------------------------------------------------------- Rank 1 (macro)

export async function capacityUpgrade(tokenLike) {
    const token = tokenOf(tokenLike);
    const actor = token?.actor;
    if (!actor) return ui.notifications.warn('Capacity Upgrade: select the resting mech first.');
    if (greaseRank(actor) < 1) return ui.notifications.warn(`Capacity Upgrade: ${token.name}'s pilot does not have Grease Monkey.`);
    const repairs = actor.system?.repairs;
    if (!repairs || repairs.value < 2) return ui.notifications.warn(`Capacity Upgrade: ${token.name} has ${repairs?.value ?? 0} Repairs; it needs 2.`);
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'UNSANCTIONED CAPACITY UPGRADE' },
        content: `<p>${token.name} spends <b>2 Repairs</b> (${repairs.value} left) to replenish 1 use of all Limited weapons and systems.</p>`
    });
    if (!ok) return;
    await actor.update({ 'system.repairs.value': repairs.value - 2 });
    const gained = await replenishLimited(actor);
    await card(actor, 'UNSANCTIONED CAPACITY UPGRADE',
        `<b>${token.name}</b> spends 2 Repairs. ${gained.length ? `+1 use: ${gained.join(', ')}.` : 'Nothing was below its maximum uses.'}`);
}

// ---------------------------------------------------------------- Rank 3 (GM macro)

export async function supplyDrop(a, optionsOrToken = {}) {
    const isOptions = optionsOrToken && !optionsOrToken.actor && !optionsOrToken.getActiveTokens;
    const options = isOptions ? optionsOrToken : {};
    const token = tokenOf(isOptions ? null : optionsOrToken);
    const actor = token?.actor;
    if (!actor) return ui.notifications.warn('Supply drop: select the Grease Monkey token first.');
    if (!game.user.isGM) return ui.notifications.warn('Supply drop: run this as the GM (it edits other players\' mechs).');
    if (options.reset) {
        await a.removeActorFlags(actor, { [FLAG_DROP]: true });
        return ui.notifications.info(`Supply drop reset for ${token.name}.`);
    }
    if (greaseRank(actor) < 3) return ui.notifications.warn(`Supply drop: ${token.name}'s pilot does not have Grease Monkey rank 3.`);
    if (a.getActorFlags(actor, FLAG_DROP)) return ui.notifications.warn(`Supply drop: ${token.name} already used it this mission. Reset it with { reset: true }.`);

    const allies = canvas.tokens.placeables.filter(t => t.actor?.type === 'mech'
        && (t.id === token.id || a.isFriendly(token, t)));
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'FRIENDS IN HIGH PLACES' },
        content: `<p>Call in the supply drop? Each of these mechs replenishes 1 use of all Limited weapons and systems and restores 1 Structure:</p><p><b>${allies.map(t => t.name).join(', ')}</b></p>`
    });
    if (!ok) return;
    await a.addActorFlags(actor, { [FLAG_DROP]: true });

    const lines = [];
    for (const t of allies) {
        const gained = await replenishLimited(t.actor);
        const s = t.actor.system?.structure;
        let structure = '';
        if (s && s.value < s.max) {
            await t.actor.update({ 'system.structure.value': s.value + 1 });
            structure = ' +1 Structure';
        }
        lines.push(`<b>${t.name}</b>:${gained.length ? ` +1 use (${gained.join(', ')})` : ' no Limited uses to restore'}${structure}`);
    }
    await card(actor, 'FRIENDS IN HIGH PLACES', `Supply drop incoming.<br>${lines.join('<br>')}`);
}

// ---------------------------------------------------------------- Rank 2: Machine Bond

async function machineBond(a, token) {
    const actor = token.actor;
    const cleared = [];
    for (const effect of [...actor.effects]) {
        if (!STABILIZE_CLEARS.some(id => effect.statuses?.has(id))) continue;
        const origin = effect.flags?.['lancer-automations']?.originID;
        if (origin && (origin === token.id || origin === actor.id)) continue; // caused by your own systems or talents
        cleared.push(effect.name);
        await effect.delete();
    }
    if (cleared.length) await card(actor, 'MACHINE BOND', `<b>${token.name}</b> stabilizes and clears: ${cleared.join(', ')}.`);
}

export function registerGreaseMonkey(api) {
    api.registerDefaultGeneralReactions({
        'Grease Monkey - Machine Bond': {
            category: 'General',
            reactions: [
                {
                    comments: 'Grease Monkey rank 2: Stabilize clears IMPAIRED, JAMMED, IMMOBILIZED, SLOWED and LOCK ON',
                    triggers: ['onActivation'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('grease'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        return String(data.actionName ?? '').toLowerCase() === 'stabilize';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await machineBond(a, reactorToken);
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}),
        capacityUpgrade: (token) => capacityUpgrade(token),
        supplyDrop: (arg) => supplyDrop(api, arg) };

    console.info('la-talents | Grease Monkey registered');
}
