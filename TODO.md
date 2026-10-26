# TODO: system automations

Review of all 124 systems in the core-book data (`lancer-data/lib/systems.json`). The built ones are listed in the README (all **[beta]**) and have test steps in section 0.
Everything below is open. Groups are ordered by how well Lancer Automations (LA) can support them.

## 0. Live-session test plan for the built systems

### Setup (do once)
- Foundry loads `la-talents` through the symlink to the repo; reload (F5) after any change.
- Turn on **Debug: Automation System** in the Lancer Automations settings and keep the browser console (F12) open.
- Use a test mech with the system installed in its loadout (not destroyed or disabled). Test in combat, as the GM, and once as a player-owned mech.
- If a system does nothing: search the console for the system's name. No `candidate:` line = its trigger never fired. A `skip:` line says why. Report the lines.
- Look for `la-talents | System ... registration failed` right after the reload; each group registers on its own.
- When a system passes, remove its [beta] tag in the README.

### Passive bonuses (check the mech, no activation)
- [ ] **Scanner Swarm**: tech attack on an adjacent target shows +1 Accuracy in the HUD; on a target 2+ spaces away it does not.
- [ ] **Personalizations**: max HP is +2 with the system installed, back to normal when removed.
- [ ] **Reactor Stabilizer**: fail an overheating (stress) roll; you are offered a reroll and the second result stands.
- [ ] **Bulwark Mods**: move through difficult terrain with no extra cost.
- [ ] **External Batteries**: Energy ranged weapon shows Range +5, Energy melee shows Threat +1, other weapons unchanged. Then take structure damage: the system is destroyed and a 1d6 AP explosive damage card appears.

### Triggered effects
- [ ] **Kinetic Compensator**: miss with a ranged attack; the next ranged attack shows +1 Accuracy and uses it up.
- [ ] **Type-I Flight System**: end your turn; you are asked if you flew. Yes gives Size +1 Heat, No gives none.
- [ ] **Explosive Vents**: clear all heat or take stress; adjacent characters take 2 Heat and 2 Burn and you take 2 Heat. A second trigger the same round does nothing.
- [ ] **Deep Well Heat Sink**: start a turn in the Danger Zone; you get heat Resistance until the end of the turn. Starting a turn outside the Danger Zone gives nothing.
- [ ] **Reactive Weave**: Brace; you are Invisible until the end of your next turn and offered a free move up to your Speed.
- [ ] **Stable Structure**: make a Hull or Agility save against Prone or Knockback; +1 Accuracy is added. An unrelated Hull or Agility save asks first. (If the bonus is missing, check it is added at `onInitCheck`.)
- [ ] **Armor-Lock Plating**: Brace; attacks against you show +1 difficulty and Prone is cancelled until the end of your next turn.
- [ ] **Roland Chamber**: Reload; the next Loading weapon attack shows +1d6 explosive.
- [ ] **Siege Ram**: Ram that hits adds 2 kinetic damage. Check the action name reads "Ram".
- [ ] **Synthetic Muscle Netting**: Ram or Grapple shows a card with the Size you count as against each target. Check the action names read "Ram" and "Grapple".
- [ ] **Flicker Field Projector**: move voluntarily; you gain Invisible. The next attack against you, hit or miss, removes it. A free or involuntary move should not trigger it (check).

### Reactions
- [ ] **Flash Anchor**: push, pull, knock back or knock Prone you or an ally within Sensors; a prompt offers to cancel it for a Reaction and 2 Heat. The target has Prone immunity until their next turn. Check `sensor_range` is the right field.
- [ ] **Singularity Motivator**: take damage; a prompt offers to teleport 1d6 spaces for your Reaction. Check the teleport happens and the card prints with the right target.
- [ ] **//SCORPION V70.1**: a tech attack misses you or an adjacent ally; you can spend your Reaction to make the attacker Impaired and take 2 Heat, or Jammed. (The "passes a save" trigger is not built.)
- [ ] **Mimic Mesh**: activate it and pick an ally within Sensors. A hostile attack or tech attack against that ally offers a free move of 3 toward them, with no Reaction cost. It ends after your next turn.

