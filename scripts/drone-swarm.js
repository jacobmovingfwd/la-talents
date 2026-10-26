// Drone Commander ranks 2 and 3 (rank 1, Shepherd, is in drone-commander.js).
//  Rank 2, Energized Swarm: 1/round, when you make an attack that consumes Lock On, your Drones emit a pulse:
//    characters of your choice within Burst 1 of each Drone take 1d6 Energy. Each character is affected by only one
//    Drone's pulse, so every character in reach of at least one Drone takes 1d6 once. Offered after the attack roll;
//    hostile characters are pre-ticked on the picker, you can tick or untick anyone else.
//  Rank 3, Invigorate: a quick action, a macro:
//      game.modules.get('la-talents').api.invigorate()          (uses the selected token)
//    Pulse an allied character (Drones included) within Range 3, drawing a Line; extend to another ally within
//    Range 3 of the last one, and so on, never the same character twice. Allies who were pulse targets or sit on the
//    Line's path gain 4 Overshield (it doesn't stack: the higher value stays, and Deployables have no Overshield
//    track so they are named in chat instead); hostile characters on the path take 2 Energy.
//    The "Energy: 2" cost in the rules text is not deducted: nothing in the sheet says what it spends. Adjust by hand.
//    The Line is the straight segments between the chosen allies; a character is "in the path" if the segment passes
//    through their space (sampled four times per grid square).

import { droneRank, isDrone, ownedBy, tokenOf } from './drone-commander.js';

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-satellite-dish"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

const isCharacter = (t) => !!t?.actor && !t.document.hidden && t.actor.type !== 'deployable';

function relation(a, from, t) {
    if (typeof a.isFriendly === 'function' && a.isFriendly(from, t)) return 'friendly';
    if (typeof a.isHostile === 'function' && a.isHostile(from, t)) return 'hostile';
    const d1 = from.document.disposition, d2 = t.document.disposition;
    if (d1 === d2) return 'friendly';
    return (d1 === -1 || d2 === -1) ? 'hostile' : 'neutral';
}

// ---------------------------------------------------------------- Rank 2: Energized Swarm

async function energizedSwarm(a, token) {
    const drones = canvas.tokens.placeables.filter(t => t.actor && isDrone(t.actor) && ownedBy(t.actor, token.actor) && !t.document.hidden);
    if (!drones.length) return;
    const reach = canvas.tokens.placeables.filter(t => isCharacter(t) && !drones.some(d => d.id === t.id)
        && drones.some(d => a.getTokenDistance(d, t) <= 1));
    if (!reach.length) {
        await card(token.actor, 'ENERGIZED SWARM', 'The attack consumed Lock On, but no characters are within Burst 1 of a Drone.');
        return;
    }
    const { confirmed } = await a.askCard({
        title: 'ENERGIZED SWARM',
        description: `Lock On consumed. Your <b>${drones.length}</b> ${drones.length === 1 ? 'Drone pulses' : 'Drones pulse'}: characters of your choice within Burst 1 of a Drone take <b>1d6 Energy</b> (once each). Use it?`,
        yesText: 'Pulse',
        noText: 'Skip',
        owner: token,
        originToken: token
    });
    if (!confirmed) return;
    if (!(await a.consumeOncePerRound(token, 'drone_swarm'))) return;
    const picked = await a.chooseToken(token, {
        count: -1,
        includeSelf: false,
        selection: reach,
        preSelected: reach.filter(t => relation(a, token, t) === 'hostile'),
        allowEmptyConfirm: true,
        title: 'ENERGIZED SWARM',
        description: 'Choose the characters hit by the pulse (1d6 Energy each).'
    });
    if (!picked?.length) return;
    await a.executeDamageRoll(token, picked, '1d6', 'Energy', 'Energized Swarm');
    await card(token.actor, 'ENERGIZED SWARM', `Pulse hits ${picked.map(t => t.name).join(', ')}: <b>1d6 Energy</b> each.`);
}

// ---------------------------------------------------------------- Rank 3: Invigorate (macro)

function pathTokens(from, to, skip) {
    const size = canvas.grid.size || 100;
    const a = from.center, b = to.center;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (size / 4)));
    const found = new Map();
    for (let i = 0; i <= steps; i++) {
        const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
        for (const t of canvas.tokens.placeables) {
            if (skip.has(t.id) || found.has(t.id) || !t.actor || t.document.hidden) continue;
            if (t.bounds.contains(x, y)) found.set(t.id, t);
        }
    }
    return [...found.values()];
}

