# ADR 0041 — v0.10 : stabilisation production, sécurité avancée (MOD-17)

- **Date** : 2026-08-03
- **Statut** : accepté

## Contexte

`v0.9 bis` (ADR 0040) a complété les briques transversales laissées de
côté après v0.9. Avant `v1.0` (ouverture SaaS publique, `MOD-18`/`MOD-19`),
le plan initial de `ROADMAP.md` prévoyait `MOD-17` comme porte
obligatoire : sécurité avancée et conformité renforcée. Plutôt que
d'implémenter directement les 4 tâches nominalement prévues (`AR-0055` à
`AR-0058`), un audit exhaustif du code (pas seulement des ADR/BACKLOG
existants) a été mené en amont par 3 revues indépendantes ciblées
(sécurité/isolation multi-tenant ; dette technique/duplication/
performance ; couverture de tests/migrations/observabilité/documentation/
CI), complété par une vérification manuelle ciblée du parcours de
réinitialisation de mot de passe.

Cette vérification manuelle a révélé le constat le plus sévère de toute
la revue — une faille non anticipée par le plan initial de `MOD-17` :
`POST /api/auth/reset-password/request` renvoyait **toujours**
`demoResetLink` en clair dans sa réponse JSON, même avec un fournisseur
email réel configuré, sans jamais envoyer de vrai email. N'importe qui
connaissant l'adresse email d'un compte pouvait ainsi récupérer un lien
de réinitialisation valide directement dans la réponse HTTP — prise de
contrôle de compte triviale en production. Cette découverte a changé la
portée de `v0.10` : au lieu des seules 4 tâches nominales, `v0.10` corrige
l'ensemble des constats P0 de l'audit (9 tâches au total, voir
`BACKLOG.md` §Version 0.10).

## Décision

### Faille de réinitialisation de mot de passe : ne jamais renvoyer de lien en clair hors du mode démo

`src/app/api/auth/reset-password/request/route.ts` envoie désormais
réellement l'email via `getEmailProvider().send(...)` quand un
fournisseur réel est actif ; `demoResetLink` n'est renvoyé dans la réponse
API QUE si `getEmailProvider().name === "demo"`. La non-énumération des
comptes (un email inexistant renvoie la même réponse générique qu'un
email existant) était déjà correcte et est conservée dans les deux modes.
L'écran de demande affiche un message de confirmation générique quand
aucun lien démo n'est renvoyé.

### Verrouillage de compte : durable (Postgres) pour la protection critique, best-effort (mémoire) pour le débit grossier

Deux mécanismes de nature différente, choisis délibérément pour ne pas
confondre leurs garanties respectives :

- **`assertLoginNotLocked`** (`src/lib/auth.ts`) — repose sur
  `LoginEvent`, table Postgres déjà journalisée depuis v0.1 mais jamais
  relue pour bloquer un compte. Bloque après 8 échecs en 15 minutes.
  Durable et cross-instance par construction (Postgres), appropriée pour
  une protection de sécurité critique (brute-force de mot de passe).
- **`isRateLimited`** (`src/lib/security/rate-limiter.ts`) — compteur
  glissant en mémoire par processus, documenté honnêtement comme
  best-effort (perdu au redémarrage, non partagé entre instances), même
  convention que `automation/concurrency/rate-limiter.ts` (v0.8). Suffit
  pour une limitation de débit grossière sur les endpoints
  d'authentification (login/register/reset-password-request), appliquée
  dans `src/proxy.ts`.

Le Proxy Next.js 16 tourne par défaut sur le runtime Node.js — contraire à
l'ancien `middleware.ts`, limité à l'Edge Runtime (confirmé via
`node_modules/next/dist/docs/`, conformément à `AGENTS.md` : ce projet
utilise une version de Next.js aux API différentes de celles connues par
défaut). C'est ce changement qui rend possible d'appliquer le rate
limiter directement dans le Proxy plutôt que dans une route intermédiaire.

