---
title: PRD: Flowz
status: final
created: 2026-07-11
updated: 2026-07-26
---

# PRD: Flowz

## Doel van v1

Flowz neemt het plannen zelf uit handen, en zorgt dat een tegenvallende dag niet de hele planning laat instorten — dat is waar v1 op inzet, ook zonder de adaptieve "leert van jou"-laag uit de brief (zie Buiten scope voor nu).

**Succesindicator:** Evelien opent Flowz — wanneer dan ook op de dag — en weet binnen enkele seconden wat de eerstvolgende stap is, zonder zelf te hoeven plannen.

## Ontwerpprincipes

- **Rustig hoofdscherm** — het hoofdscherm toont zo min mogelijk informatie/details; de eerstvolgende stap staat centraal. Overige schermen mogen iets uitgebreider zijn, maar blijven simpel.
- **Geen schuldgevoel** — meldingen over tijd- of energiegebrek (UJ-6, UJ-7, UJ-8) worden zo geformuleerd dat Evelien zich niet schuldig hoeft te voelen over een gemist plan. Randvoorwaarde voor de UX-fase, niet alleen voor de mechaniek.

## Automatische tijdsverdeling

Flowz plant een taak niet zo vroeg mogelijk na het aanmaken, en ook niet zo laat mogelijk vóór de deadline: elke taak krijgt een **doelmoment** — het moment waarop de laatste sessie gepland staat — ergens in dat midden, altijd vóór de deadline zelf, zodat er ruimte blijft voor uitloop.

- De buffer tussen doelmoment en deadline is een **percentage van de totaal benodigde tijd** van de taak. Deze buffer wordt groter naarmate een taak **moeilijker of groter** is (grotere kans op uitloop), en kleiner naarmate de **prioriteit hoger** is (hoge prioriteit betekent dichter op de deadline gereed).
- Als meerdere taken op dezelfde dag concurreren om beschikbare tijd, bepaalt Flowz de volgorde op basis van: hoe weinig ruimte een taak nog heeft tot haar doelmoment (urgentie), de kans op uitloop (moeilijkheid × omvang), en prioriteit.
- Deze planning wordt gemaakt bij het aanmaken van een taak (UJ-2), en herberekend zodra daar aanleiding toe is: de benodigde tijd wijzigt, een sessie of taak wordt afgerond, of Evelien geeft tijd- of energiegebrek aan (UJ-6, UJ-7, UJ-8).
- **Studiedruk** — gebruikt in UJ-6 en UJ-8 als grens voor herplannen — is bewust geen enkelvoudig getal, maar een samengestelde inschatting. Tijdgebrek (benodigde t.o.v. beschikbare tijd) is de belangrijkste factor; moeilijke of langdurige taken, naderende deadlines en overige agenda-items wegen mee.

## User Journeys

### UJ-1: Evelien doorloopt een werksessie

Evelien opent Flowz op een doordeweekse avond. Ze ziet de dagplanning met de eerstvolgende taak prominent, de overige taken van vandaag met een tijdsindicatie, en rechts een dagagenda-weergave met items uit Google Calendar (afspraken, schoolrooster).

Ze tikt op **"Start sessie"** bij de eerstvolgende taak.

1. Tussenscherm: de benodigdheden voor de taak worden getoond, zodat ze die erbij kan pakken.
2. Ze tikt op **"Start"** — een oplopende timer gaat lopen, met een progress bar eronder (breedte = geplande sessietijd, gevuld deel = bestede tijd).
3. Daaronder staat de eerstvolgende subtaak met een eigen tijdsbalkje. Ze kan een subtaak **afronden** (volgende subtaak verschijnt) of **uitstellen** (volgende verschijnt, de uitgestelde subtaak komt later in de sessie terug).
4. Ze kan de sessie **pauzeren** (timer stopt, progress bar bevriest) of **afronden**.
5. Als de geplande sessietijd op is, blijft de sessie actief zodat ze door kan werken zonder actie te ondernemen (zie addendum voor het visuele signaal).
6. Bij **afronden** krijgt ze een overzicht: totale geplande tijd, bestede tijd, resterende tijd; voortgang op subtaken (aantal afgerond vs. totaal, details inklapbaar); de resterende benodigde tijd is aanpasbaar; een melding verschijnt als het aantal afgeronde subtaken afwijkt van de verwachting.
7. Ze keert terug naar het hoofdscherm: de dagplanning, met de volgende taak nu prominent in beeld en direct te starten.

