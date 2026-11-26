/** Retains English display sources so language changes update live DOM without rerunning gameplay. */
import { getDirection, getLocale, onLocaleChange, translate } from './index.js';

/** Sources belong to DOM nodes, so all module instances see the same original English text. */
const TEXT_SOURCE = Symbol.for('juniper.i18n.text');
const ATTRIBUTE_SOURCES = Symbol.for('juniper.i18n.attributes');
const localizedAttributes = ['aria-label', 'title', 'placeholder'];

/** Writes localized plain text, retaining the original or a live presentation resolver. */
export function setText(element, source) {
    element[TEXT_SOURCE] = source;
    const value = typeof source === 'function' ? source() : translate(source);
    if (element.textContent !== String(value ?? '')) element.textContent = value;
}

/** Replaces bound prose with child content whose own text bindings handle language changes. */
export function setChildren(element, ...children) {
    delete element[TEXT_SOURCE];
    element.replaceChildren(...children);
}

/** Writes a localized accessible label or tooltip without changing structural attributes. */
export function setLabel(element, attribute, source) {
    element[ATTRIBUTE_SOURCES] ??= new Map();
    element[ATTRIBUTE_SOURCES].set(attribute, source);
    element.setAttribute(attribute, translate(source));
}

/** Copies the English source of an accessible label, even when its face is already translated. */
export function sourceLabel(element, attribute) {
    return element[ATTRIBUTE_SOURCES]?.get(attribute) ?? element.getAttribute(attribute);
}

/** Appends a bound text node beside an existing element without replacing that element. */
export function appendText(element, source) {
    const node = document.createTextNode('');
    setText(node, source);
    element.append(node);
}

/** Binds static markup once; dynamic renderers use setText/setLabel for subsequent writes. */
export function localizeTree(root) {
    if (root.nodeType === 3) {
        if (!(TEXT_SOURCE in root) && root.textContent.trim()) setText(root, root.textContent);
        return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches?.('script, style, canvas, [translate="no"]')) return;
    for (const attribute of localizedAttributes) {
        if (root.hasAttribute?.(attribute) && !root[ATTRIBUTE_SOURCES]?.has(attribute)) setLabel(root, attribute, root.getAttribute(attribute));
    }
    if (!(TEXT_SOURCE in root)) [...root.childNodes].forEach(localizeTree);
}

/** Refreshes mounted bindings without retaining discarded cards or dialogs. */
function refreshTree(root) {
    if (TEXT_SOURCE in root) setText(root, root[TEXT_SOURCE]);
    else [...root.childNodes].forEach(refreshTree);
    root[ATTRIBUTE_SOURCES]?.forEach((source, attribute) => setLabel(root, attribute, source));
}

/** Initializes document language and static labels once for either game entry point. */
export function installLocalization() {
    const refresh = () => {
        document.documentElement.lang = getLocale();
        document.documentElement.dir = getDirection();
        refreshTree(document.documentElement);
    };
    localizeTree(document.documentElement);
    refresh();
    onLocaleChange(refresh);
}
