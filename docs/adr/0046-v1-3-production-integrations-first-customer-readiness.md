# ADR 0046 — v1.3 : Production Integrations & First Customer Readiness

- **Statut** : Acceptée
- **Date** : 2026-08-04
- **Portée** : décisions d'implémentation transverses à AR-0172–AR-0177 (branche `claude/autorun-v1.3-production-readiness`, base : `main` après fusion de la PR #10 / v1.2).

## Contexte

v1.3 vise à faire passer Autorun de « prêt pour la préproduction » (v1.2) à
« prêt pour un premier client réel ». Deux décisions bloquantes ont été
posées à l'opérateur avant de démarrer (voir historique de session) :

1. **Base de la branche v1.3** : la PR #10 (v1.2) était encore ouverte sur
   `main` au moment de la demande v1.3, alors que v1.3 s'appuie explicitement
   sur les livrables v1.2 (diagnostics d'intégration AR-0165, sauvegarde/
   restauration AR-0166, etc.). Réponse retenue : **fusionner la PR #10
   d'abord, puis créer `claude/autorun-v1.3-production-readiness` depuis
   `main`** — évite de développer v1.3 contre une base qui ne contiendrait
   pas les fondations dont elle dépend, et évite toute ambiguïté sur ce que
   « compatibilité ascendante » et « tests existants au vert » signifient.
2. **AR-0172 (validation contre des comptes réels)** : aucun identifiant
   Stripe/Gmail/Outlook/Twilio de test, ni bucket S3 réel, n'existe dans cet
   environnement. Un jeu de clés AWS était présent dans l'environnement
   shell ambiant, mais rien n'indiquait qu'il était destiné à ce test S3 —
   utiliser des identifiants trouvés sans confirmation explicite de
   l'opérateur aurait outrepassé le périmètre de la tâche. Réponse retenue :
   **ne pas valider contre de vrais comptes ; construire uniquement l'outillage
   de preuve**, qui rapporte honnêtement l'état réel (`NOT_CONFIGURED` tant
   qu'aucun identifiant n'est fourni) plutôt que de simuler un succès.

## Décision — AR-0172 : outillage de preuve de validation des intégrations

- **Réutilisation directe des fournisseurs de diagnostic AR-0165**
  (`src/lib/diagnostics/providers/{stripe,twilio,gmail,outlook,s3}-diagnostic.ts`)
  plutôt que d'écrire une seconde logique de vérification : ce sont déjà les
  seules implémentations bas-privilège, en lecture seule, testées, qui
  encapsulent la connaissance de « comment vérifier chaque intégration sans
  effet de bord ».
- **Contournement volontaire de `integration-diagnostics-service.ts`** : cet
  orchestrateur applique une limitation de débit (5 tests / intégration /
  organisation / 5 min) et persiste chaque résultat dans
  `IntegrationDiagnosticCheck`, conçu pour une action ponctuelle déclenchée
  par un utilisateur humain depuis l'écran de diagnostic. Un outil d'audit/
  recette qui s'exécute pour produire une preuve documentaire n'est pas cet
  acteur : l'exécuter au travers de l'orchestrateur pollueriez la table
  d'audit avec des exécutions n'ayant aucun utilisateur réel associé, et
  risquerait de consommer le quota de débit destiné aux vrais opérateurs.
  Le script (`scripts/validate-integrations.ts`) appelle donc directement
  chaque fournisseur.
- **Séparation script CLI / logique testable** (convention déjà établie en
  v1.2, ex. `scripts/backup-database.ts` + `scripts/lib/db-backup.ts`) :
  la logique sans effet de bord (`evaluateProvider`, `renderMarkdown`,
  `ProviderEvidence`) vit dans `scripts/lib/integration-validation.ts`, sans
  aucun `main()` invoqué au chargement du module — donc importable en toute
  sécurité depuis les tests. Le point d'entrée CLI
  (`scripts/validate-integrations.ts`) ne fait qu'orchestrer l'exécution,
  l'écriture des fichiers de sortie, et `process.exit` en cas d'erreur.
- **Aucune preuve fabriquée** : `ProviderEvidence.realAccountValidated` est
  typé littéralement `false` (jamais `boolean`) — impossible de le faire
  passer à `true` par erreur tant qu'un opérateur humain n'a pas fourni de
  vrais identifiants et modifié le script en conséquence. Le rapport
  Markdown généré (`docs/release/integration-validation-evidence-v1.3.md`)
  affiche un bandeau d'avertissement explicite si aucune intégration n'est
  validée contre un compte réel — jamais un tableau silencieusement vert.
- **Sortie double** : Markdown (lecture humaine, recette) + JSON
  (`docs/release/integration-validation-evidence-v1.3.json`, exploitable par
  un futur pipeline d'audit automatisé).
- **`npm run integrations:validate`** ajouté, avec le même hook
  `NODE_OPTIONS=--require=./prisma/seed-server-only-cjs-hook.cjs` déjà utilisé
  par `db:seed` et `test:migrations:fresh` : les fournisseurs de diagnostic
  importent des modules marqués `import "server-only"` (protection Next.js
  Server Component), incompatible avec l'exécution CommonJS de `tsx` en
  dehors du framework Next.js sans ce patch de résolution de module.

## Conséquences

- Prembattre l'exécution réelle du script contre l'environnement de
  développement (aucun identifiant configuré) produit honnêtement 5×
  `NOT_CONFIGURED` — attendu, et documenté comme tel dans le rapport final
  v1.3 : **AR-0172 reste une action opérateur non complétée**, pas une case
  cochée par erreur.
- Quand l'opérateur fournira de vrais identifiants de test (Stripe test
  mode, comptes Google/Microsoft de test, bucket S3 réel, compte Twilio de
  test), il suffit de réexécuter `npm run integrations:validate` : aucune
  modification de code n'est nécessaire, les fournisseurs AR-0165
  détecteront automatiquement `CONFIGURED` et déclencheront le test réel.