### UJ-2: Evelien maakt een nieuwe taak aan

Vanaf elke pagina in Flowz tikt Evelien op de **+ knop** en opent een formulier voor een nieuwe taak:

- Titel _(verplicht)_
- Soort taak: proefwerk, SO, opdracht, PO _(verplicht)_
- Deadline _(verplicht)_
- Moeilijkheid: laag / gemiddeld / hoog, standaard gemiddeld _(verplicht)_
- Prioriteit: laag / gemiddeld / hoog, standaard gemiddeld _(verplicht)_
- Standaard sessieduur _(verplicht)_
- Totale benodigde tijd — handmatig in te vullen, tenzij ze bij deeltaken tijd invult: dan wordt dit veld automatisch de som van de deeltaaktijden en niet meer bewerkbaar
- Omschrijving _(optioneel)_
- Deeltaken, elk met een optioneel invoerveld voor tijd _(optioneel)_
- Benodigdheden _(optioneel)_

Bij opslaan verschijnt een bevestiging, wordt de dagplanning direct bijgewerkt volgens de automatische tijdsverdeling (de taak kan zo nodig nog dezelfde dag meetellen), en keert ze terug naar de pagina van waaruit ze het taak-toevoegen-formulier opende.

### UJ-3: Evelien stelt beschikbare tijd voor huiswerk in

Via het **hamburgermenu** opent Evelien de instellingenpagina voor beschikbare tijd.

- Bovenaan staan de dagen **maandag t/m zondag**, elk met een beschikbare tijd die ze met **+ en -** knoppen aanpast — dit vormt het terugkerende weekpatroon.
- Daaronder staat een **kalender** waarin ze voor specifieke dagen een afwijkende beschikbare tijd kan instellen, met dezelfde +/- knoppen, als uitzondering op het weekpatroon.

### UJ-4: Evelien beheert het takenoverzicht

Het takenoverzicht toont alle taken, gegroepeerd en gesorteerd op **deadline** (vaste sortering, niet aanpasbaar). Per taak zijn zichtbaar: titel, soort taak en een voortgangsbalkje.

Ze tikt op een taak en komt in de **detailweergave**, met knoppen om te **bewerken** en te **verwijderen**:

- **Bewerken** opent hetzelfde formulier als bij het aanmaken van een taak (UJ-2), vooringevuld met de bestaande gegevens.
- **Verwijderen** vraagt eerst om bevestiging.

### UJ-5: Evelien bekijkt de weekplanning

Via het **hamburgermenu** opent Evelien het weekoverzicht.

- Voor elke dag van de komende week staat onder elkaar, in cijfers (geen balk): de **beschikbare tijd** en de **benodigde tijd**.
- Per dag zijn ook de **ingeplande taken/sessies** voor die dag zichtbaar.
- Waar mogelijk worden ook de overige items uit **Google Calendar** getoond, puur indicatief — dit scherm is niet de plek om beschikbare tijd aan te passen.
- Wordt voor een dag zichtbaar dat de benodigde tijd de beschikbare tijd overschrijdt, dan markeert Flowz die dag als knelpunt en toont een concrete, direct accepteerbare oplossingssuggestie (dezelfde escalatielogica als UJ-6, maar hier als één voorstel per knelpunt in plaats van de volledige aanbeveling-voor-aanbeveling-flow). Zo ziet Evelien een drukke dag vroeg in de week aankomen, mét oplossing — dit is toegevoegd na de Trigger Map-fase (Objective 2: "Minder gemiste deadlines"), die dit scherm expliciet een proactieve rol gaf naast het oorspronkelijke, puur informatieve karakter.

### UJ-6: Flowz signaleert tijdgebrek en helpt oplossen

Flowz merkt zelf op wanneer de benodigde tijd niet meer past binnen de beschikbare tijd. Dit controleert Flowz op meerdere momenten:

- bij het aanmaken van een nieuwe taak (UJ-2)
- bij het aanpassen van beschikbare of benodigde tijd (UJ-3 / UJ-7)
- bij het aanpassen van de resterende benodigde tijd na het afronden van een sessie (UJ-1, stap 6)

