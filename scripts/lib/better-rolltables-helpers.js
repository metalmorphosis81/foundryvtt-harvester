import {
    customLootCompendium,
    harvestAction,
    harvesterBetterRollCompendium,
    harvesterCompendium,
    lootAction,
    lootCompendium,
} from "../../module.js";
import { CONSTANTS } from "../constants.js";
import { SETTINGS } from "../settings.js";
import Logger from "./Logger.js";
import { checkCompendium, formatDragon, retrieveItemSourceLabelDC, searchCompendium, testWithRegex } from "./lib.js";

export default class BetterRollTablesHelpers {
    static _testRegexTable(sourceValue, doc, actionName) {
        const enableExactMatchForSourceReference = SETTINGS.enableExactMatchForSourceReference;
        const enableAnySuffixMatchForSourceReference = SETTINGS.enableAnySuffixMatchForSourceReference;

        if (game.modules.get("better-rolltables")?.active) {
            let isFound = false;
            let brtSourceReference = foundry.utils.getProperty(doc, `flags.better-rolltables.brt-source-value`)?.trim() || "";
            brtSourceReference = brtSourceReference.replaceAll("Loot | ", "");
            brtSourceReference = brtSourceReference.replaceAll("Harvester | ", "");
            brtSourceReference = brtSourceReference.replaceAll("Better ", "");
            brtSourceReference = brtSourceReference.replaceAll(" RollTable", "");
            if (brtSourceReference && actionName === harvestAction.name) {
                isFound = testWithRegex(
                    sourceValue,
                    brtSourceReference,
                    enableExactMatchForSourceReference,
                    enableAnySuffixMatchForSourceReference,
                );
            } else if (brtSourceReference && actionName === lootAction.name) {
                isFound = testWithRegex(
                    sourceValue,
                    brtSourceReference,
                    enableExactMatchForSourceReference,
                    enableAnySuffixMatchForSourceReference,
                );
            } else {
                isFound = false;
            }
            if (!isFound && SETTINGS.forceSearchRollTableByName && actionName === lootAction.name) {
                let standardSourceReference = foundry.utils.getProperty(doc, `name`)?.trim() || "";
                standardSourceReference = standardSourceReference.replaceAll("Loot | ", "");
                standardSourceReference = standardSourceReference.replaceAll("Harvester | ", "");
                standardSourceReference = standardSourceReference.replaceAll("Better ", "");
                standardSourceReference = standardSourceReference.replaceAll(" RollTable", "");
                if (standardSourceReference && actionName === harvestAction.name) {
                    return testWithRegex(
                        sourceValue,
                        standardSourceReference,
                        enableExactMatchForSourceReference,
                        enableAnySuffixMatchForSourceReference,
                    );
                } else if (standardSourceReference && actionName === lootAction.name) {
                    return testWithRegex(
                        sourceValue,
                        standardSourceReference,
                        enableExactMatchForSourceReference,
                        enableAnySuffixMatchForSourceReference,
                    );
                } else {
                    return false;
                }
            } else {
                return isFound;
            }
        } else {
            let standardSourceReference = foundry.utils.getProperty(doc, `name`)?.trim() || "";
            standardSourceReference = standardSourceReference.replaceAll("Loot | ", "");
            standardSourceReference = standardSourceReference.replaceAll("Harvester | ", "");
            standardSourceReference = standardSourceReference.replaceAll("Better ", "");
            standardSourceReference = standardSourceReference.replaceAll(" RollTable", "");
            if (standardSourceReference && actionName === harvestAction.name) {
                return testWithRegex(
                    sourceValue,
                    standardSourceReference,
                    enableExactMatchForSourceReference,
                    enableAnySuffixMatchForSourceReference,
                );
            } else if (standardSourceReference && actionName === lootAction.name) {
                return testWithRegex(
                    sourceValue,
                    standardSourceReference,
                    enableExactMatchForSourceReference,
                    enableAnySuffixMatchForSourceReference,
                );
            } else {
                return false;
            }
        }
    }

