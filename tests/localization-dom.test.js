/** Exercises shared language events and text bindings across independently loaded view modules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installLocalization, localizeTree } from '../src/i18n/dom.js';
import { setLocale } from '../src/i18n/index.js';

/** Minimal DOM node supporting the text and attribute contracts used by presentation bindings. */
class ViewNode {
    /** Creates an element or text node without a browser dependency. */
    constructor(text = '', nodeType = 1) {
        this.nodeType = nodeType;
        this.childNodes = [];
        this.value = text;
        this.labels = new Map();
    }
    /** Reads the combined text of this node. */
    get textContent() { return this.childNodes.length ? this.childNodes.map(node => node.textContent).join('') : this.value; }
    /** Replaces children as the browser's textContent setter does. */
    set textContent(value) { this.value = String(value ?? ''); this.childNodes = []; }
    /** Replaces structured content as an element does. */
    replaceChildren(...children) { this.value = ''; this.childNodes = children; }
    /** Static test elements do not opt out of translation. */
    matches() { return false; }
    /** Reports whether an accessible label exists. */
    hasAttribute(name) { return this.labels.has(name); }
    /** Reads an accessible label. */
    getAttribute(name) { return this.labels.get(name) ?? null; }
    /** Writes an accessible label. */
    setAttribute(name, value) { this.labels.set(name, value); }
}

test('independent module loads update static text, live battle text and attributes together', async () => {
    const previous = globalThis.document;
    const document = new EventTarget();
    const root = new ViewNode();
    root.lang = 'en-CA';
    document.documentElement = root;
    globalThis.document = document;
    try {
        const heading = new ViewNode('Language', 3);
        const staticLabel = new ViewNode('Blackjack', 3);
        const play = new ViewNode();
        root.childNodes = [heading, staticLabel, play];
        installLocalization();
        const laterView = await import('../src/i18n/dom.js?view-reload');
        const laterLocale = await import('../src/i18n/index.js?locale-reload');
        laterView.setText(play, 'Deal');
        laterView.setLabel(play, 'aria-label', 'Run difficulty');
        const nodes = [...root.childNodes];
        for (const [locale, labels] of [
            ['zh-Hant', ['語言', '二十一點', '發牌', '本局難度']],
            ['zh-Hans', ['语言', '二十一点', '发牌', '本局难度']],
            ['en-CA', ['Language', 'Blackjack', 'Deal', 'Run difficulty']],
            ['zh-Hans', ['语言', '二十一点', '发牌', '本局难度']],
        ]) {
            laterLocale.setLocale(locale, false);
            assert.equal(root.lang, locale);
            assert.deepEqual([heading.textContent, staticLabel.textContent, play.textContent, play.getAttribute('aria-label')], labels);
            assert.deepEqual(root.childNodes, nodes);
            localizeTree(root);
        }
        setLocale('ar', false);
        assert.equal(root.dir, 'rtl');
        assert.equal(play.textContent, 'وزّع');
        laterLocale.setLocale('hi', false);
        assert.equal(root.dir, 'ltr');
        assert.equal(play.textContent, 'पत्ते बाँटें');
        const rules = new ViewNode();
        const hand = new ViewNode();
        root.childNodes.push(rules);
        laterView.setText(rules, 'Blackjack');
        laterView.setText(hand, 'Pair');
        laterView.setChildren(rules, hand);
        setLocale('zh-Hans', false);
        assert.equal(rules.textContent, '对子');
        assert.equal(rules.childNodes[0], hand);
        laterView.setText(rules, 'Blackjack');
        setLocale('ar', false);
        assert.equal(rules.textContent, 'بلاك جاك');
        assert.equal(rules.childNodes.length, 0);
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
        setLocale('en-CA', false);
    }
});
