export type Role = "admin" | "owner" | "kasir" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  store_id?: string;
  is_active?: boolean;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  name: string;
  slug?: string;
  address: string;
  phone: string;
  email: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  tax_rate?: number;
  service_charge_rate?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  store_id: string;
  category_id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  is_available: boolean;
  is_featured: boolean;
  option_groups?: MenuOptionGroup[];
  track_stock?: boolean;
  stock_quantity?: number | null;
  show_on_menu?: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuOption {
  id: string;
  name: string;
  price_delta: number;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  options: MenuOption[];
}

export interface Table {
  id: string;
  store_id: string;
  number: number;
  qr_code?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

export interface Order {
  id: string;
  store_id: string;
  table_id?: string;
  user_id?: string;
  anonymous_session_id?: string;
  order_number: number;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: string;
  snap_token?: string;
  redirect_url?: string;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  total_amount: number;
  promo_id?: string;
  promo_claim_id?: string;
  promo_discount?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  order_items?: OrderItem[];
  table?: Table;
  payments?: Payment[];
}

export interface Promo {
  id: string; store_id: string; code: string; name: string; description?: string;
  discount_type: "percent" | "fixed"; discount_value: number; max_discount?: number;
  min_purchase: number; applies_to: "all" | "products"; total_quota?: number;
  per_user_limit: number; starts_at: string; ends_at?: string; is_active: boolean;
  product_ids?: string[]; claimed_count?: number;
}

export interface PromoClaim { id:string; promo_id:string; used_order_id?:string; claimed_at:string; promo:Promo }

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
  notes?: string;
  created_at: string;
  menu_item?: MenuItem;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  method: string;
  status: string;
  transaction_id?: string;
  midtrans_order_id?: string;
  snap_data?: Record<string, unknown>;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  store_id: string;
  category_id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  is_available: boolean;
  is_featured: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  quantity: number;
  notes?: string;
  option_ids?: string[];
  selected_options?: Array<{ group_name: string; option_name: string; price_delta: number }>;
}

export interface CheckoutItem {
  menu_item_id: string;
  quantity: number;
  notes?: string;
  option_ids?: string[];
}

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  store_id?: string;
  anonymous_session_id?: string;
}
