import { registerSettings, SETTINGS } from "./scripts/settings.js";
import { CONSTANTS } from "./scripts/constants.js";
import API from "./scripts/api.js";
import {
    checkItemSourceLabel,
    retrieveItemSourceLabelDC,
    retrieveItemSourceLabel,
    formatDragon,
    isEmptyObject,
} from "./scripts/lib/lib.js";
import Logger from "./scripts/lib/Logger.js";
import { HarvestingHelpers } from "./scripts/lib/harvesting-helpers.js";
import { LootingHelpers } from "./scripts/lib/looting-helpers.js";
import { RetrieveHelpers } from "./scripts/lib/retrieve-helpers.js";
import ItemPilesHelpers from "./scripts/lib/item-piles-helpers.js";
import { registerSocket } from "./scripts/socket.js";

export let actionCompendium;
export let harvestCompendium;
export let lootCompendium;
export let customCompendium;
export let customLootCompendium;
export let harvesterCompendium;
export let harvesterBetterRollCompendium;
export let harvestAction;
export let lootAction;
export let currencyFlavors;

Hooks.on("init", function () {
    registerSettings();
    Logger.log("Init() - Registered settings & Fetched compendiums.");
});

Hooks.once("setup", function () {
    game.modules.get(CONSTANTS.MODULE_ID).api = API;
});

Hooks.on("ready", async function () {
    actionCompendium = await game.packs.get(CONSTANTS.actionCompendiumId).getDocuments();
    harvestCompendium = await game.packs.get(CONSTANTS.harvestCompendiumId).getDocuments();
    lootCompendium = await game.packs.get(CONSTANTS.lootCompendiumId).getDocuments();
    harvesterCompendium = await game.packs.get(CONSTANTS.harvesterCompendiumId).getDocuments();
    customCompendium = await game.packs.get(CONSTANTS.customCompendiumId).getDocuments();
    customLootCompendium = await game.packs.get(CONSTANTS.customLootCompendiumId).getDocuments();
    if (game.modules.get("better-rolltables")?.active) {
        harvesterBetterRollCompendium = await game.packs.get(CONSTANTS.betterRollTableId)?.getDocuments();
    }

    harvestAction = await actionCompendium.find((a) => a.id === CONSTANTS.harvestActionId);
    if (!harvestAction) {
        throw Logger.error(
            `Requires the 'harvestAction' on the compendium '${CONSTANTS.actionCompendiumId}' with id '${CONSTANTS.harvestActionId}'`,
        );
    }
    lootAction = await actionCompendium.find((a) => a.id === CONSTANTS.lootActionId);
    if (!lootAction) {
        throw Logger.error(
            `Requires the 'lootAction' on the compendium '${CONSTANTS.actionCompendiumId}' with id '${CONSTANTS.lootActionId}'`,
        );
    }

    currencyFlavors = Array.from(CONSTANTS.currencyMap.keys());

    if (!game.modules.get("socketlib")?.active && game.user?.isGM) {
        let word = "install and activate";
        if (game.modules.get("socketlib")) word = "activate";
        throw Logger.error(`Requires the 'socketlib' module. Please ${word} it.`);
    }


    if (game.modules.get("better-rolltables")?.active && SETTINGS.forceSearchRollTableByName) {
        Logger.warn(
            `Attention the module settings "Looting: Search RollTable by name if no 'Source reference is found with BRT" is enabled and with BRT present and acvtive`,
        );
    }

    if (game.users.activeGM?.id !== game.user.id) {
        return;
    }
    await addActionToActors();
    // Add Effects - v13 requires _id field in statusEffect objects
    CONFIG.statusEffects = CONFIG.statusEffects.concat(
        {
            _id: CONSTANTS.harvestActionEffectId,
            id: CONSTANTS.harvestActionEffectId,
            img: CONSTANTS.harvestActionEffectIcon,
            name: CONSTANTS.harvestActionEffectName,
        },
        {
            _id: CONSTANTS.lootActionEffectId,
            id: CONSTANTS.lootActionEffectId,
            img: CONSTANTS.lootActionEffectIcon,
            name: CONSTANTS.lootActionEffectName,
        },
    );
});

Hooks.once("socketlib.ready", () => {
    registerSocket();
    Logger.log("Registered socketlib functions");
});

