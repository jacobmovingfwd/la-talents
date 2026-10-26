// Nuclear Cavalier talent, ranks 1-3.
//  Rank 1, Aggressive Heat Bleed: the first attack roll you make on your turn while in the Danger Zone deals
//    +2 Heat on a hit. Danger Zone = heat at or above half your Heat Cap (Lancer Automations' own definition).
//    The attack uses up the once-per-turn use whether or not it hits; the bonus damage rides on that attack's
//    damage roll and is dropped if every target is missed.
//  Rank 2, Fusion Hemorrhage: that same first attack also deals Energy instead of Kinetic or Explosive, and
//    +1d6 Energy bonus damage on a hit. Queued by the same reaction as rank 1.
//  Rank 3, Here, Catch!: you get the Fuel Rod Gun (Main CQB, Range 3, Threat 3, 1d3+2 Energy, Limited 3, Unique,
//    "On attack: clear 4 heat"). A GM-side sync creates it on the mech and slots it in its own Integrated mount;
//    it is removed again if the talent drops below rank 3. Attacking with it clears 4 heat (checked against the
//    Danger Zone first, so a Fuel Rod Gun shot from the Danger Zone still gets Heat Bleed).

const BONUS_IDS = ['nuclear-cavalier-heat-bleed', 'nuclear-cavalier-fusion-type', 'nuclear-cavalier-fusion-dmg'];
export const FUEL_ROD_LID = 'la_talents_fuel_rod_gun';