### Timed protocols
- [ ] **Active Camouflage**: activate; you are Invisible until you take damage or your next turn ends.
- [ ] **Core Siphon**: activate; your first attack this turn shows +1 Accuracy and later attacks show +1 difficulty.
- [ ] **Type-3 Projected Shield**: activate and nominate a character; attacks between you and them show +2 difficulty until the start of your next turn.
- [ ] **Hunter Lock**: choose a target; your first hit on them each round adds +3 bonus damage, later hits that round do not. Choose another target and the first one stops. It clears when combat ends.
- [ ] **Ramjet**: activate; Boost gains +2 spaces and melee attacks gain Knockback 2 until your next turn. Check the Knockback applies to Ram and Grapple too.

### Toggles and one-offs
- [ ] **Retractable Profile**: turn on; ranged and tech attacks against you show +1 difficulty and you are Slowed. Using it again or Deactivate turns it off cleanly. Repeat several times.
- [ ] **HyperDense Armor**: turn on; attackers beyond Range 3 deal reduced damage to you, you deal half beyond Range 3, and you are Slowed. Check Heat and Burn are covered.
- [ ] **Siege Stabilizers**: extend; ranged weapons gain +5 Range and you are Immobilized. Retract removes only its own effects.
- [ ] **Auto-Cooler**: activate; at the start of your next turn heat clears only if you took no damage, did not move and did not overheat.
- [ ] **Lightning Generator**: activate; adjacent characters take 2 energy. Start a turn in the Danger Zone; it fires on its own for 4 AP energy and 1 Heat.
- [ ] **Plasma Gauntlet**: only in the Danger Zone; target makes an Agility save or takes 4d6 energy and Prone (half and no Prone on a save); you are Stunned until the start of your next turn.
- [ ] **Aceso Stabilizer**: pick an ally within Range 5; their Overshield becomes GRIT + 4 (at least what they had) and they gain Impaired/Jammed immunity. Check GRIT is read correctly on a real mech.
- [ ] **ASURA-Class NHP**: activate; choose two extra quick actions or one extra full action; the action counters update.

### Black ICE Module
- [ ] A tech attack against you or an adjacent ally shows "Black ICE +1". After each tech attack (hit or miss) it steps +2, then +3, then back to +1. It resets when combat ends. An ally who moves out of adjacency loses the buff and gets it back on returning. (GM-side sync, so test with the GM logged in.)

### Drones and area effects
- [ ] **Hive Drone**: deploy; allies within 2 spaces gain soft cover (check the `cover_soft` effect exists); hostiles take 1 AP kinetic on first entry per round or at the start of their turn.
- [ ] **Tempest Drone**: deploy; a hostile that starts its turn adjacent, or first moves adjacent in a round, makes a Hull save or takes 4 energy and is knocked back 3. Check there is no double trigger.
- [ ] **Sentinel Drone**: deploy; a hostile within 2 spaces takes 3 kinetic before it attacks.
- [ ] **Lotus Projector**: deploy; hostiles within 2 spaces lose Hidden (check the `hidden` effect name). Ignoring Invisible is not automated.
- [ ] **Caltrop Launcher**: activate and place a Burst 1 zone within Range 5; it is difficult terrain, and mechs take 1d3 AP explosive on first entry per round or at turn end. The zone disappears when the encounter ends.
- [ ] For all drones: confirm the deploy action fires the deploy trigger and damage cards name the right source.

### Talents confirmed in play
- Hunter (Lunge, Knife Juggler, Disdainful Blade): tested and released; README no longer marks it beta.

