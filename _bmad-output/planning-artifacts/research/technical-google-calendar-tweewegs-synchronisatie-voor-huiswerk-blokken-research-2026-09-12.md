---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Google Calendar tweewegs-synchronisatie voor huiswerk-blokken'
research_goals: 'Uitzoeken wat er nodig is om handmatige verschuivingen van een huiswerk-agenda-event door Evelien te detecteren en over te nemen in Flowz'' eigen planning, i.p.v. ze bij de volgende sync stilzwijgend te overschrijven; en een aanbeveling of dit een BMAD-feature-traject rechtvaardigt.'
user_name: 'Hillebrand'
date: '2026-09-12'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-09-12
**Author:** Hillebrand
**Research Type:** technical

---

## Research Overview

Dit onderzoek beantwoordt of, en hoe, Flowz een handmatige verschuiving van een huiswerk-agenda-event door Evelien kan detecteren en overnemen — in plaats van die bij de volgende sync stilzwijgend te overschrijven, zoals nu het geval is. Het onderzoek is gebaseerd op Google's eigen Calendar API-documentatie (push-notifications, incrementele `syncToken`-sync) en op de bestaande Flowz-architectuur (`server/domain/calendar-sync/`, `server/domain/scheduling/`, de recente locking-fix van 2026-09-12/13).

Kernconclusie: dit is technisch haalbaar, maar een **fundamentele architectuurwijziging**, geen kleine toevoeging — het eerste autonoom draaiende proces in dit project, vijf datamodel-wijzigingen, en twee productbeslissingen die nog niet vastliggen (hoe een handmatig verplaatste sessie zich verhoudt tot de vier bestaande automatische herplan-lussen, en debounce bij een reeks snelle handmatige wijzigingen). Zie de Research Synthesis-sectie onderaan voor de volledige aanbeveling en gefaseerde opbouw.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Google Calendar tweewegs-synchronisatie voor huiswerk-blokken

**Research Goals:** Uitzoeken wat er nodig is om handmatige verschuivingen van een huiswerk-agenda-event door Evelien te detecteren en over te nemen in Flowz' eigen planning (`sessions`-tabel), i.p.v. ze bij de volgende sync stilzwijgend te overschrijven; en een aanbeveling of dit een BMAD-featuretraject rechtvaardigt.

