# Diagnostiquer les erreurs courantes

Pour un incident de production (sévérité, astreinte, procédure), voir
`docs/operations/INCIDENT_RESPONSE.md` et `docs/operations/RUNBOOK.md` —
ce guide couvre les erreurs qu'un client ou un administrateur rencontre
en usage courant.

## "Limite du plan atteinte" (erreur 429)

Message affiché quand une limite de quota est atteinte (exécutions
d'automatisation, stockage, connecteurs, membres). Voir
[PLANS_AND_QUOTAS.md](./PLANS_AND_QUOTAS.md) pour le détail des
dimensions et des seuils. Deux résolutions possibles :
- passer à un plan supérieur (`/settings/billing`, ou par un
  administrateur plateforme depuis `/admin/organizations/<id>`),
- libérer de la marge sous la limite actuelle (ex. supprimer des pièces
  jointes obsolètes pour le stockage).

Une notification d'avertissement (voir la cloche de notifications)
apparaît normalement dès 80 % d'une limite — si l'erreur 429 survient sans
avertissement préalable, vérifier que les notifications ne sont pas
filtrées par une préférence de notification désactivée pour l'évènement
concerné (`NotificationPreference`).

## Invitation d'équipe expirée ou déjà utilisée

Les invitations à un workspace expirent après 7 jours. Symptôme : le lien
d'invitation renvoie une erreur "invitation introuvable ou expirée".
Résolution : renvoyer une nouvelle invitation depuis `/users` (l'ancienne
peut être laissée expirer, aucune action de nettoyage n'est nécessaire).
Si l'invitation avait déjà été acceptée, la personne doit simplement se
connecter avec son compte existant plutôt que de suivre à nouveau le lien.

## Onboarding bloqué à l'étape "Démonstration"

Si l'étape "Démonstration" reste indéfiniment sur un statut différent de
`SUCCEEDED`/`FAILED` après un délai raisonnable (quelques secondes) :
recharger la page `/onboarding` — la progression est persistée
côté serveur, le rechargement ne perd jamais l'avancement. Si le statut
final est `FAILED`, consulter le détail de l'exécution (lien fourni à
l'étape "Résultat") pour le message d'erreur exact du nœud d'action en
échec — l'onboarding réutilise le moteur d'automatisation standard, les
mêmes causes d'échec (connecteur non configuré, quota atteint) s'y
appliquent.

## "Réservé aux administrateurs de la plateforme" (403 sur `/admin/**`)

Attendu pour tout compte sans `isPlatformAdmin=true` — ce n'est pas un
rôle d'organisation (`OWNER_ADMIN` ne suffit pas). Voir
[PLATFORM_ADMINISTRATION.md](./PLATFORM_ADMINISTRATION.md) pour la
procédure de promotion (script CLI, jamais depuis l'application).

## Organisation suspendue ("RESTRICTED")

Symptôme : les actions d'écriture échouent, la lecture reste possible.
Cause : échec de paiement Stripe réel, ou suspension manuelle par un
administrateur plateforme (voir
[PLATFORM_ADMINISTRATION.md](./PLATFORM_ADMINISTRATION.md)). Un
administrateur plateforme peut réactiver l'organisation depuis
`/admin/organizations/<id>` une fois la cause résolue (paiement régularisé
ou décision commerciale).

## Modèle d'automatisation introuvable lors du clonage

Un modèle du catalogue (`isTemplate=true`) ne peut jamais être activé
directement — s'assurer de bien cloner le modèle avant de tenter de
l'activer (voir [AUTOMATION_TEMPLATES.md](./AUTOMATION_TEMPLATES.md)).
Une clé de clone déjà utilisée dans le workspace (ex. un second clonage
manuel du même modèle sous la même clé) échoue explicitement — choisir une
clé différente ou réutiliser le clone déjà existant.