## 1. Reactions and triggers (best fit for LA, do first)
- [ ] **Stasis Bolt**: charge as a quick action; Interdiction Point reaction (contested ranged roll, attack auto-misses, charge spent)
- [x] **Mimic Mesh** (built, untested): Battlefield Awareness reaction (move 3 toward chosen ally when a hostile acts against them, ignores engagement)
- [ ] **Turret Drones**: Turret Attack reaction, once per deployed turret
- [ ] **ENCLAVE-Pattern Support Shield**: +1 difficulty into the Burst 3 dome; Blinkfield Intervention reaction (2 Heat, target gains all-damage Resistance)
- [x] **Flash Anchor** (built, untested): Flash Lock reaction (2 Heat, cancel push/pull/knockback/Prone, immunity until your next turn)
- [x] **//SCORPION V70.1** (built for the tech-miss trigger only; the "passes a save" trigger is still open): reaction when an ally or you is missed by a tech attack or passes a save (attacker Impaired and 2 Heat, or Jammed)
- [x] **Singularity Motivator** (built, untested): Exposed Singularity reaction (teleport 1d6 spaces when your mech takes damage)
- [ ] **Monitor Module**: roll 1d3 Charges, nominate an ally, Skirmish at half damage when they're attacked
- [ ] **SCYLLA NHP**: Unleash SCYLLA trigger choice and the half-damage Skirmish reaction
- [ ] **NOAH NHP**: Diluvian Ark (1d6 before ranged attacks, 4+ auto-miss, extra Heat)
- [ ] **SISYPHUS NHP**: Bend Probability (2d20 store) and Probabilistic Cannibalism (replace a d20 result), likely needs a roll-replace hook
- [ ] **Assassin Drone**: Area Denial reaction
- [ ] **Aegis Shield Generator**: three d6 damage-reduction dice for characters in the burst
- [ ] **Stasis Barrier**: soft cover with a 1d6 roll (4+ the attack is negated)
- [ ] **Markerlight**: after the hit, offer the ally crit "weak spot" once before your next turn
- [ ] **Hunter Logic Suite**: Stalk Prey (Invisible to the target until you take damage from them)

## 2. Timed protocols and stat modifiers (constant or temporary bonuses)
- [x] **Type-3 Projected Shield** (built, untested): nominate a character, +2 difficulty on attacks between you both until your next turn
- [x] **Core Siphon** (built, untested): +1 Accuracy on the first attack, +1 difficulty on the rest this turn
- [x] **Hunter Lock** (built, untested): +3 bonus damage on your first successful attack each round against the chosen target
- [x] **Ramjet** (built, untested): +2 Boost distance and Knockback 2 on melee attacks until your next turn
- [x] **Siege Stabilizers** (built, untested): +5 range while extended (Immobilized, no melee, no ranged within 5)
- [x] **HyperDense Armor** (built, untested): Resistance to attacks from beyond Range 3, Slowed, half damage beyond Range 3
- [x] **Retractable Profile** (built, untested): +1 difficulty on ranged and tech attacks against you, Slowed, no attacks
- [x] **Active Camouflage** (built, untested): Invisible until you take damage or the end of your next turn
- [ ] **LB/OC Cloaking Field**: Invisible for you and allies inside Burst 2 while they stay inside
- [ ] **FADE Cloak**: intangible, 1d6 check each turn start
- [ ] **Interdiction Field**: Burst 3 Slowing field, Systems save
- [ ] **Argonaut Shield**: all-damage Resistance for an adjacent ally while you take half
- [x] **Aceso Stabilizer** (built, untested): Overshield = GRIT + 4 and Impaired/Jammed immunity for an ally
- [x] **Auto-Cooler** (built, untested): clear all heat at turn start if you didn't take damage, move or overheat
- [x] **Lightning Generator** (built, untested): 2 energy to adjacent (4 AP at turn start in the Danger Zone, automatic)
- [x] **Plasma Gauntlet** (built, untested): Danger Zone only, 4d6 AP energy, half back to you as Heat, Stunned
- [ ] **LUCIFER NHP**: bonus damage equal to current heat on the next energy attack
- [ ] **SEKHMET NHP**: +1d6 on melee crits and a free melee Skirmish 1/round
- [ ] **TLALOC NHP**: reroll each missed attack once while Immobilized
- [x] **ASURA NHP** (built, untested): two extra quick actions or one full action
- [ ] **AGNI NHP**: clear all heat at turn end and vent Burst 2 (Engineering save, 2 Burn)
- [ ] **Redundant Systems Upgrade**: Stabilize as a quick action, limited 1
- [ ] **External Ammo Feed**: reload a Loading weapon 1/round, 1d3+1 Heat
- [ ] **Rapid Burst Jump Jet System**: flying on Boost, falling if not landed

