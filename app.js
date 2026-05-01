const WEBHOOK_ENDPOINTS = [
  "https://wild-pond-6b36.pancko-d9.workers.dev",
];
const BOOTSTRAP_URL = "https://script.google.com/macros/s/AKfycbyG1FnAOxm5tpUcvd4n6kvg9yHn6BMjoNOveUXggaEd6jAoDsyIo6RiYu06dPTxwTm3/exec?action=bootstrap";
const STORAGE_KEYS = {
  seller: "d9_usuario",
  history: "d9_historial",
  pending: "d9_pendientes",
  guestClient: "d9_invitado_cliente"
};
const CACHE_KEYS = {
  config: "d9_cache_config",
  users: "d9_cache_users",
  clients: "d9_cache_clients",
  products: "d9_cache_products",
  ads: "d9_cache_ads",
  support: "d9_cache_support",
  lastSync: "d9_cache_last_sync"
};

const state = {
  config: {},
  users: [],
  clients: [],
  products: [],
  ads: [],
  support: {},
  seller: null,
  activePriceList: "lista_1",
  priceSearch: "",
  priceCategory: "",
  selectedClient: null,
  guestClientDraft: null,
  selectedCategory: "",
  cart: [],
  currentView: "home",
  historyOpenId: null,
  isSending: false,
  isSyncing: false,
  manualPriceOverride: false,
  hasLoadedData: false,
  orderSendLockUntil: 0,
  lastOrderFingerprint: ""
};

const bannerCarousel = {
  index: 0,
  timer: null,
  delay: 5200,
  signature: "",
  touchStartX: 0,
  touchStartY: 0,
  isAnimating: false
};

const $ = (s) => document.querySelector(s);
const money = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(v) || 0);

function parseD9Number(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value)
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .trim();

  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");

    if (lastComma > lastDot) {
      // Formato AR: 27.172,97
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 3,025.00
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal con coma: 27172,97
      s = parts[0].replace(/\./g, "") + "." + parts[1];
    } else {
      // Miles con coma: 26,128
      s = s.replace(/,/g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const readJSON = (k, f = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
function hydrateCacheState() {
  state.config = readJSON(CACHE_KEYS.config, state.config || {});
  state.users = readJSON(CACHE_KEYS.users, state.users || []);
  state.clients = readJSON(CACHE_KEYS.clients, state.clients || []);
  state.products = readJSON(CACHE_KEYS.products, state.products || []);
  state.ads = readJSON(CACHE_KEYS.ads, state.ads || []);
  state.support = readJSON(CACHE_KEYS.support, state.support || {});
}
function persistCacheState() {
  saveJSON(CACHE_KEYS.config, state.config || {});
  saveJSON(CACHE_KEYS.users, state.users || []);
  saveJSON(CACHE_KEYS.clients, state.clients || []);
  saveJSON(CACHE_KEYS.products, state.products || []);
  saveJSON(CACHE_KEYS.ads, state.ads || []);
  saveJSON(CACHE_KEYS.support, state.support || {});
  localStorage.setItem(CACHE_KEYS.lastSync, String(Date.now()));
}
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("[D9] No pude registrar sw.js:", error);
  }
}
const onlyDigits = (v) => String(v || "").replace(/\D+/g, "");
const isTrue = (v) => String(v).trim().toLowerCase() === "true";
function esc(v){ return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }

function rowVal(row, ...keys) {
  if (!row) return "";
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v])
  );
  for (const key of keys) {
    const k = String(key).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(normalized, k) && normalized[k] != null) {
      return normalized[k];
    }
  }
  return "";
}

function isActiveAd(row) {
  const val = rowVal(row, "activo", "active");
  if (val === true || val === 1) return true;

  const s = String(val ?? "").trim().toLowerCase();
  return ["true", "si", "sí", "1", "activo", "yes"].includes(s);
}


function parseRowsByKey(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    const key = String(r.clave || "").trim();
    if (!key) return;
    out[key] = {
      valor: String(r.valor ?? "").trim(),
      tex1: String(r.tex1 ?? "").trim(),
      tex2: String(r.tex2 ?? "").trim(),
      tex3: String(r.tex3 ?? "").trim()
    };
  });
  return out;
}

