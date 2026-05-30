import { useEffect, useMemo, useRef, useState } from "react";
import { FaFacebookF, FaInstagram, FaTelegramPlane, FaTiktok, FaVk, FaWhatsapp, FaYoutube } from "react-icons/fa";

type View = "products" | "orders" | "clients" | "about" | "settings";
type Category = { id: number; name: string; sort_order: number };
type Subcategory = { id: number; category_id: number; name: string; sort_order: number };
type Product = {
  id: number;
  uuid: string;
  category_id: number | null;
  subcategory_id: number | null;
  name: string;
  short_description: string;
  description: string;
  price: number;
  image_url: string | null;
  image_key: string | null;
  is_active: boolean;
};
type SocialLink = { id: number; platform: string; url: string; sort_order: number };
type Settings = {
  store_name: string;
  slogan: string;
  about_text: string;
  address: string;
  phone: string;
  working_hours: string;
  delivery_info: string;
  pickup_info: string;
  admin_login: string;
  sbp_provider_name: string | null;
  sbp_public_label: string | null;
  social_links: SocialLink[];
};
type OrderItem = { id: number; product_id: number | null; image_url: string | null; product_name: string; unit_price: number; quantity: number; line_total: number };
type Order = {
  id: number;
  user_id: number | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_mode: string;
  delivery_address: string | null;
  subtotal: number;
  payment_status: string;
  fulfillment_status: string;
  payment_url: string | null;
  created_at: string;
  items: OrderItem[];
};
type Client = {
  id: number;
  provider: string;
  provider_user_id: string;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  last_login_at: string | null;
  orders_count: number;
};
type ClientDetail = Client & { orders: Order[] };
type UploadResponse = { key: string; url: string };
type ProductDraft = {
  id: number | null;
  uuid: string;
  category_id: number | null;
  subcategory_id: number | null;
  name: string;
  short_description: string;
  description: string;
  price: number;
  image_url: string | null;
  image_key: string | null;
  is_active: boolean;
};
type ProductFilter =
  | { kind: "all" }
  | { kind: "category"; categoryId: number }
  | { kind: "subcategory"; categoryId: number; subcategoryId: number };
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};
type TextDialogState = {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
};
type OrderStatusDialogState = {
  orderId: number;
  value: string;
};
type SortDirection = "asc" | "desc";
type ProductSortKey = "name" | "price" | "category" | "subcategory";
type OrderSortKey = "id" | "created_at" | "customer_name" | "subtotal" | "fulfillment_status" | "payment_status" | "delivery_mode";
type ClientSortKey = "provider_user_id" | "provider" | "full_name" | "phone" | "email" | "last_login_at" | "orders_count";
type ClientOrderSortKey = "id" | "created_at" | "subtotal" | "fulfillment_status" | "payment_status";
type AdminRoute = {
  view: View;
  productId: number | null;
  productCreate: boolean;
  clientId: number | null;
  orderId: number | null;
};

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "kiosk_admin_token";
const UNAUTHORIZED_EVENT = "kiosk-admin-unauthorized";
const PAGINATION_MAX_LINES = Math.max(1, Number.parseInt(import.meta.env.VITE_PAGINATION_MAX_LINES || "20", 10) || 20);
const SOCIAL_PLATFORM_OPTIONS = [
  { value: "telegram", label: "Telegram" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "vk", label: "VK" },
  { value: "facebook", label: "Facebook" },
] as const;

const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  id: null,
  uuid: crypto.randomUUID(),
  category_id: null,
  subcategory_id: null,
  name: "",
  short_description: "",
  description: "",
  price: 0,
  image_url: null,
  image_key: null,
  is_active: true,
};
const DEFAULT_SOCIAL_PLATFORM = "telegram";

function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function requestHeaders(init?: RequestInit) {
  const token = getToken();
  const headers = new Headers(init?.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: requestHeaders(init),
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) message = body.detail;
    } catch {
      // ignore
    }
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

function formatPrice(value: number) {
  return `${value} ₽`;
}

function formatPaymentStatus(status: string) {
  const labels: Record<string, string> = {
    paid: "Оплачен",
    pending: "Ожидает оплаты",
    failed: "Ошибка оплаты",
  };
  return labels[status] || status;
}

function formatFulfillmentStatus(status: string) {
  const labels: Record<string, string> = {
    new: "Новый",
    shipped: "Отправлен",
    canceled: "Отменен",
  };
  return labels[status] || status;
}

function getClientLogin(client: Pick<Client, "provider" | "provider_user_id" | "username" | "email">) {
  if (client.provider === "telegram") {
    return client.username || client.provider_user_id;
  }
  return client.username || client.email || client.provider_user_id;
}

function getClientProviderLabel(provider: string) {
  if (provider === "telegram") return "Telegram";
  if (provider === "guest") return "Гость";
  return provider;
}

function getDisplayImageKey(imageKey: string | null, imageUrl: string | null) {
  if (imageKey) return imageKey;
  if (!imageUrl) return "Файл не загружен";
  try {
    const url = new URL(imageUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(-2).join("/");
    }
    return parts.at(-1) || imageUrl;
  } catch {
    return imageUrl;
  }
}

function getPreviewImageUrl(imageUrl: string | null, nonce: number) {
  if (!imageUrl) return null;
  if (!nonce) return imageUrl;
  const separator = imageUrl.includes("?") ? "&" : "?";
  return `${imageUrl}${separator}v=${nonce}`;
}

function withCacheBuster(url: string, nonce: number) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("v", String(nonce));
    return parsed.toString();
  } catch {
    const [base, query = ""] = url.split("?", 2);
    const params = new URLSearchParams(query);
    params.set("v", String(nonce));
    const nextQuery = params.toString();
    return nextQuery ? `${base}?${nextQuery}` : base;
  }
}

function normalizeSocialLinks(links: SocialLink[]) {
  return links.map((item, index) => ({ ...item, sort_order: index + 1 }));
}

function parseAdminRoute(hash: string): AdminRoute {
  const raw = hash.replace(/^#/, "");
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  const [viewSegment = "products", idSegment] = normalized.split("/").filter(Boolean);
  const view = (["products", "orders", "clients", "about", "settings"].includes(viewSegment) ? viewSegment : "products") as View;
  const id = idSegment ? Number(idSegment) : null;

  return {
    view,
    productId: view === "products" && Number.isInteger(id) ? id : null,
    productCreate: view === "products" && idSegment === "new",
    clientId: view === "clients" && Number.isInteger(id) ? id : null,
    orderId: view === "orders" && Number.isInteger(id) ? id : null,
  };
}

function getPageItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
  };
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "ru", { sensitivity: "base", numeric: true });
}

