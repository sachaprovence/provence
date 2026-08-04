# ADR 0043 — v1.1 : Provence 360 Production — modèle Contact, stockage de fichiers, communication réelle, UX (MOD-29)

- **Date** : 2026-08-04
- **Statut** : accepté

## Contexte

`v1.0` a clos la roadmap initiale (`MOD-00` à `MOD-19`). Le fondateur de
Provence 360 a explicitement changé la philosophie du projet : Autorun
n'est plus développé comme un SaaS générique mais comme le logiciel
métier quotidien de sa propre entreprise, avec la contrainte qu'un
prospect puisse parcourir tout son cycle de vie sans quitter l'outil.

Un audit exhaustif du code (deux revues indépendantes, une par grand
domaine) a précédé toute décision — une large partie du brief était déjà
livrée par `MOD-28` (v0.9) : catégories métier (`LeadCategory`), module
Visites 3D, devis/factures avec PDF réel, Communication Hub, Google
Calendar réel, 8 agents IA, 10 automatisations, 9 tableaux de bord. Cette
ADR documente les décisions structurantes prises pour combler les écarts
identifiés (`BACKLOG.md` §Version 1.1, `AR-0160` à `AR-0185`), pas
l'ensemble du plan.

## Décision

### Modèle `Contact` : nouvelle entité additive, `LeadContact` conservé tel quel

`LeadContact` était scopé 1:1 à un seul `Lead` — aucune personne ne
pouvait être partagée entre plusieurs fiches (gérant de plusieurs
établissements, architecte prescripteur lié à plusieurs prospects).
Décision initiale envisagée (migrer puis retirer `LeadContact`) écartée
après audit du code appelant : `lead.contacts` (relation `LeadContact`)
est lu directement dans **plus de 15 fichiers** (résolution d'email/
téléphone pour la génération de message, `sequence-engine.ts`,
`unsubscribe`, les outils de scoring/qualification, l'import CSV) —
toujours sous la forme `lead.contacts.find(c => c.email)`. Retirer ce
modèle aurait exigé de réécrire ces 15+ points d'appel pour un bénéfice
disproportionné : la plupart des fiches Provence 360 n'ont besoin que
d'UN contact opérationnel par prospect, exactement ce que `LeadContact`
fournit déjà correctement.

Décision finale, additive plutôt que remplaçante :
- **`LeadContact` reste inchangé**, continue de servir la résolution
  d'email/téléphone opérationnelle pour la messagerie/les séquences/le
  scoring — zéro régression sur le code existant.
- **`Contact`** (nouveau, scopé organisation/workspace) représente une
  personne qui peut exister indépendamment d'un `Lead` et être liée à
  PLUSIEURS fiches. Deux tables de liaison explicites (avec vraies clés
  étrangères, pas la convention polymorphe `entityType`/`entityId` déjà
  utilisée pour `Attachment` — jugée trop faible en intégrité référentielle
  pour une notion aussi centrale) : `LeadContactRelation`
  (`Contact`↔`Lead`, rôle optionnel) et `CompanyContactRelation`
  (`Contact`↔`Company`, rôle optionnel).
- La fiche 360° (`AR-0164`) affiche les deux : le contact opérationnel
  `LeadContact` (utilisé par la messagerie) ET un panneau "Personnes
  liées" listant les `Contact` partagés, le cas échéant.

### Pipeline : garder `LeadStage` (enum fixe), ajouter un évènement de transition granulaire

Alternative écartée : redéfinir les étapes comme entièrement libres par
organisation. Écartée parce que `LeadStage` (15 valeurs) est déjà la clé
de nombreux points d'automatisation existants (`REAL_EMISSION_EVENT_KEYS`,
règles de scoring, séquences) — une refonte en étapes libres aurait
cassé ce câblage sans bénéfice proportionné, pour un brief qui demande un
vocabulaire adapté à Provence 360, pas une personnalisation arbitraire
par future organisation cliente (`PipelineStage.label` couvre déjà ce
besoin). Décision : republier les intitulés par défaut de `PipelineStage`
pour refléter le vocabulaire du brief, et ajouter un évènement
`lead.stage_changed` (`{leadId, previousStage, newStage}`) en complément
du `lead.updated` générique déjà publié, pour que les automatisations
réagissent à une transition précise sans revérifier l'état elles-mêmes.