function confText(key, fallback = "") {
  const row = state.config?.[key];
  if (row === null || row === undefined || row === "") return fallback;

  if (typeof row === "string") return row || fallback;
  if (typeof row === "number") return String(row);
  if (typeof row === "boolean") return String(row);

  if (typeof row === "object") {
    const value = row.valor ?? row.tex1 ?? row.texto ?? "";
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  return fallback;
}


function getCarouselDelay() {
  const raw = confText("carrusel", "");
  const n = Number(String(raw || "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return 5200;

  // Si cargás 4, lo interpreta como 4 segundos. Si cargás 4000, como 4000 ms.
  const ms = n < 100 ? n * 1000 : n;

  // Evita valores extremos por error de carga.
  return Math.max(1500, Math.min(ms, 20000));
}

function confParts(key) {
  const row = state.config?.[key];
  if (!row) return [];
  if (typeof row === "string") return row ? [row] : [];
  return [row.tex1, row.tex2, row.tex3].map(v => String(v || "").trim()).filter(Boolean);
}

function confColors(key) {
  const row = state.config?.[key];
  if (!row) return [];
  if (typeof row === "string") return row ? [row] : [];
  return [row.tex1, row.tex2, row.tex3].map(v => String(v || "").trim());
}

function buildColoredInline(parts, colors, fallback = "") {
  const cleanParts = (parts || []).filter(Boolean);
  if (!cleanParts.length) return esc(fallback);
  return cleanParts.map((part, i) => {
    const color = String(colors?.[i] || "").trim();
    const style = color ? ` style="color:${esc(color)}"` : "";
    return `<span${style}>${esc(part)}</span>`;
  }).join(" ");
}




function injectCategoryChipStylesD9() {
  if (document.getElementById("d9-category-chip-style")) return;
  const style = document.createElement("style");
  style.id = "d9-category-chip-style";
  style.textContent = `
#productModal.modal{
  align-items:center !important;
  justify-content:center !important;
  padding:6px 8px !important;
}

#productModal .product-modal-panel-d9{
  width:calc(100vw - 24px) !important;
  max-width:680px !important;
  height:calc(100dvh - 24px) !important;
  min-height:calc(100dvh - 24px) !important;
  max-height:calc(100dvh - 24px) !important;
  margin:0 auto !important;
  display:flex !important;
  flex-direction:column !important;
  overflow:hidden !important;
  border-radius:28px !important;
  padding:16px 16px 14px !important;
  background:#fff !important;
}

#productModal .modal-head-row{
  flex:0 0 auto !important;
  display:grid !important;
  grid-template-columns:1fr !important;
  align-items:start !important;
  gap:8px !important;
  margin:0 0 10px !important;
  position:relative !important;
}

#productModal .modal-head-row > div{
  min-width:0 !important;
  width:100% !important;
  padding:0 58px !important;
  text-align:center !important;
}

#productModal .modal-head-row h3{
  margin:0 0 8px !important;
  width:100% !important;
  text-align:center !important;
  font-size:25px !important;
  line-height:1.12 !important;
  font-weight:950 !important;
  letter-spacing:-.025em !important;
  color:#173454 !important;
}

#productModal .modal-head-row .ghost-x{
  position:absolute !important;
  top:0 !important;
  right:0 !important;
  z-index:8 !important;
}

#productModalHint.modal-text,
#productModalHint.small-gap{
  margin:0 !important;
  padding:0 !important;
  width:100% !important;
  color:inherit !important;
}

.modal-category-box-d9{
  width:100% !important;
  display:flex !important;
  flex-direction:column !important;
  gap:8px !important;
  margin:0 !important;
}

.modal-category-current-d9{
  width:100% !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:8px !important;
  text-align:center !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  color:#173454 !important;
}

.modal-category-current-d9 span{
  flex:0 0 auto !important;
  font-size:12px !important;
  font-weight:850 !important;
  letter-spacing:.04em !important;
  text-transform:uppercase !important;
  color:#6f8294 !important;
}

.modal-category-current-d9 strong{
  min-width:0 !important;
  max-width:55% !important;
  font-size:16px !important;
  line-height:1.1 !important;
  font-weight:950 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}

.modal-category-button-d9{
  width:100% !important;
  max-width:none !important;
  min-height:46px !important;
  height:46px !important;
  border:1px solid rgba(36,137,190,.22) !important;
  background:#f5fbff !important;
  color:#173454 !important;
  border-radius:16px !important;
  font-size:16px !important;
  font-weight:950 !important;
  display:flex !important;
  justify-content:center !important;
  align-items:center !important;
  text-align:center !important;
  padding:0 16px !important;
  margin:0 !important;
  box-shadow:none !important;
}

#productModal #productSearch{
  flex:0 0 auto !important;
  margin:0 0 12px !important;
}

#productModal #productList{
  flex:1 1 auto !important;
  min-height:0 !important;
  max-height:none !important;
  overflow-y:auto !important;
  display:flex !important;
  flex-direction:column !important;
  justify-content:flex-start !important;
  align-content:flex-start !important;
  gap:12px !important;
  padding:0 0 92px !important;
  margin:0 !important;
}

#productModal #productList .product-item,
#productModal #productList .product-picker{
  flex:0 0 auto !important;
  min-height:96px !important;
  height:auto !important;
  max-height:126px !important;
  align-items:center !important;
}

#productModal #btnProductDone{
  flex:0 0 auto !important;
  margin:0 !important;
  border-radius:18px !important;
}
`;
  document.head.appendChild(style);
}



function injectProductModalMicroStylesD9() {
  if (document.getElementById("d9-product-modal-v8-style")) return;
  const style = document.createElement("style");
  style.id = "d9-product-modal-v8-style";
  style.textContent = `
    #productModal .modal-head-row h3,
    #productModal .modal-header h2,
    #productModal .modal-head h2,
    #productModal h2:first-child{
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      font-size:24px !important;
      line-height:1.12 !important;
    }
    @media (max-width: 360px){
      #productModal .modal-head-row h3,
      #productModal .modal-header h2,
      #productModal .modal-head h2,
      #productModal h2:first-child{
        font-size:22px !important;
      }
    }
    .modal-category-current-d9 strong{ max-width:72% !important; }
    #categoryModal.front-modal-d9,
    .modal.front-modal-d9{ z-index:999999 !important; }
    #categoryModal.front-modal-d9 .modal-card,
    #categoryModal.front-modal-d9 .modal-content,
    #categoryModal.front-modal-d9 .modal-box,
    .modal.front-modal-d9 .modal-card,
    .modal.front-modal-d9 .modal-content,
    .modal.front-modal-d9 .modal-box{ z-index:1000000 !important; }
  `;
  document.head.appendChild(style);
}



function injectInlineQtyStylesD9() {
  if (document.getElementById("d9-inline-qty-style")) return;
  const style = document.createElement("style");
  style.id = "d9-inline-qty-style";
  style.textContent = `

/* === D9 cantidad inline fix v10: controles dentro de tarjeta === */
#productModal .product-picker{
  overflow:hidden !important;
}

#productModal .product-side{
  min-width:112px !important;
  max-width:128px !important;
  align-self:center !important;
  display:flex !important;
  flex-direction:column !important;
  justify-content:center !important;
  align-items:flex-end !important;
  gap:7px !important;
  padding-top:0 !important;
}

#productModal .product-side .product-price{
  width:100% !important;
  text-align:right !important;
  white-space:nowrap !important;
}

#productModal .qty-inline-d9{
  width:100% !important;
  display:flex !important;
  flex-direction:row !important;
  align-items:center !important;
  justify-content:flex-end !important;
  gap:5px !important;
  font-size:12px !important;
  color:#6f8294 !important;
  white-space:nowrap !important;
  user-select:none !important;
  margin:0 !important;
  padding:0 !important;
  position:static !important;
}

#productModal .qty-inline-d9 span:first-child{
  font-weight:800 !important;
  opacity:.86 !important;
}

#productModal .qty-inline-d9 strong{
  min-width:18px !important;
  text-align:center !important;
  font-size:15px !important;
  color:#173454 !important;
  font-weight:950 !important;
  line-height:1 !important;
}

#productModal .qty-inline-btn-d9{
  width:26px !important;
  height:26px !important;
  min-width:26px !important;
  max-width:26px !important;
  border-radius:999px !important;
  border:1px solid rgba(36,137,190,.25) !important;
  background:#ffffff !important;
  color:#173454 !important;
  font-size:19px !important;
  font-weight:950 !important;
  line-height:24px !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  padding:0 !important;
  margin:0 !important;
  box-shadow:0 2px 7px rgba(21,91,145,.10) !important;
  position:static !important;
  transform:none !important;
}

#productModal .qty-inline-btn-d9:active{
  transform:scale(.94) !important;
}
`;
  document.head.appendChild(style);
}



function bindInlineQtyCaptureD9() {
  if (window.__d9InlineQtyCaptureBound) return;
  window.__d9InlineQtyCaptureBound = true;

  let lastQtyTap = { id: "", action: "", time: 0 };

  const handleQty = (e) => {
    const qtyBtn = e.target.closest?.("[data-product-qty]");
    if (!qtyBtn) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

    const id = qtyBtn.dataset.id;
    const action = qtyBtn.dataset.productQty;
    if (!id || !action) return;

    const now = Date.now();
    if (
      lastQtyTap.id === id &&
      lastQtyTap.action === action &&
      now - lastQtyTap.time < 350
    ) {
      return;
    }

    lastQtyTap = { id, action, time: now };

    if (action === "plus") updateQty(id, 1);
    if (action === "minus") updateQty(id, -1);
  };

  // Usamos click en captura. Evitamos pointerup porque en mobile dispara doble junto con click.
  document.addEventListener("click", handleQty, true);

  document.addEventListener("keydown", (e) => {
    const qtyBtn = e.target.closest?.("[data-product-qty]");
    if (!qtyBtn) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    handleQty(e);
  }, true);
}



function injectPriceListCleanStickyD9() {
  if (document.getElementById("d9-price-clean-sticky-v2")) return;
  const style = document.createElement("style");
  style.id = "d9-price-clean-sticky-v2";
  style.textContent = `
    #priceListInfo,
    .price-info{
      display:none !important;
      height:0 !important;
      margin:0 !important;
      padding:0 !important;
      overflow:hidden !important;
    }
    #view-prices .card.section-block{
      overflow:visible !important;
    }
    #view-prices .price-sticky-d9{
      position:sticky !important;
      top:86px !important;
      z-index:80 !important;
      background:rgba(255,255,255,.98) !important;
      backdrop-filter:blur(10px) !important;
      -webkit-backdrop-filter:blur(10px) !important;
      padding:0 0 10px !important;
      margin:0 0 12px !important;
      border-radius:0 0 20px 20px !important;
    }
    #view-prices .price-sticky-d9 #priceSearch{
      background:#fff !important;
    }
    #view-prices .history-head-d9{
      z-index:90 !important;
    }
  `;
  document.head.appendChild(style);
}



function injectOrderConfirmStylesD9() {
  if (document.getElementById("d9-order-confirm-style")) return;
  const style = document.createElement("style");
  style.id = "d9-order-confirm-style";
  style.textContent = `
    .preview-box.compact-preview{ display:none !important; }

    /* Modal y panel */
    #orderConfirmModal{
      align-items:center !important;
      justify-content:center !important;
      padding:8px !important;
    }
    #orderConfirmModal .order-confirm-panel-d9{
      width:calc(100vw - 24px) !important;
      max-width:680px !important;
      height:calc(100dvh - 28px) !important;
      max-height:calc(100dvh - 28px) !important;
      min-height:calc(100dvh - 28px) !important;
      margin:0 auto !important;
      display:flex !important;
      flex-direction:column !important;
      overflow:hidden !important;
      border-radius:28px !important;
    }

    /* Header */
    #orderConfirmModal .modal-head-row{
      flex:0 0 auto !important;
      position:relative !important;
      display:flex !important;
      justify-content:center !important;
      text-align:center !important;
      padding:18px 64px 10px !important;
    }
    #orderConfirmModal .modal-head-row > div{ width:100% !important; }
    #orderConfirmModal .modal-head-row h3{
      margin:0 !important;
      font-size:25px !important;
      line-height:1.1 !important;
      font-weight:950 !important;
      color:#173454 !important;
    }
    #orderConfirmModal .modal-head-row .modal-text{
      margin:6px 0 0 !important;
      font-size:14px !important;
      line-height:1.25 !important;
    }
    #orderConfirmModal .modal-head-row .ghost-x{
      position:absolute !important;
      top:14px !important;
      right:18px !important;
    }

    /* Contenido scrolleable */
    #orderConfirmContent.order-confirm-content-d9{
      flex:1 1 auto !important;
      min-height:0 !important;
      overflow-y:auto !important;
      padding-bottom:12px !important;
    }

    /* Botones fijos abajo */
    #orderConfirmModal .confirm-actions-d9{
      flex:0 0 auto !important;
      margin-top:auto !important;
      position:sticky !important;
      bottom:0 !important;
      z-index:30 !important;
      background:#fff !important;
      padding:10px 0 6px !important;
      display:flex !important;
      gap:10px !important;
    }
    #orderConfirmModal .confirm-actions-d9 button{
      flex:1 1 0 !important;
      min-width:0 !important;
    }

    /* Ocultar grid viejo */
    #orderConfirmModal .confirm-info-grid-d9{ display:none !important; }

    /* Card cliente */
    #orderConfirmModal .confirm-client-card-d9{
      width:100% !important;
      box-sizing:border-box !important;
      border:1px solid rgba(23,52,84,.10) !important;
      background:#f7fbfe !important;
      border-radius:16px !important;
      padding:12px 14px !important;
      margin:0 !important;
    }
    #orderConfirmModal .confirm-client-card-d9 span{
      display:block !important;font-size:12px !important;font-weight:850 !important;
      color:#6f8294 !important;line-height:1.1 !important;
    }
    #orderConfirmModal .confirm-client-card-d9 strong{
      display:block !important;font-size:18px !important;line-height:1.15 !important;
      color:#173454 !important;white-space:nowrap !important;overflow:hidden !important;
      text-overflow:ellipsis !important;margin-top:4px !important;
    }
    #orderConfirmModal .confirm-client-card-d9 small{
      display:block !important;font-size:13px !important;color:#6f8294 !important;
      white-space:nowrap !important;overflow:hidden !important;
      text-overflow:ellipsis !important;margin-top:4px !important;
    }

    /* Fila de métricas */
    #orderConfirmModal .confirm-metrics-row-d9{
      display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;
      gap:7px !important;margin:0 !important;width:100% !important;box-sizing:border-box !important;
    }
    #orderConfirmModal .confirm-metric-card-d9{
      flex:1 1 0 !important;min-width:0 !important;height:72px !important;
      box-sizing:border-box !important;border:1px solid rgba(23,52,84,.10) !important;
      background:#f7fbfe !important;border-radius:15px !important;padding:9px 10px !important;
    }
    #orderConfirmModal .confirm-metric-card-d9.total{ flex:1.5 1 0 !important; }
    #orderConfirmModal .confirm-metric-card-d9 span{
      display:block !important;font-size:10px !important;font-weight:850 !important;
      color:#6f8294 !important;line-height:1 !important;white-space:nowrap !important;
      overflow:hidden !important;text-overflow:ellipsis !important;text-align:right !important;
    }
    #orderConfirmModal .confirm-metric-card-d9 strong{
      display:block !important;font-size:16px !important;line-height:1.05 !important;
      color:#173454 !important;font-weight:950 !important;white-space:nowrap !important;
      overflow:hidden !important;text-overflow:ellipsis !important;
      margin-top:8px !important;text-align:right !important;
    }
    #orderConfirmModal .confirm-metric-card-d9.total strong{ font-size:17px !important; }
  `;
  document.head.appendChild(style);
}



function hasActiveOrderDraftD9() {
  return Boolean(
    state.currentView === "order" ||
    state.selectedClient ||
    state.guestClientDraft ||
    state.selectedCategory ||
    (Array.isArray(state.cart) && state.cart.length)
  );
}


function snapshotOrderDraftD9() {
  return {
    selectedClient: state.selectedClient,
    guestClientDraft: state.guestClientDraft,
    selectedCategory: state.selectedCategory,
    cart: Array.isArray(state.cart) ? state.cart.slice() : [],
    activePriceList: state.activePriceList,
    manualPriceOverride: state.manualPriceOverride,
    currentView: state.currentView
  };
}

function restoreOrderDraftD9(snap) {
  if (!snap) return;
  state.selectedClient = snap.selectedClient;
  state.guestClientDraft = snap.guestClientDraft;
  state.selectedCategory = snap.selectedCategory;
  state.cart = Array.isArray(snap.cart) ? snap.cart.slice() : [];
  state.activePriceList = snap.activePriceList;
  state.manualPriceOverride = snap.manualPriceOverride;
  state.currentView = snap.currentView || state.currentView;
}

function safeRenderPreservingOrderDraftD9() {
  if (!hasActiveOrderDraftD9()) {
    renderAll();
    return;
  }

  const snap = snapshotOrderDraftD9();
  renderAll();
  restoreOrderDraftD9(snap);

  renderSellerBadge();
  renderPendingBadge();
  renderNetwork();
  renderQuickLabels();
  renderSelectedClient();
  renderCart();
}


function refreshPendingOnlyD9() {
  renderPendingBadge();
  renderNetwork();
}

function safeRenderAfterBackgroundTaskD9() {
  safeRenderPreservingOrderDraftD9();
}






function enableTickerTouchD9() {
  if (window.__d9TickerTouchEnabledV2) return;
  window.__d9TickerTouchEnabledV2 = true;

  const bind = () => {
    const wrap =
      document.querySelector(".led-marquee-wrap-vnext") ||
      document.querySelector(".ticker-wrap") ||
      document.querySelector(".ticker-container");

    const track =
      document.querySelector(".ticker-track") ||
      document.querySelector(".led-marquee-vnext") ||
      document.querySelector("#tickerTrack");

    if (!wrap || !track || track.dataset.touchBoundD9 === "v2") return;
    track.dataset.touchBoundD9 = "v2";

    let dragging = false;
    let startX = 0;
    let baseOffset = 0;
    let offsetPx = 0;
    let resumeTimer = null;
    const speedPxPerSecond = 45;

    const applyOffset = () => {
      const delay = -(offsetPx / speedPxPerSecond);
      track.style.animationDelay = `${delay}s`;
      track.style.webkitAnimationDelay = `${delay}s`;
    };

    const pause = () => {
      clearTimeout(resumeTimer);
      track.style.animationPlayState = "paused";
      track.style.webkitAnimationPlayState = "paused";
    };

    const play = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        track.style.animationPlayState = "running";
        track.style.webkitAnimationPlayState = "running";
      }, 900);
    };

    const onPointerDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      dragging = true;
      startX = e.clientX;
      baseOffset = offsetPx;
      pause();

      try { wrap.setPointerCapture?.(e.pointerId); } catch (_) {}
    };

    const onPointerMove = (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      // arrastrar a la derecha retrocede; izquierda avanza
      offsetPx = Math.max(0, baseOffset - dx);
      applyOffset();

      e.preventDefault();
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      try { wrap.releasePointerCapture?.(e.pointerId); } catch (_) {}
      play();
    };

    wrap.addEventListener("pointerdown", onPointerDown, { passive: true });
    wrap.addEventListener("pointermove", onPointerMove, { passive: false });
    wrap.addEventListener("pointerup", onPointerUp, { passive: true });
    wrap.addEventListener("pointercancel", onPointerUp, { passive: true });
    wrap.addEventListener("pointerleave", onPointerUp, { passive: true });
  };

  bind();

  const observer = new MutationObserver(() => bind());
  observer.observe(document.body, { childList: true, subtree: true });
}