function getSocialIcon(platform: string) {
  switch (platform) {
    case "telegram":
      return <FaTelegramPlane />;
    case "instagram":
      return <FaInstagram />;
    case "whatsapp":
      return <FaWhatsapp />;
    case "youtube":
      return <FaYoutube />;
    case "tiktok":
      return <FaTiktok />;
    case "vk":
      return <FaVk />;
    case "facebook":
      return <FaFacebookF />;
    default:
      return <FaTelegramPlane />;
  }
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(getToken()));
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("admin");
  const [adminPasswordDirty, setAdminPasswordDirty] = useState(false);
  const [adminPasswordVisible, setAdminPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("products");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [productsSearch, setProductsSearch] = useState("");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientDetail | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [editingImageNonce, setEditingImageNonce] = useState(0);
  const [productFilter, setProductFilter] = useState<ProductFilter>({ kind: "all" });
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductDraft | null>(null);
  const [draftCategoryId, setDraftCategoryId] = useState<number | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [textDialogState, setTextDialogState] = useState<TextDialogState | null>(null);
  const [textDialogValue, setTextDialogValue] = useState("");
  const [orderStatusDialog, setOrderStatusDialog] = useState<OrderStatusDialogState | null>(null);
  const [productsPage, setProductsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [clientsPage, setClientsPage] = useState(1);
  const [clientOrdersPage, setClientOrdersPage] = useState(1);
  const [productsSort, setProductsSort] = useState<{ key: ProductSortKey; direction: SortDirection }>({ key: "name", direction: "asc" });
  const [ordersSort, setOrdersSort] = useState<{ key: OrderSortKey; direction: SortDirection }>({ key: "created_at", direction: "desc" });
  const [clientsSort, setClientsSort] = useState<{ key: ClientSortKey; direction: SortDirection }>({ key: "last_login_at", direction: "desc" });
  const [clientOrdersSort, setClientOrdersSort] = useState<{ key: ClientOrderSortKey; direction: SortDirection }>({
    key: "created_at",
    direction: "desc",
  });
  const productsTreeRef = useRef<HTMLDivElement | null>(null);

  function navigateTo(path: string) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (window.location.hash === `#${normalized}`) {
      void applyRoute(parseAdminRoute(window.location.hash));
      return;
    }
    window.location.hash = normalized;
  }

  async function applyRoute(route: AdminRoute) {
    setView(route.view);

    if (route.view !== "products") {
      setEditingProduct(null);
      setDraftCategoryId(null);
    } else if (!route.productId && !route.productCreate) {
      setEditingProduct(null);
      setDraftCategoryId(null);
    }
    if (route.view === "products" && route.productCreate) {
      const initialCategoryId =
        productFilter.kind === "subcategory"
          ? productFilter.categoryId
          : productFilter.kind === "category"
            ? productFilter.categoryId
            : (categories[0]?.id ?? null);
      const initialSubcategoryId =
        productFilter.kind === "subcategory"
          ? productFilter.subcategoryId
          : initialCategoryId
            ? (subcategories.find((item) => item.category_id === initialCategoryId)?.id ?? null)
            : null;
      setEditingImageNonce(0);
      setDraftCategoryId(initialCategoryId);
      setEditingProduct({
        ...EMPTY_PRODUCT_DRAFT,
        uuid: crypto.randomUUID(),
        category_id: initialCategoryId,
        subcategory_id: initialSubcategoryId,
      });
      setRouteLoading(false);
      setSelectedClient(null);
      setSelectedOrder(null);
      return;
    }

    if (route.view === "products" && route.productId) {
      const item = products.find((product) => product.id === route.productId);
      if (item) {
        const selectedSubcategory = item.subcategory_id ? subcategoryMap.get(item.subcategory_id) : null;
        setEditingImageNonce(0);
        setDraftCategoryId(selectedSubcategory?.category_id ?? item.category_id ?? null);
        setEditingProduct({
          id: item.id,
          uuid: item.uuid,
          category_id: item.category_id,
          subcategory_id: item.subcategory_id,
          name: item.name,
          short_description: item.short_description,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          image_key: item.image_key,
          is_active: item.is_active,
        });
      } else {
        setEditingProduct(null);
      }
      setRouteLoading(false);
      setSelectedClient(null);
      setSelectedOrder(null);
      return;
    }

    if (route.view === "clients" && route.clientId) {
      setRouteLoading(true);
      setSelectedOrder(null);
      setSelectedClient(null);
      try {
        const detail = await request<ClientDetail>(`/admin/clients/${route.clientId}`);
        setSelectedClient(detail);
      } finally {
        setRouteLoading(false);
      }
      return;
    }

    if (route.view === "orders" && route.orderId) {
      setRouteLoading(true);
      setSelectedClient(null);
      setSelectedOrder(null);
      try {
        const detail = await request<Order>(`/admin/orders/${route.orderId}`);
        setSelectedOrder(detail);
      } finally {
        setRouteLoading(false);
      }
      return;
    }

    setRouteLoading(false);
    setSelectedClient(null);
    setSelectedOrder(null);
  }

  async function refreshAll() {
    const [nextSettings, nextCategories, nextSubcategories, nextProducts, nextOrders, nextClients] = await Promise.all([
      request<Settings>("/admin/settings"),
      request<Category[]>("/admin/categories"),
      request<Subcategory[]>("/admin/subcategories"),
      request<Product[]>("/admin/products"),
      request<Order[]>("/admin/orders"),
      request<Client[]>("/admin/clients"),
    ]);
    setSettings(nextSettings);
    setCategories(nextCategories);
    setSubcategories(nextSubcategories);
    setProducts(nextProducts);
    setOrders(nextOrders);
    setClients(nextClients);
  }

  useEffect(() => {
    if (!loggedIn) return;
    void refreshAll().catch((err) => setError(err.message));
  }, [loggedIn]);

  useEffect(() => {
    function handleUnauthorized() {
      window.localStorage.removeItem(TOKEN_KEY);
      window.location.hash = "";
      setLoggedIn(false);
      setError("Сеанс истек. Войдите снова.");
      setView("products");
      setSettings(null);
      setCategories([]);
      setSubcategories([]);
      setProducts([]);
      setOrders([]);
      setClients([]);
      setProductsSearch("");
      setOrdersSearch("");
      setSelectedClient(null);
      setSelectedOrder(null);
      setEditingProduct(null);
      setConfirmState(null);
      setMenuKey(null);
      setSearch("");
      setPassword("admin");
      setAdminPassword("admin");
      setAdminPasswordDirty(false);
      setAdminPasswordVisible(false);
    }

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    function handleHashChange() {
      void applyRoute(parseAdminRoute(window.location.hash)).catch((err) => setError(err instanceof Error ? err.message : "Ошибка навигации"));
    }

    if (!window.location.hash) {
      window.location.hash = "/products";
    } else {
      handleHashChange();
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [categories, loggedIn, productFilter, products, subcategories]);

  useEffect(() => {
    if (view !== "products") setMenuKey(null);
  }, [view]);

  useEffect(() => {
    if (view === "products" && !editingProduct) {
      setProductsPage(1);
    }
  }, [editingProduct, productFilter, view]);

  useEffect(() => {
    if (view === "orders" && !selectedOrder) {
      setOrdersPage(1);
    }
  }, [selectedOrder, view]);

  useEffect(() => {
    if (view === "clients" && !selectedClient) {
      setClientsPage(1);
    }
  }, [selectedClient, view]);

  useEffect(() => {
    if (selectedClient) {
      setClientOrdersPage(1);
    }
  }, [selectedClient]);

  useEffect(() => {
    setClientsPage(1);
  }, [search]);

  useEffect(() => {
    setProductsPage(1);
  }, [productsSearch]);

  useEffect(() => {
    setOrdersPage(1);
  }, [ordersSearch]);

  useEffect(() => {
    if (view !== "orders") return;
    const timer = window.setInterval(() => {
      void request<Order[]>("/admin/orders")
        .then(async (nextOrders) => {
          setOrders(nextOrders);
          if (selectedOrder) {
            const detail = await request<Order>(`/admin/orders/${selectedOrder.id}`);
            setSelectedOrder(detail);
          }
        })
        .catch(() => {
          // keep current UI on polling failure
        });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [selectedOrder, view]);

  useEffect(() => {
    if (view !== "products" || !menuKey) return;

    function handlePointerDown(event: MouseEvent) {
      if (!productsTreeRef.current) return;
      if (productsTreeRef.current.contains(event.target as Node)) return;
      setMenuKey(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuKey, view]);

  async function handleLogin() {
    try {
      const token = await request<{ access_token: string }>("/admin/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });
      window.localStorage.setItem(TOKEN_KEY, token.access_token);
      setAdminPassword(password);
      setAdminPasswordDirty(false);
      setAdminPasswordVisible(false);
      setLoggedIn(true);
      setError(null);
      if (!window.location.hash) {
        window.location.hash = "/products";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.hash = "";
    setLoggedIn(false);
    setError(null);
    setView("products");
    setSettings(null);
    setCategories([]);
    setSubcategories([]);
    setProducts([]);
    setOrders([]);
    setClients([]);
    setProductsSearch("");
    setOrdersSearch("");
    setSelectedClient(null);
    setSelectedOrder(null);
    setEditingProduct(null);
    setConfirmState(null);
    setMenuKey(null);
    setSearch("");
    setPassword("admin");
    setAdminPassword("admin");
    setAdminPasswordDirty(false);
    setAdminPasswordVisible(false);
  }

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter((item) =>
      [item.full_name, item.username, item.email, item.phone].some((value) => (value || "").toLowerCase().includes(q))
    );
  }, [clients, search]);

  const filteredOrders = useMemo(() => {
    const q = ordersSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((item) =>
      [
        String(item.id),
        item.customer_name,
        item.customer_phone,
        item.customer_email || "",
        item.delivery_mode === "delivery" ? "Доставка" : "Самовывоз",
        item.delivery_address || "",
        formatFulfillmentStatus(item.fulfillment_status),
        formatPaymentStatus(item.payment_status),
      ].some((value) => value.toLowerCase().includes(q))
    );
  }, [orders, ordersSearch]);

  const sortedOrders = useMemo(() => {
    const direction = ordersSort.direction === "asc" ? 1 : -1;
    return [...filteredOrders].sort((a, b) => {
      let result = 0;
      switch (ordersSort.key) {
        case "id":
          result = a.id - b.id;
          break;
        case "created_at":
          result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "customer_name":
          result = compareText(a.customer_name, b.customer_name);
          break;
        case "subtotal":
          result = a.subtotal - b.subtotal;
          break;
        case "fulfillment_status":
          result = compareText(formatFulfillmentStatus(a.fulfillment_status), formatFulfillmentStatus(b.fulfillment_status));
          break;
        case "payment_status":
          result = compareText(formatPaymentStatus(a.payment_status), formatPaymentStatus(b.payment_status));
          break;
        case "delivery_mode":
          result = compareText(a.delivery_mode === "delivery" ? "Доставка" : "Самовывоз", b.delivery_mode === "delivery" ? "Доставка" : "Самовывоз");
          break;
      }
      return result * direction;
    });
  }, [filteredOrders, ordersSort]);

  const sortedClients = useMemo(() => {
    const direction = clientsSort.direction === "asc" ? 1 : -1;
    return [...filteredClients].sort((a, b) => {
      let result = 0;
      switch (clientsSort.key) {
        case "provider_user_id":
          result = compareText(getClientLogin(a), getClientLogin(b));
          break;
        case "provider":
          result = compareText(getClientProviderLabel(a.provider), getClientProviderLabel(b.provider));
          break;
        case "full_name":
          result = compareText(a.full_name || a.username || "", b.full_name || b.username || "");
          break;
        case "phone":
          result = compareText(a.phone || "", b.phone || "");
          break;
        case "email":
          result = compareText(a.email || "", b.email || "");
          break;
        case "last_login_at":
          result = new Date(a.last_login_at || 0).getTime() - new Date(b.last_login_at || 0).getTime();
          break;
        case "orders_count":
          result = a.orders_count - b.orders_count;
          break;
      }
      return result * direction;
    });
  }, [clientsSort, filteredClients]);

  const subcategoryMap = useMemo(() => new Map(subcategories.map((item) => [item.id, item])), [subcategories]);
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);

  const filteredProducts = useMemo(() => {
    const byTree =
      productFilter.kind === "all"
        ? products
        : productFilter.kind === "subcategory"
          ? products.filter((item) => item.subcategory_id === productFilter.subcategoryId)
          : products.filter((item) => {
              const subcategory = item.subcategory_id ? subcategoryMap.get(item.subcategory_id) : null;
              return subcategory?.category_id === productFilter.categoryId || item.category_id === productFilter.categoryId;
            });
    const q = productsSearch.trim().toLowerCase();
    if (!q) return byTree;
    return byTree.filter((item) => {
      const subcategory = item.subcategory_id ? subcategoryMap.get(item.subcategory_id) : null;
      const category = subcategory ? categoryMap.get(subcategory.category_id) : (item.category_id ? categoryMap.get(item.category_id) : null);
      return [
        item.name,
        item.short_description,
        item.description,
        String(item.price),
        category?.name || "",
        subcategory?.name || "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [categoryMap, productFilter, products, productsSearch, subcategoryMap]);

  const sortedProducts = useMemo(() => {
    const direction = productsSort.direction === "asc" ? 1 : -1;
    return [...filteredProducts].sort((a, b) => {
      const aSubcategory = a.subcategory_id ? subcategoryMap.get(a.subcategory_id) : null;
      const bSubcategory = b.subcategory_id ? subcategoryMap.get(b.subcategory_id) : null;
      const aCategory = aSubcategory ? categoryMap.get(aSubcategory.category_id) : (a.category_id ? categoryMap.get(a.category_id) : null);
      const bCategory = bSubcategory ? categoryMap.get(bSubcategory.category_id) : (b.category_id ? categoryMap.get(b.category_id) : null);
      let result = 0;
      switch (productsSort.key) {
        case "name":
          result = compareText(a.name, b.name);
          break;
        case "price":
          result = a.price - b.price;
          break;
        case "category":
          result = compareText(aCategory?.name || "", bCategory?.name || "");
          break;
        case "subcategory":
          result = compareText(aSubcategory?.name || "", bSubcategory?.name || "");
          break;
      }
      return result * direction;
    });
  }, [categoryMap, filteredProducts, productsSort, subcategoryMap]);

  const productPanelTitle = useMemo(() => {
    if (productFilter.kind === "all") return "Все товары";
    if (productFilter.kind === "category") {
      return categoryMap.get(productFilter.categoryId)?.name || "Товары";
    }
    const category = categoryMap.get(productFilter.categoryId);
    const subcategory = subcategoryMap.get(productFilter.subcategoryId);
    return `${category?.name || "Категория"}  -  ${subcategory?.name || "Подкатегория"}`;
  }, [categoryMap, productFilter, subcategoryMap]);

  const socialLinks = useMemo(
    () => [...(settings?.social_links || [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [settings?.social_links]
  );
  const sortedClientOrders = useMemo(() => {
    if (!selectedClient) return [];
    const direction = clientOrdersSort.direction === "asc" ? 1 : -1;
    return [...selectedClient.orders].sort((a, b) => {
      let result = 0;
      switch (clientOrdersSort.key) {
        case "id":
          result = a.id - b.id;
          break;
        case "created_at":
          result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "subtotal":
          result = a.subtotal - b.subtotal;
          break;
        case "fulfillment_status":
          result = compareText(formatFulfillmentStatus(a.fulfillment_status), formatFulfillmentStatus(b.fulfillment_status));
          break;
        case "payment_status":
          result = compareText(formatPaymentStatus(a.payment_status), formatPaymentStatus(b.payment_status));
          break;
      }
      return result * direction;
    });
  }, [clientOrdersSort, selectedClient]);
  const paginatedProducts = useMemo(() => getPageItems(sortedProducts, productsPage, PAGINATION_MAX_LINES), [productsPage, sortedProducts]);
  const paginatedOrders = useMemo(() => getPageItems(sortedOrders, ordersPage, PAGINATION_MAX_LINES), [ordersPage, sortedOrders]);
  const paginatedClients = useMemo(() => getPageItems(sortedClients, clientsPage, PAGINATION_MAX_LINES), [clientsPage, sortedClients]);
  const paginatedClientOrders = useMemo(() => getPageItems(sortedClientOrders, clientOrdersPage, PAGINATION_MAX_LINES), [clientOrdersPage, sortedClientOrders]);

  useEffect(() => {
    if (productsPage !== paginatedProducts.currentPage) setProductsPage(paginatedProducts.currentPage);
  }, [productsPage, paginatedProducts.currentPage]);

  useEffect(() => {
    if (clientOrdersPage !== paginatedClientOrders.currentPage) setClientOrdersPage(paginatedClientOrders.currentPage);
  }, [clientOrdersPage, paginatedClientOrders.currentPage]);

  const availableDraftSubcategories = useMemo(() => {
    if (!draftCategoryId) return [];
    return subcategories.filter((item) => item.category_id === draftCategoryId);
  }, [draftCategoryId, subcategories]);

  async function saveSettings() {
    if (!settings) return;
    const payload = {
      ...settings,
      admin_login: "admin",
      admin_password: adminPasswordDirty ? adminPassword : null,
    };
    const next = await request<Settings>("/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
    setSettings(next);
    setAdminPasswordDirty(false);
    setAdminPasswordVisible(false);
  }

  function openTextDialog(state: TextDialogState) {
    setTextDialogValue(state.initialValue ?? "");
    setTextDialogState(state);
  }

  async function addCategory(name: string) {
    await request("/admin/categories", { method: "POST", body: JSON.stringify({ name, sort_order: categories.length + 1 }) });
    await refreshAll();
  }

  async function renameCategory(category: Category, name: string) {
    if (name === category.name) return;
    await request(`/admin/categories/${category.id}`, { method: "PUT", body: JSON.stringify({ name, sort_order: category.sort_order }) });
    await refreshAll();
  }

  async function removeCategory(category: Category) {
    await request(`/admin/categories/${category.id}`, { method: "DELETE" });
    if (productFilter.kind !== "all" && productFilter.categoryId === category.id) {
      setProductFilter({ kind: "all" });
    }
    await refreshAll();
  }

  async function addSubcategory(categoryId: number, name: string) {
    await request("/admin/subcategories", {
      method: "POST",
      body: JSON.stringify({
        category_id: categoryId,
        name,
        sort_order: subcategories.filter((item) => item.category_id === categoryId).length + 1,
      }),
    });
    await refreshAll();
  }

  async function renameSubcategory(item: Subcategory, name: string) {
    if (name === item.name) return;
    await request(`/admin/subcategories/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ category_id: item.category_id, name, sort_order: item.sort_order }),
    });
    await refreshAll();
  }

  async function removeSubcategory(item: Subcategory) {
    await request(`/admin/subcategories/${item.id}`, { method: "DELETE" });
    if (productFilter.kind === "subcategory" && productFilter.subcategoryId === item.id) {
      setProductFilter({ kind: "all" });
    }
    await refreshAll();
  }

  function openCreateProduct() {
    navigateTo("/products/new");
  }

  function openEditProduct(item: Product) {
    navigateTo(`/products/${item.id}`);
  }

  async function removeProduct(item: Product) {
    await request(`/admin/products/${item.id}`, { method: "DELETE" });
    await refreshAll();
  }

  async function saveProduct() {
    if (!editingProduct) return;
    setSavingProduct(true);
    try {
      const payload = {
        category_id: draftCategoryId,
        subcategory_id: editingProduct.subcategory_id,
        name: editingProduct.name,
        short_description: editingProduct.short_description,
        description: editingProduct.description,
        price: Number(editingProduct.price) || 0,
        image_url: editingProduct.image_url,
        image_key: editingProduct.image_key,
        is_active: editingProduct.is_active,
      };
      if (editingProduct.id) {
        await request(`/admin/products/${editingProduct.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await request("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      }
      await refreshAll();
      navigateTo("/products");
    } finally {
      setSavingProduct(false);
    }
  }

  async function uploadProductImage(file: File) {
    if (!editingProduct) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("object_name", editingProduct.uuid);
      const uploaded = await request<UploadResponse>("/admin/uploads/product", { method: "POST", body: formData });
      const nonce = Date.now();
      setEditingProduct((current) =>
        current ? { ...current, image_key: uploaded.key, image_url: withCacheBuster(uploaded.url, nonce) } : current
      );
      setEditingImageNonce(nonce);
    } finally {
      setUploadingImage(false);
    }
  }

  async function openClient(clientId: number) {
    navigateTo(`/clients/${clientId}`);
  }

  async function openOrder(orderId: number) {
    navigateTo(`/orders/${orderId}`);
  }

  async function updateOrderStatus(orderId: number, fulfillmentStatus: string) {
    const updated = await request<Order>(`/admin/orders/${orderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ fulfillment_status: fulfillmentStatus }),
    });
    setOrders((current) => current.map((item) => (item.id === orderId ? updated : item)));
    setSelectedOrder((current) => (current?.id === orderId ? updated : current));
  }

  async function removeOrder(item: Order) {
    await request(`/admin/orders/${item.id}`, { method: "DELETE" });
    setOrders((current) => current.filter((order) => order.id !== item.id));
    if (selectedOrder?.id === item.id) {
      setSelectedOrder(null);
      navigateTo("/orders");
    }
    await refreshAll();
  }

  async function removeClient(item: Client) {
    await request(`/admin/clients/${item.id}`, { method: "DELETE" });
    setClients((current) => current.filter((client) => client.id !== item.id));
    if (selectedClient?.id === item.id) {
      setSelectedClient(null);
      navigateTo("/clients");
    }
    await refreshAll();
  }

  async function submitOrderStatusDialog() {
    if (!orderStatusDialog) return;
    const nextStatus = orderStatusDialog.value;
    const orderId = orderStatusDialog.orderId;
    setOrderStatusDialog(null);
    await updateOrderStatus(orderId, nextStatus);
  }

  function addSocialLink() {
    if (!settings) return;
    const nextLinks = normalizeSocialLinks([
      ...socialLinks,
      {
        id: -Date.now(),
        platform: DEFAULT_SOCIAL_PLATFORM,
        url: "",
        sort_order: socialLinks.length + 1,
      },
    ]);
    setSettings({ ...settings, social_links: nextLinks });
  }

  function removeSocialLink(link: SocialLink) {
    if (!settings) return;
    const nextLinks = normalizeSocialLinks(settings.social_links.filter((item) => item.id !== link.id));
    setSettings({ ...settings, social_links: nextLinks });
  }

  function updateSocialLink(linkId: number, patch: Partial<SocialLink>) {
    if (!settings) return;
    const nextLinks = settings.social_links.map((item) => (item.id === linkId ? { ...item, ...patch } : item));
    setSettings({ ...settings, social_links: nextLinks });
  }

  function runMenuAction(action: () => void | Promise<void>) {
    const result = action();
    setMenuKey(null);
    void result;
  }

  function askForDelete(title: string, message: string, action: () => void | Promise<void>) {
    setConfirmState({
      title,
      message,
      confirmLabel: "Удалить",
      onConfirm: action,
    });
  }

  function renderPagination(currentPage: number, totalPages: number, onPageChange: (page: number) => void) {
    if (totalPages <= 1) return null;
    return (
      <div className="pagination">
        <button className="pagination-link" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
          Предыдущая
        </button>
        <div className="pagination-pages">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              className={page === currentPage ? "pagination-link pagination-link-active" : "pagination-link"}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
        </div>
        <button className="pagination-link" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>
          Следующая
        </button>
      </div>
    );
  }

  function toggleProductsSort(key: ProductSortKey) {
    setProductsSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setProductsPage(1);
  }

  function toggleOrdersSort(key: OrderSortKey) {
    setOrdersSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setOrdersPage(1);
  }

  function toggleClientsSort(key: ClientSortKey) {
    setClientsSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setClientsPage(1);
  }

  function toggleClientOrdersSort(key: ClientOrderSortKey) {
    setClientOrdersSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setClientOrdersPage(1);
  }

  function renderSortMark(active: boolean, direction: SortDirection) {
    if (!active) return null;
    return direction === "asc" ? " ↑" : " ↓";
  }

  async function submitTextDialog() {
    if (!textDialogState) return;
    const value = textDialogValue.trim();
    if (!value) return;
    const action = textDialogState.onConfirm;
    setTextDialogState(null);
    setTextDialogValue("");
    await action(value);
  }

  function setDraftCategory(categoryId: number) {
    if (!editingProduct) return;
    setDraftCategoryId(categoryId || null);
    const nextSubcategory = subcategories.find((item) => item.category_id === categoryId) ?? null;
    setEditingProduct({
      ...editingProduct,
      category_id: categoryId || null,
      subcategory_id: nextSubcategory?.id ?? null,
    });
  }

  if (!loggedIn) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <h1>Kiosk Admin</h1>
          <label>
            Логин
            <input value={login} onChange={(e) => setLogin(e.target.value)} />
          </label>
          <label>
            Пароль
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button onClick={() => void handleLogin()}>Войти</button>
        </div>
      </main>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Киоск</h2>
        {[
          ["products", "Товары"],
          ["orders", "Заказы"],
          ["clients", "Клиенты"],
          ["about", "О магазине"],
          ["settings", "Настройки"],
        ].map(([key, label]) => (
          <button key={key} className={view === key ? "active" : ""} onClick={() => navigateTo(`/${key}`)}>
            {label}
          </button>
        ))}
        <button
          onClick={() =>
            setConfirmState({
              title: "Выход",
              message: "Хотите выйти?",
              confirmLabel: "Да",
              onConfirm: () => logout(),
            })
          }
        >
          Выход
        </button>
      </aside>
      <section className="content">
        {error ? <div className="error-box">{error}</div> : null}

        {view === "products" &&
          (editingProduct ? (
            <div className="panel">
              <div className="panel-head">
                <h1>{editingProduct.name.trim() || (editingProduct.id ? "Редактирование товара" : "Новый товар")}</h1>
                <div className="modal-actions">
                  <button onClick={() => void saveProduct()} disabled={savingProduct || uploadingImage}>
                    {savingProduct ? "Сохранение..." : "Сохранить"}
                  </button>
                  <button className="secondary-button" onClick={() => navigateTo("/products")}>
                    Отмена
                  </button>
                </div>
              </div>
              <div className="product-editor-shell">
                <div className="product-editor-media">
                  <div className="modal-image-preview product-editor-preview">
                    {editingProduct.image_url ? (
                      <img src={getPreviewImageUrl(editingProduct.image_url, editingImageNonce) || undefined} alt={editingProduct.name || "preview"} />
                    ) : (
                      <div className="product-editor-empty">NO IMAGE</div>
                    )}
                  </div>
                  <div className="upload-row">
                    <label className="file-button">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadProductImage(file);
                        }}
                      />
                      Изменить картинку
                    </label>
                    {uploadingImage ? <span className="upload-meta">Загрузка...</span> : null}
                  </div>
                  <div className="upload-file-key">
                    {getDisplayImageKey(editingProduct.image_key, editingProduct.image_url)}
                  </div>
                </div>

                <div className="product-editor-form">
                  <label>
                    Название товара
                    <input value={editingProduct.name} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                  </label>
                  <label>
                    Краткое описание
                    <input value={editingProduct.short_description} onChange={(e) => setEditingProduct({ ...editingProduct, short_description: e.target.value })} />
                  </label>
                  <label>
                    Детальное описание
                    <textarea rows={8} value={editingProduct.description} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} />
                  </label>
                  <label>
                    Цена
                    <input
                      type="number"
                      min="0"
                      value={editingProduct.price}
                      onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Категория
                    <select
                      value={draftCategoryId || ""}
                      onChange={(e) => setDraftCategory(Number(e.target.value))}
                    >
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Подкатегория
                    <select
                      value={editingProduct.subcategory_id || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, subcategory_id: Number(e.target.value) || null })}
                    >
                      <option value="">-</option>
                      {availableDraftSubcategories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="modal-actions product-editor-actions">
                <button onClick={() => void saveProduct()} disabled={savingProduct || uploadingImage}>
                  {savingProduct ? "Сохранение..." : "Сохранить"}
                </button>
                <button className="secondary-button" onClick={() => navigateTo("/products")}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="page-grid products-layout">
              <div className="panel product-tree-panel" ref={productsTreeRef}>
                <div className="products-tree-header">
                  <button className="tree-node tree-root" onClick={() => setProductFilter({ kind: "all" })}>
                    <span className="tree-node-label tree-root-label">ВСЕ ТОВАРЫ</span>
                  </button>
                  <div className="tree-menu-box">
                    <button className="tree-menu-trigger" onClick={() => setMenuKey((current) => (current === "all" ? null : "all"))}>[...]</button>
                    {menuKey === "all" ? (
                      <div className="context-menu">
                        <button
                          onClick={() =>
                            runMenuAction(() =>
                              openTextDialog({
                                title: "Добавить категорию",
                                label: "Название категории",
                                confirmLabel: "Сохранить",
                                onConfirm: addCategory,
                              })
                            )
                          }
                        >
                          Добавить категорию
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="tree-list">
                  {categories.map((category) => (
                    <div key={category.id} className="tree-section">
                      <div className="tree-row">
                        <button
                          className={`tree-node ${productFilter.kind !== "all" && productFilter.categoryId === category.id ? "tree-node-active" : ""}`}
                          onClick={() => setProductFilter({ kind: "category", categoryId: category.id })}
                        >
                          <span className="tree-node-label tree-category-label">{category.name.toUpperCase()}</span>
                        </button>
                        <div className="tree-menu-box">
                          <button
                            className="tree-menu-trigger"
                            onClick={() => setMenuKey((current) => (current === `category:${category.id}` ? null : `category:${category.id}`))}
                          >
                            [...]
                          </button>
                          {menuKey === `category:${category.id}` ? (
                            <div className="context-menu">
                              <button
                                onClick={() =>
                                  runMenuAction(() =>
                                    openTextDialog({
                                      title: "Переименовать категорию",
                                      label: "Название категории",
                                      initialValue: category.name,
                                      confirmLabel: "Сохранить",
                                      onConfirm: (value) => renameCategory(category, value),
                                    })
                                  )
                                }
                              >
                                Переименовать
                              </button>
                              <button
                                onClick={() =>
                                  runMenuAction(() =>
                                    openTextDialog({
                                      title: "Добавить подкатегорию",
                                      label: "Название подкатегории",
                                      confirmLabel: "Сохранить",
                                      onConfirm: (value) => addSubcategory(category.id, value),
                                    })
                                  )
                                }
                              >
                                Добавить подкатегорию
                              </button>
                              <button className="danger" onClick={() => runMenuAction(() => askForDelete("Удаление категории", `Удалить категорию «${category.name}»?`, () => removeCategory(category)))}>Удалить</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {subcategories
                        .filter((item) => item.category_id === category.id)
                        .map((item) => (
                          <div key={item.id} className="tree-row tree-row-sub">
                            <button
                              className={`tree-node ${productFilter.kind === "subcategory" && productFilter.subcategoryId === item.id ? "tree-node-active" : ""}`}
                              onClick={() => setProductFilter({ kind: "subcategory", categoryId: category.id, subcategoryId: item.id })}
                            >
                              <span className="tree-node-label tree-subcategory-label">{item.name}</span>
                            </button>
                            <div className="tree-menu-box">
                              <button
                                className="tree-menu-trigger"
                                onClick={() => setMenuKey((current) => (current === `subcategory:${item.id}` ? null : `subcategory:${item.id}`))}
                              >
                                [...]
                              </button>
                              {menuKey === `subcategory:${item.id}` ? (
                                <div className="context-menu">
                                  <button
                                    onClick={() =>
                                      runMenuAction(() =>
                                        openTextDialog({
                                          title: "Переименовать подкатегорию",
                                          label: "Название подкатегории",
                                          initialValue: item.name,
                                          confirmLabel: "Сохранить",
                                          onConfirm: (value) => renameSubcategory(item, value),
                                        })
                                      )
                                    }
                                  >
                                    Переименовать
                                  </button>
                                  <button className="danger" onClick={() => runMenuAction(() => askForDelete("Удаление подкатегории", `Удалить подкатегорию «${item.name}»?`, () => removeSubcategory(item)))}>Удалить</button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel products-table-panel">
                <div className="panel-head products-sticky-head">
                  <h1>{productPanelTitle}</h1>
                  <div className="panel-head-actions">
                    <input placeholder="Поиск" value={productsSearch} onChange={(e) => setProductsSearch(e.target.value)} />
                    <button onClick={openCreateProduct}>Добавить товар</button>
                  </div>
                </div>
                <div className="table-shell table-scroll">
                  <table className="products-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th><button className="sort-header" onClick={() => toggleProductsSort("name")}>Название{renderSortMark(productsSort.key === "name", productsSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleProductsSort("price")}>Цена{renderSortMark(productsSort.key === "price", productsSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleProductsSort("category")}>Категория{renderSortMark(productsSort.key === "category", productsSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleProductsSort("subcategory")}>Подкатегория{renderSortMark(productsSort.key === "subcategory", productsSort.direction)}</button></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.items.map((item) => {
                        const subcategory = item.subcategory_id ? subcategoryMap.get(item.subcategory_id) : null;
                        const category = subcategory ? categoryMap.get(subcategory.category_id) : (item.category_id ? categoryMap.get(item.category_id) : null);
                        return (
                          <tr key={item.id}>
                            <td>
                              <button className="table-thumb" onClick={() => openEditProduct(item)}>
                                {item.image_url ? <img src={item.image_url} alt={item.name} /> : <span>no image</span>}
                              </button>
                            </td>
                            <td>
                              <button className="table-link" onClick={() => openEditProduct(item)}>
                                <strong>{item.name}</strong>
                                <small>{item.short_description}</small>
                              </button>
                            </td>
                            <td>{formatPrice(item.price)}</td>
                            <td>{category?.name || "-"}</td>
                            <td>{subcategory?.name || "-"}</td>
                            <td>
                              <button className="icon-delete" onClick={() => askForDelete("Удаление товара", `Удалить товар «${item.name}»?`, () => removeProduct(item))}>X</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {renderPagination(paginatedProducts.currentPage, paginatedProducts.totalPages, setProductsPage)}
                </div>
              </div>
            </div>
          ))}

        {view === "orders" && (
          routeLoading ? (
            <div className="panel">
              <div className="panel-head">
                <h1>Загрузка...</h1>
              </div>
            </div>
          ) : selectedOrder ? (
            <div className="detail-stack">
              <div className="panel">
                <div className="panel-head">
                  <h1>Заказ #{selectedOrder.id}</h1>
                </div>
                <div>
                  <div className="status-row">
                    <span className={`status-badge status-${selectedOrder.fulfillment_status}`}>{formatFulfillmentStatus(selectedOrder.fulfillment_status)}</span>
                    <button
                      onClick={() => setOrderStatusDialog({ orderId: selectedOrder.id, value: selectedOrder.fulfillment_status })}
                    >
                      Изменить статус
                    </button>
                  </div>
                </div>
                <div className="detail-grid">
                  <div>
                    <h4>Имя клиента</h4>
                    <p>
                      {selectedOrder.user_id ? (
                        <button className="text-link" onClick={() => void openClient(selectedOrder.user_id!)}>
                          {selectedOrder.customer_name}
                        </button>
                      ) : (
                        selectedOrder.customer_name
                      )}
                    </p>
                  </div>
                  <div>
                    <h4>Сумма заказа</h4>
                    <p>{formatPrice(selectedOrder.subtotal)}</p>
                  </div>
                  <div>
                    <h4>Статус оплаты</h4>
                    <p>{formatPaymentStatus(selectedOrder.payment_status)}</p>
                  </div>
                  <div>
                    <h4>Дата</h4>
                    <p>{new Date(selectedOrder.created_at).toLocaleString("ru-RU")}</p>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h4>{selectedOrder.delivery_mode === "delivery" ? "Доставка" : "Самовывоз"}</h4>
                </div>
                {selectedOrder.delivery_mode === "delivery" ? <p>{selectedOrder.delivery_address || "-"}</p> : null}
              </div>

              <div className="panel">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Название товара</th>
                      <th>Цена</th>
                      <th>Количество</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((orderItem) => (
                      <tr key={orderItem.id}>
                        <td>
                          <div className="table-thumb static-thumb">
                            {orderItem.image_url ? <img src={orderItem.image_url} alt={orderItem.product_name} /> : <span>no image</span>}
                          </div>
                        </td>
                        <td>{orderItem.product_name}</td>
                        <td>{formatPrice(orderItem.unit_price)}</td>
                        <td>{orderItem.quantity}</td>
                        <td>{formatPrice(orderItem.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-head">
                <h1>Заказы</h1>
                <input placeholder="Поиск" value={ordersSearch} onChange={(e) => setOrdersSearch(e.target.value)} />
              </div>
              <div className="table-scroll">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("id")}>ID{renderSortMark(ordersSort.key === "id", ordersSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("created_at")}>Дата{renderSortMark(ordersSort.key === "created_at", ordersSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("customer_name")}>Клиент{renderSortMark(ordersSort.key === "customer_name", ordersSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("subtotal")}>Сумма{renderSortMark(ordersSort.key === "subtotal", ordersSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("fulfillment_status")}>Статус заказа{renderSortMark(ordersSort.key === "fulfillment_status", ordersSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("payment_status")}>Статус оплаты{renderSortMark(ordersSort.key === "payment_status", ordersSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleOrdersSort("delivery_mode")}>Доставка{renderSortMark(ordersSort.key === "delivery_mode", ordersSort.direction)}</button></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <button className="text-link" onClick={() => void openOrder(item.id)}>
                            #{item.id}
                          </button>
                        </td>
                        <td>{new Date(item.created_at).toLocaleString("ru-RU")}</td>
                        <td>
                          {item.user_id ? (
                            <button
                              className="text-link"
                              onClick={() => void openClient(item.user_id!)}
                            >
                              {item.customer_name}
                            </button>
                          ) : (
                            item.customer_name
                          )}
                        </td>
                        <td>{formatPrice(item.subtotal)}</td>
                        <td>
                          <span className={`status-badge status-${item.fulfillment_status}`}>{formatFulfillmentStatus(item.fulfillment_status)}</span>
                        </td>
                        <td>
                          <span className={`status-badge status-${item.payment_status}`}>{formatPaymentStatus(item.payment_status)}</span>
                        </td>
                        <td>{item.delivery_mode === "delivery" ? "Доставка" : "Самовывоз"}</td>
                        <td>
                          <button
                            className="icon-delete"
                            onClick={() => askForDelete("Удаление заказа", `Удалить заказ #${item.id}?`, () => removeOrder(item))}
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPagination(paginatedOrders.currentPage, paginatedOrders.totalPages, setOrdersPage)}
            </div>
          )
        )}

        {view === "clients" && (
          routeLoading ? (
            <div className="panel">
              <div className="panel-head">
                <h1>Загрузка...</h1>
              </div>
            </div>
          ) : selectedClient ? (
            <div className="detail-stack">
              <div className="panel">
                <div className="panel-head">
                  <h1>{selectedClient.full_name || "-"}</h1>
                </div>
                <h3>{getClientLogin(selectedClient)}</h3>
                <div className="detail-grid">
                  <div>
                    <h4>Авторизация</h4>
                    <p>{getClientProviderLabel(selectedClient.provider)}</p>
                  </div>
                  <div>
                    <h4>Телефон</h4>
                    <p>{selectedClient.phone || "-"}</p>
                  </div>
                  <div>
                    <h4>Email</h4>
                    <p>{selectedClient.email || "-"}</p>
                  </div>
                  <div>
                    <h4>Дата последнего входа</h4>
                    <p>{selectedClient.last_login_at ? new Date(selectedClient.last_login_at).toLocaleString("ru-RU") : "-"}</p>
                  </div>
                </div>
              </div>

              <div className="panel">
                {selectedClient.orders.length === 0 ? (
                  <p>Нет заказов</p>
                ) : (
                  <>
                  <table className="client-orders-table">
                    <thead>
                      <tr>
                        <th><button className="sort-header" onClick={() => toggleClientOrdersSort("id")}>ID заказа{renderSortMark(clientOrdersSort.key === "id", clientOrdersSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleClientOrdersSort("created_at")}>Дата{renderSortMark(clientOrdersSort.key === "created_at", clientOrdersSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleClientOrdersSort("subtotal")}>Сумма{renderSortMark(clientOrdersSort.key === "subtotal", clientOrdersSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleClientOrdersSort("fulfillment_status")}>Статус заказа{renderSortMark(clientOrdersSort.key === "fulfillment_status", clientOrdersSort.direction)}</button></th>
                        <th><button className="sort-header" onClick={() => toggleClientOrdersSort("payment_status")}>Статус оплаты{renderSortMark(clientOrdersSort.key === "payment_status", clientOrdersSort.direction)}</button></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedClientOrders.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <button className="text-link" onClick={() => void openOrder(item.id)}>
                              #{item.id}
                            </button>
                          </td>
                          <td>{new Date(item.created_at).toLocaleString("ru-RU")}</td>
                          <td>{formatPrice(item.subtotal)}</td>
                          <td>
                            <span className={`status-badge status-${item.fulfillment_status}`}>{formatFulfillmentStatus(item.fulfillment_status)}</span>
                          </td>
                          <td>
                            <span className={`status-badge status-${item.payment_status}`}>{formatPaymentStatus(item.payment_status)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {renderPagination(paginatedClientOrders.currentPage, paginatedClientOrders.totalPages, setClientOrdersPage)}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-head">
                <h1>Клиенты</h1>
                <input placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="table-scroll">
                <table className="clients-table">
                  <thead>
                    <tr>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("provider_user_id")}>Логин{renderSortMark(clientsSort.key === "provider_user_id", clientsSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("provider")}>Авторизация{renderSortMark(clientsSort.key === "provider", clientsSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("full_name")}>Имя{renderSortMark(clientsSort.key === "full_name", clientsSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("phone")}>Телефон{renderSortMark(clientsSort.key === "phone", clientsSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("email")}>Email{renderSortMark(clientsSort.key === "email", clientsSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("last_login_at")}>Последний вход{renderSortMark(clientsSort.key === "last_login_at", clientsSort.direction)}</button></th>
                      <th><button className="sort-header" onClick={() => toggleClientsSort("orders_count")}>Заказы{renderSortMark(clientsSort.key === "orders_count", clientsSort.direction)}</button></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedClients.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <button className="text-link" onClick={() => void openClient(item.id)}>
                            {getClientLogin(item)}
                          </button>
                        </td>
                        <td>{getClientProviderLabel(item.provider)}</td>
                        <td>
                          <button className="text-link" onClick={() => void openClient(item.id)}>
                            {item.full_name || "-"}
                          </button>
                        </td>
                        <td>{item.phone || "-"}</td>
                        <td>{item.email || "-"}</td>
                        <td>{item.last_login_at ? new Date(item.last_login_at).toLocaleString("ru-RU") : "-"}</td>
                        <td>
                          <span className={`status-badge ${item.orders_count > 0 ? "status-paid" : "status-empty"}`}>
                            {item.orders_count > 0 ? "есть заказы" : "нет заказов"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="icon-delete"
                            onClick={() =>
                              askForDelete(
                                "Удаление клиента",
                                `Удалить клиента «${item.full_name || getClientLogin(item)}»?`,
                                () => removeClient(item)
                              )
                            }
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPagination(paginatedClients.currentPage, paginatedClients.totalPages, setClientsPage)}
            </div>
          )
        )}

        {view === "about" && settings && (
          <div className="panel">
            <div className="panel-head">
              <h1>О магазине</h1>
              <button onClick={() => void saveSettings()}>Сохранить</button>
            </div>
            <div className="settings-layout">
              <div className="settings-column">
                <label>
                  Название магазина
                  <input value={settings.store_name} onChange={(e) => setSettings({ ...settings, store_name: e.target.value })} />
                </label>
                <label>
                  Девиз
                  <input value={settings.slogan} onChange={(e) => setSettings({ ...settings, slogan: e.target.value })} />
                </label>
                <label>
                  Описание
                  <textarea rows={6} value={settings.about_text} onChange={(e) => setSettings({ ...settings, about_text: e.target.value })} />
                </label>
              </div>

              <div className="settings-column">
                <div className="panel">
                  <label>
                    Адрес
                    <input value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
                  </label>
                  <label>
                    Телефон
                    <input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
                  </label>
                  <label>
                    Режим работы
                    <input value={settings.working_hours} onChange={(e) => setSettings({ ...settings, working_hours: e.target.value })} />
                  </label>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h3>Соцсети</h3>
                  </div>
                  <div className="social-links-table">
                    {socialLinks.length ? (
                      socialLinks.map((item) => (
                        <div key={item.id} className="social-links-row">
                          <div className="social-links-logo-cell">
                            <span className="social-links-icon" aria-hidden="true">
                              {getSocialIcon(item.platform)}
                            </span>
                          </div>
                          <select
                            className="social-links-select"
                            value={item.platform}
                            onChange={(event) => updateSocialLink(item.id, { platform: event.target.value })}
                          >
                            {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={item.url}
                            placeholder="Адрес"
                            onChange={(event) => updateSocialLink(item.id, { url: event.target.value })}
                          />
                          <button
                            className="icon-delete"
                            onClick={() => askForDelete("Удаление соцсети", "Удалить эту строку соцсети?", () => removeSocialLink(item))}
                          >
                            X
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="social-links-empty">Соцсети пока не добавлены</div>
                    )}
                    <button className="social-links-add" onClick={() => addSocialLink()}>
                      Добавить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "settings" && settings && (
          <div className="panel">
            <div className="panel-head">
              <h1>Настройки</h1>
              <button onClick={() => void saveSettings()}>Сохранить</button>
            </div>
            <div className="settings-layout">
              <div className="settings-column">
                <div className="panel">
                  <div className="panel-head">
                    <h3>Безопасность</h3>
                  </div>
                  <label>
                    Пароль администратора
                    <div className="password-field">
                      <input
                        type={adminPasswordVisible ? "text" : "password"}
                        value={adminPassword}
                        onChange={(e) => {
                          setAdminPassword(e.target.value);
                          setAdminPasswordDirty(true);
                        }}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        aria-label={adminPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
                        onClick={() => setAdminPasswordVisible((current) => !current)}
                      >
                        {adminPasswordVisible ? "🙈" : "👁"}
                      </button>
                    </div>
                  </label>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <h3>СБП</h3>
                  </div>
                  <label>
                    Провайдер СБП
                    <input value={settings.sbp_provider_name || ""} onChange={(e) => setSettings({ ...settings, sbp_provider_name: e.target.value || null })} />
                  </label>
                  <label>
                    Публичная надпись оплаты
                    <input value={settings.sbp_public_label || ""} onChange={(e) => setSettings({ ...settings, sbp_public_label: e.target.value || null })} />
                  </label>
                </div>
              </div>

              <div className="settings-column">
                <div className="panel">
                  <div className="panel-head">
                    <h3>Доставка</h3>
                  </div>
                  <label>
                    Информация о доставке
                    <textarea rows={4} value={settings.delivery_info} onChange={(e) => setSettings({ ...settings, delivery_info: e.target.value })} />
                  </label>
                  <label>
                    Информация о самовывозе
                    <textarea rows={4} value={settings.pickup_info} onChange={(e) => setSettings({ ...settings, pickup_info: e.target.value })} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {confirmState ? (
        <div className="modal-backdrop" onClick={() => setConfirmState(null)}>
          <div className="confirm-card" onClick={(event) => event.stopPropagation()}>
            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>
            <div className="modal-actions">
              <button
                onClick={() => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  void action();
                }}
              >
                {confirmState.confirmLabel || "Подтвердить"}
              </button>
              <button className="secondary-button" onClick={() => setConfirmState(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {textDialogState ? (
        <div className="modal-backdrop" onClick={() => setTextDialogState(null)}>
          <div className="confirm-card" onClick={(event) => event.stopPropagation()}>
            <h3>{textDialogState.title}</h3>
            <label>
              {textDialogState.label}
              <input
                autoFocus
                value={textDialogValue}
                onChange={(event) => setTextDialogValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitTextDialog();
                }}
              />
            </label>
            <div className="modal-actions">
              <button onClick={() => void submitTextDialog()}>{textDialogState.confirmLabel || "Сохранить"}</button>
              <button className="secondary-button" onClick={() => setTextDialogState(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderStatusDialog ? (
        <div className="modal-backdrop" onClick={() => setOrderStatusDialog(null)}>
          <div className="confirm-card" onClick={(event) => event.stopPropagation()}>
            <h3>Изменить статус заказа</h3>
            <select value={orderStatusDialog.value} onChange={(event) => setOrderStatusDialog({ ...orderStatusDialog, value: event.target.value })}>
              <option value="new">Новый</option>
              <option value="shipped">Отправлен</option>
              <option value="canceled">Отменен</option>
            </select>
            <div className="modal-actions">
              <button onClick={() => void submitOrderStatusDialog()}>ОК</button>
              <button className="secondary-button" onClick={() => setOrderStatusDialog(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
