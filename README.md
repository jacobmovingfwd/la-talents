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
- **Duelist** (ranks 1-3): Partisan, Blademaster (dice gained on Main Melee hits; Parry and Deflect offered automatically; Feint and Trip via macro), Unstoppable (Grapple or Ram after a melee hit).
- **Nuclear Cavalier** (ranks 1-3): Aggressive Heat Bleed, Fusion Hemorrhage (Energy conversion and +1d6 Energy), Here, Catch! (the Fuel Rod Gun is created and slotted automatically at rank 3; clears 4 heat on attack).
- **Siege Specialist** (ranks 1-3): Jackhammer (macro), Impact, Collateral Damage (offered on a Cannon crit).
- **Grease Monkey** (ranks 1-3): Unsanctioned Capacity Upgrade (macro), Machine Bond, Friends in High Places (GM macro).
- **Drone Commander** (ranks 1-3): Shepherd (+5 drone HP, move-a-drone macro), Energized Swarm (offered when an attack consumes Lock On), Invigorate (macro; the "Energy: 2" cost is not deducted).

### Macros
Run these in a macro (type: script). Most use the selected token.
- `game.modules.get('la-talents').api.jackhammer()`
- `game.modules.get('la-talents').api.capacityUpgrade()`
- `game.modules.get('la-talents').api.supplyDrop()` (GM; add `{ reset: true }` for a new mission)
- `game.modules.get('la-talents').api.shepherd()`
- `game.modules.get('la-talents').api.applyShepherdHP()` (drones already on the scene)
- `game.modules.get('la-talents').api.resetGunslingerDie(actor)`
- `game.modules.get('la-talents').api.blademaster()` (Feint and Trip, shows your dice)
- `game.modules.get('la-talents').api.invigorate()`

## Install
- **Manifest URL:** paste this into Foundry under Add-on Modules > Install Module > Manifest URL:
  `https://raw.githubusercontent.com/jacobmovingfwd/la-talents/main/module.json`
- **Manual:** clone or copy this folder into your Foundry `Data/modules/` folder. The folder name must be `la-talents`.

## License
GPL-3.0. See [LICENSE](LICENSE).
