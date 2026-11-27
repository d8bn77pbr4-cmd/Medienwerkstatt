/**
 * Wortlisten für die Textprüfung der Recherche (Regel-Chef, offline). Alles klein geschrieben.
 *
 * `COMMON_WORDS` ist eine kompakte deutsche Grundwortliste: sehr häufige Funktionswörter (Artikel, Pronomen,
 * Präpositionen, Konjunktionen, Hilfsverben, Partikeln) und häufige Verben, Nomen und Adjektive. Echter deutscher
 * Text besteht zu einem großen Teil daraus; Tastatursalat und Lorem ipsum fast gar nicht.
 * Lateinische Füllwörter (et, ut, sed, sit, est, non, ad …) stehen bewusst nicht darin.
 */

const ARTICLES = 'der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner keines';

const PRONOUNS = [
  'ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen',
  'mein meine meinen meinem meiner meines dein deine deinen deinem deiner',
  'sein seine seinen seinem seiner seines ihre ihren ihrem ihrer ihres',
  'unser unsere unseren unserem unserer euer eure euren eurem',
  'man jemand niemand alle alles allen aller jeder jede jedes jeden jedem',
  'dieser diese dieses diesen diesem jene jener welche welcher welches welchen',
  'was wer wen wem wessen etwas nichts viel viele vielen wenig wenige beide beiden',
  'andere anderen anderer anderes selbst einige einigen manche mehrere solche',
].join(' ');

const PREPOSITIONS = [
  'in im ins an am ans auf aus bei beim mit nach seit von vom vor zu zum zur',
  'über unter um durch für gegen ohne bis zwischen hinter neben trotz während',
  'wegen statt dank ab pro laut gegenüber innerhalb außerhalb entlang mithilfe',
].join(' ');

const CONJUNCTIONS = 'und oder aber denn sondern doch dass weil wenn als ob obwohl damit sodass falls bevor nachdem sowie sowohl weder noch entweder desto je';

const PARTICLES = [
  'nicht auch nur schon sehr so wie da dort hier dann jetzt heute morgen gestern immer wieder mehr meist',
  'ganz etwa dabei dazu davon darauf daraus darin danach dafür dagegen darum dadurch also eben gerade',
  'bereits zuerst später zuletzt oft manchmal nie bald sofort gern gerne lieber mal ja nein vielleicht',
  'wirklich besonders genau kaum fast zusammen allein wo wann warum weshalb woher wohin hin her',
  'zurück weiter vorher nachher dann trotzdem außerdem deshalb deswegen jedoch zudem ebenfalls',
  'natürlich eigentlich zum beispiel etwa ungefähr rund knapp mindestens höchstens wenigstens',
].join(' ');

const AUXILIARIES = [
  'sein bin bist ist sind seid war warst waren wäre wären gewesen',
  'haben habe hast hat habt hatte hatten hätte hätten gehabt',
  'werden werde wirst wird werdet wurde wurden würde würden geworden worden',
  'können kann kannst könnt konnte konnten könnte könnten',
  'müssen muss musst müsst musste mussten müsste',
  'sollen soll sollst sollt sollte sollten wollen will willst wollt wollte wollten',
  'dürfen darf durfte dürfte mögen mag möchte möchten lassen lässt ließ gelassen',
].join(' ');

const VERBS = [
  'machen macht gemacht geben gibt gab gegeben gehen geht ging gegangen kommen kommt kam gekommen',
  'sehen sieht sah gesehen zeigen zeigt gezeigt stehen steht stand liegen liegt finden findet gefunden',
  'bleiben bleibt nehmen nimmt genommen bringen bringt gebracht halten hält führen führt geführt',
  'arbeiten arbeitet erzählen erzählt entstehen entsteht entstanden beginnen beginnt begonnen',
  'brauchen braucht wissen weiß sagen sagt gesagt sprechen spricht laufen läuft erklären erklärt',
  'lernen lernt erleben erlebt bekommen bekommt passen passt wirken wirkt nutzen nutzt genutzt',
  'drehen dreht gedreht filmen filmt gefilmt schneiden schneidet geschnitten planen plant geplant',
  'stellen stellt gestellt setzen setzt hören hört fragen fragt antworten antwortet folgen folgt',
  'öffnen öffnet schließen schließt bauen baut gebaut kaufen kauft kostet kosten empfehlen empfiehlt',
  'reicht reichen liefert liefern bietet bieten sorgt sorgen enden endet wählen wählt',
].join(' ');

const NOUNS = [
  'jahr jahre jahren tag tage tagen zeit mensch menschen leute frau frauen mann männer kind kinder',
  'teil art weise ende anfang beispiel stadt ort orte welt arbeit leben haus hand hände familie',
  'team film filme video bild bilder ton musik geschichte frage fragen idee ziel weg seite bereich',
  'thema punkt minute minuten sekunde sekunden stunde stunden woche monat uhr morgen abend mittag',
  'kunde kunden kundin betrieb firma chef chefin meister meisterin werkstatt preis euro geld',
  'qualität problem lösung grund schluss anfang mitte szene szenen moment',
].join(' ');

