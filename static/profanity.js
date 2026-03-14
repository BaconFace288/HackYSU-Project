/**
 * profanity.js — HealSpace site-wide profanity filter
 *
 * Strategy:
 *   1. Normalise the input (leet speak, special chars, repeated chars, spacing tricks)
 *   2. Check normalised text against the word list
 *   3. Return { found: bool, word: string|null }
 */

// ---------------------------------------------------------------------------
// Step 1 — Normalization: map every common substitution to its plain letter
// ---------------------------------------------------------------------------
function normalizeLeet(raw) {
    return raw
        .toLowerCase()
        // Remove zero-width / invisible chars often used to evade filters
        .replace(/[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '')
        // Normalize unicode lookalikes (e.g. Cyrillic а → a)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')        // strip combining accents

        // ---- Letter-by-letter substitutions ----
        .replace(/ph/g, 'f')                     // ph → f  (phuck)
        .replace(/[@àáâãäå4]/g, 'a')
        .replace(/[ß6]/g, 'b')
        .replace(/[¢©çć]/g, 'c')
        .replace(/[đð]/g, 'd')
        .replace(/[3€èéêëě]/g, 'e')
        .replace(/[ƒ]/g, 'f')
        .replace(/[9gģ]/g, 'g')
        .replace(/[#ħ]/g, 'h')
        .replace(/[1!|íîïi]/g, 'i')
        .replace(/[ĵ]/g, 'j')
        .replace(/[ķ]/g, 'k')
        .replace(/[łĺ]/g, 'l')
        .replace(/[ñń]/g, 'n')
        .replace(/[0òóôõö]/g, 'o')
        .replace(/[þ]/g, 'p')
        .replace(/[®ŕř]/g, 'r')
        .replace(/[$5§šś]/g, 's')
        .replace(/[+7†ţ]/g, 't')
        .replace(/[üùúûµ]/g, 'u')
        .replace(/[\/\\vν]/g, 'v')       // v / w confusion
        .replace(/[ŵ]/g, 'w')
        .replace(/[×xyÿý]/g, 'x')
        .replace(/[żźž2]/g, 'z')

        // Remove separators people insert to break up words (f-u-c-k, f.u.c.k, f_u_c_k)
        .replace(/[-._*,;:'"(){}\[\]<>!?]/g, '')

        // Collapse repeated characters (fffuuuck → fuck, shhhhit → shit)
        .replace(/(.)\1{2,}/g, '$1$1')

        // Collapse whitespace (f u c k  → fuck when joined)
        // We keep spaces so word-boundary checks still work for short words
        .trim();
}

// Also produce a spaceless version to catch s p a c e d - o u t words
function normalizeSpaceless(raw) {
    return normalizeLeet(raw).replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Step 2 — Word list
// Words are stored as plain lowercase strings (no spaces, no special chars).
// The normalizer above converts user input before comparison.
// ---------------------------------------------------------------------------
const PROFANITY_WORDS = [
    // ---- Core profanities ----
    'fuck', 'fucker', 'fuckers', 'fucking', 'fucked', 'fucks', 'fuckoff', 'fuckup',
    'motherfucker', 'motherfucking', 'clusterfuck',
    'shit', 'shits', 'shitting', 'shitted', 'shitty', 'bullshit', 'horseshit', 'dipshit',
    'bitch', 'bitches', 'bitching', 'bitchy', 'son of a bitch',
    'ass', 'asses', 'asshole', 'assholes', 'jackass', 'smartass', 'dumbass', 'badass', 'fatass', 'lardass',
    'bastard', 'bastards',
    'damn', 'damned', 'goddamn', 'goddamned',
    'hell',   // low severity — keep but can be removed
    'crap', 'crappy',
    'piss', 'pissed', 'pissing', 'pissoff',
    'cock', 'cocks', 'cocksucker', 'cocksucking',
    'dick', 'dicks', 'dickhead', 'dickheads',
    'pussy', 'pussies',
    'cunt', 'cunts', 'cunting',
    'twat', 'twats',
    'whore', 'whores', 'whorish',
    'slut', 'sluts', 'slutty',
    'skank', 'ho', 'hoe',
    'wank', 'wanker', 'wankers', 'wanking',
    'jerk', 'jerkoff',
    'douche', 'douchebag', 'douchebags',
    'prick', 'pricks',

    // ---- Slurs (racial / ethnic) ----
    'nigger', 'nigga', 'niggas', 'niggers',
    'kike', 'kikes',
    'spic', 'spics', 'spick',
    'chink', 'chinks',
    'gook', 'gooks',
    'wetback', 'wetbacks',
    'beaner', 'beaners',
    'cracker',      // context-dependent but included
    'honky', 'honkie',
    'raghead',

    // ---- Homophobic / transphobic slurs ----
    'faggot', 'faggots', 'fag', 'fags',
    'dyke', 'dykes',
    'tranny', 'trannies',
    'shemale',

    // ---- Other offensive ----
    'retard', 'retarded', 'retards',
    'spaz', 'spastic',
    'idiot', 'idiots',    // mild — keep if context warrants
    'moron', 'morons',
    'imbecile',
    'cripple',
    'rape', 'raped', 'raping', 'rapist', 'rapists',
    'pedophile', 'pedophiles', 'pedo', 'paedo',
    'molest', 'molested', 'molesting', 'molester',

    // ---- Sexual ----
    'blowjob', 'blowjobs', 'handjob', 'handjobs',
    'cumshot', 'cumshots',
    'jizz', 'cum',
    'boner', 'erection',
    'dildo', 'dildos',
    'pornography', 'porn',

    // ---- Drug-related slang (context-sensitive) ----
    'crackhead', 'crackheads',
    'junkie', 'junkies',
];

// Pre-split for word-boundary (short words) vs. substring (long words)
const SHORT_WORDS = new Set(
    PROFANITY_WORDS.filter(w => w.replace(/\s/g, '').length <= 3)
);

// ---------------------------------------------------------------------------
// Step 3 — Check function
// ---------------------------------------------------------------------------

/**
 * Check whether `text` contains profanity.
 * @param {string} text  Raw user input
 * @returns {{ found: boolean, word: string | null }}
 */
export function checkProfanity(text) {
    if (!text || typeof text !== 'string') return { found: false, word: null };

    const normalized        = normalizeLeet(text);       // with spaces
    const normalizedNoSpace = normalizeSpaceless(text);  // no spaces, catches "f u c k"

    for (const word of PROFANITY_WORDS) {
        const clean = word.replace(/\s+/g, '');          // profanity word with no spaces

        if (SHORT_WORDS.has(word)) {
            // Word-boundary check to avoid "class" → "ass" false positives
            const re = new RegExp(`(?<![a-z])${escapeRegex(clean)}(?![a-z])`, 'i');
            if (re.test(normalized) || re.test(normalizedNoSpace)) {
                return { found: true, word };
            }
        } else {
            // Substring check for longer words (fewer false positives)
            if (normalized.includes(clean) || normalizedNoSpace.includes(clean)) {
                return { found: true, word };
            }
        }
    }

    return { found: false, word: null };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convenience boolean wrapper
 */
export function containsProfanity(text) {
    return checkProfanity(text).found;
}
