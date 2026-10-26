// Technophile talent, ranks 1-3. [beta]
//  The talent hands your mech an NHP system: Servant-Class (rank 1), Student-Class (rank 2) or Enlightenment-Class
//  (rank 3). The Lancer system doesn't hand out talent items outside a COMP/CON import, so a GM-side sync creates the
//  right one for your rank, installs it in your mech's loadout, and replaces the lower-class one on a rank-up
//  (swapping it in place so it stays installed). It is removed again if you lose the talent.
//  The NHP Assistance reroll (1/round, mech skill check or save, keep the new result) is a table ruling: Lancer
//  Automations can't replace a finished roll. The no-cascade benefit at rank 3 is narrative.

import { talentRank } from './common.js';

const KEY = 'technophile';
export const technophileRank = (actor) => talentRank(actor, KEY);

const NHP = {
    1: {
        name: 'Servant-Class NHP',
        tags: [{ lid: 'tg_ai', val: 1 }, { lid: 'tg_unique', val: 1 }],
        effect: 'Your mech gains the AI tag.<br>You have developed a custom NHP. This NHP can speak to you and has a personality, but they are less advanced than most NHPs and are incapable of independent thought, relying on you for direction. When acting alone, they will follow the last direction given and defend themself as needed; however, they have limited initiative and don’t benefit from your talents.',
        description: 'Gained from the Technophile: Rank I pilot talent.'
    },
    2: {
        name: 'Student-Class NHP',
        tags: [{ lid: 'tg_ai', val: 1 }, { lid: 'tg_unique', val: 1 }, { lid: 'tg_round', val: 1 }],
        effect: 'Your mech gains the AI tag.<br>Your custom NHP has developed further, and is now capable of independent thought. It can make complex decisions and judgments and act independently, without instruction.<br>1/round, with the assistance of your NHP, you may reroll any mech skill check or save. You must keep the new result, even if it’s worse.',
        description: 'Gained from the Technophile: Rank II pilot talent.'
    },
    3: {
        name: 'Enlightenment-Class NHP',
        tags: [{ lid: 'tg_ai', val: 1 }, { lid: 'tg_unique', val: 1 }, { lid: 'tg_round', val: 1 }],
        effect: 'Your mech gains the AI tag; however, this NHP doesn’t count towards the number of AIs you may have installed at once.<br>This NHP benefits from your talents when piloting your mech. Additionally, you may carry them with you outside of your mech, either as a miniaturized casket, a hardsuit-integrated flash plug, or with a hard-port implant.<br>1/round, with the assistance of your NHP, you may reroll any mech skill check or save. You must keep the new result, even if it’s worse.',
        description: 'Gained from the Technophile: Rank III pilot talent.'
    }
};

const itemData = (rank) => ({
    name: NHP[rank].name,
    type: 'mech_system',
    img: 'systems/lancer/assets/icons/mech_system.svg',
    system: {
        lid: `ms_technophile_${rank}`,
        type: 'AI',
        sp: 0,
        effect: NHP[rank].effect,
        description: NHP[rank].description,
        tags: NHP[rank].tags,
        actions: [], bonuses: [], counters: [], deployables: [], integrated: [], synergies: []
    }
});

export async function syncTechnophileMech(api, mech) {
    const rank = Math.min(3, technophileRank(mech));
    const owned = mech.items.filter(i => i.type === 'mech_system' && /^ms_technophile_\d$/.test(String(i.system?.lid ?? '')));
    const wantLid = rank >= 1 ? `ms_technophile_${rank}` : null;
    const systems = foundry.utils.deepClone(mech._source?.system?.loadout?.systems ?? []);

    if (!wantLid) {
        if (owned.length) {
            const ids = owned.map(i => i.id);
            await mech.update({ 'system.loadout.systems': systems.filter(id => !ids.includes(id)) });
            await mech.deleteEmbeddedDocuments('Item', ids);
        }
        return;
    }
    let current = owned.find(i => i.system.lid === wantLid);
    const stale = owned.filter(i => i !== current);
    if (!current) {
        const [created] = await mech.createEmbeddedDocuments('Item', [itemData(rank)]);
        current = created;
    }
    if (!current) return;
    const staleIds = stale.map(i => i.id);
    let next = systems.map(id => staleIds.includes(id) ? current.id : id);
    if (!next.includes(current.id)) next.push(current.id);
    next = next.filter((id, i) => next.indexOf(id) === i);
    if (JSON.stringify(next) !== JSON.stringify(systems)) await mech.update({ 'system.loadout.systems': next });
    if (staleIds.length) await mech.deleteEmbeddedDocuments('Item', staleIds);
}
