"use client";

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { CartItem } from "@/types";

type OrderContext = { storeId: string; table: string; reservation: string; orderType: "dine_in" | "pickup"; pickupAt: string };
const empty: OrderContext = { storeId: "", table: "", reservation: "", orderType: "pickup", pickupAt: "" };
const Context = createContext<{
  cart: CartItem[]; setCart: Dispatch<SetStateAction<CartItem[]>>;
  order: OrderContext; setOrder: Dispatch<SetStateAction<OrderContext>>; ready: boolean;
} | null>(null);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<OrderContext>(empty);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("selforder_order_draft") || "null");
      if (saved?.version === 1 && Date.now() - saved.savedAt < 12 * 60 * 60 * 1000 && typeof saved.order?.storeId === "string") {
        setOrder({ ...empty, ...saved.order });
        if (Array.isArray(saved.cart)) setCart(saved.cart.filter((item: CartItem) => typeof item.id === "string" && Number.isFinite(item.quantity) && item.quantity > 0 && Number.isFinite(Number(item.price))));
      }
    } catch { /* A malformed or blocked session store should not prevent ordering. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem("selforder_order_draft", JSON.stringify({ version: 1, savedAt: Date.now(), cart, order })); } catch { /* In-memory cart remains available. */ }
  }, [cart, order, ready]);
  return <Context.Provider value={{ cart, setCart, order, setOrder, ready }}>{children}</Context.Provider>;
}
export function useOrder() {
  const value = useContext(Context);
  if (!value) throw new Error("OrderProvider is required");
  return value;
}
