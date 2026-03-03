import { addEffect } from "../module.js";
import API from "./api.js";
import { CONSTANTS } from "./constants.js";
import { HarvestingHelpers } from "./lib/harvesting-helpers.js";

export let harvesterAndLootingSocket;
export function registerSocket() {
    //Logger.debug("Registered harvesterAndLootingSocket");
    if (harvesterAndLootingSocket) {
        return harvesterAndLootingSocket;
    }

    harvesterAndLootingSocket = socketlib.registerModule(CONSTANTS.MODULE_ID);
    /**
     * Automated EvocationsVariant sockets
     */
    harvesterAndLootingSocket.register("addEffect", addEffect);
    harvesterAndLootingSocket.register(
        "addItemsToActorHarvesterOption",
        HarvestingHelpers.addItemsToActorHarvesterOption,
    );

    // Basic
    game.modules.get(CONSTANTS.MODULE_ID).socket = harvesterAndLootingSocket;
    return harvesterAndLootingSocket;
}
