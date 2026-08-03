# ADR 0038 — v0.9 "Provence 360 Operating System" : périmètre, et coexistence additive avec le CRM existant

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.9 change explicitement d'orientation par rapport à v0.1–v0.8 :
Autorun cesse d'être une plateforme technique générique multi-vertical
(`ROADMAP.md` MOD-02/MOD-03 : « rester générique, un champ
`customFields: Json` pour tout vertical futur ») pour devenir le système
d'exploitation quotidien d'UNE entreprise précise, Provence 360 (visites
virtuelles 360°/3D). Le brief est explicite : « Ne développe plus de
fonctionnalités génériques qui n'apportent aucune valeur immédiate ». Cela
ne remet pas en cause les fondations multi-tenant (Organization/Workspace,
v0.2) ni les moteurs transversaux (Agents, Workflow, Automation, Memory/
Knowledge/Context) — mais toute nouvelle fonctionnalité doit servir un usage
réel de Provence 360, pas une hypothétique généralisation future.

Avant d'écrire du code, plusieurs découvertes de l'inventaire existant
changent le travail à faire :

- Le CRM Prospects (`MOD-03`) est déjà riche : `Lead`/`LeadContact`/
  `LeadNote`/`Tag`/`IdealCustomerProfile`, `LeadCategory` couvrant déjà
  AIRBNB_HOST/VILLA/HOTEL/CAMPING/REAL_ESTATE_AGENCY/RESTAURANT/
  EVENT_VENUE/RETAIL/OTHER.
- Le suivi commercial (`MOD-07`) est déjà complet : `Task`/`Appointment`/
  `Opportunity`/`Quote`/`QuoteLine`/`Service`, et l'exécution/production
  (`MOD-08`) : `Customer`/`Mission`/`Provider`/`Territory` — une mission se
  crée déjà automatiquement à la victoire d'une opportunité.
- `Integration` (kind `EMAIL`/`AI`/`CALENDAR`/`DATA_PROVIDER`, statut
  `DEMO`/`CONNECTED`/`DISCONNECTED`/`ERROR`, `config: Json`) existe déjà en
  base et est seedée par organisation, mais n'est *branchée nulle part* —
  seulement affichée en lecture seule dans `/settings`. C'est le substrat
  naturel pour stocker la configuration par organisation des fournisseurs
  réels (email, calendrier), plutôt qu'une nouvelle table.
- `AutomationRule` (v0.1, 7 règles codées en dur) et `Automation`/
  `AutomationJob` (v0.8, noyau de jobs Enterprise) coexistent déjà —
  `MOD-09` documente que `AutomationRule` reste un mécanisme séparé, non
  migré (ADR 0022) ; ce choix n'est pas remis en cause ici.

## Décision

### CRM : additif, jamais une refonte de `Lead`

`Lead` reste la table CRM centrale unique (choix déjà tranché par `MOD-03`,
confirmé ici). Trois entités NOUVELLES, additives :

- **`Company`** : regroupement optionnel de plusieurs `Lead` sous une même
  entité juridique (ex. un groupe hôtelier propriétaire de 5
  établissements, une agence immobilière avec plusieurs mandataires) —
  `Lead.companyId` optionnel, aucune contrainte sur les `Lead` existants
  (`companyId` nul par défaut).
- **`Property`** ("bien immobilier") : le bien physique, distinct du
  `Lead` qui le représente commercialement — indispensable dès qu'un
  `Lead` (une agence immobilière, un notaire, un architecte) représente
  PLUSIEURS biens, chacun candidat à sa propre visite virtuelle. Scopée
  `organizationId`/`workspaceId`, liée à `leadId` (obligatoire) et
  `companyId` (optionnel).
- **`Attachment`** : documents/photos/liens génériques, MÊME convention
  polymorphe que `AuditLog` (`entityType: String`, `entityId: String`,
  jamais une relation Prisma dédiée par type d'entité) — réutilisée par
  `Lead`, `Company`, `Property`, `VirtualTour`, `Quote`. Un seul modèle,
  jamais une table par type d'entité (évite la duplication demandée par le
  brief « Aucune duplication »).

