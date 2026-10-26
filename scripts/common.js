// Small helpers shared by the talent files written after Drone Commander. (Older files keep their own copies.)
// Reminder: reaction `evaluate` functions are serialized by lancer-automations and must be self-contained;
// `activationCode` and everything else can use these.

export function talentRank(actor, key) {
    const t = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes(key));
    return t ? (Number(t.system?.curr_rank) || 1) : 0;
}

export function card(actor, title, body, icon = 'bolt') {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-${icon}"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

export const tokenOf = (t) => t?.actor ? t : (t?.getActiveTokens?.()[0] ?? canvas.tokens.controlled[0]);

export const isOwnTurn = (token) => !!game.combat?.started && game.combat.combatant?.tokenId === token.id;

export const controllerId = (token) => game.users.find(u => u.active && !u.isGM && token.actor?.testUserPermission(u, 'OWNER'))?.id
    ?? game.users.activeGM?.id;

export const wType = (w) => String(w?.system?.active_profile?.type ?? w?.system?.type ?? '').toUpperCase();
export const wSize = (w) => String(w?.system?.size ?? '').toLowerCase();
export const isMechWeapon = (w) => !!w && w.type === 'mech_weapon';
export const isMelee = (w) => isMechWeapon(w) && wType(w) === 'MELEE';
export const hasRange = (w) => isMechWeapon(w) && (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');

export const statusOn = (actor, id) => !!actor?.statuses?.has?.(id) || !!actor?.system?.statuses?.[id];

export const weaponsOf = (actor) => (actor?.system?.loadout?.weapon_mounts ?? [])
    .flatMap(m => (m.slots ?? []).map(s => s.weapon?.value))
    .filter(w => isMechWeapon(w) && !w.system?.destroyed);

export const characters = (a, from, maxDist) => canvas.tokens.placeables.filter(t => t.id !== from.id && t.actor
    && t.actor.type !== 'deployable' && !t.document.hidden && a.getTokenDistance(from, t) <= maxDist);

export function relation(a, from, t) {
    if (typeof a.isFriendly === 'function' && a.isFriendly(from, t)) return 'friendly';
    if (typeof a.isHostile === 'function' && a.isHostile(from, t)) return 'hostile';
    const d1 = from.document.disposition, d2 = t.document.disposition;
    if (d1 === d2) return 'friendly';
    return (d1 === -1 || d2 === -1) ? 'hostile' : 'neutral';
}

// Hits and crits of the attack that just resolved (WeaponAttackFlow / BasicAttackFlow state).
export const hitResults = (data) => data?.flowState?.data?.hit_results ?? [];
export const anyHit = (data) => hitResults(data).some(h => h?.hit);

// Persistent counters kept as actor flags.
export const flagNum = (a, actor, key, dflt) => {
    const v = Number(a.getActorFlags(actor, key));
    return Number.isFinite(v) ? v : dflt;
};

// Slot an item into its own Integrated mount (weapons) if no mount holds it yet. Needs the mech's raw source mounts.
export async function ensureIntegratedMount(mech, itemId, replaceIds = []) {
    const mounts = foundry.utils.deepClone(mech._source?.system?.loadout?.weapon_mounts ?? []);
    let changed = false;
    for (const m of mounts) for (const s of m.slots ?? []) if (replaceIds.includes(s.weapon)) { s.weapon = itemId; changed = true; }
    if (!mounts.some(m => (m.slots ?? []).some(s => s.weapon === itemId))) {
        mounts.push({ bracing: false, type: 'Integrated', slots: [{ mod: null, size: 'Integrated', weapon: itemId }] });
        changed = true;
    }
    if (changed) await mech.update({ 'system.loadout.weapon_mounts': mounts });
}

export async function dropIntegratedMount(mech, itemIds) {
    const mounts = foundry.utils.deepClone(mech._source?.system?.loadout?.weapon_mounts ?? []);
    const kept = mounts
        .map(m => ({ ...m, slots: (m.slots ?? []).map(s => itemIds.includes(s.weapon) ? { ...s, weapon: null } : s) }))
        .filter(m => !(m.type === 'Integrated' && (m.slots ?? []).every(s => !s.weapon)));
    await mech.update({ 'system.loadout.weapon_mounts': kept });
}
