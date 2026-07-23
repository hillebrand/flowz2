# Key Insights & Strategische Implicaties

> Hoe de Trigger Map ontwerp- en ontwikkelbeslissingen stuurt

**Document:** Trigger Map - Key Insights
**Gemaakt:** 2026-07-20
**Status:** COMPLEET

---

## De Motor: Waarom Evelien's Succes Alles Aandrijft

**HET KERNDOEL (Prioriteit #1):**
- Evelien's frictieloze, rustige planningservaring is het enige doel dat zelfstandig waarde heeft
- Timeline: v1, nu in ontwikkeling
- Zonder dit werkt niets anders: geen schuldvrij herstel zonder een planning die het waard is om te vertrouwen
- Dit draagt de rest van de doelen

**Schuldvrij herstel & organische uitbreiding (Prioriteit #2):**
- Gedreven DOOR het kerndoel — pas relevant als de basis werkt
- Evelien's geaccepteerde herstel na tegenvallers, minder gemiste deadlines, Danielle's organische instap
- Timeline: v1 (herstel), ná v1-validatie (uitbreiding)
- Focus: bewijzen dat het systeem betrouwbaar genoeg is om aan een volgend gezinslid voor te stellen

**Adaptief leren (Prioriteit #3, lange termijn):**
- Pas zinvol zodra de eerste twee lagen aantoonbaar werken
- Timeline: post-v1, geen tijdsdruk
- **Kernvoorwaarde:** de architectuur mag hier nu al geen drempel voor opwerpen, ook al wordt het nog niet gebouwd

---

## Primaire Ontwikkelfocus

1. **Evelien's rustige hoofdscherm waarmaken** — het "geen overweldigend overzicht"-principe is niet optioneel polish, het is de kern van de eerste indruk
2. **De automatische tijdsverdeling vanaf de eerste taak laten kloppen** — geen ruimte voor een "leerperiode" waarin het nog niet realistisch aanvoelt
3. **Schuldvrije toon in UJ-6/7/8 expliciet ontwerpen, niet de generieke foutmelding hergebruiken** — dit is een architectuur-erkende maar UX-onopgeloste randvoorwaarde
4. **Deeltaken/sessieduur zichtbaar en bewust maken** — dit is wat Danielle's perfectionisme verzacht, niet als toevallige bijwerking maar als expliciet ontwerpdoel
5. **Google-login en Calendar-integratie als technische basis eerst neerzetten** — laagst scorend op drijfveer-impact, maar een harde afhankelijkheid voor drie Must Have-schermen (UJ-1, UJ-5, UJ-7)

---

## Kritieke Succesfactoren

- **Directheid van de eerstvolgende stap**: geen tussenscherm, geen keuzemenu — bij openen meteen zichtbaar wat nu moet gebeuren
- **Geloofwaardigheid van de herplanning**: elk voorstel bij tijdgebrek moet concreet en per-stap zichtbaar tijdwinst tonen, geen vage "we plannen opnieuw"
- **Onderscheid tussen technische fout en domein-escalatie**: UJ-6/7/8-meldingen mogen nooit dezelfde vorm/toon hebben als een technische foutmelding (architectuur-gap, nog UX-eigendom)
- **Zichtbare voortgang op subtaakniveau**: essentieel voor zowel Evelien's vertrouwen als Danielle's perfectionisme-geruststelling
- **Geen premature adaptieve claims**: v1 bouwt geen "leert van je"-mechaniek — communiceer dit nergens als al aanwezig

---

## Design Implications

### Hoofdscherm moet:
- Precies één eerstvolgende taak tonen met een "begin nu"-knop
- Geen volledige takenlijst of dashboard-gevoel oproepen
- De "vandaag niet als gepland?"-knop prominent maar niet opdringerig plaatsen

### Werksessie-flow moet:
- Subtaken tonen met duidelijke, individuele voortgang (niet alleen een totaalbalk)
- Pauzeren en uitstellen als volwaardige, nette acties presenteren — nooit als afwijking of falen
- Bij afronden expliciet tonen: gepland vs. besteed vs. resterend, zonder oordelende taal

### Tijdgebrek- en agendaconflict-meldingen (UJ-6/7/8) moeten:
- Een eigen visuele/tonale taal krijgen, losstaand van de technische error-envelope
- Altijd concreet tonen hoeveel tijd elk voorstel oplevert
- Nooit suggereren dat het tekort Evelien's (of Danielle's) schuld is

### Taak-formulier moet:
- Deeltaken invoeren laagdrempelig maken — dit is de sleutel tot Danielle's rust
- Auto-berekening van totale tijd transparant tonen zodra deeltaken tijd hebben

### Login/Calendar-flow moet:
- Zo min mogelijk aparte stappen hebben — één Google-consent voor beide
- Niet de indruk wekken dat dit "het product" is — puur een randvoorwaarde, op de achtergrond

---

## Emotionele Transformatiedoelen

- **Rust in plaats van planningsstress**: "Ik hoef niet meer zelf uit te zoeken waar te beginnen"
- **Vertrouwen in plaats van angst voor instorting**: "Een tegenvaller betekent niet meer dat alles overnieuw moet"
- **Acceptatie in plaats van schuldgevoel**: "Een mislukte dag is een aanpassing, geen falen"
- **Geruststelling in plaats van perfectionistische druk** *(Danielle)*: "Spreiden over meerdere keren is genoeg, het hoeft niet in één keer"
- **Overzicht zonder overweldiging**: "Ik zie precies wat nu moet, niet alles tegelijk"

---

## Design Focus Statement

**Flowz transformeert Evelien van iemand die zelf tegen wil en dank plant en telkens weer tegen instortende planningen aanloopt, naar iemand die vertrouwt op een systeem dat vooraf al rekening houdt met tegenvallers — een rustpunt, geen extra planningslast.**

**Primair Ontwerpdoelwit:** Evelien (Primair)

**Must Address (kritiek):**
1. Angst voor instorting van de planning → escalerende, concreet-tijdwinst-tonende herplanning (UJ-6/7/8)
2. Schuldgevoel bij een tegenvaller → schuldvrije, niet-verwijtende meldingstoon (nog UX-open)
3. Overweldigd raken door een vol overzicht → rustig hoofdscherm, precies één taak
4. Tijdsnood door onderschatte taakduur → automatische tijdsverdeling met doelmoment/buffer
5. Vertrouwen in de eerstvolgende stap → directe, actiegerichte hoofdscherm-flow

**Should Address (ondersteunend):**
1. Danielle's perfectionisme-spanning → zichtbare voortgang op deeltaakniveau
2. Danielle's onrust bij pauzeren/uitstellen → dit als nette, volwaardige acties presenteren
3. Technische randvoorwaarde login/Calendar → zo onopvallend en frictieloos mogelijk
4. Architectuur-ruimte voor adaptief leren → nu al geen ontwerpkeuzes maken die dit later blokkeren

---

## Ontwikkelfases

### **Eerste oplevering: Flowz v1 — de kernlus**
Focus op Evelien's transformatie van planningsstress naar rust:
- **Werksessie-flow** — het dagelijkse aanraakpunt
- **Taak-formulier met deeltaken** — voedt de motor, geeft Danielle later rust
- **Automatische tijdsverdeling** — de kernmotor
- **Rustig hoofdscherm** — de eerste indruk bij elke opening
- **"Vandaag niet als gepland?"-knop** — de schuldvrije herstelroute
- **Tijdgebrek-signalering (UJ-6)** — het escalatiemechanisme
- **Google-login + Calendar-integratie** — technische basis, laag in de achtergrond

### **Volgende fases:**
- **Fase 2:** Takenoverzicht, Beschikbare-tijd-instellingen, Weekplanning-overzicht (Consider-tier features)
- **Fase 3:** Agendaconflict-detectie (UJ-7) verfijnen op basis van eerste-gebruikservaring
- **Fase 4:** Organische validatie bij Danielle zodra Evelien's ervaring stabiel is
- **Fase 5 (post-v1):** Adaptieve tijdschattingen, zodra er voldoende gebruiksdata is

---

## Related Documents

- **[00-trigger-map.md](00-trigger-map.md)** — Visueel overzicht en navigatie
- **[01-Business-Goals.md](01-Business-Goals.md)** — Objectives en metrics
- **[02-Evelien-de-Scholier.md](02-Evelien-de-Scholier.md)** — Primaire persona
- **[03-Danielle-de-Perfectionist.md](03-Danielle-de-Perfectionist.md)** — Secundaire persona
- **[feature-impact-analysis.md](feature-impact-analysis.md)** — Featureprioritering

---

_Terug naar [Trigger Map](00-trigger-map.md)_