Hooks.on("createActor", async (actor, data, options, id) => {
    if (SETTINGS.autoAddActionGroup !== "None") {
        if (SETTINGS.autoAddActionGroup === "PCOnly" && actor.type === "npc") {
            Logger.debug(`CREATE ACTOR Settings 'autoAddActionGroup=PCOnly' and 'actor.type=npc' do nothing`);
            return;
        }

        Logger.debug(`CREATE ACTOR autoAddItems enable harvest action`);

        let hasHarvest = false;
        let hasLoot = false;

        actor.items.forEach((item) => {
            if (item.name === harvestAction.name && checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
                hasHarvest = true;
                resetToDefault(item);
            }
            if (item.name === lootAction.name && checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
                hasLoot = true;
                resetToDefault(item);
            }
        });

        if (!hasHarvest) {
            await addItemsToActor(actor, [harvestAction]);
        }
        if (!hasLoot) {
            if (!SETTINGS.disableLoot) {
                Logger.debug(`createActor | autoAddItems disable loot`);
                await addItemsToActor(actor, [lootAction]);
            }
        }
    } else {
        Logger.debug(`CREATE ACTOR Settings 'autoAddActionGroup=None' do nothing`);
    }
});

const _harvesterPendingActions = new Map();

Hooks.on("dnd5e.preUseActivity", function (activity, usageConfig, dialogConfig, messageConfig) {
    const item = activity?.item;
    if (!item) return;
    if (!checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
        return;
    }
    if (game.user.targets.size !== 1) {
        Logger.warn("Please target only one token.", true);
        return false;
    }

    const targetedToken = game.user.targets.first();
    const controlToken = item.parent?.getActiveTokens()[0];
    if (!controlToken) return false;

    if (!validateAction(controlToken, targetedToken, item.name)) {
        return false;
    }

    _harvesterPendingActions.set(item.uuid, {
        targetId: targetedToken.id,
        controlId: controlToken.id,
        itemName: item.name,
    });

    messageConfig.create = false;
});

Hooks.on("dnd5e.postUseActivity", function (activity, usageConfig, results) {
    const item = activity?.item;
    if (!item) return;
    if (!checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
        return;
    }

    const pending = _harvesterPendingActions.get(item.uuid);
    if (!pending) return;
    _harvesterPendingActions.delete(item.uuid);

    foundry.utils.setProperty(item, `flags.${CONSTANTS.MODULE_ID}.targetId`, pending.targetId);
    foundry.utils.setProperty(item, `flags.${CONSTANTS.MODULE_ID}.controlId`, pending.controlId);

    setTimeout(() => {
        if (pending.itemName === harvestAction.name) {
            HarvestingHelpers.handlePreRollHarvestAction({ item });
        }
        if (pending.itemName === lootAction.name) {
            LootingHelpers.handlePreRollLootAction({ item });
        }
    }, 0);
});


export function validateAction(controlToken, targetedToken, actionName) {
    // v13: measureDistance replaced by measurePath; get distance in grid units
    const path = canvas.grid.measurePath([controlToken.center, targetedToken.center]);
    let measuredDistance = path.distance ?? canvas.grid.measureDistance(controlToken.center, targetedToken.center);

    // Always use targetedToken.actor for a fully resolved actor (handles linked + unlinked tokens)
    // The delta path only contains overrides and may be missing fields like size
    const actor = targetedToken.actor;
    if (!actor) {
        Logger.warn(targetedToken.name + " has not data to retrieve", true);
        return false;
    }

    let targetSize = CONSTANTS.sizeHashMap.get(actor.system.traits?.size || 1);
    if (measuredDistance > targetSize && SETTINGS.enforceRange) {
        Logger.warn("You must be in range to " + actionName, true);
        return false;
    }

    if (actor.system.attributes.hp.value !== 0) {
        Logger.warn(targetedToken.name + " is not dead", true);
        return false;
    }
    if (!checkEffect(targetedToken, "Dead") && SETTINGS.requireDeadEffect) {
        Logger.warn(targetedToken.name + " is not dead", true);
        return false;
    }
    if (targetedToken.document.hasPlayerOwner && SETTINGS.npcOnlyHarvest) {
        Logger.warn(targetedToken.name + " is not an NPC", true);
        return false;
    }
    // Check harvest count limit based on creature size
    const effectName = `${actionName}ed`;
    const creatureSize = actor.system.traits?.size ?? "med";
    const harvestCountBySize = {
        "tiny": 1,
        "sm":   1,
        "med":  2,
        "lg":   3,
        "huge": 4,
        "grg":  4,
    };
    const maxCount = (actionName === harvestAction?.name)
        ? (harvestCountBySize[creatureSize] ?? 1)
        : 1; // loot is always once
    const currentCount = getEffectCount(targetedToken, effectName);
    if (currentCount >= maxCount) {
        Logger.warn(`${targetedToken.name} has been ${actionName.toLowerCase()}ed already`, true);
        return false;
    }
    return true;
}

