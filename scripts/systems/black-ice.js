// Black ICE Module (SSC). [beta]
//  Tech attacks against you or an adjacent allied character get +1 difficulty. Each tech attack made against one of
//  them, hit or miss, steps the buff up: "Black ICE +1" -> "+2" -> "+3", and the attack after +3 rolls it back to
//  +1. It also resets at the end of the scene (when combat ends).
//  Each level is its own named bonus. The owner's current level is a flag on the mech; the GM-side sync puts the
//  matching bonus on the owner and on every adjacent ally, and takes it off allies who break adjacency.
//  The attack that triggers a step is rolled at the old level; the new level applies from the next one.

import { hasSystem } from './common.js';

const LID = 'ms_black_ice_module';
const FLAG_LEVEL = 'blackIceLevel';
const FLAG_HOLDERS = 'blackIceHolders';
const bonusId = (owner) => `sys-black-ice:${owner.id}`;

const level = (api, actor) => {
    const n = Number(api.getActorFlags(actor, FLAG_LEVEL));
    return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 1;
};

// Put the right "Black ICE +N" bonus on the owner and the adjacent allies, and take it off everyone else.
// GM only (it edits other players' actors).
export async function syncBlackIce(api, mech) {
    const owner = mech.getActiveTokens?.()[0];
    if (!owner) return;
    const works = hasSystem(mech, LID);
    const lvl = works ? level(api, mech) : 0;
    const wanted = new Set();
    if (works) {
        wanted.add(owner.id);
        for (const t of api.getTokensInRange(owner, { range: 1, disposition: 'friendly' })) if (t.actor) wanted.add(t.id);
    }
    let holders = {};
    try { holders = JSON.parse(api.getActorFlags(mech, FLAG_HOLDERS) || '{}'); } catch { holders = {}; }
    const id = bonusId(owner);
    let changed = false;

    for (const tok of canvas.tokens.placeables) {
        if (!tok.actor) continue;
        const have = holders[tok.id];
        const want = wanted.has(tok.id) ? lvl : 0;
        if ((have ?? 0) === want) continue;
        if (have) await api.removeGlobalBonus(tok.actor, (b) => b?.id === id);
        if (want) {
            await api.addGlobalBonus(tok.actor, {
                id, name: `Black ICE +${want}`, type: 'difficulty', val: want, rollTypes: ['tech'], applyToTargetter: true
            }, { duration: 'indefinite', origin: owner });
            holders[tok.id] = want;
        } else delete holders[tok.id];
        changed = true;
    }
    // Stored as a JSON string so removed tokens really disappear (flag objects merge on update).
    if (changed) await api.addActorFlags(mech, { [FLAG_HOLDERS]: JSON.stringify(holders) });
}

export function registerBlackIce(api) {
    api.registerDefaultItemReactions({
        [LID]: {
            category: 'System',
            itemType: 'mech_system',
            reactions: [
                {
                    comments: 'Black ICE: a tech attack against the owner or an adjacent ally steps the buff up one level (3 rolls over to 1)',
                    triggers: ['onTechAttack'],
                    triggerSelf: true, triggerOther: true,
                    outOfCombat: true, autoActivate: true, awaitActivationCompletion: false,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        const inst = (reactorToken.actor?.system?.loadout?.systems ?? []).some(s => (s?.value?.id ?? s?.id ?? s) === item.id);
                        if (!inst || item.system?.destroyed || item.system?.disabled) return false;
                        const attacker = data.triggeringToken;
                        if (!attacker || attacker.id === reactorToken.id) return false;
                        return (data.targets ?? []).some(t => {
                            const tok = t?.target ?? t;
                            if (!tok) return false;
                            if (tok.id === reactorToken.id) return true;
                            return a.getTokenDistance(reactorToken, tok) <= 1 && tok.document.disposition === reactorToken.document.disposition;
                        });
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        const run = async () => {
                            const next = level(a, reactorToken.actor) + 1;
                            await a.addActorFlags(reactorToken.actor, { [FLAG_LEVEL]: next > 3 ? 1 : next });
                        };
                        if (!a.afterFlow(data, run)) await run();
                    }
                },
                {
                    comments: 'Black ICE: resets to +1 when the scene (combat) ends',
                    triggers: ['onExitCombat'],
                    triggerSelf: true, triggerOther: false,
                    outOfCombat: true, autoActivate: true,
                    activationType: 'code', activationMode: 'instead',
                    evaluate: function (triggerType, data, reactorToken, item, name, a) {
                        return !item.system?.destroyed;
                    },
                    activationCode: async function (triggerType, data, reactorToken, item, name, a) {
                        await a.addActorFlags(reactorToken.actor, { [FLAG_LEVEL]: 1 });
                    }
                }
            ]
        }
    });

    // Allies moving in and out of adjacency: the GM refreshes who holds the buff.
    let timer = null;
    Hooks.on('updateToken', (doc, change) => {
        if (!game.user.isActiveGM || !('x' in change || 'y' in change)) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            for (const actor of game.actors.filter(x => x.type === 'mech' && hasSystem(x, LID))) {
                try { await syncBlackIce(api, actor); } catch (err) { console.error('la-talents | Black ICE sync failed', err); }
            }
        }, 400);
    });
    console.info('la-talents | Black ICE registered');
}
