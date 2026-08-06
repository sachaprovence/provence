# Guide d'installation (moins de 10 minutes, sans écrire de code)

Ce guide couvre uniquement l'installation et le premier lancement. Pour la
suite (utiliser l'application), voir [USER_GUIDE.md](./USER_GUIDE.md).

Deux voies possibles — Docker (recommandée si Docker est déjà installé) ou
installation locale. Les deux tiennent en moins de 10 étapes et ne
nécessitent aucune clé API ni service payant : tout fonctionne en mode
démonstration dès le premier lancement.

## Voie A — Docker (5 étapes)

Prérequis : Docker et Docker Compose installés.

1. `git clone <url-du-dépôt> provence360`
2. `cd provence360`
3. `docker compose up --build`
4. Ouvrir <http://localhost:3000>
5. `docker compose exec app npm run db:seed` (charge les comptes et données
   de démonstration — voir la table ci-dessous)

## Voie B — Installation locale, sans Docker (6 étapes)

Prérequis : Node.js ≥ 20.19, PostgreSQL ≥ 14 accessible localement.

1. `npm install`
2. `cp .env.example .env` (aucune valeur à modifier pour essayer en mode
   démo — juste adapter `DATABASE_URL` si votre PostgreSQL local n'utilise
   pas les identifiants par défaut)
3. Créer le rôle et la base : `psql -c "CREATE USER provence WITH PASSWORD 'provence' CREATEDB;"`
   puis `psql -c "CREATE DATABASE provence360 OWNER provence;"`
4. `npm run quickstart` — une seule commande qui applique les migrations,
   charge les données de démonstration (uniquement si la base est vide) et
   démarre le serveur ; jamais besoin d'enchaîner plusieurs commandes
5. Ouvrir <http://localhost:3000>
6. Se connecter avec un des [comptes de démonstration](#comptes-de-démonstration)

## Comptes de démonstration

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@demo.provence360.fr` | `demo12345` |
| Commercial | `commercial@demo.provence360.fr` | `demo12345` |
| Prestataire régional | `prestataire@demo.provence360.fr` | `demo12345` |

Le seed est **idempotent** : le rejouer sur une base déjà initialisée ne
duplique rien (il s'arrête dès qu'il détecte le compte admin existant).

## Et sans compte de démonstration ?

Depuis la page de connexion, **Créer un compte** permet de créer sa propre
organisation (voir [USER_GUIDE.md](./USER_GUIDE.md#créer-un-compte-et-une-organisation)).
Une fois connecté, le bouton **Découvrir Autorun** (visible sur le tableau
de bord tant qu'aucun agent personnalisé n'existe encore) provisionne en un
clic une automatisation active, un workflow actif déjà exécuté, un agent IA
personnalisé avec une première conversation, et 3 connecteurs simulés — de
quoi explorer toutes les fonctionnalités sans rien configurer manuellement.
Voir [USER_GUIDE.md](./USER_GUIDE.md#découvrir-autorun-mode-démo-en-un-clic).

## En cas de blocage

Voir [TROUBLESHOOTING.md](./TROUBLESHOOTING.md). Les erreurs les plus
fréquentes à l'installation :

- **`npm run quickstart` échoue sur les migrations** — vérifier que
  PostgreSQL est démarré et que `DATABASE_URL` (`.env`) pointe vers une
  base accessible (`psql "$DATABASE_URL" -c '\q'` doit réussir sans
  erreur).
- **Port 3000 déjà utilisé** — arrêter le processus qui l'occupe, ou lancer
  `PORT=3001 npm run dev` puis ouvrir <http://localhost:3001>.
- **`GET /api/health/ready` renvoie une erreur** — reprend les mêmes
  vérifications (base de données, migrations, configuration) ; le message
  détaillé indique laquelle a échoué.
