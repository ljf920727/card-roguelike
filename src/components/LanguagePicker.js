/** Presents language settings in a shared preferences sheet with an expandable Chinese group. */
import { getLocale, LOCALES, onLocaleChange, setLocale } from '../i18n/index.js';
import { localizeTree } from '../i18n/dom.js';
import { audio } from '../audio/AudioManager.js';
import { LANGUAGE_ICON } from './settingsIcons.js';
import { openDialogAtStart } from './dialogNavigation.js';

/** Builds a raised settings choice with a native radio and the shared selection mark. */
export function createPreferenceChoice(group, value, name) {
    const label = document.createElement('label');
    label.className = 'menu-button language-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = group;
    input.value = value;
    const check = document.createElement('span');
    check.className = 'language-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    label.append(input, name, check);
    return label;
}

/** Adds a globe-labelled settings button and language sheet without changing a running game. */
export function installLanguagePicker(container) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-button settings-link';
    button.setAttribute('data-language-settings', '');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'language-dialog');
    button.innerHTML = `<span class="settings-link-label"><span>Language</span>${LANGUAGE_ICON}</span><span class="settings-arrow" aria-hidden="true">›</span>`;
    container.append(button);
    const dialog = document.createElement('dialog');
    dialog.id = 'language-dialog';
    dialog.className = 'preferences-dialog language-dialog';
    dialog.setAttribute('aria-labelledby', 'language-title');
    dialog.innerHTML = `<header class="preferences-heading"><h2 id="language-title">Language</h2>
        <button type="button" class="menu-button preferences-return" data-close-language autofocus>Back</button></header>
        <div class="preferences-body"></div>`;
    document.body.append(dialog);
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'language-picker';
    fieldset.setAttribute('aria-labelledby', 'language-title');
    fieldset.innerHTML = '<div class="language-options"></div>';
    const options = fieldset.querySelector('.language-options');
    const chinese = document.createElement('details');
    chinese.className = 'language-chinese';
    chinese.innerHTML = '<summary class="menu-button"><span lang="zh" translate="no">中文</span><span class="language-arrow" aria-hidden="true">›</span></summary><div class="language-variants"></div>';
    const inputs = new Map();
    for (const locale of LOCALES) {
        const name = document.createElement('span');
        name.lang = locale.id;
        name.dir = 'auto';
        name.setAttribute('translate', 'no');
        name.textContent = locale.name;
        const label = createPreferenceChoice('game-language', locale.id, name);
        const input = label.querySelector('input');
        (locale.id.startsWith('zh') ? chinese.querySelector('.language-variants') : options).append(label);
        inputs.set(locale.id, input);
        input.addEventListener('change', () => {
            if (!input.checked) return;
            setLocale(locale.id);
            void audio.play('ui');
        });
    }
    options.append(chinese);
    dialog.querySelector('.preferences-body').append(fieldset);
    /** Reflects the selected language without opening either settings level. */
    const refresh = () => {
        const locale = getLocale();
        inputs.forEach((input, id) => { input.checked = id === locale; });
        const isChinese = locale.startsWith('zh');
        chinese.classList.toggle('selected', isChinese);
    };
    chinese.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !chinese.open) return;
        event.preventDefault();
        event.stopPropagation();
        chinese.open = false;
        chinese.querySelector('summary').focus();
    });
    button.addEventListener('click', () => {
        chinese.open = false;
        openDialogAtStart(dialog);
    });
    dialog.querySelector('[data-close-language]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });
    onLocaleChange(refresh);
    refresh();
    localizeTree(button);
    localizeTree(dialog);
}
