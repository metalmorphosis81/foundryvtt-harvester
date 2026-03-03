import { CONSTANTS } from "./constants.js";
import Logger from "./lib/Logger.js";
import ItemPilesHelpers from "./lib/item-piles-helpers.js";
import { RetrieveHelpers } from "./lib/retrieve-helpers.js";
import { SETTINGS } from "./settings.js";

/**
 * Resolves the best User object to query for a given actor/token.
 * Prefers a connected non-GM player who owns the actor; falls back to the current user.
 */
function _resolveTargetUser(actorUseForRequest, userId) {
    const actor = actorUseForRequest;
    if (actor) {
        const ownerUser = game.users.find(
            (u) => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"),
        );
        if (ownerUser) return ownerUser;
    }
    return game.users.get(userId) ?? game.user;
}

/**
 * Show a DialogV2 to the appropriate user.
 * If the target is the current user, use DialogV2.wait (local dialog).
 * If the target is a different user, use DialogV2.query (remote via socket).
 */
async function _showDialog(targetUser, type, config) {
    if (targetUser.id === game.user.id) {
        return await foundry.applications.api.DialogV2[type](config);
    } else {
        return await _showDialog(targetUser, type, config);
    }
}

/**
 * Builds the whisper recipient id list based on permission level.
 */
function _buildWhisper(actorSpeaker, permission, userId, chatWhisper) {
    if (chatWhisper !== undefined) return chatWhisper;
    if (permission === RequestorHelpers.PERMISSION.GM) {
        return game.users.filter((u) => u.isGM).map((u) => u.id);
    }
    return game.users
        .filter((u) => u.isGM || u.id === game.user.id || u.id === userId)
        .map((u) => u.id);
}

export class RequestorHelpers {
    /**
     * LIMIT / PERMISSION constants kept for API compatibility with callers.
     */
    static LIMIT = {
        FREE: 0,
        ONCE: 1,
        OPTION: 2,
    };

    static PERMISSION = {
        ALL: 0,
        GM: 1,
        PLAYER: 2,
    };

    static TRUST_OPTIONS = {
        GM: 0,
        OWN: 1,
        FREE: 2,
    };

    static async requestRollSkillMultiple(
        actorUseForRequest,
        tokenUseForRequest,
        userId,
        chatDetails = {
            chatTitle: "",
            chatDescription: "",
            chatButtonLabel: "",
            chatWhisper: undefined,
            chatSpeaker: undefined,
            chatImg: undefined,
        },
        skillDetails = [],
        optionsRequestor = {
            limit: RequestorHelpers.LIMIT.OPTION,
            permission: RequestorHelpers.PERMISSION.ALL,
            popout: false,
        },
    ) {
        chatDetails = foundry.utils.mergeObject(
            { chatTitle: "", chatDescription: "", chatButtonLabel: "", chatWhisper: undefined, chatSpeaker: undefined, chatImg: undefined },
            chatDetails,
        );
        optionsRequestor = foundry.utils.mergeObject(
            { limit: RequestorHelpers.LIMIT.OPTION, permission: RequestorHelpers.PERMISSION.ALL, popout: false },
            optionsRequestor,
        );

        const { chatTitle, chatDescription } = chatDetails;
        const actorSpeaker = tokenUseForRequest?.actor ? tokenUseForRequest.actor : actorUseForRequest;

        Logger.debug(`RequestorHelpers | START requestRollSkillMultiple`, { chatTitle, skillDetails });

        const targetUser = _resolveTargetUser(actorUseForRequest, userId);

        const buttons = skillDetails.map((skillObj) => {
            const {
                skillControlledTokenUuid,
                skillTargetedTokenUuid,
                skillRollTableUuid,
                skillDenomination,
                skillItem,
                skillCallback,
                skillChooseModifier,
                skillButtonLabel,
            } = skillObj;

            return {
                label: skillButtonLabel,
                action: skillDenomination,
                callback: async () => {
                    const rollsRef = await actorSpeaker.rollSkill({ skill: skillDenomination }, {
                        configure: true,
                    });
                    const rollRef = Array.isArray(rollsRef) ? rollsRef[0] : rollsRef;
                    const options = {
                        actor: actorSpeaker,
                        roll: rollRef,
                        skillControlledTokenUuid,
                        skillTargetedTokenUuid,
                        skillRollTableUuid,
                        skillDenomination,
                        item: skillItem,
                    };
                    await game.modules.get(CONSTANTS.MODULE_ID).api[skillCallback](options);
                    return rollRef;
                },
            };
        });

        return await _showDialog(targetUser, "wait", {
            window: { title: chatTitle ?? "Harvesting Skill Check" },
            content: `<div>${chatDescription ?? ""}</div>`,
            buttons,
            rejectClose: false,
        });
    }