`LeadCategory` gagne cinq valeurs (`COMMERCE`, `ARCHITECT`, `NOTARY`,
`CONSTRUCTOR`, `MUNICIPALITY`) — extension d'énumération, additive,
aucune valeur existante renommée ni supprimée (zéro régression sur le
scoring/les automatisations/le CSV existants qui filtrent par catégorie).

**"Contacts" n'est PAS un nouveau modèle séparé** : `LeadContact` (déjà
scopé par lead) couvre le besoin réel (savoir qui contacter chez un
établissement). Créer un registre de contacts transverse (une personne liée
à plusieurs `Lead`) n'a pas d'utilisation réelle identifiée pour une
entreprise de la taille de Provence 360 — sur-ingénierie écartée
explicitement (voir Alternatives écartées).

### Chronologie : agrégation en lecture seule, jamais une nouvelle table d'écriture

« Chronologie complète » est un SERVICE DE LECTURE
(`src/lib/crm/timeline-service.ts`) qui interroge `LeadNote`/`Message`/
`Conversation`/`Appointment`/`Task`/`Quote`/`AuditLog`/`Attachment`
existants et les fusionne par date pour un `Lead`/`Company`/`Property`
donné — jamais une nouvelle table qui dupliquerait un historique déjà
capturé ailleurs.

### Pipeline : personnalisation additive, `LeadStage` reste la source de vérité