## 3. Areas, deployables and one-shot area effects (check what LA's deployable handling already does first)
- [x] **Caltrop Launcher**: difficult terrain Burst 1 and 1d3 AP explosive on first entry per round or turn end (built, deployables.js; untested)
- [x] **Hive Drone**: soft cover for allies, 1 AP kinetic to hostiles in Burst 2 (built, deployables.js; untested)
- [x] **Sentinel Drone**: 3 kinetic to hostiles in Burst 2 before they attack (built, deployables.js; untested)
- [x] **Lotus Projector**: reveal info, block Hide and Invisible in Burst 2 (built, deployables.js; untested)
- [ ] **ICEOUT Drone**: tech immunity and no tech actions in Burst 1
- [x] **Tempest Drone**: Hull save or 4 energy and knockback 3 when adjacent (built, deployables.js; untested)
- [ ] **Portable Bunker**, **Perimeter Command Plate**, **Webjaw Snare**, **Pattern-A/B charges**, **Javelin Rockets**, **Swarm Body**
- [ ] **Grenade and mine families**: Smoke, HEX, BB Breach/Blast, Flash, Mesmer, Roller, HAVOK, Grounding
- [ ] **Barriers**: OASIS Wall, Magnetic Shield, Hardlight Defense System, Blinkshield, Repulser Field, Clamp Bombs
- [ ] **Restock Drone** and **Autoloader Drone**: clear heat and a condition, reload a Loading weapon
- [ ] **StunCrown**, **Flak Launcher**, **Whitewash Sealant Spray**, **Charged Stake**, **Ferrous Lash**, **Cable Winch System**, **EMP Pulse**: save-or-effect quick actions (can use `executeSaveVsEffect`)

## 4. Tech actions
- [ ] Review which already work through the Lancer system's tech flow: Tracking Bug, Neurospike, H0R_OS I/II/III, Metahook, Beckoner, Smite, Viral Logic Suite, Aggressive System Sync, Metafold Carver, Law of Blades, Tesseract, PUPPETMASTER, OSIRIS
- [ ] Automate the effects that need movement or teleport: Puppet System, Beckon, Summon, Ophidian Trek, Fold Space, Celestial Shackles

## 5. Leave as narrative or table rulings
- COMP/CON Assistant Unit, Expanded Compartment, Manipulators, EVA Module, High-Stress Mag Clamps, MULE Harness, Reinforced Cabling (Grapple Swing, Drag Down)

## 6. Already handled elsewhere
- Custom Paint Job: built into Lancer Automations
- Technophile NHPs: created by `technophile.js`
- Ammo Case I-III: created by `walking-armory.js`

## Questions
Things I wasn't sure about and didn't want to guess at. Answer inline and I'll build or fix from there.