    static async requestRollSkill(
        actorUseForRequest,
        tokenUseForRequest,
        userId,
        chatDetails = {
            chatTitle: "",
            chatDescription: "",
            chatButtonLabel: "",
            chatWhisper: undefined,
            chatSpeaker: undefined,
            chatImg: undefined,
        },
        skillDetails = {
            skillControlledTokenUuid: "",
            skillTargetedTokenUuid: "",
            skillRollTableUuid: "",
            skillDenomination: "",
            skillItem: {},
            skillCallback: function () {},
            skillChooseModifier: false,
        },
        optionsRequestor = {
            limit: RequestorHelpers.LIMIT.OPTION,
            permission: RequestorHelpers.PERMISSION.ALL,
            popout: false,
        },
    ) {
        chatDetails = foundry.utils.mergeObject(
            { chatTitle: "", chatDescription: "", chatButtonLabel: "", chatWhisper: undefined, chatSpeaker: undefined, chatImg: undefined },
            chatDetails,
        );
        skillDetails = foundry.utils.mergeObject(
            { skillControlledTokenUuid: "", skillTargetedTokenUuid: "", skillRollTableUuid: "", skillDenomination: "", skillItem: {}, skillCallback: function () {}, skillChooseModifier: false },
            skillDetails,
        );
        optionsRequestor = foundry.utils.mergeObject(
            { limit: RequestorHelpers.LIMIT.OPTION, permission: RequestorHelpers.PERMISSION.ALL, popout: false },
            optionsRequestor,
        );

        const { chatTitle, chatDescription, chatButtonLabel } = chatDetails;
        const {
            skillControlledTokenUuid,
            skillTargetedTokenUuid,
            skillRollTableUuid,
            skillDenomination,
            skillItem,
            skillCallback,
            skillChooseModifier,
        } = skillDetails;

        const actorSpeaker = tokenUseForRequest?.actor ? tokenUseForRequest.actor : actorUseForRequest;

        Logger.debug(`RequestorHelpers | START requestRollSkill`, {
            chatTitle, chatButtonLabel, skillDenomination, skillCallback,
        });

        const targetUser = _resolveTargetUser(actorUseForRequest, userId);

        // No button label means fire the roll immediately without prompting
        if (!chatButtonLabel) {
            const rollsRef = await actorSpeaker.rollSkill({ skill: skillDenomination }, {
                configure: true,
            });
            const rollRef = Array.isArray(rollsRef) ? rollsRef[0] : rollsRef;
            const options = {
                actor: actorSpeaker,
                roll: rollRef,
                skillControlledTokenUuid,
                skillTargetedTokenUuid,
                skillRollTableUuid,
                skillDenomination,
                item: skillItem,
            };
            await game.modules.get(CONSTANTS.MODULE_ID).api[skillCallback](options);
            return rollRef;
        }

        return await _showDialog(targetUser, "wait", {
            window: { title: chatTitle ?? "Harvesting Skill Check" },
            content: `<div>${chatDescription ?? ""}</div>`,
            buttons: [
                {
                    label: chatButtonLabel,
                    action: "roll",
                    callback: async () => {
                        const rollsRef = await actorSpeaker.rollSkill({ skill: skillDenomination }, {
                            configure: true,
                        });
                        const rollRef = Array.isArray(rollsRef) ? rollsRef[0] : rollsRef;
                        const options = {
                            actor: actorSpeaker,
                            roll: rollRef,
                            skillControlledTokenUuid,
                            skillTargetedTokenUuid,
                            skillRollTableUuid,
                            skillDenomination,
                            item: skillItem,
                        };
                        await game.modules.get(CONSTANTS.MODULE_ID).api[skillCallback](options);
                        return rollRef;
                    },
                },
            ],
            rejectClose: false,
        });
    }

    static async requestEmptyMessage(
        actorUseForRequest,
        tokenUseForRequest,
        userId,
        chatDetails = {
            chatTitle: "",
            chatDescription: "",
            chatButtonLabel: "",
            chatWhisper: undefined,
            chatSpeaker: undefined,
            chatImg: undefined,
        },
        optionsRequestor = {
            limit: RequestorHelpers.LIMIT.OPTION,
            permission: RequestorHelpers.PERMISSION.ALL,
            popout: false,
        },
    ) {
        chatDetails = foundry.utils.mergeObject(
            { chatTitle: "", chatDescription: "", chatButtonLabel: "", chatWhisper: undefined, chatSpeaker: undefined, chatImg: undefined },
            chatDetails,
        );
        optionsRequestor = foundry.utils.mergeObject(
            { limit: RequestorHelpers.LIMIT.OPTION, permission: RequestorHelpers.PERMISSION.ALL, popout: false },
            optionsRequestor,
        );

        const { chatTitle, chatDescription, chatWhisper, chatSpeaker, chatImg } = chatDetails;
        const { permission } = optionsRequestor;

        const actorSpeaker = tokenUseForRequest?.actor ? tokenUseForRequest.actor : actorUseForRequest;
        const whisper = _buildWhisper(actorSpeaker, permission, userId, chatWhisper);
        const speaker = chatSpeaker ?? ChatMessage.getSpeaker({ actor: actorSpeaker });

        Logger.debug(`RequestorHelpers | START requestEmptyMessage`, { chatTitle, chatDescription, whisper });

        const imgHtml = chatImg
            ? `<img src="${chatImg}" style="width:36px;height:36px;float:left;margin-right:8px;" />`
            : "";

        const content = `<div style="display:flex;align-items:flex-start;">
            ${imgHtml}
            <div>
                ${chatTitle ? `<h3 style="margin:0 0 4px 0;">${chatTitle}</h3>` : ""}
                ${chatDescription ?? ""}
            </div>
        </div>`;

        return await ChatMessage.create({
            content,
            speaker,
            whisper: game.users.filter((u) => whisper.includes(u.id)),
        });
    }

