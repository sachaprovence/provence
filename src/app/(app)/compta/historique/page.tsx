import { requireActor } from "@/lib/auth";
import { listComptaActivityLog } from "@/lib/compta/backup-service";

const ACTION_LABEL: Record<string, string> = {
  "compta_sale.created": "Vente enregistrée",
  "compta_sale.cancelled": "Vente annulée",
  "compta_sale.refunded": "Vente remboursée",
  "compta_sale.deleted": "Vente supprimée",
  "compta_expense.created": "Dépense ajoutée",
  "compta_expense.updated": "Dépense modifiée",
  "compta_expense.deleted": "Dépense supprimée",
  "compta_product.created": "Produit créé",
  "compta_product.updated": "Produit modifié",
  "compta_supplier.created": "Fournisseur créé",
  "compta_supplier.updated": "Fournisseur modifié",
  "compta_ingredient.created": "Ingrédient créé",
  "compta_ingredient.updated": "Ingrédient modifié",
  "compta_ingredient.stock_corrected": "Correction de stock",
  "compta_recipe.updated": "Recette modifiée",
  "compta_purchase_order.created": "Commande fournisseur créée",
  "compta_purchase_order.ordered": "Commande passée",
  "compta_purchase_order.received": "Commande réceptionnée",
  "compta_purchase_order.cancelled": "Commande annulée",
  "compta_purchase_payment.recorded": "Paiement fournisseur enregistré",
  "compta_cash_count.created": "Comptage de caisse",
  "compta_cash_session.opened": "Caisse ouverte",
  "compta_cash_session.closed": "Caisse fermée",
  "compta_customer.created": "Client créé",
  "compta_customer.updated": "Client modifié",
  "compta_backup.restored": "Sauvegarde restaurée",
};

export default async function ComptaHistoriquePage() {
  const actor = await requireActor();
  const entries = await listComptaActivityLog(actor.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Historique</h1>
        <p className="text-p360-muted text-sm mt-1">Journal complet des actions effectuées dans Compta Vellano.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-p360-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Utilisateur</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-muted whitespace-nowrap">
                  {entry.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2 text-p360-ink">{ACTION_LABEL[entry.action] ?? entry.action}</td>
                <td className="px-4 py-2 text-p360-muted">
                  {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "—"}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-p360-muted">Aucune action enregistrée pour l&apos;instant.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
