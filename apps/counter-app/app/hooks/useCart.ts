"use client";

import { useCallback, useMemo, useState } from "react";
import type { CartLineItem, Product } from "@repo/types";
import { calcLineTotal } from "../services/sales";

export function useCart() {
  const [items, setItems] = useState<CartLineItem[]>([]);

  const addItem = useCallback((product: Product, quantity: number) => {
    if (quantity <= 0) return;

    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        const nextQty = parseFloat(existing.quantity.toString()) + quantity;
        return current.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: nextQty,
                lineTotal: calcLineTotal(nextQty, product.currentPrice),
              }
            : item,
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit, // Now a Unit object
          quantity,
          rate: product.currentPrice,
          lineTotal: calcLineTotal(quantity, product.currentPrice),
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((current) => current.filter((item) => item.productId !== productId));
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity,
              lineTotal: calcLineTotal(quantity, item.rate),
            }
          : item,
      ),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + parseFloat(item.lineTotal), 0).toFixed(2),
    [items],
  );

  const itemCount = useMemo(() => items.length, [items]);

  return {
    items,
    subtotal,
    itemCount,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
