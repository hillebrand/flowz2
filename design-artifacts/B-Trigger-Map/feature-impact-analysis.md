# Feature Impact Analysis: Flowz

> Welke features raken het hardst de drijfveren van Evelien en Danielle — en dus waar het ontwerp zich eerst op moet richten.

**Gemaakt:** 2026-07-20
**Fase:** 2 — Trigger Mapping (Feature Impact Workshop)

**Belangrijk verschil met een normale MVP-scope-oefening:** de v1-scope van Flowz ligt al vast in de PRD (alle 12 features hieronder zijn al goedgekeurde v1-features). Deze analyse bepaalt dus niet *wat* er gebouwd wordt, maar *in welke volgorde* de UX-ontwerpfase (Phase 4) en de latere epics/stories zich er het beste op kunnen richten. Er is daarom geen "Defer"-categorie met features die uit scope vallen — alleen een volgorde van ontwerp-aandacht.

---

## Scoring

**Evelien (⭐ primair):** Hoog = 5 pt | Gemiddeld = 3 pt | Laag = 1 pt
**Danielle (secundair):** Hoog = 3 pt | Gemiddeld = 1 pt | Laag = 0 pt

**Maximaal haalbare score:** 8
**Must Have-drempel:** score 5+, of Evelien = Hoog

**Bijzondere behandeling:** Google-login en Google Calendar-integratie scoren laag op drijfveer-impact (geen van beide persona's heeft een expliciete wens/angst over inloggen of agenda-koppeling zelf), maar zijn een harde technische randvoorwaarde voor meerdere Must Have-features (UJ-1 dagtijdlijn, UJ-5 weekplanning, UJ-7 agendaconflict-detectie). Ze staan daarom bij Must Have, met een aparte rationale — lage drijfveer-score betekent hier niet "kan wachten".

---

## Prioritized Features

| Rang | Feature | Evelien | Danielle | **Score** | Beslissing |
|---|---|---|---|---|---|
| 1 | Werksessie-flow (timer/voortgang/subtaken) | HOOG (5) | HOOG (3) | **8** | Must Have |
| 1 | Taak aanmaken/verrijken-formulier | HOOG (5) | HOOG (3) | **8** | Must Have |
| 1 | Automatische tijdsverdeling (motor) | HOOG (5) | HOOG (3) | **8** | Must Have |
| 4 | "Vandaag niet als gepland?"-knop | HOOG (5) | GEMIDDELD (1) | **6** | Must Have |
| 4 | Rustig hoofdscherm | HOOG (5) | GEMIDDELD (1) | **6** | Must Have |
| 6 | Tijdgebrek-signalering + escalatie (UJ-6) | HOOG (5) | LAAG (0) | **5** | Must Have |
| 7 | Takenoverzicht | GEMIDDELD (3) | GEMIDDELD (1) | **4** | Consider |
| 8 | Beschikbare tijd instellen | GEMIDDELD (3) | LAAG (0) | **3** | Consider |
| 8 | Weekplanning-overzicht | GEMIDDELD (3) | LAAG (0) | **3** | Consider |
| 8 | Agendaconflict-detectie (UJ-7) | GEMIDDELD (3) | LAAG (0) | **3** | Consider |
| 8 | Google Calendar-integratie | GEMIDDELD (3) | LAAG (0) | **3** | Must Have* |
| 12 | Google-login | LAAG (1) | LAAG (0) | **1** | Must Have* |

*\* technische randvoorwaarde, zie "Bijzondere behandeling" hierboven*

---

## Decisions

**Must Have — ontwerp/bouw dit eerst:**

- **Werksessie-flow (8)** — het directe kanaal voor Evelien's "duidelijke volgende stap"-behoefte; toont Danielle expliciet voortgang op deeltaken zonder dat alles in één keer hoeft
- **Taak-formulier (8)** — voedt de hele planningsmotor; deeltaken zijn precies wat Danielle rust geeft
- **Automatische tijdsverdeling (8)** — de kernmotor die zowel Evelien's tijdsnood als Danielle's spreidingsbehoefte oplost
- **"Vandaag niet als gepland?"-knop (6)** — de schuldvrije-herplanning die de brief als kern-differentiator noemt
- **Rustig hoofdscherm (6)** — het "geen overweldigend overzicht"-ontwerpprincipe, direct zichtbaar bij elke opening van de app
- **Tijdgebrek-signalering + escalatie (5)** — lost Evelien's grootste angst op (dat één tegenvaller de planning laat instorten)
- **Google Calendar-integratie** en **Google-login** — geen driver-gedreven prioriteit, maar een harde afhankelijkheid voor de dagtijdlijn (UJ-1), weekplanning (UJ-5) en agendaconflict-detectie (UJ-7); moet er zijn vóórdat die schermen zinvol getest kunnen worden

**Consider — kan na de Must Have-kern:**

- **Takenoverzicht (4)** — nuttig overzicht, maar expliciet niet het "rustige" hoofdscherm; secundair scherm
- **Beschikbare tijd instellen (3)** — instellingenscherm, ondersteunt de motor indirect
- **Weekplanning-overzicht (3)** — periodieke check-in, geen dagelijks aanraakpunt
- **Agendaconflict-detectie (3)** — belangrijk maar een edge-case-trigger (alleen bij opstarten en alleen bij een conflict), niet een dagelijkse interactie

---

## Strategische inzichten

1. **De drie topscorers vormen samen letterlijk de kernlus van Flowz**: taak invoeren → automatisch ingepland → sessie uitvoeren. Dit is ook precies de volgorde waarin UX-scenario's (Phase 3/4) het beste uitgewerkt kunnen worden.
2. **Danielle wordt "gratis" bediend door Evelien-gerichte features** (werksessie-flow, taak-formulier, tijdsverdeling scoren bij haar ook hoog) — er is geen aparte Danielle-specifieke feature nodig om haar kernbehoefte (rust bij spreiding) te dienen.
3. **Geen enkele feature scoort puur voor Danielle zonder ook voor Evelien te scoren** — bevestigt de eerdere prioriteringskeuze (Evelien eerst, Danielle lift mee) is consistent doorgevoerd.
4. **Technische randvoorwaarden (login, Calendar) horen thuis in de eerste bouw-iteratie ondanks lage driver-score** — een zuivere score-sortering zou dit verkeerd als "kan wachten" classificeren.

---

## Related Documents

- **[00-trigger-map.md](00-trigger-map.md)** — Visueel overzicht en navigatie
- **[01-Business-Goals.md](01-Business-Goals.md)** — Objectives en motor-prioritering
- **[02-Evelien-de-Scholier.md](02-Evelien-de-Scholier.md)** — Primaire persona
- **[03-Danielle-de-Perfectionist.md](03-Danielle-de-Perfectionist.md)** — Secundaire persona
- **[05-Key-Insights.md](05-Key-Insights.md)** — Strategische implicaties

---

_Onderdeel van de Trigger Map — zie [00-trigger-map.md](00-trigger-map.md)_
_Strategische input voor Phase 3/4 (UX Scenario's & Design) en de latere epics/stories_
