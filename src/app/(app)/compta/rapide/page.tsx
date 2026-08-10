import { requireActor } from "@/lib/auth";
import { listProducts } from "@/lib/compta/product-service";
import { listTopSellingProducts } from "@/lib/compta/sale-service";
import { ComptaQuickSaleClient } from "@/components/compta-quick-sale-client";

export default async function ComptaQuickSalePage() {
  const actor = await requireActor();
  const [favorites, allProducts, topSelling] = await Promise.all([
    listProducts(actor.organization.id, { favoritesOnly: true }),
    listProducts(actor.organization.id),
    listTopSellingProducts(actor.organization.id, { days: 30, limit: 8 }),
  ]);

  // Favoris d'abord, puis les plus vendus non déjà favoris — pour que l'écran soit utile dès le
  // premier jour (avant qu'il y ait un historique de ventes) grâce aux favoris configurés à la main.
  const favoriteIds = new Set(favorites.map((p) => p.id));
  const topProducts = topSelling.map((entry) => entry.product).filter((p) => !favoriteIds.has(p.id));
  const tiles = [...favorites, ...topProducts].slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Vente rapide</h1>
        <p className="text-p360-muted text-sm mt-1">Un seul geste : appuyez sur un produit pour enregistrer une vente (espèces, quantité 1).</p>
      </div>
      <ComptaQuickSaleClient tiles={tiles} allProducts={allProducts} />
    </div>
  );
}