async function addActionToActors() {
    if (SETTINGS.autoAddActionGroup === "None") {
        return;
    }
    game.actors.forEach(async (actor) => {
        if (SETTINGS.autoAddActionGroup === "PCOnly" && actor.type === "npc") {
            return;
        }
        let hasHarvest = false;
        let hasLoot = false;

        actor.items.forEach((item) => {
            if (item.name === harvestAction.name && checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
                hasHarvest = true;
                resetToDefault(item);
            }
            if (item.name === lootAction.name && checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
                hasLoot = true;
                resetToDefault(item);
            }
        });

        if (!hasHarvest) {
            await addItemsToActor(actor, [harvestAction]);
        }
        if (!hasLoot) {
            if (!SETTINGS.disableLoot) {
                Logger.debug(`addActionToActors | autoAddItems disable loot`);
                await addItemsToActor(actor, [lootAction]);
            }
        }
    });
    Logger.log("harvester | ready() - Added Actions to All Actors specified in Settings");
}

function checkEffect(token, effectName) {
    // Check actor effects and token delta effects (for Dead, etc.)
    const actor = token.actor;
    if (actor?.effects?.some(e => e.name === effectName || e.statuses?.has(effectName.toLowerCase()))) {
        return true;
    }
    if (token.document.delta?.effects?.some(e => e.name === effectName)) {
        return true;
    }
    return false;
}

function getEffectCount(token, effectName) {
    const flagKey = `harvestCount_${effectName.toLowerCase()}`;
    const doc = token.document ?? token;
    const count = foundry.utils.getProperty(doc, `flags.${CONSTANTS.MODULE_ID}.${flagKey}`) ?? 0;
    return count;
}

function resetToDefault(item) {
    let actionDescription = "";
    if (item.name === harvestAction.name) {
        actionDescription = `Harvesting valuable materials from corpses.`;
    }
    if (item.name === lootAction.name) {
        actionDescription = `Looting valuables from corpses.`;
    }
    item.update({
        flags: { harvester: { targetId: "", controlId: "" } },
        system: { formula: "", description: { value: actionDescription } },
    });
}

export async function addEffect(targetTokenId, actionName) {
    let targetToken = RetrieveHelpers.getTokenSync(targetTokenId);
    if (!targetToken) {
        Logger.warn(`No target token is found for  reference '${targetTokenId}' for add the effect '${actionName}'`);
        return;
    }
    await ItemPilesHelpers.unlinkToken(targetToken);
    const actor = targetToken.actor;
    if (!actor) return;

    const effectId = actionName === harvestAction.name
        ? CONSTANTS.harvestActionEffectId
        : actionName === lootAction.name
            ? CONSTANTS.lootActionEffectId
            : null;
    if (!effectId) return;

    const effectName = `${actionName}ed`;

    // Increment harvest count stored on the token document
    const flagKey = `harvestCount_${effectName.toLowerCase()}`;
    const currentCount = foundry.utils.getProperty(targetToken.document, `flags.${CONSTANTS.MODULE_ID}.${flagKey}`) ?? 0;
    const newCount = currentCount + 1;
    // Use update with explicit flag path to avoid unlinkToken clobbering setFlag
    await targetToken.document.update({ [`flags.${CONSTANTS.MODULE_ID}.${flagKey}`]: newCount });

    // Only show the status effect icon once the creature is fully harvested
    if (actionName === harvestAction.name) {
        const creatureSize = actor.system.traits?.size ?? "med";
        const harvestCountBySize = { "tiny": 1, "sm": 1, "med": 2, "lg": 3, "huge": 4, "grg": 4 };
        const maxCount = harvestCountBySize[creatureSize] ?? 1;
        if (newCount >= maxCount) {
            await actor.toggleStatusEffect(effectId, { active: true });
        }
    } else {
        // Loot is always once - show icon immediately
        await actor.toggleStatusEffect(effectId, { active: true });
    }
    Logger.log(`Added ${actionName.toLowerCase()}ed effect to: ${targetToken.name}`);
}