function renderDualButton(btn, title, sub = "") {
  if (!btn) return;
  const titleEl = btn.querySelector(".title-group-vnext strong, .home-btn-title");
  const subEl = btn.querySelector(".title-group-vnext small, .home-btn-sub");
  if (titleEl || subEl) {
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
    return;
  }
  btn.innerHTML = `<span class="home-btn-title">${esc(title)}</span><span class="home-btn-sub">${esc(sub)}</span>`;
}

function setButtonBusy(btn, busy, busyLabel = "Procesando...", idleLabel = "", busySub = "") {
  if (!btn) return;
  const dual = btn.classList.contains("home-btn");

  if (!btn.dataset.idleTitle) btn.dataset.idleTitle = btn.dataset.title || btn.querySelector(".home-btn-title")?.textContent?.trim() || idleLabel || btn.textContent.trim();
  if (!btn.dataset.idleSub) btn.dataset.idleSub = btn.dataset.sub || btn.querySelector(".home-btn-sub")?.textContent?.trim() || "";
  if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.dataset.title || idleLabel || btn.textContent.trim();

  if (busy) {
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    if (dual) renderDualButton(btn, busyLabel, busySub || "Esperá un momento");
    else btn.textContent = busyLabel;
    return;
  }

  btn.disabled = false;
  btn.classList.remove("is-busy");
  btn.setAttribute("aria-busy", "false");
  if (dual) renderDualButton(btn, btn.dataset.idleTitle || idleLabel || "", btn.dataset.idleSub || "");
  else btn.textContent = btn.dataset.idleLabel || idleLabel || btn.textContent;
}



function pulseSuccess(btn, label = "Listo", sublabel = "") {
  if (!btn) return;
  const dual = btn.classList.contains("home-btn");
  const idleTitle = btn.dataset.idleTitle || btn.dataset.title || btn.textContent.trim();
  const idleSub = btn.dataset.idleSub || btn.dataset.sub || "";
  const idle = btn.dataset.idleLabel || btn.dataset.title || btn.textContent.trim();

  btn.classList.add("is-success");
  if (dual) renderDualButton(btn, label, sublabel || idleSub || "Todo sincronizado");
  else btn.textContent = label;

  setTimeout(() => {
    btn.classList.remove("is-success");
    if (dual) renderDualButton(btn, idleTitle, idleSub);
    else btn.textContent = idle;
  }, 1400);
}




function normalizarClaveConfigD9(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function confTextLooseD9(...keys) {
  const wanted = keys.map(normalizarClaveConfigD9);

  for (const key of keys) {
    const direct = confText(key, "");
    if (direct) return direct;
  }

  const config = state.config || {};
  for (const [rawKey, rawValue] of Object.entries(config)) {
    const normalizedKey = normalizarClaveConfigD9(rawKey);
    if (!wanted.includes(normalizedKey)) continue;

    if (typeof rawValue === "string" || typeof rawValue === "number") {
      const value = String(rawValue || "").trim();
      if (value) return value;
    }

    if (rawValue && typeof rawValue === "object") {
      const value = String(rawValue.valor || rawValue.tex1 || rawValue.texto || "").trim();
      if (value) return value;
    }
  }

  return "";
}

function getDefaultWhatsAppD9() {
  return confTextLooseD9(
    "telefono_wa",
    "telefono wa",
    "telefono-wa",
    "telefono",
    "wasapp",
    "whatsapp",
    "watsapp"
  );
}


function openWhatsApp(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits) return false;
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
  return true;
}



async function loadAllData() {
  const r = await fetch(BOOTSTRAP_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`Bootstrap falló: ${r.status}`);

  const data = await r.json();
  if (!data.ok) throw new Error("Bootstrap retornó ok:false");

  const sellers  = Array.isArray(data.usuarios)   ? data.usuarios   : [];
  const clients  = Array.isArray(data.clientes)   ? data.clientes   : [];
  const products = Array.isArray(data.productos)  ? data.productos  : [];
  const ads      = Array.isArray(data.publicidad) ? data.publicidad : [];

  state.config = data.config || {};
  state.support = data.soporte || {};

  state.users = sellers.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    usuario: String(r.usuario || "").trim().toLowerCase(),
    nombre: String(r.nombre || "").trim(),
    clave: String(r.clave || "").trim(),
    rol: String(r.rol || "cliente").trim().toLowerCase(),
    lista_precio: String(r.lista_precio || "").trim().toLowerCase(),
    cliente_id: String(r.cliente_id || "").trim(),
    wasap_report: String(r.wasap_report || "").trim()
  }));

  state.clients = clients.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    nombre: String(r.nombre || "").trim(),
    telefono: String(r.telefono || "").trim(),
    direccion: String(r.direccion || "").trim(),
    ciudad: String(r.ciudad || r.localidad || "").trim(),
    lista_precio: String(r.lista_precio || "").trim().toLowerCase()
  }));

  state.products = products.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    nombre: String(r.nombre || "").trim(),
    categoria: String(r.categoria || "Sin categoría").trim() || "Sin categoría",
    precios: {
      lista_1: parseD9Number(r.lista_1 || r.precio || 0),
      lista_2: parseD9Number(r.lista_2 || r.precio || 0),
      lista_3: parseD9Number(r.lista_3 || r.precio || 0)
    }
  }));

  state.ads = ads.filter(isActiveAd);
  state.hasLoadedData = true;


}


function showView(name, pushHistory = true) {
  state.currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pushHistory && name !== "home" && window.history && window.history.pushState) {
    history.pushState({ view: name }, "", location.href);
  }
}

function openModal(name, pushHistory = true) {
  const modal = document.getElementById(`${name}Modal`);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  if (pushHistory && window.history && window.history.pushState) {
    history.pushState({ modal: name, view: state.currentView || "home" }, "", location.href);
  }
}

function closeModal(name) {
  const modal = document.getElementById(`${name}Modal`);
  if (!modal) return;
  modal.classList.remove("front-modal-d9");
  modal.style.zIndex = "";
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  if (name === "product") {
    renderQuickLabels();
    renderCart();
  }
  if (name === "category") {
    renderQuickLabels();
    renderProducts();
  }
  if (name === "occasionalClient") {
    renderQuickLabels();
    renderSelectedClient();
  }
}

function getOpenModalName() {
  const modal = document.querySelector(".modal:not(.hidden)");
  if (!modal || !modal.id) return "";
  return modal.id.replace(/Modal$/, "");
}

function closeOpenModalForBack() {
  const name = getOpenModalName();
  if (!name) return false;
  closeModal(name);
  return true;
}

function setupAndroidBackButton() {
  if (!window.history || !window.history.pushState) return;

  history.replaceState({ view: state.currentView || "home" }, "", location.href);

  window.addEventListener("popstate", () => {
    if (closeOpenModalForBack()) return;

    if (state.currentView && state.currentView !== "home") {
      showView("home", false);
      return;
    }
  });
}


function updateSupportChip() {
  const chipEl = $("#btnPancko");
  if (!chipEl) return;
  chipEl.textContent =
    state.support?.["chip_info"] ||
    state.support?.["chip info"] ||
    "M.J.S.";
}

function renderTop() {
  const titleEl = $("#appTitle");
  const companyEl = $("#empresaLabel");

  if (titleEl) {
    titleEl.innerHTML = buildColoredInline(
      confParts("titulo"),
      confColors("titulo_color"),
      "Distribuidora 9"
    );
  }

  if (companyEl) {
    companyEl.innerHTML = buildColoredInline(
      confParts("subtitulo"),
      confColors("subtitulo_color"),
      "Gestor de pedidos"
    );
  }

  updateSupportChip();
}

function renderNetwork() {
  const el = $("#networkStatus");
  if (!el) return;
  el.classList.remove("online", "offline", "muted");
  if (navigator.onLine) {
    el.textContent = confText("estado_label_online", "Online");
    el.classList.add("online");
  } else {
    el.textContent = confText("estado_label_offline", "Offline");
    el.classList.add("offline");
  }
}

function renderSellerBadge() {
  const badge = $("#sellerBadge");
  if (!badge) return;

  let nameEl = badge.querySelector(".seller-name");
  if (!nameEl) {
    badge.textContent = "";
    nameEl = document.createElement("span");
    nameEl.className = "seller-name";
    badge.appendChild(nameEl);
  }

  if (!state.seller) {
    nameEl.textContent = "Sin usuario";
    badge.classList.add("muted");
    return;
  }

  renderSellerName(nameEl, state.seller.nombre || "Usuario");
  badge.classList.remove("muted");
}

function renderPendingBadge() {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  const count = pending.length;
  const el = $("#pendingBadge");
  const card = $("#btnSyncPending");
  const cardCount = document.querySelector(".pending-count-vnext");
  const cardTitle = $("#pendingInfoTitle");
  const cardSub = $("#pendingInfoText");

  if (card) {
    card.classList.toggle("has-pending", count > 0);
    card.classList.remove("syncing");
  }

  if (cardCount) {
    if (!count) {
      cardCount.classList.add("hidden");
    } else {
      cardCount.classList.remove("hidden");
      cardCount.textContent = String(count);
    }
  }

  if (cardTitle) cardTitle.textContent = count ? `${count} pendiente${count === 1 ? "" : "s"}` : "Sin pendientes";
  if (cardSub) cardSub.textContent = count ? "Se enviarán con conexión" : "Pedidos sincronizados";

  if (!el) return;
  if (!count) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.textContent = `${count} pendiente${count === 1 ? "" : "s"}`;
}

function getBannerRows() {
  return (Array.isArray(state.ads) ? state.ads : [])
    .slice()
    .sort((a, b) => Number(rowVal(a, "orden", "id") || 0) - Number(rowVal(b, "orden", "id") || 0));
}

function bannerSignature(rows) {
  return rows.map((r) => [
    rowVal(r, "orden", "id"),
    rowVal(r, "imagen_url_full", "imagen_full"),
    rowVal(r, "imagen_url", "imagen", "link_imagen"),
    rowVal(r, "titulo"),
    rowVal(r, "texto_1", "texto1", "linea1"),
    rowVal(r, "texto_2", "texto2", "linea2")
  ].join("|")).join("||");
}

function preloadBannerImages(rows) {
  rows.forEach((row) => {
    const src = String(rowVal(row, "imagen_url_full", "imagen_full") || rowVal(row, "imagen_url", "imagen", "link_imagen") || "").trim();
    if (!src) return;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  });
}

function stopBannerCarousel() {
  if (bannerCarousel.timer) {
    clearInterval(bannerCarousel.timer);
    bannerCarousel.timer = null;
  }
}

