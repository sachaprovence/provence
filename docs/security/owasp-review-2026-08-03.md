# Revue de sécurité OWASP Top 10 — 2026-08-03 (v0.10)

Ce document formalise les résultats de l'audit exhaustif mené avant la
version 0.10 de stabilisation (voir `BACKLOG.md` § Version 0.10). Il ne
remplace pas une revue externe indépendante avant l'ouverture publique du
SaaS (v1.0) — voir la recommandation en fin de document.

## Méthodologie

Trois revues indépendantes ciblées ont été menées sur l'ensemble du code
(pas seulement sur les ADR/BACKLOG existants) :

1. **Sécurité et isolation multi-tenant** — recherche d'IDOR, de fuites
   inter-organisation, de secrets exposés, de contrôles d'authentification
   manquants.
2. **Dette technique et performance** — code mort, duplication de logique,
   requêtes N+1, index manquants, interfaces non reliées.
3. **Couverture de tests, migrations, observabilité, documentation, CI** —
   modules sans test, garde-fous CI manquants, documentation obsolète.

Ces trois audits ont été complétés par une vérification manuelle ciblée du
parcours de réinitialisation de mot de passe (route et écran), qui a
révélé le constat le plus sévère de toute la revue (AR-0153).

Chaque constat a été classé :
- **P0** — indispensable avant la v1.0 (bloquant) ;
- **P1** — fortement recommandé, mais non bloquant pour la v1.0 ;
- **P2** — amélioration pouvant attendre après la v1.0.

Tous les constats P0 ont été transformés en tâches atomiques (AR-0055 à
AR-0058, AR-0153 à AR-0159) et corrigés dans le cadre de la v0.10 — voir le
tableau ci-dessous pour l'état de correction à la clôture de cette version.

## Constats P0 — corrigés dans la v0.10

| Constat | Sévérité | Tâche | Fichiers principaux | Statut |
|---|---|---|---|---|
| Le lien de réinitialisation de mot de passe était **toujours** renvoyé en clair dans la réponse JSON de `POST /api/auth/reset-password/request`, même avec un fournisseur email réel configuré — prise de contrôle de compte triviale en production. | Critique | AR-0153 | `src/app/api/auth/reset-password/request/route.ts` | ✅ Corrigé |
| `updateChannelConfig` (Communication Hub) renvoyait la ligne `Integration` brute, secrets de configuration en clair inclus, dans la réponse API. | Élevé | AR-0154 | `src/lib/communication/hub-service.ts` | ✅ Corrigé |
| Aucune protection contre le brute-force sur `POST /api/auth/login` (aucun verrouillage de compte, aucune limite de débit). | Élevé | AR-0155 | `src/lib/auth.ts`, `src/lib/security/rate-limiter.ts`, `src/proxy.ts` | ✅ Corrigé |
| Le secret des déclencheurs webhook (Workflow Engine et Automation Engine) était **optionnel** — un déclencheur créé sans secret restait ouvert à quiconque devine `workspaceId` + `workflowKey`/`automationKey`. | Élevé | AR-0156 | `src/lib/security/webhook-secret.ts`, routes `POST /api/webhooks/{workflows,automations}/...` | ✅ Corrigé |
| Le quota d'envoi email quotidien (`Organization.dailySendLimit`/`EmailAccount.dailyLimit`) était bloquant dans `sequence-engine.ts` mais totalement absent des actions `email.send` du Workflow Engine et de l'Automation Engine — envoi illimité possible via ces deux points d'entrée. | Élevé | AR-0057 | `src/lib/email/quota.ts`, `src/lib/email/index.ts`, les deux `actions/builtin/email-action.ts` | ✅ Corrigé |
| Aucun schéma ni interface pour une future authentification à deux facteurs, prérequis identifié pour `MOD-17` (post-v1.0). | Moyen | AR-0058 | `prisma/schema.prisma` (`User.twoFactorSecret`/`twoFactorEnabled`), `src/lib/two-factor.ts` | ✅ Corrigé (préparation — 2FA non encore obligatoire) |
| `tests/tenant-isolation/` ne couvrait que 8 domaines sur une trentaine réels — aucun filet pour les domaines financiers (factures, devis) ni porteurs de secrets (Communication Hub, email, calendrier). | Élevé | AR-0055 | `tests/tenant-isolation/{invoices,quotes,appointments,automations,communications,email,calendar}.test.ts` | ✅ Corrigé |
| Trois modules exposés à un trafic non authentifié ou porteurs d'obligations de conformité (`sequence-engine.ts`, `suppression.ts`, `unsubscribe-token.ts`) n'avaient **aucun** test. | Élevé | AR-0158 | `tests/crm/{sequence-engine,suppression,unsubscribe-token}.test.ts` | ✅ Corrigé |
| `.github/workflows/e2e.yml` ne s'exécutait qu'après un merge sur `main`, et seul `golden-path.mjs` y tournait — `two-organizations-isolation.mjs` (isolation multi-tenant) et `automation-golden-path.mjs` ne tournaient jamais en CI. | Élevé | AR-0157 | `.github/workflows/e2e.yml` | ✅ Corrigé |
| `README.md` ne décrivait que le parcours CRM v0.1 d'origine, omettant environ la moitié du produit réellement livré. | Moyen | AR-0159 | `README.md` | ✅ Corrigé (voir tâche suivante de la v0.10) |

