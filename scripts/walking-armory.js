// Walking Armory talent (Ammo Case): once per turn, when you attack with a MAIN ranged weapon,
// you may expend charges to apply one ammo type to the attack.
//   THUMPER: Knockback 1, damage becomes Explosive.
//   SHOCK:   damage becomes Energy; one targeted character is chosen, and characters adjacent to it
//            take 1 AP Energy damage, hit or miss.
//   MAG:     Arcing, damage becomes Kinetic.
//   Rank 2 (Expanded Portfolio), each costs 2 charges:
//   HELLFIRE: damage becomes Energy, and any bonus damage is dealt as Burn.
//   JAGER:    Knockback 2, damage becomes Explosive; one character hit (your choice) must pass a HULL
//             save or be knocked Prone.
//   SABOT:    AP, damage becomes Kinetic.
//   Rank 3 (Efficiency): a critical hit with Ammo Case ammunition refunds the charges. With several
//   targets only the first attack roll counts.
//
// Flow:
//   1. Pick an ammo in the HUD (Systems > Ammo Case > Ammo). This only records the choice. No charge is
//      spent, and picking another one replaces it, as often as you like.
//   2. Attack with a MAIN ranged weapon. The charge is spent and the once-per-turn limit is used on the
//      attack itself, hit or miss.
//   3. The ammo's changes are queued for that attack's damage roll and removed once it rolls (or if the
//      whole attack missed, or at the end of your turn).

const AMMO_CASE_LID_PREFIX = 'ms_walking_armory';
const GATE_KEY = 'walking_armory_ammo';
const FLAG = 'walkingArmoryAmmo';
const BONUS_PREFIX = 'walking-armory';

// `type` is the damage type the attack is converted to; `tag` is an extra weapon tag for the attack.
// `cost` is the charges spent per attack.
const AMMO = {
    thumper: { label: 'Thumper', type: 'Explosive', cost: 1, tag: { id: 'tg_knockback', name: 'Knockback', val: 1 },
        effect: 'The attack gains <b>KNOCKBACK 1</b> and deals <b>Explosive</b> damage.' },
    shock:   { label: 'Shock',   type: 'Energy', cost: 1,
        effect: 'The attack deals <b>Energy</b> damage. Choose one character targeted by your attack; adjacent characters take <b>1 AP Energy</b> damage, whether the result is a hit or miss.' },
    mag:     { label: 'Mag',     type: 'Kinetic', cost: 1, tag: { id: 'tg_arcing', name: 'Arcing', val: 0 },
        effect: 'The attack gains <b>ARCING</b> and deals <b>Kinetic</b> damage.' },
    hellfire: { label: 'Hellfire', type: 'Energy', cost: 2, burnBonus: true,
        effect: 'Costs <b>2 charges</b>. The attack deals <b>Energy</b> damage and deals any bonus damage as <b>Burn</b>.' },
    jager:   { label: 'Jäger',   type: 'Explosive', cost: 2, tag: { id: 'tg_knockback', name: 'Knockback', val: 2 }, prone: true,
        effect: 'Costs <b>2 charges</b>. The attack gains <b>KNOCKBACK 2</b> and deals <b>Explosive</b> damage. One character hit by the attack (your choice) must succeed on a <b>HULL</b> save or be knocked <b>PRONE</b>.' },
    sabot:   { label: 'Sabot',   type: 'Kinetic', cost: 2, ap: true,
        effect: 'Costs <b>2 charges</b>. The attack gains <b>AP</b> and deals <b>Kinetic</b> damage.' }
};

function ammoKey(name) {
    // Accents off, so "Jäger" matches "jager".
    const n = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return Object.keys(AMMO).find(k => n.includes(k)) ?? null;
}

const isArmoryCase = (item) => String(item?.system?.lid ?? '').startsWith(AMMO_CASE_LID_PREFIX);

// The upgraded case may sit next to the rank 1 case, so take the highest numbered one.
const lidRank = (item) => Number(String(item?.system?.lid ?? '').match(/(\d+)$/)?.[1]) || 0;
function findArmoryCase(actor) {
    return actor.items.filter(i => i.type === 'mech_system' && isArmoryCase(i))
        .sort((x, y) => lidRank(y) - lidRank(x))[0] ?? null;
}

// Efficiency is rank 3: either the case itself is the rank 3 one or the pilot's talent is at rank 3.
function hasEfficiency(actor, armoryCase) {
    const talent = actor.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').includes('walking_armory'));
    const talentRank = Number(talent?.system?.curr_rank) || 0;
    return Math.max(lidRank(armoryCase), talentRank) >= 3;
}

