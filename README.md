# Lancer Talent Automations (`la-talents`)

Talent automations for Foundry VTT, built on top of [Lancer Automations](https://github.com/Agraael/lancer-automations).

## Requirements
- Foundry VTT 13.351
- Lancer system
- Lancer Automations 4.4.0 or newer

## Talents
Talents marked **[beta]** are built but have not been play-tested yet; expect rough edges.

- **Vanguard** (ranks 1-3): +1 Accuracy with CQB weapons within Range 3, ignore cover with them, and Semper Vigilo Overwatch.
- **Walking Armory** (ranks 1-3): Ammo Case ammo types, charge costs, Efficiency refunds.
- **Exemplar** (ranks 1-3): Honorable Challenge, Punishment, Valiant Aid, To the Death.
- **Spotter** (ranks 1-3): Particularize (handled by the Lancer system), Panopticon, Bentham/Foucault Elimination.
- **Skirmisher** (ranks 1-3) **[beta]**: Integrated Chaff Launchers (soft cover each turn), Lockbreaker (free 2-space move around a Skirmish), Weave (first reaction attack each round misses).
- **Gunslinger** (ranks 1-3) **[beta]**: Opening Argument (+1 Accuracy on the first Auxiliary ranged attack each turn), From the Hip (Return Fire reaction), I Kill With My Heart (Gunslinger Die). The die resets on Full Repair. For a rest, run `game.modules.get('la-talents').api.resetGunslingerDie(actor)` in a GM macro.
- **Hunter** (ranks 1-3) **[beta]**: Lunge, Knife Juggler (Thrown 5, thrown weapons return at end of turn), Disdainful Blade.
- **Duelist** (ranks 1-3) **[beta]**: Partisan, Blademaster (dice gained on Main Melee hits; Parry and Deflect offered automatically; Feint and Trip via macro), Unstoppable (Grapple or Ram after a melee hit).
- **Nuclear Cavalier** (ranks 1-3) **[beta]**: Aggressive Heat Bleed, Fusion Hemorrhage (Energy conversion and +1d6 Energy), Here, Catch! (the Fuel Rod Gun is created and slotted automatically at rank 3; clears 4 heat on attack).
- **Siege Specialist** (ranks 1-3) **[beta]**: Jackhammer (macro), Impact, Collateral Damage (offered on a Cannon crit).
- **Grease Monkey** (ranks 1-3) **[beta]**: Unsanctioned Capacity Upgrade (macro), Machine Bond, Friends in High Places (GM macro).
- **Drone Commander** (ranks 1-3) **[beta]**: Shepherd (+5 drone HP, move-a-drone macro), Energized Swarm (offered when an attack consumes Lock On), Invigorate (macro; the "Energy: 2" cost is not deducted).
- **Ace** (ranks 1-3) **[beta]**: Acrobatics (+1 Accuracy on Agility checks while flying, fly 2 after a miss), Afterburners, Supersonic (spin-up macro).
- **Bonded** (ranks 1-3) **[beta]**: pick a Bondmate (macro); adjacent +1/+2 Accuracy on checks and saves, Intercede, Cover Me!.
- **Brawler** (ranks 1-3) **[beta]**: Hold and Lock, Sledgehammer (the system handles it), Brawler Die and Knockout Blow.
- **Brutal** (ranks 1-3) **[beta]**: Predator (maximum damage on a natural 20 crit), Cull the Herd (crit knockback 1), Relentless (miss streak).
- **Centimane** (ranks 1-3) **[beta]**: Nexus crit effects (Ten Thousand Teeth / Tidal Suppression swarm choices), Expose Weakness.
- **Combined Arms** (ranks 1-3) **[beta]**: Shield of Blades (soft cover while Engaged), CQB-Trained, Storm of Violence.
- **Crack Shot** (ranks 1-3) **[beta]**: Steady Aim (+1 Accuracy with Rifles), Zero In, Watch This.
- **Engineer** (ranks 1-3) **[beta]**: the Prototype Weapon is created and slotted automatically; a refit prompt on Full Repair (type, damage, tweaks, Limited reroll).
- **Executioner** (ranks 1-3) **[beta]**: Backswing Cut, Wide Arc Cleave, No Escape.
- **Hacker** (ranks 1-3) **[beta]**: SNOW_CRASH, SAFE_CRACKER invade options (system actions, not automated), Last Argument of Kings.
- **Heavy Gunner** (ranks 1-3) **[beta]**: Covering Fire with Hammerbeat and Bracketing Fire.
- **Infiltrator** (ranks 1-3) **[beta]**: Prowl is a table ruling; Ambush and Mastermind are automated.
- **Juggernaut** (ranks 1-3) **[beta]**: Momentum, Kinetic Mass Transfer, Unstoppable Force.
- **Leader** (ranks 1-3) **[beta]**: Leadership Dice, Issue Order / Issue Command, Inspiring Presence (macro for using a held die).
- **Stormbringer** (ranks 1-3) **[beta]**: Seismic Deluge, Stormbending, Torrent Die and Massive Attack.
- **Tactician** (ranks 1-3) **[beta]**: Opportunist, Solar Backdrop, Flank.
- **Technophile** (ranks 1-3) **[beta]**: the Servant / Student / Enlightenment-Class NHP system is created and installed for your rank (the reroll is a table ruling).

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
- `game.modules.get('la-talents').api.spinUp()` (Ace 3)
- `game.modules.get('la-talents').api.setBondmate()` (Bonded)
- `game.modules.get('la-talents').api.refitPrototype()` (Engineer)
- `game.modules.get('la-talents').api.leadershipDie()` (Leader: whoever holds a die) and `api.restLeader(actor)`
- `game.modules.get('la-talents').api.resetBrawlerDie(actor)` and `api.resetTorrentDie(actor)` (rests)

## Install
- **Manifest URL:** paste this into Foundry under Add-on Modules > Install Module > Manifest URL:
  `https://raw.githubusercontent.com/jacobmovingfwd/la-talents/main/module.json`
- **Manual:** clone or copy this folder into your Foundry `Data/modules/` folder. The folder name must be `la-talents`.

## License
GPL-3.0. See [LICENSE](LICENSE).
