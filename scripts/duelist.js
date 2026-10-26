// Duelist talent. Built so far: rank 1 only.
//  Rank 1, Partisan: +1 Accuracy on the first melee attack you make with a Main Melee weapon on your turn.
//    A constant bonus on the mech (synced by rank, like Vanguard) with a once-per-turn gate.
//  Rank 2 (Blademaster) and rank 3 (Unstoppable) are not built yet.

const PARTISAN_ID = 'duelist-partisan';

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