- **Heat from `heat_self` tags**: does the Lancer system apply a system's `heat_self` (Lightning Generator, Plasma Gauntlet-style costs, Type-3 Shield, etc.) automatically when you use it? I assumed yes and only applied heat by hand where a system fires on its own (Lightning Generator's automatic Danger Zone burst).
- **Deployable and area systems**: Templatemacro is now a required dependency. Built: Hive, Tempest, Sentinel, Lotus, Caltrop. Still open: ICEOUT, Portable Bunker, barriers, grenades and mines.
- **Stasis Bolt / Interdiction Point**: "contested ranged attack roll" has no direct API as far as I can see (`executeContestedCheck` is for stat checks). Should I compare the two attack rolls by hand (prompt for each total), or use a Grit-based check?
- **Reactions that Skirmish** (Monitor Module, SCYLLA): can I trigger a weapon attack from code with half damage, and how should it pick the weapon (prompt per weapon)? `attackWith` exists but I haven't confirmed it takes a half-damage flag.
- **SISYPHUS Probabilistic Cannibalism** (replace any d20 in Sensors): LA's `modifyRoll` only covers structure and stress rolls. Is a table ruling acceptable, or is there a reroll hook you know of?
- **Blinkfield Intervention** (ENCLAVE shield): needs the dome's area and a flag that it is up. Same zone question as above.
- **Plasma Gauntlet**: the 4d6 isn't marked AP (the save helper has no AP option), and the Heat back to you (half the damage dealt) is left as a table ruling. Is that fine?
- **LUCIFER NHP**: bonus damage equal to current heat after activation, but its own `heat_self` (1d3+3) lands in some order I can't see. Do you want it to read the heat at attack time instead?
- **SEKHMET / TLALOC NHP**: both hand control of the mech to the NHP. Is that a table ruling for you?
- **Aceso Stabilizer**: I set the ally's overshield to the larger of the current value and GRIT + 4, and left the Impaired/Jammed immunity until you remove it. Should it end automatically when the overshield hits 0?
- **Reload systems** (External Ammo Feed, Autoloader Drone, Restock Drone): reloading means picking which Loading weapon. Is a one-weapon-at-a-time prompt fine?
- **Tech actions** (section 4): do Tracking Bug, Neurospike, the H0R_OS upgrades and similar already do what you want through the Lancer system's tech flow, or do you want their on-hit effects applied for you?

- **Deployable assumptions to verify**: (a) effect names `cover_soft` and `hidden` exist as LA/Lancer effects; if not, Hive cover and Lotus Hidden-removal do nothing. (b) Lotus Projector's 'ignore Invisible against you' is not automated (no known bonus type). (c) Do the deploy actions of these systems actually fire `onDeploy` with `onlyOnSourceMatch`? Test by deploying each. (d) Tempest/Hive/Sentinel damage is attributed to the drone token via the owner; confirm damage cards show the right source. (e) Aura repeats: Tempest and Hive save/damage on TARGET_TURN_START plus first ENTER per round; check there is no double-trigger.
- **Scene = encounter**: per-scene effects use LA's 'encounter' duration or onExitCombat (Hunter Lock, Black ICE, Caltrop zones). Verify Caltrop zones clear when the encounter ends, and that the zone placement result exposes `template.id` as assumed.

## Upstream issues to file (lancer-automations)
- **Attack picker doesn't enforce range.** `pickSingleTargetToggle` (scripts/interactive/tools/pickSingleTargetToggle.js) paints the cursor red when out of range but `clickHandler` selects any token regardless. A Threat 1 melee weapon can target a token 5 spaces away. Reproduces as GM and on any character, not Hunter-specific. Ask: block (or warn on) out-of-range clicks.
- **Skirmish Weapon Order card stays up during the first attack's damage roll.** `executeSkirmish` (scripts/tools/misc-tools.js) opens a "complete all" choice card whose buttons run each weapon's whole attack flow, so the card sits over the attack and damage HUDs. Ask: hide or minimize it while a weapon's flow is running.
- **Attack/Throw choice card shows the base Thrown range, not the bonus.** `throwChoiceStep` (scripts/activations/flow-steps-extra.js) labels the button from the weapon's raw `tg_thrown` tag (`thrownTag.val`), so a Tactical Knife under Knife Juggler (Thrown 5) reads "Throw (3)", while the attack card and picker correctly use 5. Label only. Ask: use the bonus-adjusted value (e.g. `getMaxItemRanges_WithBonus(...).Thrown`). In testing the label reads 3 the first time the weapon is selected, and 5 if you cancel and select it again, which suggests the bonus lands on the weapon's tags only after the first pass through the flow. Cause not confirmed.