**Aanleiding:** Evelien wil een geplande sessie (bv. wiskunde) handmatig kunnen verplaatsen door het Google Calendar-event te verschuiven. De huidige architectuur is eenrichtingsverkeer: Flowz berekent sessies en pusht ze naar Calendar (`server/domain/calendar-sync/homework-events.ts`, `homework-blocks.ts`'s `syncHomeworkBlocksForDate`), zonder ooit de Calendar uit te lezen om wijzigingen te detecteren.

**Technisch onderzoeksbereik:**

- **Architectuuranalyse** — hoe de huidige eenrichtings-sync-architectuur zich verhoudt tot wat tweewegs-sync vereist; interactie met de recent toegevoegde per-datum plaatsings-locking (`withSessionPlacementLocks`/`sessionPlacementLocks`, 2026-09-12/13) — elke oplossing moet daarmee samenwerken, niet omheen werken.
- **Google Calendar API-mechanismen** — `events.watch` (push-notifications) versus incrementele sync via `syncToken` versus periodiek pollen, met hun praktische beperkingen (kanaal-vervaltermijn ~7 dagen bij Calendar, notificaties zonder payload dus altijd een vervolg-list-call nodig, quota's).
- **Implementatie-aanpak in dit project specifiek** — nieuwe server-route(s) voor de webhook, nieuwe opslag (kanaal-id/resourceId/expiry, syncToken per user), een hernieuwingsmechanisme (nieuwe scheduled-infra, want die bestaat nog niet in dit SST-project), en hoe voorkomen wordt dat Flowz' eigen schrijfacties (`updateHomeworkEvent`) als "handmatige wijziging" geïnterpreteerd worden (echo/lus-preventie).
- **Interactie met Flowz' eigen automatische herplanning** (nieuw toegevoegd) — de vier stille herplan-lussen (`runPastSessionReplanLoop`, `runOverlappingSessionReplanLoop`, `runShortfallReplanLoop`, `runOutOfBlockReplanLoop`, draaien nu bij elke Home-load) kunnen een net-overgenomen handmatige verplaatsing van Evelien alsnog weer aanpassen omdat hun eigen logica "dit moet anders" concludeert — een ander soort "terugzetten" dan de pure schrijf-echo, en een aparte productbeslissing (moet een handmatig verplaatste sessie tijdelijk "bevroren" worden voor die checks, of gewoon meedraaien in dezelfde regels?).
- **Transparantie-laag: overzicht van doorgevoerde wijzigingen** (nieuw toegevoegd) — een i-icoon naast de "↻ Herplannen"-knop (Home/weekoverzicht) dat een dialoog opent met wat er is aangepast en waarom. Vereist eerst een wijzigingslog (geen enkele van de vier herplan-lussen legt momenteel vast wát ze deden of waarom). Dit is zowel een **mogelijk zelfstandig, kleiner traject** (transparantie voor de bestaande herplanning) als een **randvoorwaarde** voor tweewegs-sync (dezelfde laag kan tonen "je verplaatsing is overgenomen" vs. "toch aangepast, omdat …") — het onderzoek benoemt dit onderscheid expliciet, i.p.v. alles op één hoop te vegen.
- **Productbeslissingen die nu niet vastliggen** — nieuwe tijd buiten een beschikbaar blok, overlap met een andere sessie, tijdstip in het verleden, event volledig verwijderd (taak laten vervallen of terugvallen op automatische herplanning?), en of een title-wijziging ooit de taak zelf zou moeten aanpassen (waarschijnlijk nee, wordt benoemd).
- **Omvang-inschatting** — is dit een kleine toevoeging of een fundamentele architectuurwijziging, met een aanbeveling.

**Research Methodology:**

- Actuele webdata (voorop Google's eigen Calendar API-documentatie) met rigoureuze bronverificatie
- Multi-source-validatie voor kritieke technische claims
- Confidence-niveaus voor onzekere technische informatie
- Projectcontext (bestaande code/architectuur) als vast uitgangspunt, niet als aanname

**Scope Confirmed:** 2026-09-12

## Technology Stack Analysis

_Deze stap is aangepast aan het onderwerp: de "technology stack" voor dit project ligt al vast (Nuxt 4/SST v3 Ion/Turso, zie `README.md`/`sst.config.ts`) — de relevante vraag is niet "welke taal/framework" maar "welk Google Calendar API-mechanisme, en welke nieuwe infrastructuur-bouwsteen vraagt dat van deze specifieke stack". Generieke subkopjes die hier niet van toepassing zijn (IDE's, testframeworks, taalkeuze) zijn overgeslagen; de kopjes die overblijven zijn herbestemd naar wat wél relevant is._

### Google Calendar API — detectiemechanismen

**Optie A — Push-notifications (`events.watch`)**

Een "watch"-aanroep registreert een webhook-URL bij Google voor een specifieke resource (hier: de huiswerk-agenda). Bij elke wijziging stuurt Google een HTTP POST naar die URL — maar **zonder inhoud**: "Notification messages posted by the Google Calendar API to your receiving URL do not include a message body [...] you will need to make another API call to see the full change details." De notificatie bevat alleen headers: `X-Goog-Resource-State` (`sync` bij het aanmaken van het kanaal, `exists` bij een wijziging, `not_exists` als de resource verdwijnt), `X-Goog-Channel-ID`, `X-Goog-Resource-ID`, `X-Goog-Message-Number`. Een notificatie is dus altijd een trigger om zelf een `events.list`-aanroep (met `syncToken`, zie hieronder) te doen — nooit het eindpunt zelf.

Registratie-eisen: een publiek bereikbare HTTPS-endpoint met een geldig SSL-certificaat (geen self-signed), een unieke kanaal-`id` (max. 64 tekens), en `type: "web_hook"`. Een kanaal **verloopt na maximaal 7 dagen** bij Calendar — er bestaat geen automatische verlenging; de enige manier is een nieuw kanaal aanmaken vóór het oude verloopt (met een overlap-periode waarin beide actief zijn).
_Source: [Get push notifications — Google for Developers](https://developers.google.com/workspace/calendar/api/guides/push)_

**Optie B — Incrementele sync (`syncToken`)**

`events.list` accepteert een `syncToken` uit de vorige aanroep se `nextSyncToken`; het antwoord bevat dan alléén items die sindsdien zijn aangemaakt/gewijzigd/verwijderd — inclusief verwijderde items ("the result will always contain deleted entries"). Filters als `q`/`timeMin`/`timeMax` zijn niet te combineren met `syncToken` (400 Bad Request). Bij veel wijzigingen tussen twee syncs kan een `pageToken` in plaats van een `syncToken` terugkomen — dan eerst pagineren tot de laatste pagina, die wél een nieuwe `syncToken` geeft. Een sync-token kan **ongeldig worden** (na langere inactiviteit, of bij ACL-wijzigingen) — dat geeft een `410 Gone`, waarna een volledige full-sync nodig is.
_Source: [Synchronize resources efficiently — Google for Developers](https://developers.google.com/workspace/calendar/api/guides/sync)_

**Optie C — Puur pollen (zonder watch, alleen periodiek `syncToken`-sync)**

Technisch mogelijk zonder ooit een watch-kanaal te registreren: gewoon elke N minuten `events.list` met de opgeslagen `syncToken` aanroepen. Geen HTTPS-webhook-infrastructuur nodig, geen 7-dagen-vervaltermijn om te bewaken — maar latentie is per definitie gelijk aan het poll-interval (Evelien ziet haar eigen verschuiving pas terug in Flowz na de volgende poll, niet direct).

**In de praktijk: A + B zijn geen alternatieven maar aanvullingen op elkaar** — de watch-notificatie is alleen het "er is iets veranderd, kijk maar"-signaal; de daadwerkelijke diff komt altijd via een `syncToken`-aanroep. Optie C is dus eigenlijk "optie B, zonder de push-trigger als versneller".

### Quota en operationele grenzen

De Calendar API heeft een limiet van 1.000.000 queries per dag (project-breed, niet per user) — voor een single-user-tot-klein-gebruik-app als Flowz geen praktisch obstakel, zelfs bij pollen per minuut. Het echte operationele obstakel is niet quota maar het **7-dagen-kanaalvervaltermijn**: dat vraagt een terugkerend hernieuwingsmechanisme, ongeacht schaal.
_Source: [Google Calendar API Essential Guide — Rollout](https://rollout.com/integration-guides/google-calendar/api-essentials)_

### Infrastructuur-bouwstenen die dit van de huidige stack vraagt

- **Nieuwe server-route** (Nuxt/Nitro, `server/api/...`) als publiek HTTPS-webhook-endpoint voor `X-Goog-*`-headers — bestaat nog niet; elke bestaande route in dit project is een door de gebruiker geïnitieerde aanroep, geen door Google geïnitieerde inkomende call.
- **Nieuwe opslag** (Turso/Drizzle, naast de bestaande `homework_calendar_blocks`): kanaal-`id`, `resourceId`, vervaltijd, en de laatste `syncToken`, per user (en per gekoppelde agenda — de huiswerk-agenda, niet de beschikbare-tijd-agenda uit `availability/calendar-blocks.ts`, die dit niet nodig heeft).
- **Nieuwe scheduled infrastructuur**: dit project heeft momenteel geen enkele cron/scheduled Lambda (`sst.config.ts` declareert alleen `sst.aws.Nuxt`). SST v3/Ion heeft hiervoor een kant-en-klaar `sst.aws.Cron`-component (EventBridge Rule + Target + Lambda) — geen onoverkomelijke toevoeging, maar wél de **eerste** keer dat dit project iets anders dan een user-getriggerde HTTP-request draait.
_Source: [Cron — SST](https://sst.dev/docs/component/aws/cron/)_

**Ready to proceed to integration patterns analysis?**
[C] Continue - Save this to document and proceed to integration patterns

## Integration Patterns Analysis

_Zelfde aanpassing als stap 2: microservices/message-queue/GraphQL-subkopjes zijn niet van toepassing op een klein, single-tenant Nuxt-project. Herbestemd naar wat hier daadwerkelijk relevant is: het webhook-patroon zelf, echo/lus-preventie, en beveiliging van het inkomende endpoint._

### Webhook-patroon: notificatie als trigger, nooit als databron

Bevestigt en verdiept stap 2's kernpunt: elke binnenkomende notificatie is een **contentloze trigger** — de enige betrouwbare vervolgstap is een `events.list`-aanroep met de opgeslagen `syncToken`. Een praktisch gevolg hiervan voor de implementatie: één webhook-`address` kan voor alle users tegelijk dienen, met `X-Goog-Channel-ID` als onderscheid tussen users/kanalen — geen aparte URL per user nodig.
_Source: [Google Calendar API Essential Guide — Rollout](https://rollout.com/integration-guides/google-calendar/api-essentials)_

### Beveiliging van het inkomende endpoint

- **`X-Goog-Channel-Token`**: een zelfgekozen, geheim token dat je meegeeft bij het aanmaken van het watch-kanaal; Google stuurt 'm terug in elke notificatie. Het endpoint moet dit token verifiëren vóórdat de notificatie als geldig behandeld wordt — zonder dit kan iedereen die de webhook-URL raadt een nep-notificatie sturen die een onnodige (of zelfs kwaadaardige) sync-aanroep triggert.
- **CSRF-uitzondering**: de webhook-route moet uitgesloten worden van eventuele CSRF-bescherming (Nuxt/Nitro se `nuxt-auth-utils`/sessiemiddleware raakt deze route normaliter niet, maar dit is een expliciet aandachtspunt bij de implementatie — de aanroep komt van Google, niet van een ingelogde sessie).
- **Domeinverificatie**: het HTTPS-endpoint moet een geldig, niet-zelfondertekend certificaat hebben (CloudFront/Lambda Function URL, waar Flowz al op draait, voldoet hieraan out-of-the-box).
_Source: [Google Calendar webhooks: real-time event sync guide — CodeWords](https://www.codewords.ai/blog/google-calendar-webhooks)_

### Echo/lus-preventie (Flowz' eigen schrijfacties niet als "Evelien deed iets" zien)

Dit is **geen kant-en-klaar patroon van Google** — de websearch bevestigt dit expliciet: "distinguishing between self-initiated writes versus external changes [...] typically requires application-level logic to track the source or origin of changes." Concreet voorstel voor dit project, gebaseerd op wat Google's Events-resource al teruggeeft:

1. Elk Calendar-event heeft een `updated`-tijdstip (en een `etag`) die Google zelf bijhoudt en die verandert bij **elke** schrijfactie — ook een PATCH die Flowz zelf uitvoert (`updateHomeworkEvent`).
2. Sla dat `updated`-tijdstip (of `etag`) op in `homework_calendar_blocks` op het moment dat Flowz zelf een event schrijft (`createHomeworkEvent`/`updateHomeworkEvent` geven dit al terug in hun API-respons, momenteel ongebruikt).
3. Bij een sync-cyclus (getriggerd door de watch-notificatie, via `syncToken`): voor elk gewijzigd event, vergelijk het binnenkomende `updated`/`etag` met de laatst-opgeslagen waarde.
   - **Gelijk** → dit is de echo van Flowz' eigen laatste schrijfactie, negeren.
   - **Anders, én de tijd/duur is ook daadwerkelijk anders dan wat er in `sessions` staat** → een échte, externe wijziging door Evelien — verwerken.
4. Dit is fundamenteel een **vergelijking van twee losse bronnen van waarheid** (Google's `updated`/`etag` versus Flowz' eigen laatst-geschreven staat) — geen tijdstempel-marge/"binnen 5 seconden negeren"-heuristiek nodig (die zou bij een trage Lambda-cold-start of een toevallige gelijktijdige actie fout kunnen gaan), wél nieuwe boekhouding die vandaag niet bestaat.

### Interactie met de bestaande locking (`sessionPlacementLocks`)

De vier automatische herplan-lussen (`startup-check.ts`) en de tweewegs-sync-verwerking zouden **beide** de sessieplaats van dezelfde taak op dezelfde dag kunnen willen wijzigen. `withSessionPlacementLocks` (per user+datum, `server/data/tasks.ts`) is het juiste bestaande primitief om de sync-verwerking ook onder te brengen — géén nieuw lock-mechanisme nodig, wél een nieuwe aanroeper. Wat ontbreekt is niet de lock zelf, maar de **beslisregel** voor wat er gebeurt als de sync-verwerking en een herplan-lus na elkaar over dezelfde sessie heen willen (zie Architecturale Patronen-sectie hieronder voor de productbeslissing die dit vraagt).

### Debounce/coalescing van verwerking (aangevuld op verzoek van Hillebrand)

Concreet scenario: Evelien ruilt twee sessies — wiskunde vandaag ↔ natuurkunde morgen. Ze verplaatst eerst wiskunde (weg van vandaag), daarna natuurkunde (naar vandaag). Tussen die twee handelingen in bestaat er een moment waarop de agenda-staat op zichzelf genomen een probleem lijkt (bv. "vandaag heeft nu een gat", of tijdelijk een overlap/tekort) dat feitelijk geen probleem is — Evelien is nog niet klaar. Zonder debounce zou een sync-cyclus die precies op dat moment binnenkomt, de eerste helft van haar ruil alvast "corrigeren" (bv. via een van de bestaande herplan-lussen), wat haar tweede handeling in de weg zit of ongedaan maakt.

**Twee bruikbare AWS-patronen, beide zonder harde tijdslimiet-problemen:**

1. **EventBridge Scheduler, one-time schedule per user.** Bij elke binnenkomende watch-notificatie: maak (of, als 'ie al bestaat, overschrijf) een eenmalig schema genaamd bv. `sync-debounce-{userId}` met vuurtijd "nu + debounce-venster" (bv. 5 minuten). Komt er binnen dat venster nóg een notificatie, dan overschrijft die het schema simpelweg met een nieuwe, latere vuurtijd — het schema vuurt dus pas als het écht 5 minuten stil is geweest. Geen tijdslimiet op hoe ver in de toekomst (in tegenstelling tot SQS, zie punt 2), en named schedules kunnen expliciet aangemaakt/bijgewerkt/verwijderd worden — precies het "verleng de wachttijd bij elke nieuwe wijziging"-gedrag dat debounce nodig heeft.
_Source: [Amazon SQS delay queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html), [Scheduled API request processing in AWS](https://adrin-mukherjee.medium.com/scheduling-api-request-processing-in-aws-85b6e7dff5f0)_

2. **SQS delay queue.** Natuurlijke `DelaySeconds`-ondersteuning, maar gemaximeerd op **15 minuten** — voor een kort debounce-venster (enkele minuten) ruim voldoende, maar het "verleng bij een nieuwe wijziging"-gedrag is hier niet native: dat vraagt zelf een "is dit nog de laatste/geldige boodschap?"-check bij verwerking (de simpelste vorm: sla `lastNotificationAt` op per user, en bij verwerking van een uitgestelde boodschap alleen doorgaan als er sindsdien geen nieuwere is bijgekomen — anders deze boodschap gewoon negeren, de nieuwere volgt zijn eigen delay).

**Aanbeveling voor dít project: geen van beide als apart primitief, maar hergebruik van de al-noodzakelijke Cron-tick (kanaalvernieuwing, sectie hierboven).** Één terugkerende Cron (bv. elke 2 minuten) die zowel kanaal-hernieuwing controleert als: "is er een `lastChangeNotifiedAt` per user die langer dan het debounce-venster geleden is, én nog niet verwerkt?" — zo ja, dan pas de sync+reconciliatie uitvoeren. Dit voegt geen tweede nieuw AWS-primitief toe (geen EventBridge Scheduler, geen SQS) naast de toch al benodigde Cron, ten koste van precisie die hier niet nodig is (verwerking binnen "een paar minuten na de laatste wijziging" is ruim genoeg voor een huiswerkplanner, i.t.t. bv. een betaal-webhook). Dezelfde `lastChangeNotifiedAt`-timestamp per user is bovendien goedkope, simpele state (één kolom), geen aparte queue-infrastructuur.

**Ready to proceed to architectural patterns analysis?**
[C] Continue - Save this to document and proceed to architectural patterns

## Architectural Patterns and Design

_Zelfde aanpassing als de vorige twee stappen: generieke "microservices vs. monolith"/schaalbaarheids-subkopjes zijn niet zinvol voor een single-tenant Nuxt-app. Deze sectie beschrijft in plaats daarvan de concrete voorgestelde architectuur voor dít project._

### Voorgestelde verwerkingspijplijn

```
Google Calendar (huiswerk-agenda)
   │  wijziging door Evelien (of Flowz zelf)
   ▼
webhook-route (nieuw)  ──► valideert X-Goog-Channel-Token
   │
   ▼
"lastChangeNotifiedAt" bijwerken (nieuwe kolom, per user)
   │
   ▼
Cron-tick (nieuw, elke ~2 min — dezelfde tick als kanaal-hernieuwing)
   │  alleen als "stil sinds lastChangeNotifiedAt > debounce-venster"
   ▼
events.list met syncToken  ──► welke event(s) zijn gewijzigd?
   │
   ▼
per gewijzigd event: echo-check (updated/etag vs. laatst-zelf-geschreven)
   │  eigen echo → negeren
   ▼
matchen op homework_calendar_blocks.googleEventId → welke sessie?
   │
   ▼
productregels toepassen (zie hieronder) → sessions-tabel bijwerken,
   binnen withSessionPlacementLocks voor de betrokken datum(s)
   │
   ▼
wijzigingslog-rij schrijven (voor de i-knop-dialoog, zie Productbeslissingen)
```

### Databeslissing: "bevroren"/pinned sessie, ná Sunsama's precedent

Andere planningstools met een vergelijkbaar automatisch-plannen-vs-handmatig-verplaatsen-spanningsveld (bv. Sunsama's timeboxing) lossen dit op met een expliciete **Auto/Locked-toggle per item**: een handmatig verplaatst item wordt "Locked" en blijft op zijn nieuwe plek staan, ook als de rest van de planning daarna automatisch herschikt — auto-scheduling verplaatst nooit een gelockt item, en plant om het heen.
_Source: [Auto-scheduling — Sunsama User Manual](https://help.sunsama.com/docs/usage-guides/timeboxing/timeboxing-auto-scheduling/)_

**Vertaling naar Flowz:** een `sessions`-rij die via de tweewegs-sync is bijgewerkt krijgt een nieuw veld, bv. `manuallyPlacedAt` (tijdstip, nullable). Concrete beslisregel per bestaande herplan-lus:

| Lus | Gedrag bij een `manuallyPlacedAt`-sessie |
|---|---|
| `runPastSessionReplanLoop` | **Negeren** — een handmatig geplaatste sessie in het verleden is bewust zo gekozen (Evelien deed het gisteren toch niet, maar wilde het toen wél daar hebben staan); alleen relevant als de sessie ook echt nooit is afgerond, zelfde als nu. |
| `runOverlappingSessionReplanLoop` | **Andere taak verplaatsen, niet de gepinde.** Bij een overlap tussen een gepinde en een niet-gepinde sessie wint de gepinde altijd — consistent met "Evelien's laatste bewuste keuze telt". Overlappen twee gepinde sessies met elkaar (kan alléén als Evelien dat zelf zo achterlaat): geen automatische correctie, wel een signaal in de wijzigingslog/dialoog ("deze twee overlappen, pas zelf aan"). |
| `runShortfallReplanLoop` / `runOutOfBlockReplanLoop` | **Negeren voor het genereren van aanbevelingen die déze sessie zouden verplaatsen** — een gepinde sessie telt gewoon mee als "bezette tijd" voor andere taken, maar wordt zelf niet als kandidaat voor herplannen voorgesteld. |

Dit is een **productbeslissing die nu vastgelegd moet worden**, geen puur technische keuze — de tabel hierboven is een voorstel, niet een vastgestelde eis.

### Datamodel-wijzigingen (samenvatting)

- `sessions.manuallyPlacedAt` (nullable timestamp) — zie hierboven.
- `homework_calendar_blocks`: extra kolom `lastKnownUpdated`/`lastKnownEtag` — voor de echo-check (Integratiepatronen-sectie).
- Nieuwe tabel `calendar_watch_channels` (of vergelijkbaar): `userId`, `channelId`, `resourceId`, `expiresAt`, `syncToken`.
- Nieuwe kolom op `users` (of eigen tabel): `lastChangeNotifiedAt` — voor de debounce-tick.
- Nieuwe tabel (of uitbreiding) voor de wijzigingslog uit de vorige feature-vraag (Productbeslissingen, hieronder) — welke sessie is aangepast, door wie/wat (Evelien handmatig / welke herplan-lus), en waarom.

### Beveiliging

Niets fundamenteel nieuws t.o.v. wat dit project al doet: het channel-token en de eventuele syncToken zijn geen geheimen op het niveau van de al bestaande `TokenEncryptionKey`-versleutelde Calendar-tokens (`server/data/crypto.ts`), maar verdienen wel dezelfde behandeling (niet in platte tekst loggen, scoped per user). Het webhook-endpoint zelf heeft geen gebruikerssessie (Google roept 'm aan, niet Evelien's browser) — authenticatie loopt volledig via het channel-token, niet via `nuxt-auth-utils`.

### Operationeel (deployment)

Twee nieuwe SST-componenten naast de bestaande `sst.aws.Nuxt`: de webhook-route hoort al bij de Nuxt-app (gewoon een nieuwe `server/api/...`-route, geen apart component), maar de Cron-tick is een echt nieuw `sst.aws.Cron`-component met een eigen Lambda-handler — het eerste stuk infrastructuur in dit project dat niet direct door een gebruikersactie getriggerd wordt. Dat vraagt ook nieuw soort monitoring (CloudWatch-alarm op "Cron faalt herhaaldelijk" / "kanaal is verlopen zonder hernieuwing") — een categorie observability die dit project nu nog niet heeft, puur omdat er nooit iets autonoom draaide.

**Ready to proceed to implementation research?**
[C] Continue - Save this to the document and move to implementation research

## Implementation Approaches and Technology Adoption

_Zelfde aanpassing als de vorige stappen: "team-organisatie"/CI-CD-adoptie-subkopjes zijn niet zinvol voor een solo-ontwikkelaar op één klein project. Herbestemd naar risico's, gefaseerde opbouw, en kosten die hier daadwerkelijk relevant zijn._

### Risicoanalyse

| Risico | Impact | Mitigatie |
|---|---|---|
| Kanaal verloopt (7 dagen) zonder geslaagde hernieuwing (bv. Cron faalt een paar keer stil) | Tweewegs-sync valt terug naar "alleen-lezen"-gedrag van vandaag, zonder dat iemand het merkt — een stille regressie | CloudWatch-alarm op een kanaal dat binnen 24u verloopt zonder geslaagde hernieuwing |
| Echo-detectie faalt (bv. Google's `updated`-veld gedraagt zich anders dan verwacht bij een specifieke edge case) | Flowz interpreteert haar eigen schrijfactie als "Evelien deed iets", en gaat in een lus haar eigen aanpassingen "overnemen" | Een simpele bovengrens (net als de bestaande `MAX_AUTO_REPLAN_ITERATIONS`-lussen) + logging, zodat een lus zichzelf afkapt i.p.v. onbegrensd door te draaien |
| `manuallyPlacedAt`-regel (Architecturale sectie) blijkt in de praktijk verkeerd voor een scenario dat nu niet is doordacht | Evelien's handmatige verplaatsing verdwijnt tóch stilzwijgend, of blokkeert juist een legitieme herplanning | De wijzigingslog/i-dialoog (Productbeslissingen) maakt dit zichtbaar i.p.v. onzichtbaar — een verkeerde regel is dan een bug-report, geen mysterie |
| `syncToken` wordt ongeldig (410, na weken inactiviteit) | Eén gemiste cyclus, daarna gewoon een nieuwe full-sync — laag risico, met de bestaande escalatiepatronen in dit project (try/catch + loggen, nooit een 500 laten bubbelen) goed te ondervangen | Zelfde precedent als `syncHomeworkBlocksForDate`'s bestaande foutafhandeling |

### Kosten

Verwaarloosbaar: Calendar API-quota (1M queries/dag) wordt met een user en een polling-tick van enkele minuten nooit in de buurt benaderd; een extra `sst.aws.Cron`-Lambda die elke 2 minuten kort draait, valt ruim binnen AWS' free tier voor Lambda/EventBridge. Geen nieuwe betaalde dienst nodig.

### Gefaseerde opbouw (aanbevolen volgorde)

1. **Fase 0 — los, kleiner traject, vóór al het overige:** de wijzigingslog + i-dialoog voor de bestaande, al-werkende herplan-lussen (feature-vraag van eerder in dit gesprek). Levert op zichzelf al waarde (transparantie over wat de vier bestaande lussen nu al doen), en is de infrastructuur die tweewegs-sync later toch nodig heeft — geen weggegooid werk als tweewegs-sync uiteindelijk niet doorgaat.
2. **Fase 1 — alleen-lezen spike:** watch-kanaal + `syncToken`-sync bouwen, maar uitsluitend loggen wat er gedetecteerd wordt (geen enkele mutatie) — valideert de echo-detectie-aanname (Google's `updated`/`etag`-gedrag) tegen de eigen, echte Calendar-omgeving vóórdat er geschreven wordt.
3. **Fase 2 — mutatie, mét `manuallyPlacedAt`:** de daadwerkelijke overname van een handmatige verplaatsing in `sessions`, plus de beslisregels uit de Architecturale sectie.
4. **Fase 3 — debounce:** de Cron-tick-gebaseerde debounce (Integratiepatronen-sectie) — bewust ná fase 2, omdat debounce zonder een werkende basis-sync niets oplevert om op te testen.

### Omvang-inschatting

Dit is een **fundamentele architectuurwijziging, geen kleine toevoeging**: het eerste autonoom draaiende proces in dit project (Operationeel-sectie hierboven), vijf datamodel-wijzigingen, en een nieuwe klasse faalmodi (kanaal-verval, echo-detectie, debounce-timing) die dit project vandaag niet kent. De gefaseerde opbouw hierboven (fase 0 t/m 3) is bewust zo ontworpen dat elke fase op zichzelf al iets oplevert en getest kan worden vóór de volgende — geen "big bang"-implementatie.

**Ready to proceed to the final synthesis step?**
[C] Continue - Save this to document and proceed to synthesis

---

## Research Synthesis

### Executive Summary

Evelien wil een geplande sessie kunnen verplaatsen door het huiswerk-event in haar Google Calendar te verschuiven, in plaats van via Flowz zelf. Dat kan technisch — Google's Calendar API biedt hiervoor push-notifications (`events.watch`) gecombineerd met incrementele `syncToken`-sync — maar de huidige Flowz-architectuur is bewust eenrichtingsverkeer (Flowz schrijft, leest nooit terug), en die aanname zit verweven door meerdere bestanden (`homework-events.ts`'s "confirmed"-status-trick, `syncHomeworkBlocksForDate`'s "overschrijf gewoon"-gedrag). Tweewegs-sync omdraaien is dus geen losse toevoeging, maar een uitbreiding van die architectuur met een heel nieuwe categorie: het eerste proces in dit project dat niet door een gebruikersactie maar autonoom (een Cron-tick) getriggerd wordt.

Twee risico's die tijdens dit onderzoek naar boven kwamen en die *vóór* de bouw als productbeslissing vastgelegd moeten worden, niet er tijdens ontdekt: (1) Flowz' eigen vier automatische herplan-lussen (`runPastSessionReplanLoop`, `runOverlappingSessionReplanLoop`, `runShortfallReplanLoop`, `runOutOfBlockReplanLoop`) kunnen een net-overgenomen handmatige verplaatsing alsnog weer aanpassen — een ander soort "terugzetten" dan de pure schrijf-echo van Flowz' eigen Calendar-writes; (2) zonder debounce zou een tussentijdse staat tijdens een ruil van twee sessies (Evelien verplaatst eerst sessie A, dan pas sessie B) als een vals probleem gezien kunnen worden.

### Belangrijkste bevindingen

- **Detectiemechanisme**: `events.watch` (push) + `syncToken` (incrementele diff) zijn complementair, geen alternatieven — een notificatie bevat nooit de wijziging zelf. Een watch-kanaal verloopt na max. 7 dagen zonder automatische verlenging.
- **Nieuwe infrastructuur nodig**: een publiek webhook-endpoint, nieuwe opslag (kanaal/resourceId/syncToken, laatst-geschreven `updated`/`etag` per Calendar-blok, `manuallyPlacedAt` op sessies, een wijzigingslog), en het eerste `sst.aws.Cron`-component in dit project (voor kanaal-hernieuwing én de aanbevolen debounce-tick — één Cron, geen twee).
- **Echo-preventie** (Flowz' eigen schrijfacties niet als "Evelien deed iets" zien) is geen kant-en-klaar Google-patroon — vraagt eigen boekhouding op basis van Google's `updated`/`etag`-veld.
- **Productbeslissing "wint de handmatige verplaatsing?"**: het voorgestelde `manuallyPlacedAt`-veld (naar het Auto/Locked-patroon van vergelijkbare planningstools zoals Sunsama) geeft per bestaande herplan-lus een concrete regel, maar is een voorstel dat nog bevestigd moet worden, geen vaststaand ontwerp.
- **Debounce**: aanbevolen via de toch al benodigde Cron-tick (een `lastChangeNotifiedAt`-timestamp per user), niet via een extra AWS-primitief (SQS/EventBridge Scheduler) — simpeler, en past bij de schaal van dit project.
- **Losstaande, direct nuttige deelstap**: de wijzigingslog + i-dialoog naast de "↻ Herplannen"-knop (uit een eerdere feature-vraag in dit gesprek) is zowel een kleiner, zelfstandig traject als een randvoorwaarde voor tweewegs-sync — aanbevolen als eerste fase, sowieso.

### Aanbeveling

**Wel doorgaan, maar niet in één keer.** De gefaseerde opbouw uit de Implementatie-sectie:

0. Wijzigingslog + i-dialoog voor de bestaande herplanning (zelfstandig nuttig, geen weggegooid werk).
1. Alleen-lezen spike: watch + syncToken bouwen, alleen loggen — valideert de echo-detectie-aanname tegen de échte Calendar vóór er iets gemuteerd wordt.
2. Mutatie + `manuallyPlacedAt` + de beslisregels per herplan-lus.
3. Debounce via de Cron-tick.

**Vóór fase 2 moeten deze productbeslissingen expliciet bevestigd worden** (niet impliciet in code vastgelegd): de `manuallyPlacedAt`-regels per herplan-lus (Architecturale sectie), en wat er gebeurt bij een verwijderd event / een nieuwe tijd buiten een blok / een tijdstip in het verleden (Scope-sectie).

### Volgende stap: BMAD-traject

Gegeven de omvang (fundamentele architectuurwijziging, niet een losse story) is de aanbevolen vervolgstap **`bmad-correct-course`** — dit raakt vastgelegde architectuurkeuzes (de eenrichtings-sync-aanname) en verdient een expliciete sprint-change-proposal, zoals dit project al eerder deed (`sprint-change-proposal-2026-09-05.md`) vóórdat er epics/stories uit voortkomen.

---

**Technical Research Completion Date:** 2026-09-12
**Confidence Level:** Hoog voor de Google Calendar API-mechanismen (rechtstreeks uit Google's eigen documentatie); middel voor de projectspecifieke ontwerpvoorstellen (`manuallyPlacedAt`, debounce-via-Cron) — dit zijn beargumenteerde voorstellen, geen vastgestelde specificatie.
