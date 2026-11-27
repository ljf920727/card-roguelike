/** Jokers and Curses modal opened from the battle table's Jokers button. */
import './settingsDialog.css';
import { appendText, localizeTree, setText } from '../i18n/dom.js';
import { getJoker, jokerSlots } from '../systems/JokerSystem.js';
import { getCurse } from '../systems/CurseSystem.js';
import { openDialogAtStart } from './dialogNavigation.js';

/** Builds a list item with a bold name followed by plain description text. */
function entry(name, detail) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    setText(title, name);
    item.append(title);
    appendText(item, ` ${detail}`);
    return item;
}

/** Owns the Jokers button label and the dialog that lists the run's Jokers and Curses. */
export class JokersDialog {
    /**
     * @param {HTMLButtonElement} button Opens the dialog and shows the slot count.
     */
    constructor(button) {
        this.button = button;
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'preferences-dialog jokers-dialog';
        this.dialog.setAttribute('aria-labelledby', 'jokers-dialog-title');
        this.dialog.innerHTML = `<header class="preferences-heading"><h2 id="jokers-dialog-title"></h2>
            <button type="button" class="menu-button preferences-return" autofocus>Close</button></header>
            <div class="preferences-body">
                <ul class="joker-list" id="joker-list"></ul>
                <section class="curses" id="curses-section" hidden>
                    <h3 class="rules-title">Curses</h3>
                    <ul class="joker-list" id="curse-list"></ul>
                </section>
            </div>`;
        document.body.append(this.dialog);
        localizeTree(this.dialog);
        this.title = this.dialog.querySelector('#jokers-dialog-title');
        this.jokerList = this.dialog.querySelector('#joker-list');
        this.curseSection = this.dialog.querySelector('#curses-section');
        this.curseList = this.dialog.querySelector('#curse-list');
        button.addEventListener('click', () => openDialogAtStart(this.dialog));
        this.dialog.querySelector('.preferences-return').addEventListener('click', () => this.dialog.close());
        this.dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') event.stopPropagation();
        });
    }

    /**
     * Re-renders the button and lists from the run state.
     * @param {object} state Shared game state.
     * @param {boolean} lab Whether the Card Lab is showing its own modifiers.
     */
    update(state, lab) {
        const { jokers, curses } = state.run;
        const slots = jokerSlots(state);
        setText(this.button, `Jokers (${jokers.length}/${slots})`);
        setText(this.title, `Your Jokers (${jokers.length}/${slots})`);
        this.jokerList.replaceChildren(...(jokers.length ? jokers.map(id => {
            const joker = getJoker(id);
            return entry(joker.name, joker.text);
        }) : [Object.assign(document.createElement('li'), { className: 'muted' })]));
        if (!jokers.length) setText(this.jokerList.firstElementChild, lab ? 'None' : 'Win fights to earn Jokers.');
        this.curseSection.hidden = !curses.length;
        this.curseList.replaceChildren(...curses.map(id => {
            const curse = getCurse(id);
            return entry(curse.name, `${curse.boon} ${curse.cost}`);
        }));
    }
}