`LeadStage` (14 valeurs) est référencé par le scoring, les règles
d'automatisation, le moteur de séquences, l'import CSV, et huit autres
points du code — le modifier ou le remplacer serait la définition même
d'une régression majeure sur v0.1–v0.8. Décision : nouveau modèle
`PipelineStage` (scopé organisation, `key`/`label`/`color`/`order`/
`category`: OPEN/WON/LOST), SEEDÉ 1:1 avec les 14 valeurs de `LeadStage`
existantes à la création de chaque organisation. `PipelineStage` pilote
l'AFFICHAGE (étiquette, couleur, ordre du Kanban) — `Lead.stage` (l'enum)
reste la seule source de vérité pour toute logique métier (automatisation,
scoring, arrêt de séquence). Une organisation peut renommer/réordonner/
recolorer ses étapes visibles sans toucher au comportement — CE N'EST PAS
un pipeline dont les étapes elles-mêmes changent de sémantique (impossible
sans réécrire tout le moteur d'automatisation existant), et c'est
documenté comme tel.

### Devis/Facturation : `Quote` étendu, `Invoice` nouveau (prépare `MOD-12`)

`Quote`/`QuoteLine`/`Service` existants sont étendus (remise, taux de TVA,
montant TVA, génération PDF, versionnement via `QuoteVersion` immuable,
abstraction de signature électronique). `Invoice`/`InvoiceLine` sont
NOUVEAUX (le brief demande explicitement de « préparer l'architecture »,
`MOD-07` documentait déjà ce point d'extension) — `Quote.status =
ACCEPTED` peut être converti en `Invoice`, jamais automatique (décision
métier).

### Communication Hub : registre de canaux réutilisant `Integration`

Un registre par canal (email/SMS/WhatsApp/téléphone/webhook), même idiome
que les registres LLM/embedding/Queue Manager déjà établis (ADR 0015/0032).
La configuration PAR ORGANISATION (clé API, expéditeur, etc.) est stockée
dans `Integration.config` (déjà en base, jusqu'ici décoratif) plutôt que
dans une nouvelle table ou des variables d'environnement globales — un
vrai SaaS multi-tenant ne peut pas partager une seule clé API entre toutes
les organisations. Repli sur les variables d'environnement uniquement pour
le mode démo/développement.

### Emails réels, Google Calendar : code réel, honnêteté sur les identifiants manquants

Contrairement aux stubs "jamais implémentables" (Milvus/FAISS/LanceDB,
ADR 0027), SMTP/Resend/Postmark/Brevo et Google Calendar sont
RÉELLEMENT implémentables avec les bibliothèques disponibles
(`nodemailer`, appels HTTP directs, `googleapis`) — mais nécessitent des
identifiants (clé API, identifiants OAuth) que cet environnement ne
possède pas. Décision : écrire une implémentation RÉELLE et complète pour
chacun (pas un stub qui simule), qui échoue explicitement et clairement
si aucune configuration n'est présente (`Integration` non `CONNECTED`) —
jamais un faux succès. Le mode démo reste le comportement par défaut tant
qu'aucun fournisseur n'est configuré. Documenté honnêtement : la
vérification de bout en bout contre un vrai compte externe n'a pas pu être
faite dans cet environnement (pas d'identifiants), à la différence du
reste de la suite qui est vérifié par une vraie requête HTTP.

### Visites 3D : nouveau module `VirtualTour`, `Mission` reste générique

`Mission` (`MOD-08`) reste intentionnellement générique (documenté comme
« aucun changement requis avant la phase SaaS »). `VirtualTour` est un
NOUVEAU modèle métier dédié Provence 360 (lien Matterport, lien de visite,
surface, type, photos/documents via `Attachment`), lié à un `Mission`
existant (réutilise sa planification/son prestataire/son statut
d'exécution) plutôt que de dupliquer ce mécanisme.

### Agents IA : 7 nouveaux agents métier, tous obligatoirement câblés au Context Engine

Chaque nouvel agent (Prospection, Relance, Devis, Planning, Réseaux
sociaux, Support, Analyse) est une nouvelle `AgentDefinition` + runtime +
outils déclaratifs, suivant exactement le gabarit de l'Agent Commercial
(v0.5). Conformément à l'ADR 0029 (déjà en vigueur, pas une nouvelle
règle) : tout nouvel appel à un fournisseur IA générative DOIT passer par
`assembleContext` — jamais un agent qui gère lui-même sa mémoire/son
contexte.

### Automatisations métier : gabarits pour l'Automation Engine (v0.8), pas un nouveau moteur

Les 10 automatisations "prêtes à l'emploi" demandées sont des GABARITS
`Automation`/`AutomationVersion` scellés au bootstrap, clonables — même
mécanisme que les 10 templates du Workflow Engine (`workflows/templates/`,
v0.6), appliqué à l'Automation Engine (v0.8) qui n'en avait pas encore.

## Conséquences

- Aucun champ, enum ou table existants n'est renommé, supprimé ou
  restructuré dans cette phase — chaque nouvelle capacité est un ajout pur
  (nouvelle table, nouvelle colonne optionnelle, nouvelle valeur d'enum).
  La suite de tests complète (288 tests + E2E) doit rester verte sans
  aucune modification après CHAQUE changement de schéma, vérifié en continu
  plutôt qu'une seule fois à la fin.
- Le pipeline reste sémantiquement fixe (14 étapes) même si son affichage
  devient personnalisable — limite assumée et documentée, une vraie
  refonte du pipeline (étapes ajoutées/supprimées avec re-mapping du moteur
  d'automatisation) resterait un chantier distinct, plus risqué, hors
  périmètre de cette phase.
- "Contacts" et une éventuelle scission de `Lead` par vertical restent
  volontairement hors périmètre — réévaluables si un besoin réel émerge.

## Alternatives écartées

- **Remplacer `LeadStage` par des étapes entièrement dynamiques
  (suppression/ajout arbitraire)** : écartée — casserait toute la logique
  d'automatisation/scoring/séquences qui raisonne sur des valeurs d'enum
  fixes ; risque de régression jugé disproportionné par rapport à la
  valeur (le besoin réel exprimé — personnaliser libellés/couleurs/ordre —
  est couvert sans ce risque par `PipelineStage`).
- **`Contact` comme registre transverse indépendant de `Lead`** : écartée
  — aucun usage réel identifié pour une entreprise unipersonnelle/petite
  équipe ; `LeadContact` suffit, et un partenaire prescripteur (architecte,
  notaire) est lui-même modélisé comme un `Lead` (désormais avec sa propre
  catégorie), pas comme un simple contact.
- **Scinder `Lead` par vertical métier (une table par catégorie)** :
  écartée à nouveau (déjà tranché par `MOD-03`) — un pipeline unique reste
  l'objectif explicite du brief v0.9 également (« pipeline totalement
  personnalisable », pas needing une table par catégorie).
- **Stocker la configuration des fournisseurs de communication dans des
  variables d'environnement globales** : écartée pour la configuration
  PAR ORGANISATION — incompatible avec un vrai SaaS multi-tenant (chaque
  organisation doit pouvoir utiliser SA PROPRE clé Resend/son propre
  compte SMTP) ; les variables d'environnement restent un repli pour le
  mode démo/développement uniquement.
