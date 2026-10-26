# Lancer Talent Automations (`la-talents`)

Talent automations for Foundry VTT, built on top of [Lancer Automations](https://github.com/Agraael/lancer-automations).

## Requirements
- Foundry VTT 13.351
- Lancer system
- Lancer Automations 4.4.0 or newer

## Talents
- **Vanguard** (ranks 1-3): +1 Accuracy with CQB weapons within Range 3, ignore cover with them, and Semper Vigilo Overwatch.
- **Walking Armory** (ranks 1-3): Ammo Case ammo types, charge costs, Efficiency refunds.
- **Exemplar** (ranks 1-3): Honorable Challenge, Punishment, Valiant Aid, To the Death.
- **Spotter** (ranks 1-3): Particularize (handled by the Lancer system), Panopticon, Bentham/Foucault Elimination.
- **Skirmisher** (ranks 1-3): Integrated Chaff Launchers (soft cover each turn), Lockbreaker (free 2-space move around a Skirmish), Weave (first reaction attack each round misses).
- **Gunslinger** (ranks 1-3): Opening Argument (+1 Accuracy on the first Auxiliary ranged attack each turn), From the Hip (Return Fire reaction), I Kill With My Heart (Gunslinger Die). The die resets on Full Repair. For a rest, run `game.modules.get('la-talents').api.resetGunslingerDie(actor)` in a GM macro.
- **Hunter** (ranks 1-3): Lunge, Knife Juggler (Thrown 5, thrown weapons return at end of turn), Disdainful Blade.
- **Duelist** (rank 1 only so far): Partisan.
- **Nuclear Cavalier** (rank 1 only so far): Aggressive Heat Bleed.
- **Siege Specialist** (ranks 1-2): Jackhammer (macro), Impact.
- **Grease Monkey** (ranks 1-3): Unsanctioned Capacity Upgrade (macro), Machine Bond, Friends in High Places (GM macro).
- **Drone Commander** (rank 1 only so far): Shepherd (+5 drone HP, move-a-drone macro).

### Macros
Run these in a macro (type: script). Most use the selected token.
- `game.modules.get('la-talents').api.jackhammer()`
- `game.modules.get('la-talents').api.capacityUpgrade()`
- `game.modules.get('la-talents').api.supplyDrop()` (GM; add `{ reset: true }` for a new mission)
- `game.modules.get('la-talents').api.shepherd()`
- `game.modules.get('la-talents').api.applyShepherdHP()` (drones already on the scene)
- `game.modules.get('la-talents').api.resetGunslingerDie(actor)`

## Install
- **Manifest URL:** paste this into Foundry under Add-on Modules > Install Module > Manifest URL:
  `https://raw.githubusercontent.com/jacobmovingfwd/la-talents/main/module.json`
- **Manual:** clone or copy this folder into your Foundry `Data/modules/` folder. The folder name must be `la-talents`.

## License
GPL-3.0. See [LICENSE](LICENSE).
