/* ═══════════════════════════════════════════════════════
   MULTI-LANGUAGE — authored translations, not machine translation
   ═══════════════════════════════════════════════════════

   Tagalog, English, Ilocano and Cebuano/Bisaya. Bisaya-speaking fans are a
   huge cohort and are routinely an afterthought in Manila-centric media, so
   all four are first-class here — no "and other dialects" fallback.

   Why this replaces the old approach: the site previously injected Google
   Translate and machine-translated the DOM at runtime (AUDIT.md §2 feature 7).
   That cannot satisfy "every archive item, answer, and UI string in all four",
   and unreviewed machine Ilocano applied to an artist's own words is exactly
   the failure the verified archive exists to prevent.

   So: UI strings come from the catalogue below (authored, reviewable, in the
   repo). Content strings come from a Translations table keyed by record, so a
   human writes and approves each one.

   HER AUDIO IS NEVER SYNTHESISED OR DUBBED. Translations produce SUBTITLE
   cues over her real recording. There is no TTS anywhere in this codebase and
   adding one would defeat the entire positioning.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, esc, fetchAll, safeRead } = require('./lib/common');

const TABLE = 'Translations';

const LANGUAGES = [
    { code: 'en',  name: 'English',  native: 'English' },
    { code: 'tl',  name: 'Tagalog',  native: 'Tagalog' },
    { code: 'ceb', name: 'Cebuano',  native: 'Bisaya' },
    { code: 'ilo', name: 'Ilocano',  native: 'Ilokano' },
];

/* ── UI catalogue ────────────────────────────────────────
   Every user-facing string the new surfaces use. Authored, not generated.
   Anything missing falls back to English rather than to machine output.   */