### Stockage de fichiers : abstraction `StorageProvider`, démo = système de fichiers local, réel = objet compatible S3 via URL présignée (sans SDK)

`Attachment.url` suppose aujourd'hui un fichier déjà hébergé ailleurs —
aucun mécanisme d'upload réel n'existe. Plutôt qu'un champ `url` resté
manuel, création d'une abstraction `StorageProvider`
(`src/lib/storage/types.ts`), même patron que toutes les autres couches
d'abstraction fournisseur du projet (IA/email/facturation/communication) :
- **`DemoStorageProvider`** (par défaut) : écrit sur le système de
  fichiers local du serveur (répertoire configurable), servi par une
  route Next.js dédiée — fonctionne sans aucune configuration externe,
  cohérent avec le principe "the whole app runs without any external API
  keys".
- **`S3StorageProvider`** (réel, `STORAGE_PROVIDER=s3`) : upload direct
  côté client via URL présignée PUT, signature AWS SigV4 calculée
  manuellement (HMAC-SHA256 chaîné, algorithme standard et documenté,
  ~100 lignes) plutôt que d'ajouter le SDK `aws-sdk`/`@aws-sdk/client-s3`
  (lourd, nombreuses dépendances transitives) — même raisonnement que
  Stripe (ADR 0042) et Sentry/Gmail/Outlook (ADR 0038/0040) : ce projet
  préfère `fetch()` + un algorithme de signature documenté à un SDK
  officiel quand l'API cible est une REST API stable et bien documentée.
  Compatible avec AWS S3 et toute alternative compatible (MinIO,
  Cloudflare R2, Scaleway...), sans lock-in à un fournisseur.

### Communication réelle : Twilio pour SMS/WhatsApp/Téléphone (un seul compte, une seule convention d'authentification)

Les trois canaux du Communication Hub restaient des stubs (`sms-demo-
provider.ts`, `whatsapp-demo-provider.ts`, `phone-demo-provider.ts`,
aucun appel réseau). Décision de choisir Twilio plutôt que trois
fournisseurs séparés par canal (ex. un fournisseur SMS français +
l'API WhatsApp Business de Meta directement + un fournisseur voix
distinct) : Twilio couvre les trois besoins (SMS, WhatsApp Business
via son intégration, appel sortant via son API Voice/TwiML) sous UN
SEUL compte et UNE SEULE convention d'authentification (Basic Auth
Account SID/Auth Token), ce qui réduit la surface de configuration pour
l'utilisateur final (Provence 360) et le nombre d'abstractions à
maintenir. Implémentation via `fetch()` + corps
`application/x-www-form-urlencoded` (API REST Twilio, pas de SDK),
cohérent avec la convention déjà établie du projet.

### Sélection du fournisseur de communication : par organisation (via `Integration`), pas seulement par variable d'environnement globale

`getEmailProvider()` et la résolution de canal du hub ne lisaient
jusqu'ici qu'une variable d'environnement globale au déploiement —
incompatible avec le modèle SaaS multi-tenant déjà construit en `v1.0`
(deux organisations d'une même instance ne peuvent pas avoir des
fournisseurs différents). Décision d'étendre la résolution pour
privilégier la configuration `Integration` de l'organisation (déjà
utilisée pour stocker la config des canaux, secrets masqués depuis
`AR-0154`) quand elle existe et est connectée, avec repli sur la
variable d'environnement globale puis sur le démo — jamais de rupture du
mode démo par défaut.

### UX : `cmdk` et `@dnd-kit/core` comme nouvelles dépendances, dark mode sans nouvelle dépendance

