import "./styles.css";
import { createClient, type RealtimeChannel, type Session } from "@supabase/supabase-js";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { DELIVERY_FEE_KOBO, OAUTH_REDIRECT, SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/* ------------------------------------------------------------------ *
 * Blue mobile app
 * Uses the same Supabase project as the website:
 *  - same auth users  -> one account for web + app
 *  - same cart_items  -> cart is shared; Realtime pushes changes instantly
 * ------------------------------------------------------------------ */

type Product = {
  id: string;
  slug: string;
  name: string;
  price_kobo: number;
  image_url: string | null;
  stock: number;
  is_featured: boolean;
};
type Line = { product: Product; quantity: number };
type Tab = "shop" | "cart" | "account";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
});

const state = {
  ready: false,
  session: null as Session | null,
  tab: "shop" as Tab,
  authMode: "signin" as "signin" | "signup",
  authBusy: false,
  authError: "",
  authNotice: "",
  products: [] as Product[],
  productsLoaded: false,
  productsError: "",
  lines: [] as Line[],
  cartLoaded: false,
  cartError: "",
  live: false,
  busyIds: new Set<string>(),
};

const app = document.getElementById("app")!;
let channel: RealtimeChannel | null = null;

/* ---------------- helpers ---------------- */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

// Product images ship inside the app (same files as the website's /public/products).
const imgSrc = (p: Product) => (p.image_url ? (p.image_url.startsWith("http") ? p.image_url : "." + p.image_url) : "");

const count = () => state.lines.reduce((n, l) => n + l.quantity, 0);
const subtotal = () => state.lines.reduce((n, l) => n + l.quantity * l.product.price_kobo, 0);

let toastTimer: number | undefined;
function toast(msg: string) {
  let el = document.querySelector<HTMLDivElement>(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el!.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 2200);
}

const icons = {
  logo: `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#1446ff"/><path d="M6 9h7M4 13h9M7 17h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M15 7l4 5-4 5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logoWhite: `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="7" fill="#fff"/><path d="M6 9h7M4 13h9M7 17h6" stroke="#1446ff" stroke-width="2" stroke-linecap="round"/><path d="M15 7l4 5-4 5" stroke="#1446ff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  shop: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h16l-1 10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9V7a4 4 0 0 1 8 0v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  cart: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/></svg>`,
  user: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  google: `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`,
};

/* ---------------- data ---------------- */

async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, price_kobo, image_url, stock, is_featured")
    .order("is_featured", { ascending: false })
    .order("created_at");
  state.productsLoaded = true;
  state.productsError = error ? "We couldn't load products. Check your connection and pull to refresh." : "";
  state.products = (data ?? []) as Product[];
  render();
}

async function loadCart() {
  const uid = state.session?.user.id;
  if (!uid) return;
  const { data, error } = await supabase
    .from("cart_items")
    .select("quantity, product:products(id, slug, name, price_kobo, image_url, stock, is_featured)")
    .eq("user_id", uid)
    .order("id");
  state.cartLoaded = true;
  if (error) {
    state.cartError = "We couldn't load your cart. Check your connection.";
  } else {
    state.cartError = "";
    state.lines = (data ?? [])
      .filter((r) => r.product)
      .map((r) => ({ product: r.product as unknown as Product, quantity: r.quantity as number }));
  }
  render();
}

let refreshTimer: number | undefined;
function refreshCartSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(loadCart, 250);
}