export async function invigorate(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Invigorate: select the Drone Commander token first.');
    if (droneRank(token.actor) < 3) return ui.notifications.warn(`Invigorate: ${token.name}'s pilot does not have Drone Commander rank 3.`);

    const chain = [];
    let from = token;
    for (;;) {
        const used = new Set([token.id, ...chain.map(t => t.id)]);
        const options = canvas.tokens.placeables.filter(t => t.actor && !t.document.hidden && !used.has(t.id)
            && relation(a, token, t) === 'friendly' && a.getTokenDistance(from, t) <= 3);
        if (!options.length) {
            if (!chain.length) return ui.notifications.warn('Invigorate: no allied character within Range 3.');
            break;
        }
        const picked = await a.chooseToken(from, {
            range: 3, count: 1, includeSelf: false, selection: options,
            title: 'INVIGORATE',
            description: chain.length ? `Pulse ${chain.length}: choose the next ally within Range 3 of ${from.name}.` : 'Choose an allied character (Drones included) within Range 3.'
        });
        const next = picked?.[0];
        if (!next) { if (!chain.length) return; break; }
        chain.push(next);
        from = next;
        const { confirmed } = await a.askCard({
            title: 'INVIGORATE',
            description: `Pulse reached <b>${next.name}</b>. Extend the Line to another ally within Range 3 of them?`,
            yesText: 'Extend', noText: 'Stop', owner: token, originToken: token
        });
        if (!confirmed) break;
    }

    await a.consumeAction(token, 'quick');

    const nodes = [token, ...chain];
    const skip = new Set(nodes.map(t => t.id));
    const onPath = new Map();
    for (let i = 0; i < nodes.length - 1; i++)
        for (const t of pathTokens(nodes[i], nodes[i + 1], skip)) onPath.set(t.id, t);

    const allies = [...chain, ...[...onPath.values()].filter(t => relation(a, token, t) === 'friendly')];
    const hostiles = [...onPath.values()].filter(t => relation(a, token, t) === 'hostile');

    const noTrack = [];
    for (const t of allies) {
        const os = t.actor.system?.overshield;
        if (!os || t.actor.type === 'deployable') { noTrack.push(t.name); continue; }
        if ((Number(os.value) || 0) < 4) await t.actor.update({ 'system.overshield.value': 4 });
    }
    if (hostiles.length) await a.executeDamageRoll(token, hostiles, 2, 'Energy', 'Invigorate');

    await card(token.actor, 'INVIGORATE',
        `Line: <b>${nodes.map(t => t.name).join(' → ')}</b>.<br>`
        + `Overshield 4: ${allies.filter(t => !noTrack.includes(t.name)).map(t => t.name).join(', ') || 'none'}.`
        + (noTrack.length ? ` (${noTrack.join(', ')}: no Overshield track, not applied.)` : '')
        + (hostiles.length ? `<br>Hostiles on the path take <b>2 Energy</b>: ${hostiles.map(t => t.name).join(', ')}.` : '')
        + `<br><i>The "Energy: 2" cost is not deducted automatically.</i>`);
}

// ---------------------------------------------------------------- registration

const offered = new WeakSet();   // one offer per attack flow, even if it fires on both hit and miss

export function registerDroneSwarm(api) {
    api.registerDefaultGeneralReactions({
        'Drone Commander - Energized Swarm': {
            category: 'General',
            reactions: [
                {
                    comments: 'Drone Commander rank 2: Energized Swarm when an attack consumes Lock On',
                    triggers: ['onHit', 'onMiss'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    awaitActivationCompletion: false,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('drone'));
                        if (!t || (Number(t.system?.curr_rank) || 1) < 2) return false;
                        if (!(data.flowState?.data?.hit_results ?? []).some(h => h?.usedLockOn)) return false;
                        return a.checkGate(reactorToken, 'drone_swarm');
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const fs = data.flowState;
                        if (fs && offered.has(fs)) return;
                        if (fs) offered.add(fs);
                        const run = () => energizedSwarm(a, reactorToken);
                        if (!a.afterFlow(data, run)) await run();
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}), invigorate: (token) => invigorate(api, token) };

    console.info('la-talents | Drone Swarm / Invigorate registered');
}
