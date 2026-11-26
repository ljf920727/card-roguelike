# Localization

English, Canadian French, Spanish, Punjabi, Arabic, Hindi, Tagalog and simplified/traditional Chinese serve Canada's official-language audiences and the major communities identified in the language survey.

Localization belongs to presentation. Rules, saved runs, card identifiers and the
co-op protocol retain their existing values. A language change updates text and
accessible labels without rerunning combat, replacing controls, or replaying audio.

## Catalogues

Every language has its own JSON dictionary in `src/i18n/`: `en-CA.json`,
`fr-CA.json`, `es.json`, `pa-Guru.json`, `ar.json`, `hi.json`, `tl.json`,
`zh-Hans.json` and `zh-Hant.json`. All use identical English source keys.
`catalogues.js` registers these dictionaries; no language depends on an array
column. Keep all dictionaries complete when adding messages.

Use exact entries for static labels. Dynamic messages use explicit full-sentence
templates such as `Turn {n} — Waiting for {player}`. Translation placeholders
are verbatim unless marked `:t`, for example `{enemy:t}` for a catalogue enemy
name. **Never mark player names or room codes for translation.** Numeric captures
use names beginning with `n`; card ranks and suits have constrained captures.
Prefer specific templates to broad patterns that could consume unrelated sentences.
Unknown messages fall back to English. Existing sentence and effect-list composition
is supported, but new complete messages should receive explicit entries.

## Views

- Call `setText(element, englishSource)` for dynamic text, `setLabel` for translated
  `aria-label`, `title`, and `placeholder`, and `appendText` beside existing markup.
- Call `localizeTree(root)` once after inserting static markup. Use `translate="no"`
  for player data, proper names or language autonyms that must stay unchanged.
- Use `sourceLabel` when copying a card's bound accessible label to its button.
- A `setText` callback can combine a raw player name with translated game labels.
  It must only read presentation data, and always returns plain text.
- Canvas views subscribe with `onLocaleChange` and release subscriptions on destroy.
  Fit long translations inside the card without changing its hit area or position.

Bindings retain English sources on their DOM nodes under shared symbols. Refresh
walks mounted nodes only; discarded cards are not retained. The document language
and a shared language-change event keep all views consistent across module loads.
All translations are written as plain text. Arabic sets the document direction to
RTL; card geometry and numeric resources retain their normal order, while names
inside Arabic prose are isolated from surrounding text. Numeric fractions in the
Arabic catalogue use a left-to-right isolate around the entire fraction, so
current/maximum values retain their order. Card faces and dealt card rows also
retain left-to-right order independently of their surrounding controls.

## Preferences and adding a language

Settings shows a Language button beside Sound; it opens the same preferences-sheet
layout with raised language choices and a Chinese group that starts collapsed.

Supported BCP 47 tags live in `LOCALES` in `src/i18n/index.js`. The local preference
key is `juniper.language`. Unavailable storage leaves the preference usable for the
current page. Storage events synchronize other tabs; different co-op browsers do
not share a language preference. Gurmukhi detection does not claim to support
Shahmukhi Punjabi.
Saved `zh-Hant-TW` preferences migrate to `zh-Hant`; Taiwan and Hong Kong browser
preferences also select traditional Chinese. The removed variant has no separate
menu choice or dictionary.

To add a language, add its catalogue values and locale metadata, update browser
language resolution and the Settings picker, and check font support and text
expansion. Chinese remains a disclosure group with two selectable leaves.

Run `npm test` and `npm run build`. For UI changes, also check keyboard controls,
320px and desktop layouts, both themes, reload/storage failures, live selections,
blackjack rounds, rewards/shop cards, and two co-op clients using different
languages. Linguistic review by native speakers is separate from functional tests.
