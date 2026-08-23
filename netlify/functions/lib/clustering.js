/* ═══════════════════════════════════════════════════════
   QUESTION CLUSTERING
   ═══════════════════════════════════════════════════════

   "847 people asked something like this. Here's the merged question that
    goes to Yeng. Here's your version."

   Two-stage design, deliberately cheap first:

   1. LEXICAL match (free, instant, deterministic). Normalise the question,
      strip Tagalog/English stopwords, build a token set, and compare against
      open clusters with a weighted Jaccard + bigram overlap. This resolves
      the overwhelming majority of "what's your favourite song" restatements
      with no API call and no latency, which matters because it runs inside
      the fan's submit request.

   2. LLM merge (OpenAI, only when a NEW cluster forms, and only to write the
      merged question text). We never ask the model to decide membership —
      that would make cluster counts non-deterministic and unexplainable to
      a fan looking at "847 people asked this". Membership is always lexical
      and always reproducible.

   Bilingual by necessity: fans ask in Taglish, so the stopword list and the
   synonym map cover both languages plus common Cebuano/Ilocano question words.
   ─────────────────────────────────────────────────────── */

const { esc, fetchAll, safeRead, nowISO } = require('./common');

const CLUSTER_TABLE = 'QuestionClusters';
const QUESTION_TABLE = 'Questions';

/* Similarity above which a question joins an existing cluster. Tuned so that
   restatements merge but genuinely different questions about the same song
   stay apart. */
const JOIN_THRESHOLD = 0.42;

const STOPWORDS = new Set([
    // English
    'a','an','the','is','are','was','were','be','been','being','do','does','did','doing',
    'have','has','had','i','you','your','yours','me','my','mine','we','us','our','they',
    'them','it','its','of','to','in','on','at','for','with','from','by','about','as','and',
    'or','but','if','so','than','then','that','this','these','those','there','here','what',
    'which','who','whom','how','when','where','why','can','could','would','should','will',
    'shall','may','might','must','just','really','very','also','not','no','yes','please',
    'ever','ya','po','yung','ung',
    // Tagalog / Taglish
    'ang','ng','mga','sa','ay','na','at','ni','si','kay','ako','ikaw','ka','mo','ko','kami',
    'kayo','sila','niya','nila','natin','namin','ito','iyan','iyon','yan','yun','ba','naman',
    'lang','din','rin','pa','pala','kasi','pero','kung','para','may','meron','wala','ano',
    'sino','saan','kailan','bakit','paano','gaano','opo','oo','hindi','di','nga','talaga',
    'sana','daw','raw','yan','eh',
    // Cebuano / Ilocano common function words
    'ug','sa','ang','ka','ko','nimo','nako','unsa','kinsa','asa','ngano','unsaon','kanus',
    'ti','ken','iti','dagiti','ania','apay','kasano','siasino',
]);

/* Concept normalisation. Collapsing synonyms before comparison is what makes
   "paborito", "favourite" and "favorite" land in the same cluster. */
const SYNONYMS = {
    favourite: 'favorite', paborito: 'favorite', pinaka: 'favorite', best: 'favorite',
    song: 'song', kanta: 'song', awit: 'song', track: 'song', tugtog: 'song',
    write: 'write', wrote: 'write', writing: 'write', sulat: 'write', isinulat: 'write',
    compose: 'write', composed: 'write', gawa: 'write', ginawa: 'write',
    sing: 'sing', sang: 'sing', singing: 'sing', kanta2: 'sing', kumanta: 'sing',
    album: 'album', record: 'album', recording: 'album', plaka: 'album',
    concert: 'concert', show: 'concert', gig: 'concert', konsiyerto: 'concert',
    perform: 'concert', performance: 'concert', tour: 'concert',
    inspire: 'inspiration', inspired: 'inspiration', inspiration: 'inspiration',
    influence: 'inspiration', idol: 'inspiration',
    advice: 'advice', tip: 'advice', payo: 'advice', tips: 'advice',
    start: 'start', started: 'start', begin: 'start', simula: 'start', nagsimula: 'start',
    faith: 'faith', god: 'faith', diyos: 'faith', panalangin: 'faith', pray: 'faith',
    prayer: 'faith', dasal: 'faith', bible: 'faith',
    hard: 'hardship', difficult: 'hardship', hirap: 'hardship', struggle: 'hardship',
    challenge: 'hardship', mahirap: 'hardship',
    love: 'love', pagibig: 'love', pag: 'love', mahal: 'love', crush: 'love',
    fan: 'fans', fans: 'fans', supporter: 'fans', supporters: 'fans', tagahanga: 'fans',
    meaning: 'meaning', means: 'meaning', kahulugan: 'meaning', about: 'meaning',
    next: 'future', future: 'future', upcoming: 'future', plan: 'future', plans: 'future',
    collab: 'collab', collaborate: 'collab', collaboration: 'collab', duet: 'collab',
};

