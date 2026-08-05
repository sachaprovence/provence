# Revue de sécurité v1.3 — 2026-08-04 (AR-0176)

Complète (ne remplace pas) `docs/security/owasp-review-2026-08-03.md`
(v0.10) — cette revue vérifie que les changements v1.1/v1.2/v1.3 n'ont
introduit aucune régression, et ferme deux constats P1 restés ouverts
depuis v0.10.

## 1. Revue des dépendances

```
npm audit
> found 0 vulnerabilities
```

Confirme l'état déjà atteint en v1.2 (AR-0170, `npm-audit-v1.2-2026-08-04.md`)
— aucune nouvelle vulnérabilité introduite par les dépendances ajoutées en
v1.3 (aucune nouvelle dépendance de production ajoutée ; `@types/*`
inchangés).

## 2. Revue des en-têtes de sécurité HTTP

- **v1.2** (AR-0169) : `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`,
  `X-Powered-By` désactivé — inchangés, toujours vérifiés par
  `tests/security/http-headers.test.ts`.
- **v1.3** (AR-0173) : `Content-Security-Policy` par nonce, différée en
  v1.2 faute de vérification page par page — désormais en place
  (`src/lib/security/csp.ts`, `src/proxy.ts`), vérifiée par
  `tests/security/csp.test.ts` ET empiriquement par les 4 suites E2E
  (zéro violation CSP constatée).

## 3. Revue OWASP — constats P1 de la v0.10 fermés en v1.3

| Constat (v0.10) | Statut | Détail |
|---|---|---|
| Aucun scan de secrets automatisé en CI | ✅ Fermé (AR-0176) | `scripts/scan-secrets.ts` + `scripts/lib/secret-scan.ts` (testés, `tests/scripts/secret-scan.test.ts`), câblé dans `.github/workflows/ci.yml` sur chaque PR. Exécuté manuellement sur l'état actuel du dépôt : 0 correspondance. |
| Comparaison non constante (`!==`) pour `CRON_SECRET` dans les 5 (en réalité 7) routes `/api/cron/*` | ✅ Fermé (AR-0176) | Extrait en `isValidCronRequest()` (`src/lib/security/webhook-secret.ts`), utilise `timingSafeStringEqual` (déjà en place pour les secrets de webhook, AR-0156). Les 7 routes migrées, testées (`tests/security/webhook-secret.test.ts`). |

Aucun nouveau constat P0/P1 identifié sur le périmètre v1.1-v1.3 lors de
cette revue (voir méthodologie ci-dessous).

## 4. Audit des permissions (isolation multi-tenant)

Le retrofit `X-Request-Id` (AR-0173, ~160 sites d'appel modifiés par
codemod AST) et l'extension CSP (AR-0173, layout racine devenu asynchrone)
sont les deux changements v1.3 avec la plus grande surface de fichiers
touchés — risque principal identifié avant la revue : une régression
accidentelle d'un contrôle d'autorisation lors d'une modification purement
mécanique à cette échelle.

**Vérification** : le codemod ne touche QUE la signature de fonction (ajout/
renommage du paramètre `request`) et l'appel à `toApiErrorResponse` (ajout
d'un argument) — jamais une ligne de logique métier ou de contrôle
d'accès. Confirmé par :
- `npx tsc --noEmit` : 0 erreur sur l'ensemble des ~190 fichiers de routes.
- La suite complète `tests/tenant-isolation/**` (isolation par organisation
  sur une trentaine de domaines, v0.10 AR-0055) : verte, sans modification.
- `tests/e2e/two-organizations-isolation.mjs` : verte — deux organisations
  distinctes, vérification directe qu'une tentative de falsification d'id
  d'une ressource d'une autre organisation échoue (404, jamais de fuite).

Aucune régression détectée.

## 5. Revue de la limitation de débit (rate limiting)

Mécanismes existants, vérifiés toujours en place et non modifiés par
inadvertance lors des changements v1.3 :
- `src/proxy.ts` : limitation par IP sur `/api/auth/{login,register,
  reset-password/request}` (v0.10, AR-0155).
- `src/lib/rate-limit.ts` : quota de débit sur l'API publique v1 (v1.0,
  AR-0060).
- `src/lib/security/rate-limiter.ts` : limitation des tests de diagnostic
  d'intégration (v1.2, AR-0165, 5 tests/intégration/organisation/5 min).
- Secrets de webhook obligatoires (v0.10, AR-0156) et désormais secret de
  cron à comparaison constante (v1.3, AR-0176, §3 ci-dessus) — pas des
  limiteurs de débit au sens strict, mais la même famille de contrôle
  d'accès aux points d'entrée non interactifs.

Aucun changement requis — confirmé intact par la suite de tests complète
(844 tests, voir rapport de validation finale v1.3).

## Méthodologie

Revue ciblée sur le delta v1.1 → v1.3 (pas une reprise intégrale de la
méthodologie v0.10, déjà exhaustive sur le périmètre alors existant) :
relecture des constats P1/P2 encore ouverts de `owasp-review-2026-08-03.md`
pour identifier lesquels sont raisonnablement fermables dans le périmètre
v1.3 (deux l'étaient, voir §3) ; recherche de secrets sur l'ensemble du
dépôt suivi par git ; vérification que le retrofit à grande échelle
(AR-0173) n'a introduit aucune régression d'autorisation.