function startBannerCarousel(rows) {
  stopBannerCarousel();
  bannerCarousel.delay = getCarouselDelay();
  if (!rows || rows.length <= 1) return;
  bannerCarousel.timer = setInterval(() => {
    if (document.hidden || state.currentView !== "home") return;
    const nextIndex = (bannerCarousel.index + 1) % rows.length;
    renderBannerWithTransition(nextIndex, 1);
  }, bannerCarousel.delay);
}

function goBannerSlide(index) {
  const rows = getBannerRows();
  if (!rows.length) return;
  const newIndex = Math.max(0, Math.min(Number(index) || 0, rows.length - 1));
  const direction = newIndex >= bannerCarousel.index ? 1 : -1;
  renderBannerWithTransition(newIndex, direction);
  startBannerCarousel(rows);
}

function renderBannerWithTransition(newIndex, direction = 1) {
  const rows = getBannerRows();
  const box = $("#bannerWrap");
  if (!rows.length || !box || rows.length <= 1 || bannerCarousel.isAnimating) {
    bannerCarousel.index = Math.max(0, Math.min(Number(newIndex) || 0, Math.max(rows.length - 1, 0)));
    renderBanner(true);
    return;
  }

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    bannerCarousel.index = Math.max(0, Math.min(Number(newIndex) || 0, rows.length - 1));
    renderBanner(true);
    return;
  }

  bannerCarousel.isAnimating = true;
  box.style.setProperty("--banner-dir", direction >= 0 ? "1" : "-1");
  box.classList.remove("banner-transition-in");
  box.classList.add("banner-transition-out");

  setTimeout(() => {
    bannerCarousel.index = Math.max(0, Math.min(Number(newIndex) || 0, rows.length - 1));
    renderBanner(true);
    box.classList.remove("banner-transition-out");
    box.classList.add("banner-transition-in");

    setTimeout(() => {
      box.classList.remove("banner-transition-in");
      bannerCarousel.isAnimating = false;
    }, 560);
  }, 300);
}

function renderBanner(skipTimerReset = false) {
  const box = $("#bannerWrap");
  if (!box) return;

  const rows = getBannerRows();
  const sig = bannerSignature(rows);

  if (sig !== bannerCarousel.signature) {
    bannerCarousel.signature = sig;
    bannerCarousel.index = 0;
    preloadBannerImages(rows);
  }

  if (!rows.length) {
    stopBannerCarousel();
    box.classList.add("hidden");
    box.classList.remove("banner-mode-full", "banner-mode-product", "banner-carousel-d9");
    box.innerHTML = "";
    return;
  }

  if (bannerCarousel.index >= rows.length) bannerCarousel.index = 0;
  const first = rows[bannerCarousel.index];

  const tag = String(rowVal(first, "texto", "tag") || "").trim();
  const titulo = String(rowVal(first, "titulo") || tag || "Publicidad").trim();
  const linea1 = String(rowVal(first, "texto_1", "texto1", "linea1") || "").trim();
  const linea2 = String(rowVal(first, "texto_2", "texto2", "linea2") || "").trim();
  const imgProducto = String(rowVal(first, "imagen_url", "imagen", "link_imagen") || "").trim();
  const imgFull = String(rowVal(first, "imagen_url_full", "imagen_full") || "").trim();
  const link = String(rowVal(first, "link_url", "link") || "#").trim() || "#";
  const hasLink = link && link !== "#";
  const dotsHtml = "";

  box.classList.remove("hidden");
  box.classList.add("banner-carousel-d9");

  if (imgFull) {
    box.classList.add("banner-mode-full");
    box.classList.remove("banner-mode-product");
    box.innerHTML = `
      <a class="banner-full-d9" href="${esc(link)}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ""}>
        <img class="banner-full-img-d9" src="${esc(imgFull)}" alt="${esc(titulo || 'Publicidad')}" loading="eager">
      </a>
      ${dotsHtml}`;
    if (!skipTimerReset) startBannerCarousel(rows);
    return;
  }

  const textHtml = [
    tag ? `<div class="banner-kicker-vnext">${esc(tag)}</div>` : "",
    titulo ? `<div class="banner-title-vnext">${esc(titulo)}</div>` : "",
    linea1 ? `<div class="banner-line-vnext">${esc(linea1)}</div>` : "",
    linea2 ? `<div class="banner-line-vnext">${esc(linea2)}</div>` : ""
  ].filter(Boolean).join("");

  box.classList.add("banner-mode-product");
  box.classList.remove("banner-mode-full");
  box.innerHTML = `
    <a class="banner-product-d9" href="${esc(link)}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ""}>
      <div class="banner-copy-d9">
        ${textHtml || `<div class="banner-title-vnext">Publicidad</div>`}
      </div>
      <div class="banner-art-d9">
        ${imgProducto ? `<img class="banner-thumb-d9" src="${esc(imgProducto)}" alt="${esc(titulo || 'Publicidad')}" loading="eager">` : `<div class="banner-thumb-d9 empty"></div>`}
      </div>
    </a>
    ${dotsHtml}`;

  if (!skipTimerReset) startBannerCarousel(rows);
}

function renderTicker(){
  const el = document.getElementById("ledTicker");
  if(!el) return;

  const texts = confParts("ticker_texto");
  const colors = confColors("ticker_color");

  const parts = texts.map((t,i)=>({
    t,
    c: colors[i] || "#4dabf7"
  })).filter(p => p.t);

  if(!parts.length) return;

  const one = parts.map((p,i)=>
    `<span style="color:${p.c}">${p.t}</span>` +
    (i < parts.length - 1 ? `<span class="ticker-sep"> • </span>` : "")
  ).join("");

  el.innerHTML = `
    <div class="ticker-track" id="tickerTrack">
      <div class="ticker-block" id="tickerBlock">${one}</div>
      <div class="ticker-gap"></div>
      <div class="ticker-block">${one}</div>
    </div>
  `;

  requestAnimationFrame(() => {
    const block = document.getElementById("tickerBlock");
    const track = document.getElementById("tickerTrack");
    if(!block || !track) return;

    const distance = block.scrollWidth + 40;
    const duration = Math.max(22, Math.round(distance / 30));

    track.style.setProperty("--move", distance + "px");
    track.style.setProperty("--time", duration + "s");
  });
}


function renderSupport() {
  const s = state.support || {};
  updateSupportChip();

  const nombre = esc(s.nombre || "M.J.S. Desarrollo APPs");
  const whatsappValue = s.whatsapp ? esc(s.whatsapp) : "-";
  const whatsappHref = s.whatsapp ? `https://wa.me/${onlyDigits(s.whatsapp)}` : "";
  const emailValue = s.email ? esc(s.email) : "-";
  const webValue = s.web ? esc(s.web) : "-";
  const webHref = s.web ? esc(s.web) : "";

  $("#supportBox").innerHTML = `
    <div class="support-pro-card-d9">
      <div class="support-pro-head-d9">
        <div class="support-pro-avatar-d9">🛠️</div>
        <div>
          <div class="support-pro-kicker-d9">Soporte técnico</div>
          <strong>${nombre}</strong>
          <p>Contacto y asistencia para el uso de la app.</p>
        </div>
      </div>

      <div class="support-pro-list-d9">
        <div class="support-pro-item-d9">
          <div class="support-pro-icon-d9">📱</div>
          <div>
            <span>WhatsApp</span>
            ${whatsappHref ? `<a href="${whatsappHref}" target="_blank" rel="noopener">${whatsappValue}</a>` : `<strong>${whatsappValue}</strong>`}
          </div>
        </div>

        <div class="support-pro-item-d9">
          <div class="support-pro-icon-d9">✉️</div>
          <div>
            <span>Email</span>
            ${s.email ? `<a href="mailto:${emailValue}">${emailValue}</a>` : `<strong>${emailValue}</strong>`}
          </div>
        </div>

        <div class="support-pro-item-d9">
          <div class="support-pro-icon-d9">🌐</div>
          <div>
            <span>Web</span>
            ${webHref ? `<a href="${webHref}" target="_blank" rel="noopener">${webValue}</a>` : `<strong>${webValue}</strong>`}
          </div>
        </div>
      </div>
    </div>`;
  // append version info (robusto)
  const s2 = state.support || {};
  if (s2.version || s2.version_fecha) {
    const v = document.createElement("div");
    v.className = "support-version-d9";
    v.innerHTML = `
      ${s2.version ? `<div>Versión ${esc(s2.version)}</div>` : ``}
      ${s2.version_fecha ? `<div>${esc(s2.version_fecha)}</div>` : ``}
    `;
    $("#supportBox").appendChild(v);
  }

}

function syncSessionUI() {
  const btn = $("#btnChangeSeller");
  if (!btn) return;
  if (state.seller) {
    renderDualButton(btn, "Usuario", "Sesión actual y acceso");
    btn.dataset.title = "Usuario";
    btn.dataset.sub = "Sesión actual y acceso";
  } else {
    renderDualButton(btn, "Ingresar", "Acceder con usuario y clave");
    btn.dataset.title = "Ingresar";
    btn.dataset.sub = "Acceder con usuario y clave";
  }

  updateSupportChip();
}

function applyUserContext() {
  if (!state.seller) {
    state.activePriceList = "lista_1";
    if (state.guestClientDraft && !state.selectedClient) state.selectedClient = state.guestClientDraft;
    return;
  }
  if (state.seller.rol === "cliente") {
    const byId = state.seller.cliente_id ? state.clients.find(c => String(c.id) === String(state.seller.cliente_id)) : null;
    const byName = !byId ? state.clients.find(c => c.nombre.trim().toLowerCase() === state.seller.nombre.trim().toLowerCase()) : null;
    const matched = byId || byName;
    state.selectedClient = matched || {
      id: state.seller.cliente_id || state.seller.id,
      nombre: state.seller.nombre,
      telefono: "",
      direccion: "",
      lista_precio: state.seller.lista_precio || "lista_1"
    };
    state.activePriceList = state.selectedClient.lista_precio || state.seller.lista_precio || "lista_1";
  } else {
    state.selectedClient = null;
    state.activePriceList = state.activePriceList || "lista_1";
  }
}

function openLogin(force = false) {
  $("#sellerUser").value = "";
  $("#sellerPass").value = "";
  $("#btnLogout").classList.toggle("hidden", !state.seller);
  openModal("login");
  $("#btnCloseLogin").classList.toggle("hidden", force);
}

function closeLogin() {
  closeModal("login");
}



