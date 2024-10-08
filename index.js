import { extension_settings, getContext, loadExtensionSettings } from '../../../extensions.js';
import { event_types, eventSource, saveSettingsDebounced, processDroppedFiles } from '../../../../script.js';
import { renderTemplateAsync } from '../../../templates.js';
import { POPUP_RESULT, POPUP_TYPE, Popup, callGenericPopup, fixToastrForDialogs } from '../../../popup.js';
import { isValidUrl } from '../../../utils.js';
import { importWorldInfo } from '../../../world-info.js';

import { importURL, importUUID } from './importer.js';

const extensionName = 'st-backport-import-character-from-url';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = { force_add_button_setting: true };

// Loads the extension settings if they exist, otherwise initializes them to the defaults.
async function loadSettings() {
    //Create the settings if they don't exist
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Updating settings in the UI
    $('#force_add_button_setting').prop('checked', extension_settings[extensionName].force_add_button_setting).trigger('input');
}

function onForceAddButtonSettingInput(event) {
    const value = Boolean($(event.target).prop('checked'));
    extension_settings[extensionName].force_add_button_setting = value;
    saveSettingsDebounced();
}

async function initSettings() {
    const settingsHtml = await renderTemplateAsync(`${extensionFolderPath}/settings.html`, {}, true, true, true);

    // Append settingsHtml to extensions_settings
    const leftColumnSelector = '#extensions_settings';
    const rightColumnSelector = '#extensions_settings2';
    $(rightColumnSelector).append(settingsHtml);

    $('#force_add_button_setting').on('input', onForceAddButtonSettingInput);

    loadSettings();
}

function initExtension() {
    eventSource.on(event_types.APP_READY, handle);

    async function handle(data) {
        if ($('#external_import_button').length
            && !extensionSettings.force_add_button_setting) { // force add button if user wants this
            // Built-in button exists. Do nothing.
            return;
        }

        const buttonHtml = await renderTemplateAsync(`${extensionFolderPath}/button.html`, {}, true, true, true);

        const firstNonButton = $('#form_character_search_form > :not(div)');

        if (firstNonButton.length) {
            $(buttonHtml).insertBefore(firstNonButton);
        } else {
            $(buttonHtml).prepend($('#form_character_search_form'));
        }

        $(document).on('click', '#external_import_button_backport', async () => {
            const html = await renderTemplateAsync(`${extensionFolderPath}/importCharacters.html`, {}, true, true, true);

            /** @type {string?} */
            const input = await callGenericPopup(html, POPUP_TYPE.INPUT, '', { wider: true, okButton: $('#popup_template').attr('popup-button-import'), rows: 4 });

            if (!input) {
                console.debug('Custom content import cancelled');

                return;
            }

            // break input into one input per line
            const inputs = input.split('\n').map(x => x.trim()).filter(x => x.length > 0);

            for (const url of inputs) {
                let request;

                if (isValidUrl(url)) {
                    console.debug('Custom content import started for URL: ', url);
                    request = await importURL(url);
                } else {
                    console.debug('Custom content import started for Char UUID: ', url);
                    request = await importUUID(url);
                }

                if (!request.ok) {
                    toastr.info(request.message, 'Custom content import failed');
                    console.error('Custom content import failed', request.message);

                    return;
                }

                const data = request.blob;
                const customContentType = request.contentType;
                const fileName = request.fileName;
                const file = new File([data], fileName, { type: data.type });

                switch (customContentType) {
                    case 'character':
                        await processDroppedFiles([file]);

                        break;
                    case 'lorebook':
                        await importWorldInfo(file);

                        break;
                    default:
                        toastr.warning('Unknown content type');
                        console.error('Unknown content type', customContentType);

                        break;
                }
            }
        });
    }
}

$(async () => {
    await initSettings();
    initExtension();
});
