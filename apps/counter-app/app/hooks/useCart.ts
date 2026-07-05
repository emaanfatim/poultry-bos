"use client";

import { useCallback, useMemo, useState } from "react";
import type { CartLineItem, Product, Unit } from "@repo/types";
import { calcLineTotal } from "../services/sales";
import { convertQuantity, rateForUnit } from "../utils/unitConversion";

export function useCart() {
  const [items, setItems] = useState<CartLineItem[]>([]);

  // `unit` is which unit the cashier wants to sell this in — defaults to the
  // product's priced unit. The rate is converted server-side too on checkout,
  // this is just for an accurate running total in the UI.
  const addItem = useCallback((product: Product, quantity: number, unit?: Unit) => {
    if (quantity <= 0) return;

    const sellUnit = unit ?? product.unit;
    const rate =
      sellUnit.id === product.unit.id
        ? product.currentPrice
        : rateForUnit(product.currentPrice, product.unit, sellUnit);

    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        const qtyInExistingUnit =
          existing.unit.id === sellUnit.id ? quantity : convertQuantity(quantity, sellUnit, existing.unit);
        const nextQty = parseFloat(existing.quantity.toString()) + qtyInExistingUnit;
        return current.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQty, lineTotal: calcLineTotal(nextQty, item.rate) }
            : item,
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unit: sellUnit,
          quantity,
          rate,
          lineTotal: calcLineTotal(quantity, rate),
          basePrice: product.currentPrice,
          priceUnit: product.unit,
          sellableUnits: product.units?.length ? product.units : [product.unit],
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
          ? { ...item, quantity, lineTotal: calcLineTotal(quantity, item.rate) }
          : item,
      ),
    );
  }, []);

  // Switch a cart line to a different sellable unit (e.g. kg → maund), converting
  // both the quantity and the rate so the total stays correct.
  const changeUnit = useCallback((productId: string, newUnit: Unit) => {
    setItems((current) =>
      current.map((item) => {
        if (item.productId !== productId || item.unit.id === newUnit.id) return item;

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
          lineTotal: calcLineTotal(newQty, newRate),
        };
      }),
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
    changeUnit,
    removeItem,
    clearCart,
  };
}
