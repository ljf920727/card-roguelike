/** Verifies catalogue contracts, regional preferences and composed game-message localization. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGUES } from '../src/i18n/catalogues.js';
import { getDirection, getLocale, LOCALES, onLocaleChange, resolveLocale, setLocale, translate } from '../src/i18n/index.js';
import { JOKERS } from '../src/systems/JokerSystem.js';
import { CURSES } from '../src/systems/CurseSystem.js';
import { JINXES } from '../src/systems/DeckSystem.js';
import { FLOORS } from '../src/systems/RunSystem.js';

test('locale source files define each translation key only once', () => {
    for (const { id } of LOCALES) {
        const raw = readFileSync(new URL('../src/i18n/' + id + '.json', import.meta.url), 'utf8');
        const keys = new Set();
        // Read the string pairs before JSON parsing can overwrite a duplicate key.
        for (const [, quotedKey] of raw.matchAll(/("(?:\\.|[^"\\])*")\s*:\s*"(?:\\.|[^"\\])*"/g)) {
            const key = JSON.parse(quotedKey);
            assert.ok(!keys.has(key), id + ': duplicate key ' + key);
            keys.add(key);
        }
        assert.deepEqual(keys, new Set(Object.keys(CATALOGUES[id])));
    }
});

test('all nine locale files contain the same keys and preserve numeric and player placeholders', () => {
    assert.equal(LOCALES.length, 9);
    const sources = Object.keys(CATALOGUES['en-CA']);
    assert.deepEqual(LOCALES.map(locale => locale.id).sort(), Object.keys(CATALOGUES).sort());
    for (const catalogue of Object.values(CATALOGUES)) assert.deepEqual(Object.keys(catalogue).sort(), [...sources].sort());
    for (const source of sources) {
        const keys = [...source.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
        for (const catalogue of Object.values(CATALOGUES)) {
            const text = catalogue[source];
            assert.equal(typeof text, 'string', source);
            assert.ok(text.length, source);
            const used = [...text.matchAll(/\{(\w+)(?::t)?\}/g)].map(match => match[1]);
            assert.ok(used.every(key => keys.includes(key)), source);
            assert.ok(keys.filter(key => key.startsWith('n') || key === 'player').every(key => used.includes(key)), source);
            assert.ok(!text.includes('{player:t}'), source);
        }
    }
});

test('browser preferences resolve regional scripts without treating Chinese as a selectable locale', () => {
    assert.equal(resolveLocale(['de', 'fr-FR']), 'fr-CA');
    assert.equal(resolveLocale(['zh-TW']), 'zh-Hant');
    assert.equal(resolveLocale(['zh-Hant-TW']), 'zh-Hant');
    assert.equal(resolveLocale(['zh-HK']), 'zh-Hant');
    assert.equal(resolveLocale(['zh-CN']), 'zh-Hans');
    assert.equal(resolveLocale(['pa-IN']), 'pa-Guru');
    assert.equal(resolveLocale(['pa-Arab', 'es-MX']), 'es');
    assert.equal(resolveLocale(['pa-PK']), 'en-CA');
    assert.equal(resolveLocale(['ar-SA']), 'ar');
    assert.equal(resolveLocale(['hi-IN']), 'hi');
    assert.equal(resolveLocale(['fil-PH']), 'tl');
    assert.equal(resolveLocale(['tl-PH']), 'tl');
    assert.equal(resolveLocale(['invalid']), 'en-CA');
    assert.equal(setLocale('zh'), false);
});

test('composed messages respect sentence boundaries and do not mistake progress for a card', () => {
    assert.equal(translate('A new run begins in The Lobby. A Goblin blocks the way.', 'zh-Hans'), '新一局冒险从大厅开始。 哥布林挡住了去路。');
    assert.equal(translate('Fight 1 of 3 · Turn 1', 'zh-Hans'), '第 1 / 3 场战斗 · 回合 1');
    assert.equal(translate('Pair: gained 25 shield; spent 2 energy.', 'zh-Hans'), '对子: 获得 25 护盾; 消耗 2 能量。');
    assert.equal(translate('K of hearts', 'zh-Hans'), '红桃 K');
    assert.equal(translate('Mulligan (free)', 'zh-Hans'), '换牌（免费）');
    assert.equal(translate('House rule: Shield caps at 25.', 'zh-Hans'), '赌场规则：护盾上限为 25。');
    assert.equal(translate('The House blocks the way.', 'zh-Hans'), '赌场之主挡住了去路。');
    assert.ok(!/[A-Za-z]/.test(translate('Card Shark struck repeatedly: blocked 5; lost 10 HP.', 'zh-Hans')));
    assert.equal(translate('Not a known message', 'fr-CA'), 'Not a known message');
});

test('co-op message captures preserve arbitrary player names and translate only game terms', () => {
    for (const name of ['Normal', 'Goblin', 'A. B', '<img src=x onerror=alert(1)>', 'ਪੰਜਾਬੀ 中文']) {
        assert.equal(translate(`Turn 2 — Waiting for ${name}`, 'zh-Hans'), `第 2 回合 — 等待 ${name}`);
        assert.equal(translate(`${name} plays Pair.`, 'zh-Hans'), `${name} 打出对子。`);
        assert.equal(translate(`${name} joined the room.`, 'zh-Hans'), `${name} 加入了房间。`);
    }
});

test('poker lists show healing as an amount in the preview and co-op result', () => {
    const preview = 'Flush five: 777 damage and 77 healing and 77 shield';
    assert.equal(translate(preview, 'zh-Hans'), '同花五条: 777 伤害、77 治疗、77 护盾');
    assert.equal(translate(preview, 'zh-Hant'), '同花五條: 777 傷害、77 治療、77 護盾');
    for (const { id } of LOCALES.filter(locale => locale.id !== 'en-CA')) {
        const result = 'Tester plays Flush five. 777 damage, 77 healing, 77 shield.';
        assert.equal(translate(result, id), translate(result.replace('77 healing', 'heal 77'), id));
        assert.ok(!translate(result, id).includes('77 healing'), id);
    }
});

test('run milestones and Jinx labels retain complete multi-sentence catalogue messages', () => {
    for (const { id: locale } of LOCALES.filter(item => item.id !== 'en-CA')) {
        for (const floor of FLOORS) {
            const ending = `${floor.name} is yours. Take a breath. You've earned it.`;
            const prefix = `${floor.boss.name} defeated.`;
            assert.equal(translate(`${prefix} ${ending}`, locale), `${translate(prefix, locale)} ${translate(ending, locale)}`);
        }
        const finale = 'All five floors are yours. You beat the house.';
        assert.ok(translate(`The House defeated. ${finale}`, locale).includes(translate(finale, locale)));
        for (const jinx of Object.values(JINXES)) {
            assert.equal(translate(`${jinx.name}: ${jinx.text}`, locale), `${translate(jinx.name, locale)}: ${translate(jinx.text, locale)}`);
            const accessible = `${jinx.name} Jinx. ${jinx.text} Unplayable in poker; worth 0 in blackjack.`;
            assert.ok(translate(accessible, locale).includes(translate(jinx.text, locale)), `${locale}: ${accessible}`);
        }
    }
});

test('card preview lists preserve individual Jinx labels and isolate Arabic card notation', () => {
    for (const locale of ['zh-Hans', 'ar']) {
        assert.equal(translate('6♦, 6♠, Bad Luck Jinx', locale), `${translate('6♦', locale)}, ${translate('6♠', locale)}, ${translate('Bad Luck Jinx', locale)}`);
    }
    assert.equal(translate('6♦', 'ar'), '\u20666♦\u2069');
    assert.equal(translate('Next cards: 6♦, 6♠, 10♥', 'ar'), 'الأوراق التالية: \u20666♦\u2069, \u20666♠\u2069, \u206610♥\u2069');
    assert.ok(translate('Poker damage +50%. Max HP −25.', 'ar').includes('\u2066+50%\u2069'));
    assert.ok(translate('Poker damage +50%. Max HP −25.', 'ar').includes('\u2066−25\u2069'));
});

test('domain catalogues localize every enemy, floor, Joker, Curse and Jinx description', () => {
    const values = [
        ...JOKERS.flatMap(item => [item.name, item.text]),
        ...CURSES.flatMap(item => [item.name, item.boon, item.cost]),
        ...Object.values(JINXES).flatMap(item => [item.name, item.text]),
        ...FLOORS.flatMap(floor => [floor.name, floor.boss.name, ...floor.enemies.map(enemy => enemy.name), ...(floor.rules ? [floor.rules.label] : [])]),
    ];
    for (const text of values) {
        for (const locale of ['zh-Hans', 'zh-Hant', 'ar', 'hi']) assert.notEqual(translate(text, locale), text, `${locale}: ${text}`);
    }
});

test('saved Taiwan choices map to traditional and notifications fire only for changes', () => {
    assert.equal(translate('Settings', 'zh-Hant'), '設置');
    assert.equal(translate('Settings', 'zh-Hant-TW'), '設置');
    setLocale('zh-Hant-TW', false);
    assert.equal(getLocale(), 'zh-Hant');
    assert.equal(LOCALES.some(locale => locale.id === 'zh-Hant-TW'), false);
    setLocale('en-CA', false);
    const events = [];
    const unsubscribe = onLocaleChange(locale => events.push(locale));
    setLocale('fr-CA', false);
    setLocale('fr-CA', false);
    setLocale('invalid', false);
    assert.equal(getLocale(), 'fr-CA');
    assert.deepEqual(events, ['fr-CA']);
    unsubscribe();
    setLocale('en-CA', false);
    assert.deepEqual(events, ['fr-CA']);
});

test('Arabic isolates raw names and leaves direction specific to the chosen locale', () => {
    assert.equal(getDirection('ar'), 'rtl');
    for (const locale of LOCALES.filter(locale => locale.id !== 'ar')) assert.equal(getDirection(locale.id), 'ltr');
    for (const name of ['Normal', '<b>Goblin</b>', 'أحمد A. B']) {
        assert.equal(translate(`${name} joined the room.`, 'ar'), `انضم \u2068${name}\u2069 للغرفة.`);
    }
    assert.equal(translate('Blackjack', 'zh-Hans'), '二十一点');
    assert.equal(translate('Deal', 'zh-Hans'), '发牌');
    assert.equal(translate('Deal', 'zh-Hant'), '發牌');
});
