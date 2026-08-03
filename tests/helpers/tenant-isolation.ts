import { expect } from "vitest";

/**
 * Gabarit réutilisable pour vérifier qu'une requête filtrée par acteur
 * (ex. `leadWhereForActor`) n'expose jamais une ressource appartenant à une
 * autre organisation (ou, pour un rôle restreint comme `PROVIDER`, à un
 * autre territoire). À dupliquer pour chaque nouvelle route/domaine
 * sensible (voir DEVELOPMENT_GUIDE.md §5, ROADMAP.md MOD-00/MOD-17).
 *
 * Usage : fournir, pour deux acteurs distincts, la fonction qui liste "leurs"
 * ressources telles que l'application les verrait, ainsi que l'identifiant
 * de la ressource que chacun est censé posséder. Le gabarit vérifie que
 * chaque acteur voit sa propre ressource et jamais celle de l'autre.
 */
export async function expectNoCrossTenantLeak<T>(params: {
  actorAItems: () => Promise<T[]>;
  actorBItems: () => Promise<T[]>;
  actorAOwnResourceId: string;
  actorBOwnResourceId: string;
  getId: (item: T) => string;
}) {
  const [itemsSeenByA, itemsSeenByB] = await Promise.all([params.actorAItems(), params.actorBItems()]);
  const idsSeenByA = itemsSeenByA.map(params.getId);
  const idsSeenByB = itemsSeenByB.map(params.getId);

  expect(idsSeenByA, "l'acteur A doit voir sa propre ressource").toContain(params.actorAOwnResourceId);
  expect(idsSeenByA, "l'acteur A ne doit jamais voir la ressource de B").not.toContain(
    params.actorBOwnResourceId
  );

  expect(idsSeenByB, "l'acteur B doit voir sa propre ressource").toContain(params.actorBOwnResourceId);
  expect(idsSeenByB, "l'acteur B ne doit jamais voir la ressource de A").not.toContain(
    params.actorAOwnResourceId
  );
}