/** Lowercase, strip punctuation/diacritics, drop stopwords, apply synonyms. */
function tokenize(text) {
    const cleaned = String(text || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
        .replace(/[^a-z0-9\s']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const tokens = cleaned.split(' ')
        .filter((t) => t.length > 1 && !STOPWORDS.has(t))
        .map((t) => SYNONYMS[t] || t);

    return [...new Set(tokens)];
}

/** Ordered adjacent pairs — catches phrasing similarity a bag of words misses. */
function bigrams(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
    return out;
}

function jaccard(a, b) {
    if (!a.length || !b.length) return 0;
    const setB = new Set(b);
    const inter = a.filter((x) => setB.has(x)).length;
    return inter / (a.length + b.length - inter);
}

/**
 * Similarity in [0,1]. Unigrams carry most of the weight; bigrams break ties
 * between questions that share vocabulary but not shape.
 */
function similarity(tokensA, tokensB) {
    const uni = jaccard(tokensA, tokensB);
    const bi = jaccard(bigrams(tokensA), bigrams(tokensB));
    return uni * 0.75 + bi * 0.25;
}

/** Signature stored on the cluster so we never re-tokenize on every compare. */
function signature(tokens) {
    return tokens.slice(0, 40).join(' ');
}

/**
 * Find the best open cluster for a question, or null if it should start one.
 * `openClusters` are records from QuestionClusters with Status 'Open'.
 */
function findCluster(questionText, openClusters) {
    const tokens = tokenize(questionText);
    if (!tokens.length) return { match: null, tokens, score: 0 };

    let best = null;
    let bestScore = 0;

    for (const c of openClusters) {
        const sig = c.fields.Signature || '';
        const clusterTokens = sig ? sig.split(' ').filter(Boolean) : tokenize(c.fields.MergedQuestion || '');
        const score = similarity(tokens, clusterTokens);
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }

    return {
        match: bestScore >= JOIN_THRESHOLD ? best : null,
        tokens,
        score: bestScore,
    };
}

/**
 * Ask the model to write the merged question. Membership is already decided —
 * this only produces the human-readable text a fan sees as "the merged
 * question that goes to Yeng".
 *
 * Falls back to the fan's own wording if OpenAI is unavailable, so a missing
 * API key degrades the copy rather than breaking submission.
 */
async function mergeQuestionText(sampleQuestions) {
    const fallback = String(sampleQuestions[0] || '').trim();

    if (!process.env.OPENAI_API_KEY) return { text: fallback, generated: false };

    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 120,
            messages: [
                {
                    role: 'system',
                    content:
                        'You merge similar fan questions for a Filipino musician into ONE clear question. ' +
                        'Rules: write only the merged question, nothing else. Keep it under 25 words. ' +
                        'Keep the fans\' own register — if they wrote Taglish, keep Taglish. ' +
                        'Never invent detail that is not in the submissions. Never write an answer. ' +
                        'Never write in the artist\'s voice.',
                },
                {
                    role: 'user',
                    content:
                        'Merge these fan questions into one:\n\n' +
                        sampleQuestions.slice(0, 12).map((q, i) => `${i + 1}. ${q}`).join('\n'),
                },
            ],
        });

        const text = (completion.choices[0]?.message?.content || '').trim()
            .replace(/^["'`]+|["'`]+$/g, '')
            .replace(/^(merged question:?)\s*/i, '');

        if (!text || text.length > 300) return { text: fallback, generated: false };
        return { text, generated: true };
    } catch (err) {
        console.warn('[clustering] merge failed, using fan wording:', err.message);
        return { text: fallback, generated: false };
    }
}

/** Short human topic label for the handler dashboard's theme ranking.

    Takes the LAST two meaningful tokens rather than the first three. In a
    question the subject almost always lands at the end -- "...when you wrote
    Hawak Kamay?", "...behind Chinita Girl?", "...a full acoustic album?" --
    so the tail is the topic and the head is scaffolding. The first-three
    version produced "Going · Through · Head", which reads as debug output
    next to a real question. */
function topicLabel(tokens) {
    const meaningful = tokens.filter((t) => t.length > 2);
    if (!meaningful.length) return 'General';
    const tail = meaningful.slice(-2);
    return tail.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}

/** Load the open clusters a new question could join. */
async function loadOpenClusters(base, limit = 400) {
    return safeRead(
        () => fetchAll(base, CLUSTER_TABLE, {
            filterByFormula: `{Status} = 'Open'`,
            sort: [{ field: 'QuestionCount', direction: 'desc' }],
        }, limit),
        []
    );
}

/** Create a fresh cluster seeded by one question. */
async function createCluster(base, { questionText, tokens, language }) {
    const merged = await mergeQuestionText([questionText]);
    const rec = await base(CLUSTER_TABLE).create({
        MergedQuestion: merged.text,
        Signature: signature(tokens),
        Topic: topicLabel(tokens),
        QuestionCount: 1,
        Status: 'Open',
        Promoted: false,
        PromotionCount: 0,
        Language: language || 'en',
        CreatedAt: nowISO(),
        UpdatedAt: nowISO(),
    });
    return rec;
}

/**
 * Grow a cluster by one and refresh its signature so it drifts toward the
 * centre of what people actually asked, rather than being pinned to whoever
 * happened to ask first.
 */
async function growCluster(base, cluster, tokens) {
    const count = (Number(cluster.fields.QuestionCount) || 0) + 1;
    const existing = (cluster.fields.Signature || '').split(' ').filter(Boolean);
    const merged = [...new Set([...existing, ...tokens])].slice(0, 40);

    await base(CLUSTER_TABLE).update(cluster.id, {
        QuestionCount: count,
        Signature: merged.join(' '),
        UpdatedAt: nowISO(),
    });
    return count;
}

module.exports = {
    CLUSTER_TABLE, QUESTION_TABLE, JOIN_THRESHOLD,
    tokenize, similarity, signature, findCluster, mergeQuestionText,
    topicLabel, loadOpenClusters, createCluster, growCluster,
};
