// Talent automations for lancer-automations.
//  - Vanguard: rank 1 +1 Accuracy with CQB weapons within Range 3, rank 2 ignore cover with them,
//    rank 3 Overwatch on paths that enter Threat (see vanguard-overwatch.js).
//    Keeps constant bonuses on every mech whose pilot has the talent, by rank.
//  - Walking Armory: see walking-armory.js
//  - Exemplar: see exemplar.js
//  - Spotter: see spotter.js
//  - Skirmisher: see skirmisher.js
//  - Gunslinger: see gunslinger.js
//  - Hunter, Duelist, Nuclear Cavalier, Siege Specialist, Grease Monkey, Drone Commander: see their own files

import { registerWalkingArmory } from './walking-armory.js';
import { registerSemperVigilo } from './vanguard-overwatch.js';
import { registerExemplar } from './exemplar.js';
import { registerSpotter } from './spotter.js';
import { registerSkirmisher, syncSkirmisherMech } from './skirmisher.js';
import { registerGunslinger, syncGunslingerMech } from './gunslinger.js';
import { registerHunter, syncHunterMech } from './hunter.js';
import { registerDuelist, syncDuelistMech } from './duelist.js';
import { registerNuclearCavalier, syncNuclearMech } from './nuclear-cavalier.js';
import { registerSiegeSpecialist } from './siege-specialist.js';
import { registerCollateralDamage } from './siege-collateral.js';
import { registerGreaseMonkey } from './grease-monkey.js';
import { registerDroneCommander } from './drone-commander.js';
import { registerDroneSwarm } from './drone-swarm.js';

const TALENT_LID = 't_vanguard';
const BONUS_ID = 'vanguard-cqb-accuracy';

// Self-contained on purpose: the functions below are serialized by lancer-automations.
// Rank 1, Handshake Etiquette: +1 Accuracy with CQB weapons against targets within Range 3.
const ACCURACY = {
    id: BONUS_ID,
    name: 'Vanguard (CQB)',
    type: 'accuracy',
    val: 1,
    rollTypes: ['attack'],
    condition: (state, actor, data, context) => {
        const w = state?.item;
        const type = w?.system?.active_profile?.type ?? w?.system?.type;
        return String(type ?? '').toUpperCase() === 'CQB';
    },
    applyToCondition: (target, state, reactorToken, entry) => {
        const api = game.modules.get('lancer-automations')?.api;
        const d = api?.getTokenDistance(reactorToken, target);
        return typeof d === 'number' && d <= 3;
    }
};

// Rank 2, See-Through Seeker: ignore soft and hard cover with CQB weapons against targets within Range 3.
const NO_COVER = {
    id: 'vanguard-cqb-no-cover',
    name: 'Vanguard (See-Through Seeker)',
    type: 'target_modifier',
    subtype: 'no_cover',
    condition: (state) => {
        const w = state?.item;
        const type = w?.system?.active_profile?.type ?? w?.system?.type;
        return String(type ?? '').toUpperCase() === 'CQB';
    },
    applyToCondition: (target, state, reactorToken) => {
        const w = state?.item;
        const type = w?.system?.active_profile?.type ?? w?.system?.type;
        if (String(type ?? '').toUpperCase() !== 'CQB') return false;
        const api = game.modules.get('lancer-automations')?.api;
        const d = api?.getTokenDistance(reactorToken, target);
        return typeof d === 'number' && d <= 3;
    }
};

// Each bonus needs the talent at this rank or higher.
const BONUSES = [
    { rank: 1, data: ACCURACY },
    { rank: 2, data: NO_COVER }
];

// Rank of the pilot's Vanguard talent, 0 if they don't have it.
function vanguardRank(mech) {
    const pilot = mech.system?.pilot?.value;
    const talent = pilot?.items?.find(i => i.type === 'talent' && i.system?.lid === TALENT_LID);
    if (!talent) return 0;
    return Number(talent.system?.curr_rank) || 1;
}

async function syncMech(api, mech) {
    const rank = vanguardRank(mech);
    for (const { rank: needed, data } of BONUSES) {
        const has = api.getConstantBonuses(mech).some(b => b.id === data.id);
        const should = rank >= needed;
        if (should && !has) await api.addConstantBonus(mech, data);
        else if (!should && has) await api.removeConstantBonus(mech, data.id);
    }
}

Hooks.once('lancer-automations.ready', (api) => {
    try { registerWalkingArmory(api); }
    catch (err) { console.error('la-talents | Walking Armory registration failed', err); }
    try { registerSemperVigilo(api); }
    catch (err) { console.error('la-talents | Semper Vigilo registration failed', err); }
    try { registerExemplar(api); }
    catch (err) { console.error('la-talents | Exemplar registration failed', err); }
    try { registerSpotter(api); }
    catch (err) { console.error('la-talents | Spotter registration failed', err); }
    try { registerSkirmisher(api); }
    catch (err) { console.error('la-talents | Skirmisher registration failed', err); }
    try { registerGunslinger(api); }
    catch (err) { console.error('la-talents | Gunslinger registration failed', err); }
    for (const [name, register] of [
        ['Hunter', registerHunter], ['Duelist', registerDuelist], ['Nuclear Cavalier', registerNuclearCavalier],
        ['Siege Specialist', registerSiegeSpecialist], ['Collateral Damage', registerCollateralDamage],
        ['Grease Monkey', registerGreaseMonkey], ['Drone Commander', registerDroneCommander], ['Drone Swarm', registerDroneSwarm]
    ]) {
        try { register(api); }
        catch (err) { console.error(`la-talents | ${name} registration failed`, err); }
    }

    let timer = null;
    const syncAll = () => {
        if (!game.user.isActiveGM) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            for (const actor of game.actors.filter(a => a.type === 'mech')) {
                try { await syncMech(api, actor); await syncSkirmisherMech(api, actor); await syncGunslingerMech(api, actor); await syncHunterMech(api, actor); await syncDuelistMech(api, actor); await syncNuclearMech(api, actor); }
                catch (err) { console.error('la-talents | sync failed for', actor.name, err); }
            }
        }, 500);
    };

    syncAll();
    // Talent added/removed, mech re-linked to a different pilot, or a new mech created.
    for (const hook of ['createItem', 'deleteItem', 'updateItem', 'updateActor', 'createActor', 'canvasReady'])
        Hooks.on(hook, syncAll);
});
