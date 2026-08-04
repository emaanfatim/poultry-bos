"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillType, Draft, PaymentMethod, Product, SelectedModifier, Unit } from "@repo/types";
import { AuthGuard } from "../components/common/AuthGuard";
import { TillGuard } from "../components/till/TillGuard";
import { Header } from "../components/common/Header";
import { Cart } from "../components/cart/Cart";
import { ProductGrid } from "../components/products/ProductGrid";
import { ProductSearch } from "../components/products/ProductSearch";
import { PaymentModal, type DiscountInput } from "../components/sales/PaymentModal";
import { DraftsPanel } from "../components/drafts/DraftsPanel";
import { SaveDraftModal } from "../components/drafts/SaveDraftModal";
import { useCart } from "../hooks/useCart";
import { useProducts } from "../hooks/useProducts";
import { useDrafts } from "../hooks/useDrafts";
import { useAuth } from "../providers/AuthProvider";
import { useI18n } from "../providers/I18nProvider";
import { useTill } from "../providers/TillProvider";
import { createSale, fetchPaymentMethods } from "../services/sales";

export default function PosPage() {
  const { token, tenant } = useAuth();
  const { t } = useI18n();
  const { refresh: refreshTill } = useTill();
  const router = useRouter();
  const { products, isLoading, error, reload } = useProducts();
  const cart = useCart();
  const { drafts, isLoading: draftsLoading, fetchDrafts, saveDraft, deleteDraft } = useDrafts(token);

  const [search, setSearch] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showSaveDraft, setShowSaveDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchPaymentMethods(token)
      .then((methods) => setPaymentMethods(methods))
      .catch(() => setPaymentMethods([]));
  }, [token]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.token.toLowerCase().includes(query) ||
        p.categoryName.toLowerCase().includes(query) ||
        p.subCategoryName.toLowerCase().includes(query),
    );
  }, [products, search]);

  const handleConfirmPayment = async (
    billType: BillType,
    customer: { name: string; phone: string },
    paymentMethodId: string,
    discount?: DiscountInput,
  ) => {
    if (!token || cart.items.length === 0) return;
    if (billType === "unpriced" && (!customer.name.trim() || !customer.phone.trim())) {
      alert("Customer name and phone are required for unpriced bills.");
      return;
    }
    if (!paymentMethodId) {
      alert("No active payment method found. Please add one in Settings first.");
      return;
    }
    setIsProcessing(true);
    try {
      const transaction = await createSale(token, {
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitId: item.unit.id,
          // Pass modifier selections so the server re-validates and re-prices
          // them against the product's attached groups (never trust client totals).
          modifiers: item.modifiers?.map((m) => ({
            modifierGroupId: m.modifierGroupId,
            modifierOptionId: m.modifierOptionId,
            quantity: m.quantity,
          })),
          kitchenNote: item.kitchenNote,
        })),
        paymentMethodId,
        billType,
        customerName: customer.name || undefined,
        customerPhone: customer.phone || undefined,
        discount,
      });
      cart.clearCart();
      setShowPayment(false);
      if (billType === "priced") {
        refreshTill();
      }
      router.push(`/receipt/${transaction.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveDraft = async (customerName: string, customerPhone: string) => {
    if (cart.items.length === 0) return;
    setIsSavingDraft(true);
    try {
      await saveDraft({
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        items: cart.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          rate: item.rate,
          unit: item.unit.code,
          // Preserve modifier selections and kitchen notes across draft
          // save/resume so nothing is silently dropped mid-order.
          modifiers: item.modifiers,
          kitchenNote: item.kitchenNote,
        })),
        subtotal: cart.subtotal,
      });
      cart.clearCart();
      setShowSaveDraft(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleResumeDraft = async (draft: Draft) => {
    if (cart.items.length > 0) {
      const ok = confirm("Your current cart will be replaced with this draft. Continue?");
      if (!ok) return;
    }
    cart.clearCart();
    for (const item of draft.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      const matchedUnit =
        product.units?.find((u) => u.code === item.unit) ??
        (product.unit.code === item.unit ? product.unit : product.unit);

      cart.addItem(
        { ...product, currentPrice: item.rate, unit: matchedUnit },
        item.quantity,
        matchedUnit,
        item.modifiers as SelectedModifier[] | undefined,
        item.kitchenNote,
      );
    }
    await deleteDraft(draft.id);
    setShowDrafts(false);
  };

  const handleDeleteDraft = async (draftId: string) => {
    const ok = confirm("Delete this draft? This cannot be undone.");
    if (!ok) return;
    await deleteDraft(draftId);
  };

  // ProductGrid's onAdd signature now includes optional modifiers + kitchenNote
  const handleProductAdd = (
    product: Product,
    qty: number,
    unit: Unit,
    modifiers?: SelectedModifier[],
    kitchenNote?: string,
  ) => {
    cart.addItem(product, qty, unit, modifiers, kitchenNote);
  };

  return (
    <AuthGuard>
      <TillGuard>
        <div className="flex min-h-dvh flex-col">
          <Header />

          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 lg:flex-row">
            <section className="flex min-h-0 flex-1 flex-col gap-4">
              <ProductSearch value={search} onChange={setSearch} />
              {isLoading && <p className="text-center text-slate-500">{t.common.loading}</p>}
              {error && (
                <div className="rounded-xl bg-red-50 p-4 text-center text-red-700">
                  <p>{error}</p>
                  <button type="button" onClick={reload} className="mt-2 text-sm font-medium underline">
                    {t.common.retry}
                  </button>
                </div>
              )}
              {!isLoading && !error && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ProductGrid products={filteredProducts} onAdd={handleProductAdd} />
                </div>
              )}
            </section>

            <aside className="w-full shrink-0 lg:w-96">
              <div className="sticky top-4 flex h-[calc(100vh-6rem)] flex-col gap-3">

                {/* Saved Drafts button */}
                <button
                  type="button"
                  onClick={() => setShowDrafts(true)}
                  className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <span>📋 Saved Drafts</span>
                  {drafts.length > 0 && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      {drafts.length}
                    </span>
                  )}
                </button>

                {/* Cart */}
                <div className="min-h-0 flex-1">
                  <Cart
                    items={cart.items}
                    subtotal={cart.subtotal}
                    onUpdateQuantity={cart.updateQuantity}
                    onChangeUnit={cart.changeUnit}
                    onUpdateKitchenNote={cart.updateKitchenNote}
                    onRemove={cart.removeItem}
                    onCheckout={() => setShowPayment(true)}
                    onSaveDraft={() => setShowSaveDraft(true)}
                  />
                </div>
              </div>
            </aside>
          </main>

          <PaymentModal
            total={cart.subtotal}
            items={cart.items}
            isOpen={showPayment}
            isProcessing={isProcessing}
            paymentMethods={paymentMethods}
            onConfirm={handleConfirmPayment}
            onCancel={() => setShowPayment(false)}
          />

          <SaveDraftModal
            isOpen={showSaveDraft}
            isSaving={isSavingDraft}
            itemCount={cart.items.length}
            subtotal={cart.subtotal}
            currencySymbol={tenant?.currencySymbol ?? "Rs"}
            draftsCount={drafts.length}
            onConfirm={handleSaveDraft}
            onCancel={() => setShowSaveDraft(false)}
          />

          <DraftsPanel
            isOpen={showDrafts}
            drafts={drafts}
            isLoading={draftsLoading}
            currencySymbol={tenant?.currencySymbol ?? "Rs"}
            onResume={handleResumeDraft}
            onDelete={handleDeleteDraft}
            onClose={() => setShowDrafts(false)}
            onRefresh={fetchDrafts}
          />
        </div>
      </TillGuard>
    </AuthGuard>
  );
}