export async function addItemsToActor(actor, itemsToAdd) {
    if (SETTINGS.autoAddItems) {
        if (game.modules.get("item-piles")?.active) {
            Logger.debug(`Add items with ITEMPILES to ${actor.name}`, itemsToAdd);
            await game.itempiles.API.addItems(actor, itemsToAdd, {
                mergeSimilarItems: true,
            });
            Logger.log(`Added ${itemsToAdd.length} items to ${actor.name}`);
        } else {
            Logger.debug(`Add items with STANDARD to ${actor.name}`, itemsToAdd);
            await _addItemsToActorStandard(actor, itemsToAdd);
        }
    } else {
        Logger.debug(`The module settings 'Auto add items' is disabled`);
    }
}

/**
 * @deprecated the solution with item piles is much better
 * @param {Item}  item The item to add to the actor
 * @param {Actor} actor to which to add items to
 * @param {boolean} stackSame if true add quantity to an existing item of same name in the current actor
 * @param {number} customLimit
 * @returns {Item} the create/updated Item
 */
async function _addItemsToActorStandard(actor, itemsToAdd, stackSame = true, customLimit = 0) {
    for (const item of itemsToAdd) {
        const QUANTITY_PROPERTY_PATH = "system.quantity";
        const WEIGHT_PROPERTY_PATH = "system.weight";
        const PRICE_PROPERTY_PATH = "system.price";

        const newItemData = item;
        const itemPrice = foundry.utils.getProperty(newItemData, PRICE_PROPERTY_PATH) || 0;
        const embeddedItems = [...actor.getEmbeddedCollection("Item").values()];
        // Name should be enough for a check for the same item right ?
        const originalItem = embeddedItems.find((i) => i.name === newItemData.name);

        /** if the item is already owned by the actor (same name and same PRICE) */
        if (originalItem && stackSame) {
            /** add quantity to existing item */

            const stackAttribute = QUANTITY_PROPERTY_PATH;
            const priceAttribute = PRICE_PROPERTY_PATH;
            const weightAttribute = WEIGHT_PROPERTY_PATH;

            const newItemQty = foundry.utils.getProperty(newItemData, stackAttribute) || 1;
            const originalQty = foundry.utils.getProperty(originalItem, stackAttribute) || 1;
            const updateItem = { _id: originalItem.id };
            const newQty = Number(originalQty) + Number(newItemQty);
            if (customLimit > 0) {
                // limit is bigger or equal to newQty
                if (Number(customLimit) < Number(newQty)) {
                    // limit was reached, we stick to that limit
                    Logger.warn("Custom limit is been reached for the item '" + item.name + "'", true);
                    return customLimit;
                }
            }
            // If quantity differ updated the item
            if (newQty !== newItemQty) {
                foundry.utils.setProperty(updateItem, stackAttribute, newQty);

                const newPriceValue =
                    (foundry.utils.getProperty(originalItem, priceAttribute)?.value ?? 0) +
                    (foundry.utils.getProperty(newItemData, priceAttribute)?.value ?? 0);
                const newPrice = {
                    denomination: foundry.utils.getProperty(item, priceAttribute)?.denomination,
                    value: newPriceValue,
                };
                foundry.utils.setProperty(updateItem, `${priceAttribute}`, newPrice);

                const newWeight =
                    (foundry.utils.getProperty(originalItem, weightAttribute) ?? 1) +
                    (foundry.utils.getProperty(newItemData, weightAttribute) ?? 1);
                foundry.utils.setProperty(updateItem, `${weightAttribute}`, newWeight);

                await actor.updateEmbeddedDocuments("Item", [updateItem]);
                Logger.log(`Updated ${item.name} to ${actor.name}`);
            } else {
                Logger.log(`Nothing is done with ${item.name} on ${actor.name}`);
            }
        } else {
            /** we create a new item if we don't own already */
            await actor.createEmbeddedDocuments("Item", [newItemData]);
            Logger.log(`Added ${item.name} to ${actor.name}`);
        }
    }
}
