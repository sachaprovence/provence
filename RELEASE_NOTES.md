# Notes de version — Autorun

Historique des versions livrées. Voir `BACKLOG.md` pour le détail tâche
par tâche, `docs/adr/` pour les décisions d'architecture, et
`docs/release/` pour les recettes finales détaillées des jalons majeurs.

## v1.1 — Provence 360 Production (2026-08-04)

Autorun cesse d'être développé comme un SaaS générique pour devenir le
logiciel métier quotidien réel de Provence 360 : un prospect peut
parcourir tout son cycle de vie (prospection → qualification → premier
contact → rendez-vous → visite virtuelle → devis → signature →
facturation → paiement → suivi → fidélisation) sans quitter Autorun.
26 tâches (`AR-0160` à `AR-0185`), livrées intégralement. Décisions
d'architecture : `docs/adr/0043` et `docs/adr/0044`. Recette complète :
`docs/release/v1.1-recette.md`.

**CRM production**
- Modèle `Contact` de premier niveau (personne physique partagée entre
  plusieurs fiches, indépendante d'un `Lead`), interfaces Entreprises
  (`Company`) et Biens (`Property`), pièces jointes, tags, et fiche 360°
  assemblant timeline/documents/automatisations/agents/visites/devis/
  factures/paiements/GPS/statistiques sur une seule page.

**Pipeline & devis/factures**
- Évènement `lead.stage_changed` déclenchable par automatisation à
  chaque transition d'étape, avec vocabulaire Provence 360.
- Historique de versions de devis consultable ; paiements partiels et
  échéance automatique sur les factures (au-delà du binaire payé/non
  payé).

**Visites 3D**
- Champs GPS/équipement/technicien/durée, intégration Google Maps.
- Cycle complet jusqu'à la livraison client et la facturation directe,
  avec automatisation "Livraison effectuée" (demande d'avis Google).

**Communication réelle**
- Fournisseur Twilio réel pour SMS/WhatsApp/téléphone (plus seulement
  démo), sélectionnable par organisation (3 niveaux de configuration :
  org → variable globale → démo).
- Rappels sur les évènements Google Calendar synchronisés (60 minutes
  avant par défaut, configurable).

**Agents IA**
- Agent Qualification (extrait de l'Agent Commercial, réutilise
  directement ses outils de scoring/qualification).
- Agent Visites (détection des visites bloquées, relance technicien,
  avancement de statut) — 8 agents métier au total.

**Tableaux de bord & paramètres**
- Tableaux de bord Planning (charge par prestataire, RDV à venir, visites
  de la semaine) et Financier (CA, factures en attente/retard, devis en
  cours, prévisionnel).
- Métrique "Temps gagné" (estimation) sur le tableau de bord
  Automatisations.
- Paramètres agenda (horaires d'ouverture par jour, capacité par
  créneau) et préférences de notification par utilisateur/évènement
  (canal `APP` appliqué ; canal `EMAIL` modélisé, pas encore appliqué).

**Expérience utilisateur**
- Recherche globale (Lead/Company/Contact/Quote/Invoice/VirtualTour) et
  Command Palette (`cmd+k`, navigation + recherche + actions).
- Glisser-déposer sur le pipeline commercial (Kanban), persistant côté
  serveur, accessible au clavier.
- Mode sombre (système/clair/sombre), sans flash de thème incorrect,
  sans erreur d'hydratation React.
- Raccourcis clavier globaux (`g` puis une lettre pour naviguer, `n`
  nouveau prospect, `?` aide), désactivés en contexte de saisie.
- Barre latérale responsive (tiroir mobile en dessous de `md`).

**Validation** : lint (0 erreur), typecheck (0 erreur), build de
production réussi, 678 tests (122 fichiers) tous passés, 4 suites E2E
toutes passées, audit de sécurité sans nouvelle vulnérabilité introduite.

## v1.0 — Ouverture SaaS (2026-08-03)

Première version stable ouverte à des organisations tierces en
self-service. API publique en lecture (v1) authentifiée par clé API,
rate limiting et quotas, webhooks sortants signés (HMAC) avec retry,
modèle de plans d'abonnement (STARTER/PRO/ENTERPRISE), intégration
Stripe Billing (réelle et démo), onboarding self-service avec
provisionnement automatique, page de gestion d'abonnement. Décisions :
`docs/adr/0042`. Recette : `docs/release/v1.0-recette.md`.

## v0.10 — Stabilisation production (2026-08-03)

Porte de sécurité obligatoire avant `v1.0`. Correction critique du lien
de réinitialisation de mot de passe, masquage des secrets dans les
réponses API, rate limiting et verrouillage de compte sur
l'authentification, secret de webhook obligatoire, quota email dur par
organisation, préparation 2FA (schéma + interface), suite exhaustive de
tests d'isolation multi-tenant, intégration des 3 suites E2E en CI, revue
de sécurité OWASP Top 10.

## v0.9 bis — Observabilité + connecteurs réels (2026-08-03)

Capture d'erreurs réelle (Sentry, ingestion HTTP), métriques de base
(coût IA, taux d'échec email, latence API), `AnthropicAIProvider` réel,
quota IA dur par organisation, connecteurs Gmail et Outlook réels (OAuth2
+ API natives, sans SDK).

## v0.9 — Provence 360 Operating System (2026-08-03)

Le jalon fonctionnel le plus large : CRM étendu (timeline, pipeline
personnalisable), devis/factures professionnels (remise, TVA,
versionnement, PDF, signature électronique), Communication Hub
(SMS/WhatsApp/téléphone/webhook), connecteurs email réels
(SMTP/Resend/Postmark/Brevo), Google Calendar réel, module Visites 3D,
9 tableaux de bord métier, 7 agents IA spécialisés, 10 automatisations
prêtes à l'emploi, réglages complets (entreprise/TVA/logo/email/IA).

## v0.8 — Automation Engine Enterprise (2026-07-30)

Moteur d'automatisation transversal de niveau entreprise : gestionnaire
de file d'attente PostgreSQL, gestionnaire de verrous par bail,
gestionnaire de concurrence, moteur de retry avec circuit breaker, file
d'attente des messages morts (DLQ), gestionnaire de priorité,
ordonnanceur d'entreprise (fuseaux horaires, heure d'été, calendriers),
moteur de déclencheurs et répartiteur d'évènements, registre
d'actions/jobs.

## v0.7 — Intelligence documentaire (2026-07-30)

Moteur de mémoire multi-niveaux générique, moteur de connaissances
(documents, fragments, embeddings), pipeline d'ingestion de documents,
moteurs de recherche (plein texte/vectoriel/hybride), moteur de contexte
(sélection et compression automatiques), extension du moteur de prompts
(typé, héritable, multilingue).

## v0.6 — Workflow Engine (2026-07-30)

Moteur d'exécution de workflows visuels : moteur d'expressions/variables,
registres de déclencheurs/conditions/actions déclaratifs, éditeur de
noeuds par glisser-déposer, 10 modèles de workflow intégrés,
versionnement et cycle de vie complets.

## v0.5 — Agent Commercial (2026-07-30)

Premier agent métier : moteur de scoring extensible, service commercial
avec 11 outils déclaratifs, génération de messages personnalisés,
inscription en séquence, délégation depuis l'Agent Director.

## v0.4 — Agent Director (2026-07-30)

Premier agent orchestrateur : moteur de planification, décomposition
d'objectifs, délégation à des agents métier (alors futurs), mémoire
inter-exécutions.

## v0.3 — Framework des Agents IA (2026-07-30)

Infrastructure du Framework des Agents : catalogue et installation
d'agents, moteur d'exécution en file interne, abstraction LLM générique,
moteur de prompts versionné en base.

## v0.2 — Multi-tenant Organization/Workspace (2026-07-29)

Refonte du modèle multi-tenant : `Organization`/`Workspace`, rôles et
permissions, migration des rôles existants.

## v0.1 — Fondations techniques (2026-07-29)

Socle technique et DevOps initial : authentification, logs structurés
(pino), validation d'environnement au démarrage, Prettier scopé.