const ADJECTIVES = [
  'gut besser beste neu alt groß größer klein lang länger kurz hoch tief erste zweite dritte letzte',
  'eigene ganz wichtig richtig falsch einfach schnell langsam ruhig klar schön stark leicht schwer',
  'junge jung alte offen nah nahe weit hell dunkel warm kalt echt eigentlich möglich nötig',
  'günstig teuer leise laut wenige mehrere gleich anders ähnlich typisch genau sicher',
].join(' ');

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Funktionswörter (Artikel, Pronomen, Präpositionen, Konjunktionen, Hilfsverben, Partikeln). */
export const FUNCTION_WORDS: ReadonlySet<string> = new Set(words([ARTICLES, PRONOUNS, PREPOSITIONS, CONJUNCTIONS, PARTICLES, AUXILIARIES].join(' ')));

/** Grundwortliste: Funktionswörter plus häufige Verben, Nomen und Adjektive (rund 600 Formen, gut 300 Grundwörter). */
export const COMMON_WORDS: ReadonlySet<string> = new Set([...FUNCTION_WORDS, ...words([VERBS, NOUNS, ADJECTIVES].join(' '))]);

/**
 * Fachwortstämme aus Film, Ton und Gestaltung („Gestaltungsidee“ und Textprüfung). Stämme mit Bindestrich oder
 * Doppelpunkt werden im Text gesucht, die übrigen in den Wörtern (siehe `containsAny`).
 */
export const FILM_TERMS: readonly string[] = [
  'kamera', 'total', 'halbnah', 'nah', 'detail', 'groß', 'schwenk', 'fahrt', 'zoom', 'gimbal', 'stativ', 'drohne',
  'licht', 'gegenlicht', 'farb', 'look', 'lut', 'schnitt', 'montage', 'j-cut', 'l-cut', 'blende', 'übergang',
  'übergäng', 'musik', 'ton', 'töne', 'atmo', 'o-ton', 'o-tön', 'interview', 'sprecher', 'voice-over', 'voiceover',
  'b-roll', 'zwischenschnitt', 'zeitlupe', 'zeitraffer', 'perspektiv', 'untersicht', 'aufsicht', 'bauchbinde',
  'titel', 'grafik', 'animation', 'schärfe', 'tiefenschärfe', 'format', '16:9', '9:16', 'hochformat',
  'einstellung', 'aufnahme', 'close-up', 'slow motion', 'kadrierung', 'bildausschnitt', 'handkamera', 'slider',
  'dolly', 'weißabgleich', 'belichtung', 'kontrast', 'sättigung', 'grading', 'tonspur', 'geräusch', 'mikro',
  'objektiv', 'brennweite', 'weitwinkel', 'tele', 'szene', 'sequenz', 'rhythmus', 'tempo', 'cut',
];

/** Technik-Kürzel ohne Vokal, die echte Wörter sind (sonst gälten sie als unplausibel), und häufige Abkürzungen. */
export const KNOWN_ABBREVIATIONS: ReadonlySet<string> = new Set(
  words('dslr dslm sdhc sdxc html mbps kbps srgb cmyk hdmi usb xlr rgb hdr sdr iso fps khz mhz jpg jpeg json mwst bzgl bspw zzgl ggfs vllt inkl evtl ca bzw usw'),
);

/** Wörter, die nur Platzhalter sind (zählen als unplausibel). */
export const PLACEHOLDER_WORDS: ReadonlySet<string> = new Set(
  words('test testtest bla blabla blablabla blub asdf foo lorem ipsum dolor todo tbd xyz abc qwe qwert qwertz'),
);

/** Stämme für „Zielgruppe“: Personengruppen und Altersangaben. */
export const AUDIENCE_STEMS: readonly string[] = [
  'kinder', 'kind', 'jugendlich', 'erwachsen', 'senior', 'famili', 'eltern', 'schüler', 'studier', 'student',
  'azubi', 'auszubild', 'kund', 'mitarbeit', 'fachpublikum', 'publikum', 'einwohner', 'bewohner', 'anwohner',
  'fans', 'nutzer', 'zuschauer', 'jahre', 'jährig', 'leute', 'mensch', 'frauen', 'männer', 'mädchen', 'jungen',
  'gäste', 'gast', 'besucher', 'mitglied', 'interessiert', 'interessent', 'liebhaber', 'anfänger', 'einsteiger',
  'profi', 'follower', 'abonnent', 'community', 'nachbar', 'bürger', 'rentner', 'pendler', 'tourist', 'urlauber',
  'hörer', 'leser', 'käufer', 'generation', 'teen', 'kids', 'ältere', 'junge', 'alle', 'firmen', 'unternehmen',
  'betriebe', 'händler', 'partner', 'lehrkräfte', 'lehrer', 'patient', 'sportler', 'verein', 'kolleg', 'paare',
  'zielgruppe', 'personen', 'gruppe',
];

/** Allgemeine Auftragswörter, die keinen Themenbezug belegen (zusätzlich zu `COMMON_WORDS`). */
export const KEYWORD_STOP: ReadonlySet<string> = new Set(
  words('recherche exposé expose drehplan shotlist rechte kaufberatung technik formatvergleich film filme video clip auftrag kunde kunden zum zur für'),
);