    static async requestLootMessage(
        actorSpeaker,
        userId,
        evaluatedCurrencies,
        controlledToken,
        targetedToken,
    ) {
        Logger.debug(`RequestorHelpers | START requestLootMessage`, { evaluatedCurrencies });

        let lootMessageList = "";
        for (const entry of evaluatedCurrencies) {
            lootMessageList += `<li><strong>${entry}</strong></li>`;
        }

        const dialogContent = `
            <h3>Loot from ${targetedToken.name}</h3>
            <p>${controlledToken.name} looted the following from <strong>${targetedToken.name}</strong>:</p>
            <ul>${lootMessageList}</ul>`;

        // Always show on the GM's client
        const gmUser = game.users.find((u) => u.isGM && u.active) ?? game.user;
        const targetUser = gmUser.id === game.user.id ? null : gmUser;

        const doAdd = await (targetUser
            ? foundry.applications.api.DialogV2.query(targetUser, "wait", {
                window: { title: `Loot: ${targetedToken.name}` },
                content: dialogContent,
                buttons: [
                    { label: `Add to ${actorSpeaker.name}'s inventory`, action: "add" },
                    { label: "Discard", action: "discard" },
                ],
                rejectClose: false,
            })
            : foundry.applications.api.DialogV2.wait({
                window: { title: `Loot: ${targetedToken.name}` },
                content: dialogContent,
                buttons: [
                    { label: `Add to ${actorSpeaker.name}'s inventory`, action: "add" },
                    { label: "Discard", action: "discard" },
                ],
                rejectClose: false,
            })
        );

        return doAdd === "add";
    }

    static async requestHarvestMessage(
        actorUseForRequest,
        tokenUseForRequest,
        userId,
        itemsToAdd,
        targetedToken,
        optionsRequestor = {
            limit: RequestorHelpers.LIMIT.OPTION,
            permission: RequestorHelpers.PERMISSION.ALL,
            popout: false,
        },
    ) {
        optionsRequestor = foundry.utils.mergeObject(
            { limit: RequestorHelpers.LIMIT.OPTION, permission: RequestorHelpers.PERMISSION.ALL, popout: false },
            optionsRequestor,
        );

        const actorSpeaker = tokenUseForRequest?.actor ? tokenUseForRequest.actor : actorUseForRequest;

        Logger.debug(`RequestorHelpers | START requestHarvestMessage`, { itemsToAdd, targetedToken });

        let harvesterMessage = "";
        for (const item of itemsToAdd) {
            harvesterMessage += `<li><img src="${item.img}" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"/><strong>${item.name}</strong> x ${item.system?.quantity || 1}</li>`;
        }

        const dialogContent = `
            <h3>Share it or Keep it!</h3>
            <p>You must decide whether to keep the harvesting result to yourself or share with others.</p>
            <ul>${harvesterMessage}</ul>`;

        const targetUser = _resolveTargetUser(actorUseForRequest, userId);

        return await _showDialog(targetUser, "wait", {
            window: { title: "Share it or Keep it!" },
            content: dialogContent,
            buttons: [
                {
                    label: "Keep it",
                    action: "keep",
                    callback: async () => {
                        Logger.warn(
                            `RequestorHelpers | KEEP IT | Add items with ITEMPILES to ${actorSpeaker.name}`,
                            false,
                            itemsToAdd,
                        );
                        await ItemPilesHelpers.addItems(actorSpeaker, itemsToAdd, {
                            mergeSimilarItems: true,
                        });
                        return false;
                    },
                },
                {
                    label: "Share it",
                    action: "share",
                    callback: async () => {
                        const resolvedTargetedToken = RetrieveHelpers.getTokenSync(targetedToken.id);
                        Logger.warn(
                            `RequestorHelpers | SHARE IT | Add items with ITEMPILES to ${actorSpeaker.name}`,
                            false,
                            itemsToAdd,
                        );
                        await ItemPilesHelpers.unlinkToken(resolvedTargetedToken);
                        await ItemPilesHelpers.addItems(resolvedTargetedToken, itemsToAdd, {
                            mergeSimilarItems: true,
                            removeExistingActorItems: SETTINGS.harvestRemoveExistingActorItems,
                        });
                        await ItemPilesHelpers.convertTokenToItemPilesContainer(resolvedTargetedToken);
                        return true;
                    },
                },
            ],
            rejectClose: false,
        });
    }
}
