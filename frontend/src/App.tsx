import { useEffect, useMemo, useRef, useState } from "react";
import { FaFacebookF, FaInstagram, FaTelegramPlane, FaTiktok, FaVk, FaWhatsapp, FaYoutube } from "react-icons/fa";

type DeliveryMode = "delivery" | "pickup";
type NavKey = "catalog" | "cart" | "about" | "profile";

type SocialLink = { id: number; platform: string; url: string; sort_order: number };
type ShopSettings = {
  store_name: string;
  slogan: string;
  about_text: string;
  address: string;
  phone: string;
  working_hours: string;
  delivery_info: string;
  pickup_info: string;
  social_links: SocialLink[];
};
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
  is_active: boolean;
  orders_count: number;
};
type OrderItem = { id: number; product_id: number | null; image_url?: string | null; product_name: string; unit_price: number; quantity: number; line_total: number };
type Order = {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_mode: DeliveryMode;
  delivery_address: string | null;
  subtotal: number;
  payment_status: string;
  fulfillment_status: string;
  payment_url: string | null;
  created_at: string;
  items: OrderItem[];
  payment_session?: PaymentSession | null;
};
type PaymentBank = { id: string; name: string; logo_url: string | null };
type PaymentSession = {
  provider: string;
  payment_id: string;
  payment_url: string | null;
  qr_payload: string | null;
  qr_image_svg: string | null;
  banks: PaymentBank[];
};
type PaymentReturnResult = "success" | "fail" | null;
type User = { id: number; provider: "telegram" | "guest"; username: string | null; avatar_url: string | null; full_name: string | null; phone: string | null; email: string | null; delivery_address: string | null };
type Profile = { user: User; orders: Order[] };
type Bootstrap = {
  settings: ShopSettings;
  categories: Category[];
  subcategories: Subcategory[];
  products: Product[];
  profile: Profile | null;
};

type CartItem = Product & { quantity: number };

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const BACKGROUND_SRC = `${import.meta.env.BASE_URL}background.webp`;
const PENDING_PAYMENT_STORAGE_KEY = "kiosk_pending_payment_order";
const DELIVERY_DRAFT_STORAGE_KEY = "kiosk_delivery_draft";

type DeliveryFormState = {
  last_name: string;
  first_name: string;
  middle_name: string;
  phone: string;
  email: string;
  delivery_address: string;
  customer_note: string;
  delivery_accepted: boolean;
  pickup_accepted: boolean;
};

const EMPTY_DELIVERY_FORM: DeliveryFormState = {
  last_name: "",
  first_name: "",
  middle_name: "",
  phone: "",
  email: "",
  delivery_address: "",
  customer_note: "",
  delivery_accepted: false,
  pickup_accepted: false,
};

function getStoredDeliveryDraft(): DeliveryFormState {
  try {
    const raw = window.localStorage.getItem(DELIVERY_DRAFT_STORAGE_KEY);
    if (!raw) return EMPTY_DELIVERY_FORM;
    const parsed = JSON.parse(raw) as Partial<DeliveryFormState> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_DELIVERY_FORM;
    return {
      ...EMPTY_DELIVERY_FORM,
      ...parsed,
      last_name: typeof parsed.last_name === "string" ? parsed.last_name : "",
      first_name: typeof parsed.first_name === "string" ? parsed.first_name : "",
      middle_name: typeof parsed.middle_name === "string" ? parsed.middle_name : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
      delivery_address: typeof parsed.delivery_address === "string" ? parsed.delivery_address : "",
      customer_note: typeof parsed.customer_note === "string" ? parsed.customer_note : "",
      delivery_accepted: Boolean(parsed.delivery_accepted),
      pickup_accepted: Boolean(parsed.pickup_accepted),
    };
  } catch {
    return EMPTY_DELIVERY_FORM;
  }
}

function getProductUuidFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const productUuid = params.get("product");
  if (productUuid) {
    return productUuid;
  }

  const startParam = params.get("tgWebAppStartParam");
  if (startParam?.startsWith("product_")) {
    return startParam.slice("product_".length) || null;
  }

  return null;
}

function getPaymentReturnFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const orderValue = params.get("payment_order");
  const result = params.get("payment_return");
  if (!orderValue) {
    return { orderId: null, result: null as PaymentReturnResult };
  }
  const orderId = Number(orderValue);
  if (!Number.isFinite(orderId)) {
    return { orderId: null, result: null as PaymentReturnResult };
  }
  const normalizedResult: PaymentReturnResult = result === "success" || result === "fail" ? result : null;
  return {
    orderId,
    result: normalizedResult,
  };
}

function setProductUuidInLocation(productUuid: string | null, replace = false) {
  const url = new URL(window.location.href);
  if (productUuid) {
    url.searchParams.set("product", productUuid);
  } else {
    url.searchParams.delete("product");
  }
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replace) {
    window.history.replaceState(null, "", nextUrl);
    return;
  }
  window.history.pushState(null, "", nextUrl);
}

function clearPaymentReturnFromLocation(replace = true) {
  const url = new URL(window.location.href);
  url.searchParams.delete("payment_order");
  url.searchParams.delete("payment_return");
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replace) {
    window.history.replaceState(null, "", nextUrl);
    return;
  }
  window.history.pushState(null, "", nextUrl);
}

function splitFullName(fullName: string | null | undefined) {
  const [last_name = "", first_name = "", middle_name = ""] = (fullName ?? "").trim().split(/\s+/, 3);
  return { last_name, first_name, middle_name };
}

