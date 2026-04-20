"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  normalizeSelections,
  selectionSignature,
  type LineSelections,
} from "@ricos/shared";

export type CartLine = { id: string; quantity: number; selections: LineSelections };

type CartContextValue = {
  lines: CartLine[];
  addItem: (id: string, selections?: LineSelections) => void;
  removeItem: (id: string, selections?: LineSelections) => void;
  setQuantity: (id: string, selections: LineSelections, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const addItem = useCallback((id: string, selections: LineSelections = {}) => {
    const normalized = normalizeSelections(selections);
    const sig = selectionSignature(normalized);
    setLines((prev) => {
      const existing = prev.find(
        (l) => l.id === id && selectionSignature(l.selections) === sig,
      );
      if (existing) {
        return prev.map((l) =>
          l.id === id && selectionSignature(l.selections) === sig
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, { id, quantity: 1, selections: normalized }];
    });
  }, []);

  const removeItem = useCallback((id: string, selections: LineSelections = {}) => {
    const sig = selectionSignature(selections);
    setLines((prev) =>
      prev.filter((l) => !(l.id === id && selectionSignature(l.selections) === sig)),
    );
  }, []);

  const setQuantity = useCallback(
    (id: string, selections: LineSelections, quantity: number) => {
      const normalized = normalizeSelections(selections);
      const sig = selectionSignature(normalized);
      if (quantity < 1) {
        setLines((prev) =>
          prev.filter((l) => !(l.id === id && selectionSignature(l.selections) === sig)),
        );
        return;
      }
      if (quantity > 99) return;
      setLines((prev) => {
        const has = prev.some(
          (l) => l.id === id && selectionSignature(l.selections) === sig,
        );
        if (!has) return [...prev, { id, quantity, selections: normalized }];
        return prev.map((l) =>
          l.id === id && selectionSignature(l.selections) === sig
            ? { ...l, quantity }
            : l,
        );
      });
    },
    [],
  );

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, addItem, removeItem, setQuantity, clear }),
    [lines, addItem, removeItem, setQuantity, clear],
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
