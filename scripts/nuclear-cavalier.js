// Nuclear Cavalier talent. Built so far: rank 1 only.
//  Rank 1, Aggressive Heat Bleed: the first attack roll you make on your turn while in the Danger Zone deals
//    +2 Heat on a hit. Danger Zone = heat at or above half your Heat Cap (Lancer Automations' own definition).
//    The attack uses up the once-per-turn use whether or not it hits; the +2 Heat bonus damage rides on that
//    attack's damage roll and is dropped if every target is missed.
//  Rank 2 (Fusion Hemorrhage) and rank 3 (Fuel Rod Gun) are not built yet.

const BONUS_ID = 'nuclear-cavalier-heat-bleed';

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

export function registerNuclearCavalier(api) {
    api.registerDefaultGeneralReactions({
        'Nuclear Cavalier - Aggressive Heat Bleed': {
            category: 'General',
            reactions: [
                {
                    comments: 'Nuclear Cavalier rank 1: queue +2 Heat on the first attack of the turn in the Danger Zone',
                    triggers: ['onAttack'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: false,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('nuclear'));
                        if (!t) return false;
                        const combat = game.combat;
                        if (!combat?.started || combat.combatant?.tokenId !== reactorToken.id) return false;
                        const h = reactorToken.actor?.system?.heat;
                        if (!h || !(h.max > 0) || h.value < Math.floor(h.max / 2)) return false;
                        return a.checkGate(reactorToken, 'nuclear_first_attack');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        if (!(await a.consumeOncePerTurn(reactorToken, 'nuclear_first_attack'))) return;
                        await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === BONUS_ID);
                        await a.addGlobalBonus(reactorToken.actor, {
                            id: BONUS_ID,
                            name: 'Aggressive Heat Bleed: +2 Heat',
                            type: 'damage',
                            damage: [{ val: '2', type: 'Heat' }],
                            rollTypes: ['damage']
                        }, {
                            duration: 'indefinite',
                            origin: reactorToken,
                            consumption: { trigger: 'onDamage', evaluate: 'return true;' }
                        });
                        await card(reactorToken.actor, 'AGGRESSIVE HEAT BLEED',
                            `<b>${reactorToken.name}</b> is in the Danger Zone. This attack deals <b>+2 Heat</b> on a hit.`);
                    }
                },
                {
                    comments: 'Nuclear Cavalier rank 1: a full miss drops the queued Heat',
                    triggers: ['onMiss'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: false,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const hits = (data.flowState?.data?.hit_results ?? []).filter(h => h.hit).length;
                        if (hits > 0) return false;
                        return a.getGlobalBonuses(reactorToken.actor).some(b => b?.id === 'nuclear-cavalier-heat-bleed');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.removeGlobalBonus(reactorToken.actor, (b) => b?.id === BONUS_ID);
                    }
                }
            ]
        }
    });

    console.info('la-talents | Nuclear Cavalier registered');
}