Dit is een blokkade die direct opgelost moet worden. Flowz doorloopt daarbij escalerend:

1. **Herplannen** — eerst probeert Flowz sessies te verplaatsen naar andere dagen, binnen de grenzen van deadlines en de studiedruk op die dagen.
2. **Tijd verruimen** — lukt dat niet (voldoende), dan doet Flowz concrete voorstellen om beschikbare tijd te verruimen (bijv. "maandag van 2u naar 2,5u"), met meerdere suggesties waar mogelijk (bijv. ook "dinsdag een half uur langer").
3. **Sessies inkorten/schrappen** — lukt ook dat niet voldoende, dan stelt Flowz voor om sessies in te korten of te schrappen, op basis van **Prioriteit** (laagste prioriteit eerst).

Het scherm toont eerst hoeveel tijd er precies te weinig is. Evelien krijgt de voorstellen daaronder als **losse aanbevelingen**, elk apart te accepteren, met per aanbeveling hoeveel tijd die oplevert — zo kan ze bijvoorbeeld drie kleine aanpassingen accepteren, of in één keer één rigoureuze, tot het tekort is opgeheven.

### UJ-7: Flowz signaleert een agendaconflict bij opstarten

Bij het **opstarten van de app** controleert Flowz of de ingestelde beschikbare tijd conflicteert met items uit Google Calendar: de tijd die op een dag niet is ingepland door agenda-items (de daadwerkelijk beschikbare tijd) kan lager uitvallen dan de ingestelde beschikbare tijd.

1. Bij het eerste conflict met een specifiek agenda-item toont Flowz een **melding**, die direct opgelost moet worden.
2. Evelien kiest: **"dit conflicteert niet"** (het agenda-item is zelf haar huiswerktijd, bijv. "bibliotheek huiswerk maken"), of **beschikbare tijd aanpassen**.
3. Bij aanpassen komt ze in hetzelfde scherm als UJ-3 (afwijkende beschikbare tijd voor die datum), met het veld **voorgevuld** met de daadwerkelijk beschikbare tijd (de tijd die die dag niet is ingepland door agenda-items) — zij kan dit nog wijzigen.
4. Na bevestigen **herplant Flowz automatisch, volledig op de achtergrond**, de taken/sessies naar andere dagen — zonder tussenkomst of goedkeuring van Evelien.

### UJ-8: Evelien geeft aan dat een dag niet volgens plan gaat

Op het hoofdscherm heeft Evelien een knop **"Vandaag niet als gepland?"**. Ze tikt erop en geeft de reden aan: **te weinig tijd** of **te weinig energie**.

- Bij **te weinig tijd** vraagt Flowz hoeveel tijd er die dag daadwerkelijk beschikbaar is; met dat aantal doorloopt Flowz dezelfde escalatieketen als UJ-6 (herplannen → tijd verruimen → inkorten/schrappen op prioriteit).
- Bij **te weinig energie** past Flowz de planning voor vandaag aan:
  1. **Moeilijke taken** worden verschoven naar een andere dag; **eenvoudige taken** kunnen juist naar voren gehaald worden.
  2. Sessies worden alleen **ingekort** als dat niet leidt tot te hoge studiedruk op de dagen erna.
  3. Flowz toont altijd een **melding** van wat is aangepast — ook als de conclusie is dat er bewust niets is ingekort, omdat dat de studiedruk elders te hoog zou maken.

## Buiten scope voor nu

Bewust uitgesteld — architectuur moet hier rekening mee houden zodat latere toevoeging geen herontwerp vereist:

- Magister API- en Microsoft SSO-integratie (handmatige taakinvoer is het v1-mechanisme)
- Meerdere gebruikersprofielen (Evelien, zusje, vrienden)
- Multi-device gebruik met synchronisatie (mobiel + pc)
- Spraak-naar-tekst taakinvoer
- Adaptieve tijdschattingen ("Flowz leert van jou" — de kern-differentiator uit de brief, nog niet in v1)

Bewust uitgesteld, geen architectuur-impact verwacht:

- Specifieke aanpak voor uitstelgedrag

Definitief niet:

- Cijfer-gebaseerde suggesties voor moeilijkheid/prioriteit (werkt via het bestaande Prioriteit-veld, zie UJ-6)