### Secret de webhook : toujours généré, jamais optionnel

Le secret des déclencheurs webhook (Workflow Engine et Automation Engine)
était optionnel (`if (configuredSecret) { ... }`) — un déclencheur créé
sans secret restait ouvert à quiconque devine `workspaceId` +
`workflowKey`/`automationKey`. Décision : générer le secret
automatiquement, côté serveur, de façon transparente pour l'utilisateur,
plutôt que d'exiger une configuration manuelle en UI — `
ensureWebhookTriggerConfig` (`src/lib/security/webhook-secret.ts`) est
appelée à chaque (ré)indexation des liaisons de déclencheur dans les deux
moteurs. Une migration de rattrapage backfill le secret des liaisons
existantes (`gen_random_uuid()` concaténé deux fois, sans dépendre de
l'extension `pgcrypto`, jamais utilisée ailleurs dans ce projet). Les deux
routes webhook exigent désormais TOUJOURS une correspondance
(`timingSafeStringEqual`), sans branche de contournement.

### Quota email dur : généraliser le patron déjà établi pour le quota IA, pas une nouvelle abstraction

`Organization.dailySendLimit`/`EmailAccount.dailyLimit` bloquaient déjà
les envois dans `sequence-engine.ts`, mais l'action `email.send` de
l'Automation Engine et du Workflow Engine appelait `getEmailProvider()`
directement — aucune vérification de quota, envoi illimité possible via
ces deux points d'entrée. Plutôt qu'une nouvelle abstraction, décision de
répliquer exactement le patron `getAIProviderForOrganization` (v0.9 bis,
ADR 0040) : `getEmailProviderForOrganization` (`src/lib/email/index.ts`)
vérifie le quota (`assertEmailQuotaAvailable`, `src/lib/email/quota.ts`)
avant de retourner le fournisseur. `sequence-engine.ts` garde son appel
direct à `assertEmailQuotaAvailable` (pas le wrapper) pour préserver ses
effets de bord spécifiques en cas de dépassement (marquer le `Message`
`FAILED`, créer un `EmailEvent` avec `reason: "daily_limit_reached"`) —
un `try/catch` explicite, pas une propagation générique de l'erreur.

### Préparation 2FA : schéma et TOTP fonctionnel, sans dépendance externe, sans activation forcée

`MOD-17` demande de préparer (pas nécessairement d'imposer) le 2FA.
Décision : implémenter TOTP (RFC 6238, HMAC-SHA1) directement
(`src/lib/two-factor.ts`, ~130 lignes : encodage base32, HOTP, vérification
avec tolérance de dérive d'horloge d'un pas) plutôt que d'ajouter une
dépendance npm pour un algorithme standard et de taille réduite — testé
contre le vecteur de test officiel RFC 4226 Annexe D pour garantir la
conformité au standard plutôt qu'une simple cohérence interne.
`User.twoFactorSecret`/`twoFactorEnabled` : le cycle
inscription (`startTwoFactorEnrollment`) → confirmation par un code réel
(`confirmTwoFactorEnrollment`) → désactivation (`disableTwoFactor`) est
complet, mais `src/lib/auth.ts` ne consulte jamais `twoFactorEnabled` à la
connexion — l'activation effective à la connexion reste un chantier
post-`v1.0` explicitement hors périmètre.

### Extension de la couverture de tests : cibler les domaines financiers et porteurs de secrets, pas une couverture uniforme

`tests/tenant-isolation/` ne couvrait que 8 domaines sur une trentaine
réels. Plutôt qu'une extension à tous les domaines indistinctement,
priorisation des domaines financiers (factures, devis, rendez-vous) et
porteurs de secrets (automatisations, Communication Hub, email,
calendrier) — les zones où une future régression silencieuse aurait le
plus de conséquences. Pour les domaines sans fonction service scopée
acteur (`Quote`, `Appointment`, `Integration`), les tests reproduisent
exactement le filtrage `organizationId` déjà utilisé par les routes
réelles plutôt que d'introduire une nouvelle abstraction non demandée.

De même, `sequence-engine.ts` (moteur de relance email central, consommé
par 9 routes), `suppression.ts` (liste de suppression RGPD/CAN-SPAM) et
`unsubscribe-token.ts` (jeton public de désinscription) n'avaient aucun
test malgré leur exposition à un trafic non authentifié ou leurs
obligations de conformité — comblé par des tests d'intégration réels
(pas de mock du comportement métier), y compris un test de progression et
de complétion d'une séquence de bout en bout.

### CI E2E : les 3 suites sur chaque pull request, pas seulement après merge

`.github/workflows/e2e.yml` ne se déclenchait que sur `push: [main]` et
n'exécutait que `golden-path.mjs` — `two-organizations-isolation.mjs` et
`automation-golden-path.mjs` ne tournaient jamais en CI. Ajout du
déclencheur `pull_request` et des deux scripts manquants dans le même
job. Validé manuellement contre le build de cette branche (base fraîche,
seed propre) : les 3 suites passent de bout en bout avec l'ensemble des
changements de sécurité de v0.10.

## Conséquences

- Toute organisation existante conserve son comportement d'envoi email
  inchangé tant qu'elle ne dépasse pas son quota (comportement additif,
  pas de régression).
- Tout déclencheur webhook existant sans secret en reçoit désormais un
  automatiquement (migration de rattrapage) — aucune action manuelle
  requise, mais toute intégration externe qui appelait un webhook SANS
  fournir de secret doit désormais être mise à jour pour envoyer
  `X-Webhook-Secret` (rupture volontaire et nécessaire : c'était la
  faille corrigée).
- Le 2FA reste optionnel et non forcé — aucun utilisateur existant n'est
  affecté tant qu'il ne s'inscrit pas explicitement.
- `docs/security/owasp-review-2026-08-03.md` consolide les constats P1/P2
  non transformés en tâches, avec justification de leur report — sert de
  référence pour les futures versions post-`v1.0`.

## Alternatives écartées

- **Exiger le secret webhook en configuration manuelle en UI** (`AR-0156`)
  : écarté — aurait cassé tous les workflows/automatisations existants
  utilisant un webhook tant que l'utilisateur n'aurait pas configuré le
  secret manuellement ; la génération automatique corrige la faille sans
  aucune action requise et sans régression fonctionnelle.
- **Ajouter une dépendance npm (`otplib`/`speakeasy`) pour le 2FA**
  (`AR-0058`) : écartée — TOTP est un algorithme standard, de taille
  réduite (RFC 6238 implémenté en ~130 lignes), et une implémentation
  interne testée contre le vecteur RFC 4226 officiel offre le même niveau
  de confiance sans dépendance supplémentaire à maintenir.
- **Limitation de débit distribuée (Redis) dès v0.10** (`AR-0155`) :
  écartée — aucune infrastructure Redis n'existe encore dans le projet ;
  une protection best-effort en mémoire, honnêtement documentée comme
  telle, suffit en complément du verrouillage durable (Postgres) qui
  porte la garantie de sécurité réelle. Réévaluer si un déploiement
  multi-instance devient la norme.
- **Étendre `tests/tenant-isolation/` aux ~15 domaines restants d'un coup**
  (`AR-0055`) : écartée au profit d'une priorisation par risque (financier
  + secrets d'abord) — les domaines restants (moins sensibles) peuvent
  être ajoutés au fil de l'eau sans bloquer `v1.0`.
- **Revue de sécurité externe avant v0.10** : écartée pour cette phase
  (délai/coût) — mais explicitement recommandée avant l'ouverture SaaS
  publique (`v1.0`, `MOD-19`) dans le rapport OWASP.
