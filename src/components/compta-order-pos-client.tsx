"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui";
import { formatEuros } from "@/lib/compta/money";

type OrderLine = { id: string; productId: string | null; productName: string; quantity: number; unitPrice: number; vatRate: number };
type Order = { id: string; name: string | null; number: number; lines: OrderLine[]; subtotal: number; vat: number; total: number };
type Product = { id: string; name: string; category: string; price: number; isFavorite: boolean };

// Forme brute renvoyée par order-service.ts (et donc par toutes les routes /api/compta/orders/**)
// — noms de champs alignés sur le schéma Prisma (ComptaOrderLine.*Snapshot,
// getOrder()#withComputedTotals). Normalisée une seule fois ici, jamais réutilisée telle quelle
// dans le rendu : c'est ce qui a causé un bug "NaN €" avant que les actions (+/-, ajout, retrait)
// ne passent par ce même chemin que le chargement initial.
type RawOrderLine = { id: string; productId: string | null; productNameSnapshot: string; quantity: number; unitPriceTtcSnapshot: number; vatRateSnapshot: number };
type RawOrder = { id: string; name: string | null; number: number; lines: RawOrderLine[]; computedSubtotal: number; computedVat: number; computedTotal: number };

function normalizeOrder(raw: RawOrder): Order {
  return {
    id: raw.id,
    name: raw.name,
    number: raw.number,
    subtotal: raw.computedSubtotal,
    vat: raw.computedVat,
    total: raw.computedTotal,
    lines: raw.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
      unitPrice: line.unitPriceTtcSnapshot,
      vatRate: line.vatRateSnapshot,
    })),
  };
}

const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: "CASH", label: "Espèces" },
  { key: "CARD", label: "Carte" },
  { key: "MEAL_VOUCHER", label: "Ticket restaurant" },
  { key: "CHEQUE", label: "Chèque" },
  { key: "TRANSFER", label: "Virement" },
  { key: "OTHER", label: "Autre" },
];

function orderDisplayName(order: { name: string | null; number: number }) {
  return order.name?.trim() ? order.name : `Commande #${order.number}`;
}

// Regroupe les lignes par taux de TVA pour l'affichage HT/TVA/TTC détaillé (une commande peut mélanger plusieurs taux).
function vatBreakdown(lines: OrderLine[]) {
  const byRate = new Map<number, { ht: number; vat: number }>();
  for (const line of lines) {
    const lineTotal = line.unitPrice * line.quantity;
    const vatAmount = Math.round((lineTotal * line.vatRate) / (100 + line.vatRate));
    const ht = lineTotal - vatAmount;
    const entry = byRate.get(line.vatRate) ?? { ht: 0, vat: 0 };
    entry.ht += ht;
    entry.vat += vatAmount;
    byRate.set(line.vatRate, entry);
  }
  return Array.from(byRate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, amounts]) => ({ rate, ...amounts }));
}

