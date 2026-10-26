# Lancer Talent Automations (`la-talents`)

Talent automations for Foundry VTT, built on top of [Lancer Automations](https://github.com/Agraael/lancer-automations).

## Requirements
- Foundry VTT 13.351
- Lancer system
- Lancer Automations 4.4.0 or newer

## Talents
Talents marked **[beta]** are built but have not been play-tested yet; expect rough edges.

- **Ace** (ranks 1-3) **[beta]**: Acrobatics (+1 Accuracy on Agility checks while flying, fly 2 after a miss), Afterburners, Supersonic (spin-up macro).
- **Bonded** (ranks 1-3) **[beta]**: pick a Bondmate (macro); adjacent +1/+2 Accuracy on checks and saves, Intercede, Cover Me!.
- **Brawler** (ranks 1-3) **[beta]**: Hold and Lock, Sledgehammer (the system handles it), Brawler Die and Knockout Blow.
- **Brutal** (ranks 1-3) **[beta]**: Predator (maximum damage on a natural 20 crit), Cull the Herd (crit knockback 1), Relentless (miss streak).
- **Centimane** (ranks 1-3) **[beta]**: Nexus crit effects (Ten Thousand Teeth / Tidal Suppression swarm choices), Expose Weakness.
- **Combined Arms** (ranks 1-3) **[beta]**: Shield of Blades (soft cover while Engaged), CQB-Trained, Storm of Violence.
- **Crack Shot** (ranks 1-3) **[beta]**: Steady Aim (+1 Accuracy with Rifles), Zero In, Watch This.
- **Drone Commander** (ranks 1-3) **[beta]**: Shepherd (+5 drone HP, move-a-drone macro), Energized Swarm (offered when an attack consumes Lock On), Invigorate (macro; the "Energy: 2" cost is not deducted).
- **Duelist** (ranks 1-3) **[beta]**: Partisan, Blademaster (dice gained on Main Melee hits; Parry and Deflect offered automatically; Feint and Trip via macro), Unstoppable (Grapple or Ram after a melee hit).
- **Engineer** (ranks 1-3) **[beta]**: the Prototype Weapon is created and slotted automatically; a refit prompt on Full Repair (type, damage, tweaks, Limited reroll).
- **Executioner** (ranks 1-3) **[beta]**: Backswing Cut, Wide Arc Cleave, No Escape.
- **Exemplar** (ranks 1-3): Honorable Challenge, Punishment, Valiant Aid, To the Death.
- **Grease Monkey** (ranks 1-3) **[beta]**: Unsanctioned Capacity Upgrade (macro), Machine Bond, Friends in High Places (GM macro).
- **Gunslinger** (ranks 1-3) **[beta]**: Opening Argument (+1 Accuracy on the first Auxiliary ranged attack each turn), From the Hip (Return Fire reaction), I Kill With My Heart (Gunslinger Die). The die resets on Full Repair. For a rest, run `game.modules.get('la-talents').api.resetGunslingerDie(actor)` in a GM macro.
- **Hacker** (ranks 1-3) **[beta]**: SNOW_CRASH, SAFE_CRACKER invade options (system actions, not automated), Last Argument of Kings.
- **Heavy Gunner** (ranks 1-3) **[beta]**: Covering Fire with Hammerbeat and Bracketing Fire.
- **Hunter** (ranks 1-3): Lunge (fly up to 3 spaces directly toward the target before an Auxiliary melee attack, thrown attacks included), Knife Juggler (Thrown 5; a thrown weapon is disabled instead of placed on the map and returns at end of turn), Disdainful Blade (free thrown follow-up after a melee hit).
- **Infiltrator** (ranks 1-3) **[beta]**: Prowl is a table ruling; Ambush and Mastermind are automated.
- **Juggernaut** (ranks 1-3) **[beta]**: Momentum, Kinetic Mass Transfer, Unstoppable Force.
- **Leader** (ranks 1-3) **[beta]**: Leadership Dice, Issue Order / Issue Command, Inspiring Presence (macro for using a held die).
- **Nuclear Cavalier** (ranks 1-3) **[beta]**: Aggressive Heat Bleed, Fusion Hemorrhage (Energy conversion and +1d6 Energy), Here, Catch! (the Fuel Rod Gun is created and slotted automatically at rank 3; clears 4 heat on attack).
- **Siege Specialist** (ranks 1-3) **[beta]**: Jackhammer (macro), Impact, Collateral Damage (offered on a Cannon crit).
- **Skirmisher** (ranks 1-3) **[beta]**: Integrated Chaff Launchers (soft cover each turn), Lockbreaker (free 2-space move around a Skirmish), Weave (first reaction attack each round misses).
- **Spotter** (ranks 1-3): Particularize (handled by the Lancer system), Panopticon, Bentham/Foucault Elimination.
- **Stormbringer** (ranks 1-3) **[beta]**: Seismic Deluge, Stormbending, Torrent Die and Massive Attack.
- **Tactician** (ranks 1-3) **[beta]**: Opportunist, Solar Backdrop, Flank.
- **Technophile** (ranks 1-3) **[beta]**: the Servant / Student / Enlightenment-Class NHP system is created and installed for your rank (the reroll is a table ruling).
- **Vanguard** (ranks 1-3): +1 Accuracy with CQB weapons within Range 3, ignore cover with them, and Semper Vigilo Overwatch.
- **Walking Armory** (ranks 1-3): Ammo Case ammo types, charge costs, Efficiency refunds.

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

## Systems
Mech system automations, built the same way as the talents. All are **[beta]** until play-tested. Lancer Automations only ships Custom Paint Job, so these fill gaps; systems that are plain actions or deployables are left to the Lancer system and Lancer Automations' deployable handling.

- **Scanner Swarm**: +1 Accuracy on tech attacks against adjacent characters.
- **Personalizations**: +2 HP (the GM-approved +1 Accuracy skill check is a table ruling).
- **Reactor Stabilizer**: offers a reroll on overheating checks; the second result stands.
- **Bulwark Mods**: ignore difficult terrain.
- **External Batteries**: +5 Range on ranged Energy weapons, +1 Threat on melee Energy weapons; destroyed on structure damage with 1d6 AP explosive damage that can't be reduced.
- **Stable Structure**: +1 Accuracy on a Hull or Agility save to avoid Prone or Knockback. Automatic when the save's title names Prone or Knockback; otherwise you get a one-click prompt.
- **Armor-Lock Plating**: Bracing gives +1 difficulty against you and Prone immunity until the end of your next turn (the rest of its benefits are table rulings).
- **Roland Chamber**: after a reload, your next Loading weapon attack deals +1d6 explosive (the Hull save for Prone is a table ruling).
- **Black ICE Module**: tech attacks against you or adjacent allies get a "Black ICE +1" difficulty buff. Each tech attack against one of them, hit or miss, steps it to +2, then +3, then back to +1 (and it resets when combat ends). Allies hold the buff only while adjacent.
- **Hive Drone, Tempest Drone, Sentinel Drone, Lotus Projector** [beta]: hang an aura on the deployed drone (cover and 1 AP kinetic; Hull save, 4 energy and knockback 3; 3 kinetic before attacks; reveals Hidden). Requires Templatemacro.
- **Caltrop Launcher** [beta]: places a Burst 1 difficult-terrain zone that deals 1d3 AP explosive to mechs on first entry per round or turn end.
- **Siege Ram**: a Ram that hits deals 2 kinetic damage (the 10 AP against objects and terrain is a table ruling).
- **Synthetic Muscle Netting**: a card on Ram and Grapple showing the Size you count as against each target (it changes no rolls; doubled lifting and dragging is narrative).
- **Flicker Field Projector**: after a voluntary move you gain Invisible, which ends once the next attack against you resolves (hit or miss). One instance at a time.
- **Flash Anchor**: Flash Lock reaction cancels a push, pull, knockback or Prone on you or an ally in Sensors (2 Heat, Prone immunity until their next turn).
- **Singularity Motivator**: Exposed Singularity reaction, a teleport of up to 1d6 spaces when your mech takes damage.
- **//SCORPION V70.1**: when a tech attack misses you or an adjacent ally, a reaction to Impair and heat the attacker, or Jam them (the save trigger is not automated).
- **Mimic Mesh**: pick an ally; until the end of your next turn, Battlefield Awareness is offered when a hostile acts against them.
- **Active Camouflage**: Invisible until you take damage or the end of your next turn.
- **Core Siphon**: +1 Accuracy on your first attack this turn, then +1 difficulty on every other attack until turn end.
- **Type-3 Projected Shield**: nominate a character; attacks between you and them get +2 difficulty until the start of your next turn.
- **Hunter Lock**: choose a character; your first successful attack against them each round deals +3 bonus damage.
- **Ramjet**: +2 Boost and Knockback 2 on melee attacks until the start of your next turn (the straight-line rule is a table ruling).
- **Retractable Profile**: toggle; +1 difficulty on ranged and tech attacks against you and Slowed while on.
- **HyperDense Armor**: toggle; Resistance and half damage dealt beyond Range 3, Slowed while on.
- **Siege Stabilizers**: toggle; +5 Range on ranged weapons and Immobilized while extended.
- **Auto-Cooler**: clears all heat at the start of your next turn if you haven't taken damage, moved or overheated.
- **Lightning Generator**: 2 energy to everything adjacent on activation, and an automatic 4 AP energy burst at the start of a turn in the Danger Zone.
- **Plasma Gauntlet**: Danger Zone only; Agility save or 4d6 energy and Prone (half on a save), then you're Stunned (the Heat back to you is a table ruling).
- **Aceso Stabilizer**: an ally within Range 5 gains Overshield equal to GRIT + 4 and Impaired/Jammed immunity.
- **ASURA-Class NHP**: offers two extra quick actions or one extra full action.
- **Kinetic Compensator**: a missed ranged attack gives your next ranged attack +1 Accuracy.
- **Type-I Flight System**: at turn end you say whether you flew; if so, Size +1 Heat.
- **Explosive Vents**: clearing all heat or taking stress unleashes Burst 1 for 2 Heat and 2 Burn (1/round).
- **Deep Well Heat Sink**: Resistance to heat for the turn when you start it in the Danger Zone.
- **Reactive Weave**: Bracing makes you Invisible until the end of your next turn and offers a free move of up to your Speed.

## Install
- **Manifest URL:** paste this into Foundry under Add-on Modules > Install Module > Manifest URL:
  `https://raw.githubusercontent.com/jacobmovingfwd/la-talents/main/module.json`
- **Manual:** clone or copy this folder into your Foundry `Data/modules/` folder. The folder name must be `la-talents`.

## License
GPL-3.0. See [LICENSE](LICENSE).
