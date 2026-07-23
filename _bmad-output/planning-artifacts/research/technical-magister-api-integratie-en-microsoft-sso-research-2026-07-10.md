---
stepsCompleted: [1, 2, 3]
inputDocuments: ['_bmad-output/planning-artifacts/briefs/brief-Flowz-2026-07-08/addendum.md']
workflowType: 'research'
lastStep: 3
research_type: 'technical'
research_topic: 'Magister API-integratie en Microsoft SSO'
research_goals: 'Vaststellen of Flowz via de Magister API huiswerk en cijfers kan ophalen als koppeling die los staat van de Microsoft SSO-laag die de school gebruikt voor de portal-login, om dit kernrisico op te lossen vóór de PRD/architectuurfase.'
user_name: 'Hillebrand'
date: '2026-07-10'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-07-10
**Author:** Hillebrand
**Research Type:** technical

---

## Research Overview

Technisch onderzoek naar de vraag of Flowz kan integreren met de Magister API om huiswerk en cijfers op te halen, gegeven dat de school van Evelien Microsoft SSO gebruikt als login-laag voor het Magister-portaal. Dit onderzoek moet de aanname uit de brief-addendum verifiëren dat de API/OAuth-laag voor derde-partij-koppelingen los staat van de SSO-laag voor portal-login.

---

## Technical Research Scope Confirmation

**Research Topic:** Magister API-integratie en Microsoft SSO
**Research Goals:** Vaststellen of Flowz via de Magister API huiswerk en cijfers kan ophalen als koppeling die los staat van de Microsoft SSO-laag die de school gebruikt voor de portal-login, om dit kernrisico op te lossen vóór de PRD/architectuurfase.

**Technical Research Scope:**

- Architecture Analysis - hoe Magister's API/OAuth-laag is opgezet t.o.v. de SSO/identity-federatielaag van het schoolportaal
- Implementation Approaches - welke auth-flow (OAuth2/OIDC scopes) nodig is voor derde-partij-koppelingen zoals Flowz
- Technology Stack - Magister's publieke/partner-API's, bekende integraties (bv. Studyplanner.nl)
- Integration Patterns - authenticatie voor huiswerk/cijfers-ophalen, en of dit apart is van de bestaande roostersync naar Google Calendar
- Performance Considerations - praktische haalbaarheid: goedkeuringsproces, schoolbeleid, scopebeperkingen voor externe apps

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-07-10

## Architectuuranalyse: identiteitslagen en API-toegang

_Noot: de generieke stack-categorieën (programmeertalen, databases, cloud) uit het researchsjabloon zijn hier niet relevant — dit is een smalle feasibility-vraag over authenticatie-architectuur, geen technologiekeuze. Onderstaande is aangepast aan het eigenlijke onderwerp._

### Bevestiging: twee gescheiden identiteitslagen

De aanname uit de brief-addendum is **bevestigd**: Magister kent twee onafhankelijke SSO/identiteitsrelaties, niet één:

1. **School → Magister (inkomend):** de school kan Microsoft 365/Entra ID koppelen aan Magister, zodat leerlingen met hun schoolaccount inloggen op het Magister-portaal. Dit is identity-federatie *in* Magister — geconfigureerd per schoollocatie door de Magister-beheerder.
2. **Magister → derde-partij-app (uitgaand):** via Magister's IAM-module/Partner Portal kan een externe applicatie (zoals Flowz) Magister zelf als **Identity Provider** gebruiken — "Inloggen met Magister" voor de eindgebruiker, los van hoe die gebruiker ooit bij Magister zelf inlogde.
_Source: [Single Sign-On (SSO) - Partner Portal - Magister](https://partnerportal.magister.nl/home/gettingstarted/singlesignon/), [Microsoft 365 koppeling met Magister](https://service.magister.nl/support/solutions/articles/101000456518-microsoft-365-koppeling-met-magister)_

**Praktische consequentie:** of Eveliens school Microsoft SSO gebruikt voor portal-login is **niet relevant** voor de vraag of Flowz via een officiële OAuth-authorization-code-flow bij Magister terecht kan — de browser-redirect naar Magister's hosted loginpagina handelt een eventuele Microsoft-SSO-stap transparant af, ongeacht welke identity provider de school daarachter heeft ingeregeld.

### Twee toegangswegen tot huiswerk/cijfers-data — met een belangrijk onderscheid in haalbaarheid

**Officiële weg — Magister Public API / Magister Join (Partner Portal):**
- Vereist accreditatie sinds 18 december 2018: zonder accreditatie geen koppeling mogelijk.
- Vereist een formeel partnerschapstraject: aanmeldformulier → kennismaking met partner manager via Teams (binnen 3 werkdagen) → ondertekende overeenkomsten.
- Vereist dat het aanbiedende bedrijf een KvK-registratie heeft en een juridische relatie met de school kan aantonen rond het doel van de koppeling.
- School moet expliciet toestemming geven via de Privacy Manager (AVG-koppeling) per aanbieder.
- Precedent: **Studyplanner/StudieplannerPro** heeft dit traject doorlopen — een officieel partnerakkoord met Magister/Somtoday, waarbij de leerling inlogt via Magister/Somtoday zelf en Studyplanner via de geautoriseerde koppeling huiswerk, rooster en cijfers leest.
_Source: [Slimmer koppelen met Magister Join](https://service.magister.nl/support/solutions/articles/101000473121-slimmer-koppelen-met-magister-join), [Magister - StudieplannerPro](https://www.studieplannerpro.nl/magister-koppeling), [Webservices : Magister Service](https://service.magister.nl/support/solutions/articles/101000496422-webservices)_

**Onofficiële weg — reverse-engineered libraries met leerling-credentials:**
- Meerdere open-source projecten bestaan (`magister-api/magister`, `idiidk/magister-api`, `Magister-Android/magister-api`, een Home Assistant-integratie) die rechtstreeks met de eigen Magister-gebruikersnaam/wachtwoord van de leerling inloggen via een OIDC-achtige flow op `accounts.magister.net`, buiten het partnerprogramma om.
- Expliciet niet-officieel: "not officially associated with Magister, use at your own risk." Onderhoud is wisselend — meerdere van deze repo's zijn (tijdelijk) kapot of niet meer onderhouden na wijzigingen aan Magister's inlogsysteem.
- **Risico specifiek voor de SSO-vraag:** als een school Microsoft SSO afdwingt en het los Magister-wachtwoord voor leerlingen uitschakelt ("de inloggegevens voor Microsoft 365 zijn dan ook de inloggegevens voor Magister"), werkt een directe gebruikersnaam/wachtwoord-aanroep (resource-owner-password-grant-achtig) mogelijk niet meer — er is dan geen apart Magister-wachtwoord om in te vullen. Een browser-gebaseerde OAuth-flow zou dit probleem niet hebben (zie boven), maar de bestaande reverse-engineered libraries zijn hier niet expliciet op ontworpen/getest.
_Source: [GitHub - magister-api/magister](https://github.com/magister-api/magister), [GitHub - idiidk/magister-api](https://github.com/idiidk/magister-api), [Magister integration - Home Assistant Community](https://community.home-assistant.io/t/magister-integration/560070), [Inloggen : Magister Service](https://service.magister.nl/support/solutions/articles/101000454736-inloggen)_

### Tussentijdse conclusie

Het echte risico voor Flowz zit niet in een architecturale blokkade door SSO (die aanname is ontkracht), maar in de **haalbaarheid van het officiële toegangspad voor een solo/indie-project**: het Magister-partnertraject is ontworpen voor bedrijven met KvK-registratie en een formele overeenkomst, niet voor een individuele ontwikkelaar die voor één leerling (Evelien) een app bouwt. De onofficiële route omzeilt dat, maar is technisch fragieler en mogelijk incompatibel als de school Microsoft-only SSO afdwingt zonder los Magister-wachtwoord.

---

## Integratiepatronen: toegangswegen tot de data in detail

_Noot: generieke categorieën als microservices/message queues/event sourcing zijn hier niet relevant. Onderstaande focust op de daadwerkelijke toegangs- en autorisatiepatronen voor de Magister-koppeling._

### API-vorm

De (reverse-engineered) client-libraries bevestigen dat de onderliggende Magister-data via een **REST/JSON-API** wordt ontsloten (endpoints voor o.a. leerlingen, cijfers/`cijfers`, afspraken/`agenda`, huiswerk), bereikbaar na een OIDC-achtige authenticatiestap op `accounts.magister.net`. Dit is technisch een rechttoe-rechtaan patroon — geen SOAP, geen zware enterprise-middleware.
_Source: [GitHub - idiidk/magister-api](https://github.com/idiidk/magister-api), [GitHub - Magister-Android/magister-api](https://github.com/Magister-Android/magister-api)_

### Historische zelfregistratie-optie — nu vermoedelijk gesloten

Er bestonden ooit officiële **"Magister Public API" gebruiksvoorwaarden** (~2015-2016) die een zelfregistratieproces beschreven: een ontwikkelaar vulde een formulier in op het Magister Public API Portal, accepteerde de gebruiksvoorwaarden + een Data Agreement, en kreeg na goedkeuring door SchoolMaster een persoons- en domeingebonden Access Key. Die voorwaarden noemden expliciet "persoonlijk gebruik in de Applicatie" als toegestane uitzondering op het delen van Magister-inloggegevens.

**Dit lijkt echter achterhaald**: sinds 18 december 2018 geldt een verplicht **accreditatietraject** voor elke partij die de Magister-koppeling gebruikt, ingevoerd via een goedkeuringsscherm voor scholen (Privacy Manager). Er is geen bewijs gevonden dat de oude zelfregistratieroute voor individuen in 2026 nog bestaat — de huidige weg loopt aantoonbaar via het (bedrijfsgerichte) Partner Portal-traject met partner manager en ondertekende overeenkomsten.
_Source: [MAGISTER PUBLIC API GEBRUIKSVOORWAARDEN (2015-2016)](https://docplayer.nl/38323995-Magister-public-api-gebruiksvoorwaarden.html), [Magister 6 API Documentation (2017, community, "not affiliated with SchoolMaster")](https://magister-api.readthedocs.io/), eerdere vondst over accreditatie sinds 18-12-2018_

### Juridisch/ToS-risico van de onofficiële route

Magister's algemene voorwaarden bestempelen ongeautoriseerd gebruik van de API expliciet als een inbreuk op de rechten van Schoologica B.V., de onderwijsinstelling en/of betrokkenen, en verbieden het delen van gebruikersnaam/wachtwoord met derden-apps. Een onofficiële integratie (zelfs met Eveliens eigen inloggegevens, door haarzelf gebruikt) draagt dus een reëel — zij het voor een puur persoonlijk project laag-kans-op-handhaving — ToS-risico.
_Source: [Magister - Voorwaarden](https://magister.nl/over-ons/voorwaarden/)_

---

## Openstaande blocker — onderzoek gepauzeerd

**Status:** dit onderzoek is gepauzeerd na stap 3 (integratiepatronen), op verzoek van Hillebrand, in afwachting van een real-world afhankelijkheid die niet via webresearch te verifiëren is.

**De blocker:** toegang tot de Magister-koppeling voor Flowz vereist drie aparte goedkeuringslagen (zie hierboven): (1) landelijke accreditatie van Flowz bij Magister, (2) **actieve handmatige activatie van de Flowz-tegel in de Privacy Manager door Eveliens specifieke school** (privacy-by-default: staat na accreditatie nog steeds uit per school), en (3) individuele toestemming van Evelien/ouder. Laag 2 is de kern-onzekerheid: er is geen manier om vanuit webresearch te bepalen of Eveliens school bereid en in staat is om dit voor een individuele/niche-app te doen.

**Wat nodig is om verder te gaan:** contact met de IT-beheerder/privacycontactpersoon van Eveliens school om te verifiëren of zij een (nog niet geaccrediteerde) derde-partij-app zoals Flowz zouden willen/kunnen activeren, en of er precedent is (bv. voor HOMi of Studyplanner). Hillebrand pakt dit zelf op.

**Volgende stap zodra dit is opgehelderd:** hervat bij stap 4 (architecturale patronen) of, afhankelijk van het antwoord van de school, spring direct naar de synthese/conclusie-stap om de aanbeveling (directe koppeling vs. handmatige taakinvoer als v1) te herzien.

---

## Verkenning: onofficiële route (bookmarklet/scheduled sync) als v1

_Toegevoegd na gesprek over of de onofficiële route als eerste stap genomen kan worden, i.p.v. te wachten op het officiële accreditatie-/Privacy Manager-traject hierboven._

### Waarom dit de school-blocker omzeilt

De drie-lagen bureaucratie (accreditatie → school activeert Privacy Manager-tegel → individuele toestemming) hoort bij het **officiële vendor-model**, waarbij Flowz als externe partij data van Magister krijgt doorgegeven door de school. De onofficiële route is functioneel iets anders: Evelien logt in met haar eigen account — wat ze toch al handmatig zou doen — en een script/bookmarklet automatiseert dat namens haar. Dat gaat buiten de vendor/data-processor-relatie met de school om, dus geen schoolgoedkeuring nodig.

### Twee varianten, met verschillend risicoprofiel

**A. Handmatige bookmarklet (incidenteel, door Evelien zelf geklikt)**
- Draait alleen in een al-ingelogde, al-geauthenticeerde browsertab; geen credentials worden ergens opgeslagen.
- Laagste risico-variant: oogt als persoonlijk, incidenteel gebruik van haar eigen account.

**B. Scheduled dagelijkse sync (onbemand, op de achtergrond)**
- Vereist dat Eveliens inloggegevens of een langlevend token ergens bewaard worden zodat een achtergrondproces (server-side cron, of vergelijkbaar) zelfstandig kan inloggen — een bookmarklet kan dit niet zelf, dit vraagt de "directe library"-aanpak (bv. gebaseerd op `magister-api`/`idiidk/magister-api`) op een schema.
- Verschuift het risicoprofiel merkbaar: het patroon lijkt veel meer op precies het soort geautomatiseerde derde-partij-toegang waar Magisters accreditatieregime voor is bedoeld, wat het "dit is gewoon persoonlijk gebruik"-argument verzwakt (zie juridische sectie hieronder).
- Introduceert een aparte beveiligingsverantwoordelijkheid: opgeslagen inloggegevens van een minderjarige moeten goed beveiligd worden.

### Juridische afweging (geen juridisch advies)

- **Computervredebreuk (art. 138ab Sr):** de heersende lijn is dat gebruik van je eigen, geldige inloggegevens geen "binnendringen" is — schending van gebruiksvoorwaarden is normaliter een **civielrechtelijke** kwestie (contractbreuk), geen strafzaak.
  _Source: [Is scrapen van een website computervredebreuk? - Ius Mentis](https://blog.iusmentis.com/2016/11/04/is-scrapen-website-computervredebreuk/)_
- **Nuance:** de Hoge Raad heeft geoordeeld dat oneigenlijk gebruik van een geldig account (autorisatie gebruikt voor een doel waarvoor die niet is verleend) wél als computervredebreuk kan kwalificeren ("binnendringen met een valse sleutel"). Dit was een werknemer-casus, maar het principe (autorisatie is doelgebonden) is relevant, vooral bij variant B.
  _Source: [ECLI:NL:HR:2023:610](https://uitspraken.rechtspraak.nl/details?id=ECLI%3ANL%3AHR%3A2023%3A610)_
- **AVG-huishoudelijke uitzondering (art. 2 lid 2 sub c):** kan in het voordeel werken voor een zuiver persoonlijk/gezinsproject, maar de Autoriteit Persoonsgegevens hanteert een strenge lijn ("scraping is vrijwel nooit toegestaan").
  _Source: [Handreiking Scraping door particulieren (AP, 2025)](https://www.autoriteitpersoonsgegevens.nl/system/files?file=2025-04%2FHandreiking+scraping_april+2025.pdf)_
- **Praktische inschatting:** voor een eenpersoons/eengezins-project is het reële risico op strafvervolging vrijwel nihil; waarschijnlijkste gevolg bij ontdekking is contractueel (account geblokkeerd), niet strafrechtelijk. Variant B (scheduled) is hier wel duidelijk risicovoller dan variant A (handmatig).

### Openstaande checks — te doen vóór verder bouwen (elk ~30 seconden)

1. **Heeft Evelien een los Magister-wachtwoord**, of is inloggen bij haar school uitsluitend via "Inloggen met Microsoft"? (Bepaalt of directe username/password-login sowieso werkt — geldt voor zowel variant A als B.)
2. **Staat er 2FA aan** bij het inloggen op haar Magister-account? (Als de school dit verplicht heeft gesteld, blokkeert dit onbemande/scheduled login (variant B) volledig, ongeacht de rest.)
3. (Nog los van deze onofficiële-route-verkenning, uit eerdere sectie) Contact met school over Privacy Manager-activatie — alleen relevant als alsnog voor de officiële route gekozen wordt.

---

<!-- Content will be appended sequentially through research workflow steps -->