export function ComptaOrderPosClient({ order: initialOrder, products, categories }: { order: RawOrder; products: Product[]; categories: string[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [order, setOrder] = useState(() => normalizeOrder(initialOrder));
  const [activeCategory, setActiveCategory] = useState<string>("favoris");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(order.name ?? "");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const favorites = useMemo(() => products.filter((p) => p.isFavorite), [products]);

  const visibleProducts = useMemo(() => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return products.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (activeCategory === "favoris") return favorites.length > 0 ? favorites : products;
    if (activeCategory === "tous") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, favorites, activeCategory, search]);

  function handleError(err: unknown, fallback: string) {
    push({ title: "Erreur", description: err instanceof ApiError ? err.message : fallback, variant: "error" });
  }

  async function addProduct(product: Product) {
    setBusy(true);
    try {
      const { order: updated } = await apiPost<{ order: RawOrder }>(`/api/compta/orders/${order.id}/items`, { productId: product.id });
      setOrder(normalizeOrder(updated));
    } catch (err) {
      handleError(err, "Impossible d'ajouter ce produit.");
    } finally {
      setBusy(false);
    }
  }

  async function setLineQuantity(line: OrderLine, quantity: number) {
    setBusy(true);
    try {
      const { order: updated } = await apiPatch<{ order: RawOrder }>(`/api/compta/orders/${order.id}/items/${line.id}`, { quantity });
      setOrder(normalizeOrder(updated));
    } catch (err) {
      handleError(err, "Impossible de modifier cette ligne.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(line: OrderLine) {
    setBusy(true);
    try {
      const { order: updated } = await apiDelete<{ order: RawOrder }>(`/api/compta/orders/${order.id}/items/${line.id}`);
      setOrder(normalizeOrder(updated));
    } catch (err) {
      handleError(err, "Impossible de retirer cette ligne.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    setBusy(true);
    try {
      const { order: updated } = await apiPatch<{ order: RawOrder }>(`/api/compta/orders/${order.id}`, { name: nameDraft.trim() || null });
      setOrder(normalizeOrder(updated));
      setRenaming(false);
    } catch (err) {
      handleError(err, "Impossible de renommer la commande.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (!confirm(`Annuler ${orderDisplayName(order)} ? Cette commande ne sera pas encaissée.`)) return;
    setBusy(true);
    try {
      await apiPost(`/api/compta/orders/${order.id}/cancel`, {});
      push({ title: "Commande annulée", variant: "success", durationMs: 3000 });
      router.push("/compta/commandes");
    } catch (err) {
      handleError(err, "Impossible d'annuler la commande.");
      setBusy(false);
    }
  }

  async function checkout(paymentMethod: string) {
    setCheckingOut(true);
    try {
      await apiPost(`/api/compta/orders/${order.id}/checkout`, { paymentMethod });
      push({ title: "Commande encaissée", description: formatEuros(order.total), variant: "success", durationMs: 4000 });
      router.push("/compta/commandes");
      router.refresh();
    } catch (err) {
      handleError(err, "Impossible d'encaisser cette commande.");
      setCheckingOut(false);
      setCheckoutOpen(false);
    }
  }

  const breakdown = vatBreakdown(order.lines);

  function renderCart(variant: "desktop" | "mobile") {
    return (
    <div key={variant} className="card p-4 space-y-3 flex flex-col h-full">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <div className="flex-1 flex gap-2">
            <input
              autoFocus
              className="input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveRename()}
            />
            <button type="button" className="btn-secondary" disabled={busy} onClick={saveRename}>OK</button>
          </div>
        ) : (
          <button type="button" className="text-lg font-semibold text-p360-ink hover:underline text-left" onClick={() => { setNameDraft(order.name ?? ""); setRenaming(true); }}>
            {orderDisplayName(order)} ✎
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-p360-lavender-light min-h-[120px]">
        {order.lines.length === 0 ? (
          <p className="text-sm text-p360-muted py-4 text-center">Appuyez sur un produit pour l&apos;ajouter.</p>
        ) : (
          order.lines.map((line) => (
            <div key={line.id} className="py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-p360-ink truncate">{line.productName}</div>
                <div className="text-xs text-p360-muted">{formatEuros(line.unitPrice)} / unité</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={busy} className="btn-ghost w-8 h-8 p-0 text-lg" onClick={() => setLineQuantity(line, line.quantity - 1)}>−</button>
                <span className="w-6 text-center font-medium tabular-nums">{line.quantity}</span>
                <button type="button" disabled={busy} className="btn-ghost w-8 h-8 p-0 text-lg" onClick={() => setLineQuantity(line, line.quantity + 1)}>+</button>
              </div>
              <div className="w-20 text-right text-sm font-semibold text-p360-ink tabular-nums">{formatEuros(line.unitPrice * line.quantity)}</div>
              <button type="button" disabled={busy} className="btn-ghost w-7 h-7 p-0 text-p360-danger" onClick={() => removeLine(line)} aria-label="Retirer">✕</button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-p360-lavender-light pt-3 space-y-1">
        {breakdown.map((b) => (
          <div key={b.rate} className="flex items-center justify-between text-xs text-p360-muted">
            <span>TVA {b.rate}%</span>
            <span className="tabular-nums">{formatEuros(b.vat)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-lg font-semibold text-p360-ink pt-1">
          <span>Total</span>
          <span className="tabular-nums">{formatEuros(order.total)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn-danger flex-1" disabled={busy} onClick={cancelOrder}>Annuler</button>
        <button type="button" className="btn-primary flex-1" disabled={busy || order.lines.length === 0} onClick={() => setCheckoutOpen(true)}>
          Encaisser
        </button>
      </div>
    </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <Link href="/compta/commandes" className="text-sm text-p360-blue hover:underline">
        ← Commandes en cours
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-3">
          <input className="input" placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!search.trim() && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button type="button" onClick={() => setActiveCategory("favoris")} className={activeCategory === "favoris" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}>
                Favoris
              </button>
              <button type="button" onClick={() => setActiveCategory("tous")} className={activeCategory === "tous" ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}>
                Tous
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={activeCategory === category ? "btn-primary whitespace-nowrap" : "btn-secondary whitespace-nowrap"}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                disabled={busy}
                onClick={() => addProduct(product)}
                className="card p-4 text-left hover:bg-p360-lavender-light/40 active:scale-[0.98] transition disabled:opacity-50 min-h-[84px]"
              >
                <div className="text-sm font-semibold text-p360-ink">{product.name}</div>
                <div className="text-sm text-p360-muted mt-1">{formatEuros(product.price)}</div>
              </button>
            ))}
            {visibleProducts.length === 0 && <p className="col-span-full text-center text-p360-muted py-8">Aucun produit.</p>}
          </div>
        </div>

        <div className="hidden lg:block lg:sticky lg:top-4">{renderCart("desktop")}</div>
      </div>

      {/* Mobile : barre fixe + panier accessible en dessous du catalogue */}
      <div className="lg:hidden">{renderCart("mobile")}</div>

      {checkoutOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => !checkingOut && setCheckoutOpen(false)}>
          <div className="card p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-p360-ink">Mode de paiement</h2>
            <p className="text-2xl font-semibold text-p360-ink tabular-nums">{formatEuros(order.total)}</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.key}
                  type="button"
                  disabled={checkingOut}
                  className="btn-secondary"
                  onClick={() => checkout(method.key)}
                >
                  {method.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost w-full" disabled={checkingOut} onClick={() => setCheckoutOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
