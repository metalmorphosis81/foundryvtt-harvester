import { CONSTANTS } from "../constants.js";
import { SETTINGS } from "../settings.js";
import Logger from "./Logger.js";
import ItemPilesHelpers from "./item-piles-helpers.js";

export function getByValue(map, searchValue) {
    let keyMap = "";
    for (let [key, value] of map.entries()) {
        if (value === searchValue) {
            keyMap = key;
            break;
        }
    }
    return keyMap ?? "";
}

export function checkItemSourceLabel(item, sourceLabel) {
    // dnd5e v4+: source is a string or object with 'book' and 'custom' fields
    // dnd5e v3 and earlier: source was object with 'label' and 'custom' fields
    const src = item.system?.source;
    if (!src) return false;
    if (typeof src === "string") {
        return src === sourceLabel;
    }
    // v4: book field (was 'label' in v3)
    if (src.book === sourceLabel) return true;
    // v3 legacy: label field
    if (src.label === sourceLabel) return true;
    // custom field (same across versions)
    if (src.custom === sourceLabel) return true;
    return false;
}

export function retrieveItemSourceLabel(item) {
    const src = item.system?.source;
    if (!src) return "";
    if (typeof src === "string") return src;
    // v4: book, v3: label
    let sourceLabel = src.book || src.label;
    if (!sourceLabel && src.custom) {
        sourceLabel = src.custom;
    }
    return sourceLabel ?? "";
}

export function retrieveItemSourceLabelDC(item) {
    const src = item.system?.source;
    if (!src) return 0;
    let sourceStr = "";
    if (typeof src === "string") {
        sourceStr = src;
    } else {
        sourceStr = src.book || src.label || src.custom || "";
    }
    const match = sourceStr.match(/\d+/g);
    return match ? match[0] : 0;
}

export function formatDragon(actorName) {
    let actorSplit = actorName.split(" ");
    CONSTANTS.dragonIgnoreArr.forEach((element) => {
        actorSplit = actorSplit.filter((e) => e !== element);
    });

    actorSplit = actorSplit.join(" ");
    return actorSplit;
}

// ===========================

// /**
//  * A little function that checks the validity of both types of regexes, strings or patterns.
//  * The user will be able to test both test and /test/g for example.
//  * @href https://stackoverflow.com/questions/17250815/how-to-check-if-the-input-string-is-a-valid-regular-expression
//  * @href https://stackoverflow.com/questions/874709/converting-user-input-string-to-regular-expression
//  * @param {string} pattern
//  * @returns {boolean}
//  */
// function validateRegex(pattern) {
//     let p = foundry.utils.duplicate(pattern);
//     let parts = p.split("/");
//     let regex = p;
//     let options = "";
//     if (parts.length > 1) {
//         regex = parts[1];
//         options = parts[2];
//     } else {
//         return false;
//     }
//     try {
//         new RegExp(regex, options);
//         return true;
//     } catch (e) {
//         Logger.error("validateRegex | Regex error", false, e);
//         return false;
//     }
// }

// /**
//  * This function could handle the '/' char as a normal char in regex, and also consider escaping when is a common string.
//  * It will always return an Regex, null if not a good regex string.
//  * @href https://stackoverflow.com/questions/17250815/how-to-check-if-the-input-string-is-a-valid-regular-expression
//  * @param {string} regex
//  * @returns {RegExp|null}
//  */
// function getRegex(regex) {
//     try {
//         regex = regex.trim();
//         let parts = regex.split("/");
//         if (regex[0] !== "/" || parts.length < 3) {
//             regex = regex.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&"); //escap common string
//             return new RegExp(regex);
//         }
//         const option = parts[parts.length - 1];
//         const lastIndex = regex.lastIndexOf("/");
//         regex = regex.substring(1, lastIndex);
//         return new RegExp(regex, option);
//     } catch (e) {
//         Logger.error("getRegex | Regex error", false, e);
//         return null;
//     }
// }