Deux nouvelles dépendances légères, chacune justifiée individuellement
plutôt que par principe :
- **`cmdk`** (palette de commandes) : aucune réimplémentation maison
  raisonnable n'offrirait la même qualité d'accessibilité clavier/
  filtrage flou pour un coût de développement comparable — lib
  largement utilisée (Linear, Vercel, GitHub Copilot Chat), sans
  dépendance transitive lourde.
- **`@dnd-kit/core`** (glisser-déposer sur le Kanban) : le canvas de
  l'éditeur de workflows (`workflow-graph-canvas.tsx`) reste
  volontairement à la main (`onMouseDown`/`onMouseMove`) parce qu'il
  s'agit d'un placement libre en 2D avec des contraintes de rendu très
  spécifiques (courbes de connexion). Un Kanban est un problème
  différent (réordonnancement dans une liste, déplacement entre
  colonnes, accessibilité clavier, performance sur de longues listes) où
  une librairie mûre est structurellement mieux adaptée qu'une
  réimplémentation partielle.
- **Mode sombre** : aucune nouvelle dépendance — l'infrastructure de
  variables CSS (`src/app/globals.css`) existe déjà comme base de
  theming, il ne manque que les valeurs sombres et un
  `ThemeProvider` (React Context + `localStorage`, ~30 lignes).

## Conséquences

- `Contact` et `LeadContact` coexistent durablement, avec des rôles
  différents et non ambigus (`LeadContact` = contact opérationnel de
  messagerie, `Contact` = personne partageable entre fiches) — documenté
  ici pour qu'un futur changement ne les confonde pas.
- L'ajout d'un `StorageProvider` réel introduit une nouvelle catégorie de
  secret à gérer par organisation (identifiants S3) — suit exactement le
  même patron de masquage que les secrets `Integration` existants
  (`AR-0154`).
- Le choix de Twilio engage Provence 360 vers ce fournisseur pour SMS/
  WhatsApp/téléphone — l'abstraction `CommunicationProvider` reste en
  place, un futur fournisseur alternatif reste substituable sans
  réécriture du Hub.

## Alternatives écartées

- **Pipeline entièrement personnalisable (étapes libres par
  organisation)** : écartée — casserait le câblage existant des
  automatisations sur `LeadStage` pour un besoin (vocabulaire adapté à UN
  vertical) que `PipelineStage.label` couvre déjà.
- **Migrer `LeadContact` vers `Contact` puis retirer `LeadContact`**
  (décision initialement envisagée) : écartée après audit du code
  appelant — plus de 15 fichiers lisent `lead.contacts` directement pour
  la résolution d'email/téléphone opérationnelle (messagerie,
  `sequence-engine.ts`, désinscription, scoring). Réécrire ces 15+
  points d'appel pour un bénéfice (partage de contact entre fiches) que
  la majorité des fiches Provence 360 n'utilisera pas immédiatement
  aurait été une prise de risque disproportionnée pour "zéro
  régression" — contraire à l'esprit de l'exigence de non-régression,
  même si l'exigence "élimine la dette technique évitable" pouvait
  suggérer le contraire : ici, la dette (deux modèles à rôles distincts
  et non ambigus) reste inférieure au risque d'une réécriture large.
- **SDK `aws-sdk`/`@aws-sdk/client-s3` pour le stockage réel** : écarté —
  même raisonnement que pour Stripe/Sentry/Gmail/Outlook, une signature
  SigV4 calculée à la main est un algorithme standard et documenté, pas
  une raison suffisante pour une dépendance lourde.
- **Trois fournisseurs de communication séparés (SMS/WhatsApp/voix)** :
  écarté au profit de Twilio seul — réduit la surface de configuration
  pour l'utilisateur final sans sacrifier la possibilité de substituer un
  autre fournisseur plus tard (l'abstraction reste par canal).
- **Réimplémenter le glisser-déposer du Kanban à la main (comme le
  canvas de workflows)** : écarté — les contraintes (réordonnancement de
  liste, accessibilité, performance) sont suffisamment différentes du
  canvas 2D libre pour justifier une librairie dédiée plutôt qu'un
  copier-coller du patron existant.
