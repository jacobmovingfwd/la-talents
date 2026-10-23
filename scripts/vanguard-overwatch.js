// Vanguard rank 3, Semper Vigilo: "You may attack with Overwatch using CQB weapons when hostile characters
// enter, leave, or exit spaces within your Threat, no matter whether they started their movement there."
//
// lancer-automations' own Overwatch already covers a hostile that STARTS its move inside your Threat.
// This adds a second reaction, "Semper Vigilo", that covers the rest: a hostile that starts outside your
// Threat but whose path enters it. It works like Overwatch v2 (pauses the move and asks the owner), and
// the attack is a Skirmish limited to CQB weapons.
//
// Only mechs whose pilot has Vanguard at rank 3 can trigger it.

export function registerSemperVigilo(api) {
    api.registerDefaultGeneralReactions({
        'Semper Vigilo': {
            category: 'General',
            reactions: [
                // 1. A hostile's path enters your Threat: pause the move and offer the Overwatch.
                {
                    comments: 'Vanguard rank 3: Overwatch on a path that enters Threat',
                    triggers: ['onPreMove'],
                    triggerDescription: 'A hostile character moves into your THREAT (Vanguard, Semper Vigilo)',
                    effectDescription: 'Trigger OVERWATCH with a CQB weapon against that character.',
                    triggerSelf: false,
                    triggerOther: true,
                    outOfCombat: false,
                    actionType: 'Reaction',
                    frequency: 'Other',
                    isReaction: true,
                    checkReaction: true,
                    requireCanProvoke: true,
                    autoActivate: true,
                    awaitActivationCompletion: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, triggerData, reactorToken, item, activationName, a) {
                        const mover = triggerData.triggeringToken;
                        if (!mover || triggerData.moveInfo?.isInvoluntary) return false;
                        if (a.isFriendly(reactorToken, mover)) return false;

                        const actor = reactorToken.actor;
                        const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && i.system?.lid === 't_vanguard');
                        if (!talent || (Number(talent.system?.curr_rank) || 1) < 3) return false;

                        const threat = a.getMaxWeaponRanges_WithBonus(reactorToken).Threat || 1;
                        // Started inside Threat: the normal Overwatch handles it.
                        if (a.getTokenDistance(reactorToken, mover) <= threat) return false;

                        // Edge-to-edge distance from a path position to the reactor.
                        const unit = canvas.scene.grid.distance || 1;
                        const reach = (t) => Math.max(0, (Math.max(t.document.width, t.document.height) - 1) / 2);
                        const center = reactorToken.center;
                        const hexes = (triggerData.moveInfo?.pathHexes ?? []).filter(h => !h.isHistory);
                        return hexes.some(h => {
                            const d = canvas.grid.measurePath([{ x: h.cx, y: h.cy }, center]).distance / unit;
                            return Math.round(d - reach(mover) - reach(reactorToken)) <= threat;
                        });
                    },
                    activationCode: async function (triggerType, triggerData, reactorToken, item, activationName, a) {
                        const mover = triggerData.triggeringToken;
                        if (!mover) return;
                        let responderIds = [];
                        const preConfirm = async () => {
                            const result = await a.startChoiceCard({
                                title: 'SEMPER VIGILO',
                                icon: a.getActivationIcon('reaction'),
                                description: `<b>${mover.name}</b> is about to enter <b>${reactorToken.name}</b>'s Threat. Fire an Overwatch with a CQB weapon?`,
                                originToken: reactorToken,
                                relatedToken: mover,
                                userIdControl: a.getTokenOwnerUserId(reactorToken),
                                choices: [
                                    { text: 'Fire', icon: 'fas fa-crosshairs', callback: async () => {} },
                                    { text: 'Let pass', icon: 'fas fa-times', callback: async () => {} }
                                ]
                            });
                            responderIds = result?.responderIds ?? [];
                            if (result?.choiceIdx === 0) {
                                await triggerData.startRelatedFlowToReactor(responderIds[0], { moverTokenId: mover.id });
                                await a.startChoiceCard({
                                    title: `WAITING: ${reactorToken.name.toUpperCase()}`,
                                    description: `${reactorToken.name} is resolving Semper Vigilo against ${mover.name}.`,
                                    originToken: reactorToken,
                                    icon: a.getActivationIcon('reaction'),
                                    relatedToken: mover,
                                    userIdControl: null,
                                    choices: [{ text: 'Confirm', icon: 'fas fa-check', callback: async () => {} }]
                                });
                            }
                            return false;
                        };
                        triggerData.cancelTriggeredMove?.(
                            `<b>${reactorToken.name}</b> triggers Semper Vigilo against <b>${mover.name}</b>.`,
                            true,
                            a.getTokenOwnerUserId(mover),
                            preConfirm,
                            async () => {},
                            { originToken: reactorToken, relatedToken: mover }
                        );
                    }
                },
                // 2. The Overwatch itself: a reaction Skirmish, CQB weapons only.
                {
                    comments: 'Vanguard rank 3: the Skirmish',
                    triggers: ['onActivation'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    actionType: 'Reaction',
                    frequency: 'Other',
                    autoActivate: true,
                    onlyOnSourceMatch: true,
                    activationType: 'code',
                    activationMode: 'instead',
                    activationCode: async function (triggerType, triggerData, reactorToken, item, activationName, a) {
                        const moverId = triggerData.extraData?.moverTokenId ?? null;
                        const mover = moverId ? canvas.tokens.get(moverId) ?? null : null;
                        const weaponFilter = (weapon) => {
                            const type = weapon.system?.active_profile?.type ?? weapon.system?.type;
                            return String(type ?? '').toUpperCase() === 'CQB';
                        };
                        await a.executeSkirmish(reactorToken.actor, null, mover, weaponFilter, { noFX: true, asReaction: true });
                    }
                }
            ]
        }
    });
}
