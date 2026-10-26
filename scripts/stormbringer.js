// Stormbringer talent, ranks 1-3 (Launchers). [beta]
//  Rank 1, Seismic Deluge: 1/round, a successful Launcher attack that consumed Lock On may also knock the target Prone
//    (offered after the attack).
//  Rank 2, Stormbending: 1/round, when you hit with a Launcher you choose:
//    Lightning: the target makes a Hull save or is knocked back 3 spaces away from you, and then you are knocked back
//      3 spaces away from them (the recoil happens whether or not the save passes).
//    Thunder: every other character within Burst 2 of the target makes an Agility save or is knocked back 1 space away
//      from the target. The target itself is unaffected.
//  Rank 3, Torrent: the Torrent Die (d6, starts at 6, an actor flag). Each Stormbending lowers it by 1 (minimum 1).
//    At 1, the Massive Attack action resets it to 6: pick a character within Range 15; Agility save or 2d6 Explosive,
//    Stunned until the end of their next turn and Prone; on a pass they take half (rounded up) and are Prone only.
//    Full Repair resets the die. Rest: game.modules.get('la-talents').api.resetTorrentDie(actor)
//    The talent sheet's own Torrent counter is not kept in step: the chat cards and the flag are the truth.

import { talentRank, card, wType, hitResults, characters, flagNum } from './common.js';

const KEY = 'stormbringer';
const FLAG_DIE = 'torrentDie';

export const stormbringerRank = (actor) => talentRank(actor, KEY);

const getDie = (a, actor) => Math.min(6, Math.max(1, flagNum(a, actor, FLAG_DIE, 6)));

export async function resetTorrentDie(a, actor, why) {
    const had = getDie(a, actor);
    await a.addActorFlags(actor, { [FLAG_DIE]: 6 });
    if (had !== 6 && why) await card(actor, 'TORRENT DIE', `${why} The die resets to <b>6</b>.`, 'cloud-bolt');
}

async function lowerDie(a, token) {
    const before = getDie(a, token.actor);
    if (before <= 1) return;
    const now = before - 1;
    await a.addActorFlags(token.actor, { [FLAG_DIE]: now });
    await card(token.actor, 'TORRENT DIE', now === 1 ? `The die falls to <b>1</b>. <b>Massive Attack</b> is ready.` : `The die falls to <b>${now}</b>.`, 'cloud-bolt');
}

async function deluge(a, token, target) {
    const { confirmed } = await a.askCard({
        title: 'SEISMIC DELUGE',
        description: `Launcher hit with Lock On consumed. Also knock <b>${target.name}</b> Prone?`,
        yesText: 'Knock Prone', noText: 'No', owner: token, originToken: token, relatedToken: target
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'stormbringer_deluge'))) return;
    await a.applyEffectsToTokens({ tokens: [target], effectNames: ['prone'], note: 'Seismic Deluge' });
}

async function stormbend(a, token, target) {
    const pick = await a.startChoiceCard({
        title: 'STORMBENDING', icon: 'fas fa-cloud-bolt',
        description: `Launcher hit on <b>${target.name}</b>. Choose an effect (1/round).`,
        originToken: token, relatedToken: target, userIdControl: a.getTokenOwnerUserId(token),
        choices: [
            { text: 'Lightning: Hull save or knocked back 3; you recoil 3', icon: 'fas fa-bolt', callback: async () => {} },
            { text: 'Thunder: Burst 2, Agility save or knocked back 1', icon: 'fas fa-cloud-bolt', callback: async () => {} },
            { text: 'Neither', icon: 'fas fa-xmark', callback: async () => {} }
        ]
    });
    if (pick?.choiceIdx !== 0 && pick?.choiceIdx !== 1) return;
    if (!(await a.consumeOncePerRound(token, 'stormbringer_bend'))) return;

    if (pick.choiceIdx === 0) {
        const { results } = await a.executeForceCheck('HULL', [target], { saveVs: token });
        const failed = (results ?? []).some(r => r.completed && !r.passed);
        if (failed) await a.knockBackToken([target], 3, { triggeringToken: token, actionName: 'Lightning', title: 'LIGHTNING: KNOCKBACK', description: 'Knocked back 3 spaces away from the shooter.' });
        await a.knockBackToken([token], 3, { triggeringToken: target, actionName: 'Lightning', title: 'LIGHTNING: RECOIL', description: 'The force of firing knocks you back 3 spaces, away from the direction of fire.' });
        await card(token.actor, 'LIGHTNING', failed ? `<b>${target.name}</b> fails the Hull save and is thrown back 3. <b>${token.name}</b> recoils 3.` : `<b>${target.name}</b> holds. <b>${token.name}</b> recoils 3.`, 'bolt');
    } else {
        const near = characters(a, target, 2);
        if (near.length) {
            const { results } = await a.executeForceCheck('AGILITY', near, { saveVs: token });
            const failed = (results ?? []).filter(r => r.completed && !r.passed).map(r => r.token);
            if (failed.length) await a.knockBackToken(failed, 1, { triggeringToken: target, actionName: 'Thunder', title: 'THUNDER: KNOCKBACK', description: 'Knocked back 1 space away from the target.' });
            await card(token.actor, 'THUNDER', failed.length ? `${failed.map(t => t.name).join(', ')} fail the Agility save and are knocked back 1.` : 'Everyone in the burst passes the Agility save.', 'cloud-bolt');
        } else {
            await card(token.actor, 'THUNDER', 'Nobody else is within Burst 2.', 'cloud-bolt');
        }
    }
    if (stormbringerRank(token.actor) >= 3) await lowerDie(a, token);
}

