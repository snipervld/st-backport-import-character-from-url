/*
 * This file includes code from [SillyTavern] by SillyTavern.
 * Source: https://github.com/SillyTavern/SillyTavern
 * Licensed under AGPL-3.0.
 */
import sanitize from './sanitize-filename.js';

const WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES = [
    'localhost',
   'cdn.discordapp.com',
   'files.catbox.moe',
   'raw.githubusercontent.com',
];

async function downloadChubLorebook(id) {
    const result = await fetch('https://api.chub.ai/api/lorebooks/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            'fullPath': id,
            'format': 'SILLYTAVERN',
        }),
    });

    if (!result.ok) {
        const text = await result.text();
        console.log('Chub returned error', result.statusText, text);

        throw new Error('Failed to download lorebook');
    }

    const name = id.split('/').pop();
    const blob = await result.blob();
    const fileName = `${sanitize(name)}.json`;
    const fileType = result.headers.get('content-type');

    return { blob, fileName, fileType };
}

async function downloadChubCharacter(id) {
    const result = await fetch('https://api.chub.ai/api/characters/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            'format': 'tavern',
            'fullPath': id,
        }),
    });

    if (!result.ok) {
        const text = await result.text();
        console.log('Chub returned error', result.statusText, text);

        throw new Error('Failed to download character');
    }

    const blob = await result.blob();
    const fileName = result.headers.get('content-disposition')?.split('filename=')[1] || `${sanitize(id)}.png`;
    const fileType = result.headers.get('content-type');

    return { blob, fileName, fileType };
}

/**
 * Downloads a character card from the Pygsite.
 * @param {string} id UUID of the character
 * @returns {Promise<{blob: Blob, fileName: string, fileType: string}>}
 */
async function downloadPygmalionCharacter(id) {
    const result = await fetch(`https://server.pygmalion.chat/api/export/character/${id}/v2`);

    if (!result.ok) {
        const text = await result.text();
        console.log('Pygsite returned error', result.status, text);

        throw new Error('Failed to download character');
    }

    const jsonData = await result.json();
    const characterData = jsonData?.character;

    if (!characterData || typeof characterData !== 'object') {
        console.error('Pygsite returned invalid character data', jsonData);

        throw new Error('Failed to download character');
    }

    try {
        throw new Error('unsupported');
        // TODO port characterCardParser and uncomment it
        // const avatarUrl = characterData?.data?.avatar;

        // if (!avatarUrl) {
            // console.error('Pygsite character does not have an avatar', characterData);
            // throw new Error('Failed to download avatar');
        // }

        // const avatarResult = await fetch(avatarUrl);
        // const avatarBlob = await avatarResult.blob();

        // const cardBlob = characterCardParser.write(avatarBlob, JSON.stringify(characterData));

        // return {
            // blob: cardBlob,
            // fileName: `${sanitize(id)}.png`,
            // fileType: 'image/png',
        // };
    } catch (e) {
        console.error('Failed to download avatar, using JSON instead', e);

        return {
            blob: new Blob([JSON.stringify(jsonData)], { type: 'application/json' }),
            fileName: `${sanitize(id)}.json`,
            fileType: 'application/json',
        };
    }
}

/**
 *
 * @param {String} str
 * @returns { { id: string, type: "character" | "lorebook" } | null }
 */
function parseChubUrl(str) {
    const splitStr = str.split('/');
    const length = splitStr.length;

    if (length < 2) {
        return null;
    }

    let domainIndex = -1;

    splitStr.forEach((part, index) => {
        if (part === 'www.chub.ai' || part === 'chub.ai' || part === 'www.characterhub.org' || part === 'characterhub.org') {
            domainIndex = index;
        }
    });

    const lastTwo = domainIndex !== -1 ? splitStr.slice(domainIndex + 1) : splitStr;

    const firstPart = lastTwo[0].toLowerCase();

    if (firstPart === 'characters' || firstPart === 'lorebooks') {
        const type = firstPart === 'characters' ? 'character' : 'lorebook';
        const id = type === 'character' ? lastTwo.slice(1).join('/') : lastTwo.join('/');

        return {
            id: id,
            type: type,
        };
    } else if (length === 2) {
        return {
            id: lastTwo.join('/'),
            type: 'character',
        };
    }

    return null;
}

