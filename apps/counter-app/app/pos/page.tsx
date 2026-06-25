"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "../components/common/AuthGuard";
import { Header } from "../components/common/Header";
import { Cart } from "../components/cart/Cart";
import { ProductGrid } from "../components/products/ProductGrid";
import { ProductSearch } from "../components/products/ProductSearch";
import { PaymentModal } from "../components/sales/PaymentModal";
import { useCart } from "../hooks/useCart";
import { useProducts } from "../hooks/useProducts";
import { useAuth } from "../providers/AuthProvider";
import { useI18n } from "../providers/I18nProvider";
import { createSale } from "../services/sales";

export default function PosPage() {
  const { token } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const { products, isLoading, error, reload } = useProducts();
  const cart = useCart();
  const [search, setSearch] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.token.toLowerCase().includes(query) ||
        p.categoryName.toLowerCase().includes(query),
    );
  }, [products, search]);

  const handleConfirmPayment = async () => {
    if (!token || cart.items.length === 0) return;
    setIsProcessing(true);
    try {
      const transaction = await createSale(token, {
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        paymentMethod: "cash",
      });
      cart.clearCart();
      setShowPayment(false);
      router.push(`/receipt/${transaction.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : t.common.error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 lg:flex-row">
          <section className="flex min-h-0 flex-1 flex-col gap-4">
            <ProductSearch value={search} onChange={setSearch} />

            {isLoading && (
              <p className="text-center text-slate-500">{t.common.loading}</p>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 p-4 text-center text-red-700">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="mt-2 text-sm font-medium underline"
                >
                  {t.common.retry}
                </button>
              </div>
            )}

            {!isLoading && !error && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ProductGrid products={filteredProducts} onAdd={cart.addItem} />
              </div>
            )}
          </section>

          <aside className="w-full shrink-0 lg:w-96">
            <div className="sticky top-4 h-[calc(100vh-6rem)]">
              <Cart
                items={cart.items}
                subtotal={cart.subtotal}
                onUpdateQuantity={cart.updateQuantity}
                onRemove={cart.removeItem}
                onCheckout={() => setShowPayment(true)}
              />
            </div>
          </aside>
        </main>

        <PaymentModal
          total={cart.subtotal}
          isOpen={showPayment}
          isProcessing={isProcessing}
          onConfirm={handleConfirmPayment}
          onCancel={() => setShowPayment(false)}
        />
      </div>
    </AuthGuard>
  );
}