/**
 * Here is a little function that checks the validity of both types of regexes, strings or patterns
 * The user will be able to test both 'test' and '/test/g'.
 * let a = validateRegex("/test/i");
 * let b = new RegExp("/test/i");
 * let s = "teSt";
 * let t1 = a.test(s); // true
 * let t2 = b.test(s); // false
 * @href https://stackoverflow.com/questions/17250815/how-to-check-if-the-input-string-is-a-valid-regular-expression
 * @param {string} stringToCheck The string passed to check
 * @param {string} [pattern=""] The regular expression to use on the string passed.
 * @param {boolean} [enableExactMatch=false] Enable Exact Match.
 * @param {boolean} [enableAnySuffixMatch=false] Enable Any Suffix Match.
 * @returns {boolean} The regular expression match the string passed.
 */
export function normaliseCreatureName(name) {
    // Normalise common spelling variants so token names match compendium table names
    // British "grey" <-> American "gray", etc.
    return (name ?? "")
        .replace(/\bgrey\b/gi, "gray")
        .replace(/\bdraught\b/gi, "draft")
        .replace(/\bcolour\b/gi, "color")
        .replace(/\barmour\b/gi, "armor");
}

export function testWithRegex(stringToCheck, pattern = "", enableExactMatch = false, enableAnySuffixMatch = false) {
    if (!pattern) {
        return false;
    }
    // Normalise spelling variants before comparing (e.g. "Grey Ooze" -> "Gray Ooze")
    stringToCheck = normaliseCreatureName(stringToCheck);
    pattern = normaliseCreatureName(pattern);

    if (enableExactMatch) {
        let t2 = stringToCheck?.toLowerCase()?.trim() === pattern?.toLowerCase()?.trim();
        if (t2) {
            Logger.debug(`testWithRegex | Regex found with enableExactMatch ${stringToCheck} === ${pattern}`, false);
        }
        return t2;
    }

    let stringToCheckTmp = stringToCheck?.toLowerCase()?.trim();
    let patternTmp = pattern?.toLowerCase()?.trim();
    if (enableAnySuffixMatch && !patternTmp.endsWith(`(.*?)`)) {
        patternTmp = `^${patternTmp}(.*?)$`;
    } else {
        patternTmp = `^${patternTmp}$`;
    }
    try {
        let t1 = new RegExp(patternTmp).test(stringToCheckTmp); // stringToCheck.match(patternTmp);
        if (t1) {
            Logger.debug(`testWithRegex | Regex found ${stringToCheck} <=> ${pattern}`, false);
        }
        return t1;
    } catch (e) {
        Logger.error(`testWithRegex | Regex error ${stringToCheck} <=> ${pattern}`, false, e);
        return false;
    }
}

export function isEmptyObject(obj) {
    // because Object.keys(new Date()).length === 0;
    // we have to do some additional check
    if (obj === null || obj === undefined) {
        return true;
    }
    if (isRealNumber(obj)) {
        return false;
    }
    if (obj instanceof Object && Object.keys(obj).length === 0) {
        return true;
    }
    if (obj instanceof Array && obj.length === 0) {
        return true;
    }
    if (obj && Object.keys(obj).length === 0) {
        return true;
    }
    return false;
}

export function isRealNumber(inNumber) {
    return !isNaN(inNumber) && typeof inNumber === "number" && isFinite(inNumber);
}

export function isRealBoolean(inBoolean) {
    return String(inBoolean) === "true" || String(inBoolean) === "false";
}

export function isRealBooleanOrElseNull(inBoolean) {
    return isRealBoolean(inBoolean) ? inBoolean : null;
}

export function getSubstring(string, char1, char2) {
    return string.slice(string.indexOf(char1) + 1, string.lastIndexOf(char2));
}

