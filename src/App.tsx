import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  Activity, ArrowRight, BadgeIndianRupee, ChartNoAxesCombined, ChevronDown, CircleHelp, Download,
  LayoutDashboard, LogOut, Menu, Package, Pencil, Plus, Search, Settings, ShoppingBag, Trash2,
  ShoppingCart, Star, Upload, Users, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Profile = { id: string; email: string | null; full_name: string | null; role: string };
type Category = { id: string; name: string; slug: string; is_active: boolean };
type Variant = {
  id: string; sku: string; variant_name: string; size_label: string | null; price: number;
  stock_quantity: number; low_stock_threshold: number; is_active: boolean; is_default: boolean;
};
type ProductImage = { image_url: string; alt_text: string | null; is_primary: boolean };
type Product = {
  id: string; name: string; slug: string; kind: string; category_id: string | null; is_active: boolean;
  short_description: string | null; product_variants: Variant[]; product_images: ProductImage[];
};
type Order = {
  id: string; order_number: string; user_id: string; customer_name: string; customer_email: string;
  customer_phone: string; status: string; payment_status: string; currency: string; subtotal: number;
  discount_amount: number; shipping_fee: number; tax_amount: number; total_amount: number;
  shipping_address_snapshot: Record<string, unknown> | null; billing_address_snapshot: Record<string, unknown> | null;
  customer_note: string | null; placed_at: string; created_at: string;
};
type OrderItem = {
  id: string; order_id: string; product_id: string | null; variant_id: string | null;
  product_name: string; variant_name: string | null; size_label: string | null; sku: string | null;
  quantity: number; line_total: number; unit_price: number; created_at: string;
};
type Review = { id: string; product_id: string; rating: number; status: string; created_at: string };
type SalesRow = { product: Product; variant: Variant; units: number; revenue: number };
type View = "overview" | "products" | "analytics" | "orders" | "reviews";
type DataState = { categories: Category[]; products: Product[]; orders: Order[]; items: OrderItem[]; reviews: Review[] };
type AnalyticsData = {
  revenue: number; aov: number; orderCount: number; repeatRate: number; customerValue: number;
  salesRows: SalesRow[]; variants: number; lowStock: number; outOfStock: number;
  healthy: number; healthyPercent: number; refundRate: number; refundDenominator: number;
  lowReviewRate: number; lowReviews: number; chart: { date: Date; label: string; total: number }[];
};

const EMPTY_DATA: DataState = { categories: [], products: [], orders: [], items: [], reviews: [] };
const PAGE_SIZE = 500;
const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "product-images";
let clientConfigurationError = "";
const VIEW_LABELS: Record<View, string> = {
  overview: "Overview", products: "Products", analytics: "Analytics", orders: "Orders", reviews: "Product reviews",
};

function createSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || url.includes("your-project") || key.includes("your-supabase")) return null;
  try {
    return createClient(url, key);
  } catch (clientError) {
    clientConfigurationError = `Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY settings: ${errorText(clientError)}`;
    return null;
  }
}

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function snapshotValue(snapshot: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (typeof value === "string" || typeof value === "number") return value;
  }
  return "";
}