function onlyDigitsText(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function renderCompanyInfo() {
  const box = $("#companyContent");
  if (!box) return;

  const insti = confText("insti", "Distribuidora local orientada a la atención ágil de clientes, toma de pedidos y consulta de precios actualizados.");
  const direc = confText("direc", "");
  const wasapp = confText("wasapp", "");
  const horarios = confText("horarios", "");
  const waDigits = onlyDigitsText(wasapp);

  let html = "";

  if (insti) {
    html += `
      <div class="company-card-d9">
        <strong>Sobre la empresa</strong>
        <p>${esc(insti).replace(/\n/g, "<br>")}</p>
      </div>
    `;
  }

  html += `
    <div class="company-card-d9">
      <strong>Qué podés hacer desde la app</strong>
      <ul>
        <li>Consultar lista de precios.</li>
        <li>Armar pedidos por cliente.</li>
        <li>Enviar pedidos por WhatsApp.</li>
        <li>Trabajar con soporte offline.</li>
      </ul>
    </div>
  `;

  const contacto = [];

  if (direc) {
    contacto.push(`
      <div>
        <span>Dirección</span>
        <strong>${esc(direc)}</strong>
      </div>
    `);
  }

  if (wasapp) {
    contacto.push(`
      <div>
        <span>WhatsApp</span>
        <strong>${waDigits ? `<a href="https://wa.me/${waDigits}" target="_blank" rel="noopener">${esc(wasapp)}</a>` : esc(wasapp)}</strong>
      </div>
    `);
  }

  if (horarios) {
    contacto.push(`
      <div>
        <span>Horarios</span>
        <strong>${esc(horarios)}</strong>
      </div>
    `);
  }

  if (contacto.length) {
    html += `
      <div class="company-contact-d9">
        <strong>Contactos</strong>
        <div class="company-grid-d9">
          ${contacto.join("")}
        </div>
      </div>
    `;
  }

  box.innerHTML = html;
}

function openCompanyInfo(pushHistory = true) {
  renderCompanyInfo();
  const modal = $("#companyModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  if (pushHistory && window.history && window.history.pushState) {
    history.pushState({ modal: "company", view: state.currentView || "home" }, "", location.href);
  }
}

function closeCompanyInfo() {
  const modal = $("#companyModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}


function logoutSeller() {
  state.seller = null;
  localStorage.removeItem(STORAGE_KEYS.seller);
  state.activePriceList = "lista_1";
  state.selectedClient = null;
  state.selectedCategory = "";
  state.priceCategory = "";
  state.cart = [];
  syncSessionUI();
  renderSellerBadge();
  applyUserContext();
  renderAll();
  closeLogin();
  showView("home");
  toast("Sesión cerrada.");
}

function loginSeller() {
  const userValue = $("#sellerUser").value.trim().toLowerCase();
  const pass = $("#sellerPass").value.trim();
  const seller = state.users.find(s => s.usuario === userValue);
  if (!seller) return toast("Usuario no encontrado.");
  if (!pass || pass !== String(seller.clave || "").trim()) return toast("Clave incorrecta.");
  state.seller = seller;
  saveJSON(STORAGE_KEYS.seller, { id: seller.id, nombre: seller.nombre, usuario: seller.usuario });
  applyUserContext();
  syncSessionUI();
  renderAll();
  closeLogin();
  showView("home");
  toast(`Hola, ${seller.nombre}`);
}

function getActivePriceList() {
  if (!state.seller) return "lista_1";
  if (state.seller?.rol === "cliente") return state.selectedClient?.lista_precio || state.seller.lista_precio || "lista_1";
  return state.activePriceList || "lista_1";
}

function priceLabel(key) {
  const labels = {
    lista_1: "Lista_1 · Contado",
    lista_2: "Lista_2 · Pueblos",
    lista_3: "Lista_3 · Vendedores"
  };
  return labels[key] || key || "Lista";
}

function productPrice(product) {
  const key = getActivePriceList();
  return parseD9Number(product?.precios?.[key] || 0);
}

function renderQuickLabels() {
  const isClient = state.seller?.rol === "cliente";
  const guestMode = !state.seller;
  $("#selectedClientLabel").textContent = isClient
    ? (state.selectedClient?.nombre_real || state.selectedClient?.nombre || "Cliente asignado")
    : (state.selectedClient
        ? (state.selectedClient.ocasional ? (state.selectedClient.nombre_real || "Cliente nuevo / ocasional") : state.selectedClient.nombre)
        : (guestMode ? "Cliente nuevo / ocasional" : "Seleccionar cliente"));
  $("#selectedCategoryLabel").textContent = state.selectedCategory ? cleanCategory(state.selectedCategory) : "Todas las categorías";
  $("#selectedProductsLabel").textContent = state.cart.length ? `${state.cart.length} productos seleccionados` : "Seleccionar productos";
  const clientBtn = $("#btnOpenClients");
  if (clientBtn) {
    clientBtn.disabled = isClient;
    clientBtn.classList.toggle("is-locked", isClient);
    if (guestMode) {
      const guestSource = state.selectedClient || state.guestClientDraft;
      const guestLabel = guestSource
        ? [guestSource.nombre_real || guestSource.nombre || "Cliente nuevo / ocasional", guestSource.telefono || guestSource.ciudad || ""].filter(Boolean).join(" · ")
        : "Cargar datos primero";
      const titleEl = clientBtn.querySelector(".picker-label");
      const valueEl = document.getElementById("selectedClientLabel");
      if (titleEl) titleEl.textContent = "Cliente";
      if (valueEl) valueEl.textContent = guestLabel;
      clientBtn.dataset.title = "Cliente";
      clientBtn.dataset.sub = guestSource ? guestLabel : "Cargar datos del comprador";
      clientBtn.classList.toggle("has-client", !!guestSource);
    }
  }
  const clientSearch = $("#clientSearch");
  if (clientSearch && isClient) clientSearch.value = "";
  const productHint = $("#productModalHint");
  if (productHint) {
    const catLabel = state.selectedCategory ? cleanCategory(state.selectedCategory) : "Todas las categorías";
    productHint.innerHTML = `
      <div class="modal-category-box-d9">
        <div class="modal-category-current-d9">
          <span>Cat.</span>
          <strong>${esc(catLabel)}</strong>
        </div>
        <button id="btnCategoryInsideProductModal" class="modal-category-button-d9" type="button">Cambiar categoría</button>
      </div>
    `;
  }
}

function renderClients() {
  const term = $("#clientSearch").value.trim().toLowerCase();
  const list = $("#clientList");
  const canBrowseClients = state.seller?.rol === "vendedor";

  const base = canBrowseClients
    ? state.clients
        .filter(c => !term || c.nombre.toLowerCase().includes(term))
        .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base", numeric: true }))
    : [];

  const filtered = base.slice(0, 600);

  const occasionalBtn = `
    <button class="option-item option-button special-option" id="btnOccasionalClient" type="button">
      <strong>+ Cliente nuevo / ocasional</strong>
      <div class="option-meta">Cargar nombre, dirección, ciudad y teléfono para este pedido</div>
    </button>`;

  if (!canBrowseClients) {
    list.innerHTML = occasionalBtn;
    return;
  }

  list.innerHTML = filtered.length
    ? occasionalBtn + filtered.map(c => `
      <button class="option-item option-button ${state.selectedClient?.id === c.id ? "is-selected" : ""}" data-client-id="${esc(c.id)}" type="button">
        <strong>${esc(c.nombre)}</strong>
        <div class="option-meta">${esc(c.telefono || "Sin teléfono")} · ${esc(c.direccion || "Sin dirección")}</div>
      </button>`).join("")
    : occasionalBtn + '<div class="empty-state">No encontré clientes.</div>';
}

function selectClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  const previousClientId = state.selectedClient?.id || "";
  state.selectedClient = c;
  if (state.seller?.rol === "vendedor") {
    const previousActive = state.activePriceList || "lista_1";
    const nextList = c.lista_precio || "lista_1";
    const changedClient = previousClientId && String(previousClientId) !== String(c.id);
    const changedList = nextList !== previousActive;
    state.activePriceList = nextList;
    state.manualPriceOverride = false;
    if ((changedClient || changedList) && state.cart.length) {
      state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
      toast("Cambiaste de cliente.");
    }
    refreshPricesAcrossApp();
  }
  renderSelectedClient();
  renderOrderPriceListControls();
  renderClients();
  renderQuickLabels();
  renderCart();
  closeModal("client");
}

function renderSelectedClient() {
  const box = $("#selectedClientCard");
  if (!box) return;
  if (!state.selectedClient || !state.seller) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <strong>${esc(state.selectedClient.ocasional ? "Cliente nuevo / ocasional" : state.selectedClient.nombre)}</strong>
    <div class="mini-text">${esc(state.selectedClient.ocasional ? (state.selectedClient.nombre_real || state.selectedClient.nombre) : (state.selectedClient.telefono || "Sin teléfono"))}</div>
    <div class="mini-text">${esc(state.selectedClient.direccion || "Sin dirección")}</div>`;
}

function renderOrderPriceListControls() {
  const box = $("#orderPriceListBox");
  const select = $("#orderPriceListSelect");
  const info = $("#orderPriceListInfo");
  if (!box || !select || !info) return;

  if (state.seller?.rol === "vendedor") {
    box.classList.remove("hidden");
    select.value = state.activePriceList || "lista_1";
    const clientName = state.selectedClient?.nombre_real || state.selectedClient?.nombre || "sin cliente";
    const defaultList = state.selectedClient?.lista_precio || "lista_1";
    const currentList = state.activePriceList || defaultList;
    const override = !!state.selectedClient && currentList !== defaultList;
    info.textContent = override
      ? `Lista cambiada para ${clientName}: ${priceLabel(currentList)} (por defecto ${priceLabel(defaultList)}).`
      : `Precio activo para ${clientName}: ${priceLabel(currentList)}.`;
  } else {
    box.classList.add("hidden");
    info.textContent = "";
  }
}

function openOccasionalClientModal() {
  $("#occasionalName").value = "";
  $("#occasionalPhone").value = "";
  $("#occasionalAddress").value = "";
  $("#occasionalCity").value = "";
  const priceField = $("#occasionalPriceList");
  const priceWrap = $("#occasionalPriceWrap");
  if (priceField) priceField.value = getActivePriceList() || "lista_1";
  // D9: cliente ocasional siempre usa lista_1 por defecto; no se muestra selector de lista.
  if (priceWrap) priceWrap.classList.add("hidden");
  closeModal("client");
  openModal("occasionalClient");
}

function saveOccasionalClient() {
  const nombre = $("#occasionalName").value.trim();
  const telefono = $("#occasionalPhone").value.trim();
  const direccion = $("#occasionalAddress").value.trim();
  const ciudad = $("#occasionalCity").value.trim();
  const lista = "lista_1";

  if (!nombre) return toast("Cargá al menos el nombre del cliente.");

  const previousId = state.selectedClient?.id || "";
  const nextId = `ocasional_${Date.now()}`;
  state.selectedClient = {
    id: nextId,
    nombre: `NUEVO | ${nombre}${telefono ? ' | ' + telefono : ''}${direccion ? ' | ' + direccion : ''}${ciudad ? ' | ' + ciudad : ''}`,
    nombre_real: nombre,
    telefono,
    direccion: [direccion, ciudad].filter(Boolean).join(" · "),
    ciudad,
    lista_precio: lista,
    ocasional: true
  };
  state.guestClientDraft = state.selectedClient;
  if (!state.seller) {
    saveJSON(STORAGE_KEYS.guestClient, state.guestClientDraft);
  }
  state.activePriceList = lista;
  if (previousId && previousId !== nextId && state.cart.length) {
    state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
    toast("Cliente ocasional cargado.");
  }
  closeModal("occasionalClient");
  closeModal("client");
  closeModal("category");
  closeModal("product");
  renderSelectedClient();
  renderOrderPriceListControls();
  renderClients();
  renderQuickLabels();
  const valueEl = document.getElementById("selectedClientLabel");
  if (valueEl) valueEl.textContent = [nombre, telefono || ciudad || ""].filter(Boolean).join(" · ");
  refreshPricesAcrossApp();
  renderCart();
  showView("order");
}

function renderPriceListControls() {
  const modeBox = $("#priceListModeBox");
  const info = $("#priceListInfo");
  const select = $("#priceListSelect");
  if (!modeBox || !info || !select) return;
  info.textContent = "";
  info.classList.add("hidden"); // D9 hide price list info

  if (!state.seller) {
    state.activePriceList = "lista_1";
    modeBox.classList.add("hidden");
    info.textContent = "";
    renderPriceCategoryChips();
    return;
  }

  if (state.seller.rol === "vendedor") {
    modeBox.classList.remove("hidden");
    select.value = getActivePriceList();
    info.textContent = "";
  } else {
    modeBox.classList.add("hidden");
    info.textContent = "";
  }

  renderPriceCategoryChips();
}

function renderPriceCategoryChips() {
  const wrap = $("#priceCategoryWrap");
  if (!wrap) return;
  const label = state.priceCategory ? cleanCategory(state.priceCategory) : "Todas las categorías";
  wrap.innerHTML = `
    <button id="btnOpenPriceCategories" class="picker-btn compact-picker" type="button">
      <span class="picker-label-inline">Categoría</span>
      <strong>${esc(label)}</strong>
    </button>`;
  renderPriceCategoryModal();
}

function renderPriceCategoryModal() {
  const list = $("#priceCategoryList");
  if (!list) return;
  const cats = categoriesList();
  list.innerHTML = `
    <button class="option-item option-button ${!state.priceCategory ? "is-selected" : ""}" data-price-category="" type="button">
      <strong>Todas las categorías</strong>
    </button>` + cats.map(cat => `
    <button class="option-item option-button ${state.priceCategory === cat ? "is-selected" : ""}" data-price-category="${esc(cat)}" type="button">
      <strong>${esc(cat)}</strong>
    </button>`).join("");
}


function productHasValidPrice(p) {
  return Number(productPrice(p)) > 0;
}

function sortByName(a, b) {
  return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base", numeric: true });
}

function cleanCategory(cat) {
  return String(cat || "")
    .replace(/^\s*\d+[\s\-._:]*/, "")
    .trim();
}


function renderPriceProducts() {
  const box = $("#priceProductsList");
  if (!box) return;
  const term = (state.priceSearch || "").toLowerCase();
  const cat = state.priceCategory;

  let filtered = [];

  if (term) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => p.nombre.toLowerCase().includes(term) && (!cat || p.categoria === cat))
      .sort(sortByName)
      .slice(0, 500);
  } else if (cat) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => p.categoria === cat)
      .sort(sortByName)
      .slice(0, 500);
  } else {
    filtered = state.products
      .filter(productHasValidPrice)
      .sort(sortByName)
      .slice(0, 200);
  }

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">No encontré productos con precio válido para esa lista.</div>';
    return;
  }

  box.innerHTML = filtered.map(p => `
    <div class="price-row">
      <div class="price-row-main">
        <strong>${esc(p.nombre)}</strong>
        <div class="option-meta">${esc(cleanCategory(p.categoria))}</div>
      </div>
      <div class="price-row-side">
        <strong>${money(productPrice(p))}</strong>

      </div>
    </div>
  `).join("");
}

function refreshPricesAcrossApp() {
  state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
  renderQuickLabels();
  renderProducts();
  renderCart();
  renderOrderPriceListControls();
  renderPriceListControls();
  renderPriceProducts();
}

function categoriesList() {
  return [...new Set(
    state.products
      .filter(productHasValidPrice)
      .map(p => p.categoria)
      .filter(Boolean)
  )].sort((a, b) => cleanCategory(a).localeCompare(cleanCategory(b), "es", { sensitivity: "base", numeric: true }));
}

function renderCategories() {
  const list = $("#categoryList");
  const cats = categoriesList();
  const allItem = `
    <button class="option-item option-button ${!state.selectedCategory ? "is-selected" : ""}" data-category="" type="button">
      <strong>Todas las categorías</strong>
      <div class="option-meta">Mostrar todos los productos activos</div>
    </button>`;
  list.innerHTML = allItem + cats.map(c => `
    <button class="option-item option-button ${state.selectedCategory === c ? "is-selected" : ""}" data-category="${esc(c)}" type="button">
      <strong>${esc(cleanCategory(c))}</strong>
    </button>`).join("");
}

function selectCategory(category) {
  state.selectedCategory = category;
  $("#productSearch").value = "";
  renderCategories();
  renderProducts();
  renderQuickLabels();
  closeModal("category");
}

function renderProducts() {
  const term = $("#productSearch").value.trim().toLowerCase();
  const cat = state.selectedCategory;
  const list = $("#productList");

  let filtered = [];

  if (term) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => p.nombre.toLowerCase().includes(term) && (!cat || p.categoria === cat))
      .sort(sortByName)
      .slice(0, 500);
  } else if (cat) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => p.categoria === cat)
      .sort(sortByName)
      .slice(0, 500);
  } else {
    list.innerHTML = '<div class="empty-state">Elegí una categoría o buscá un producto.</div>';
    return;
  }

  list.innerHTML = filtered.length
    ? filtered.map(p => {
      const selected = state.cart.some(x => x.id === p.id);
      return `
        <button class="product-item product-picker ${selected ? "is-selected" : ""}" data-toggle-product="${esc(p.id)}" type="button">
          <div class="product-copy">
            <strong>${esc(p.nombre)}</strong>
            <div class="option-meta">${esc(cleanCategory(p.categoria))}</div>
          </div>
          <div class="product-side">
            <div class="product-price">${money(productPrice(p))}</div>
            ${selected ? `
              <div class="qty-inline-d9" data-no-toggle="true">
                <span>Cant:</span>
                <span class="qty-inline-btn-d9" data-product-qty="minus" data-id="${esc(p.id)}" role="button" tabindex="0">−</span>
                <strong>${state.cart.find(x => x.id === p.id)?.cantidad || 1}</strong>
                <span class="qty-inline-btn-d9" data-product-qty="plus" data-id="${esc(p.id)}" role="button" tabindex="0">+</span>
              </div>
            ` : `<div class="pick-state">Tocar para agregar</div>`}
          </div>
        </button>`;
    }).join("")
    : '<div class="empty-state">No encontré productos con precio válido.</div>';
}

function toggleProduct(id) {
  const existing = state.cart.find(x => x.id === id);
  if (existing) {
    state.cart = state.cart.filter(x => x.id !== id);
  } else {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    state.cart.push({ ...p, precio: productPrice(p), cantidad: 1 });
  }
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function updateQty(id, delta) {
  const item = state.cart.find(x => x.id === id);
  if (!item) return;
  item.cantidad += delta;
  item.precio = productPrice(item);
  if (item.cantidad <= 0) state.cart = state.cart.filter(x => x.id !== id);
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function removeItem(id) {
  state.cart = state.cart.filter(x => x.id !== id);
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function clearCart() {
  state.cart = [];
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function cartTotal() {
  return state.cart.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
}

function generateMessageText(payload = null) {
  const source = payload || {
    cliente: state.selectedClient,
    carrito: state.cart,
    vendedor: state.seller,
    total: cartTotal()
  };

  if (!source.cliente || !source.carrito.length) return "Seleccioná cliente y productos.";

  const clienteTexto = [
    source.cliente?.nombre_real || source.cliente?.nombre || "",
    source.cliente?.telefono || "",
    source.cliente?.direccion || (source.cliente?.ciudad || "")
  ].filter(Boolean).join(" | ");

  const lines = [
    "Pedido:",
    `Cliente: ${clienteTexto}`,
    source.vendedor?.nombre ? `Usuario: ${source.vendedor.nombre}` : "",
    ""
  ].filter(Boolean);

  source.carrito.forEach(item => {
    lines.push(`- ${item.nombre} x${item.cantidad} = ${money(item.precio * item.cantidad)}`);
  });

  lines.push("", `Total: ${money(source.total)}`);
  return lines.join("\n");
}

function renderCart() {
  const box = $("#cartList");
  if (!state.cart.length) {
    box.className = "cart-list empty-state";
    box.textContent = "Todavía no agregaste productos.";
  } else {
    box.className = "cart-list";
    box.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div class="cart-top">
          <div>
            <strong>${esc(item.nombre)}</strong>
            <div class="mini-text">${money(item.precio)} c/u</div>
          </div>
          <button class="remove-btn" data-remove-id="${esc(item.id)}" type="button">Quitar</button>
        </div>
        <div class="qty-row">
          <button class="qty-btn" data-qty="minus" data-id="${esc(item.id)}" type="button">−</button>
          <div class="qty-value">${item.cantidad}</div>
          <button class="qty-btn" data-qty="plus" data-id="${esc(item.id)}" type="button">+</button>
          <div class="product-price">${money(item.precio * item.cantidad)}</div>
        </div>
      </div>`).join("");
  }
  $("#summaryItems").textContent = state.cart.reduce((acc, item) => acc + item.cantidad, 0);
  $("#summaryTotal").textContent = money(cartTotal());
  const previewEl = $("#messagePreview");
  if (previewEl) previewEl.textContent = generateMessageText();
}


