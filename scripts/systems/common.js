// Shared helpers for the system automations. Reminder: reaction `evaluate` functions and bonus `condition` /
// `applyToCondition` functions are serialized by lancer-automations and must be self-contained, so they cannot call
// anything in here; `activationCode` and everything else can.

// Installed mech systems (the loadout), as items.
export const systemsOf = (actor) => (actor?.system?.loadout?.systems ?? [])
    .map(s => s?.value ?? s)
    .filter(s => s && typeof s === 'object');

export const systemWorks = (s) => !!s && !s.system?.destroyed && !s.system?.disabled;

export const hasSystem = (actor, lid) => systemsOf(actor).some(s => s.system?.lid === lid && systemWorks(s));

// Keep a table of constant bonuses in step with the systems a mech has installed (and working).
//   table: [{ lid, bonuses: [bonusData] }]. Each bonus needs a stable `id`.
export async function syncSystemBonuses(api, mech, table) {
    const have = api.getConstantBonuses(mech);
    for (const { lid, bonuses } of table) {
        const should = hasSystem(mech, lid);
        for (const data of bonuses) {
            const has = have.some(b => b.id === data.id);
            if (should && !has) await api.addConstantBonus(mech, data);
            else if (!should && has) await api.removeConstantBonus(mech, data.id);
        }
    }
}

// Pasted into evaluate() bodies by hand (they can't import): the installed-and-working check for the reacting item.
//   const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
//   if (!inst || item.system?.destroyed || item.system?.disabled) return false;
