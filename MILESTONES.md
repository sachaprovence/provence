# Autorun — Jalons (Milestones)

> Ce document synthétise `ROADMAP.md` (modules) et `BACKLOG.md` (tâches
> `AR-NNNN`) en jalons livrables. Chaque jalon se termine par une
> application **fonctionnelle et démontrable**, jamais par un état
> intermédiaire cassé. `v1.0` marque la première version stable.

## Comment lire ce document

Pour chaque version : objectif du jalon, modules concernés, tâches
associées, **critères de sortie** (conditions vérifiables pour déclarer le
jalon terminé), et **état fonctionnel de l'application** à l'issue du
jalon (ce qu'un utilisateur/démonstrateur peut réellement montrer).

## Flexibilité de l'ordre

L'ordre `v0.1 → v1.0` ci-dessous est la séquence par défaut recommandée.
Deux contraintes sont strictes et non négociables :

1. `v0.1` (fondations) précède tout le reste.
2. `v0.2` (configuration métier) précède `v0.3` (validation par un second
   vertical), qui doit elle-même précéder toute nouvelle fonctionnalité
   construite *au-dessus* de la configuration vertical (facturation,
   documents, etc. restent indépendants du vertical et pourraient en
   théorie être avancés avant `v0.3` si une priorité business l'exige —
   voir note en fin de section).

Entre `v0.4` et `v0.10`, l'ordre est réordonnable selon les priorités
business (ex. si un client attend la facturation avant le calendrier,
inverser `v0.4/v0.5` et `v0.7` ne casse aucune dépendance technique).
`v1.0` doit rester en dernier : elle dépend de la sécurité durcie (`v0.10`)
et de la facturation client (`v0.4`/`v0.5`).

---

## v0.1 — Fondations techniques

- **Objectif du jalon** : poser le socle CI/tests/conventions sans lequel
  aucune généralisation ultérieure n'est vérifiable.
- **Modules** : MOD-00.
- **Tâches** : AR-0001 à AR-0006.
- **Critères de sortie** :
  - la CI (lint/typecheck/tests/build) bloque une PR volontairement
    cassée ;
  - le pipeline e2e tourne après merge sur `main` et rejoue le golden
    path ;
  - `docs/adr/` existe avec un premier ADR réel ;
  - le gabarit de test d'isolation multi-tenant est prouvé sur au moins une
    route existante ;
  - `CODEOWNERS` est en place.
- **État fonctionnel de l'application** : identique au MVP Provence 360
  actuel — **aucun changement visible pour l'utilisateur final**. Ce jalon
  est un investissement d'outillage, pas une livraison fonctionnelle.

## v0.2 — Configuration métier (Vertical Pack, socle de données)

- **Objectif du jalon** : rendre configurables les catégories de
  prospects, le catalogue de services et les étapes de pipeline,
  aujourd'hui figés en enums Prisma, sans changer le comportement observé
  de Provence 360.
- **Modules** : MOD-02 (avec contributions ponctuelles de MOD-01/03/11).
- **Tâches** : AR-0007 à AR-0014.
- **Critères de sortie** :
  - `tests/e2e/golden-path.mjs` passe sans aucune modification de script ;
  - un snapshot des valeurs Provence 360 avant/après migration est
    strictement identique ;
  - une organisation de test créée sans configuration explicite reçoit un
    jeu de valeurs par défaut cohérent et utilisable ;
  - l'UI d'administration permet d'éditer catégories/services/étapes sans
    accès direct à la base.
- **État fonctionnel de l'application** : Provence 360 fonctionne
  **exactement comme avant** du point de vue utilisateur ; en coulisses,
  les valeurs métier sont maintenant des données, pas du code. C'est le
  jalon le plus risqué de la roadmap — à ne déclarer terminé qu'après une
  période d'observation en usage réel avant de retirer les enums obsolètes
  (AR-0014, qui peut être repoussée à `v0.3` si la prudence l'exige).

## v0.3 — Validation par un second vertical fictif

- **Objectif du jalon** : prouver, avant d'investir davantage, que `v0.2`
  tient sa promesse de généralisation.
- **Modules** : MOD-20, ajustements MOD-03/05/09/11.
- **Tâches** : AR-0015 à AR-0021.
- **Critères de sortie** :
  - le golden path complet (prospection → mission) rejoué avec succès pour
    un métier fictif distinct de Provence 360, sans ligne de code
    spécifique ;
  - les champs personnalisés par vertical (`customFields`) sont validés
    dynamiquement ;
  - le moteur d'automatisation accepte une règle propre au vertical fictif
    sans modification du moteur lui-même.
- **État fonctionnel de l'application** : **deux organisations de nature
  différente cohabitent** dans la même instance sans interférence
  fonctionnelle. C'est la première démonstration concrète qu'Autorun n'est
  plus un logiciel mono-métier.
- **Point de décision** : si des lacunes structurelles sont découvertes ici,
  il est normal et attendu de revenir corriger `v0.2` avant de poursuivre
  (AR-0016). Ne pas avancer sur `v0.4+` avec une base de généralisation
  fragile.

## v0.4 — Facturation client, socle fonctionnel

- **Objectif du jalon** : combler le manque identifié dans la conception
  initiale (aucune facturation) avec un flux devis → facture → suivi
  manuel du paiement.
- **Modules** : MOD-12 (partie 1).
- **Tâches** : AR-0022 à AR-0026.
- **Critères de sortie** :
  - un devis `ACCEPTED` génère une facture avec les mêmes montants ;
  - la facture est éditable, envoyable, marquable payée manuellement,
    exportable en PDF ;
  - une relance automatique d'impayé se déclenche au bon délai.
- **État fonctionnel de l'application** : le cycle commercial complet
  (prospect → client → mission → **facture**) est démontrable de bout en
  bout pour la première fois, sans encore de paiement en ligne réel.

## v0.5 — Facturation, paiement en ligne réel

- **Objectif du jalon** : rendre le paiement client réellement encaissable,
  pas seulement suivi manuellement.
- **Modules** : MOD-12 (partie 2).
- **Tâches** : AR-0027 à AR-0030.
- **Critères de sortie** :
  - un lien de paiement Stripe fonctionnel est inclus dans l'email de
    facture ;
  - un webhook Stripe de confirmation de paiement traité deux fois ne
    produit qu'un seul effet (idempotence prouvée) ;
  - aucune donnée de carte bancaire ne transite ni n'est stockée côté
    Autorun (vérifié par un test automatisé, pas seulement une revue).
- **État fonctionnel de l'application** : un client final peut réellement
  payer une facture en ligne et voir son statut se mettre à jour
  automatiquement.

## v0.6 — Gestion documentaire

- **Objectif du jalon** : combler le deuxième manque identifié (aucun
  stockage de fichiers).
- **Modules** : MOD-13.
- **Tâches** : AR-0031 à AR-0035.
- **Critères de sortie** :
  - upload/téléchargement/suppression de document fonctionnels en mode
    démo/self-host sans clé API tierce (`LocalStorageProvider`) ;
  - une URL de téléchargement expirée est refusée ;
  - bascule vers un stockage S3 possible par simple variable
    d'environnement, testée contre un service compatible.
- **État fonctionnel de l'application** : contrats, livrables et pièces
  jointes peuvent être attachés aux prospects/clients/missions et
  téléchargés en sécurité.

## v0.7 — Calendrier

- **Objectif du jalon** : offrir une vraie vue calendrier et, en option,
  une synchronisation externe.
- **Modules** : MOD-14.
- **Tâches** : AR-0036 à AR-0039.
- **Critères de sortie** :
  - vue calendrier jour/semaine/mois fonctionnelle sans aucune intégration
    externe ;
  - synchronisation Google Calendar testée sur un compte de test réel ;
  - synchronisation Outlook Calendar testée sur un compte de test réel.
- **État fonctionnel de l'application** : les rendez-vous existants
  deviennent consultables en vue calendrier, avec option de
  synchronisation vers l'agenda personnel de l'utilisateur.
- **Note** : ce jalon peut être développé **en parallèle** de `v0.6`
  (aucune dépendance croisée) si deux développeurs sont disponibles.

## v0.8 — Infrastructure asynchrone

- **Objectif du jalon** : sortir les traitements potentiellement longs
  (séquences, IA, imports, webhooks) du cycle requête/réponse HTTP, avant
  que le volume ne le rende obligatoire dans l'urgence.
- **Modules** : MOD-15.
- **Tâches** : AR-0040 à AR-0046.
- **Critères de sortie** :
  - `pg-boss` en place, un job planifié s'exécute et un job en échec est
    retenté puis mis en dead-letter après N tentatives ;
  - le comportement des séquences est strictement identique à avant
    migration (non-régression du golden path) ;
  - un tableau de bord permet de consulter et relancer manuellement un job
    en échec.
- **État fonctionnel de l'application** : identique du point de vue
  utilisateur final, mais l'application encaisse désormais un import
  volumineux ou un pic d'envoi sans dégrader le temps de réponse HTTP.

## v0.9 — Observabilité et connecteurs réels

- **Objectif du jalon** : donner de la visibilité opérationnelle et
  remplacer les fournisseurs démo par des fournisseurs réels pour l'IA et
  l'email.
- **Modules** : MOD-16, MOD-04 (IA réelle), MOD-06 (email réel).
- **Tâches** : AR-0047 à AR-0054.
- **Critères de sortie** :
  - logs structurés sans donnée sensible détectée par test automatisé ;
  - une exception simulée est capturée avec contexte suffisant pour être
    diagnostiquée ;
  - bascule `AI_PROVIDER=demo` → `AI_PROVIDER=anthropic` sans changement de
    code, avec quota dur vérifié par test ;
  - au moins un connecteur email réel (SMTP) fonctionnel de bout en bout
    sur un compte de test.
- **État fonctionnel de l'application** : Autorun peut désormais tourner en
  conditions réelles (IA et email non simulés) pour une organisation
  pilote, avec une équipe capable de diagnostiquer un incident en
  production.

## v0.10 — Sécurité avancée (porte obligatoire avant v1.0)

- **Objectif du jalon** : ce jalon est un **gate**, pas une fonctionnalité
  — condition bloquante avant toute ouverture SaaS publique.
- **Modules** : MOD-17.
- **Tâches** : AR-0055 à AR-0058.
- **Critères de sortie** :
  - 100 % des routes API couvertes par un test d'isolation multi-tenant ;
  - rapport de revue OWASP Top 10 sans vulnérabilité critique ouverte non
    corrigée ;
  - quota email dur vérifié par test, au même standard que le quota IA
    (`v0.9`) ;
  - schéma 2FA en place (non forcé), prêt pour activation.
- **État fonctionnel de l'application** : inchangé fonctionnellement pour
  l'utilisateur ; changement de posture de sécurité mesurable et
  documenté. **`v1.0` ne peut pas démarrer avant que ce jalon soit
  entièrement clos.**

## v1.0 — Ouverture SaaS (première version stable)

- **Objectif du jalon** : permettre à une nouvelle organisation de
  s'inscrire, choisir un plan, payer, et être opérationnelle sans
  intervention manuelle — condition de "SaaS" au sens propre du terme.
- **Modules** : MOD-18, MOD-19.
- **Tâches** : AR-0059 à AR-0066.
- **Critères de sortie** :
  - API publique en lecture fonctionnelle, isolée par organisation, avec
    rate limiting actif ;
  - au moins un webhook sortant livré avec succès à un récepteur de test,
    avec retry prouvé sur échec simulé ;
  - un changement de plan applique immédiatement les nouveaux quotas ;
  - un échec de paiement d'abonnement bascule l'organisation en statut
    restreint sans perte de données ;
  - le parcours d'inscription self-service complet (compte → organisation
    → vertical → plan → paiement → provisionnement) fonctionne de bout en
    bout sans intervention manuelle ;
  - recette finale (AR-0066) passée sur un environnement de
    préproduction représentatif de la production.
- **État fonctionnel de l'application** : **première version stable
  d'Autorun** — plateforme SaaS multi-vertical, multi-tenant, avec
  facturation d'abonnement, prospection à client à facturation, sécurité
  auditée, observabilité en place. C'est le jalon qui clôt la roadmap
  initiale ; les évolutions suivantes (§"Fonctionnalités pouvant être
  ajoutées plus tard" de `ROADMAP.md`) relèvent d'un nouveau cycle de
  planification.

---

## Tableau récapitulatif

| Jalon | Nature | Visible utilisateur ? | Bloquant pour la suite ? |
|---|---|---|---|
| v0.1 | Outillage | Non | Oui (tout) |
| v0.2 | Refonte interne | Non (comportement identique) | Oui (v0.3+) |
| v0.3 | Validation | Non (jalon de preuve) | Oui (v0.4+, en pratique) |
| v0.4 | Fonctionnalité | Oui | Non |
| v0.5 | Fonctionnalité | Oui | Non |
| v0.6 | Fonctionnalité | Oui | Non |
| v0.7 | Fonctionnalité | Oui | Non |
| v0.8 | Infrastructure | Non (transparent) | Recommandé avant v0.9 (IA/email réels à fort volume) |
| v0.9 | Fonctionnalité + ops | Oui (IA/email réels) | Oui (v0.10 en dépend partiellement) |
| v0.10 | Sécurité | Non | **Oui, bloquant pour v1.0** |
| v1.0 | Ouverture SaaS | Oui | — (fin de cycle) |

---

*Voir `BACKLOG.md` pour le détail des tâches de chaque jalon et
`DEVELOPMENT_GUIDE.md` pour la façon de les exécuter au quotidien.*