/**
 * Parses the given object as an array.
 * If the object is a string, it splits it by commas and returns an array.
 * If the object is already an array, it returns the same array.
 * If the object is neither a string nor an array, it wraps it in an array and returns it.
 * @param {string|Array|any} obj - The object to be parsed as an array.
 * @returns {Array} - The parsed array.
 */
export function parseAsArray(obj) {
    if (!obj) {
        return [];
    }
    let arr = [];
    if (typeof obj === "string" || obj instanceof String) {
        arr = obj.split(",");
    } else if (obj.constructor === Array) {
        arr = obj;
    } else {
        arr = [obj];
    }
    return arr;
}

/**
 * Turns a string of currencies into an array containing the data and quantities for each currency
 * @deprecated the solution with item piles is much better
 *
 * @param {string} currenciesS                               A string of currencies to convert (eg, "5gp 25sp")
 *
 * @returns {Array<object>}                                 An array of object containing the data and quantity for each currency
 */
export async function _retrieveCurrenciesSimpleFromStringNoDep(currenciesS) {
    const c = ItemPilesHelpers.generateCurrenciesStringFromString(currenciesS);
    if (!c) {
        return "";
    }
    const arr = [];
    const cc = c.split(" ");
    for (const abbreviation of CONSTANTS.currencyMap.values()) {
        for (const formula of cc) {
            if (formula.includes(abbreviation)) {
                let currency = formula.replaceAll(abbreviation, "")?.trim();
                let roll = new Roll(currency);
                let rollResult = await roll.evaluate();
                arr.push({
                    abbreviation: abbreviation,
                    quantity: 1,
                    roll: rollResult,
                });
            }
        }
    }
    const currencies = {};
    for (const cc of arr) {
        const abbreviation = cc.abbreviation.toLowerCase().replace("{#}", "").trim();
        currencies[abbreviation] = (cc.roll ? cc.roll.total : cc.quantity) ?? 0;
    }
    return currencies;
}

/**
 * @deprecated the solution with item piles is much better
 * @param {*} actor
 * @param {*} currencyLabel
 * @param {*} toAdd
 */
export async function updateActorCurrencyNoDep(actor, currencyLabel) {
    const currenciesToAdd = _retrieveCurrenciesSimpleFromStringNoDep(currencyLabel);
    for (const [currencyRef, toAdd] of Object.entries(currenciesToAdd)) {
        let total = actor.system.currency[currencyRef] + toAdd;
        await actor.update({
            system: {
                currency: {
                    [currencyRef]: total,
                },
            },
        });
        Logger.log(`Added ${toAdd} ${currencyLabel} to: ${actor.name}`);
    }
}

/**
 * @deprecated the solution with item piles is much better
 * @param {*} actorName
 * @param {*} actionName
 * @returns
 */
export function searchCompendium(actorName, actionName) {
    let returnArr = [];
    if (actorName.includes("Dragon")) {
        actorName = formatDragon(actorName);
    }
    if (actionName === harvestAction.name) {
        returnArr = checkCompendium(customCompendium, "name", actorName);

        if (returnArr.length !== 0) {
            return returnArr;
        }
        returnArr = checkCompendium(harvestCompendium, "system.source.label", actorName);
    } else if (actionName === lootAction.name && !SETTINGS.disableLoot) {
        returnArr = checkCompendium(customLootCompendium, "name", actorName);

        if (returnArr.length !== 0) {
            return returnArr;
        }
        returnArr = checkCompendium(lootCompendium, "name", actorName);
    }

    return returnArr;
}

/**
 * @deprecated the solution with item piles is much better
 * @param {*} compendium
 * @param {*} checkProperty
 * @param {*} matchProperty
 * @returns
 */
export function checkCompendium(compendium, checkProperty, matchProperty) {
    let returnArr = [];
    compendium.forEach((doc) => {
        if (eval(`doc.${checkProperty}`) === matchProperty) {
            returnArr.push(doc);
        }
    });
    return returnArr;
}
