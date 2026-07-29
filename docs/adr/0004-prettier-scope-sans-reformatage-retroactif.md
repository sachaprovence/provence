# ADR 0004 — Prettier adopté sans reformatage rétroactif du code métier existant

- **Date** : 2026-07-29
- **Statut** : accepté

## Contexte

L'introduction de Prettier a d'abord été testée avec un `prettier --write .`
sur tout le dépôt. Résultat : un diff touchant environ 80 fichiers,
dont des fichiers métier (`src/app/(app)/**`, `src/components/**`,
`src/lib/scoring.ts`, `src/lib/sequence-engine.ts`...), le script de seed
de démonstration (`prisma/seed.ts`, diff de plus de 400 lignes), et même le
site vitrine statique `provence360-squarespace/` (hors périmètre
applicatif). Cette phase de travail a explicitement pour consigne de ne
pas toucher aux modules métier existants (CRM, devis, IA, séquences).

## Décision

- Prettier est configuré (`.prettierrc.json`, `.prettierignore`) et
  fonctionnel via `npm run format` / `npm run format:check`, scopés à
  `src/**/*.{ts,tsx,css}` et `tests/**/*.{ts,mjs}`.
- Les fichiers **nouvellement créés** dans cette phase (`src/lib/env.ts`,
  `src/lib/logger.ts`, `src/lib/errors.ts`, `src/components/ui/**`, pages
  d'erreur/chargement, pages d'authentification modifiées) sont
  intégralement formatés.
- Le reste du code métier existant (non touché par cette phase) **n'est
  pas reformaté rétroactivement** ici — `npm run format:check` échouera
  donc sur ces fichiers tant qu'un reformatage dédié n'aura pas été fait.
- `format:check` n'est **volontairement pas** ajouté comme condition
  bloquante du pipeline CI (`.github/workflows/ci.yml`) tant que ce
  reformatage rétroactif n'a pas eu lieu — sinon la CI serait rouge dès le
  premier jour sur du code qui n'a pas changé de comportement.
- `provence360-squarespace/` et les fichiers Markdown (`*.md`) sont exclus
  du périmètre de Prettier via `.prettierignore` : ce ne sont pas des
  fichiers de code applicatif.

## Conséquences

- Le formatage automatique est réellement utilisable dès aujourd'hui pour
  tout nouveau code.
- Un reformatage complet du code métier existant reste **à planifier
  explicitement comme tâche dédiée, isolée** (un commit "chore: format
  existing codebase" ne modifiant que la forme, jamais mélangé à une PR
  fonctionnelle), avant d'ajouter `format:check` au pipeline CI bloquant.
- En attendant ce reformatage, deux styles cohabitent dans le dépôt (code
  neuf formaté, code existant non reformaté) — accepté comme état
  transitoire assumé, documenté ici plutôt que caché.

## Alternatives écartées

- **Reformater tout le dépôt maintenant** : rejetée — contredit
  directement la consigne de ne pas toucher au code métier existant dans
  cette phase, et produit un diff non revue à cette échelle.
- **Ne pas configurer Prettier du tout tant que le reformatage rétroactif
  n'est pas fait** : rejetée — prive tout de suite le nouveau code d'un
  formatage automatique fonctionnel, sans raison de l'attendre.
