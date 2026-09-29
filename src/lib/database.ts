import { supabase } from "./supabase";

export const db = {
  stores: {
    findMany: async (filters?: {
      page?: number;
      limit?: number;
      isActive?: boolean;
    }) => {
      const page = filters?.page || 1;
      const limit = filters?.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from("stores")
        .select("*", { count: "exact" })
        .range(from, to)
        .order("created_at", { ascending: false });

      if (filters?.isActive !== undefined) {
        query = query.eq("is_active", filters.isActive);
      }

      const { data, count, error } = await query;

      if (error) throw error;
      return {
        data: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    },
    findOne: async (id: string) => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return { data };
    },
    create: async (payload: any) => {
      const { data, error } = await supabase
        .from("stores")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("stores")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    delete: async (id: string) => {
      const { error } = await supabase.from("stores").delete().eq("id", id);
      if (error) throw error;
      return { data: null };
    },
  },

  categories: {
    findMany: async (filters?: { storeId?: string; isActive?: boolean }) => {
      let query = supabase.from("categories").select("*");

      if (filters?.storeId) query = query.eq("store_id", filters.storeId);
      if (filters?.isActive !== undefined)
        query = query.eq("is_active", filters.isActive);

      const { data, error } = await query.order("display_order", {
        ascending: true,
      });

      if (error) throw error;
      return { data: data || [] };
    },
    create: async (payload: any) => {
      const { data, error } = await supabase
        .from("categories")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    delete: async (id: string) => {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { data: null };
    },
  },

  menuItems: {
    findMany: async (filters?: {
      storeId?: string;
      categoryId?: string;
      isAvailable?: boolean;
      isFeatured?: boolean;
    }) => {
      let query = supabase
        .from("menu_items")
        .select("*, category:categories(*)");

      if (filters?.storeId) query = query.eq("store_id", filters.storeId);
      if (filters?.categoryId)
        query = query.eq("category_id", filters.categoryId);
      if (filters?.isAvailable !== undefined)
        query = query.eq("is_available", filters.isAvailable);
      if (filters?.isFeatured !== undefined)
        query = query.eq("is_featured", filters.isFeatured);

      const { data, error } = await query.order("display_order", {
        ascending: true,
      });

      if (error) throw error;
      return { data: data || [] };
    },
    findOne: async (id: string) => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*, category:categories(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return { data };
    },
    create: async (payload: any) => {
      const { data, error } = await supabase
        .from("menu_items")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("menu_items")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    delete: async (id: string) => {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { data: null };
    },
  },

  tables: {
    findMany: async (filters?: { storeId?: string; isActive?: boolean }) => {
      let query = supabase.from("tables").select("*");

      if (filters?.storeId) query = query.eq("store_id", filters.storeId);
      if (filters?.isActive !== undefined)
        query = query.eq("is_active", filters.isActive);

      const { data, error } = await query.order("number", { ascending: true });

      if (error) throw error;
      return { data: data || [] };
    },
    findOne: async (id: string) => {
      const { data, error } = await supabase
        .from("tables")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return { data };
    },
    create: async (payload: any) => {
      const { data, error } = await supabase
        .from("tables")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("tables")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    delete: async (id: string) => {
      const { error } = await supabase.from("tables").delete().eq("id", id);
      if (error) throw error;
      return { data: null };
    },
  },

  orders: {
    findMany: async (filters?: {
      storeId?: string;
      status?: string;
      paymentStatus?: string;
    }) => {
      let query = supabase.from("orders").select(
        "*, table:tables(*), order_items(*, menu_item:menu_items(*))"
      );

      if (filters?.storeId) query = query.eq("store_id", filters.storeId);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.paymentStatus)
        query = query.eq("payment_status", filters.paymentStatus);

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;
      return { data: data || [] };
    },
    findOne: async (id: string) => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, table:tables(*), order_items(*, menu_item:menu_items(*))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return { data };
    },
    create: async (payload: any) => {
      const { data, error } = await supabase
        .from("orders")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
  },

  orderItems: {
    createMany: async (orderId: string, items: any[]) => {
      const payload = items.map((item) => ({
        order_id: orderId,
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        notes: item.notes,
      }));

      const { error } = await supabase.from("order_items").insert(payload);
      if (error) throw error;
      return { data: null };
    },
  },

  users: {
    findMany: async (filters?: {
      storeId?: string;
      role?: string;
      page?: number;
      limit?: number;
    }) => {
      let query = supabase.from("users").select("*", { count: "exact" });

      if (filters?.storeId) query = query.eq("store_id", filters.storeId);
      if (filters?.role) query = query.eq("role", filters.role);

      const page = filters?.page || 1;
      const limit = filters?.limit || 50;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, count, error } = await query
        .range(from, to)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return {
        data: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      };
    },
    findOne: async (id: string) => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("users")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    delete: async (id: string) => {
      const { error } = await supabase.from("users").delete().eq("id", id);
      if (error) throw error;
      return { data: null };
    },
  },

  payments: {
    create: async (payload: any) => {
      const { data, error } = await supabase
        .from("payments")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    update: async (id: string, payload: any) => {
      const { data, error } = await supabase
        .from("payments")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    findByOrder: async (orderId: string) => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", orderId);
      if (error) throw error;
      return { data: data || [] };
    },
  },

  subscriptions: {
    subscribeToOrders: (storeId: string, callback: (payload: any) => void) => {
      const subscription = supabase
        .channel(`public:orders:store=${storeId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `store_id=eq.${storeId}`,
          },
          callback
        )
        .subscribe();

      return subscription;
    },
    subscribeToOrderStatus: (orderId: string, callback: (payload: any) => void) => {
      const subscription = supabase
        .channel(`public:orders:id=${orderId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `id=eq.${orderId}`,
          },
          callback
        )
        .subscribe();

      return subscription;
    },
  },
};