    static retrieveTablesHarvestWithBetterRollTables(actorName, actionName) {
        if (actionName === harvestAction.name) {
            let sourceValue = actorName.trim() ?? "";
            if (sourceValue.includes("Dragon")) {
                sourceValue = formatDragon(sourceValue)?.trim();
            }
            let tablesChecked = [];
            if (game.modules.get("better-rolltables")?.active && harvesterBetterRollCompendium) {
                // Try with the brt tables
                for (const doc of harvesterBetterRollCompendium) {
                    if (BetterRollTablesHelpers._testRegexTable(sourceValue, doc, actionName)) {
                        Logger.debug(
                            `retrieveTablesHarvestWithBetterRollTables | BRT COMPENDIUM | Find document ${doc.name} with check regex ${sourceValue} validate with ${foundry.utils.getProperty(doc, `flags.better-rolltables.brt-source-value`)?.trim()}`,
                        );
                        tablesChecked.push(doc);
                    }
                }
            }
            // Try with the base compendium
            for (const doc of harvesterCompendium) {
                if (BetterRollTablesHelpers._testRegexTable(sourceValue, doc, actionName)) {
                    Logger.debug(
                        `retrieveTablesHarvestWithBetterRollTables | STANDARD COMPENDIUM | Find document ${doc.name} with check regex ${sourceValue} validate with ${doc.name}}`,
                    );
                    tablesChecked.push(doc);
                }
            }
            // TODO add some custom compendium ?
            // Try on the tables imported
            if (!tablesChecked || tablesChecked.length === 0) {
                for (const doc of game.tables.contents) {
                    if (BetterRollTablesHelpers._testRegexTable(sourceValue, doc, actionName)) {
                        Logger.debug(
                            `retrieveTablesHarvestWithBetterRollTables | STANDARD WORLD | Find document ${doc.name} with check regex ${sourceValue} validate with ${doc.name}}`,
                        );
                        tablesChecked.push(doc);
                    }
                }
            }
            // We juts get the first
            if (!tablesChecked || tablesChecked.length === 0) {
                Logger.warn(
                    `retrieveTablesHarvestWithBetterRollTables | BRT No rolltable found for metadata sourceId '${sourceValue}'`,
                    true,
                );
                return [];
            }
            return tablesChecked;
        } else {
            Logger.warn(
                `retrieveTablesHarvestWithBetterRollTables | BRT No rolltable found for action '${harvestAction.name}'`,
                true,
            );
            return [];
        }
    }

    static async retrieveItemsDataHarvestWithBetterRollTables(
        tableHarvester,
        actorName,
        actionName,
        dcValue = null,
        skillDenom = null,
    ) {
        let returnArr = [];
        if (actionName === harvestAction.name) {
            if (!dcValue) {
                dcValue = 0;
            }
            if (!skillDenom) {
                skillDenom = "";
            }
            
            if (game.modules.get("better-rolltables")?.active) {
                Logger.debug(`retrieveItemsDataHarvestWithBetterRollTables | BRT | START`);
                returnArr = await game.modules.get("better-rolltables").api.retrieveItemsDataFromRollTableResult({
                    table: tableHarvester,
                    options: {
                        rollMode: "gmroll",
                        dc: dcValue,
                        skill: skillDenom,
                        displayChat: false,
                    },
                });
                Logger.debug(`retrieveItemsDataHarvestWithBetterRollTables | BRT | returnArr`, returnArr);
            } else {
                Logger.debug(`retrieveItemsDataHarvestWithBetterRollTables | STANDARD | START`);
                // let results = (await tableHarvester.drawMany(roll.total, { displayChat, recursive: true })).results;
                let results = tableHarvester.results?.contents || [];
                const rolledItems = [];
                for (const rollData of results) {
                    let item;
                    const brtUuid = foundry.utils.getProperty(rollData, "flags.better-rolltables.brt-result-uuid");
                    const resolvedUuid = brtUuid
                        ? brtUuid.replace(/Compendium\.harvester\./, `Compendium.${CONSTANTS.MODULE_ID}.`)
                        : null;
                    if (resolvedUuid) {
                        item = await fromUuid(resolvedUuid);
                    } else if (rollData.documentId) {
                        // Translate old pack name if needed
                        const rawCollection = rollData.documentCollection ?? "";
                        const collection = rawCollection.replace(/^harvester\./, `${CONSTANTS.MODULE_ID}.`);
                        if (collection === "Item") {
                            item = game.items.get(rollData.documentId);
                        } else {
                            const compendium = game.packs.get(collection);
                            if (compendium) {
                                item = await compendium.getDocument(rollData.documentId);
                            }
                        }
                    }

                    if (!item) {
                        Logger.warn(
                            `retrieveItemsDataHarvestWithBetterRollTables | STANDARD | No item is been found with this reference`,
                            false,
                            rollData,
                        );
                        continue;
                    }

                    if (item instanceof foundry.documents.RollTable) {
                        // do nothing
                    } else if (item instanceof foundry.documents.Item) {
                        rolledItems.push(item);
                    }
                }
                for (const item of rolledItems) {
                    if (item) {
                        Logger.debug(
                            `retrieveItemsDataHarvestWithBetterRollTables | STANDARD | check matchedItem`,
                            item,
                        );
                        let itemDC = 0;
                        // DC is stored in system.description.chat for harvest compendium items
                        const descChat = item.system?.description?.chat;
                        const parsedChat = descChat ? parseInt(descChat) : NaN;
                        if (!isNaN(parsedChat)) {
                            itemDC = parsedChat;
                        } else {
                            itemDC = retrieveItemSourceLabelDC(item);
                        }
                        Logger.debug(
                            `retrieveItemsDataHarvestWithBetterRollTables | STANDARD | Item DC is '${itemDC}'`,
                        );
                        if (itemDC <= dcValue) {
                            Logger.debug(
                                `retrieveItemsDataHarvestWithBetterRollTables | STANDARD | the item ${item.name} is been added as success`,
                            );
                            const itemData = item instanceof foundry.documents.Item ? item.toObject() : item;
                            if (!itemData.uuid) {
                                foundry.utils.setProperty(itemData, `uuid`, item.uuid || null);
                            }
                            returnArr.push(item);
                        }
                        Logger.debug(`retrieveItemsDataHarvestWithBetterRollTables | STANDARD | returnArr`, returnArr);
                    }
                }
            }
        } else {
            Logger.warn(
                `retrieveItemsDataHarvestWithBetterRollTables | No rolltable found for action '${harvestAction.name}'`,
                true,
            );
            return [];
        }

        return returnArr ?? [];
    }