const UI = {
    en: {
        'nav.ask': 'Ask Yeng', 'nav.archive': 'Archive', 'nav.tour': 'Tour Map',
        'nav.games': 'Games', 'nav.cards': 'Cards', 'nav.points': 'Yeng Points',
        'ask.title': 'Totoong sagot.',
        'ask.subtitle': 'Ask it in your own words. If other fans are wondering the same thing, your questions travel together \u2014 and she answers the group by voice.',
        'ask.placeholder': "Write it the way you'd actually ask her.",
        'ask.submit': 'Send my question',
        'ask.langLabel': 'Ask in',
        'ask.grouping': 'How grouping works',
        'ask.preserved': 'Your wording stays here exactly as you sent it.',
        'ask.clusterIntro': 'people asked something like this.',
        'ask.mergedLabel': 'The question Yeng sees',
        'ask.yoursLabel': 'Your words',
        'ask.promote': 'Promote with Yeng Points',
        'ask.promoteNote': 'Guarantees she reviews it. Not that she answers it. Passed = full refund.',
        'ask.answered': 'Yeng answered the question you were part of',
        'ask.rejected': "This one didn't clear review.",
        'archive.title': 'Sinabi niya. Nandito.',
        'archive.subtitle': 'Search Yeng\u2019s real recordings, interviews and answers \u2014 and play the source from the exact second she said it.',
        'archive.search': 'A topic, a lyric, a memory\u2026',
        'archive.retrievalNote': 'Search returns her real recordings. Nothing here is paraphrased, summarised or generated, and her voice is never synthesised. This archive only grows when she approves an item herself.',
        'archive.verified': 'Verified',
        'tour.title': 'Saan mo gustong marinig si Yeng?',
        'tour.subtitle': 'Tell the team where you are \u2014 and how many people you\u2019d actually bring.',
        'tour.notAnnouncement': 'This is fan demand, not a concert announcement',
        'tour.pledge': 'Count us in',
        'tour.partySize': 'How many of you?', 'tour.people': 'people',
        'games.title': 'Play the catalogue', 'cards.title': 'Yeng Cards',
        'games.ranking': 'Song Ranking', 'games.millionaire': 'Yeng Millionaire',
        'games.lyric': 'Finish the Lyric', 'games.setlist': 'Setlist Prediction',
        'points.balance': 'Your Yeng Points', 'points.earn': 'How to earn',
        'common.loading': 'Loading…', 'common.retry': 'Try again',
        'common.login': 'Log in', 'common.cancel': 'Cancel', 'common.save': 'Save',
        'common.empty': 'Nothing here yet.',
    },
    tl: {
        'nav.ask': 'Tanong kay Yeng', 'nav.archive': 'Arkibo', 'nav.tour': 'Mapa ng Tour',
        'nav.games': 'Laro', 'nav.cards': 'Mga Card', 'nav.points': 'Yeng Points',
        'ask.title': 'Totoong sagot.',
        'ask.subtitle': 'Itanong mo sa sarili mong salita. Kung ganito rin ang tanong ng ibang fans, sabay-sabay na dadalhin ang mga tanong ninyo \u2014 at sasagutin niya ang grupo sa boses.',
        'ask.placeholder': 'Isulat mo kung paano mo talaga itatanong sa kanya.',
        'ask.submit': 'Ipadala ang tanong ko',
        'ask.langLabel': 'Magtanong sa',
        'ask.grouping': 'Paano pinagsasama ang mga tanong',
        'ask.preserved': 'Nananatili rito ang mga salita mo, eksakto sa pagkakapadala mo.',
        'ask.clusterIntro': 'katao ang nagtanong ng ganito.',
        'ask.mergedLabel': 'Ang tanong na nakikita ni Yeng',
        'ask.yoursLabel': 'Ang mga salita mo',
        'ask.promote': 'I-promote gamit ang Yeng Points',
        'ask.promoteNote': 'Sigurado na babasahin niya. Hindi garantiya na sasagutin. Kung lumaktaw siya, buong refund.',
        'ask.answered': 'Sinagot ni Yeng ang tanong na kasama ka',
        'ask.rejected': 'Hindi pumasa sa review ang isang ito.',
        'archive.title': 'Sinabi niya. Nandito.',
        'archive.subtitle': 'Hanapin ang totoong mga rekording, panayam at sagot ni Yeng \u2014 at patugtugin ang pinagmulan mula sa eksaktong segundong sinabi niya.',
        'archive.search': 'Isang paksa, linya ng kanta, alaala\u2026',
        'archive.retrievalNote': 'Totoong rekording ang ibinabalik nito. Walang pinaikli, binuod o ginawa-gawa, at hindi kailanman ginagaya ang boses niya. Lumalaki lang ang arkibong ito kapag siya mismo ang nag-apruba.',
        'archive.verified': 'Beripikado',
        'tour.title': 'Saan mo gustong marinig si Yeng?',
        'tour.subtitle': 'Sabihin mo sa team kung nasaan ka \u2014 at ilan talaga ang isasama mo.',
        'tour.notAnnouncement': 'Demand ito ng fans, hindi anunsyo ng concert',
        'tour.pledge': 'Isama kami',
        'tour.partySize': 'Ilan kayo?', 'tour.people': 'katao',
        'games.title': 'Laruin ang katalogo', 'cards.title': 'Yeng Cards',
        'games.ranking': 'Ranggo ng Kanta', 'games.millionaire': 'Yeng Millionaire',
        'games.lyric': 'Ituloy ang Lyrics', 'games.setlist': 'Hula sa Setlist',
        'points.balance': 'Ang iyong Yeng Points', 'points.earn': 'Paano kumita',
        'common.loading': 'Naglo-load…', 'common.retry': 'Subukan ulit',
        'common.login': 'Mag-log in', 'common.cancel': 'Kanselahin', 'common.save': 'I-save',
        'common.empty': 'Wala pa rito.',
    },
    ceb: {
        'nav.ask': 'Pangutan-a si Yeng', 'nav.archive': 'Arkibo', 'nav.tour': 'Mapa sa Tour',
        'nav.games': 'Dula', 'nav.cards': 'Mga Card', 'nav.points': 'Yeng Points',
        'ask.title': 'Naa kay ipangutana kang Yeng?',
        'ask.subtitle': 'Pangutana sa imong kaugalingong pinulongan. Kung mao usab ang gipangutana sa ubang fans, dungan nga modagan ang inyong mga pangutana \u2014 ug tubagon niya ang grupo pinaagi sa tingog.',
        'ask.placeholder': 'Isulat kung unsaon nimo kini pagpangutana kaniya.',
        'ask.submit': 'Ipadala ang akong pangutana',
        'ask.langLabel': 'Pangutana sa',
        'ask.grouping': 'Giunsa paghiusa ang mga pangutana',
        'ask.preserved': 'Magpabilin dinhi ang imong mga pulong, eksakto sa imong gipadala.',
        'ask.clusterIntro': 'ka tawo ang nangutana ug susama niini.',
        'ask.mergedLabel': 'Ang pangutana nga makita ni Yeng',
        'ask.yoursLabel': 'Ang imong mga pulong',
        'ask.promote': 'I-promote gamit ang Yeng Points',
        'ask.promoteNote': 'Garantiya nga iyang basahon. Dili garantiya nga tubagon. Kung molabay siya, tibuok refund.',
        'ask.answered': 'Gitubag ni Yeng ang pangutana nga apil ka',
        'ask.rejected': 'Wala kini nakapasar sa review.',
        'archive.title': 'Iyang gisulti. Ania dinhi.',
        'archive.subtitle': 'Pangitaa ang tinuod nga mga rekording, interbyu ug tubag ni Yeng \u2014 ug patugtoga ang tinubdan gikan sa eksaktong segundo nga iyang gisulti.',
        'archive.search': 'Usa ka topiko, linya sa kanta, handumanan\u2026',
        'archive.retrievalNote': 'Tinuod nga rekording ang ginabalik. Walay gipamubo, gisumaryo o gihimo-himo, ug dili gyud gisundog ang iyang tingog. Modako lang kini nga arkibo kung siya mismo ang mo-aprubar.',
        'archive.verified': 'Verified',
        'tour.title': 'Asa nimo gusto madungog si Yeng?',
        'tour.subtitle': 'Sultihi ang team asa ka \u2014 ug pila gyud ka tawo ang imong dad-on.',
        'tour.notAnnouncement': 'Demand kini sa fans, dili anunsyo sa konsiyerto',
        'tour.pledge': 'Iapil mi',
        'tour.partySize': 'Pila mo?', 'tour.people': 'ka tawo',
        'games.title': 'Dulaa ang katalogo', 'cards.title': 'Yeng Cards',
        'games.ranking': 'Ranggo sa Kanta', 'games.millionaire': 'Yeng Millionaire',
        'games.lyric': 'Padayona ang Lyrics', 'games.setlist': 'Tag-an ang Setlist',
        'points.balance': 'Imong Yeng Points', 'points.earn': 'Unsaon pagkita',
        'common.loading': 'Nag-load…', 'common.retry': 'Sulayi pag-usab',
        'common.login': 'Mag-log in', 'common.cancel': 'Kanselahon', 'common.save': 'I-save',
        'common.empty': 'Wala pa dinhi.',
    },
    ilo: {
        'nav.ask': 'Damagen ni Yeng', 'nav.archive': 'Arkibo', 'nav.tour': 'Mapa ti Tour',
        'nav.games': 'Ay-ayam', 'nav.cards': 'Dagiti Card', 'nav.points': 'Yeng Points',
        'ask.title': 'Adda damagmo ken Yeng?',
        'ask.subtitle': 'Idamagmo iti bukodmo a sasao. No isu met laeng ti damag dagiti sabali a fans, agkuyog dagiti damagyo \u2014 ket sungbatanna ti grupo babaen ti timek.',
        'ask.placeholder': 'Isuratmo no kasano a pudno nga idamagmo kenkuana.',
        'ask.submit': 'Ipatulod ti damagko',
        'ask.langLabel': 'Agdamag iti',
        'ask.grouping': 'No kasano a mapagtitipon dagiti damag',
        'ask.preserved': 'Agtalinaed ditoy dagiti sasaom, eksakto a kas panangipatulodmo.',
        'ask.clusterIntro': 'a tao ti nagdamag iti kastoy.',
        'ask.mergedLabel': 'Ti damag a makita ni Yeng',
        'ask.yoursLabel': 'Dagiti sasaom',
        'ask.promote': 'I-promote babaen ti Yeng Points',
        'ask.promoteNote': 'Sigurado a basaenna. Saan a garantiya a sungbatanna. No labsanna, kompleto a refund.',
        'ask.answered': 'Sinungbatan ni Yeng ti damag a nakikaduaam',
        'ask.rejected': 'Saan a limmasat iti review daytoy.',
        'archive.title': 'Imbagana. Adda ditoy.',
        'archive.subtitle': 'Biroken dagiti pudno a rekording, panagsarita ken sungbat ni Yeng \u2014 ket tugtogen ti taudan manipud iti eksakto a segundo nga imbagana.',
        'archive.search': 'Maysa a topiko, linia ti kanta, lagip\u2026',
        'archive.retrievalNote': 'Pudno a rekording ti maisubli. Awan ti napaababa, sinumario wenno inaramid, ken saan a pulos a tinulad ti timekna. Dumakkel laeng daytoy nga arkibo no isu mismo ti manganamong.',
        'archive.verified': 'Naverify',
        'tour.title': 'Sadino ti kayatmo a pakangngegan ken Yeng?',
        'tour.subtitle': 'Ibagam iti team no sadino ka \u2014 ken mano a tao ti pudno nga ikuyogmo.',
        'tour.notAnnouncement': 'Demand daytoy dagiti fans, saan a pakaammo ti konsierto',
        'tour.pledge': 'Iraman kami',
        'tour.partySize': 'Mano kayo?', 'tour.people': 'a tao',
        'games.title': 'Ay-ayamen ti katalogo', 'cards.title': 'Yeng Cards',
        'games.ranking': 'Ranggo ti Kanta', 'games.millionaire': 'Yeng Millionaire',
        'games.lyric': 'Ituloy ti Lyrics', 'games.setlist': 'Pakpakauna ti Setlist',
        'points.balance': 'Dagiti Yeng Points mo', 'points.earn': 'Kasano nga aggun-od',
        'common.loading': 'Agkarkarga…', 'common.retry': 'Padasen manen',
        'common.login': 'Mag-log in', 'common.cancel': 'Ikanselar', 'common.save': 'Idulin',
        'common.empty': 'Awan pay ditoy.',
    },
};

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const q = event.queryStringParameters || {};
    const lang = LANGUAGES.some((l) => l.code === q.lang) ? q.lang : 'en';

    try {
        const payload = {
            language: lang,
            languages: LANGUAGES,
            // English underneath so a missing key falls back to a real string,
            // never to machine translation.
            ui: { ...UI.en, ...(UI[lang] || {}) },
            audioPolicy: {
                dubbed: false,
                synthesised: false,
                note: 'Yeng\'s audio is never dubbed or synthesised. Translations appear as subtitles over her real recording.',
            },
        };

        /* ── Content translations for one record ── */
        if (q.recordId) {
            const base = getBase();
            const rows = await safeRead(
                () => fetchAll(base, TABLE, {
                    filterByFormula: `AND({RecordId} = '${esc(q.recordId)}', {Language} = '${esc(lang)}')`,
                }, 50),
                []
            );
            payload.content = rows.reduce((acc, r) => {
                acc[r.fields.Field || 'text'] = r.fields.Value || '';
                return acc;
            }, {});
            payload.contentAvailable = rows.length > 0;
            payload.subtitles = rows
                .filter((r) => r.fields.Field === 'subtitles')
                .map((r) => r.fields.Value)[0] || null;
        }

        return json(200, payload);
    } catch (err) {
        console.error('get-translations error:', err);
        // Never fail a page over i18n — ship English.
        return json(200, {
            language: 'en',
            languages: LANGUAGES,
            ui: UI.en,
            degraded: true,
        });
    }
};
