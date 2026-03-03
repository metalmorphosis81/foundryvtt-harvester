import {
    validateAction,
    actionCompendium,
    harvestCompendium,
    lootCompendium,
    customCompendium,
    customLootCompendium,
    harvesterBetterRollCompendium,
    harvestAction,
    lootAction,
    currencyFlavors,
    addEffect,
    addItemsToActor,
} from "../../module.js";
import { CONSTANTS } from "../constants.js";
import { RequestorHelpers } from "../requestor-helpers.js";
import { SETTINGS } from "../settings.js";
import { harvesterAndLootingSocket } from "../socket.js";
import Logger from "./Logger.js";
import BetterRollTablesHelpers from "./better-rolltables-helpers.js";
import ItemPilesHelpers from "./item-piles-helpers.js";
import {
    checkItemSourceLabel,
    retrieveItemSourceLabelDC,
    retrieveItemSourceLabel,
    updateActorCurrencyNoDep,
} from "./lib.js";

export class LootingHelpers {
    static async handlePreRollLootAction(options) {
        Logger.debug(`LootingHelpers | START handlePreRollHarvestAction`);
        if (SETTINGS.disableLoot) {
            Logger.warn(`LootingHelpers | The Loot Action is been disabled by the module setting`, true);
            return;
        }
        const { item } = options;
        if (!checkItemSourceLabel(item, CONSTANTS.SOURCE_REFERENCE_MODULE)) {
            Logger.debug(`LootingHelpers | NO '${CONSTANTS.SOURCE_REFERENCE_MODULE}' found it on item`, item);
            return;
        }

        let targetedToken =
            canvas.tokens.get(foundry.utils.getProperty(item, `flags.${CONSTANTS.MODULE_ID}.targetId`)) ?? game.user.targets.first();
        let targetedActor = game.actors.get(targetedToken.actor?.id ?? targetedToken.document?.actorId);
        let controlledToken =
            canvas.tokens.get(foundry.utils.getProperty(item, `flags.${CONSTANTS.MODULE_ID}.controlId`)) ??
            canvas.tokens.controlled[0];
        let controlActor = game.actors.get(controlledToken.actor?.id ?? controlledToken.document?.actorId);

        if (!targetedToken) {
            Logger.warn(`LootingHelpers | NO targeted token is been found`, true);
            return;
        }

        let actorName = SETTINGS.forceToUseAlwaysActorName
            ? targetedActor
                ? targetedActor.name
                : targetedToken.name
            : targetedToken.name;

        if (!controlledToken) {
            Logger.warn(`LootingHelpers | NO controlled token is been found`, true);
            return;
        }

        let rollTablesMatched = [];
        Logger.debug(`LootingHelpers | Searching RollTablesMatched`);
        rollTablesMatched = BetterRollTablesHelpers.retrieveTablesLootWithBetterRollTables(
            actorName,
            lootAction.name || item.name,
        );
        Logger.debug(`LootingHelpers | Found RollTablesMatched (${rollTablesMatched?.length})`, rollTablesMatched);
        const rollTableChosenLoot = rollTablesMatched[0];
        Logger.info(`LootingHelpers | RollTablesMatched chosen '${rollTableChosenLoot.name}'`);

        
        let matchedItems = [];
        Logger.debug(`LootingHelpers | is enable, and has a rollTable '${rollTableChosenLoot.name}'`);
        matchedItems = await BetterRollTablesHelpers.retrieveResultsDataLootWithBetterRollTables(
            rollTableChosenLoot,
            actorName,
            item.name,
        );

        if (!matchedItems || matchedItems.length === 0) {
            Logger.debug(`LootingHelpers | MatchedItems is empty`);
            Logger.debug(
                `LootingHelpers | '${controlledToken.name}' attempted to harvest resources from '${targetedToken.name}' but failed to find anything for this creature.`,
            );
            await RequestorHelpers.requestEmptyMessage(controlledToken.actor, undefined, game.user.id, {
                chatTitle: "Looting valuable from corpses.",
                chatDescription: `<h3>Looting</h3>'${controlledToken.name}' attempted to loot resources from '${targetedToken.name}' but failed to find anything for this creature.`,
                chatButtonLabel: undefined,
                chatWhisper: undefined,
                chatSpeaker: undefined,
                chatImg: "icons/skills/social/theft-pickpocket-bribery-brown.webp",
            });
        } else {
            Logger.debug(`LootingHelpers | RollTablesMatched is not empty`);

            // Evaluate all currency formulas first
            const evaluatedCurrencies = [];
            for (const result of matchedItems) {
                const currencyLabel = ItemPilesHelpers.generateCurrenciesStringFromString(result.text);
                const evaluatedLabel = await LootingHelpers._evaluateCurrencyString(currencyLabel);
                evaluatedCurrencies.push(evaluatedLabel);
            }

            // Show GM dialog to confirm whether to add loot
            const addToInventory = await RequestorHelpers.requestLootMessage(
                controlActor,
                game.user.id,
                evaluatedCurrencies,
                controlledToken,
                targetedToken,
            );

            if (addToInventory) {
                for (const evaluatedLabel of evaluatedCurrencies) {
                    if (game.modules.get("item-piles")?.active) {
                        Logger.debug(`LootingHelpers | addCurrencies ITEM PILES ${evaluatedLabel}`);
                        await ItemPilesHelpers.addCurrencies(controlledToken, evaluatedLabel);
                    } else {
                        Logger.debug(`LootingHelpers | addCurrencies STANDARD ${evaluatedLabel}`);
                        await updateActorCurrencyNoDep(controlActor, evaluatedLabel);
                    }
                }
            }

            // Post result to chat (whisper to GM if gmOnly)
            let messageDataList = { content: "", whisper: {} };
            if (SETTINGS.gmOnly) {
                messageDataList.whisper = game.users.filter((u) => u.isGM).map((u) => u.id);
            }
            if (addToInventory) {
                const lootMessageList = evaluatedCurrencies.map((e) => `<li>${e}</li>`).join("");
                messageDataList.content = `<h3>Looting</h3>After examining the corpse ${controlledToken.name} looted from ${targetedToken.name}:<ul>${lootMessageList}</ul>`;
            } else {
                messageDataList.content = `<h3>Looting</h3>${controlledToken.name} was unable to find anything on ${targetedToken.name}.`;
            }

            ChatMessage.create(messageDataList);

            Logger.debug(
                `LootingHelpers | LootingHelpers '${controlledToken.name}' attempted to looting resources from '${targetedToken.name}'.`,
            );
        }

        await item.setFlag(CONSTANTS.MODULE_ID, "controlId", "");
        await item.setFlag(CONSTANTS.MODULE_ID, "targetId", "");
        await harvesterAndLootingSocket.executeAsGM(addEffect, targetedToken.id, lootAction.name);
        return false;
    }

    static async handlePostRollLootAction(options) {
        // NOTHING FOR NOW ???
        return false;
    }

    /**
     * Parses a currency string like "4d6*100cp 1d6*10ep", rolls each formula,
     * and returns an evaluated string like "1450cp 30ep".
     */
    static async _evaluateCurrencyString(currencyString) {
        if (!currencyString) return "";
        // Match tokens like "4d6*100cp", "1d6*10ep", "5gp", "3sp" etc.
        const regex = /([0-9d+\-*()]+(?:\.[0-9]+)?)(cp|sp|ep|gp|pp)/gi;
        const results = [];
        let match;
        while ((match = regex.exec(currencyString)) !== null) {
            const formula = match[1];
            const denomination = match[2].toLowerCase();
            try {
                const roll = new Roll(formula);
                await roll.evaluate();
                results.push(`${roll.total}${denomination}`);
            } catch (e) {
                // If formula fails, fall back to raw text
                results.push(`${formula}${denomination}`);
            }
        }
        return results.join(" ") || currencyString;
    }
}
