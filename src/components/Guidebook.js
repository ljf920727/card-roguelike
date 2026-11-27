/** Tabbed rules reference opened from the top bar, the main menu and the Card Lab. */
import './guidebook.css';
import './settingsDialog.css';
import { localizeTree, setText } from '../i18n/dom.js';
import { getGuidebookSeen, saveGuidebookSeen } from '../tutorialPreferences.js';
import { GUIDEBOOK_PROSE, GUIDEBOOK_TABS, guidebookTabForMode, jinxRows, pokerHandRows } from '../scenes/guidebookContent.js';
import { openDialogAtStart } from './dialogNavigation.js';
import { BOOK_ICON } from './settingsIcons.js';

/** Event other views dispatch to open the Guidebook without importing it. */
export const OPEN_GUIDEBOOK_EVENT = 'juniper:guidebook';

/** Creates an element with a bound text source. */
function textElement(tag, source, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    setText(element, source);
    return element;
}

/** Builds the paragraphs of a static tab. */
function proseNodes(id) {
    return (GUIDEBOOK_PROSE[id] ?? []).map(source => textElement('p', source));
}

/** Builds a definition list of items, each with a bold term and a description. */
function definitionList(rows, className) {
    const list = document.createElement('dl');
    list.className = className;
    rows.forEach(({ term, detail }) => {
        const entry = document.createElement('div');
        entry.append(textElement('dt', term), textElement('dd', detail));
        list.append(entry);
    });
    return list;
}

/**
 * Adds the Guidebook dialog and wires every `[data-guidebook]` button and open event to it.
 * @param {() => object} getState Returns the live solo run state.
 * @returns {{ open: (tab?: string) => void }} Opens the dialog on a tab.
 */
export function installGuidebook(getState) {
    const dialog = document.createElement('dialog');
    dialog.className = 'preferences-dialog guidebook-dialog';
    dialog.setAttribute('aria-labelledby', 'guidebook-title');
    dialog.innerHTML = `<header class="preferences-heading"><h2 id="guidebook-title" tabindex="-1">Guidebook</h2>
        <button type="button" class="menu-button preferences-return guidebook-close" autofocus>Close</button></header>
        <div class="guidebook-tabs" role="tablist" aria-label="Guidebook sections"></div>
        <div class="preferences-body guidebook-body"></div>`;
    document.body.append(dialog);
    const tabList = dialog.querySelector('[role="tablist"]');
    const body = dialog.querySelector('.guidebook-body');
    const tabs = new Map();
    const panels = new Map();

    GUIDEBOOK_TABS.forEach(({ id, title }) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.id = `guidebook-tab-${id}`;
        tab.className = 'guidebook-tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', `guidebook-panel-${id}`);
        setText(tab, title);
        tab.addEventListener('click', () => select(id));
        const panel = document.createElement('section');
        panel.id = `guidebook-panel-${id}`;
        panel.className = 'guidebook-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        panel.hidden = true;
        tabs.set(id, tab);
        panels.set(id, panel);
        tabList.append(tab);
        body.append(panel);
    });

    panels.get('basics').append(...proseNodes('basics'));
    panels.get('poker').append(...proseNodes('poker'),
        definitionList(pokerHandRows().map(row => ({ term: row.label, detail: row.effect })), 'guidebook-hands'));
    panels.get('blackjack').append(...proseNodes('blackjack'));
    panels.get('jinxes').append(...proseNodes('jinxes'),
        definitionList(jinxRows().map(row => ({ term: row.name, detail: row.text })), 'guidebook-jinxes'));
    panels.get('between').append(...proseNodes('between'));
    localizeTree(dialog);

    /** Shows one tab and hides the rest. */
    function select(id, focus = false) {
        tabs.forEach((tab, tabId) => {
            const active = tabId === id;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            panels.get(tabId).hidden = !active;
        });
        body.scrollTop = 0;
        if (focus) tabs.get(id).focus();
    }

    tabList.addEventListener('keydown', event => {
        const ids = [...tabs.keys()];
        const index = ids.indexOf(document.activeElement?.id.replace('guidebook-tab-', ''));
        const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 }[event.key];
        if (target === undefined || index < 0) return;
        event.preventDefault();
        const rtl = document.documentElement.dir === 'rtl' && /Arrow/.test(event.key);
        const next = rtl ? index + (index - target) : target;
        select(ids[(next + ids.length) % ids.length], true);
    });
    dialog.querySelector('.guidebook-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });

    const buttons = [...document.querySelectorAll('[data-guidebook]')];
    buttons.forEach(button => {
        button.insertAdjacentHTML('afterbegin', BOOK_ICON);
        button.classList.toggle('attention', !getGuidebookSeen());
    });

    /** Opens on the requested tab, or the one matching the current combo mode. */
    function open(tab) {
        select(tabs.has(tab) ? tab : guidebookTabForMode(getState().mode));
        if (dialog.open) return;
        openDialogAtStart(dialog);
        saveGuidebookSeen(true);
        buttons.forEach(button => button.classList.remove('attention'));
    }

    buttons.forEach(button => button.addEventListener('click', () => open(button.dataset.guidebook)));
    document.addEventListener(OPEN_GUIDEBOOK_EVENT, event => open(event.detail?.tab));
    document.addEventListener('keydown', event => {
        if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
        event.preventDefault();
        open();
    });
    return { open };
}