## Constats P1 — recommandés, non bloquants pour la v1.0

Ces constats n'exposent aucune donnée ni aucune faille de sécurité directe
(pas de fuite inter-tenant, pas de contournement d'authentification) — ce
sont des points de dette technique, de performance ou de robustesse
défensive dont le report est raisonnable pour livrer la v1.0 à temps.

- **Requêtes N+1** dans `getPerformanceDashboard` et `checkStaleQuotes` —
  fonctionnellement correctes, mais coûteuses à l'échelle. À corriger
  quand un volume de données réel en production le justifiera.
- **Index Postgres manquants** sur certaines colonnes de `Quote` et
  `Task` fréquemment filtrées — dégradation de performance progressive,
  pas de risque fonctionnel.
- **Duplication de la formule de remise** entre
  `commercial-document-pdf.ts` et `quote-pricing.ts` — même résultat
  actuellement, mais un futur changement de règle de calcul devra être
  répercuté aux deux endroits. À factoriser lors d'un prochain refactor du
  module devis.
- **Duplication du patron d'appel HTTP** entre les fournisseurs email
  réels (SMTP/Resend/Postmark/Brevo/Gmail/Outlook) — chaque fournisseur
  réimplémente une structure de requête/erreur similaire. Facteur de
  dette, pas de risque.
- **`daysAgo()` dupliqué** à l'identique dans une dizaine de fichiers —
  candidat évident à une fonction utilitaire partagée, sans impact
  fonctionnel.
- **`--max-warnings=0` absent de la commande ESLint en CI** — les
  avertissements ne font pas actuellement échouer le build. À activer une
  fois les avertissements préexistants résorbés (aucun avertissement
  actuel n'est lié à une faille de sécurité).
- **Aucun scan de secrets automatisé en CI** (type gitleaks/trufflehog) —
  aucune fuite de secret n'a été détectée dans l'historique du dépôt lors
  de cette revue, mais l'absence de garde-fou automatisé est un risque
  latent à combler.
- **Comparaison non constante (`!==`) pour `CRON_SECRET`** dans les 5
  routes `/api/cron/*` — ces routes sont protégées par ailleurs (secret
  long, appelées uniquement par l'infrastructure de cron, jamais par un
  navigateur), mais harmoniser avec `timingSafeStringEqual` (déjà utilisé
  pour les secrets de webhook, AR-0156) serait cohérent.

## Constats P2 — peuvent attendre après la v1.0

- **Alerting sur seuil** (coût IA, taux d'échec email, latence API) —
  les métriques existent (AR-0049) mais aucune notification proactive
  n'est déclenchée en cas de dépassement.
- **Tests HTTP dédiés par fournisseur** vector-store/embedding (au-delà
  du fournisseur `demo` déjà testé) — utile une fois un fournisseur réel
  effectivement mis en production pour un client.
- **UI de signature électronique de devis** — l'abstraction
  (`esignature/types.ts`) existe et est testée, mais aucun fournisseur
  réel (DocuSign, Yousign...) n'est encore branché ; feature commerciale,
  pas un manque de sécurité.
- **Cache Redis** pour les lectures fréquentes (tableaux de bord,
  résolution de configuration) — optimisation de passage à l'échelle, pas
  un prérequis fonctionnel.
- **Runbook de rollback de migration** — les migrations Prisma
  s'appliquent proprement (vérifié à chaque étape de la v0.10 sur une
  base fraîche), mais aucune procédure écrite de retour arrière
  n'existe encore pour un incident en production.

## Recommandation avant ouverture publique (v1.0)

Cette revue a été menée en interne, par la même équipe qui a implémenté le
code. Avant une ouverture SaaS publique avec des données clients réelles
(v1.0, `MOD-18`/`MOD-19`), une **revue de sécurité externe indépendante**
(pentest ou audit de code par un tiers) reste recommandée — voir le
rapport « Go / No Go v1.0 » pour la liste complète des tâches restantes et
leur priorisation.