function ordersCsv(orders: Order[], items: OrderItem[]) {
  const headers = [
    "Order number", "Order ID", "Order date", "Order status", "Payment status",
    "Customer name", "Customer email", "Customer phone",
    "Shipping recipient", "Shipping phone", "Shipping address line 1", "Shipping address line 2",
    "Shipping landmark", "Shipping city", "Shipping state", "Shipping pincode", "Shipping country",
    "Billing recipient", "Billing phone", "Billing address line 1", "Billing address line 2",
    "Billing landmark", "Billing city", "Billing state", "Billing pincode", "Billing country",
    "Product", "Variant", "Size", "SKU", "Quantity", "Unit price", "Line total",
    "Subtotal", "Discount", "Shipping fee", "Tax", "Order total", "Currency", "Customer note",
  ];
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const orderItems = itemsByOrder.get(item.order_id) || [];
    orderItems.push(item);
    itemsByOrder.set(item.order_id, orderItems);
  }
  const rows = orders.filter((order) => order.status.toLowerCase() !== "cancelled").flatMap((order) => {
    const orderItems = itemsByOrder.get(order.id) || [];
    const shipping = order.shipping_address_snapshot;
    const billing = order.billing_address_snapshot;
    const orderValues = [
      order.order_number, order.id, order.placed_at || order.created_at, order.status, order.payment_status,
      order.customer_name, order.customer_email, order.customer_phone,
      snapshotValue(shipping, "recipient_name", "name", "full_name") || order.customer_name,
      snapshotValue(shipping, "phone") || order.customer_phone,
      snapshotValue(shipping, "address_line1", "addressLine1", "line1"),
      snapshotValue(shipping, "address_line2", "addressLine2", "line2"),
      snapshotValue(shipping, "landmark"), snapshotValue(shipping, "city"),
      snapshotValue(shipping, "state"), snapshotValue(shipping, "pincode", "postal_code", "zip"),
      snapshotValue(shipping, "country"),
      snapshotValue(billing, "recipient_name", "name", "full_name"),
      snapshotValue(billing, "phone"),
      snapshotValue(billing, "address_line1", "addressLine1", "line1"),
      snapshotValue(billing, "address_line2", "addressLine2", "line2"),
      snapshotValue(billing, "landmark"), snapshotValue(billing, "city"),
      snapshotValue(billing, "state"), snapshotValue(billing, "pincode", "postal_code", "zip"),
      snapshotValue(billing, "country"),
    ];
    return (orderItems.length ? orderItems : [null]).map((item) => [
      ...orderValues,
      item?.product_name || "", item?.variant_name || "", item?.size_label || "", item?.sku || "",
      item?.quantity ?? "", item?.unit_price ?? "", item?.line_total ?? "",
      order.subtotal, order.discount_amount, order.shipping_fee, order.tax_amount, order.total_amount,
      order.currency, order.customer_note || "",
    ]);
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function downloadOrdersCsv(orders: Order[], items: OrderItem[]) {
  const blob = new Blob([ordersCsv(orders, items)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function paidOrders(orders: Order[]) {
  return orders.filter((order) =>
    ["paid", "partially_refunded"].includes(order.payment_status) &&
    !["cancelled", "refunded"].includes(order.status),
  );
}

function getVariant(product: Product) {
  const variants = product.product_variants.filter((variant) => variant.is_active !== false);
  return variants.find((variant) => variant.is_default) || variants[0] || null;
}

function getStock(product: Product) {
  return product.product_variants
    .filter((variant) => variant.is_active !== false)
    .reduce((sum, variant) => sum + Number(variant.stock_quantity || 0), 0);
}

function getImage(product: Product) {
  return product.product_images.find((image) => image.is_primary)?.image_url || product.product_images[0]?.image_url || "";
}

function productSlug(name: string) {
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function App() {
  const client = useMemo(createSupabaseClient, []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [view, setView] = useState<View>("overview");
  const [period, setPeriod] = useState(30);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 4200);
  }, []);

  const loadData = useCallback(async () => {
    if (!client || !user) return;
    setLoading(true);
    setError("");
    try {
      const fetchAll = async <T,>(query: (from: number, to: number) => PromiseLike<{
        data: T[] | null; error: { message: string } | null;
      }>): Promise<T[]> => {
        const rows: T[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data: page, error: queryError } = await query(from, from + PAGE_SIZE - 1);
          if (queryError) throw queryError;
          rows.push(...(page || []));
          if (!page || page.length < PAGE_SIZE) return rows;
        }
      };
      const [categories, products, orders, items, reviews] = await Promise.all([
        fetchAll<Category>((from, to) => client.from("categories").select("id,name,slug,is_active").order("sort_order").order("name").range(from, to)),
        fetchAll<Product>((from, to) => client.from("products")
          .select("id,name,slug,kind,category_id,is_active,short_description,product_variants(id,sku,variant_name,size_label,price,stock_quantity,low_stock_threshold,is_active,is_default),product_images(image_url,alt_text,is_primary)")
          .order("created_at", { ascending: false }).range(from, to)),
        fetchAll<Order>((from, to) => client.from("orders")
          .select("id,order_number,user_id,customer_name,customer_email,customer_phone,status,payment_status,currency,subtotal,discount_amount,shipping_fee,tax_amount,total_amount,shipping_address_snapshot,billing_address_snapshot,customer_note,placed_at,created_at")
          .order("placed_at", { ascending: false }).range(from, to)),
        fetchAll<OrderItem>((from, to) => client.from("order_items")
          .select("id,order_id,product_id,variant_id,product_name,variant_name,size_label,sku,quantity,line_total,unit_price,created_at")
          .order("created_at").range(from, to)),
        fetchAll<Review>((from, to) => client.from("reviews").select("id,product_id,rating,status,created_at").order("created_at").range(from, to)),
      ]);
      setData({ categories, products, orders, items, reviews: reviews.filter((review) => review.status === "published") });
    } catch (loadError) {
      setError(`Could not load store data: ${errorText(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, [client, user]);

  const verifyAdmin = useCallback(async (currentUser: User) => {
    if (!client) return;
    const { data: row, error: profileError } = await client.from("profiles")
      .select("id,email,full_name,role").eq("id", currentUser.id).single();
    if (profileError) throw new Error(`Could not verify admin access: ${profileError.message}`);
    if (row.role !== "admin") throw new Error("This account does not have the admin role in profiles.");
    setProfile(row as Profile);
    setUser(currentUser);
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(async ({ data: sessionData, error: sessionError }) => {
      if (sessionError) { if (active) setError(`Could not restore sign-in: ${sessionError.message}`); return; }
      if (!sessionData.session?.user) return;
      try {
        await verifyAdmin(sessionData.session.user);
      } catch (authError) {
        if (active) {
          setError(errorText(authError));
          await client.auth.signOut();
        }
      }
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) { setUser(null); setProfile(null); setData(EMPTY_DATA); }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, [client, verifyAdmin]);

  useEffect(() => { void loadData(); }, [loadData]);

  const analytics = useMemo<AnalyticsData>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - period + 1);
    const paid = paidOrders(data.orders);
    const withinPeriod = paid.filter((order) => new Date(order.placed_at || order.created_at) >= start);
    const revenue = withinPeriod.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const customerMap = new Map<string, { count: number; revenue: number }>();
    for (const order of paid) {
      const customer = customerMap.get(order.user_id) || { count: 0, revenue: 0 };
      customer.count += 1;
      customer.revenue += Number(order.total_amount || 0);
      customerMap.set(order.user_id, customer);
    }
    const customers = [...customerMap.values()];
    const repeatRate = customers.length ? customers.filter((customer) => customer.count > 1).length / customers.length * 100 : 0;
    const customerValue = customers.length
      ? paid.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) / customers.length : 0;
    const orderIds = new Set(paid.map((order) => order.id));
    const sales = new Map<string, { units: number; revenue: number }>();
    for (const item of data.items) {
      if (!orderIds.has(item.order_id)) continue;
      const key = item.variant_id || item.sku || item.product_id || item.product_name;
      const aggregate = sales.get(key) || { units: 0, revenue: 0 };
      aggregate.units += Number(item.quantity || 0);
      aggregate.revenue += Number(item.line_total || 0);
      sales.set(key, aggregate);
    }
    const salesRows: SalesRow[] = data.products.flatMap((product) => product.product_variants
      .filter((variant) => variant.is_active !== false)
      .map((variant) => {
        const total = sales.get(variant.id) || sales.get(variant.sku) || { units: 0, revenue: 0 };
        return { product, variant, ...total };
      })).sort((a, b) => b.units - a.units || b.revenue - a.revenue);
    const variants = data.products.flatMap((product) =>
      product.product_variants.filter((variant) => variant.is_active !== false));
    const lowStock = variants.filter((variant) => Number(variant.stock_quantity) > 0 &&
      Number(variant.stock_quantity) <= Number(variant.low_stock_threshold ?? 5)).length;
    const outOfStock = variants.filter((variant) => Number(variant.stock_quantity) <= 0).length;
    const healthy = variants.length - lowStock - outOfStock;
    const refundOrders = data.orders.filter((order) =>
      (order.payment_status === "refunded" || order.status === "refunded") &&
      new Date(order.placed_at || order.created_at) >= start);
    const refundDenominator = data.orders.filter((order) =>
      new Date(order.placed_at || order.created_at) >= start &&
      ["paid", "partially_refunded", "refunded"].includes(order.payment_status));
    const lowReviews = data.reviews.filter((review) => Number(review.rating) <= 2).length;
    const chart = Array.from({ length: period }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toDateString();
      const total = withinPeriod.filter((order) => new Date(order.placed_at || order.created_at).toDateString() === key)
        .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      return { date, label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), total };
    });
    return {
      revenue, aov: withinPeriod.length ? revenue / withinPeriod.length : 0, orderCount: withinPeriod.length,
      repeatRate, customerValue, salesRows, variants: variants.length, lowStock, outOfStock, healthy,
      healthyPercent: variants.length ? healthy / variants.length * 100 : 0,
      refundRate: refundDenominator.length ? refundOrders.length / refundDenominator.length * 100 : 0,
      refundDenominator: refundDenominator.length,
      lowReviewRate: data.reviews.length ? lowReviews / data.reviews.length * 100 : 0,
      lowReviews, chart,
    };
  }, [data, period]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.products.filter((product) =>
      !query || [product.name, product.slug, ...product.product_variants.map((variant) => variant.sku)]
        .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [data.products, search]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!client) {
      setError(clientConfigurationError || "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart Vite.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setLoading(true);
    const { data: result, error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }
    try {
      await verifyAdmin(result.user);
    } catch (authError) {
      setError(errorText(authError));
      await client.auth.signOut();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    if (!client) return;
    const { error: logoutError } = await client.auth.signOut();
    if (logoutError) { setError(`Sign out failed: ${logoutError.message}`); return; }
    setData(EMPTY_DATA);
    setUser(null);
    setProfile(null);
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !user) { setError("Sign in as an admin before adding products."); return; }
    if (editingProduct) {
      await handleProductUpdate(event, editingProduct);
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) { setError("Choose a product image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("The product image must be 5 MB or smaller."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    };
    if (!extension || !contentTypes[extension]) { setError("Choose a JPG, PNG or WebP image."); return; }
    const name = String(form.get("name") || "").trim();
    const sku = String(form.get("sku") || "").trim().toUpperCase();
    const price = Number(form.get("price"));
    const stock = Number(form.get("stock"));
    if (!name || !sku || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setError("Enter a product name, SKU, valid price, and whole-number stock.");
      return;
    }
    const slug = productSlug(name);
    const path = `${user.id}/${slug}.${extension}`;
    setLoading(true);
    setError("");
    let uploaded = false;
    let productId: string | null = null;
    try {
      const { error: uploadError } = await client.storage.from(STORAGE_BUCKET)
        .upload(path, file, { contentType: contentTypes[extension], upsert: false });
      if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
      uploaded = true;
      const { data: product, error: productError } = await client.from("products").insert({
        category_id: String(form.get("category_id") || "") || null,
        name, slug, kind: String(form.get("kind") || "other"),
        short_description: String(form.get("description") || "").trim() || null,
        is_active: true,
      }).select("id").single();
      if (productError) throw new Error(`Product save failed: ${productError.message}`);
      productId = product.id as string;
      const size = String(form.get("size") || "").trim();
      const { error: variantError } = await client.from("product_variants").insert({
        product_id: productId, sku, variant_name: size || "Default", size_label: size || null,
        price, stock_quantity: stock, is_default: true, is_active: true,
      });
      if (variantError) throw new Error(`Variant save failed: ${variantError.message}`);
      const { data: image } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      if (!image.publicUrl) throw new Error("Could not create a public image URL. Confirm the storage bucket is public.");
      const { error: imageError } = await client.from("product_images").insert({
        product_id: productId, image_url: image.publicUrl, alt_text: name, sort_order: 0, is_primary: true,
      });
      if (imageError) throw new Error(`Product saved, but image record failed: ${imageError.message}`);
      setProductModal(false);
      formElement.reset();
      notify(`${name} was added to your catalogue.`);
      await loadData();
    } catch (saveError) {
      const cleanup: string[] = [];
      if (productId) {
        const { error: deleteError } = await client.from("products").delete().eq("id", productId);
        if (deleteError) cleanup.push(`Product cleanup failed: ${deleteError.message}`);
      }
      if (uploaded) {
        const { error: storageError } = await client.storage.from(STORAGE_BUCKET).remove([path]);
        if (storageError) cleanup.push(`Image cleanup failed: ${storageError.message}`);
      }
      setError(`${errorText(saveError)}${cleanup.length ? ` ${cleanup.join(" ")}` : ""}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleProductUpdate(event: FormEvent<HTMLFormElement>, product: Product) {
    if (!client || !user) { setError("Sign in as an admin before editing products."); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("image");
    const selectedFile = file instanceof File && file.size > 0 ? file : null;
    if (selectedFile && selectedFile.size > 5 * 1024 * 1024) { setError("The product image must be 5 MB or smaller."); return; }

    const name = String(form.get("name") || "").trim();
    const sku = String(form.get("sku") || "").trim().toUpperCase();
    const price = Number(form.get("price"));
    const stock = Number(form.get("stock"));
    if (!name || !sku || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setError("Enter a product name, SKU, valid price, and whole-number stock.");
      return;
    }

    let imagePath: string | null = null;
    setLoading(true);
    setError("");
    try {
      let imageUrl: string | null = null;
      if (selectedFile) {
        const extension = selectedFile.name.split(".").pop()?.toLowerCase();
        const contentTypes: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
        };
        if (!extension || !contentTypes[extension]) throw new Error("Choose a JPG, PNG or WebP image.");
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from(STORAGE_BUCKET)
          .upload(path, selectedFile, { contentType: contentTypes[extension], upsert: false });
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
        imagePath = path;
        const { data: image } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        if (!image.publicUrl) throw new Error("Could not create a public image URL. Confirm the storage bucket is public.");
        imageUrl = image.publicUrl;
      }

      const { error: productError } = await client.from("products").update({
        category_id: String(form.get("category_id") || "") || null,
        name, kind: String(form.get("kind") || "other"),
        short_description: String(form.get("description") || "").trim() || null,
      }).eq("id", product.id).select("id").single();
      if (productError) throw new Error(`Product details could not be updated: ${productError.message}`);

      const variant = getVariant(product);
      const size = String(form.get("size") || "").trim();
      const variantValues = {
        sku, variant_name: size || "Default", size_label: size || null, price, stock_quantity: stock,
      };
      const { error: variantError } = variant
        ? await client.from("product_variants").update(variantValues).eq("id", variant.id).select("id").single()
        : await client.from("product_variants").insert({
          product_id: product.id, ...variantValues, is_default: true, is_active: true,
        }).select("id").single();
      if (variantError) throw new Error(`Product details were updated, but its SKU, size, price or stock could not be saved: ${variantError.message}`);

      if (imageUrl) {
        const { data: existingImages, error: existingImageError } = await client.from("product_images")
          .select("id").eq("product_id", product.id).order("is_primary", { ascending: false }).limit(1);
        if (existingImageError) throw new Error(`Product details were updated, but its image could not be loaded: ${existingImageError.message}`);
        const existingImageId = existingImages?.[0]?.id;
        const imageResult = existingImageId
          ? await client.from("product_images").update({ image_url: imageUrl, alt_text: name, is_primary: true }).eq("id", existingImageId)
          : await client.from("product_images").insert({
            product_id: product.id, image_url: imageUrl, alt_text: name, sort_order: 0, is_primary: true,
          });
        if (imageResult.error) throw new Error(`Product details were updated, but its image could not be saved: ${imageResult.error.message}`);
      }

      setProductModal(false);
      setEditingProduct(null);
      notify(`${name} was updated.`);
      await loadData();
    } catch (saveError) {
      const cleanup: string[] = [];
      if (imagePath) {
        const { error: storageError } = await client.storage.from(STORAGE_BUCKET).remove([imagePath]);
        if (storageError) cleanup.push(`Uploaded image cleanup failed: ${storageError.message}`);
      }
      setError(`${errorText(saveError)}${cleanup.length ? ` ${cleanup.join(" ")}` : ""}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleProductDelete(product: Product) {
    if (!client || !user) { setError("Sign in as an admin before deleting products."); return; }
    if (!window.confirm(`Permanently delete "${product.name}"? This cannot be undone.`)) return;

    setDeletingProductId(product.id);
    setLoading(true);
    setError("");
    try {
      const { data: deletedProduct, error: deleteError } = await client.from("products")
        .delete().eq("id", product.id).select("id").single();
      if (deleteError) {
        if (deleteError.code === "23503") {
          throw new Error(`Could not delete ${product.name} because it is still referenced by cart or inventory records. Remove those references before trying again.`);
        }
        throw new Error(`Could not delete ${product.name}: ${deleteError.message}`);
      }
      if (!deletedProduct) throw new Error(`Could not confirm deletion of ${product.name}. Refresh the dashboard and try again.`);
      notify(`${product.name} was deleted.`);
      await loadData();
    } catch (deleteError) {
      setError(errorText(deleteError));
    } finally {
      setDeletingProductId(null);
      setLoading(false);
    }
  }

  const adminName = profile?.full_name || user?.email || "Admin";

  if (!user || !profile) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <Brand />
          <div className="eyebrow">Admin workspace</div>
          <h1>Welcome to your studio.</h1>
          <p className="subtitle">Sign in with your admin email and password to manage your skincare store.</p>
          <div className="login-fields">
            <label className="field"><span>Email</span><input name="email" type="email" placeholder="you@yourbrand.com" autoComplete="username" required /></label>
            <label className="field"><span>Password</span><input name="password" type="password" placeholder="Your password" autoComplete="current-password" required /></label>
          </div>
          {error && <div className="notice error" role="alert">{error}</div>}
          {!client && !error && <div className="notice"><strong>Setup needed:</strong> fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the dev server.</div>}
          <button className="button login-submit" disabled={loading || !client}>
            {loading ? "Signing in…" : "Sign in to dashboard"} <ArrowRight size={16} />
          </button>
          <div className="notice"><strong>Secure by design:</strong> this app uses your public anon key and Supabase row-level security. Never put a service-role key in a Vite env file.</div>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <Brand />
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Workspace navigation">
          <NavButton view="overview" current={view} onSelect={setView} icon={<LayoutDashboard />} />
          <NavButton view="products" current={view} onSelect={setView} icon={<ShoppingBag />} count={data.products.length} />
          <NavButton view="analytics" current={view} onSelect={setView} icon={<ChartNoAxesCombined />} />
        </nav>
        <div className="nav-label store-label">Store</div>
        <nav className="nav-list" aria-label="Store navigation">
          <NavButton view="orders" current={view} onSelect={setView} icon={<ShoppingCart />} />
          <NavButton view="reviews" current={view} onSelect={setView} icon={<Star />} />
        </nav>
        <div className="sidebar-spacer" />
        <div className="help-card"><span className="help-icon"><CircleHelp size={17} /></span><strong>Thoughtful growth</strong><p>Healthy skincare metrics start with customers who come back.</p></div>
        <div className="user-box">
          <span className="avatar">{adminName.trim().charAt(0).toUpperCase()}</span>
          <span className="user-details"><strong>{adminName}</strong><small>{user.email}</small></span>
          <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => void handleLogout()}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">derma aura <span>/</span> <strong>{VIEW_LABELS[view]}</strong></div>
          <div className="top-actions">
            {view === "products" && <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products..." /></label>}
            <label className="period-control"><span className="sr-only">Reporting period</span><select value={period} onChange={(event) => setPeriod(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><ChevronDown size={13} /></label>
            <button className="icon-button" title="Storage settings" aria-label="Storage settings" onClick={() => setSettingsModal(true)}><Settings size={16} /></button>
            <button className="icon-button mobile-menu-button" title="Menu" aria-label="Menu" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={17} /></button>
          </div>
        </header>

        <section className="page-heading">
          <div><div className="eyebrow">{view === "overview" ? "Store overview" : "derma aura"}</div><h1>{view === "overview" ? <>Good morning, {adminName.split(" ")[0]}.</> : VIEW_LABELS[view]}</h1><p className="subtitle">{view === "overview" ? "A thoughtful look at how your store is doing." : pageDescription(view)}</p></div>
          <button className="button add-button" onClick={() => { setError(""); setEditingProduct(null); setProductModal(true); }}><Plus size={16} /> Add product</button>
        </section>

        {error && <div className="notice error page-error" role="alert"><strong>Something needs attention.</strong> {error} <button className="error-close" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} /></button></div>}
        {loading && <div className="loading-bar"><span /></div>}

        {view === "overview" && <Overview data={data} analytics={analytics} period={period} onView={setView} />}
        {view === "products" && <Products products={filteredProducts} categories={data.categories} deletingProductId={deletingProductId}
          onEdit={(product) => { setError(""); setEditingProduct(product); setProductModal(true); }}
          onDelete={handleProductDelete} />}
        {view === "analytics" && <Analytics salesRows={analytics.salesRows} reviews={data.reviews} />}
        {view === "orders" && <Orders orders={data.orders} items={data.items} />}
        {view === "reviews" && <Reviews products={data.products} reviews={data.reviews} />}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(["overview", "products", "analytics", "orders"] as View[]).map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => { setView(item); setMobileMenu(false); }}>
            {item === "overview" ? <LayoutDashboard /> : item === "products" ? <ShoppingBag /> : item === "analytics" ? <ChartNoAxesCombined /> : <ShoppingCart />}
            {VIEW_LABELS[item]}
          </button>
        ))}
      </nav>

      {productModal && <ProductModal categories={data.categories} loading={loading} product={editingProduct}
        onClose={() => { setProductModal(false); setEditingProduct(null); }} onSubmit={handleProductSubmit} />}
      {settingsModal && <SettingsModal onClose={() => setSettingsModal(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Brand() {
  return <div className="brand"><div className="brand-mark">d</div><div><div className="brand-name">derma aura<span>.</span></div><div className="brand-sub">Skincare studio</div></div></div>;
}

function NavButton({ view, current, onSelect, icon, count }: {
  view: View; current: View; onSelect: (view: View) => void; icon: ReactNode; count?: number;
}) {
  return <button className={`nav-item ${current === view ? "active" : ""}`} onClick={() => onSelect(view)}>
    {icon}<span>{VIEW_LABELS[view]}</span>{count !== undefined && <span className="nav-count">{count}</span>}
  </button>;
}

function pageDescription(view: View) {
  const descriptions: Record<View, string> = {
    overview: "", products: "Manage your skincare range and available stock.",
    analytics: "Sales velocity, inventory and customer signals.",
    orders: "Recent order activity and payment status.", reviews: "Published customer ratings by product.",
  };
  return descriptions[view];
}

function MetricCard({ title, value, foot, icon, footClass = "" }: {
  title: string; value: string; foot: ReactNode; icon: ReactNode; footClass?: string;
}) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><div className={`metric-foot ${footClass}`}>{foot}</div></article>;
}

function Badge({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "light" | "warning" | "muted" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function ProductCell({ product }: { product: Product }) {
  const image = getImage(product);
  return <div className="product-cell"><span className="product-thumb">{image ? <img src={image} alt="" /> : <Package size={18} />}</span><span><strong>{product.name}</strong><small>{product.kind || "Skincare"}</small></span></div>;
}

function EmptyRow({ columns, children }: { columns: number; children: ReactNode }) {
  return <tr><td className="empty-state" colSpan={columns}>{children}</td></tr>;
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="panel table-panel"><div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div></div>;
}

function SectionHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function OrderRows({ orders }: { orders: Order[] }) {
  if (!orders.length) return <EmptyRow columns={6}>No orders have been placed yet.</EmptyRow>;
  return <>{orders.map((order) => <tr key={order.id}>
    <td><strong>{order.order_number || order.id.slice(0, 8)}</strong></td>
    <td>{order.customer_name || order.customer_email || "Customer"}</td>
    <td>{formatDate(order.placed_at || order.created_at)}</td>
    <td><Badge tone={order.payment_status === "paid" ? "light" : order.payment_status === "refunded" ? "warning" : "muted"}>{(order.payment_status || "pending").replaceAll("_", " ")}</Badge></td>
    <td><Badge tone={order.status === "delivered" ? "light" : "muted"}>{(order.status || "pending").replaceAll("_", " ")}</Badge></td>
    <td><strong>{currency(Number(order.total_amount))}</strong></td>
  </tr>)}</>;
}

function Overview({ data, analytics, period, onView }: {
  data: DataState;
  analytics: AnalyticsData;
  period: number;
  onView: (view: View) => void;
}) {
  const metrics = analytics;
  return <>
    <div className="stats-grid">
      <MetricCard title="Net sales" value={currency(metrics.revenue)} icon={<ChartNoAxesCombined size={16} />} foot={`${metrics.orderCount} paid ${metrics.orderCount === 1 ? "order" : "orders"} · last ${period} days`} />
      <MetricCard title="Average order value" value={currency(metrics.aov)} icon={<BadgeIndianRupee size={16} />} foot="Revenue divided by paid orders" />
      <MetricCard title="Repeat purchase rate" value={`${metrics.repeatRate.toFixed(1)}%`} icon={<Activity size={16} />} foot={metrics.repeatRate >= 25 && metrics.repeatRate <= 45 ? "Within the 25–45% benchmark" : "Target range: 25–45%"} footClass={metrics.repeatRate >= 25 && metrics.repeatRate <= 45 ? "good" : "warn"} />
      <MetricCard title="Avg. customer value" value={currency(metrics.customerValue)} icon={<Users size={16} />} foot="Observed paid revenue per customer" />
    </div>

    <div className="data-grid">
      <article className="panel sales-panel">
        <div className="panel-head"><div><h2>Sales over time</h2><p>Daily paid revenue in the selected period</p></div><Badge><i className="dot" /> Live data</Badge></div>
        <div className="chart-total">{currency(metrics.revenue)}</div><div className="chart-label">Gross sales · INR</div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
          <AreaChart data={metrics.chart} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#829a83" stopOpacity={0.3} /><stop offset="100%" stopColor="#829a83" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke="#eceee8" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#98a098", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={35} />
            <YAxis tick={{ fill: "#98a098", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => value >= 1000 ? `₹${(value / 1000).toFixed(0)}k` : `₹${value}`} width={48} />
            <Tooltip formatter={(value) => [currency(Number(value)), "Sales"]} labelStyle={{ color: "#36443b" }} contentStyle={{ border: "1px solid #e8ebe4", borderRadius: 9, fontSize: 11 }} />
            <Area type="monotone" dataKey="total" stroke="#68816d" strokeWidth={2.5} fill="url(#salesFill)" />
          </AreaChart>
        </ResponsiveContainer></div>
      </article>
      <article className="panel health-panel">
        <div className="panel-head"><div><h2>Product health</h2><p>Available inventory snapshot</p></div><Badge tone="light">{metrics.variants} SKUs</Badge></div>
        <div className="stock-content">
          <div className="stock-ring" style={{ "--stock": `${metrics.healthyPercent}%` } as CSSProperties}><span><strong>{Math.round(metrics.healthyPercent)}%</strong><small>in stock</small></span></div>
          <div className="stock-legend">
            <div><span><i className="swatch healthy-swatch" />Healthy stock</span><strong>{metrics.healthy}</strong></div>
            <div><span><i className="swatch low-swatch" />Running low</span><strong>{metrics.lowStock}</strong></div>
            <div><span><i className="swatch out-swatch" />Out of stock</span><strong>{metrics.outOfStock}</strong></div>
          </div>
        </div>
        <div className="insight">{metrics.variants ? <><strong>{metrics.lowStock + metrics.outOfStock} SKU{metrics.lowStock + metrics.outOfStock === 1 ? "" : "s"}</strong> {metrics.lowStock + metrics.outOfStock === 1 ? "needs" : "need"} a restock check{metrics.outOfStock ? `, including ${metrics.outOfStock} out of stock` : ""}.</> : "Add a product to start tracking inventory."}</div>
      </article>
    </div>

    <SectionHeading title="Top products" subtitle="Best performers by units sold" action={<button className="button secondary" onClick={() => onView("products")}>View products <ArrowRight size={14} /></button>} />
    <Table headers={["Product", "SKU", "Units sold", "Revenue", "Available stock", "Margin"]}>
      {metrics.salesRows.length ? metrics.salesRows.slice(0, 6).map(({ product, variant, units, revenue }) => <tr key={variant.id}>
        <td><ProductCell product={product} /></td><td>{variant.sku}</td><td><strong>{units}</strong></td><td><strong>{currency(revenue)}</strong></td><td>{variant.stock_quantity}</td><td><Badge tone="muted">Cost unavailable</Badge></td>
      </tr>) : <EmptyRow columns={6}>No active product variants found.</EmptyRow>}
    </Table>

    <SectionHeading title="Skincare business signals" subtitle="Useful benchmarks, grounded in your current store data" />
    <div className="metric-note">
      <Signal title="LTV : CAC" badge="Not tracked" tone="muted" value="3:1 target" copy="Acquisition cost is not in the existing schema, so the ratio cannot be calculated." />
      <Signal title="Repeat purchase rate" badge="25–45% target" value={`${metrics.repeatRate.toFixed(1)}%`} copy="Share of customers with more than one eligible paid order, using all available order history." />
      <Signal title="Average order value" badge="Bundle opportunity" value={currency(metrics.aov)} copy="Routine kits, cross-sells and larger sizes can grow basket value." />
      <Signal title="Gross margin by SKU" badge="Cost missing" tone="muted" value="70–80%+" copy="Product cost is not stored; margin is intentionally not estimated." />
      <Signal title="Returns & complaints" badge="Proxy only" tone="warning" value={metrics.refundDenominator ? `${metrics.refundRate.toFixed(1)}% refunded-order proxy` : "No refunds recorded"} copy="Refunds are a limited proxy; there is no dedicated return or complaint record." />
      <Signal title="Customer feedback" badge="Review signal" value={data.reviews.length ? `${metrics.lowReviewRate.toFixed(1)}% low-rating reviews` : "No reviews"} copy="Share of 1–2 star published reviews; this is not a substitute for complaints tracking." />
    </div>
    <div className="notice metric-caveat"><strong>How to read these numbers:</strong> sales and AOV use paid, non-cancelled orders. Customer value and repeat rate use all available paid history. CAC and product costs do not exist in your current tables. Refund rate is only a rough proxy, not a true return rate.</div>

    <SectionHeading title="Recent orders" subtitle="The latest orders from your store" action={<Badge tone="light">{data.orders.length} orders</Badge>} />
    <Table headers={["Order", "Customer", "Date", "Payment", "Status", "Total"]}><OrderRows orders={data.orders.slice(0, 8)} /></Table>
  </>;
}

function Signal({ title, badge, value, copy, tone = "light" }: { title: string; badge: string; value: string; copy: string; tone?: "light" | "warning" | "muted" }) {
  return <article className="note-card"><div className="note-top"><span className="note-title">{title}</span><Badge tone={tone}>{badge}</Badge></div><div className="note-value">{value}</div><div className="note-copy">{copy}</div></article>;
}

function Products({ products, categories, deletingProductId, onEdit, onDelete }: {
  products: Product[]; categories: Category[]; deletingProductId: string | null;
  onEdit: (product: Product) => void; onDelete: (product: Product) => void;
}) {
  return <>
    <SectionHeading title="Product catalogue" subtitle="Manage your skincare range and stock" action={<Badge tone="light">{products.length} products</Badge>} />
    <Table headers={["Product", "Category", "SKU / size", "Price", "Stock", "Status", "Actions"]}>
      {products.length ? products.map((product) => {
        const variant = getVariant(product);
        const category = categories.find((item) => item.id === product.category_id);
        return <tr key={product.id}><td><ProductCell product={product} /></td><td>{category?.name || "Uncategorised"}</td>
          <td>{variant?.sku || "—"}<small className="sub-cell">{variant?.size_label || variant?.variant_name || ""}</small></td>
          <td>{variant ? currency(Number(variant.price)) : "—"}</td><td>{getStock(product)}</td>
          <td><Badge tone={product.is_active ? "light" : "muted"}>{product.is_active ? "Active" : "Inactive"}</Badge></td>
          <td><div className="product-actions">
            <button className="icon-button" type="button" title={`Edit ${product.name}`} aria-label={`Edit ${product.name}`}
              disabled={deletingProductId !== null} onClick={() => onEdit(product)}><Pencil size={15} /></button>
            <button className="icon-button delete-button" type="button" title={`Delete ${product.name}`} aria-label={`Delete ${product.name}`}
              disabled={deletingProductId !== null} onClick={() => onDelete(product)}><Trash2 size={15} /></button>
          </div></td></tr>;
      }) : <EmptyRow columns={7}>No products yet, or no products match your search.</EmptyRow>}
    </Table>
  </>;
}

function Analytics({ salesRows, reviews }: { salesRows: SalesRow[]; reviews: Review[] }) {
  return <>
    <SectionHeading title="Product analytics" subtitle="Sales velocity, inventory and customer signals" />
    <Table headers={["Product / SKU", "Units sold", "Revenue", "Stock", "Review rating", "Gross margin"]}>
      {salesRows.length ? salesRows.map(({ product, variant, units, revenue }) => {
        const productReviews = reviews.filter((review) => review.product_id === product.id);
        const rating = productReviews.length
          ? (productReviews.reduce((sum, review) => sum + Number(review.rating), 0) / productReviews.length).toFixed(1) : "—";
        return <tr key={variant.id}><td><ProductCell product={product} /><small className="sub-cell">{variant.sku}</small></td>
          <td><strong>{units}</strong></td><td>{currency(revenue)}</td><td>{variant.stock_quantity}</td><td>{rating}{rating !== "—" ? " ★" : ""}</td><td><Badge tone="muted">Cost unavailable</Badge></td></tr>;
      }) : <EmptyRow columns={6}>No active product variants found.</EmptyRow>}
    </Table>
    <div className="notice"><strong>Data limitations:</strong> acquisition cost, product cost, and structured return/complaint records do not exist in the current schema. Those measures are marked unavailable rather than estimated.</div>
  </>;
}

function Orders({ orders, items }: { orders: Order[]; items: OrderItem[] }) {
  return <>
    <SectionHeading title="Orders" subtitle="Recent order activity and payment status" action={
      <button className="button secondary" type="button" onClick={() => downloadOrdersCsv(orders, items)}>
        <Download size={15} /> Download CSV
      </button>
    } />
    <Table headers={["Order", "Customer", "Date", "Payment", "Status", "Total"]}><OrderRows orders={orders.slice(0, 100)} /></Table>
  </>;
}

function Reviews({ products, reviews }: { products: Product[]; reviews: Review[] }) {
  const grouped = new Map<string, { count: number; stars: number; low: number }>();
  for (const review of reviews) {
    const aggregate = grouped.get(review.product_id) || { count: 0, stars: 0, low: 0 };
    aggregate.count += 1;
    aggregate.stars += Number(review.rating);
    if (Number(review.rating) <= 2) aggregate.low += 1;
    grouped.set(review.product_id, aggregate);
  }
  const rows = [...grouped].map(([productId, metrics]) => ({
    product: products.find((item) => item.id === productId), ...metrics,
  })).filter((row): row is typeof row & { product: Product } => Boolean(row.product))
    .sort((a, b) => b.count - a.count);
  return <>
    <SectionHeading title="Product reviews" subtitle="Published customer ratings by product" action={<Badge tone="light">{reviews.length} reviews</Badge>} />
    <Table headers={["Product", "Reviews", "Average rating", "1–2 star reviews", "Signal"]}>
      {rows.length ? rows.map((row) => <tr key={row.product.id}><td><ProductCell product={row.product} /></td><td>{row.count}</td>
        <td><strong>{(row.stars / row.count).toFixed(1)} ★</strong></td><td>{row.low}</td>
        <td><Badge tone={row.low ? "warning" : "light"}>{row.low ? "Review feedback" : "Looking good"}</Badge></td></tr>)
        : <EmptyRow columns={5}>No published product reviews yet.</EmptyRow>}
    </Table>
    <div className="notice">Reviews are feedback signals only; they are not a substitute for tracking adverse reactions or product complaints.</div>
  </>;
}

function ProductModal({ categories, loading, product, onClose, onSubmit }: {
  categories: Category[]; loading: boolean; product: Product | null; onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const variant = product ? getVariant(product) : null;
  const [preview, setPreview] = useState(product ? getImage(product) : "");
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal" onSubmit={onSubmit}>
      <div className="modal-head"><div><h2>{product ? "Edit product" : "Add a product"}</h2><p>Uses your existing products, variants and product_images tables.</p></div><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={17} /></button></div>
      <div className="form-grid">
        <div className="field full"><span>Product image {product ? "(optional)" : "*"}</span><label className="upload-box" htmlFor="productImage">
          <input id="productImage" name="image" type="file" accept="image/png,image/jpeg,image/webp" required={!product}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) setPreview(URL.createObjectURL(file)); }} />
          {preview ? <img src={preview} alt="Product image preview" /> : <span className="upload-hint"><Upload size={20} /><strong>Choose an image to upload</strong><small>JPG, PNG or WebP · up to 5 MB</small></span>}
        </label></div>
        <label className="field full"><span>Product name *</span><input name="name" defaultValue={product?.name || ""} required maxLength={120} placeholder="e.g. Daily Barrier Moisturiser" /></label>
        <label className="field"><span>Category</span><select name="category_id" defaultValue={product?.category_id || ""}><option value="">Uncategorised</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field"><span>Product type</span><select name="kind" defaultValue={product?.kind || "serum"}><option value="serum">Serum</option><option value="cleanser">Cleanser</option><option value="moisturiser">Moisturiser</option><option value="sunscreen">Sunscreen</option><option value="toner">Toner</option><option value="other">Other</option></select></label>
        <label className="field"><span>SKU *</span><input name="sku" defaultValue={variant?.sku || ""} required maxLength={80} placeholder="AURA-SER-001" /></label>
        <label className="field"><span>Size / variant</span><input name="size" defaultValue={variant?.size_label || variant?.variant_name || ""} maxLength={60} placeholder="30 ml" /></label>
        <label className="field"><span>Selling price (₹) *</span><input name="price" type="number" defaultValue={variant?.price ?? ""} min="0" step="0.01" required placeholder="649" /></label>
        <label className="field"><span>Opening stock *</span><input name="stock" type="number" defaultValue={variant?.stock_quantity ?? ""} min="0" step="1" required placeholder="25" /></label>
        <label className="field full"><span>Short description</span><textarea name="description" defaultValue={product?.short_description || ""} maxLength={300} placeholder="A few words about what makes this product special." /></label>
        <p className="form-help full">{product ? "Leave the image unchanged, or choose a replacement. Changes are saved to the existing Supabase rows." : "The image uploads to the Supabase Storage bucket configured in your env file. No database tables or columns are changed."}</p>
      </div>
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button" type="submit" disabled={loading}>{loading ? "Saving…" : product ? "Save changes" : "Save product"}</button></div>
    </form>
  </div>;
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal small"><div className="modal-head"><div><h2>Store connection</h2><p>Supabase settings are managed in your local env file.</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={17} /></button></div>
      <div className="settings-list"><p><strong>Project URL</strong><code>VITE_SUPABASE_URL</code></p><p><strong>Public key</strong><code>VITE_SUPABASE_ANON_KEY</code></p><p><strong>Product images bucket</strong><code>{STORAGE_BUCKET}</code></p></div>
      <div className="notice"><strong>Storage:</strong> create a public bucket with this name and allow authenticated admins to upload. Never use a service-role key in this frontend.</div>
      <div className="modal-actions"><button className="button" onClick={onClose}>Done</button></div>
    </div>
  </div>;
}

export default App;