function buildOrderFingerprint(payload) {
  const cliente = payload?.cliente || {};
  const items = (payload?.carrito || [])
    .map(item => [
      String(item.id || ""),
      String(item.nombre || ""),
      Number(item.cantidad || 0),
      Number(item.precio || 0)
    ].join(":"))
    .join("|");

  return [
    payload?.vendedor?.id || "",
    cliente.id || cliente.nombre_real || cliente.nombre || "",
    items,
    Number(payload?.total || 0)
  ].join("||");
}

function isOrderSendLocked(payload = null) {
  const now = Date.now();
  if (state.isSending) return true;
  if (state.orderSendLockUntil && now < state.orderSendLockUntil) return true;

  if (payload) {
    const fp = buildOrderFingerprint(payload);
    if (state.lastOrderFingerprint && state.lastOrderFingerprint === fp && now < state.orderSendLockUntil) {
      return true;
    }
  }

  return false;
}

function lockOrderSend(payload, durationMs = 5000) {
  state.isSending = true;
  state.orderSendLockUntil = Date.now() + durationMs;
  state.lastOrderFingerprint = buildOrderFingerprint(payload);
}

function releaseOrderSendLock(delayMs = 1800) {
  setTimeout(() => {
    state.isSending = false;
  }, delayMs);
}



