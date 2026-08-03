# ADR 0039 — Agents métier v0.9 sur les VRAIES données CRM (jamais un modèle de démonstration), et cadrage final des tâches #91/#92

- **Date** : 2026-08-03
- **Statut** : accepté

## Contexte

L'ADR 0038 tranche le périmètre v0.9 avant l'implémentation : « chaque
nouvel agent... suivant exactement le gabarit de l'Agent Commercial
(v0.5) ». En construisant réellement les 7 agents métier (Prospection,
Relance, Devis, Planning, Réseaux sociaux, Support, Analyse), une tension
est apparue que l'ADR 0038 n'avait pas anticipée explicitement : l'Agent
Commercial (v0.5) fonctionne intégralement sur un modèle de DÉMONSTRATION
séparé (`CommercialProspect`/`CommercialAction`, `scoring-engine.ts`
propre à ce modèle) — jamais connecté au CRM réel (`Lead`/`Quote`/
`Appointment`/...) construit depuis. Reproduire littéralement ce patron
pour les 7 nouveaux agents aurait satisfait « suivre le gabarit » au pied
de la lettre, mais aurait directement violé le mandat central du brief
v0.9 : « L'objectif est que je puisse piloter quasiment toute mon
entreprise depuis Autorun » et « Chaque fonctionnalité développée doit
avoir une utilité directe dans l'activité quotidienne ». Un agent
Prospection qui score des prospects fictifs, invisibles du vrai pipeline
commercial, n'a aucune valeur réelle pour Provence 360.

