# Business Goals & Objectives

> Strategische doelen en meetbare objectives voor Flowz

**Document:** Trigger Map - Business Goals
**Gemaakt:** 2026-07-20
**Status:** COMPLEET

---

## Visie

**Flowz neemt de mentale last van plannen weg bij middelbare scholieren door zelf te plannen in plaats van dat aan de leerling over te laten — en wordt daarin treffender naarmate het langer gebruikt wordt.**

---

## Business Objectives

### ⭐ KERNDOEL: Evelien's rustige planningservaring (DE MOTOR)

- **Statement:** Evelien opent Flowz op elk moment van de dag en weet, zonder zelf te hoeven zoeken of scrollen, wat de eerstvolgende stap is.
- **Metric:** Geen extra actie (scrollen, zoeken, nadenken) nodig vóórdat de eerstvolgende stap zichtbaar is.
- **Target:** Bij elke opening van de app, elke dag.
- **Timeline:** v1 — dit is wat er nu gebouwd wordt.
- **Impact:** Dit is de voorwaarde voor al het andere. Als dit niet standhoudt, is er geen reden om verder uit te breiden naar Danielle of de vriendenkring — de rest van de doelen bestaat bij de gratie van dit ene.

---

### 🚀 SCHULDVRIJ HERSTEL & ORGANISCHE UITBREIDING (gedreven door het kerndoel)

**Objective 1: Schuldvrij herstel na een tegenvallende dag**
- **Statement:** Een tegenvallende dag ("te weinig tijd/energie") leidt tot een geaccepteerd nieuw plan, niet tot opgeven of schuldgevoel.
- **Metric:** Elke "vandaag niet als gepland?"-melding resulteert in een plan dat Evelien accepteert (geen melding die genegeerd of weggeklikt wordt zonder gevolg).
- **Target:** Elke keer dat de knop gebruikt wordt.
- **Timeline:** v1.

**Objective 2: Minder gemiste deadlines**
- **Statement:** Evelien mist minder deadlines dan met haar vorige (handmatige) aanpak.
- **Metric:** Kwalitatief beoordeeld — geen dashboard, geen harde meting (past bij de hobby-schaal van dit project).
- **Target:** Merkbaar minder dan voorheen.
- **Timeline:** Doorlopend, vanaf lancering.

**Objective 3: Organische uitbreiding naar Danielle**
- **Statement:** Zodra Evelien's ervaring stabiel en betrouwbaar is, breidt het gebruik zich organisch uit naar Danielle (en later mogelijk de vriendenkring).
- **Metric:** Danielle begint Flowz te gebruiken uit eigen beweging, niet omdat het haar opgelegd wordt.
- **Target:** Geen harde datum — rustig tempo, zoals vastgelegd in de pitch ("bijproject, geen deadline-druk").
- **Timeline:** Ná v1-validatie bij Evelien.

---

### 🌟 LANGE TERMIJN (post-v1, bewust nog niet gebouwd)

**Objective 4: Flowz leert van je**
- **Statement:** Het systeem wordt merkbaar treffender naarmate het langer gebruikt wordt — leert welke vakken vaker uitlopen, hoeveel tijd iemand realistisch nodig heeft, wanneer iemand energie heeft.
- **Metric:** Nog niet gedefinieerd — vereist eerst adaptieve tijdschattingen, die expliciet buiten v1-scope vallen (zie PRD, "Buiten scope voor nu").
- **Target:** Nog niet van toepassing.
- **Timeline:** Post-v1, geen tijdlijn vastgesteld.
- **Waarom toch in de Trigger Map:** dit is de kern-differentiator uit de brief. De architectuur houdt er nu al rekening mee zodat latere toevoeging geen herontwerp vereist, ook al wordt het nu nog niet gebouwd.

---

## De Motor: Hoe de doelen samenhangen

**HET KERNDOEL (Prioriteit #1):**
- Evelien's frictieloze, rustige planningservaring
- Timeline: v1, nu in ontwikkeling
- Dit is het enige doel dat *zelfstandig* waarde heeft — de rest is erop gebouwd
- Zonder dit werkt niets anders: geen schuldvrij herstel zonder een planning die het waard is om te vertrouwen, geen uitbreiding naar Danielle zonder een bewezen werkend systeem

**SCHULDVRIJ HERSTEL & UITBREIDING (Prioriteit #2):**
- Gedreven DOOR het kerndoel — pas relevant als de basis werkt
- Schuldvrij herstel bij tegenvallers, minder gemiste deadlines, organische uitbreiding naar Danielle
- Timeline: v1 (herstel), doorlopend (deadlines), ná v1 (uitbreiding)
- Focus: bewijzen dat het systeem betrouwbaar genoeg is om op te vertrouwen én om aan een volgend gezinslid voor te stellen

**LANGE TERMIJN: ADAPTIEF LEREN (Prioriteit #3):**
- Pas zinvol zodra Prioriteit #1 en #2 aantoonbaar werken voor zowel Evelien als (potentieel) Danielle
- Timeline: post-v1, geen druk
- **Belangrijkste voorwaarde:** de architectuur mag hier geen drempel voor opwerpen, ook al wordt het nu niet gebouwd

---

## Success Metrics Alignment

### Hoe de Trigger Map verbindt met de objectives:

**⭐ KERNDOEL: Evelien's rustige planningservaring → Bereikt:**
- ✅ Rustig hoofdscherm (Evelien's persoonlijke topprioriteit-drijfveer #3)
- ✅ Automatische tijdsverdeling (lost haar tijdsnood-angst op)
- ✅ Werksessie-flow (het dagelijkse aanraakpunt)
- **Timeline: v1**
- **Dit draagt alle andere doelen**

**🚀 SCHULDVRIJ HERSTEL & UITBREIDING → Bereikt:**
- ✅ "Vandaag niet als gepland?"-knop (Evelien's topprioriteit-drijfveer #1: geen schuldgevoel)
- ✅ Tijdgebrek-signalering + escalatie (UJ-6)
- ✅ Danielle's spreidingsbehoefte wordt al bediend door dezelfde motor — geen aparte feature nodig
- **Timeline: v1 + doorlopend**

**🌟 LANGE TERMIJN: Adaptief leren → Vereist:**
- ⏳ Architectuur die ruimte laat voor adaptieve tijdschattingen (al geborgd, zie architecture-spine)
- ⏳ Voldoende gebruiksdata bij Evelien (en later Danielle) om iets te leren
- **Timeline: post-v1**

**De Trigger Map IS de strategische basis — en prioritering is hier expliciet niet-optioneel:**

De motor moet Evelien's dagelijkse rust waarmaken → pas dan heeft schuldvrij herstel betekenis → pas dan is uitbreiding naar Danielle verantwoord → pas dan wordt adaptief leren een zinvolle volgende stap.

---

## Related Documents

- **[00-trigger-map.md](00-trigger-map.md)** — Visueel overzicht en navigatie
- **[02-Evelien-de-Scholier.md](02-Evelien-de-Scholier.md)** — Primaire persona
- **[03-Danielle-de-Perfectionist.md](03-Danielle-de-Perfectionist.md)** — Secundaire persona
- **[05-Key-Insights.md](05-Key-Insights.md)** — Strategische implicaties
- **[feature-impact-analysis.md](feature-impact-analysis.md)** — Featureprioritering

---

_Terug naar [Trigger Map](00-trigger-map.md)_