function generarPedidoIdD9(vendedorId) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${vendedorId || "0"}-${code}`;
}

function getDraftPedidoIdD9(vendedorId) {
  const key = "d9_draft_pedido_id";
  let pedidoId = localStorage.getItem(key);

  if (!pedidoId) {
    pedidoId = generarPedidoIdD9(vendedorId);
    localStorage.setItem(key, pedidoId);
  }

  return pedidoId;
}

function clearDraftPedidoIdD9() {
  localStorage.removeItem("d9_draft_pedido_id");
}


function buildOrderPayload() {
  const vendedorId = state.seller?.id || "0";
  const pedidoId = getDraftPedidoIdD9(vendedorId);

  return {
    pedido_id: pedidoId,
    fecha: new Date().toISOString(),
    vendedor: state.seller,
    cliente: state.selectedClient,
    carrito: state.cart.map(x => ({ id: x.id, nombre: x.nombre, cantidad: x.cantidad, precio: x.precio })),
    total: cartTotal(),
    detalle: state.cart.map(x => `${x.nombre} x${x.cantidad}`).join(" | ")
  };
}

function validateOrder() {
  if (!state.selectedClient) return toast(state.seller?.rol === "cliente" ? "No se encontró el cliente asignado." : "Elegí o cargá un cliente.");
  if (!state.cart.length) return toast("Agregá productos.");
  return true;
}

function buildWebhookPayload(payload) {
  const cliente = payload?.cliente || {};
  const clienteTexto = [
    cliente.nombre_real || cliente.nombre || "",
    cliente.telefono || "",
    cliente.direccion || (cliente.ciudad || "")
  ].filter(Boolean).join(" | ");

  return {
    pedido_id: payload?.pedido_id || payload?.pedidoId || "",
    vendedor_id: payload?.vendedor?.id || "",
    vendedor: payload?.vendedor?.nombre || "",
    cliente: clienteTexto,
    items: (payload?.carrito || []).map(item => ({
      nombre: item.nombre,
      cantidad: Number(item.cantidad || 0),
      precio: Number(item.precio || 0)
    })),
    total: Number(payload?.total || 0),
    fecha: payload?.fecha || new Date().toISOString()
  };
}

async function sendToEndpoint(url, sendPayload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sendPayload)
  });

  let data = null;
  const raw = await r.text();
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw };
  }

  if (!r.ok) {
    return { ok: false, status: r.status, error: data?.error || raw || "Error HTTP", endpoint: url };
  }

  return { ok: !!data?.ok, data, endpoint: url };
}

async function trySendToWebhook(payload) {
  if (!Array.isArray(WEBHOOK_ENDPOINTS) || !WEBHOOK_ENDPOINTS.length) {
    return { ok: false, error: "Webhook no configurado" };
  }

  const sendPayload = buildWebhookPayload(payload);
  let lastError = null;

  for (const endpoint of WEBHOOK_ENDPOINTS) {
    try {
      const result = await sendToEndpoint(endpoint, sendPayload);
      if (result?.ok) return result;
      lastError = result || { ok: false, error: `Fallo en ${endpoint}`, endpoint };
    } catch (error) {
      lastError = { ok: false, error: String(error), endpoint };
    }
  }

  return lastError || { ok: false, error: "No se pudo enviar el pedido" };
}

function saveHistory(payload, status = "enviado", error = "") {
  const history = readJSON(STORAGE_KEYS.history, []);
  history.unshift({
    id: `${payload.fecha}_${payload.cliente?.id || payload.cliente?.nombre_real || payload.cliente?.nombre || "pedido"}_${Math.random().toString(36).slice(2, 8)}`,
    fecha: payload.fecha,
    vendedor: payload.vendedor?.nombre || "",
    cliente: payload.cliente?.nombre_real || payload.cliente?.nombre || "",
    cliente_id: payload.cliente?.id || "",
    detalle: payload.detalle,
    total: payload.total,
    status,
    items: (payload.carrito || []).map(x => ({
      id: x.id,
      nombre: x.nombre,
      cantidad: x.cantidad,
      precio: x.precio,
      subtotal: Number(x.precio || 0) * Number(x.cantidad || 0)
    })),
    error
  });
  saveJSON(STORAGE_KEYS.history, history.slice(0, 300));
  renderHistory();
}

function savePendingPayload(payload) {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  pending.push(payload);
  saveJSON(STORAGE_KEYS.pending, pending);
  renderPendingBadge();
}

async function sendOrder() {
  if (state.isSending || (state.orderSendLockUntil && Date.now() < state.orderSendLockUntil)) return;
  if (validateOrder() !== true) return;

  const payload = buildOrderPayload();

  if (isOrderSendLocked(payload)) return;
  lockOrderSend(payload, 6000);

  const sendBtn = $("#btnSend");
  const pendingBtn = $("#btnSyncPending");
  const confirmBtn = $("#btnConfirmOrderSend");

  setButtonBusy(sendBtn, true, "Enviando...", "Enviar pedido");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Enviando...";
  }

  try {
    const defaultWa = getDefaultWhatsAppD9();

    const waPhone = state.seller?.rol === "vendedor"
      ? (state.seller.wasap_report || getDefaultWhatsAppD9())
      : getDefaultWhatsAppD9();
    const waText = generateMessageText(payload);

    if (!navigator.onLine) {
      savePendingPayload(payload);
      saveHistory(payload, "pendiente", "Sin conexión");
      clearDraftPedidoIdD9();
      renderPendingBadge();
      toast("Sin internet. Pedido guardado pendiente.");
      if (pendingBtn) pulseSuccess(pendingBtn, "Pendiente guardado", "Se enviará al recuperar conexión");
      return;
    }

    if (!openWhatsApp(waPhone, waText)) {
      toast("Falta WhatsApp destino en confi.");
      return;
    }

    trySendToWebhook(payload)
      .then(res => {
        if (!res || !res.ok) {
          savePendingPayload(payload);
          saveHistory(payload, "pendiente", res?.error || "No pude confirmar el envío");
          renderPendingBadge();
          console.warn("Pedido pendiente:", res?.error);
        } else {
          saveHistory(payload, "ok", res?.data?.duplicated ? "Ya recibido previamente" : "Enviado correctamente");
          clearDraftPedidoIdD9();
          renderPendingBadge();
        }
      })
      .catch(err => {
        savePendingPayload(payload);
        saveHistory(payload, "pendiente", String(err));
        renderPendingBadge();
        console.error("Error total, guardado local:", err);
      });

    pulseSuccess(sendBtn, "Enviado");
  } finally {
    if (state.seller?.rol === "cliente") {
      applyUserContext();
    } else if (!state.seller) {
      state.selectedClient = state.guestClientDraft || state.selectedClient;
    } else {
      state.selectedClient = null;
    }

    clearCart();
    renderSelectedClient();
    renderClients();

    setButtonBusy(sendBtn, false, "Enviando...", "Enviar pedido");

    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirmar y enviar";
    }

    releaseOrderSendLock(2200);
  }
}


function savePendingNow() {
  if (validateOrder() !== true) return;
  const payload = buildOrderPayload();
  savePendingPayload(payload);
  saveHistory(payload, "pendiente");
  clearDraftPedidoIdD9();
  if (state.seller?.rol === "cliente") {
    applyUserContext();
  } else if (!state.seller) {
    state.selectedClient = state.guestClientDraft || state.selectedClient;
  } else {
    state.selectedClient = null;
  }
  clearCart();
  renderSelectedClient();
  renderClients();
  toast("Pedido guardado como pendiente.");
}

async function syncPending() {
  if (state.isSyncing) return;

  const pending = readJSON(STORAGE_KEYS.pending, []);
  if (!navigator.onLine || !pending.length) {
    renderPendingBadge();
    if (!pending.length && state.currentView !== "order") toast("No hay pendientes.");
    return;
  }

  state.isSyncing = true;
  const syncBtn = $("#btnSyncPending");
  const syncBtnIsButton = syncBtn?.tagName === "BUTTON";
  if (syncBtnIsButton) {
    setButtonBusy(syncBtn, true, "Sincronizando...", syncBtn?.textContent?.trim() || "Pendientes", "Revisando y enviando pendientes");
  } else if (syncBtn) {
    syncBtn.classList.add("syncing");
  }

  try {
    const remaining = [];
    let sentCount = 0;

    for (const item of pending) {
      try {
        const result = await trySendToWebhook(item);
        if (result.ok) {
          sentCount++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    saveJSON(STORAGE_KEYS.pending, remaining);
    renderPendingBadge();

    if (sentCount && !remaining.length) {
      toast("Pendientes sincronizados.");
      if (syncBtnIsButton) pulseSuccess(syncBtn, "Sin pendientes", "Todo sincronizado");
      return;
    }

    if (sentCount && remaining.length) {
      toast(`Se enviaron ${sentCount}. Quedaron ${remaining.length} pendientes.`);
      return;
    }

    if (remaining.length) {
      toast(`Quedaron ${remaining.length} pendientes.`);
    }
  } finally {
    state.isSyncing = false;
    if (syncBtnIsButton) {
      setButtonBusy(syncBtn, false, "Sincronizando...", syncBtn?.dataset?.idleLabel || "Pendientes");
    } else if (syncBtn) {
      syncBtn.classList.remove("syncing");
    }
  }
}

function renderHistory() {
  const history = readJSON(STORAGE_KEYS.history, []);
  const list = $("#historyList");
  if (!history.length) {
    list.className = "history-list empty-state";
    list.textContent = "Sin movimientos todavía.";
    return;
  }

  list.className = "history-list";
  list.innerHTML = history.map(item => {
    const itemId = item.id || `${item.fecha}_${item.cliente}_${item.total}`;
    const isOpen = state.historyOpenId === itemId;
    const items = Array.isArray(item.items) ? item.items : [];
    const detailHtml = items.length
      ? `
        <div class="history-detail ${isOpen ? '' : 'hidden'}" id="detail-${esc(itemId)}">
          ${items.map(prod => `
            <div class="history-product-row">
              <div class="history-product-main">
                <strong>${esc(prod.nombre)}</strong>
                <div class="mini-text">${money(prod.precio)} c/u</div>
              </div>
              <div class="history-product-side">
                <span class="history-qty">x${esc(prod.cantidad)}</span>
                <strong>${money(prod.subtotal ?? (Number(prod.precio || 0) * Number(prod.cantidad || 0)))}</strong>
              </div>
            </div>`).join('')}
        </div>`
      : `
        <div class="history-detail ${isOpen ? '' : 'hidden'}" id="detail-${esc(itemId)}">
          <div class="mini-text">${esc(item.detalle || 'Sin detalle cargado.')}</div>
        </div>`;

    return `
      <button class="history-item ${isOpen ? 'is-open' : ''}" data-history-id="${esc(itemId)}" type="button">
        <div class="history-head-row">
          <div class="history-copy">
            <strong>${esc(item.cliente)}</strong>
            <div class="mini-text">${new Date(item.fecha).toLocaleString("es-AR")}</div>
            <div class="mini-text history-meta-line">${esc(item.vendedor)} · ${esc(item.status || "")}${item.error ? ' · ' + esc(item.error) : ''}</div>
          </div>
          <div class="history-side">
            <div class="product-price">${money(item.total)}</div>
            <div class="history-toggle">${isOpen ? '▲' : '▼'}</div>
          </div>
        </div>
        ${detailHtml}
      </button>`;
  }).join('');
}

function toggleHistoryItem(id) {
  state.historyOpenId = state.historyOpenId === id ? null : id;
  renderHistory();
}

function exportHistory() {
  const history = readJSON(STORAGE_KEYS.history, []);
  if (!history.length) return toast("No hay historial para exportar.");
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `d9_historial_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function openRestoreHistory() {
  const input = $("#restoreHistoryFile");
  if (!input) return toast("No encontré el importador.");
  input.value = "";
  input.click();
}

function restoreHistoryFromFile(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) return toast("El archivo no parece un historial válido.");
      saveJSON(STORAGE_KEYS.history, data.slice(0, 300));
      state.historyOpenId = null;
      renderHistory();
      toast("Historial restaurado.");
    } catch (err) {
      console.warn(err);
      toast("No pude leer ese archivo.");
    }
  };
  reader.readAsText(file);
}


function resetTransientUI() {
  state.isSending = false;
  state.isSyncing = false;
  const sendBtn = $("#btnSend");
  const syncBtn = $("#btnSyncPending");
  if (sendBtn) setButtonBusy(sendBtn, false, "Enviando...", "Enviar pedido");
  if (syncBtn?.tagName === "BUTTON") setButtonBusy(syncBtn, false, "Sincronizando...", syncBtn?.dataset?.idleLabel || "Pendientes");
  else if (syncBtn) syncBtn.classList.remove("syncing");
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}


