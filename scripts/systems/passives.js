// Passive system automations, kept as constant bonuses on the mech while the system is installed and working. [beta]
//  Scanner Swarm (HORUS): +1 Accuracy on tech attacks against adjacent characters.
//  Personalizations (GMS): +2 HP. (The +1 Accuracy on a skill check the GM approves is a table ruling.)
//  Reactor Stabilizer (HA): offers a reroll on overheating checks; the second result stands.
//  Bulwark Mods (IPS-N): ignore difficult terrain.
//  External Batteries (HA): weapons that deal Energy gain +5 Range (ranged) or +1 Threat (melee). The destruction on
//    structure damage is in triggered.js.

import { syncSystemBonuses } from './common.js';

// Self-contained on purpose: serialized by lancer-automations.
const TABLE = [
    {
        lid: 'ms_scanner_swarm',
        bonuses: [{
            id: 'sys-scanner-swarm',
            name: 'Scanner Swarm',
            type: 'accuracy',
            val: 1,
            rollTypes: ['tech'],
            applyToCondition: (target, state, reactorToken) => {
                const api = game.modules.get('lancer-automations')?.api;
                const d = api?.getTokenDistance(reactorToken, target);
                return typeof d === 'number' && d <= 1;
            }
        }]
    },
    {
        lid: 'ms_personalizations',
        bonuses: [{ id: 'sys-personalizations', name: 'Personalizations (+2 HP)', type: 'stat', stat: 'system.hp.max', val: 2 }]
    },
    {
        lid: 'ms_reactor_stabilizer',
        bonuses: [{ id: 'sys-reactor-stabilizer', name: 'Reactor Stabilizer', type: 'reroll', subtype: 'retry', rollTypes: ['stressRoll'] }]
    },
    {
        lid: 'ms_bulwark_mods',
        bonuses: [{ id: 'sys-bulwark-mods', name: 'Bulwark Mods', type: 'immunity', subtype: 'terrain' }]
    },
    {
        lid: 'ms_external_batteries',
        bonuses: [
            {
                id: 'sys-external-batteries-range',
                name: 'External Batteries (+5 Range)',
                type: 'range', rangeType: 'Range', rangeMode: 'add', val: 5,
                condition: (state) => {
                    const w = state?.item;
                    const p = w?.system?.active_profile;
                    if (!w || w.type !== 'mech_weapon') return false;
                    const energy = (p?.damage ?? []).some(d => String(d.type).toLowerCase() === 'energy');
                    const ranged = (p?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
                    return energy && ranged;
                }
            },
            {
                id: 'sys-external-batteries-threat',
                name: 'External Batteries (+1 Threat)',
                type: 'range', rangeType: 'Threat', rangeMode: 'add', val: 1,
                condition: (state) => {
                    const w = state?.item;
                    const p = w?.system?.active_profile;
                    if (!w || w.type !== 'mech_weapon') return false;
                    const energy = (p?.damage ?? []).some(d => String(d.type).toLowerCase() === 'energy');
                    const melee = (p?.range ?? []).some(r => String(r.type).toLowerCase() === 'threat');
                    return energy && melee;
                }
            }
        ]
    }
];

export const syncSystemPassives = (api, mech) => syncSystemBonuses(api, mech, TABLE);
