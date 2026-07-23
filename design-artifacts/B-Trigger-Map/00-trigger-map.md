# Trigger Map: Flowz

> Visueel overzicht dat businessdoelen verbindt met de psychologie van de gebruiker

**Gemaakt:** 2026-07-20
**Auteur:** Hillebrand
**Methodologie:** Gebaseerd op Effect Mapping (Balic & Domingues), aangepast voor het WDS-framework

---

## Strategische Documenten

Dit is het visuele overzicht. Voor gedetailleerde documentatie, zie:

- **[01-Business-Goals.md](01-Business-Goals.md)** — Volledige visie en objectives
- **[02-Evelien-de-Scholier.md](02-Evelien-de-Scholier.md)** — Primaire persona, volledige drijfveren
- **[03-Danielle-de-Perfectionist.md](03-Danielle-de-Perfectionist.md)** — Secundaire persona, volledige drijfveren
- **[05-Key-Insights.md](05-Key-Insights.md)** — Strategische implicaties voor ontwerp
- **[feature-impact-analysis.md](feature-impact-analysis.md)** — Featureprioritering (Must Have / Consider)

---

## Visie

**Flowz neemt de mentale last van plannen weg bij middelbare scholieren door zelf te plannen in plaats van dat aan de leerling over te laten — en wordt daarin treffender naarmate het langer gebruikt wordt.**

---

## De Motor: Hoe Alles Samenhangt

**⭐ HET KERNDOEL — Evelien's rustige planningservaring**
Dit is het enige doel dat zelfstandig waarde heeft. Alles hieronder bestaat bij de gratie hiervan.

**🚀 SCHULDVRIJ HERSTEL & ORGANISCHE UITBREIDING** *(gedreven door het kerndoel)*
Pas relevant zodra de basis werkt: schuldvrij herstel bij tegenvallers, minder gemiste deadlines, en Danielle's organische instap.

**🌟 LANGE TERMIJN — Adaptief leren** *(post-v1, architectuur houdt er nu al rekening mee)*
Flowz' kern-differentiator uit de brief — nog niet gebouwd, maar de architectuur mag er geen drempel voor opwerpen.

---

## Trigger Map Visualisatie

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontFamily':'Inter, system-ui, sans-serif', 'fontSize':'14px'}}}%%
flowchart LR
    %% Business Goals
    BG0["<br/>⭐ KERNDOEL<br/><br/>Evelien's rustige<br/>planningservaring<br/>DE MOTOR<br/><br/>"]
    BG1["<br/>🚀 SCHULDVRIJ HERSTEL & UITBREIDING<br/><br/>Geaccepteerd herstel<br/>Minder gemiste deadlines<br/>Organische instap Danielle<br/><br/>"]
    BG2["<br/>🌟 LANGE TERMIJN<br/><br/>Adaptief leren<br/>Post-v1<br/>Architectuur houdt rekening<br/><br/>"]

    %% Platform
    PLATFORM["<br/>📅 FLOWZ<br/><br/>Automatische studieplanner<br/>voor middelbare scholieren<br/><br/>Van zelf plannen en instorten<br/>naar vertrouwen op een systeem<br/>dat meebeweegt<br/><br/>"]

    %% Target Groups
    TG0["<br/>🎓 EVELIEN<br/>PRIMAIR DOELWIT<br/><br/>VWO 3<br/>Tijdsnood door onderschatting<br/>Eerste gebruiker<br/><br/>"]
    TG1["<br/>🧩 DANIELLE<br/>SECUNDAIR DOELWIT<br/><br/>VWO1 naar VWO2, 12 jaar<br/>Perfectionisme<br/>Vriendenkring/klasgenoten<br/><br/>"]

    %% Driving Forces
    DF0["<br/>🎓 EVELIEN'S DRIJFVEREN<br/><br/>WANTS<br/>✅ Weten wat de volgende stap is<br/>✅ Planning blijft overeind<br/>✅ Vertrouwen in tijdsverdeling<br/><br/>FEARS<br/>❌ Angst voor instorting<br/>❌ Schuldgevoel bij tekort<br/>❌ Overweldigd door overzicht<br/><br/>"]

    DF1["<br/>🧩 DANIELLE'S DRIJFVEREN<br/><br/>WANTS<br/>✅ Gerust bij spreiding<br/>✅ Zichtbaar bewijs voortgang<br/>✅ Duidelijke behapbare stap<br/><br/>FEARS<br/>❌ Spreiden voelt als tekortschieten<br/>❌ Spanning tot volledig af<br/>❌ Onrust bij niet-in-1x<br/><br/>"]

    %% Connections
    BG0 --> PLATFORM
    BG1 --> PLATFORM
    BG2 --> PLATFORM
    PLATFORM --> TG0
    PLATFORM --> TG1
    TG0 --> DF0
    TG1 --> DF1

    %% Styling
    classDef primaryGoal fill:#fef3c7,color:#78350f,stroke:#d97706,stroke-width:2px
    classDef businessGoal fill:#f3f4f6,color:#1f2937,stroke:#d1d5db,stroke-width:2px
    classDef platform fill:#e5e7eb,color:#111827,stroke:#9ca3af,stroke-width:3px
    classDef targetGroup fill:#f9fafb,color:#1f2937,stroke:#d1d5db,stroke-width:2px
    classDef drivingForces fill:#f3f4f6,color:#1f2937,stroke:#d1d5db,stroke-width:2px

    class BG0 primaryGoal
    class BG1,BG2 businessGoal
    class PLATFORM platform
    class TG0,TG1 targetGroup
    class DF0,DF1 drivingForces