function openOrderConfirmModal() {
  if (state.isSending || (state.orderSendLockUntil && Date.now() < state.orderSendLockUntil)) return;
  if (validateOrder() !== true) return;

  const modal = $("#orderConfirmModal");
  const box = $("#orderConfirmContent");
  const confirmBtn = $("#btnConfirmOrderSend");
  if (!modal || !box || !confirmBtn) {
    sendOrder();
    return;
  }

  const payload = buildOrderPayload();
  const cliente = payload.cliente || {};
  const clienteNombre = cliente.nombre_real || cliente.nombre || "Cliente";
  const clienteExtra = [cliente.telefono || "", cliente.direccion || cliente.ciudad || ""].filter(Boolean).join(" · ");
  const productosDistintos = payload.carrito.length;
  const unidadesTotales = payload.carrito.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);

  const productosHtml = payload.carrito.map(item => `
    <div class="confirm-product-row-d9">
      <div>
        <strong>${esc(item.nombre)}</strong>
        <span>x${Number(item.cantidad || 0)}</span>
      </div>
      <b>${money(Number(item.precio || 0) * Number(item.cantidad || 0))}</b>
    </div>
  `).join("");

  box.innerHTML = `
    <div class="confirm-client-card-d9">
      <span>Cliente</span>
      <strong>${esc(clienteNombre)}</strong>
      ${clienteExtra ? `<small>${esc(clienteExtra)}</small>` : ""}
    </div>

    <div class="confirm-metrics-row-d9">
      <div class="confirm-metric-card-d9 compact">
        <span>Productos</span>
        <strong>${productosDistintos}</strong>
      </div>
      <div class="confirm-metric-card-d9 compact">
        <span>Unidades</span>
        <strong>${unidadesTotales}</strong>
      </div>
      <div class="confirm-metric-card-d9 total">
        <span>Total</span>
        <strong>${money(payload.total)}</strong>
      </div>
    </div>

    <div class="confirm-section-title-d9">Productos</div>
    <div class="confirm-products-d9">${productosHtml}</div>
  `;

  confirmBtn.disabled = false;
  confirmBtn.textContent = "Confirmar y enviar";
  openModal("orderConfirm");
}

function closeOrderConfirmModal() {
  closeModal("orderConfirm");
}

function confirmOrderAndSend() {
  const confirmBtn = $("#btnConfirmOrderSend");
  if (state.isSending || (state.orderSendLockUntil && Date.now() < state.orderSendLockUntil) || confirmBtn?.disabled) return;

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Enviando...";
  }

  closeOrderConfirmModal();
  sendOrder();
}

function bind() {
  bindInlineQtyCaptureD9();

  document.addEventListener("click", (e) => {
    const insideCategoryBtn = e.target.closest("#btnCategoryInsideProductModal");
    if (insideCategoryBtn) {
      e.preventDefault();
      e.stopPropagation();
      renderCategories();
      const categoryModal = document.getElementById("categoryModal");
      if (categoryModal) {
        categoryModal.classList.add("front-modal-d9");
        categoryModal.style.zIndex = "999999";
      }
      openModal("category");
      return;
    }
  });

  $("#btnGoOrder").addEventListener("click", () => showView("order"));
  $("#btnGoPrices").addEventListener("click", () => { renderPriceListControls(); renderPriceProducts(); showView("prices"); });
  $("#btnGoHistory").addEventListener("click", () => { renderHistory(); showView("history"); });
  $("#btnPancko").addEventListener("click", () => { renderSupport(); showView("support"); });
  $("#btnChangeSeller").addEventListener("click", () => openLogin(false));
  const companyBtn = $("#btnCompanyInfo");
  if (companyBtn) companyBtn.addEventListener("click", openCompanyInfo);
  const syncPendingEl = $("#btnSyncPending");
  if (syncPendingEl?.tagName === "BUTTON") syncPendingEl.addEventListener("click", syncPending);
  $("#btnLogin").addEventListener("click", loginSeller);
  $("#btnLogout").addEventListener("click", logoutSeller);
  $("#btnSaveOccasionalClient").addEventListener("click", saveOccasionalClient);
  $("#sellerUser").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#sellerPass").focus(); });
  $("#sellerPass").addEventListener("keydown", (e) => { if (e.key === "Enter") loginSeller(); });
  $("#btnCloseLogin").addEventListener("click", closeLogin);
  $("#clientSearch").addEventListener("input", renderClients);
  $("#productSearch").addEventListener("input", renderProducts);
  $("#priceSearch").addEventListener("input", (e) => { state.priceSearch = e.target.value.trim().toLowerCase(); renderPriceProducts(); });
  $("#priceListSelect").addEventListener("change", (e) => { state.activePriceList = e.target.value; refreshPricesAcrossApp(); });
  const orderPriceSelect = $("#orderPriceListSelect");
  if (orderPriceSelect) orderPriceSelect.addEventListener("change", (e) => {
    const next = e.target.value || "lista_1";
    if (state.activePriceList === next) {
      renderOrderPriceListControls();
      return;
    }
    state.activePriceList = next;
    state.manualPriceOverride = !!state.selectedClient && next !== (state.selectedClient.lista_precio || "lista_1");
    refreshPricesAcrossApp();
    if (state.cart.length) toast(`Se aplicó ${priceLabel(next)} al pedido.`);
  });
  $("#btnClearCart").addEventListener("click", clearCart);
  $("#btnSend").addEventListener("click", openOrderConfirmModal);
  $("#btnCancelOrderConfirm")?.addEventListener("click", closeOrderConfirmModal);
  $("#btnConfirmOrderSend")?.addEventListener("click", confirmOrderAndSend);
  $("#btnSavePending").addEventListener("click", savePendingNow);
  $("#btnExportHistory").addEventListener("click", exportHistory);
  $("#btnRestoreHistory")?.addEventListener("click", openRestoreHistory);
  $("#restoreHistoryFile")?.addEventListener("change", restoreHistoryFromFile);
  $("#btnOpenClients").addEventListener("click", () => {
    if (state.seller?.rol === "cliente") return;
    if (!state.seller) {
      openOccasionalClientModal();
      return;
    }
    renderClients();
    openModal("client");
  });
  $("#btnOpenCategories").addEventListener("click", () => {
    if (!state.selectedClient && !state.seller?.rol) {
      toast("Primero cargá los datos del comprador.");
      openOccasionalClientModal();
      return;
    }
    renderCategories();
    openModal("category");
  });
  $("#btnOpenProducts").addEventListener("click", () => {
    if (!state.selectedClient && !state.seller?.rol) {
      toast("Primero cargá los datos del comprador.");
      openOccasionalClientModal();
      return;
    }
    renderProducts();
    openModal("product");
  });

  document.addEventListener("click", (ev) => {
    const back = ev.target.closest("[data-back]");
    if (back) showView(back.dataset.back);

    const closeBtn = ev.target.closest("[data-close-modal]");
    if (closeBtn) closeModal(closeBtn.dataset.closeModal);

    const occasional = ev.target.closest("#btnOccasionalClient");
    if (occasional) openOccasionalClientModal();

    const client = ev.target.closest("[data-client-id]");
    if (client) selectClient(client.dataset.clientId);

    const cat = ev.target.closest("[data-category]");
    if (cat) selectCategory(cat.dataset.category);

    const toggle = ev.target.closest("[data-toggle-product]");
    if (toggle) toggleProduct(toggle.dataset.toggleProduct);

    const qty = ev.target.closest("[data-qty]");
    if (qty) updateQty(qty.dataset.id, qty.dataset.qty === "plus" ? 1 : -1);

    const remove = ev.target.closest("[data-remove-id]");
    if (remove) removeItem(remove.dataset.removeId);

    const historyItem = ev.target.closest("[data-history-id]");
    if (historyItem) toggleHistoryItem(historyItem.dataset.historyId);

    const bannerDot = ev.target.closest("[data-banner-slide]");
    if (bannerDot) {
      ev.preventDefault();
      goBannerSlide(bannerDot.dataset.bannerSlide);
      return;
    }

    const openPriceCats = ev.target.closest("#btnOpenPriceCategories");
    if (openPriceCats) {
      renderPriceCategoryModal();
      openModal("priceCategory");
    }

    const priceCategory = ev.target.closest("[data-price-category]");
    if (priceCategory) {
      state.priceCategory = priceCategory.dataset.priceCategory || "";
      renderPriceCategoryChips();
      renderPriceProducts();
      closeModal("priceCategory");
    }
  });

  const bannerEl = document.getElementById("bannerWrap");
  if (bannerEl) {
    bannerEl.addEventListener("touchstart", (ev) => {
      const t = ev.touches?.[0];
      if (!t) return;
      bannerCarousel.touchStartX = t.clientX;
      bannerCarousel.touchStartY = t.clientY;
    }, { passive: true });

    bannerEl.addEventListener("touchend", (ev) => {
      const t = ev.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - bannerCarousel.touchStartX;
      const dy = t.clientY - bannerCarousel.touchStartY;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      const rows = getBannerRows();
      if (rows.length <= 1) return;
      const nextIndex = dx < 0
        ? (bannerCarousel.index + 1) % rows.length
        : (bannerCarousel.index - 1 + rows.length) % rows.length;
      renderBannerWithTransition(nextIndex, dx < 0 ? 1 : -1);
      startBannerCarousel(rows);
    }, { passive: true });
  }

  window.addEventListener("online", async () => { renderNetwork(); try { await loadAllData(); persistCacheState(); renderAll(); } catch (e) { console.warn(e); } syncPending(); });
  window.addEventListener("offline", () => { renderNetwork(); renderAll(); });
  window.addEventListener("pageshow", () => { resetTransientUI(); renderQuickLabels(); renderCart(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resetTransientUI(); });
}

function hydrateGuestClient() {
  const stored = readJSON(STORAGE_KEYS.guestClient, null);
  if (!stored?.nombre) return false;
  state.guestClientDraft = stored;
  return true;
}

function hydrateSeller() {
  const stored = readJSON(STORAGE_KEYS.seller, null);
  if (!stored?.id) return false;
  const seller = state.users.find(s => s.id === stored.id);
  if (!seller) return false;
  state.seller = seller;
  return true;
}

function renderAll() {
  renderTop();
  renderNetwork();
  renderSellerBadge();
  renderPendingBadge();
  renderBanner();
  renderTicker();
  renderSupport();
  syncSessionUI();
  if (state.currentView !== "order") applyUserContext();
  renderQuickLabels();
  renderCategories();
  renderClients();
  renderSelectedClient();
  renderProducts();
  renderCart();
  renderPriceListControls();
  renderPriceProducts();
  renderHistory();
}


function formatSellerNameLines(nombre){
  const clean = String(nombre || "").trim();
  if (!clean) return ["Sin usuario"];
  if (clean.length <= 18) return [clean];

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
  }

  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean);
}

function renderSellerName(el, nombre){
  const lines = formatSellerNameLines(nombre);
  el.replaceChildren();
  lines.forEach((line, index) => {
    if (index) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(line));
  });
}

async function init() {
  enableTickerTouchD9();
  injectOrderConfirmStylesD9();
  injectPriceListCleanStickyD9();
  injectCategoryChipStylesD9();
  injectProductModalMicroStylesD9();
  injectInlineQtyStylesD9();
  setupAndroidBackButton();
  bind();
  hydrateCacheState();
  hydrateGuestClient();
  hydrateSeller();
  renderAll();
  renderNetwork();
  await registerServiceWorker();

  if (!navigator.onLine) {
    return;
  }

  try {
    await loadAllData();
    persistCacheState();
    hydrateGuestClient();
    hydrateSeller();
    // Si el usuario está en "order" al momento del bootstrap, no pisamos su contexto
    if (state.currentView !== "order") {
      applyUserContext();
    }
    renderAll();
    renderNetwork();
    syncPending();
  } catch (error) {
    console.error(error);
    if (!state.products.length && !state.clients.length) {
      toast("No pude cargar los datos.");
    }
    renderNetwork();
  }
}
document.addEventListener("click", (e) => {

  // Botón EDITAR
  if (e.target.id === "btnCancelOrderConfirm") {
    closeOrderConfirmModal();
  }

  // Botón CONFIRMAR
  if (e.target.id === "btnConfirmOrderSend") {
    confirmOrderAndSend();
  }

});
init();
