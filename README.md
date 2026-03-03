# Better Harvesting & Looting (v13)

A Foundry VTT module for Dungeons & Dragons 5e that allows players to harvest crafting materials from creature corpses and loot currency from defeated enemies.

This is a community-maintained fork of the original [Better Harvesting & Looting](https://github.com/p4535992/foundryvtt-harvester) module, updated for **Foundry VTT v13** and **dnd5e v4**.

---

## Requirements

- Foundry VTT v13+
- dnd5e system v4+
- [socketlib](https://foundryvtt.com/packages/socketlib) (required)
- [Item Piles](https://foundryvtt.com/packages/item-piles) (optional, recommended)
- [Better Roll Tables](https://foundryvtt.com/packages/better-rolltables) (optional)

---

## Features

### Harvesting

- Players can harvest crafting materials from defeated creatures using the **Harvest** action, which is automatically added to PC and/or NPC sheets based on module settings.
- The correct skill check is determined automatically from the creature's harvest table (e.g. Investigation for oozes, Nature for beasts).
- The skill check dialog supports **advantage and disadvantage** via the standard dnd5e roll configuration (hold Alt for advantage).
- Items awarded are displayed by name and icon in the chat card and added to the harvesting actor's inventory.

#### Size-based harvest limits

Creatures can be harvested multiple times based on their size. The harvested status icon only appears on the token once the creature has been fully harvested.

| Size | Harvests allowed |
|------|-----------------|
| Tiny | 1 |
| Small | 1 |
| Medium | 2 |
| Large | 3 |
| Huge | 4 |
| Gargantuan | 4 |

Size is read directly from the creature's actor sheet, so custom homebrew monsters are fully supported.

### Looting

- Players can loot currency from defeated creatures using the **Loot** action.
- Currency formulas (e.g. `4d6*100cp`) are rolled automatically and the actual amounts are displayed.
- A **GM-only confirmation dialog** appears showing what was found and which creature it came from, with buttons to add the loot to the looting actor's inventory or discard it.
- The chat card reflects the outcome — showing loot received or indicating nothing was found.

---

## v13 Migration Notes

This fork addresses the following breaking changes from Foundry v11/v12 to v13:

### Bug Fixes

- **Removed Requestor dependency** — replaced with Foundry v13's native `DialogV2` API. The Requestor module is no longer required.
- **Fixed ES module imports** — all import paths now include `.js` extensions as required by v13's strict ES module handling.
- **Fixed module ID** — internal constants, compendium references, and socket registration all use the correct `harvester-v13` module ID.
- **Fixed `dnd5e.postUseActivity` hook timing** — dnd5e v4 does not await this hook, so harvest/loot dialogs are now deferred via `setTimeout` to prevent silent failures.
- **Fixed `rollSkill` API** — updated to the dnd5e v4 signature: `actor.rollSkill({ skill: "inv" }, { configure: true })`.
- **Fixed deprecated globals** — replaced `Token`, `Item`, `RollTable`, and `TokenDocument` with their namespaced equivalents (`foundry.canvas.placeables.Token`, `foundry.documents.*`).
- **Fixed `TableResult#documentCollection`** — replaced with `fromUuid()` using the `brt-result-uuid` flag, with automatic translation of old `harvester.*` pack IDs to `harvester-v13.*`.
- **Fixed `StatusEffectConfig#icon`** — updated to `img` as required by v13.
- **Fixed actor resolution** — `validateAction` now always reads from `targetedToken.actor` rather than the token delta, ensuring correct size and HP values on unlinked tokens.
- **Fixed compendium skill value** — `brt-skill-value` flags are now read directly from roll table documents regardless of whether Better Roll Tables is active.
- **Fixed item DC check** — no longer relies on `item.compendium.metadata.id`; reads `system.description.chat` directly with a safe fallback.
- **Fixed grey/gray spelling** — creature name matching normalises British/American spelling variants before regex comparison.

### New Features

- **Size-based harvest limits** — creatures can be harvested multiple times based on their creature size (see table above).
- **Harvest count tracking** — stored on the token document flags, works correctly for both linked and unlinked tokens across sessions.
- **Harvested icon timing** — the Harvested status effect icon only appears on the token after the maximum number of harvests has been reached.
- **Full skill names** — the skill check button shows the full skill name (e.g. "Investigation") rather than the abbreviation ("inv").
- **Item display** — harvested items are shown with their icon and name in the chat card rather than raw UUIDs.
- **Advantage/disadvantage support** — the roll configuration dialog always appears, allowing Alt (advantage) and Ctrl (disadvantage).
- **Evaluated loot amounts** — loot currency formulas are rolled and evaluated before display; the chat card shows actual amounts (e.g. `1400cp`) not formulas.
- **GM loot confirmation** — a private GM dialog appears after looting showing what was found and from which creature, with options to add to the actor's inventory or discard.

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Harvesting: Allow ability score change on roll | Lets players choose a different ability score for the harvest check | Off |
| Harvesting: Search RollTable by name | Forces name-based table lookup even when Better Roll Tables is active | Off |
| Looting: Disable Looting mechanic | Disables the Loot action entirely | Off |
| Auto add items | Automatically adds harvested/looted items to actor inventory | On |
| GM Only | Whispers harvest/loot results to GM only | Off |
| NPC Only Harvest | Prevents harvesting player-owned tokens | Off |
| Require Dead effect | Requires the Dead status effect before harvesting | Off |
| Enforce Range | Enforces distance limits based on creature size | Off |

---

## Credits

Original module by [p4535992](https://github.com/p4535992). v13 migration and new features by the community.
