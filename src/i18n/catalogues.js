/** Collects independently editable locale dictionaries with identical English source keys. */
import english from './en-CA.json' with { type: 'json' };
import french from './fr-CA.json' with { type: 'json' };
import spanish from './es.json' with { type: 'json' };
import punjabi from './pa-Guru.json' with { type: 'json' };
import arabic from './ar.json' with { type: 'json' };
import hindi from './hi.json' with { type: 'json' };
import tagalog from './tl.json' with { type: 'json' };
import simplified from './zh-Hans.json' with { type: 'json' };
import traditional from './zh-Hant.json' with { type: 'json' };

export const CATALOGUES = Object.freeze({
    'en-CA': english, 'fr-CA': french, es: spanish, 'pa-Guru': punjabi,
    ar: arabic, hi: hindi, tl: tagalog, 'zh-Hans': simplified, 'zh-Hant': traditional,
});