// Warning: Some characters might not exist in JannyAI.me
async function downloadJannyCharacter(uuid) {
    // This endpoint is being guarded behind Bot Fight Mode of Cloudflare
    // So hosted ST on Azure/AWS/GCP/Collab might get blocked by IP
    // Should work normally on self-host PC/Android
    const result = await fetch('https://api.jannyai.com/api/v1/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            'characterId': uuid,
        }),
    });

    if (result.ok) {
        const downloadResult = await result.json();

        if (downloadResult.status === 'ok') {
            const imageResult = await fetch(downloadResult.downloadUrl);
            const blob = await imageResult.blob();
            const fileName = `${sanitize(uuid)}.png`;
            const fileType = imageResult.headers.get('content-type');

            return { blob, fileName, fileType };
        }
    }

    console.log('Janny returned error', result.statusText, await result.text());

    throw new Error('Failed to download character');
}

//Download Character Cards from AICharactersCards.com (AICC) API.
async function downloadAICCCharacter(id) {
    const apiURL = `https://aicharactercards.com/wp-json/pngapi/v1/image/${id}`;

    try {
        const response = await fetch(apiURL);

        if (!response.ok) {
            throw new Error(`Failed to download character: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'image/png'; // Default to 'image/png' if header is missing
        const blob = await response.blob();
        const fileName = `${sanitize(id)}.png`; // Assuming PNG, but adjust based on actual content or headers

        return {
            blob: blob,
            fileName: fileName,
            fileType: contentType,
        };
    } catch (error) {
        console.error('Error downloading character:', error);

        throw error;
    }
}

/**
 * Parses an aicharactercards URL to extract the path.
 * @param {string} url URL to parse
 * @returns {string | null} AICC path
 */
function parseAICC(url) {
    const pattern = /^https?:\/\/aicharactercards\.com\/character-cards\/([^/]+)\/([^/]+)\/?$|([^/]+)\/([^/]+)$/;
    const match = url.match(pattern);

    if (match) {
        // Match group 1 & 2 for full URL, 3 & 4 for relative path
        return match[1] && match[2] ? `${match[1]}/${match[2]}` : `${match[3]}/${match[4]}`;
    }

    return null;
}

/**
 * Download character card from generic url.
 * @param {String} url
 */
async function downloadGenericPng(url) {
    try {
        const result = await fetch(url);

        if (result.ok) {
            const blob = await result.blob();
            const fileName = sanitize(result.url.split('?')[0].split('/').reverse()[0]);
            const contentType = result.headers.get('content-type') || 'image/png'; //yoink it from AICC function lol

            return {
                blob: blob,
                fileName: fileName,
                fileType: contentType,
            };
        }
    } catch (error) {
        console.error('Error downloading file: ', error);

        throw error;
    }

    return null;
}

/**
 * Parse Risu Realm URL to extract the UUID.
 * @param {string} url Risu Realm URL
 * @returns {string | null} UUID of the character
 */
function parseRisuUrl(url) {
    // Example: https://realm.risuai.net/character/7adb0ed8d81855c820b3506980fb40f054ceef010ff0c4bab73730c0ebe92279
    // or https://realm.risuai.net/character/7adb0ed8-d818-55c8-20b3-506980fb40f0
    const pattern = /^https?:\/\/realm\.risuai\.net\/character\/([a-f0-9-]+)\/?$/i;
    const match = url.match(pattern);

    return match ? match[1] : null;
}

/**
 * Download RisuAI character card
 * @param {string} uuid UUID of the character
 * @returns {Promise<{blob: Blob, fileName: string, fileType: string}>}
 */
async function downloadRisuCharacter(uuid) {
    const result = await fetch(`https://realm.risuai.net/api/v1/download/png-v3/${uuid}?non_commercial=true`);

    if (!result.ok) {
        const text = await result.text();
        console.log('RisuAI returned error', result.statusText, text);

        throw new Error('Failed to download character');
    }

    const blob = await result.blob();
    const fileName = `${sanitize(uuid)}.png`;
    const fileType = 'image/png';

    return { blob, fileName, fileType };
}

/**
* @param {String} url
* @returns {String | null } UUID of the character
*/
function getUuidFromUrl(url) {
    // Extract UUID from URL
    const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
    const matches = url.match(uuidRegex);

    // Check if UUID is found
    const uuid = matches ? matches[0] : null;

    return uuid;
}

/**
 * Filter to get the domain host of a url instead of a blanket string search.
 * @param {String} url URL to strip
 * @returns {String} Domain name
 */
function getHostFromUrl(url) {
    try {
        const urlObj = new URL(url);

        return urlObj.hostname;
    } catch {
        return '';
    }
}

/**
 * Checks if host is part of generic download source whitelist.
 * @param {String} host Host to check
 * @returns {boolean} If the host is on the whitelist.
 */
function isHostWhitelisted(host) {
    return WHITELIST_GENERIC_URL_DOWNLOAD_SOURCES.includes(host);
}

export async function importURL(url) {
    if (!url) {
        return {
            ok: false,
            message: 'invalid url',
        };
    }

    try {
        const host = getHostFromUrl(url);
        let result;
        let type;

        const isChub = host.includes('chub.ai') || host.includes('characterhub.org');
        const isJannnyContent = host.includes('janitorai');
        const isPygmalionContent = host.includes('pygmalion.chat');
        const isAICharacterCardsContent = host.includes('aicharactercards.com');
        const isRisu = host.includes('realm.risuai.net');
        const isGeneric = isHostWhitelisted(host);

        if (isPygmalionContent) {
            const uuid = getUuidFromUrl(url);

            if (!uuid) {
                return {
                    ok: false,
                    message: 'invalid Pygmalion uuid',
                };
            }

            type = 'character';
            result = await downloadPygmalionCharacter(uuid);
        } else if (isJannnyContent) {
            const uuid = getUuidFromUrl(url);

            if (!uuid) {
                return {
                    ok: false,
                    message: 'invalid Jannny uuid',
                };
            }

            type = 'character';
            result = await downloadJannyCharacter(uuid);
        } else if (isAICharacterCardsContent) {
            const AICCParsed = parseAICC(url);

            if (!AICCParsed) {
                return {
                    ok: false,
                    message: 'invalid AICharacterCard\'s url',
                };
            }

            type = 'character';
            result = await downloadAICCCharacter(AICCParsed);
        } else if (isChub) {
            const chubParsed = parseChubUrl(url);
            type = chubParsed?.type;

            if (!chubParsed) {
                return {
                    ok: false,
                    message: 'invalid chubs url',
                };
            }

            if (chubParsed?.type === 'character') {
                console.log('Downloading chub character:', chubParsed.id);
                result = await downloadChubCharacter(chubParsed.id);
            } else if (chubParsed?.type === 'lorebook') {
                console.log('Downloading chub lorebook:', chubParsed.id);
                result = await downloadChubLorebook(chubParsed.id);
            } else {
                return {
                    ok: false,
                    message: 'unsupported chub card type',
                };
            }
        } else if (isRisu) {
            const uuid = parseRisuUrl(url);

            if (!uuid) {
                return {
                    ok: false,
                    message: 'unsupported Risu uuid',
                };
            }

            type = 'character';
            result = await downloadRisuCharacter(uuid);
        } else if (isGeneric) {
            console.log('Downloading from generic url.');
            type = 'character';
            result = await downloadGenericPng(url);
        } else {
            return {
                ok: false,
                message: 'unsupported url',
            };
        }

        if (!result) {
            return {
                ok: false,
                message: 'card was not downloaded due to some error',
            };
        }

        return {
            ok: true,
            blob: result.blob,
            fileName: result.fileName,
            contentType: type,
            fileType: result.fileType,
        };
    } catch (error) {
        console.log('Importing custom content failed', error);

        return {
            ok: false,
            message: 'Unknown error. See console in devtools for details.',
        };
    }
}

export async function importUUID(uuid) {
    if (!uuid) {
        return {
            ok: false,
            message: 'invalid uuid',
        };
    }

    try {
        let result;

        const isJannny = uuid.includes('_character');
        const isPygmalion = (!isJannny && uuid.length == 36);
        const isAICC = uuid.startsWith('AICC/');
        const uuidType = uuid.includes('lorebook') ? 'lorebook' : 'character';

        if (isPygmalion) {
            console.log('Downloading Pygmalion character:', uuid);
            result = await downloadPygmalionCharacter(uuid);
        } else if (isJannny) {
            console.log('Downloading Janitor character:', uuid.split('_')[0]);
            result = await downloadJannyCharacter(uuid.split('_')[0]);
        } else if (isAICC) {
            const [, author, card] = uuid.split('/');
            console.log('Downloading AICC character:', `${author}/${card}`);
            result = await downloadAICCCharacter(`${author}/${card}`);
        } else {
            if (uuidType === 'character') {
                console.log('Downloading chub character:', uuid);
                result = await downloadChubCharacter(uuid);
            } else if (uuidType === 'lorebook') {
                console.log('Downloading chub lorebook:', uuid);
                result = await downloadChubLorebook(uuid);
            } else {
                return {
                    ok: false,
                    message: 'unsupported uuid',
                };
            }
        }

        return {
            ok: true,
            blob: result.blob,
            fileName: result.fileName,
            contentType: uuidType,
            fileType: result.fileType,
        };
    } catch (error) {
        console.log('Importing custom content failed', error);

        return {
            ok: false,
            message: 'Unknown error. See console in devtools for details.',
        };
    }
}
