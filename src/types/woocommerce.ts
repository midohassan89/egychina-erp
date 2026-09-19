export interface WooCommerceImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  display: string;
  image: WooCommerceImage | null;
  count: number;
}

/** WooCommerce product meta row (e.g. OpenPOS `_op_barcode`). */
export interface WooCommerceMetaData {
  id?: number;
  key: string;
  value: string | number | boolean | string[] | null;
}

export interface WooCommerceProduct {
  isLocal?: boolean;
  id: number;
  name: string;
  slug: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_quantity: number | null;
  stock_status: "instock" | "outofstock" | "onbackorder";
  manage_stock: boolean;
  categories: Pick<WooCommerceCategory, "id" | "name" | "slug">[];
  images: WooCommerceImage[];
  description: string;
  short_description: string;
  status: string;
  type: string;
  /** Custom fields from WooCommerce; barcodes live under `_op_barcode`. */
  meta_data?: WooCommerceMetaData[];
}

export interface WooCommerceCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  billing: WooCommerceAddress;
  shipping: WooCommerceAddress;
  avatar_url: string;
  date_created: string;
}

export interface WooCommerceAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface WooCommerceConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface PaginatedParams {
  page?: number;
  perPage?: number;
  search?: string;
}

export interface SyncMetadata {
  lastSyncedAt: string | null;
  productCount: number;
  categoryCount: number;
  customerCount: number;
}

export interface CachedProduct extends WooCommerceProduct {
  cachedAt: string;
  /** Local ERP favorite flag (Prisma) — not a WooCommerce field. */
  isFavorite?: boolean;
}

export interface CachedCategory extends WooCommerceCategory {
  cachedAt: string;
}

export interface CachedCustomer extends WooCommerceCustomer {
  cachedAt: string;
}

export type PaymentMethod =
  | "cash"
  | "visa"
  | "wallet"
  | "instapay"
  | "wechat"
  /** @deprecated legacy — treat as visa */
  | "card";

export type SaleSyncStatus = "synced" | "pending" | "failed";

export interface SaleLine {
  productId: number;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  isWeighted: boolean;
  isLocal: boolean;
}

export interface LocalSale {
  id: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  customerId: number | null;
  customerName: string;
  lines: SaleLine[];
  total: number;
  tendered: number;
  change: number;
  wooOrderId: number | null;
  syncStatus: SaleSyncStatus;
  syncError?: string;
  /** Cashier shift this sale belongs to */
  shiftId?: string | null;
  /** True when this ticket is a manager-authorized return / refund. */
  isReturn?: boolean;
  /** Logged-in cashier who completed the ticket. */
  cashierId?: string | null;
  cashierName?: string | null;
  /** Manager who authorized return mode (PIN). */
  managerId?: string | null;
  managerName?: string | null;
}

export type ShiftStatus = "open" | "closed";

export interface CashierShift {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startingCash: number;
  status: ShiftStatus;
  /** Running total of cash sales (server Shift.cashSales). */
  cashSales?: number;
  visaSales?: number;
  walletSales?: number;
  instapaySales?: number;
  wechatSales?: number;
  /** Sum of non-cash digital/bank channels (legacy aggregate). */
  cardSales?: number;
  totalSales?: number;
  /** startingCash + cashSales only (physical drawer). */
  expectedCash?: number;
  ticketCount?: number;
  actualCash?: number;
  variance?: number;
}

export interface ZReportSummary {
  shiftId: string;
  startedAt: string;
  endedAt: string;
  startingCash: number;
  cashSales: number;
  visaSales: number;
  walletSales: number;
  instapaySales: number;
  wechatSales: number;
  /** Sum of non-cash channels (legacy / convenience). */
  cardSales: number;
  totalSales: number;
  /** startingCash + cashSales — physical drawer only. */
  expectedCash: number;
  ticketCount: number;
  cashTickets: number;
  cardTickets: number;
  /** Absolute sum of cash refunds (money leaving drawer). */
  cashRefunds: number;
  returnTickets: number;
  actualCash?: number;
  variance?: number;
}

export interface CreateOrderLineItem {
  product_id?: number;
  name?: string;
  quantity: number;
  subtotal?: string;
  total?: string;
}

export interface CreateOrderPayload {
  status?: string;
  set_paid?: boolean;
  payment_method: string;
  payment_method_title: string;
  customer_id?: number;
  line_items: CreateOrderLineItem[];
}

export interface WooCommerceOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  date_created: string;
}