```

---

## Hoe Te Lezen

**Links naar rechts:** businessdoelen → Flowz (het platform) → doelgroepen → hun drijfveren.

**Van boven naar beneden:** prioriteit. Het kerndoel (goud gemarkeerd) staat bovenaan omdat alle andere doelen ervan afhangen.

**✅ / ❌:** groene vinkjes zijn wat een persona wíl bereiken; kruisjes zijn wat ze wíl vermijden. Negatieve drijfveren wegen vaak zwaarder dan positieve (loss aversion).

---

## Business Strategie

**Kerndoel:** Evelien opent Flowz op elk moment en weet zonder actie te ondernemen wat de eerstvolgende stap is — dit draagt letterlijk alle andere doelen.

**Schuldvrij herstel & uitbreiding:** een tegenvallende dag leidt tot een geaccepteerd nieuw plan; Danielle stapt organisch in zodra Evelien's ervaring bewezen stabiel is.

**Lange termijn:** adaptief leren blijft de kern-differentiator uit de brief, bewust nog niet gebouwd — de architectuur houdt er nu al rekening mee.

→ Volledige details: [01-Business-Goals.md](01-Business-Goals.md)

---

## Doelgroepen

### 🎓 Evelien (Primair)
VWO 3-scholiere, eerste gebruiker. Kernpijn: taken blijken dichter bij de deadline lastiger/tijdrovender dan gedacht → tijdsnood.

**Topdrijfveren:** geen overweldigend overzicht, geen schuldgevoel bij een tegenvaller, vertrouwen dat de planning overeind blijft.

→ Volledig profiel: [02-Evelien-de-Scholier.md](02-Evelien-de-Scholier.md)

### 🧩 Danielle (Secundair)
Zusje + vriendenkring/klasgenoten, VWO1→2, 12 jaar. Kernpijn: perfectionisme — huiswerk voelt na opgave alsof het in één keer af moet.

**Topdrijfveren:** rust bij gespreide sessies, zichtbaar bewijs van voldoende voortgang.

→ Volledig profiel: [03-Danielle-de-Perfectionist.md](03-Danielle-de-Perfectionist.md)

---

## Strategische Implicaties

- De drie topscorende features (werksessie-flow, taak-formulier, automatische tijdsverdeling) vormen de kernlus en de logische ontwerpvolgorde
- Danielle wordt grotendeels "gratis" bediend door dezelfde Evelien-gerichte features
- Twee ontwerpprincipes uit de PRD (geen schuldgevoel, rustig hoofdscherm) blijven nog UX-eigendom zonder concrete uitwerking — directe input voor Phase 3/4

→ Volledige analyse: [05-Key-Insights.md](05-Key-Insights.md)

---

## Documenten

| # | Document | Doel | Status |
|---|----------|------|--------|
| 01 | Business Goals | Visie, objectives, prioritering | ✅ Compleet |
| 02 | Evelien de Scholier | Primaire persona | ✅ Compleet |
| 03 | Danielle de Perfectionist | Secundaire persona | ✅ Compleet |
| 05 | Key Insights | Strategische implicaties | ✅ Compleet |
| — | Feature Impact Analysis | Featureprioritering | ✅ Compleet |

---

_Gemaakt met Whiteport Design Studio (WDS) methodologie_
_Trigger Mapping-methodologie: Effect Mapping door Mijo Balic & Ingrid Domingues (inUse), aangepast met negatieve drijfveren_
