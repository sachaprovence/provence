# Sauvegarde et restauration (v1.2, AR-0166)

Ce document couvre la sauvegarde et la restauration de PostgreSQL et du
stockage de fichiers (S3), la vérification de cohérence entre les deux, et
la conduite à tenir en cas d'incident (perte/corruption de données).

**Principe directeur, appliqué à chaque script de ce document** : une
sauvegarde n'est jamais déclarée valide sur la seule foi de la commande de
sauvegarde. Chaque procédure de sauvegarde est accompagnée d'une procédure
de vérification qui restaure RÉELLEMENT le contenu (dans une base
temporaire jetable pour PostgreSQL, via un aller-retour écriture/lecture
réel sur un préfixe réservé pour S3) avant de la marquer `restoreVerified:
true`.

**Aucun script de ce document n'écrit ni ne supprime jamais dans la base
de données applicative réelle, ni dans les clés S3 réelles d'une
organisation.** La restauration "en place" (écraser des données réelles)
est une opération manuelle décrite en fin de document, jamais automatisée.

## 1. Sauvegarde PostgreSQL

**Script** : `scripts/backup-database.ts` (`npm run backup:db`)

**Prérequis** : `pg_dump` installé et dans le `PATH` (déjà présent dans
l'image Docker de production, voir `Dockerfile`), `DATABASE_URL` valide.

**Commande** :

```bash
npm run backup:db -- ./backups
# ou : BACKUP_DIR=./backups npx tsx scripts/backup-database.ts
```

**Ce que fait le script** : `pg_dump --format=custom` (format
compressé, compatible restauration sélective table par table), écrit
`<base>_<horodatage>.dump` et `<même fichier>.meta.json` (taille,
empreinte SHA-256, version de `pg_dump`, `restoreVerified: false`).

**Risques** : `pg_dump` verrouille brièvement le catalogue système mais
n'interrompt pas les écritures en cours (mode cohérent MVCC standard de
PostgreSQL) — sûr à exécuter sur une base en production sous charge
normale. Un espace disque insuffisant fait échouer `pg_dump` explicitement
(le script refuse un fichier vide ou absent, jamais un succès simulé).

**Critère de succès** : le script affiche `✅ Sauvegarde créée` avec une
taille non nulle. **Ceci ne suffit PAS à déclarer la sauvegarde valide —
passer impérativement à l'étape 2.**

## 2. Vérification de sauvegarde PostgreSQL (restauration réelle)

**Script** : `scripts/verify-database-backup.ts` (`npm run backup:db:verify`)

**Prérequis** : `pg_restore` installé, accès admin au même serveur
PostgreSQL que `DATABASE_URL` (création/suppression de base temporaire —
jamais la base applicative réelle, voir garde-fous ci-dessous).

**Commande** :

```bash
npm run backup:db:verify -- ./backups/provence360_2026-08-04T18-02-36-950Z.dump
```

**Ce que fait le script** :
1. Vérifie l'empreinte SHA-256 du fichier contre `<fichier>.meta.json` —
   refuse immédiatement (sans tenter de restaurer) un fichier altéré/tronqué.
2. Crée une base temporaire au nom imprévisible
   (`autorun_migtest_<horodatage>_<hex aléatoire>`), revalidée par
   `assertSafeTempDbName` (même garde-fou que AR-0163) avant sa création
   ET avant sa suppression — refuse toute correspondance avec le nom de la
   base applicative réelle.
3. Restaure RÉELLEMENT le fichier dans cette base temporaire (`pg_restore`).
4. Vérifie structurellement : nombre de migrations Prisma appliquées
   (doit être ≥ au nombre de dossiers dans `prisma/migrations/` du dépôt —
   refuse une sauvegarde partielle/périmée), et l'accessibilité des tables
   essentielles (`Organization`, `User`).