export function nuclearRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('nuclear'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-radiation"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

const inDangerZone = (actor) => {
    const h = actor?.system?.heat;
    return !!h && h.max > 0 && h.value >= Math.floor(h.max / 2);
};

const dropBonuses = (a, actor) => a.removeGlobalBonus(actor, (b) => BONUS_IDS.includes(b?.id));

// ---------------------------------------------------------------- Rank 3: the Fuel Rod Gun (GM sync)

const FUEL_ROD_DATA = () => ({
    name: 'Fuel Rod Gun',
    type: 'mech_weapon',
    img: 'systems/lancer/assets/icons/mech_weapon.svg',
    system: {
        lid: FUEL_ROD_LID,
        size: 'Main',
        profiles: [{
            name: 'Fuel Rod Gun',
            type: 'CQB',
            damage: [{ val: '1d3+2', type: 'Energy' }],
            range: [{ type: 'Range', val: 3 }, { type: 'Threat', val: 3 }],
            tags: [{ lid: 'tg_limited', val: 3 }, { lid: 'tg_unique', val: 1 }],
            description: '',
            effect: '',
            on_attack: 'Clear 4 heat.',
            on_hit: '',
            on_crit: '',
            cost: 0,
            skirmishable: true,
            barrageable: true,
            actions: [],
            bonuses: [],
            synergies: [],
            counters: []
        }]
    }
});

export async function syncNuclearMech(api, mech) {
    const want = nuclearRank(mech) >= 3;
    const owned = mech.items.filter(i => i.type === 'mech_weapon' && i.system?.lid === FUEL_ROD_LID);
    const mounts = foundry.utils.deepClone(mech._source?.system?.loadout?.weapon_mounts ?? []);
    const refs = (id) => mounts.some(m => (m.slots ?? []).some(s => s.weapon === id));

    if (want) {
        let gun = owned[0];
        if (!gun) {
            const [created] = await mech.createEmbeddedDocuments('Item', [FUEL_ROD_DATA()]);
            gun = created;
        }
        if (gun && !refs(gun.id)) {
            mounts.push({ bracing: false, type: 'Integrated', slots: [{ mod: null, size: 'Integrated', weapon: gun.id }] });
            await mech.update({ 'system.loadout.weapon_mounts': mounts });
        }
    } else if (owned.length) {
        const ids = owned.map(i => i.id);
        const kept = mounts
            .map(m => ({ ...m, slots: (m.slots ?? []).map(s => ids.includes(s.weapon) ? { ...s, weapon: null } : s) }))
            .filter(m => !(m.type === 'Integrated' && (m.slots ?? []).every(s => !s.weapon)));
        await mech.update({ 'system.loadout.weapon_mounts': kept });
        await mech.deleteEmbeddedDocuments('Item', ids);
    }
}

// ---------------------------------------------------------------- Ranks 1 and 2: the first attack in the Danger Zone

async function onFirstAttack(a, token, data) {
    const actor = token.actor;
    const rank = nuclearRank(actor);
    const fuelRod = data.weapon?.system?.lid === FUEL_ROD_LID;
    const bleed = rank >= 1 && inDangerZone(actor) && game.combat?.started
        && game.combat.combatant?.tokenId === token.id && a.checkGate(token, 'nuclear_first_attack');

    if (bleed && await a.consumeOncePerTurn(token, 'nuclear_first_attack')) {
        await dropBonuses(a, actor);
        const opts = { duration: 'indefinite', origin: token, consumption: { trigger: 'onDamage', evaluate: 'return true;' } };
        const rows = [{ val: '2', type: 'Heat' }];
        if (rank >= 2) rows.push({ val: '1d6', type: 'Energy' });
        await a.addGlobalBonus(actor, {
            id: BONUS_IDS[0],
            name: rank >= 2 ? 'Fusion Hemorrhage: +2 Heat, +1d6 Energy' : 'Aggressive Heat Bleed: +2 Heat',
            type: 'damage',
            damage: rows,
            rollTypes: ['damage']
        }, opts);
        if (rank >= 2) {
            await a.addGlobalBonus(actor, {
                id: BONUS_IDS[1],
                name: 'Fusion Hemorrhage: Energy',
                type: 'damage',
                damageMode: 'change_type',
                damage: [{ from: 'Kinetic', to: 'Energy' }, { from: 'Explosive', to: 'Energy' }],
                rollTypes: ['damage']
            }, opts);
        }
        await card(actor, rank >= 2 ? 'FUSION HEMORRHAGE' : 'AGGRESSIVE HEAT BLEED',
            rank >= 2
                ? `<b>${token.name}</b> is in the Danger Zone. This attack deals <b>Energy</b> instead of Kinetic or Explosive, with <b>+2 Heat</b> and <b>+1d6 Energy</b> bonus damage on a hit.`
                : `<b>${token.name}</b> is in the Danger Zone. This attack deals <b>+2 Heat</b> on a hit.`);
    }

    if (fuelRod && rank >= 3) {
        const h = actor.system.heat;
        const cleared = Math.min(4, h.value);
        await actor.update({ 'system.heat.value': h.value - cleared });
        await card(actor, 'FUEL ROD GUN', `<b>${token.name}</b> clears <b>${cleared} Heat</b> (On attack).`);
    }
}

export function registerNuclearCavalier(api) {
    api.registerDefaultGeneralReactions({
        'Nuclear Cavalier - Heat Bleed': {
            category: 'General',
            reactions: [
                {
                    comments: 'Nuclear Cavalier ranks 1-2 and the rank 3 Fuel Rod Gun: first attack in the Danger Zone / clear heat',
                    triggers: ['onAttack'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('nuclear'));
                        if (!t) return false;
                        const rank = Number(t.system?.curr_rank) || 1;
                        if (rank >= 3 && data.weapon?.system?.lid === 'la_talents_fuel_rod_gun') return true;
                        const combat = game.combat;
                        if (!combat?.started || combat.combatant?.tokenId !== reactorToken.id) return false;
                        const h = reactorToken.actor?.system?.heat;
                        if (!h || !(h.max > 0) || h.value < Math.floor(h.max / 2)) return false;
                        return a.checkGate(reactorToken, 'nuclear_first_attack');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await onFirstAttack(a, reactorToken, data);
                    }
                },
                {
                    comments: 'Nuclear Cavalier: a full miss drops the queued bonuses',
                    triggers: ['onMiss'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const hits = (data.flowState?.data?.hit_results ?? []).filter(h => h.hit).length;
                        if (hits > 0) return false;
                        const ids = ['nuclear-cavalier-heat-bleed', 'nuclear-cavalier-fusion-type', 'nuclear-cavalier-fusion-dmg'];
                        return a.getGlobalBonuses(reactorToken.actor).some(b => ids.includes(b?.id));
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await dropBonuses(a, reactorToken.actor);
                    }
                }
            ]
        }
    });

    console.info('la-talents | Nuclear Cavalier registered');
}