async function massive(a, token) {
    if (getDie(a, token.actor) !== 1) return ui.notifications.warn(`Massive Attack: the Torrent Die is at ${getDie(a, token.actor)}, it must be at 1.`);
    const reach = characters(a, token, 15);
    const picked = await a.chooseToken(token, { range: 15, count: 1, includeSelf: false, selection: reach, title: 'MASSIVE ATTACK', description: 'Choose a character within Range 15 and line of sight.' });
    const target = picked?.[0];
    if (!target) return;
    await a.addActorFlags(token.actor, { [FLAG_DIE]: 6 });
    const { results } = await a.executeForceCheck('AGILITY', [target], { saveVs: token });
    const failed = (results ?? []).some(r => r.completed && !r.passed);
    const roll = await new Roll('2d6').evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: token.actor }), flavor: 'Massive Attack' });
    const dmg = failed ? roll.total : Math.ceil(roll.total / 2);
    await a.executeDamageRoll(token, [target], dmg, 'Explosive', 'Massive Attack');
    await a.applyEffectsToTokens({ tokens: [target], effectNames: failed ? ['prone', 'stunned'] : ['prone'], note: 'Massive Attack', duration: { label: 'end', turns: 1, rounds: 0 } });
    await card(token.actor, 'MASSIVE ATTACK', failed
        ? `<b>${target.name}</b> fails the Agility save: <b>${dmg} Explosive</b>, <b>Stunned</b> until the end of their next turn, and <b>Prone</b>. The die resets to 6.`
        : `<b>${target.name}</b> passes: <b>${dmg} Explosive</b> (half) and <b>Prone</b>. The die resets to 6.`, 'cloud-bolt');
}

export function registerStormbringer(api) {
    api.registerDefaultGeneralReactions({
        'Stormbringer': {
            category: 'General',
            reactions: [
                {
                    comments: 'Stormbringer ranks 1-2: Seismic Deluge and Stormbending after a Launcher hit',
                    triggers: ['onHit'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('stormbringer'));
                        if (!t) return false;
                        const w = data.weapon;
                        if (!w || w.type !== 'mech_weapon' || String(w.system?.active_profile?.type ?? w.system?.type ?? '').toUpperCase() !== 'LAUNCHER') return false;
                        return (data.flowState?.data?.hit_results ?? []).some(h => h?.hit);
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const hits = hitResults(data).filter(h => h?.hit && h.target);
                        const rank = stormbringerRank(reactorToken.actor);
                        const run = async () => {
                            const lock = hits.find(h => h.usedLockOn);
                            if (lock && a.checkGate(reactorToken, 'stormbringer_deluge')) await deluge(a, reactorToken, lock.target);
                            if (rank >= 2 && a.checkGate(reactorToken, 'stormbringer_bend')) await stormbend(a, reactorToken, hits[0].target);
                        };
                        if (!a.afterFlow(data, run)) await run();
                    }
                },
                {
                    comments: 'Stormbringer rank 3: the Massive Attack action',
                    triggers: ['onActivation'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('stormbringer'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 3) return false;
                        return String(data.actionName ?? '').toLowerCase() === 'massive attack';
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await massive(a, reactorToken);
                    }
                },
                {
                    comments: 'Stormbringer rank 3: a Full Repair resets the die',
                    triggers: ['onFullRepair'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    checkReaction: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('stormbringer'));
                        return !!t && (Number(t.system?.curr_rank) || 1) >= 3;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await resetTorrentDie(a, reactorToken.actor, 'Full Repair.');
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), resetTorrentDie: (actor) => resetTorrentDie(api, actor?.actor ?? actor, 'Rest.') };
    console.info('la-talents | Stormbringer registered');
}

export { wType };