    static async retrieveResultsDataLootWithBetterRollTables(tableEntity, actorName, actionName) {
        let returnArr = [];
        if (actionName === lootAction.name) {
            const tableLooting = tableEntity;
            if (game.modules.get("better-rolltables")?.active) {
                returnArr = await game.modules.get("better-rolltables").api.betterTableRoll(tableLooting, {
                    rollMode: "gmroll",
                    displayChat: false,
                });
            } else {
                returnArr = (
                    await tableLooting.drawMany(1, {
                        rollMode: "gmroll",
                        displayChat: false,
                        recursive: true,
                    })
                ).results;
            }
        } else {
            Logger.warn(
                `retrieveResultsDataLootWithBetterRollTables | No rolltable found for action '${lootAction.name}'`,
                true,
            );
            return [];
        }

        return returnArr ?? [];
    }

    static retrieveTablesLootWithBetterRollTables(actorName, actionName) {
        if (actionName === lootAction.name) {
            let sourceValue = actorName.trim() ?? "";
            if (sourceValue.includes("Dragon")) {
                sourceValue = formatDragon(sourceValue)?.trim();
            }
            let tablesChecked = [];
            // TODO add some brt compendium ?
            // Try with the base compendium
            for (const doc of lootCompendium) {
                if (BetterRollTablesHelpers._testRegexTable(sourceValue, doc, actionName)) {
                    Logger.debug(
                        `retrieveTablesLootWithBetterRollTables | STANDARD COMPENDIUM | Find document ${doc.name} with check regex ${sourceValue} validate with ${doc.name}}`,
                    );
                    tablesChecked.push(doc);
                }
            }
            // Try with the custom compendium
            for (const doc of customLootCompendium) {
                if (BetterRollTablesHelpers._testRegexTable(sourceValue, doc, actionName)) {
                    Logger.debug(
                        `retrieveTablesLootWithBetterRollTables | STANDARD COMPENDIUM CUSTOM | Find document ${doc.name} with check regex ${sourceValue} validate with ${doc.name}}`,
                    );
                    tablesChecked.push(doc);
                }
            }
            // Try on the tables imported
            if (!tablesChecked || tablesChecked.length === 0) {
                for (const doc of game.tables.contents) {
                    if (BetterRollTablesHelpers._testRegexTable(sourceValue, doc, actionName)) {
                        Logger.debug(
                            `retrieveTablesLootWithBetterRollTables | STANDARD WORLD | Find document ${doc.name} with check regex ${sourceValue} validate with ${doc.name}}`,
                        );
                        tablesChecked.push(doc);
                    }
                }
            }
            // We juts get the first
            if (!tablesChecked || tablesChecked.length === 0) {
                Logger.warn(
                    `retrieveTablesLootWithBetterRollTables | BRT No rolltable found for metadata sourceId '${sourceValue}'`,
                    true,
                );
                return [];
            }
            return tablesChecked;
        } else {
            Logger.warn(
                `retrieveTablesLootWithBetterRollTables | BRT No rolltable found for action '${lootAction.name}'`,
                true,
            );
            return [];
        }
    }
}
