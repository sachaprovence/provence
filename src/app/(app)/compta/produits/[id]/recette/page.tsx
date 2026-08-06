import { requireActor } from "@/lib/auth";
import { getProduct } from "@/lib/compta/product-service";
import { getRecipe, listIngredients } from "@/lib/compta/stock-service";
import { ComptaRecipeEditorClient } from "@/components/compta-recipe-editor-client";

export default async function ComptaRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const [product, recipe, ingredients] = await Promise.all([
    getProduct(actor.organization.id, id),
    getRecipe(actor.organization.id, id),
    listIngredients(actor.organization.id),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Recette — {product.name}</h1>
        <p className="text-p360-muted text-sm mt-1">
          Chaque ingrédient listé ici est automatiquement décrémenté du stock à chaque vente de ce produit.
        </p>
      </div>
      <ComptaRecipeEditorClient productId={product.id} initialLines={recipe} ingredients={ingredients} />
    </div>
  );
}
