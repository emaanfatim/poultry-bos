"use client";

import { useCallback, useMemo, useState } from "react";
import type { CartLineItem, Product, SelectedModifier, Unit } from "@repo/types";
import { calcLineTotal } from "../services/sales";
import { convertQuantity, rateForUnit } from "../utils/unitConversion";

// Builds a stable cart-line identity string:
//   - Simple product  →  just the productId
//   - Modifier product →  productId + sorted modifier option IDs
// This lets two differently-customised orders of the same base product
// (e.g. Large-Oat and Small-Almond) sit as separate lines in the cart.
function buildCartItemId(productId: string, modifiers?: SelectedModifier[]): string {
  if (!modifiers || modifiers.length === 0) return productId;
  const sig = modifiers
    .map((m) => `${m.modifierGroupId}:${m.modifierOptionId}:${m.quantity}`)
    .sort()
    .join("|");
  return `${productId}__${sig}`;
}

// Sum of all modifier charges for a line.
function sumModifierTotal(modifiers?: SelectedModifier[]): string {
  if (!modifiers || modifiers.length === 0) return "0";
  return modifiers
    .reduce((acc, m) => acc + parseFloat(m.totalCharge), 0)
    .toFixed(2);
}

export function useCart() {
  const [items, setItems] = useState<CartLineItem[]>([]);

  // `unit` is which unit the cashier wants to sell this in — defaults to the
  // product's priced unit. The rate is converted server-side too on checkout,
  // this is just for an accurate running total in the UI.
  const addItem = useCallback(
    (
      product: Product,
      quantity: number,
      unit?: Unit,
      modifiers?: SelectedModifier[],
      kitchenNote?: string,
    ) => {
      if (quantity <= 0) return;

      const sellUnit = unit ?? product.unit;
      const rate =
        sellUnit.id === product.unit.id
          ? product.currentPrice
          : rateForUnit(product.currentPrice, product.unit, sellUnit);

      const modifierTotal = sumModifierTotal(modifiers);
      const cartItemId = buildCartItemId(product.id, modifiers);

      setItems((current) => {
        const existing = current.find((item) => item.cartItemId === cartItemId);
        if (existing) {
          // Same product + same modifier signature → merge quantities
          const qtyInExistingUnit =
            existing.unit.id === sellUnit.id
              ? quantity
              : convertQuantity(quantity, sellUnit, existing.unit);
          const nextQty = parseFloat(existing.quantity.toString()) + qtyInExistingUnit;
          return current.map((item) =>
            item.cartItemId === cartItemId
              ? {
                  ...item,
                  quantity: nextQty,
                  lineTotal: calcLineTotal(nextQty, item.rate, item.modifierTotal ?? "0"),
                }
              : item,
          );
        }

        return [
          ...current,
          {
            cartItemId,
            productId: product.id,
            productName: product.name,
            unit: sellUnit,
            quantity,
            rate,
            lineTotal: calcLineTotal(quantity, rate, modifierTotal),
            basePrice: product.currentPrice,
            priceUnit: product.unit,
            sellableUnits: product.units?.length ? product.units : [product.unit],
            modifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
            modifierTotal: modifiers && modifiers.length > 0 ? modifierTotal : undefined,
            kitchenNote: kitchenNote?.trim() || undefined,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((current) => current.filter((item) => item.cartItemId !== cartItemId));
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.cartItemId === cartItemId
          ? {
              ...item,
              quantity,
              lineTotal: calcLineTotal(quantity, item.rate, item.modifierTotal ?? "0"),
            }
          : item,
      ),
    );
  }, []);

  // Switch a cart line to a different sellable unit (e.g. kg → maund), converting
  // both the quantity and the rate so the total stays correct.
  const changeUnit = useCallback((cartItemId: string, newUnit: Unit) => {
    setItems((current) =>
      current.map((item) => {
        if (item.cartItemId !== cartItemId || item.unit.id === newUnit.id) return item;

        const newQty = convertQuantity(item.quantity, item.unit, newUnit);
        const newRate =
          item.priceUnit && item.basePrice
            ? rateForUnit(item.basePrice, item.priceUnit, newUnit)
            : item.rate;

        return {
          ...item,
          unit: newUnit,
          quantity: newQty,
          rate: newRate,
          lineTotal: calcLineTotal(newQty, newRate, item.modifierTotal ?? "0"),
        };
      }),
    );
  }, []);

  const updateKitchenNote = useCallback((cartItemId: string, note: string) => {
    setItems((current) =>
      current.map((item) =>
        item.cartItemId === cartItemId
          ? { ...item, kitchenNote: note.trim() || undefined }
          : item,
      ),
    );
  }, []);

  const removeItem = useCallback((cartItemId: string) => {
    setItems((current) => current.filter((item) => item.cartItemId !== cartItemId));
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
    changeUnit,
    updateKitchenNote,
    removeItem,
    clearCart,
  };
}