function subscribeCart() {
  unsubscribeCart();
  if (!state.session) return;
  // RLS means we only receive our own cart rows; any change just triggers a refetch.
  channel = supabase
    .channel(`cart-${state.session.user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "cart_items" }, refreshCartSoon)
    .subscribe((status) => {
      state.live = status === "SUBSCRIBED";
      render();
    });
}

function unsubscribeCart() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  state.live = false;
}

async function setQuantity(product: Product, quantity: number) {
  const uid = state.session?.user.id;
  if (!uid) return;
  const q = Math.max(0, Math.min(quantity, product.stock));
  state.busyIds.add(product.id);
  // Optimistic update so taps feel instant
  const existing = state.lines.find((l) => l.product.id === product.id);
  if (q === 0) state.lines = state.lines.filter((l) => l.product.id !== product.id);
  else if (existing) existing.quantity = q;
  else state.lines.push({ product, quantity: q });
  render();

  const { error } =
    q === 0
      ? await supabase.from("cart_items").delete().eq("user_id", uid).eq("product_id", product.id)
      : await supabase
          .from("cart_items")
          .upsert({ user_id: uid, product_id: product.id, quantity: q }, { onConflict: "user_id,product_id" });

  state.busyIds.delete(product.id);
  if (error) toast("That change didn't save. Please try again.");
  await loadCart();
}

async function addToCart(product: Product) {
  const current = state.lines.find((l) => l.product.id === product.id)?.quantity ?? 0;
  if (current >= product.stock) return toast("All available stock is already in your cart.");
  await setQuantity(product, current + 1);
  toast(`${product.name} added to cart`);
}

/* ---------------- auth ---------------- */

async function emailAuth(form: HTMLFormElement) {
  const fd = new FormData(form);
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const fullName = String(fd.get("full_name") ?? "").trim();
  state.authError = "";
  state.authNotice = "";
  if (state.authMode === "signup" && fullName.length < 2) return setAuthError("Enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return setAuthError("Enter a valid email address.");
  if (password.length < 6) return setAuthError("Password must be at least 6 characters.");

  state.authBusy = true;
  render();
  if (state.authMode === "signup") {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    state.authBusy = false;
    if (error) return setAuthError(friendly(error.message));
    if (!data.session) {
      state.authNotice = "Account created. Check your email to confirm it, then sign in.";
      state.authMode = "signin";
      return render();
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    state.authBusy = false;
    if (error) return setAuthError(friendly(error.message));
  }
}

function setAuthError(msg: string) {
  state.authBusy = false;
  state.authError = msg;
  render();
}

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email or password is incorrect.";
  if (m.includes("already")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("not confirmed")) return "Confirm your email first, then sign in.";
  if (m.includes("network") || m.includes("fetch")) return "No connection. Check your internet and try again.";
  return "Something went wrong. Please try again.";
}

async function googleSignIn() {
  state.authError = "";
  const native = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: native ? OAUTH_REDIRECT : window.location.href, skipBrowserRedirect: native },
  });
  if (error || !data?.url) return setAuthError("We couldn't reach Google. Please try again.");
  if (native) await Browser.open({ url: data.url });
}

// Google sends the user back to com.ugonwa.blue://login-callback?code=...
App.addListener("appUrlOpen", async ({ url }) => {
  if (!url.startsWith(OAUTH_REDIRECT)) return;
  try {
    await Browser.close();
  } catch {
    /* already closed */
  }
  const params = new URL(url.replace("#", "?")).searchParams;
  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) setAuthError("Google sign-in didn't complete. Please try again.");
  } else {
    setAuthError("Google sign-in was cancelled.");
  }
});

// Refetch when the app comes back to the foreground
App.addListener("resume", () => {
  if (state.session) loadCart();
});

supabase.auth.onAuthStateChange((_event, session) => {
  const changed = session?.user.id !== state.session?.user.id;
  state.session = session;
  state.ready = true;
  if (changed) {
    state.lines = [];
    state.cartLoaded = false;
    state.tab = "shop";
    // Defer: Supabase advises not to call its API inside this callback directly.
    setTimeout(() => {
      if (session) {
        loadCart();
        subscribeCart();
        if (!state.productsLoaded) loadProducts();
      } else {
        unsubscribeCart();
      }
    }, 0);
  }
  render();
});

/* ---------------- views ---------------- */

function viewAuth() {
  const signup = state.authMode === "signup";
  return `
  <div class="auth">
    <section class="hero">
      <div class="logo">${icons.logoWhite}<span>Blue</span></div>
      <h1 class="display" style="font-size:38px">${signup ? "Create your account" : "Gadgets at the speed of Blue."}</h1>
      <p>Use the same account as the Blue website. Your cart follows you everywhere.</p>
    </section>

    <div style="margin-top:22px">
      <button class="btn btn-white" data-action="google" ${state.authBusy ? "disabled" : ""}>${icons.google} Continue with Google</button>
    </div>
    <div class="divider" aria-hidden="true">or use email</div>

    <div class="seg" role="tablist" aria-label="Sign in or create account">
      <button role="tab" aria-selected="${!signup}" data-action="mode" data-mode="signin">Sign in</button>
      <button role="tab" aria-selected="${signup}" data-action="mode" data-mode="signup">Create account</button>
    </div>

    <form id="auth-form" class="stack" novalidate>
      ${
        signup
          ? `<div><label for="full_name">Full name</label><input class="field" id="full_name" name="full_name" autocomplete="name" /></div>`
          : ""
      }
      <div><label for="email">Email</label><input class="field" id="email" name="email" type="email" inputmode="email" autocomplete="email" /></div>
      <div><label for="password">Password</label><input class="field" id="password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" /></div>
      ${state.authError ? `<p class="alert alert-error" role="alert">${esc(state.authError)}</p>` : ""}
      ${state.authNotice ? `<p class="alert alert-ok" role="status">${esc(state.authNotice)}</p>` : ""}
      <button class="btn btn-primary" type="submit" ${state.authBusy ? "disabled" : ""}>
        ${state.authBusy ? "Please wait..." : signup ? "Create account" : "Sign in"}
      </button>
    </form>
  </div>`;
}

function viewShop() {
  if (!state.productsLoaded) {
    return `<h1 class="display page-title">Shop</h1>
      <ul class="grid" aria-busy="true" aria-label="Loading products">${Array.from({ length: 4 })
        .map(() => `<li><div class="card-img skeleton"></div><div class="skeleton" style="height:14px;border-radius:7px;margin-top:10px"></div></li>`)
        .join("")}</ul>`;
  }
  if (state.productsError) {
    return `<h1 class="display page-title">Shop</h1><p class="alert alert-error" style="margin-top:16px">${state.productsError}</p>
      <button class="btn btn-light" style="margin-top:12px" data-action="reload-products">Try again</button>`;
  }
  return `
    <h1 class="display page-title">Shop</h1>
    <p class="muted" style="margin:6px 0 0">Pay on delivery · ${naira(DELIVERY_FEE_KOBO)} delivery</p>
    <ul class="grid">
      ${state.products
        .map((p) => {
          const out = p.stock <= 0;
          const busy = state.busyIds.has(p.id);
          return `<li>
            <div class="card-img">
              <img src="${imgSrc(p)}" alt="" loading="lazy" />
              ${out ? `<span class="chip">Out of stock</span>` : ""}
            </div>
            <p class="card-name">${esc(p.name)}</p>
            <p class="card-price">${naira(p.price_kobo)}</p>
            <button class="btn ${out ? "btn-light" : "btn-primary"} btn-sm" style="width:100%" data-action="add" data-id="${p.id}"
              ${out || busy ? "disabled" : ""} aria-label="Add ${esc(p.name)} to cart">
              ${out ? "Out of stock" : busy ? "Adding..." : "Add to cart"}
            </button>
          </li>`;
        })
        .join("")}
    </ul>`;
}

function viewCart() {
  const head = `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
      <h1 class="display page-title">Cart</h1>
      <button class="btn btn-light btn-sm" data-action="reload-cart">Refresh</button>
    </div>`;
  if (!state.cartLoaded) return head + `<div class="skeleton" style="height:96px;border-radius:20px;margin-top:18px"></div>`;
  const err = state.cartError ? `<p class="alert alert-error" style="margin-top:12px">${state.cartError}</p>` : "";
  if (state.lines.length === 0) {
    return (
      head +
      err +
      `<div class="empty"><p style="font-size:20px;font-weight:600;margin-bottom:6px">Your cart is empty.</p>
       <p class="muted">Items you add on the website show up here too.</p>
       <button class="btn btn-primary" data-action="tab" data-tab="shop">Shop now</button></div>`
    );
  }
  const sub = subtotal();
  return (
    head +
    err +
    `<ul class="lines" aria-label="Items in your cart">
      ${state.lines
        .map(({ product: p, quantity: q }) => {
          const busy = state.busyIds.has(p.id);
          return `<li class="line">
            <div class="line-img"><img src="${imgSrc(p)}" alt="" /></div>
            <div class="line-body">
              <div class="line-top">
                <p class="line-name">${esc(p.name)}<br><span class="muted" style="font-weight:400;font-size:14px">${naira(p.price_kobo)} each</span></p>
                <button class="icon-btn" data-action="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${icons.x}</button>
              </div>
              <div class="line-bottom">
                <div class="stepper" role="group" aria-label="Quantity for ${esc(p.name)}">
                  <button data-action="dec" data-id="${p.id}" ${busy ? "disabled" : ""} aria-label="${q === 1 ? "Remove" : "Decrease"} ${esc(p.name)}">−</button>
                  <span aria-live="polite">${q}</span>
                  <button data-action="inc" data-id="${p.id}" ${busy || q >= p.stock ? "disabled" : ""} aria-label="Increase ${esc(p.name)}">+</button>
                </div>
                <strong style="font-variant-numeric:tabular-nums">${naira(p.price_kobo * q)}</strong>
              </div>
            </div>
          </li>`;
        })
        .join("")}
    </ul>
    <section class="summary" aria-label="Order summary">
      <p class="row"><span class="muted">Subtotal</span><span>${naira(sub)}</span></p>
      <p class="row"><span class="muted">Delivery</span><span>${naira(DELIVERY_FEE_KOBO)}</span></p>
      <p class="row total"><span>Total</span><span>${naira(sub + DELIVERY_FEE_KOBO)}</span></p>
      <button class="btn btn-primary" style="margin-top:8px" data-action="checkout">Checkout on website</button>
      <p class="muted" style="font-size:13px;text-align:center;margin:10px 0 0">Pay on delivery. Your cart is already waiting there.</p>
    </section>`
  );
}

function viewAccount() {
  const u = state.session!.user;
  const name = (u.user_metadata?.full_name as string | undefined) ?? "";
  return `
    <h1 class="display page-title">Account</h1>
    <section class="panel">
      <h2>${esc(name || "Signed in")}</h2>
      <p class="muted" style="margin:0">${esc(u.email ?? "")}</p>
    </section>
    <section class="panel">
      <h2>Cart sync</h2>
      <p class="muted" style="margin:0">${
        state.live
          ? "Live. Changes on the website appear here instantly, and the other way round."
          : "Connecting… Your cart still syncs whenever you open the app or tap Refresh."
      }</p>
    </section>
    <div style="margin-top:18px" class="stack">
      <button class="btn btn-light" data-action="orders">My orders on the website</button>
      <button class="btn btn-light" data-action="signout">Sign out</button>
    </div>`;
}

function render() {
  if (!state.ready) {
    app.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center">${icons.logo}</div>`;
    return;
  }
  if (!state.session) {
    const focused = document.activeElement?.id;
    const values = Object.fromEntries(
      Array.from(document.querySelectorAll<HTMLInputElement>("#auth-form input")).map((i) => [i.name, i.value])
    );
    app.innerHTML = viewAuth();
    // keep what the user typed across re-renders
    document.querySelectorAll<HTMLInputElement>("#auth-form input").forEach((i) => {
      if (values[i.name] !== undefined) i.value = values[i.name];
    });
    if (focused) document.getElementById(focused)?.focus();
    return;
  }
  const c = count();
  const body = state.tab === "shop" ? viewShop() : state.tab === "cart" ? viewCart() : viewAccount();
  const tab = (id: Tab, label: string, icon: string, badge = "") =>
    `<button class="tab" data-action="tab" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ""}>${icon}<span>${label}</span>${badge}</button>`;
  app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <span class="logo">${icons.logo}<span>Blue</span></span>
      <span class="live ${state.live ? "live-on" : ""}"><span class="live-dot"></span>${state.live ? "Live sync" : "Connecting"}</span>
    </header>
    <main class="content">${body}</main>
    <nav class="tabbar" aria-label="Main">
      ${tab("shop", "Shop", icons.shop)}
      ${tab("cart", "Cart", icons.cart, c > 0 ? `<span class="badge" aria-label="${c} items">${c > 99 ? "99+" : c}</span>` : "")}
      ${tab("account", "Account", icons.user)}
    </nav>
  </div>`;
}

/* ---------------- events ---------------- */

app.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  if (form.id === "auth-form") {
    e.preventDefault();
    emailAuth(form);
  }
});

app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el) return;
  const id = el.dataset.id;
  const product = id ? state.products.find((p) => p.id === id) ?? state.lines.find((l) => l.product.id === id)?.product : undefined;
  const line = id ? state.lines.find((l) => l.product.id === id) : undefined;

  switch (el.dataset.action) {
    case "mode":
      state.authMode = el.dataset.mode as "signin" | "signup";
      state.authError = "";
      state.authNotice = "";
      render();
      break;
    case "google":
      googleSignIn();
      break;
    case "tab":
      state.tab = el.dataset.tab as Tab;
      render();
      window.scrollTo(0, 0);
      if (state.tab === "cart") loadCart();
      break;
    case "add":
      if (product) addToCart(product);
      break;
    case "inc":
      if (product && line) setQuantity(product, line.quantity + 1);
      break;
    case "dec":
      if (product && line) setQuantity(product, line.quantity - 1);
      break;
    case "remove":
      if (product) setQuantity(product, 0);
      break;
    case "reload-cart":
      state.cartLoaded = false;
      render();
      loadCart();
      break;
    case "reload-products":
      state.productsLoaded = false;
      render();
      loadProducts();
      break;
    case "checkout":
      await Browser.open({ url: `${SITE_URL}/checkout` });
      break;
    case "orders":
      await Browser.open({ url: `${SITE_URL}/orders` });
      break;
    case "signout":
      await supabase.auth.signOut();
      break;
  }
});

render();
// Products are public, so load them straight away.
loadProducts();
