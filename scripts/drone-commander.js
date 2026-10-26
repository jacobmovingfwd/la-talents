// Drone Commander talent. Built so far: rank 1, Shepherd.
//  - Your Drone systems gain +5 HP. Applied automatically to a drone when it is deployed (once per drone), and
//    to drones already on the scene by running the macro below. Drones are recognised as deployables with the
//    Drone type or tag whose owner/deployer is the commander's mech.
//  - Shepherd Drone Protocol: move a drone you control up to 4 spaces if it is within Sensors. A macro:
//      game.modules.get('la-talents').api.shepherd()             (uses the selected token)
//    Existing drones: game.modules.get('la-talents').api.applyShepherdHP()
//  Ranks 2 (Energized Swarm) and 3 (Invigorate) are in drone-swarm.js.

const FLAG_HP = 'shepherdHP';

export function droneRank(actor) {
    const talent = actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent'
        && String(i.system?.lid ?? '').toLowerCase().includes('drone'));
    return talent ? (Number(talent.system?.curr_rank) || 1) : 0;
}

export const tokenOf = (t) => t?.actor ? t : (t?.getActiveTokens?.()[0] ?? canvas.tokens.controlled[0]);

export function isDrone(actor) {
    if (!actor || actor.type !== 'deployable') return false;
    if (String(actor.system?.type ?? '').toLowerCase() === 'drone') return true;
    return (actor.system?.tags ?? []).some(t => t?.lid === 'tg_drone' || t?.id === 'tg_drone');
}

export function ownedBy(drone, commander) {
    const ids = [commander.id, commander.token?.baseActor?.id, commander.uuid].filter(Boolean);
    const ref = (v) => v?.value?.id ?? v?.value?.uuid ?? v?.id ?? (typeof v === 'string' ? v : null);
    const owners = [ref(drone.system?.owner), ref(drone.system?.deployer)].filter(Boolean);
    return owners.some(o => ids.includes(o));
}

function card(actor, title, body) {
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="card clipped-bot" style="margin:0">
            <div class="lancer-header lancer-primary" style="padding:4px 8px;"><i class="fas fa-satellite"></i> ${title}</div>
            <div style="padding:4px 8px; font-size:0.9em;">${body}</div>
        </div>`
    });
}

async function shepherdHP(a, drone) {
    const actor = drone.actor;
    if (a.getActorFlags(actor, FLAG_HP)) return false;
    const hp = actor.system?.hp;
    if (!hp) return false;
    await actor.update({ 'system.hp.max': hp.max + 5, 'system.hp.value': hp.value + 5 });
    await a.addActorFlags(actor, { [FLAG_HP]: true });
    return true;
}

// Drones on the scene that belong to this commander and have not had Shepherd applied yet.
export async function applyShepherdHP(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Shepherd: select the Drone Commander token first.');
    if (droneRank(token.actor) < 1) return ui.notifications.warn(`Shepherd: ${token.name}'s pilot does not have Drone Commander.`);
    const names = [];
    for (const t of canvas.tokens.placeables) {
        if (!isDrone(t.actor) || !ownedBy(t.actor, token.actor)) continue;
        if (await shepherdHP(a, t)) names.push(t.name);
    }
    ui.notifications.info(names.length ? `Shepherd: +5 HP on ${names.join(', ')}.` : 'Shepherd: no new drones to upgrade.');
}

export async function shepherd(a, tokenLike) {
    const token = tokenOf(tokenLike);
    if (!token?.actor) return ui.notifications.warn('Shepherd: select the Drone Commander token first.');
    if (droneRank(token.actor) < 1) return ui.notifications.warn(`Shepherd: ${token.name}'s pilot does not have Drone Commander.`);
    const drones = canvas.tokens.placeables.filter(t => isDrone(t.actor) && ownedBy(t.actor, token.actor));
    if (!drones.length) return ui.notifications.warn(`Shepherd: ${token.name} controls no drones on this scene.`);
    const picked = await a.chooseToken(token, {
        range: 'sensors',
        count: 1,
        includeSelf: false,
        selection: drones,
        title: 'SHEPHERD DRONE',
        description: 'Choose a drone within Sensors to move up to 4 spaces.'
    });
    const drone = picked?.[0];
    if (!drone) return;
    const moved = await a.moveToken(drone, { free: true, range: 4, title: 'SHEPHERD DRONE', description: `Move ${drone.name} up to 4 spaces.` });
    if (moved) await card(token.actor, 'SHEPHERD DRONE', `<b>${token.name}</b> moves <b>${drone.name}</b> up to 4 spaces.`);
}

export function registerDroneCommander(api) {
    api.registerDefaultGeneralReactions({
        'Drone Commander - Shepherd': {
            category: 'General',
            reactions: [
                {
                    comments: 'Drone Commander rank 1: a newly deployed Drone gains +5 HP',
                    triggers: ['onDeploy'],
                    triggerSelf: true,
                    triggerOther: false,
                    outOfCombat: true,
                    autoActivate: true,
                    checkReaction: false,
                    activationType: 'code',
                    activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const t = reactorToken.actor?.system?.pilot?.value?.items?.find(i => i.type === 'talent' && String(i.system?.lid ?? '').toLowerCase().includes('drone'));
                        return !!t && (data.deployedTokens ?? []).length > 0;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const upgraded = [];
                        for (const d of data.deployedTokens ?? []) {
                            const token = d.actor ? d : canvas.tokens.get(d.id);
                            if (token && isDrone(token.actor) && await shepherdHP(a, token)) upgraded.push(token.name);
                        }
                        if (upgraded.length) await card(reactorToken.actor, 'SHEPHERD', `${upgraded.join(', ')} gains +5 HP.`);
                    }
                }
            ]
        }
    });

    const mod = game.modules.get('la-talents');
    if (mod) mod.api = { ...(mod.api ?? {}),
        shepherd: (token) => shepherd(api, token),
        applyShepherdHP: (token) => applyShepherdHP(api, token) };

    console.info('la-talents | Drone Commander registered');
}
