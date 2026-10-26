// Siege Specialist rank 3, Collateral Damage: 1/round, when you crit a character or object with a Cannon, you may
// cause a Burst 2 explosion around the target. Characters in the area either drop Prone as a reaction, or take
// 2 Explosive damage and are knocked back 2 spaces from the center.
//  - Offered once the attack resolves. The area is every other character within 2 spaces of the target
//    (allies and you included, as the rules say "characters"); the target itself is the center and is not hit again.
//  - Each affected player picks their own option on a choice card. The Prone option spends their reaction, so it
//    is greyed out if they have none left.

const isCannon = (w) => !!w && w.type === 'mech_weapon'
    && String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() === 'CANNON';

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-burst"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

const controllerOf = (token) => game.users.find(u => u.active && !u.isGM && token.actor?.testUserPermission(u, 'OWNER'))?.id
    ?? game.users.activeGM?.id;

async function collateral(a, token, center) {
    const { confirmed } = await a.askCard({
        title: 'COLLATERAL DAMAGE',
        description: `Critical hit with a Cannon on <b>${center.name}</b>. Cause a <b>Burst 2</b> explosion around it? Characters in the area drop Prone as a reaction, or take 2 Explosive and are knocked back 2 spaces.`,
        yesText: 'Detonate',
        noText: 'Skip',
        owner: token,
        originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'siege_collateral'))) return;

    const area = canvas.tokens.placeables.filter(t => t.id !== center.id && t.actor
        && !t.document.hidden && a.getTokenDistance(center, t) <= 2);
    await card(token.actor, 'COLLATERAL DAMAGE',
        area.length ? `Burst 2 around <b>${center.name}</b>: ${area.map(t => t.name).join(', ')}.` : `Burst 2 around <b>${center.name}</b> catches nobody else.`);

    for (const t of area) {
        const canReact = a.hasReactionAvailable(t);
        const pick = await a.startChoiceCard({
            title: 'COLLATERAL DAMAGE',
            icon: 'fas fa-burst',
            description: `<b>${t.name}</b>: drop Prone as a reaction, or take 2 Explosive and be knocked back 2 spaces?`,
            originToken: center,
            userIdControl: controllerOf(t),
            choices: [
                {
                    text: 'Drop Prone (reaction)',
                    icon: 'fas fa-person-falling',
                    disabled: !canReact,
                    disabledReason: 'No reaction available',
                    callback: async () => {
                        await a.setReaction(t, false);
                        await a.applyEffectsToTokens({ tokens: [t], effectNames: ['prone'], note: 'Collateral Damage' });
                    }
                },
                {
                    text: 'Take 2 Explosive + knockback 2',
                    icon: 'fas fa-explosion',
                    callback: async () => {
                        await a.executeDamageRoll(token, [t], 2, 'Explosive', 'Collateral Damage');
                        await a.knockBackToken([t], 2, {
                            triggeringToken: center,
                            actionName: 'Collateral Damage',
                            title: 'COLLATERAL DAMAGE: KNOCKBACK',
                            description: 'Knocked back 2 spaces from the center of the explosion.'
                        });
                    }
                }
            ]
        });
        if (pick == null) continue;
    }
}

export function registerCollateralDamage(api) {
    api.registerDefaultGeneralReactions({
        'Siege Specialist - Collateral Damage': {
            category: 'General',
            reactions: [
                {
                    comments: 'Siege Specialist rank 3: Collateral Damage on a Cannon critical hit',
                    triggers: ['onHit'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('siege'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'CANNON') return false;
                        if (!(data.targets ?? []).some(x => x?.crit)) return false;
                        return a.checkGate(reactorToken, 'siege_collateral');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const crit = (data.targets ?? []).find(x => x?.crit)?.target;
                        if (!crit) return;
                        const run = () => collateral(a, reactorToken, crit);
                        if (!a.afterFlow(data, run)) await run();
                    }
                }
            ]
        }
    });
    console.info('la-talents | Collateral Damage registered');
}

export { isCannon };