Par ailleurs, deux tâches de fin de version (#91 automatisations métier,
#92 réglages) ont soulevé des choix de périmètre non couverts par l'ADR
0038, documentés ici pour rester cohérents avec sa méthode (choix explicite
+ alternatives écartées consignées).

## Décision

### Les 7 agents métier réutilisent l'ARCHITECTURE de l'Agent Commercial, jamais son MODÈLE DE DONNÉES

« Suivre le gabarit du Commercial » est réinterprété comme : même PATRON
architectural (`AgentDefinition` + runtime + outils déclaratifs + câblage
Context Engine obligatoire, ADR 0029 + journal d'audit + vérifications de
permission), jamais une réplique du modèle de démonstration déconnecté.
Concrètement, chacun des 7 agents lit/écrit les VRAIES tables et
réutilise les VRAIS services déjà construits dans cette même phase v0.9 :

- Prospection/Relance/Support → `Lead`/`Message`/`Conversation` réels ;
  Prospection réutilise le VRAI moteur de scoring (`@/lib/scoring`,
  celui de `/api/leads/[id]/score`), jamais
  `commercial/scoring-engine.ts` (propre au modèle de démonstration).
- Devis → `quote-service.ts` (task #83) directement — aucune
  réimplémentation du calcul de remise/TVA/versionnement.
- Planning → `calendar/google/*` (task #87) puis repli honnête sur les
  vrais `Appointment` si Google Calendar n'est pas connecté — jamais une
  disponibilité inventée.
- Réseaux sociaux → `VirtualTour` réellement publiées (task #88) ; la
  publication reste un stub honnête (aucune API sociale disponible).
- Analyse → `stats.ts` (les mêmes statistiques que `/dashboard`), jamais
  un recalcul séparé.

Deux points d'extraction évitent de dupliquer sept fois la même
plomberie : `generateAgentNarrative` (`shared/generation.ts`, extrait de
`commercial/generation.ts` sans changer sa signature externe) pour
l'appel LLM + Context Engine, et `createSimpleAgentRuntime`
(`shared/simple-runtime.ts`) pour le runtime de dispatch générique
(action → outil déclaratif). Support et Analyse PROMEUVENT les stubs
DRAFT créés en v0.4 (`future-support-agent`/`future-analyse-agent`, même
mécanisme `promoteGlobalAgentDefinition` que Commercial en v0.5) ; les
cinq autres n'avaient pas de stub correspondant et sont créés directement
PUBLISHED.

### Automatisations métier (#91) : extension EXPLICITE et anticipée de `REAL_EMISSION_EVENT_KEYS`

Les 10 gabarits demandés (Nouveau prospect, Demande de devis, Rendez-vous
confirmé, Visite terminée, Facture envoyée, Paiement reçu, Client
inactif, Demande d'avis Google, Relance automatique, Publication réseaux
sociaux) ne se contentent pas de démontrer le schéma comme les 10
gabarits v0.6 du Workflow Engine (dont certains référençaient une action
non encore implémentée à l'époque, ex. `quote.create`) : CHAQUE
déclencheur et CHAQUE action référencés sont réellement câblés dès
aujourd'hui. Cela exige d'étendre `trigger-engine.ts#REAL_EMISSION_EVENT_KEYS`
(ADR 0037) avec les évènements `quote.sent`/`quote.signed`/
`quote.signature_declined`, `invoice.created`/`sent`/`paid`,
`virtual_tour.created`/`shooting_done`/`published`, `property.created` —
déjà publiés par les services v0.9 (tasks #83/#84/#88) mais jusque-là
sans abonné — et un nouveau point d'émission réel `appointment.created`.
C'est EXACTEMENT le cas anticipé par l'ADR 0037 (« étendre le câblage
réel se limite à ajouter une clé... un changement explicite et
grep-able ») : aucun changement d'architecture, seulement l'extension
prévue.

### Réglages (#92) : identifiants email PAR ORGANISATION, mais choix du fournisseur IA reste un réglage de déploiement

La page Paramètres expose désormais : (a) coordonnées légales/TVA/logo
(`Organization.logoUrl`/`vatNumber`/`siret`/`legalAddress`/`phone`/
`invoicePrefix`/`quotePrefix`, en base depuis la task #80 mais jamais
éditables), (b) un formulaire d'identifiants email écrivant dans
`Integration.config` (kind EMAIL) via `updateEmailIntegrationConfig`
(nouveau, fusionne plutôt que remplace — un champ secret laissé vide ne
doit jamais effacer un identifiant déjà enregistré) et
`getEmailConfigPreview` (ne renvoie JAMAIS un secret en clair au
navigateur, seulement sa présence). Décision explicite : l'IA reste
pilotée par variable d'environnement (`LLM_PROVIDER`/`AI_PROVIDER`, ADR
0015) — PAS de configuration par organisation — contrairement à l'email.
La section "Intelligence artificielle" des Paramètres affiche donc un
statut honnête (fournisseur actif, fournisseurs disponibles) plutôt
qu'un formulaire qui n'agirait sur rien.

## Conséquences

- Zéro nouveau modèle de démonstration introduit en v0.9 : les 8 agents
  métier (Commercial + 7 nouveaux) sont désormais tous branchés sur des
  données réelles, à l'exception du modèle historique de Commercial
  lui-même (`CommercialProspect`/`CommercialAction`, hors périmètre —
  une migration de Commercial vers le CRM réel resterait un chantier
  distinct, non demandé par ce brief).
- Chaque agent installé produit un effet de bord VÉRIFIABLE dans les
  vraies tables (`LeadScore`, `Message` en `PENDING_VALIDATION`, `Quote`/
  `QuoteVersion`, `Appointment`, `AuditLog`) — testé par intégration pour
  chacun des 7 agents (tests/agents/*.test.ts) et par un scénario complet
  déclencheur→job→agent→effet de bord réel pour l'automatisation "Nouveau
  prospect" (tests/automation/business-automation-templates.test.ts).
- Étendre le câblage réel des déclencheurs (paiement en ligne futur,
  signature électronique réelle...) reste, comme documenté par l'ADR
  0037, une extension d'une seule liste explicite — pas une réécriture.
- Le choix de garder l'IA en configuration de déploiement (et non par
  organisation) reste réévaluable si Provence 360 devient un vrai SaaS
  multi-tenant avec des organisations tierces — non nécessaire pour une
  entreprise unique aujourd'hui.

## Alternatives écartées

- **Répliquer le modèle `CommercialProspect`/`CommercialAction` pour les
  7 nouveaux agents** (lecture littérale de « suivre le gabarit de
  Commercial ») : écartée — aurait produit sept agents dont les actions
  n'ont aucun effet visible dans le CRM/les tableaux de bord réels,
  directement contraire au mandat "piloter l'entreprise depuis Autorun".
- **Faire des 7 agents de simples wrappers appelant les API REST
  existantes** (au lieu d'outils déclaratifs Prisma directs) : écartée
  — cohérent avec le choix déjà fait pour Commercial (v0.5) et Director
  (v0.4) d'accéder directement aux services/Prisma depuis les outils
  d'agent, jamais via une boucle HTTP interne.
- **Rendre le fournisseur IA configurable par organisation** (même
  patron que l'email) : écartée pour cette phase — aucun besoin réel
  identifié (Provence 360 est une organisation unique), et cela aurait
  exigé de faire transiter `organizationId` dans les 7 fournisseurs LLM
  réels et tous leurs appelants (Context Engine, Memory Engine,
  Knowledge Engine...), un changement d'architecture disproportionné par
  rapport à une tâche de "Réglages".