// MAIN size and at least one Range-type range on the active profile.
function isMainRanged(weapon) {
    if (!weapon || weapon.type !== 'mech_weapon') return false;
    if (String(weapon.system?.size ?? '').toLowerCase() !== 'main') return false;
    const ranges = weapon.system?.active_profile?.range ?? [];
    return ranges.some(r => String(r.type).toLowerCase() === 'range');
}

function tokenFor(actor) {
    return actor?.token?.object ?? canvas.tokens.get(actor?.token?.id) ?? actor?.getActiveTokens()?.[0] ?? null;
}

const isArmoryBonus = (b) => String(b?.id ?? '').startsWith(BONUS_PREFIX);
const isArmoryTagBonus = (b) => isArmoryBonus(b) && String(b.id).endsWith('-tag');

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="cci cci-ammo i--m"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

export function registerWalkingArmory(api) {
    const flowSteps = game.lancer?.flowSteps;
    const origDeduct = flowSteps?.get('lancer-automations:deductAmmoCost');
    const origPrint = flowSteps?.get('lancer-automations:printAmmoCard');
    if (!flowSteps || !origDeduct || !origPrint) {
        console.warn('la-talents | UseAmmoFlow steps not found, Walking Armory automation not registered');
        return;
    }

    // Knockback only moves targets that were hit. With Reliable, the damage flow also lists the missed
    // targets (they take Reliable damage), and lancer-automations would offer to knock those back too.
    const origKnockback = flowSteps.get('lancer-automations:knockbackDamage');
    if (origKnockback) {
        flowSteps.set('lancer-automations:knockbackDamage', async function (state, options) {
            const all = state.data?.targets;
            if (!Array.isArray(all)) return origKnockback(state, options);
            state.data.targets = all.filter(t => t.hit || t.crit);
            try { return await origKnockback(state, options); }
            finally { state.data.targets = all; }
        });
    }

    // Hellfire deals any bonus damage as Burn. The bonus damage lists are final by the time the
    // damage rolls, so convert them just before.
    for (const stepName of ['rollNormalDamage', 'rollCritDamage']) {
        const origStep = flowSteps.get(stepName);
        if (!origStep) continue;
        flowSteps.set(stepName, async function (state, options) {
            try {
                const hellfire = state.actor && state.item
                    && api.getGlobalBonuses(state.actor).some(b => b.id === `${BONUS_PREFIX}-hellfire-damage`);
                if (hellfire && state.data) {
                    const toBurn = (list) => { for (const d of list ?? []) d.type = 'Burn'; };
                    toBurn(state.data.bonus_damage);
                    for (const t of state.data.damage_hud_data?.targets ?? []) toBurn(t.bonusDamage);
                }
            } catch (err) {
                console.warn('la-talents | Hellfire bonus damage conversion failed', err);
            }
            return origStep(state, options);
        });
    }

    // Picking ammo from the Ammo Case: do not spend the charge now.
    flowSteps.set('lancer-automations:deductAmmoCost', async function (state, options) {
        if (isArmoryCase(state.item) && ammoKey(state.data?.ammoName)) return true;
        return origDeduct(state, options);
    });

    const removeArmoryBonuses = (actor) => api.removeGlobalBonus(actor, isArmoryBonus);

    // Picking ammo: record the choice (replacing any earlier one) and print our own card.
    flowSteps.set('lancer-automations:printAmmoCard', async function (state, options) {
        const key = isArmoryCase(state.item) ? ammoKey(state.data?.ammoName) : null;
        if (!key) return origPrint(state, options);

        const actor = state.actor;
        const token = tokenFor(actor);
        if (token && !api.checkGate(token, GATE_KEY)) {
            ui.notifications.warn('Walking Armory: ammo already used this turn.');
            return false;
        }
        // Drop anything left over from an earlier attack (e.g. a Thumper tag that never got rolled).
        await removeArmoryBonuses(actor);
        await api.addActorFlags(actor, { [FLAG]: key });
        await card(actor, `${state.item.name} — ${AMMO[key].label}`,
            `${AMMO[key].effect}<br><br><i>Loaded for your next MAIN ranged weapon attack this turn. The charge is spent when you attack. Pick another ammo to change it.</i>`);
        console.info(`la-talents | Walking Armory ammo selected: ${key}`);
        return true;
    });

    api.registerDefaultGeneralReactions({
        // The attack: spend the charge, apply the ammo to the damage roll, run Shock's splash.
        'Walking Armory - Attack': {
            triggers: ['onAttack'],
            triggerSelf: true,
            triggerOther: false,
            outOfCombat: true,
            autoActivate: true,
            activationType: 'code',
            activationMode: 'instead', // run our code only, no reaction card in chat
            evaluate: (triggerType, data, reactor) => {
                const a = game.modules.get('lancer-automations')?.api;
                if (!a || !isMainRanged(data.weapon)) return false;
                if (!AMMO[a.getActorFlags(reactor.actor, FLAG)]) return false;
                return a.checkGate(reactor, GATE_KEY);
            },
            activationCode: async (triggerType, data, reactor, item, name, a) => {
                const actor = reactor.actor;
                const key = a.getActorFlags(actor, FLAG);
                const def = AMMO[key];
                if (!def) return;

                const armoryCase = findArmoryCase(actor);
                const cost = def.cost ?? 1;
                if (!armoryCase || (armoryCase.system?.uses?.value ?? 0) < cost) {
                    ui.notifications.warn(`Walking Armory: ${def.label} needs ${cost} Ammo Case charge${cost > 1 ? 's' : ''}.`);
                    await a.removeActorFlags(actor, { [FLAG]: true });
                    return;
                }

                // Once per turn, hit or miss. Failing the gate means something else already used it.
                if (!(await a.consumeOncePerTurn(reactor, GATE_KEY))) return;
                await a.consumeItemResource(armoryCase, 'uses', cost);
                await a.removeActorFlags(actor, { [FLAG]: true });
                await card(actor, `${armoryCase.name} — ${def.label}`, `Fired with ${data.weapon.name}. ${cost} charge${cost > 1 ? 's' : ''} expended.`);

                // Remember what this attack spent, for the on-hit step (Efficiency refund, Jäger's save).
                if (data.flowState) {
                    data.flowState.la_extraData = data.flowState.la_extraData || {};
                    data.flowState.la_extraData.walkingArmory = { key, cost, caseId: armoryCase.id };
                }

                // Queue the changes for this attack's damage roll. Unique names: the module refuses duplicates.
                await removeArmoryBonuses(actor);
                // No shared groupId on purpose: the module deletes every member of a group when one is
                // removed, which would take the damage-type bonus with the tag bonus on a Reliable miss.
                const options = {
                    duration: 'end',
                    durationTurns: 0,
                    origin: reactor,
                    // Only the weapon's own damage roll uses the bonus up. Shock's splash is a weaponless
                    // damage flow by the same actor and must not consume it.
                    consumption: { trigger: 'onDamage', evaluate: 'return !!triggerData.weapon;' }
                };
                // Self-contained on purpose: lancer-automations serializes these functions.
                const condition = (st) => {
                    const w = st?.item;
                    if (!w || w.type !== 'mech_weapon') return false;
                    if (String(w.system?.size ?? '').toLowerCase() !== 'main') return false;
                    return (w.system?.active_profile?.range ?? []).some(r => String(r.type).toLowerCase() === 'range');
                };

                await a.addGlobalBonus(actor, {
                    id: `${BONUS_PREFIX}-${key}-damage`,
                    name: `Walking Armory (${def.label}): ${def.type} damage`,
                    type: 'damage',
                    damageMode: 'change_type',
                    damage: [{ from: 'all', to: def.type }],
                    rollTypes: ['damage'],
                    condition
                }, options);

                // Sabot: armor piercing on the damage roll.
                if (def.ap) {
                    await a.addGlobalBonus(actor, {
                        id: `${BONUS_PREFIX}-${key}-ap`,
                        name: `Walking Armory (${def.label}): AP`,
                        type: 'target_modifier',
                        subtype: 'ap',
                        condition
                    }, options);
                }

                if (def.tag) {
                    await a.addGlobalBonus(actor, {
                        id: `${BONUS_PREFIX}-${key}-tag`,
                        name: `Walking Armory (${def.label}): ${def.tag.name}`,
                        type: 'tag',
                        tagId: def.tag.id,
                        tagName: def.tag.name,
                        tagMode: 'add',
                        val: def.tag.val,
                        rollTypes: ['damage'],
                        condition
                    }, options);
                }

                // Shock: choose one targeted character; those adjacent to it take 1 AP Energy.
                if (key === 'shock') {
                    const targets = data.targets ?? [];
                    if (!targets.length) return;
                    let chosen = targets[0];
                    if (targets.length > 1) {
                        const picked = await a.chooseToken(reactor, {
                            title: 'SHOCK: CHOOSE TARGET',
                            selection: targets,
                            includeSelf: false,
                            count: 1
                        });
                        chosen = picked?.[0];
                        if (!chosen) return;
                    }
                    const adjacent = canvas.tokens.placeables.filter(t =>
                        t.id !== chosen.id && t.actor && a.getTokenDistance(chosen, t) <= 1);
                    if (!adjacent.length) return;
                    // After the attack's own flow, so the cards do not interleave.
                    a.afterFlow(data, () => a.executeDamageRoll(reactor, adjacent, 1, 'Energy', 'Shock Ammo', { ap: true }));
                }
            }
        },

        // On a hit: Jäger's HULL save, and Efficiency (critical hit refunds the charges).
        'Walking Armory - On hit': {
            triggers: ['onHit'],
            triggerSelf: true,
            triggerOther: false,
            outOfCombat: true,
            autoActivate: true,
            activationType: 'code',
            activationMode: 'instead', // run our code only, no reaction card in chat
            evaluate: (triggerType, data, reactor) => !!data.flowState?.la_extraData?.walkingArmory,
            activationCode: async (triggerType, data, reactor, item, name, a) => {
                const actor = reactor.actor;
                const used = data.flowState.la_extraData.walkingArmory;
                const def = AMMO[used.key];
                if (!def) return;
                const armoryCase = actor.items.get(used.caseId);

                // Efficiency: only the first attack roll counts when there are several targets.
                const first = data.flowState.data?.hit_results?.[0];
                if (armoryCase && first?.crit && hasEfficiency(actor, armoryCase)) {
                    await a.rechargeItemResource(armoryCase, 'uses', used.cost);
                    await card(actor, `${armoryCase.name} — Efficiency`, `Critical hit: ${used.cost} charge${used.cost > 1 ? 's' : ''} refunded.`);
                }

                // Jäger: one character hit (your choice) must pass a HULL save or be knocked Prone.
                if (def.prone) {
                    const hit = (data.targets ?? []).map(t => t.target).filter(Boolean);
                    if (!hit.length) return;
                    let victim = hit[0];
                    if (hit.length > 1) {
                        const picked = await a.chooseToken(reactor, {
                            title: 'JÄGER: CHOOSE TARGET',
                            selection: hit,
                            includeSelf: false,
                            count: 1
                        });
                        victim = picked?.[0];
                        if (!victim) return;
                    }
                    const check = await a.executeForceCheck('HULL', [victim], { saveVs: reactor, title: 'Jäger HULL save' });
                    const result = check?.results?.[0];
                    if (result?.completed && !result.passed) {
                        await a.applyEffectsToTokens({ tokens: [victim], effectNames: ['prone'], note: 'Jäger ammunition' });
                    }
                }
            }
        },

        // Every target missed: drop the queued changes now. With Reliable a damage roll still follows, so only the tag goes.
        'Walking Armory - Cleanup on miss': {
            triggers: ['onMiss'],
            triggerSelf: true,
            triggerOther: false,
            outOfCombat: true,
            autoActivate: true,
            activationType: 'code',
            activationMode: 'instead', // run our code only, no reaction card in chat
            evaluate: (triggerType, data, reactor) => {
                const a = game.modules.get('lancer-automations')?.api;
                if (!a || !isMainRanged(data.weapon)) return false;
                const hits = (data.flowState?.data?.hit_results ?? []).filter(h => h.hit).length;
                if (hits > 0) return false;
                return a.getGlobalBonuses(reactor.actor).some(isArmoryBonus);
            },
            activationCode: async (triggerType, data, reactor, item, name, a) => {
                // Reliable damage inherits the base damage type (and non-hit tags) but not hit-only tags like
                // Knockback. So with Reliable keep the damage-type change and drop only the tag bonus; without
                // it no damage roll follows, so drop everything. hasTag reads the weapon's active profile.
                const reliable = await a.hasTag(data.weapon, 'reliable', reactor.actor);
                console.info(`la-talents | full miss with ${data.weapon?.name}, Reliable: ${reliable}`);
                await a.removeGlobalBonus(reactor.actor, reliable ? isArmoryTagBonus : isArmoryBonus);
            }
        },

        // A choice or queued change should not outlive the turn it was made on.
        'Walking Armory - End of turn': {
            triggers: ['onTurnEnd'],
            triggerSelf: true,
            triggerOther: false,
            autoActivate: true,
            activationType: 'code',
            activationMode: 'instead', // run our code only, no reaction card in chat
            evaluate: (triggerType, data, reactor) => {
                const a = game.modules.get('lancer-automations')?.api;
                return !!a && (!!a.getActorFlags(reactor.actor, FLAG) || a.getGlobalBonuses(reactor.actor).some(isArmoryBonus));
            },
            activationCode: async (triggerType, data, reactor, item, name, a) => {
                await a.removeActorFlags(reactor.actor, { [FLAG]: true });
                await removeArmoryBonuses(reactor.actor);
            }
        }
    });

    console.info('la-talents | Walking Armory registered');
}