5. Supprime la base temporaire (bloc `finally` — toujours exécuté, même en
   cas d'échec).
6. En cas de succès uniquement : met à jour `<fichier>.meta.json` avec
   `restoreVerified: true` et `restoreVerifiedAt`.

**Risques** : aucun sur la base applicative réelle (jamais touchée). Un
`pg_restore` peut échouer avec un code non nul pour des avertissements
bénins (extensions/rôles absents de la base temporaire) — le script ne se
fie jamais au seul code de sortie, la preuve réelle est la vérification
structurelle qui suit.

**Critère de succès** : `✅ Restauration réussie et contenu vérifié —
sauvegarde déclarée valide.` **Une sauvegarde dont `restoreVerified` n'est
pas `true` dans son fichier `.meta.json` ne doit jamais être considérée
exploitable pour une restauration réelle.**

## 3. Sauvegarde des objets S3

**Script** : `scripts/backup-s3-objects.ts` (`npm run backup:s3`)

**Prérequis** : `STORAGE_PROVIDER=s3` et les variables `STORAGE_S3_*`
configurées (voir `.env.example`). Sans ces variables, le script échoue
explicitement — le stockage démo (filesystem local) n'est PAS couvert par
ce script (voir §5, sauvegarde par copie de fichiers standard).

**Commande** :

```bash
npm run backup:s3 -- ./backups/s3
```

**Ce que fait le script** : liste TOUS les objets du bucket
(`ListObjectsV2`, pagination suivie jusqu'au bout), télécharge chacun vers
`<répertoire>/<horodatage>/objects/<clé>`, écrit un manifeste
`manifest.json` (clé, empreinte SHA-256, taille, type MIME par objet,
`restoreVerified: false`).

**Risques** : lecture seule sur le bucket source. Le volume téléchargé
dépend du nombre/de la taille des pièces jointes — pour un très grand
bucket, prévoir un espace disque suffisant côté machine exécutant la
sauvegarde (pas de pagination/flux partiel : chaque objet est chargé
entièrement en mémoire avant écriture, cohérent avec la limite de taille
de fichier applicative de 20 Mo par défaut, voir AR-0164).

**Critère de succès** : `✅ Sauvegarde S3 créée` avec le nombre d'objets
attendu. **Passer impérativement à l'étape 4.**

## 4. Vérification de sauvegarde S3 (aller-retour réel)

**Script** : `scripts/verify-s3-backup.ts` (`npm run backup:s3:verify`)

**Commande** :

```bash
npm run backup:s3:verify -- ./backups/s3/2026-08-04T18-08-25-532Z/manifest.json
```

**Ce que fait le script** :
1. Sonde de connectivité : écrit/relit/supprime un petit objet de test
   sous un préfixe réservé (`__provence_backup_verify__/<horodatage>/`) —
   prouve que les identifiants et le bucket permettent réellement
   écriture + lecture, même si la sauvegarde ne contient aucun objet.
2. Pour chaque objet du manifeste : vérifie l'empreinte de la copie
   locale, l'écrit sous le MÊME préfixe réservé (jamais la clé d'origine),
   la relit, compare l'empreinte SHA-256 au manifeste.
3. Supprime systématiquement toutes les copies de vérification (bloc
   `finally`), y compris en cas d'échec en cours de route.
4. En cas de succès total uniquement : met à jour `manifest.json` avec
   `restoreVerified: true`.

**Risques** : écrit temporairement sous un préfixe réservé du bucket réel
(jamais les clés d'origine d'une organisation) — nécessite que ce préfixe
ne soit pas utilisé par ailleurs (improbable, nom explicitement réservé).
Le nettoyage final peut échouer partiellement en cas de coupure réseau en
plein milieu — dans ce cas, le script journalise l'échec de suppression
individuellement plutôt que de masquer le problème ; vérifier
manuellement l'absence d'objets résiduels sous `__provence_backup_verify__/`
si le script s'est arrêté anormalement.

**Critère de succès** : `✅ N/N objet(s) vérifié(s) par aller-retour réel
— sauvegarde déclarée valide.`

## 5. Sauvegarde du stockage démo (développement uniquement)

Le stockage démo (`STORAGE_PROVIDER=demo`, filesystem local
`storage-demo/`) n'est **jamais destiné à la production réelle** — voir
l'alerte non bloquante documentée en AR-0164
(`isProductionWithDemoStorage`). Sa sauvegarde se réduit à une copie de
fichiers standard :

```bash
tar czf storage-demo-backup-$(date +%Y%m%d).tar.gz storage-demo/
```

Aucun script dédié : la simplicité du système de fichiers local ne
justifie pas l'infrastructure de vérification par aller-retour du §3-4.

## 6. Vérification de cohérence base ↔ objets de stockage

**Script** : `scripts/check-storage-db-consistency.ts` (`npm run backup:consistency-check`)

**Prérequis** : `DATABASE_URL` valide ; `STORAGE_PROVIDER=s3` avec
`STORAGE_S3_*` configurées, ou stockage démo local.

**Commande** :

```bash
npm run backup:consistency-check
```

**Ce que fait le script** (lecture seule des deux côtés, aucune
écriture/suppression) :
- Liste toutes les `Attachment.storageKey` non nulles en base.
- Liste tous les objets réellement présents dans le stockage actif.
- Signale les **références rompues** (`Attachment.storageKey` sans objet
  correspondant — fichier perdu, pièce jointe cassée pour l'utilisateur) :
  fait échouer le script (code de sortie 1).
- Signale les **objets orphelins** (objet présent sans `Attachment`
  correspondante — upload interrompu avant la création de la ligne, ou
  suppression antérieure à AR-0164 qui ne nettoyait pas le fichier
  physique, voir ADR 0045) : informatif, ne fait PAS échouer le script.

**Critère de succès** : code de sortie 0. Un exécutable adapté à un
contrôle périodique (cron/CI) — voir §8.

**Que faire face à une référence rompue ?** Investiguer au cas par cas
(l'objet a-t-il été supprimé côté fournisseur en dehors d'Autorun ? la clé
enregistrée est-elle corrompue ?) — ce script ne supprime ni ne recrée
jamais rien automatiquement, volontairement, pour ne jamais transformer un
incident de perte de données en incident de perte de données SILENCIEUSE.

## 7. Restauration réelle (incident de production — procédure manuelle)

**Ceci n'est PAS un script automatisé — délibérément.** Restaurer une
sauvegarde "en place" écrase par définition les données actuelles de la
cible : une opération destructive qui ne doit jamais être déclenchable
sans une décision humaine explicite et un contexte d'incident réel.

### 7.1 PostgreSQL

```bash
# 1. Confirmer que la sauvegarde à restaurer est bien restoreVerified: true
cat <fichier>.meta.json | grep restoreVerified

# 2. Arrêter le trafic applicatif écrivant sur cette base (voir §7.3).

# 3. Restaurer — --clean supprime les objets existants avant recréation,
#    donc DÉFINITIVEMENT DESTRUCTIF sur la base cible. Confirmer trois fois
#    la cible avant d'exécuter.
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="<URL DE LA BASE CIBLE — jamais copier-coller sans relire>" \
  <fichier>.dump

# 4. Vérifier le contenu restauré avant de rouvrir le trafic (comparer
#    quelques comptages de lignes aux attentes, voir §6).
```

### 7.2 Objets S3 (restauration en place — écrase les objets d'origine)

Aucun script fourni intentionnellement — utiliser le manifeste de
sauvegarde (`manifest.json`, §3) pour ré-uploader chaque objet à sa clé
d'origine avec l'outil de son choix (AWS CLI, `aws s3 cp
--recursive backups/s3/<horodatage>/objects/ s3://<bucket>/`, ou la
console du fournisseur). Confirmer la cible (bucket, préfixe) avant
exécution — une restauration S3 en place écrase silencieusement tout
objet plus récent portant la même clé.

### 7.3 Ordre de restauration en cas d'incident combiné (base + stockage)

1. Restaurer PostgreSQL en premier (§7.1) — les `Attachment.storageKey`
   restaurées définissent la référence de vérité.
2. Restaurer les objets S3 (§7.2) si nécessaire.
3. Exécuter `npm run backup:consistency-check` (§6) pour confirmer
   qu'aucune référence n'est rompue après la restauration combinée.
4. Rouvrir le trafic applicatif seulement après un résultat propre.

## 8. Intégration continue

`.github/workflows/backup-restore.yml` exécute, sur chaque Pull Request
vers `main` (comme `migrations-fresh-db.yml`, AR-0163) : sauvegarde
PostgreSQL de la base de service CI (peuplée par les migrations/seeds du
job), puis vérification par restauration réelle dans une base temporaire.
La sauvegarde/vérification S3 n'est **pas** exécutée en CI (aucun bucket
S3 réel n'y est configuré, conformément à la contrainte "ne jamais
déclarer une intégration tierce validée sans un compte réel/sandbox
officiel") — testée localement contre un serveur HTTP simulant l'API S3
(voir `tests/scripts/s3-backup-client.test.ts`) et manuellement contre un
bucket réel avant la mise en production effective.

## Résumé des commandes

| Action | Commande |
|---|---|
| Sauvegarder PostgreSQL | `npm run backup:db -- <répertoire>` |
| Vérifier une sauvegarde PostgreSQL | `npm run backup:db:verify -- <fichier.dump>` |
| Sauvegarder les objets S3 | `npm run backup:s3 -- <répertoire>` |
| Vérifier une sauvegarde S3 | `npm run backup:s3:verify -- <manifest.json>` |
| Vérifier la cohérence base ↔ stockage | `npm run backup:consistency-check` |
