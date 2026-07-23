# Project Pitch: Flowz

> Overtuigend verhaal over waarom dit project ertoe doet en gebouwd moet worden

**Created:** 2026-07-16
**Author:** Hillebrand
**Status:** Ready for stakeholder approval

---

## 1. The Realization

Middelbare scholieren krijgen huiswerk, toetsen en projecten uit meerdere vakken tegelijk, maar hebben geen instrument dat dat omzet in een haalbaar dagritme. Ze plannen zelf — vaak pas als de druk voelbaar wordt — steken daar uren in, en komen er dan achter dat de planning niet standhoudt zodra er iets tussenkomt: een extra toets, een moeie dag, een activiteit die uitloopt. Dat leidt tot een cyclus van herplannen, achterstand en schuldgevoel. Bestaande planners (agenda's, to-do-lijsten, Studyplanner.nl) laten zien wát er moet gebeuren, maar niet wánneer dat realistisch past — en al helemaal niet hoe dat verschuift als een dag tegenvalt.

Concreet voor de eerste gebruiker Evelien (VWO 3): de scherpste pijn is dat taken, naarmate een deadline nadert, vaak lastiger of tijdrovender blijken dan vooraf gedacht — met tijdsnood tot gevolg.

---

## 2. Why It Matters

De eerste gebruiker is Evelien (VWO 3), die worstelt met de combinatie van meerdere vakken, deadlines en een leven ernaast, en last heeft van uitstelgedrag. Na haar volgen naar verwachting haar zusje en een vriendenkring met hetzelfde patroon — het gaat dus om een bredere groep scholieren die dezelfde mentale last van school ervaart, niet alleen om één persoon.

**Jobs** (wat proberen ze te bereiken): niet zelf hoeven na te denken over waar te beginnen; een planning hebben die standhoudt ook als een dag tegenvalt; deadlines halen zonder de avond ervoor in paniek te zitten.

**Pains** (waar lopen ze tegenaan): de cyclus van zelf plannen → tegenvaller → herplannen → achterstand → schuldgevoel; taken die dichter bij de deadline steevast lastiger of tijdrovender blijken dan gedacht, met tijdsnood tot gevolg.

**Gains** (wat maakt hun leven beter): altijd meteen weten wat de eerstvolgende stap is, zonder overzicht dat overweldigt; een tegenvallende dag leidt tot een nieuw, geaccepteerd plan in plaats van opgeven; het systeem wordt treffender naarmate het langer gebruikt wordt.

---

## 3. How We See It Working

De leerling voert taken in (of Flowz haalt ze automatisch op uit Magister — titel, omschrijving, soort taak). Flowz verdeelt al deze taken automatisch over de beschikbare tijd, rekening houdend met de bestaande agenda (Google Calendar, inclusief schoolrooster) en het huidige moment van de dag. Het hoofdscherm toont altijd hetzelfde: één duidelijke eerstvolgende stap met een "begin nu"-knop — geen overzicht dat overweldigt. Loopt een dag anders dan gepland, dan is er één knop — "vandaag niet als gepland?" — die vraagt wat er misgaat (te weinig tijd, te weinig energie) en de planning direct herberekent, zonder dat de leerling zich daar schuldig over hoeft te voelen. Naarmate Flowz meer gebruikt wordt, leert het hoe iemand daadwerkelijk werkt, en worden de voorstellen treffender.

---

## 4. Paths We Explored

Bestaande tools kiezen óf voor volledige automatisering (Motion, Reclaim.ai, Trevor AI — generiek, niet gebouwd voor het schoolritme) óf laten het plannen volledig aan de gebruiker over (agenda's, to-do-lijsten). Studyplanner.nl koppelt wel met Magister/Somtoday, maar biedt geen automatische verdeling of herplanning en is een betaald product. Dit is de enige afweging die gemaakt is: volledige automatisering versus volledig handmatig.

---

## 5. Recommended Solution

Flowz kiest bewust de middenweg: de leerling voert taken in (of Flowz haalt ze automatisch op uit Magister), en Flowz plant automatisch. De kernredenen om deze aanpak aan te bevelen, samen: de directe Magister-koppeling, de automatische tijdsverdeling, en de schuldvrije herplanning.

---

## 6. The Path Forward

Er bestaan al een BMM-brief, PRD en architecture-spine voor Flowz — het probleem en de technische kaders zijn dus al uitgewerkt. Het WDS-traject volgt de volledige route:

**Verplicht:** Trigger Mapping (personas + driving forces) → Outline Scenarios (UX-scenario's per persona+doel+uitkomst) → Conceptual Specs (schermspecificaties, inclusief het "rustig hoofdscherm" en de schuldvrije herplan-flow) → Design Delivery (overdrachtspakket).

**Optioneel, ook meegenomen:** Platform Requirements, Conceptual Sketching, Storyboarding, Functional Components, Visual Design.

**Overgeslagen:** Design System (design_system_mode staat op "none").

---

## 7. The Value We'll Create

**Onze ambitie:** we zijn ervan overtuigd dat Flowz de mentale last van plannen wegneemt bij scholieren als Evelien, door het plannen zelf over te nemen in plaats van aan haar over te laten.

**Succesmetrieken:**
- Evelien opent Flowz — wanneer dan ook — en weet binnen enkele seconden wat de eerstvolgende stap is, zonder zelf te hoeven plannen
- Een tegenvallende dag ("te weinig tijd/energie") leidt tot een geaccepteerd nieuw plan, niet tot opgeven of schuldgevoel
- Minder gemiste deadlines dan met haar vorige aanpak
- Het systeem wordt merkbaar treffender naarmate het langer gebruikt wordt

**Wat succes zichtbaar maakt:** Evelien gebruikt Flowz dagelijks zonder frustratie, mist geen deadlines meer door tijdsnood, en de suggesties van het systeem passen steeds beter bij hoe zij werkelijk werkt.

**Hoe we dit volgen:** kwalitatief, zolang het bij Evelien en haar naaste kring blijft.

---

## 8. Cost of Inaction

Zonder Flowz blijft de bestaande cyclus gewoon bestaan: zelf plannen → tegenvaller → herplannen → achterstand → schuldgevoel.

---

## 9. Our Commitment

Rustig tempo — dit wordt als bijproject naast andere dingen gedaan, zonder deadline-druk. Eén bekend open risico: Magister API-toegang/scopes zijn nog niet geverifieerd; als dit niet lukt, is handmatige taakinvoer het vangnet, geen blocker voor lancering.

---

## 10. Summary

Het probleem is bekend en herkenbaar: scholieren plannen zelf, komen achter op hun planning zodra iets tegenzit, en belanden in een cyclus van herplannen en schuldgevoel. Flowz kiest bewust de middenweg — niet alles automatiseren, niet alles aan de leerling overlaten. Eén ding staat centraal: de eerstvolgende stap, plus een schuldvrije manier om een mislukte dag te herstellen. Dit is een organisch groeiend, rustig project: gebouwd voor Evelien, bewust bescheiden in tempo, met uitbreiding naar zusje/vriendenkring als het werkt.

---

## Business Context

This project serves:
- **Primary Goal:** De mentale last van plannen wegnemen bij middelbare scholieren, te beginnen bij Evelien (VWO 3)
- **Solution:** Automatische taakverdeling over de beschikbare tijd, met één zichtbare eerstvolgende stap en schuldvrije herplanning
- **Target Users:** Evelien (VWO 3), met verwachte uitbreiding naar haar zusje en vriendenkring

*Detailed strategic analysis (personas, driving forces, prioritization) is developed in Phase 2: Trigger Mapping.*

---

## Next Steps

**After approval**, proceed to:
- **Full Project Brief** - Detailed strategic foundation
- **Trigger Mapping** - User research and personas
- **Platform Requirements** - Technical foundation
- **UX Design** - Scenarios and prototypes

---

_Generated by Whiteport Design Studio_
