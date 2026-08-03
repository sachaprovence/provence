# ADR 0033 — Circuit Breaker persisté (jamais en mémoire), cohérent entre plusieurs processus

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief demande un Retry Engine avancé incluant un Circuit Breaker :
couper temporairement les tentatives sur un périmètre donné (un type de job
en particulier) après un nombre de défaillances consécutives, plutôt que de
continuer à retenter — et échouer — contre une dépendance externe en panne.
Un déploiement de ce projet peut faire tourner plusieurs instances du worker
(`processAutomationJobs`, appelé par le cron applicatif) ; un disjoncteur
tenu uniquement en mémoire d'un processus serait invisible aux autres
instances, qui continueraient à marteler la dépendance en panne.

## Décision

- **État persisté dans `AutomationCircuitBreaker`** (`key`, `state`,
  `failureCount`, `openedAt`, `resetAt`), jamais une `Map` en mémoire —
  cohérent entre toutes les instances qui exécutent
  `processAutomationJobs`.
- **Trois états classiques** : `CLOSED` (fonctionnement normal) → `OPEN`
  (bloque toute tentative jusqu'à `resetAt`) → `HALF_OPEN` (laisse passer
  UN essai à titre de test dès que `resetAt` est atteint ; un succès
  referme le disjoncteur — `recordCircuitSuccess` remet `failureCount` à
  zéro —, un échec le rouvre).
- **Clé par périmètre `jobType:<clé>`** — un disjoncteur par type de job
  (ex. `jobType:sms.send`), pas par automatisation ni par tenant : un
  disjoncteur protège une DÉPENDANCE EXTERNE partagée (ex. un fournisseur
  SMS), pas les données d'une organisation. Une organisation dont les jobs
  `sms.send` échouent peut donc, en théorie, ouvrir le disjoncteur pour
  toutes les autres — compromis assumé et documenté (voir
  Alternatives écartées), cohérent avec la nature du composant (protéger
  l'infrastructure partagée, pas isoler les tenants — l'isolation
  multi-tenant reste strictement appliquée partout ailleurs : chaque
  `AutomationJob`/`AutomationRun` reste scopé `organizationId`+
  `workspaceId`).
- **Vérifié AVANT toute tentative** (`isCircuitOpen`, dans
  `executeOneJob`) : un job dont le disjoncteur est ouvert est remis en
  file avec un court délai (5 s), SANS consommer de tentative (`attempt`
  inchangé) — le disjoncteur diffère l'essai, il ne le compte jamais comme
  un échec du job lui-même.

## Conséquences

- Plusieurs instances de worker convergent vers le même comportement
  (aucune ne continue seule à marteler une dépendance dont une autre
  instance a déjà détecté la panne).
- Un test dédié (`tests/automation/retry.test.ts`, bloc "Circuit Breaker")
  couvre les trois transitions (fermé sous le seuil, ouvert au seuil,
  bloqué pendant la fenêtre, semi-ouvert après expiration, refermé après
  succès) sans dépendre du réel écoulement du temps (`resetTimeoutMs`
  configurable par test).
- Une clé de disjoncteur GLOBALE partagée entre plusieurs suites de test
  parallèles (même clé `jobType:<x>` utilisée par deux fichiers de test
  différents) peut provoquer une fausse ouverture cumulative — leçon
  rencontrée concrètement pendant cette phase (voir
  `tests/automation/job-executor.test.ts`/`dashboard-service.test.ts`,
  commentaires "clé de disjoncteur DÉDIÉE") : chaque fichier de test qui a
  besoin d'un job systématiquement en échec utilise désormais un type de
  job DIFFÉRENT (`sms.send` vs `file.write`) pour ne jamais partager la
  même clé de disjoncteur entre workers de test parallèles.

## Alternatives écartées

- **Disjoncteur en mémoire par processus** : écarté — invisible entre
  plusieurs instances, contredirait directement l'objectif "protéger une
  dépendance externe partagée" dès qu'il y a plus d'un worker.
- **Clé de disjoncteur par tenant (`organizationId:jobType`)** : écartée
  pour cette phase — le disjoncteur protège une ressource technique
  partagée (le fournisseur externe lui-même), pas les données d'un tenant ;
  une isolation par tenant transformerait le disjoncteur en simple
  compteur d'échecs par organisation, perdant sa capacité à détecter une
  panne globale du fournisseur avant qu'elle n'affecte tout le monde.