function buildFullName(form: { last_name: string; first_name: string; middle_name: string }) {
  return [form.last_name, form.first_name, form.middle_name].map((value) => value.trim()).filter(Boolean).join(" ");
}

function getPaymentStatusLabel(status: string) {
  switch (status) {
    case "paid":
      return "Оплачен";
    case "failed":
      return "Не оплачен";
    case "pending":
    default:
      return "В обработке";
  }
}

function getFulfillmentStatusLabel(status: string) {
  switch (status) {
    case "shipped":
      return "Отправлен";
    case "canceled":
      return "Отменён";
    case "new":
    default:
      return "Новый";
  }
}

function getOrderStatusLabel(order: Order) {
  return `${getPaymentStatusLabel(order.payment_status)} / ${getFulfillmentStatusLabel(order.fulfillment_status)}`;
}

function getTelegramUser() {
  const webApp = window.Telegram?.WebApp;
  webApp?.ready?.();
  webApp?.expand?.();
  return webApp?.initDataUnsafe?.user ?? null;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
        initDataUnsafe?: { user?: { id?: number; username?: string; first_name?: string; last_name?: string; photo_url?: string } };
      };
    };
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) {
        if (typeof body.detail === "string") {
          message = body.detail;
        } else if (Array.isArray(body.detail)) {
          message = body.detail
            .map((item: unknown) => {
              if (typeof item === "string") return item;
              if (item && typeof item === "object") {
                const typedItem = item as { loc?: unknown; msg?: unknown };
                const location = Array.isArray(typedItem.loc) ? typedItem.loc.slice(1).join(" -> ") : "";
                const detail = typeof typedItem.msg === "string" ? typedItem.msg : JSON.stringify(item);
                return location ? `${location}: ${detail}` : detail;
              }
              return String(item);
            })
            .join("\n");
        } else {
          message = JSON.stringify(body.detail);
        }
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function CartLineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.5h2.2l1.5 7.6h8.2l1.9-5.8H9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.4" cy="18.1" r="1.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.3" cy="18.1" r="1.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.7 4.5c-5.7.2-9.5 3.1-11.9 8.5 2.4-1.2 4.7-1.6 7.3-1-1.5 1.4-2.6 3.3-3.1 5.7 4-.8 6.7-3.5 7.8-8.5.3-1.4.2-2.7-.1-4.1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 8.2h11l-1.2 10.2H7.7L6.5 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.4 9V7.8a2.6 2.6 0 1 1 5.2 0V9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.6 5.6c.5-.5 1.2-.5 1.7 0l1.8 1.8c.5.5.5 1.2.1 1.7l-1 1.2c-.2.3-.2.7 0 1 1 1.7 2.5 3.2 4.2 4.2.3.2.8.2 1 0l1.2-1c.5-.4 1.2-.4 1.7.1l1.8 1.8c.5.5.5 1.2 0 1.7l-1.1 1.1c-.9.9-2.3 1.2-3.6.7-2.6-1-5.1-2.7-7.3-4.9-2.2-2.2-3.9-4.7-4.9-7.3-.5-1.3-.2-2.7.7-3.6l1.1-1.1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 18.5c1.6-2.8 3.8-4.1 6-4.1s4.4 1.3 6 4.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
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

function CategoryButton({ label, active, tone = "category", onClick }: { label: string; active: boolean; tone?: "category" | "subcategory"; onClick: () => void }) {
  return (
    <button
      className={`catalog-category-button catalog-category-button-${tone} ${active ? "catalog-category-button-active" : ""} ${
        active && tone === "subcategory" ? "catalog-category-button-subcategory-active" : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function HorizontalScrollWidget({ children }: { children: React.ReactNode }) {
  return <div className="catalog-category-widget">{children}</div>;
}

function ProductCard({ product, inCart, onOpen, onAdd }: { product: Product; inCart: boolean; onOpen: () => void; onAdd: () => void }) {
  return (
    <button className="catalog-product-card" onClick={onOpen}>
      <div className="catalog-product-media">
        {product.image_url ? <img src={product.image_url} alt={product.name} className="catalog-product-image" /> : <div className="catalog-product-image catalog-product-image-placeholder">{product.name.slice(0, 1)}</div>}
      </div>
      <div className="catalog-product-copy">
        <strong>{product.name}</strong>
        <p>{product.short_description || product.description}</p>
      </div>
      <div className="catalog-product-side">
        <b>{product.price} ₽</b>
        <span
          className={`catalog-product-add ${inCart ? "catalog-product-add-active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
        >
          <CartLineIcon />
        </span>
      </div>
    </button>
  );
}

function BottomNav({ active, onChange }: { active: NavKey; onChange: (key: NavKey) => void }) {
  const navItems: Array<{ key: NavKey; label: string; icon: JSX.Element }> = [
    { key: "catalog", label: "Каталог", icon: <LeafIcon /> },
    { key: "cart", label: "Корзина", icon: <BagIcon /> },
    { key: "about", label: "О магазине", icon: <PhoneIcon /> },
    { key: "profile", label: "Профиль", icon: <UserIcon /> },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <button key={item.key} className={`nav-button ${active === item.key ? "nav-active" : ""}`} onClick={() => onChange(item.key)}>
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const topStackRef = useRef<HTMLDivElement | null>(null);
  const telegramUser = useMemo(() => getTelegramUser(), []);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [active, setActive] = useState<NavKey>("catalog");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartAddedDialogOpen, setCartAddedDialogOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(window.localStorage.getItem("kiosk_user_token"));
  const [error, setError] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSuccessOpen, setOrderSuccessOpen] = useState(false);
  const [deliveryErrorDialog, setDeliveryErrorDialog] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<number | null>(null);
  const [paymentBankLoadingId, setPaymentBankLoadingId] = useState<string | null>(null);
  const [sbpBanks, setSbpBanks] = useState<PaymentBank[]>([]);
  const [sbpBanksRequested, setSbpBanksRequested] = useState(false);
  const [sbpBanksLoading, setSbpBanksLoading] = useState(false);
  const [paymentStatusOpen, setPaymentStatusOpen] = useState(false);
  const [paymentStatusOrderId, setPaymentStatusOrderId] = useState<number | null>(null);
  const [paymentStatusOrder, setPaymentStatusOrder] = useState<Order | null>(null);
  const [paymentStatusLoading, setPaymentStatusLoading] = useState(false);
  const [paymentStatusError, setPaymentStatusError] = useState<string | null>(null);
  const [paymentReturnResult, setPaymentReturnResult] = useState<PaymentReturnResult>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("delivery");
  const [deliveryForm, setDeliveryForm] = useState<DeliveryFormState>(() => getStoredDeliveryDraft());
  const [topStackHeight, setTopStackHeight] = useState(0);

  async function authorizeTelegramUser(user: NonNullable<ReturnType<typeof getTelegramUser>>) {
    const data = await request<{ access_token: string }>("/public/auth/telegram", {
      method: "POST",
      body: JSON.stringify({
        telegram_id: String(user.id),
        username: user.username ?? null,
        avatar_url: user.photo_url ?? null,
      }),
    });
    window.localStorage.setItem("kiosk_user_token", data.access_token);
    setToken(data.access_token);
    const nextProfile = await request<Profile>("/public/profile", undefined, data.access_token);
    setProfile(nextProfile);
  }

  useEffect(() => {
    if (telegramUser && !token) {
      void authorizeTelegramUser(telegramUser).catch(() => undefined);
    }
  }, [token]);

  useEffect(() => {
    void request<Bootstrap>("/public/bootstrap", undefined, token)
      .then((data) => {
        setBoot(data);
        setProfile(data.profile);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    window.localStorage.setItem(DELIVERY_DRAFT_STORAGE_KEY, JSON.stringify(deliveryForm));
  }, [deliveryForm]);

  useEffect(() => {
    if (!telegramUser || !token || !boot || profile) return;
    void authorizeTelegramUser(telegramUser)
      .catch(() => undefined);
  }, [boot, profile, telegramUser, token]);

  useEffect(() => {
    const node = topStackRef.current;
    if (!node) return;

    const updateHeight = () => {
      setTopStackHeight(node.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [active, categoryId, subcategoryId, boot]);

  useEffect(() => {
    if (!boot) return;
    const productUuid = getProductUuidFromLocation();
    if (!productUuid) return;
    const product = boot.products.find((item) => item.uuid === productUuid) ?? null;
    setSelectedProduct(product);
  }, [boot]);

  useEffect(() => {
    const handlePopState = () => {
      const productUuid = getProductUuidFromLocation();
      if (!productUuid) {
        setSelectedProduct(null);
      } else {
        const product = boot?.products.find((item) => item.uuid === productUuid) ?? null;
        setSelectedProduct(product);
      }

      const paymentReturn = getPaymentReturnFromLocation();
      if (paymentReturn.orderId) {
        setPaymentStatusOrderId(paymentReturn.orderId);
        setPaymentReturnResult(paymentReturn.result);
        setPaymentStatusOpen(true);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [boot]);

  useEffect(() => {
    const paymentReturn = getPaymentReturnFromLocation();
    if (paymentReturn.orderId) {
      setPaymentStatusOrderId(paymentReturn.orderId);
      setPaymentReturnResult(paymentReturn.result);
      setPaymentStatusOpen(true);
      return;
    }
    const pendingOrderValue = window.localStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    if (!pendingOrderValue) return;
    const pendingOrderId = Number(pendingOrderValue);
    if (!Number.isFinite(pendingOrderId)) return;
    setPaymentStatusOrderId(pendingOrderId);
    setPaymentStatusOpen(true);
  }, []);

  const subcategories = useMemo(() => boot?.subcategories.filter((item) => item.category_id === categoryId) ?? [], [boot, categoryId]);
  const activeCategory = useMemo(() => boot?.categories.find((item) => item.id === categoryId) ?? null, [boot, categoryId]);
  const activeSubcategory = useMemo(() => subcategories.find((item) => item.id === subcategoryId) ?? null, [subcategories, subcategoryId]);
  const featuredProducts = useMemo(() => {
    if (!boot) return [];

    const subcategoryToCategory = new Map(boot.subcategories.map((item) => [item.id, item.category_id]));
    const topByCategory = new Map<number, Product[]>();

    for (const product of boot.products) {
      const productCategoryId = product.subcategory_id ? subcategoryToCategory.get(product.subcategory_id) : product.category_id;
      if (!productCategoryId) continue;

      const current = topByCategory.get(productCategoryId) ?? [];
      current.push(product);
      current.sort((a, b) => {
        if (b.orders_count !== a.orders_count) return b.orders_count - a.orders_count;
        return b.id - a.id;
      });
      topByCategory.set(productCategoryId, current.slice(0, 2));
    }

    return boot.categories.flatMap((category) => topByCategory.get(category.id) ?? []);
  }, [boot]);

  const filteredProducts = useMemo(() => {
    if (!boot) return [];
    if (subcategoryId) return boot.products.filter((item) => item.subcategory_id === subcategoryId);
    if (categoryId) {
      const ids = new Set(boot.subcategories.filter((item) => item.category_id === categoryId).map((item) => item.id));
      return boot.products.filter((item) => (item.subcategory_id && ids.has(item.subcategory_id)) || item.category_id === categoryId);
    }
    return featuredProducts;
  }, [boot, categoryId, subcategoryId, featuredProducts]);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const paymentStatusValue = paymentStatusOrder?.payment_status ?? "pending";
  const isPaymentPending = paymentStatusValue === "pending";
  const isPaymentPaid = paymentStatusValue === "paid";
  const isPaymentFailed = paymentStatusValue === "failed";
  const shouldShowSoftReturnState = paymentReturnResult === "fail" && isPaymentPending;
  const sortedProfileOrders = useMemo(
    () => [...(profile?.orders ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [profile?.orders]
  );

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { ...product, quantity: 1 }];
    });
    setCartAddedDialogOpen(true);
  }

  function toggleCartProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.filter((item) => item.id !== product.id);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function updateCartQuantity(productId: number, delta: number) {
    setCart((current) =>
      current.map((item) => (item.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
    );
  }

  function beginCheckout() {
    setDeliveryErrorDialog(null);
    setDeliveryOpen(true);
  }

  function buildOrderPayload() {
    return {
      full_name: buildFullName(deliveryForm),
      phone: deliveryForm.phone,
      email: deliveryForm.email || null,
      delivery_mode: deliveryMode,
      delivery_address: deliveryMode === "delivery" ? deliveryForm.delivery_address : null,
      customer_note: null,
      items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })),
      idempotency_key: crypto.randomUUID(),
    };
  }

  async function pay() {
    const fullName = buildFullName(deliveryForm);
    const isComplete = deliveryMode === "delivery"
      ? Boolean(
        deliveryForm.last_name.trim() &&
        deliveryForm.first_name.trim() &&
        deliveryForm.middle_name.trim() &&
        deliveryForm.phone.trim() &&
        deliveryForm.email.trim() &&
        deliveryForm.delivery_address.trim()
      )
      : true;
    const isAccepted = deliveryMode === "delivery" ? deliveryForm.delivery_accepted : deliveryForm.pickup_accepted;
    if (!isAccepted || !isComplete || cart.length === 0 || total <= 0) return;
    const order = await request<Order>(
      "/public/orders",
      {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone: deliveryForm.phone,
          email: deliveryForm.email || null,
          delivery_mode: deliveryMode,
          delivery_address: deliveryMode === "delivery" ? deliveryForm.delivery_address : null,
          customer_note: deliveryForm.customer_note || null,
          idempotency_key: crypto.randomUUID(),
          payment_device_type: /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent) ? "mobile" : "desktop",
          payment_device_os: window.navigator.userAgent,
          payment_device_webview: Boolean(window.Telegram?.WebApp),
          items: cart.filter((item) => item.quantity > 0).map((item) => ({ product_id: item.id, quantity: item.quantity })),
        }),
      },
      token
    );
    setPaymentUrl(order.payment_url);
    if (order.payment_session) {
      setPaymentOrderId(order.id);
      setPaymentSession(order.payment_session);
      window.localStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, String(order.id));
      setSbpBanks([]);
      setSbpBanksRequested(false);
      setSbpBanksLoading(false);
      setDeliveryOpen(false);
      return;
    }
    if (order.payment_url) {
      window.localStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, String(order.id));
      window.location.href = order.payment_url;
    }
  }

  async function submitManualOrder() {
    const fullName = buildFullName(deliveryForm);
    const isComplete = deliveryMode === "delivery"
      ? Boolean(
        deliveryForm.last_name.trim() &&
        deliveryForm.first_name.trim() &&
        deliveryForm.middle_name.trim() &&
        deliveryForm.phone.trim() &&
        deliveryForm.email.trim() &&
        deliveryForm.delivery_address.trim()
      )
      : true;
    const isAccepted = deliveryMode === "delivery" ? deliveryForm.delivery_accepted : deliveryForm.pickup_accepted;
    if (!isAccepted || !isComplete || cart.length === 0 || total <= 0 || !fullName) return;

    setDeliveryErrorDialog(null);
    setOrderSubmitting(true);
    try {
      await request<Order>("/public/orders/manual", {
        method: "POST",
        body: JSON.stringify(buildOrderPayload()),
      }, token);
      if (token) {
        const nextProfile = await request<Profile>("/public/profile", undefined, token);
        setProfile(nextProfile);
      }
      setCart([]);
      setDeliveryOpen(false);
      setOrderSuccessOpen(true);
      setPaymentUrl(null);
      setPaymentSession(null);
      setPaymentOrderId(null);
    } catch (err) {
      setDeliveryErrorDialog(err instanceof Error ? err.message : "Не удалось отправить заказ");
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function openBankPayment(bankId: string) {
    if (!paymentOrderId) return;
    setPaymentBankLoadingId(bankId);
    try {
      const data = await request<{ url: string | null }>(
        `/public/orders/${paymentOrderId}/payment-link`,
        {
          method: "POST",
          body: JSON.stringify({ bank_id: bankId }),
        },
        token
      );
      const nextUrl = data.url || paymentSession?.payment_url || paymentUrl;
      if (nextUrl) {
        window.localStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, String(paymentOrderId));
        window.location.href = nextUrl;
      }
    } finally {
      setPaymentBankLoadingId(null);
    }
  }

  function openCardPayment() {
    const nextUrl = paymentSession?.payment_url || paymentUrl;
    if (!nextUrl || !paymentOrderId) return;
    window.localStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, String(paymentOrderId));
    window.location.href = nextUrl;
  }

  async function refreshPaymentStatus(orderId: number) {
    setPaymentStatusLoading(true);
    setPaymentStatusError(null);
    try {
      const order = await request<Order>(`/public/orders/${orderId}`, undefined, token);
      setPaymentStatusOrder(order);
      setProfile((current) => {
        if (!current) return current;
        const hasOrder = current.orders.some((item) => item.id === order.id);
        return {
          ...current,
          orders: hasOrder ? current.orders.map((item) => (item.id === order.id ? order : item)) : [order, ...current.orders],
        };
      });
      if (order.payment_status === "paid") {
        setCart([]);
        setPaymentSession(null);
        setPaymentUrl(null);
      }
      if (order.payment_status === "paid" || order.payment_status === "failed") {
        window.localStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
      }
      return order;
    } catch (err) {
      setPaymentStatusError(err instanceof Error ? err.message : "Не удалось получить статус оплаты.");
      return null;
    } finally {
      setPaymentStatusLoading(false);
    }
  }

  function closePaymentStatus() {
    setPaymentStatusOpen(false);
    setPaymentStatusOrderId(null);
    setPaymentStatusOrder(null);
    setPaymentStatusError(null);
    setPaymentReturnResult(null);
    clearPaymentReturnFromLocation();
  }

  async function loadSbpBanks() {
    if (!paymentOrderId) return;
    setSbpBanksRequested(true);
    setSbpBanksLoading(true);
    try {
      const data = await request<{ banks: PaymentBank[]; qr_payload: string | null; qr_image_svg: string | null }>(
        `/public/orders/${paymentOrderId}/payment-banks`,
        {
          method: "POST",
          body: JSON.stringify({
            payment_device_type: /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent) ? "mobile" : "desktop",
            payment_device_os: window.navigator.userAgent,
            payment_device_webview: Boolean(window.Telegram?.WebApp),
          }),
        },
        token
      );
      setSbpBanks(data.banks || []);
      setPaymentSession((current) =>
        current
          ? {
              ...current,
              qr_payload: data.qr_payload ?? current.qr_payload,
              qr_image_svg: data.qr_image_svg ?? current.qr_image_svg,
            }
          : current
      );
    } catch {
      setSbpBanks([]);
    } finally {
      setSbpBanksLoading(false);
    }
  }

  async function cancelPaymentSession() {
    if (!paymentOrderId) {
      setPaymentSession(null);
      setPaymentUrl(null);
      setActive("cart");
      return;
    }
    await request<Order>(`/public/orders/${paymentOrderId}/cancel-payment`, { method: "POST" }, token);
    window.localStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
    setPaymentSession(null);
    setPaymentUrl(null);
    setPaymentOrderId(null);
    setSbpBanks([]);
    setSbpBanksRequested(false);
    setSbpBanksLoading(false);
    setPaymentBankLoadingId(null);
    setActive("cart");
  }

  useEffect(() => {
    if (!paymentStatusOpen || !paymentStatusOrderId || !token) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      const order = await refreshPaymentStatus(paymentStatusOrderId);
      if (cancelled) return;
      if (order?.payment_status === "pending") {
        timer = window.setTimeout(poll, 3000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [paymentStatusOpen, paymentStatusOrderId, token]);

  const isDeliveryFormComplete = Boolean(
    deliveryForm.last_name.trim() &&
    deliveryForm.first_name.trim() &&
    deliveryForm.middle_name.trim() &&
    deliveryForm.phone.trim() &&
    deliveryForm.email.trim() &&
    deliveryForm.delivery_address.trim()
  );
  const canPay = deliveryMode === "delivery"
    ? deliveryForm.delivery_accepted && isDeliveryFormComplete
    : deliveryForm.pickup_accepted;

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setProductUuidInLocation(product.uuid);
  }

  function openOrderedProduct(item: OrderItem) {
    if (!item.product_id || !boot) return;
    const product = boot.products.find((entry) => entry.id === item.product_id);
    if (!product) return;
    openProduct(product);
  }

  function closeProduct() {
    setSelectedProduct(null);
    setProductUuidInLocation(null, true);
  }

  function openCartFromDialog() {
    setCartAddedDialogOpen(false);
    closeProduct();
    setActive("cart");
  }

  function continueShoppingFromDialog() {
    setCartAddedDialogOpen(false);
    closeProduct();
    setActive("catalog");
  }

  if (!boot) {
    return <main className="shell"><div className="state-card">{error || "Загрузка..."}</div></main>;
  }

  return (
    <main
      className={`shell shell-catalog${active === "cart" ? " shell-cart" : ""}`}
      style={{ backgroundImage: `url(${BACKGROUND_SRC})` }}
    >
      <section className="content">
        {active === "catalog" && (
          <section className="catalog-screen" style={{ paddingTop: topStackHeight }}>
            <div ref={topStackRef} className="catalog-top-stack">
              <div className="page-hero-spacer" aria-hidden="true" />

              <div className="catalog-categories">
                {categoryId === null ? (
                  <HorizontalScrollWidget>
                    <div className="catalog-category-row">
                      {boot.categories.map((item) => (
                        <CategoryButton
                          key={item.id}
                          label={item.name}
                          active={false}
                          onClick={() => {
                            setCategoryId(item.id);
                            const firstSub = boot.subcategories.find((sub) => sub.category_id === item.id);
                            setSubcategoryId(firstSub?.id ?? null);
                          }}
                        />
                      ))}
                    </div>
                  </HorizontalScrollWidget>
                ) : (
                  <HorizontalScrollWidget>
                    <div className="catalog-category-row catalog-subcategory-row">
                      <button
                        type="button"
                        className="catalog-back-button"
                        aria-label="Назад к категориям"
                        onClick={() => {
                          setCategoryId(null);
                          setSubcategoryId(null);
                        }}
                      >
                        <ArrowLeftIcon />
                        <span>{activeCategory?.name ?? "Назад"}</span>
                      </button>
                      {subcategories.map((item) => (
                        <CategoryButton
                          key={item.id}
                          label={item.name}
                          active={subcategoryId === item.id}
                          tone="subcategory"
                          onClick={() => setSubcategoryId(item.id)}
                        />
                      ))}
                    </div>
                  </HorizontalScrollWidget>
                )}
              </div>
            </div>

            <div className="catalog-product-list">
              {filteredProducts.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  inCart={cart.some((cartItem) => cartItem.id === item.id)}
                  onOpen={() => openProduct(item)}
                  onAdd={() => toggleCartProduct(item)}
                />
              ))}
            </div>
          </section>
        )}

        {active === "cart" && (
          <section className="subpage-screen cart-screen" style={{ paddingTop: topStackHeight }}>
            <div ref={topStackRef} className="subpage-top-stack">
              <div className="page-hero-spacer" aria-hidden="true" />
            </div>
            <div className="subpage-stack cart-layout">
              <div className="cart-list">
                {cart.length === 0 ? <div className="state-card">Корзина пока пустая.</div> : cart.map((item) => (
                  <article key={item.id} className="cart-item">
                    <div className="cart-item-preview">
                      {item.image_url ? <img src={item.image_url} alt={item.name} className="cart-item-image" /> : <div className="cart-item-placeholder">{item.name.slice(0, 1)}</div>}
                    </div>
                    <div className="cart-item-copy">
                      <strong>{item.name}</strong>
                    </div>
                    <div className="cart-item-side">
                      <div className="qty cart-item-qty">
                        <button onClick={() => updateCartQuantity(item.id, -1)}>-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.id, 1)}>+</button>
                      </div>
                      <b>{item.price * item.quantity} ₽</b>
                    </div>
                  </article>
                ))}
              </div>
              <div className="cart-total">
                <div>
                  <div className="muted-line">Итого</div>
                  <strong>{total} ₽</strong>
                </div>
                <button className="primary" disabled={cart.length === 0 || total <= 0} onClick={beginCheckout}>Оформить заказ</button>
              </div>
            </div>
          </section>
        )}

        {active === "about" && (
          <section className="subpage-screen profile-screen" style={{ paddingTop: topStackHeight }}>
            <div ref={topStackRef} className="subpage-top-stack">
              <div className="page-hero-spacer" aria-hidden="true" />
            </div>
            <div className="subpage-stack">
              <div className="page-panel about-panel">
                {boot.settings.about_text}
                <div className="social-row">
                  {boot.settings.social_links
                    .filter((item) => item.url.trim())
                    .map((item) => (
                      <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="social-link">
                        {getSocialIcon(item.platform)}
                      </a>
                    ))}
                </div>
              </div>
              <div className="page-panel contact-card">
                <div className="contact-row">
                  <span>Адрес</span>
                  <strong>{boot.settings.address}</strong>
                </div>
                <div className="contact-row">
                  <span>Телефон</span>
                  <strong>{boot.settings.phone}</strong>
                </div>
                <div className="contact-row">
                  <span>Режим работы</span>
                  <strong>{boot.settings.working_hours}</strong>
                </div>
              </div>
            </div>
          </section>
        )}

        {active === "profile" && (
          <section className="subpage-screen profile-screen" style={{ paddingTop: topStackHeight }}>
            <div ref={topStackRef} className="subpage-top-stack">
              <div className="page-hero-spacer" aria-hidden="true" />
            </div>
            {!profile ? (
              <div className="page-panel profile-auth-card">
                <p>В обычном браузере приложение работает как гость без авторизации.</p>
                <p className="note">Профиль и история заказов доступны при запуске внутри Telegram Mini App.</p>
              </div>
            ) : (
              <div className="subpage-stack profile-scroll-shell">
                <div className="page-panel profile-panel">
                  <div className="profile-head">
                    {profile.user.avatar_url ? <img src={profile.user.avatar_url} alt={profile.user.full_name ?? ""} className="avatar" /> : <div className="avatar placeholder">{(profile.user.full_name || profile.user.username || "Г").slice(0, 1)}</div>}
                    <div className="profile-head-copy">
                      <span>{profile.user.username || profile.user.email || profile.user.full_name || "Пользователь"}</span>
                    </div>
                  </div>
                </div>
                <div className="page-panel history">
                  <div className="section-intro alt">
                    <span className="eyebrow">Мои заказы</span>
                  </div>
                  {sortedProfileOrders.length === 0 ? <p>Нет заказов.</p> : sortedProfileOrders.map((order) => (
                    <div key={order.id} className="history-card">
                      <div className="history-meta">
                        <span className="history-date">{new Date(order.created_at).toLocaleDateString("ru-RU")}</span>
                        <span className="history-order-id">Заказ №{order.id}</span>
                        <span className="history-spacer" aria-hidden="true" />
                        <span className="history-status">{getOrderStatusLabel(order)}</span>
                      </div>
                      <div className="history-preview-strip">
                        {order.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`history-preview ${item.product_id ? "" : "history-preview-disabled"}`}
                            onClick={() => openOrderedProduct(item)}
                            disabled={!item.product_id}
                            title={item.product_name}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.product_name} className="history-preview-image" />
                            ) : (
                              <div className="history-preview-image history-preview-placeholder">{item.product_name.slice(0, 1)}</div>
                            )}
                            <span className="history-preview-price">{item.unit_price} ₽</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </section>

      <BottomNav active={active} onChange={setActive} />

      {selectedProduct && (
        <div className="overlay" onClick={closeProduct}>
          <div className="modal product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="product-modal-body">
              <img src={selectedProduct.image_url ?? ""} alt={selectedProduct.name} className="hero-image" />
              <div className="product-detail-head">
                <h3>{selectedProduct.name}</h3>
                <strong>{selectedProduct.price} ₽</strong>
              </div>
              {selectedProduct.short_description ? <p className="product-detail-short">{selectedProduct.short_description}</p> : null}
              {selectedProduct.description && selectedProduct.description !== selectedProduct.short_description ? (
                <p className="product-detail-description">{selectedProduct.description}</p>
              ) : null}
            </div>
            <div className="sticky-action product-detail-actions">
              <button className="primary" onClick={() => addToCart(selectedProduct)}>Добавить в корзину</button>
              <button className="ghost" onClick={closeProduct}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {cartAddedDialogOpen && (
        <div className="overlay" onClick={() => setCartAddedDialogOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Товар добавлен в корзину</h3>
            <button className="primary" onClick={openCartFromDialog}>Перейти в корзину</button>
            <button className="ghost" onClick={continueShoppingFromDialog}>Продолжить покупки</button>
          </div>
        </div>
      )}

      {deliveryOpen && (
        <div className="overlay delivery-overlay" onClick={() => setDeliveryOpen(false)}>
          <div className="modal delivery-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="delivery-sheet-body">
              <div className="toggle-row delivery-toggle-row">
                <button className={deliveryMode === "delivery" ? "nav-active" : ""} onClick={() => setDeliveryMode("delivery")}>Доставка</button>
                <button className={deliveryMode === "pickup" ? "nav-active" : ""} onClick={() => setDeliveryMode("pickup")}>Самовывоз</button>
              </div>
              <div className="delivery-content">
                {deliveryMode === "delivery" ? (
                  <>
                    <div className="delivery-form-grid">
                      <label className="delivery-field-row"><span>Фамилия</span><input value={deliveryForm.last_name} onChange={(e) => setDeliveryForm({ ...deliveryForm, last_name: e.target.value })} /></label>
                      <label className="delivery-field-row"><span>Имя</span><input value={deliveryForm.first_name} onChange={(e) => setDeliveryForm({ ...deliveryForm, first_name: e.target.value })} /></label>
                      <label className="delivery-field-row"><span>Отчество</span><input value={deliveryForm.middle_name} onChange={(e) => setDeliveryForm({ ...deliveryForm, middle_name: e.target.value })} /></label>
                      <label className="delivery-field-row"><span>Телефон</span><input value={deliveryForm.phone} onChange={(e) => setDeliveryForm({ ...deliveryForm, phone: e.target.value })} /></label>
                      <label className="delivery-field-row"><span>Email</span><input value={deliveryForm.email} onChange={(e) => setDeliveryForm({ ...deliveryForm, email: e.target.value })} /></label>
                      <label className="delivery-field-row delivery-field-row-wide"><span>Адрес пункта СДЭК</span><textarea rows={4} value={deliveryForm.delivery_address} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_address: e.target.value })} /></label>
                    </div>
                    <div className="delivery-info-block">
                      <p className="note delivery-terms">{boot.settings.delivery_info}</p>
                      <label className="checkbox delivery-checkbox">
                        <input type="checkbox" checked={deliveryForm.delivery_accepted} onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_accepted: e.target.checked })} />
                        <span>Согласен с условиями доставки</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="delivery-info-block">
                    <p className="delivery-terms">{boot.settings.pickup_info}</p>
                    <div className="delivery-details-grid">
                      <div className="delivery-detail-row"><span>Адрес магазина</span><strong>{boot.settings.address}</strong></div>
                      <div className="delivery-detail-row"><span>Режим работы</span><strong>{boot.settings.working_hours}</strong></div>
                      <div className="delivery-detail-row"><span>Телефон</span><strong>{boot.settings.phone}</strong></div>
                    </div>
                    <p>
                    <label className="checkbox delivery-checkbox">
                      <input type="checkbox" checked={deliveryForm.pickup_accepted} onChange={(e) => setDeliveryForm({ ...deliveryForm, pickup_accepted: e.target.checked })} />
                      <span>Согласен с условиями самовывоза</span>
                    </label>
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="delivery-actions">
              <button className="primary" disabled={!canPay || orderSubmitting} onClick={() => void submitManualOrder()}>
                {orderSubmitting ? "Отправляем..." : "Заказать"}
              </button>
              <button className="ghost" onClick={() => setDeliveryOpen(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {orderSuccessOpen && (
        <div className="overlay" onClick={() => setOrderSuccessOpen(false)}>
          <div className="dialog order-success-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Спасибо за заказ! Для оплаты продавец свяжется с вами</h3>
            <button
              className="primary"
              onClick={() => {
                setOrderSuccessOpen(false);
                setActive("catalog");
              }}
            >
              ОК
            </button>
          </div>
        </div>
      )}

      {deliveryErrorDialog && (
        <div className="overlay" onClick={() => setDeliveryErrorDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Не удалось оформить заказ</h3>
            <p className="note">{deliveryErrorDialog}</p>
            <button className="primary" onClick={() => setDeliveryErrorDialog(null)}>ОК</button>
          </div>
        </div>
      )}

      {paymentStatusOpen && paymentStatusOrderId && (
        <div className="overlay delivery-overlay" onClick={closePaymentStatus}>
          <div className="modal delivery-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="delivery-sheet-body">
              <div className="delivery-content">
                <h3>
                  {isPaymentPaid
                    ? "Оплата прошла успешно"
                    : shouldShowSoftReturnState
                      ? "Проверяем оплату"
                      : isPaymentFailed
                      ? "Оплата не завершена"
                      : "Проверяем оплату"}
                </h3>
                <p className="note">Заказ #{paymentStatusOrderId}</p>
                <p className="note">
                  {isPaymentPaid
                    ? "Банк подтвердил оплату. Заказ принят."
                    : shouldShowSoftReturnState
                      ? "Платёж не был завершён или ещё обрабатывается. Если списание уже произошло, мы обновим статус автоматически."
                      : isPaymentPending
                        ? "Мы ждём подтверждение от банка. Это может занять несколько секунд."
                      : isPaymentFailed
                        ? "Банк не подтвердил оплату. Попробуйте снова или выберите другой способ оплаты."
                        : "Мы ждём подтверждение от банка. Это может занять несколько секунд."}
                </p>
                <div className="page-panel">
                  <div className="contact-row">
                    <span>Статус оплаты</span>
                    <strong>{getPaymentStatusLabel(paymentStatusOrder?.payment_status ?? "pending")}</strong>
                  </div>
                  <div className="contact-row">
                    <span>Сумма</span>
                    <strong>{paymentStatusOrder?.subtotal ?? total} ₽</strong>
                  </div>
                </div>
                {paymentStatusError ? <p className="note">{paymentStatusError}</p> : null}
                {paymentStatusLoading && isPaymentPending ? <p className="note">Обновляем статус...</p> : null}
              </div>
            </div>
            <div className="delivery-actions">
              <button className="primary" onClick={() => void refreshPaymentStatus(paymentStatusOrderId)} disabled={paymentStatusLoading}>
                {paymentStatusLoading ? "Проверяем..." : "Проверить ещё раз"}
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setActive("profile");
                  closePaymentStatus();
                }}
              >
                Перейти к заказам
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentSession && (
        <div className="overlay delivery-overlay" onClick={() => setPaymentSession(null)}>
          <div className="modal delivery-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="delivery-sheet-body">
              <div className="delivery-content">
                <h3>Оплата</h3>
                <p className="note">К оплате: {total} ₽</p>
                <p className="note">Заказ #{paymentOrderId}</p>
                <div className="delivery-actions">
                  {paymentSession.payment_url ? (
                    <button className="primary" onClick={openCardPayment}>
                      Оплатить картой
                    </button>
                  ) : null}
                  <button className="ghost" onClick={() => void loadSbpBanks()} disabled={sbpBanksLoading}>
                    {sbpBanksLoading ? "Загрузка банков..." : "Оплатить по СБП"}
                  </button>
                </div>
                {sbpBanks.length > 0 ? (
                  <div className="delivery-info-block">
                    <p className="delivery-terms">Выберите банк для оплаты через СБП.</p>
                    <div className="catalog-category-row">
                      {sbpBanks.map((bank) => (
                        <button
                          key={bank.id}
                          className="catalog-category-button catalog-category-button-subcategory"
                          onClick={() => void openBankPayment(bank.id)}
                          disabled={paymentBankLoadingId === bank.id}
                        >
                          {paymentBankLoadingId === bank.id ? "Открываем..." : bank.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {sbpBanksRequested && !sbpBanksLoading && sbpBanks.length === 0 && paymentSession.qr_image_svg ? (
                  <div className="page-panel" dangerouslySetInnerHTML={{ __html: paymentSession.qr_image_svg }} />
                ) : null}
                {sbpBanksRequested && !sbpBanksLoading && sbpBanks.length === 0 && paymentSession.qr_payload ? (
                  <p className="note">
                    Список банков недоступен. Используйте fallback по СБП:
                    {" "}
                    <a href={paymentSession.qr_payload}>Открыть банк</a>
                  </p>
                ) : null}
                {sbpBanksRequested && !sbpBanksLoading && sbpBanks.length === 0 && (paymentSession.qr_payload || paymentSession.qr_image_svg) ? (
                  <p className="note">Если список банков не загрузился, можно оплатить через QR или ссылку СБП выше.</p>
                ) : null}
                {sbpBanksRequested && !sbpBanksLoading && sbpBanks.length === 0 && !paymentSession.qr_payload && !paymentSession.qr_image_svg ? (
                  <p className="note">Список банков, ссылка СБП и QR пока не получены от Т-Банка для этого заказа.</p>
                ) : null}
                <p className="note">После оплаты статус заказа обновится автоматически.</p>
              </div>
            </div>
            <div className="delivery-actions">
              <button className="ghost" onClick={() => void cancelPaymentSession()}>Отменить оплату</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
