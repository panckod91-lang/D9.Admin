const API_BASE = "https://script.google.com/macros/s/AKfycbwg8YQ7lqtLFbxnmtHnM3TxHaCaVoHQ_7AJHKPhiQRyrX6OyqO004F2pSABjI5df3yI/exec";
const BOOTSTRAP_URL = `${API_BASE}?action=bootstrap`;
const APP_VERSION = "v2.1.5 (pedidos busca id_producto)";
const IVA_RATE_D9 = 0.21;
const XLS_PRICE_INCLUDES_IVA_D9 = false;

const state = {
  config: {}, soporte: {}, clientes: [], productos: [], usuarios: [], publicidad: [], pedidos: [], importedProducts: []
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const money = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const priceAR = (v) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

let lastRefreshAtD9 = 0;
let isVersionUpdateAvailableD9 = false;

function formatRefreshAgeD9() {
  if (!lastRefreshAtD9) return "Sin actualizar";
  const diff = Math.max(0, Date.now() - lastRefreshAtD9);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);

  if (sec < 20) return "Actualizado ahora";
  if (sec < 60) return `Hace ${sec}s`;
  if (min < 60) return `Hace ${min} min`;

  const h = Math.floor(min / 60);
  return `Hace ${h} h`;
}

function updateRefreshBadgeD9() {
  if (isVersionUpdateAvailableD9) return;
  const badge = $("#adminBadge .seller-name");
  if (badge) badge.textContent = formatRefreshAgeD9();
}


function setVersionUpdateAvailableD9(flag, latestVersion = "") {
  isVersionUpdateAvailableD9 = !!flag;

  const badge = $("#adminBadge");
  const text = $("#adminBadge .seller-name");
  if (!badge || !text) return;

  badge.classList.toggle("version-alert-d9", !!flag);

  if (flag) {
    text.innerHTML = "⚠️ Actualizar";
    badge.title = latestVersion ? `Nueva versión disponible: ${latestVersion}` : "Nueva versión disponible";
    badge.setAttribute("role", "button");
  } else {
    badge.classList.remove("version-alert-d9");
    badge.removeAttribute("role");
    badge.title = "";
    text.textContent = formatRefreshAgeD9();
  }
}

async function checkAppVersionD9() {
  try {
    const res = await fetch(`./app.js?vcheck=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const txt = await res.text();
    const match = txt.match(/const\s+APP_VERSION\s*=\s*"([^"]+)"/);
    const latest = match ? String(match[1] || "").trim() : "";
    if (latest && latest !== APP_VERSION) {
      setVersionUpdateAvailableD9(true, latest);
    } else {
      setVersionUpdateAvailableD9(false);
    }
  } catch (err) {
    console.warn("No se pudo verificar versión nueva:", err);
  }
}

function setUpdatingStateD9(updating) {
  const badge = $("#adminBadge");
  const text = $("#adminBadge .seller-name");
  if (!badge || !text) return;

  badge.classList.toggle("is-updating-d9", !!updating);
  text.textContent = updating ? "Actualizando..." : formatRefreshAgeD9();
}

function setSyncBusyD9(busy) {
  const btn = $("#btnReload");
  if (!btn) return;
  btn.classList.toggle("is-syncing-d9", !!busy);
  btn.textContent = busy ? "↻ Sync…" : "↻ Sync";
}

function setNetworkStatusD9(status) {
  const el = $("#networkStatus");
  if (!el) return;
  el.classList.remove("online", "offline", "muted", "error");
  if (status === "online") {
    el.textContent = "Online";
    el.classList.add("online");
  } else if (status === "offline") {
    el.textContent = "Offline";
    el.classList.add("offline");
  } else if (status === "syncing") {
    el.textContent = "Sync…";
    el.classList.add("muted");
  } else {
    el.textContent = "Error";
    el.classList.add("error");
  }
}

setInterval(updateRefreshBadgeD9, 30000);
window.addEventListener("online", () => setNetworkStatusD9("online"));
window.addEventListener("offline", () => setNetworkStatusD9("offline"));


function toast(msg, type = "ok") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add("hidden"), 2800);
}

function getConfigText(key, sub = "tex1") {
  const v = state.config?.[key];
  if (v === null || v === undefined) return "";

  // 🔥 CLAVE: no repetir tex1 en tex2/tex3
  if (typeof v !== "object") {
    return sub === "tex1" ? String(v ?? "") : "";
  }

  return v[sub] ?? "";
}

function setView(name, pushHistory = true) {
  $$(".view").forEach(v => v.classList.remove("active"));
  const target = $(`#view-${name}`);
  if (target) target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "clientes") renderClientesView();
  if (name === "usuarios") renderUsuariosView();
  if (name === "publicidad") renderPublicidadView();
  if (name === "config") renderConfigForm();
  if (name === "estadisticas") renderStatsView();

  if (pushHistory && name !== "home" && window.history && window.history.pushState) {
    history.pushState({ view: name }, "", location.href);
  }
}

async function loadBootstrap() {
  setSyncBusyD9(true);
  setNetworkStatusD9(navigator.onLine ? "online" : "offline");
  setUpdatingStateD9(true);
  try {
    const r = await fetch(BOOTSTRAP_URL, { cache: "no-store" });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Bootstrap sin OK");
    Object.assign(state, {
      config: data.config || {}, soporte: data.soporte || {}, clientes: data.clientes || [], productos: data.productos || [], usuarios: data.usuarios || [], publicidad: data.publicidad || []
    });
    applyHeader();
    lastRefreshAtD9 = Date.now();
    setNetworkStatusD9("online");
    setUpdatingStateD9(false);
    toast(`Datos actualizados · ${APP_VERSION}`);
    checkAppVersionD9();
  } catch (err) {
    setUpdatingStateD9(false);
    setNetworkStatusD9("error");
    toast("No se pudo actualizar datos", "error");
    console.error(err);
  } finally {
    setSyncBusyD9(false);
  }
}

function applyHeader() {
  $("#appTitle").textContent = "D9 Admin";
  $("#empresaLabel").textContent = "Panel de administración";
  $("#modalCompanyTitle").textContent = getConfigText("titulo") || "Distribuidora 9";
  $("#modalCompanySubtitle").textContent = getConfigText("subtitulo") || "Información institucional";
}

function renderConfigForm() {
  const form = $("#configForm");
  const fields = [
    { key: "titulo", label: "Título", type: "triple" },
    { key: "subtitulo", label: "Subtítulo", type: "triple" },
    { key: "telefono_wa", label: "WhatsApp", type: "single" },
    { key: "ticker_texto", label: "Ticker - texto", type: "triple" },
    { key: "ticker_color", label: "Ticker - colores", type: "triple" },
    { key: "carrusel", label: "Carrusel / velocidad", type: "single" },
    { key: "insti", label: "Institucional", type: "triple", area: true },
    { key: "direc", label: "Dirección", type: "single" },
    { key: "email", label: "Email", type: "single" },
    { key: "web", label: "Web", type: "single" }
  ];

  form.innerHTML = fields.map(f => fieldHtml(f)).join("") + `
    <div class="admin-actions sticky-actions">
      <button class="admin-btn" type="button" data-view="home">Cancelar</button>
      <button class="admin-btn primary" type="submit">Guardar Confi</button>
    </div>`;

  form.onsubmit = saveConfig;
}

function fieldHtml(f) {
  if (f.type === "single") {
    return `<label class="admin-label">${f.label}<input class="admin-input" data-config="${f.key}" value="${escapeHtml(getConfigText(f.key))}" /></label>`;
  }
  const make = (sub) => f.area
    ? `<textarea class="admin-input admin-textarea" data-config="${f.key}.${sub}">${escapeHtml(getConfigText(f.key, sub))}</textarea>`
    : `<input class="admin-input" data-config="${f.key}.${sub}" value="${escapeHtml(getConfigText(f.key, sub))}" />`;
  return `<div class="admin-card"><strong>${f.label}</strong><div class="admin-triple"><label>tex1 ${make("tex1")}</label><label>tex2 ${make("tex2")}</label><label>tex3 ${make("tex3")}</label></div></div>`;
}

async function saveConfig(ev) {
  ev.preventDefault();
  const config = structuredClone(state.config || {});
  $$('[data-config]').forEach(input => {
    const path = input.dataset.config.split('.');
    if (path.length === 1) config[path[0]] = input.value.trim();
    else {
      if (!config[path[0]] || typeof config[path[0]] !== "object") config[path[0]] = { tex1: "", tex2: "", tex3: "" };
      config[path[0]][path[1]] = input.value.trim();
    }
  });
  await apiPost({ action: "update_config", config });
  state.config = config;
  applyHeader();
  toast("Confi guardada en Sheet DEV");
}

function parsePrice(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  let s = String(value).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return Number(s) || 0;
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
}

function parseXlsRows(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const idx = (names) => names.map(normalizeHeader).map(n => headers.indexOf(n)).find(i => i >= 0);
  const iCodigo = idx(["Codigo", "Código"]);
  const iRubro = idx(["Rubro"]);
  const iDesc = idx(["Descripcion", "Descripción"]);
  const iLista1 = idx(["Lista1", "Lista 1"]);
  if ([iCodigo, iRubro, iDesc, iLista1].some(i => i === undefined)) throw new Error("No encontré columnas Codigo, Rubro, Descripcion y Lista1");

  return rows.slice(1).map(r => {
    const precioBase = parsePrice(r[iLista1]);
    const precio = XLS_PRICE_INCLUDES_IVA_D9 ? precioBase : Math.round((precioBase * (1 + IVA_RATE_D9)) * 100) / 100;
    return {
      id: String(r[iCodigo] ?? "").trim(),
      nombre: String(r[iDesc] ?? "").trim(),
      categoria: String(r[iRubro] ?? "").trim(),
      lista_1: precio,
      lista_2: "",
      lista_3: "",
      activo: "si"
    };
  }).filter(p => p.id && p.nombre && Number(p.lista_1) > 0);
}

async function parseXlsFile() {
  const file = $("#xlsInput").files?.[0];
  if (!file) return toast("Elegí un archivo XLS primero", "error");
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    state.importedProducts = parseXlsRows(rows);
    $("#xlsSummary").textContent = `Archivo: ${file.name} · productos válidos: ${state.importedProducts.length} · IVA 21% aplicado`;
    $("#btnSaveProducts").disabled = !state.importedProducts.length;
    renderProductsPreview();
  } catch (err) {
    console.error(err);
    toast(err.message || "No se pudo leer el XLS", "error");
  }
}

function renderProductsPreview() {
  const sample = state.importedProducts.slice(0, 80);
  $("#productsPreview").innerHTML = tableHtml(sample, ["id", "nombre", "categoria", "lista_1", "lista_2", "lista_3", "activo"], "Vista previa con IVA 21% incluido: primeras 80 filas");
}

async function saveImportedProducts() {
  if (!state.importedProducts.length) return toast("No hay productos importados", "error");
  if (!$("#confirmReplaceProducts").checked) return toast("Marcá la confirmación para actualizar productos", "error");

  $("#btnSaveProducts").disabled = true;
  toast("Guardando productos con IVA 21% incluido…");

  try {
    const result = await apiPost({ action: "update_productos", productos: state.importedProducts });
    toast(`Productos OK · actualizados: ${result.actualizados || 0} · agregados: ${result.agregados || 0}`);
    $("#xlsSummary").textContent = `Guardado OK · recibidos ${result.recibidos || state.importedProducts.length} · válidos ${result.validos || state.importedProducts.length} · actualizados ${result.actualizados || 0} · agregados ${result.agregados || 0} · total hoja ${result.total_hoja || "?"}`;
    await loadBootstrap();
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar productos: " + err.message, "error");
    $("#xlsSummary").textContent = "Error guardando productos: " + err.message;
  } finally {
    $("#btnSaveProducts").disabled = false;
  }
}

async function loadOrders() {
  const url = `${API_BASE}?action=list_pedidos&ts=${Date.now()}`;
  try {
    $("#ordersSummary").textContent = "Cargando pedidos…";
    $("#ordersTable").innerHTML = "";

    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("El script no devolvió JSON: " + text.slice(0, 120));
    }

    const rawPedidos = Array.isArray(data) ? data : (Array.isArray(data.pedidos) ? data.pedidos : []);

    if (!data.ok && !Array.isArray(data)) {
      throw new Error(data.error || "Respuesta sin OK");
    }

    state.pedidos = rawPedidos.map(normalizeOrderRow);
    renderOrders();
    toast(`Pedidos cargados: ${state.pedidos.length}`);
  } catch (err) {
    console.error(err);
    state.pedidos = [];
    $("#ordersSummary").textContent = "Error cargando pedidos: " + err.message;
    $("#ordersTable").innerHTML = `<div class="admin-card"><strong>Pedidos</strong><p class="admin-note">No se pudieron cargar. Probá abrir /exec?action=list_pedidos.</p></div>`;
    toast("No se pudieron cargar pedidos", "error");
  }
}

function normalizeOrderRow(o) {
  return {
    fecha: o.fecha || "",
    pedido_id: o.pedido_id || o.id_pedido || o.id_comp || o["id_comp."] || o.id || "",
    vendedor_id: o.vendedor_id || "",
    vendedor: o.vendedor || "",
    cliente: o.cliente || "",
    item: o.item || o.detalle || o.producto || o.nombre || "",
    id_producto: o.id_producto || o.producto_id || o.idproducto || "",
    cantidad: parsePrice(o.cantidad ?? o.total ?? 0) || 0,
    precio: parsePrice(o.precio || 0) || 0,
    total_item: parsePrice(o.total_item ?? o.totalitem ?? 0) || 0,
    total_pedido: parsePrice(o.total_pedido ?? o.totalpedido ?? 0) || 0,
    _raw: o
  };
}

function parseOrderDate(fecha) {
  const s = String(fecha || "").trim();
  if (!s) return "";

  // dd/MM/yyyy HH:mm:ss
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yy = m[3];
    return `${yy}-${mm}-${dd}`;
  }

  // yyyy-MM-dd...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return "";
}

function normalizeSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getUserColorForOrderD9(order, orderIndexBySeller) {
  const sellerId = String(order.vendedor_id || "").trim();
  const sellerName = String(order.vendedor || "").trim().toLowerCase();

  const user = (state.usuarios || []).find(u => {
    const uid = String(u.id || "").trim();
    const uname = String(u.nombre || "").trim().toLowerCase();
    return (sellerId && uid && uid === sellerId) || (sellerName && uname && uname === sellerName);
  });

  const c1 = user?.color_1 && /^#[0-9A-Fa-f]{6}$/.test(String(user.color_1)) ? String(user.color_1) : "#F4FAFF";
  const c2 = user?.color_2 && /^#[0-9A-Fa-f]{6}$/.test(String(user.color_2)) ? String(user.color_2) : "#FFFFFF";

  const key = sellerId || sellerName || "_general";
  const n = orderIndexBySeller.get(key) || 0;
  orderIndexBySeller.set(key, n + 1);

  return n % 2 === 0 ? c1 : c2;
}

function renderOrdersVisualD9(rows) {
  if (!rows.length) {
    return `<div class="admin-card"><strong>Pedidos</strong><p class="admin-note">Sin pedidos para mostrar.</p></div>`;
  }

  const groups = [];
  const map = new Map();

  rows.forEach(row => {
    const id = String(row.pedido_id || "").trim() || `sin_id_${groups.length}`;
    if (!map.has(id)) {
      const group = { id, rows: [] };
      map.set(id, group);
      groups.push(group);
    }
    map.get(id).rows.push(row);
  });

  const orderIndexBySeller = new Map();

  return `
    <div class="admin-card">
      <strong>Pedidos</strong>
      <div class="orders-compact-list-d9">
        ${groups.slice(0, 500).map(group => {
          const first = group.rows[0] || {};
          const color = getUserColorForOrderD9(first, orderIndexBySeller);
          const total = group.rows.reduce((s, r) => s + Number(r.total_item || 0), 0);
          const cantidadItems = group.rows.reduce((s, r) => s + Number(r.cantidad || 0), 0);
          const lines = group.rows.length;
          const detailId = `order_detail_${escapeHtml(group.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

          return `
            <details class="order-compact-admin-d9" style="--order-bg:${escapeHtml(color)}">
              <summary class="order-summary-admin-d9">
                <div class="order-summary-main-d9">
                  <strong>${escapeHtml(first.cliente || "Sin cliente")}</strong>
                  <small>${escapeHtml(first.fecha || "")} · ${escapeHtml(first.vendedor || "Sin vendedor")}</small>
                </div>
                <div class="order-summary-side-d9">
                  <span>${escapeHtml(group.id)}</span>
                  <b>${money(total)}</b>
                </div>
                <div class="order-summary-arrow-d9">⌄</div>
              </summary>

              <div class="order-detail-admin-d9" id="${detailId}">
                <div class="order-detail-meta-d9">
                  ${lines} línea${lines === 1 ? "" : "s"} · ${cantidadItems} unidad${cantidadItems === 1 ? "" : "es"}
                </div>

                ${group.rows.map(r => `
                  <div class="order-detail-line-d9">
                    <span>${escapeHtml(r.item || "")}</span>
                    <em>${Number(r.cantidad || 0)}</em>
                    <small>${money(r.precio || 0)}</small>
                    <strong>${money(r.total_item || 0)}</strong>
                  </div>
                `).join("")}
              </div>
            </details>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderOrders() {
  const qRaw = $("#orderFilterText")?.value || "";
  const terms = normalizeSearch(qRaw).split(/\s+/).filter(Boolean);
  const from = $("#orderFilterFrom")?.value || "";
  const to = $("#orderFilterTo")?.value || "";

  let rows = (state.pedidos || []).filter(o => {
    const txt = normalizeSearch([
      o.fecha,
      o.pedido_id,
      o.vendedor_id,
      o.vendedor,
      o.cliente,
      o.item,
      o.id_producto,
      o.cantidad,
      o.precio,
      o.total_item,
      o.total_pedido
    ].join(" "));

    if (terms.length && !terms.every(t => txt.includes(t))) return false;

    const d = parseOrderDate(o.fecha);
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    return true;
  });

  const total = rows.reduce((s, r) => s + Number(r.total_item || 0), 0);
  const pedidosUnicos = new Set(rows.map(r => String(r.pedido_id || "").trim()).filter(Boolean));
  const totalPedidos = pedidosUnicos.size;
  const pedidosCargados = new Set((state.pedidos || []).map(r => String(r.pedido_id || "").trim()).filter(Boolean)).size;

  $("#ordersSummary").textContent = `${totalPedidos} pedido${totalPedidos === 1 ? "" : "s"} · ${rows.length} línea${rows.length === 1 ? "" : "s"} · total filtrado: ${money(total)} · cargados: ${pedidosCargados} pedidos / ${(state.pedidos || []).length} líneas`;
  $("#ordersTable").innerHTML = renderOrdersVisualD9(rows);
}

function normalizeClientRow(c = {}) {
  return {
    id: String(c.id ?? "").trim(),
    nombre: String(c.nombre ?? "").trim(),
    telefono: String(c.telefono ?? "").trim(),
    direccion: String(c.direccion ?? "").trim(),
    ciudad: String(c.ciudad ?? c.localidad ?? "").trim(),
    activo: String(c.activo ?? "si").trim() || "si"
  };
}

function renderClientesView() {
  const container = $("#view-clientes");
  if (!container) return;

  const term = String($("#clientFilter")?.value || "").trim().toLowerCase();

  const rows = (state.clientes || [])
    .map(normalizeClientRow)
    .filter(c => {
      if (!term) return true;
      return [c.id, c.nombre, c.telefono, c.direccion, c.ciudad, c.activo]
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base", numeric: true }));

  container.innerHTML = `
    <div class="admin-page-head">
      <button class="admin-home-btn" data-view="home" type="button">🏠</button>
      <div>
        <h2>Clientes</h2>
        <p>Buscar y editar clientes existentes.</p>
      </div>
    </div>

    <div class="admin-card admin-client-tools">
      <input id="clientFilter" class="admin-input" placeholder="Buscar cliente, teléfono o dirección" value="${escapeHtml(term)}" />
      <button id="btnNewClient" class="admin-btn primary" type="button">+ Nuevo cliente</button>
      <p class="admin-note">${rows.length} cliente${rows.length === 1 ? "" : "s"} mostrado${rows.length === 1 ? "" : "s"} · ${state.clientes.length} total</p>
    </div>

    <div id="clientEditorWrap"></div>

    <div class="admin-card">
      <strong>Clientes</strong>
      <div class="client-list-admin-d9">
        ${rows.length ? rows.slice(0, 500).map(c => `
          <button class="client-row-admin-d9" type="button" data-client-edit="${escapeHtml(c.id)}">
            <span>
              <strong>${escapeHtml(c.nombre || "Sin nombre")}</strong>
              <small>${escapeHtml([c.telefono, c.direccion, c.ciudad].filter(Boolean).join(" · ") || "Sin datos extra")}</small>
            </span>
            <em>${escapeHtml(c.activo || "si")}</em>
          </button>
        `).join("") : `<p class="admin-note">No encontré clientes con ese filtro.</p>`}
      </div>
    </div>
  `;

  const newBtn = $("#btnNewClient");
  if (newBtn) newBtn.onclick = openNewClientEditor;

  const filter = $("#clientFilter");
  if (filter) {
    filter.oninput = () => renderClientesView();
    filter.focus();
    filter.setSelectionRange(filter.value.length, filter.value.length);
  }
}

function nextClientIdAdminD9() {
  const nums = (state.clientes || [])
    .map(c => Number(String(c.id || "").replace(/\D+/g, "")))
    .filter(n => Number.isFinite(n) && n > 0);

  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next);
}

function openNewClientEditor() {
  openClientEditor("", true);
}

function openClientEditor(id, isNew = false) {
  const original = isNew ? null : (state.clientes || []).find(c => String(c.id) === String(id));
  if (!isNew && !original) return toast("No encontré ese cliente", "error");

  const c = isNew
    ? { id: nextClientIdAdminD9(), nombre: "", telefono: "", direccion: "", ciudad: "", activo: "si" }
    : normalizeClientRow(original);

  const wrap = $("#clientEditorWrap");
  if (!wrap) return;

  wrap.innerHTML = `
    <form id="clientEditForm" class="admin-card client-editor-admin-d9">
      <strong>${isNew ? "Nuevo cliente" : "Editar cliente"}</strong>
      <p class="admin-note">${isNew ? "Se agregará como una fila nueva en clientes." : "Se actualizará el cliente existente por ID."}</p>

      <div class="admin-form-grid">
        <label class="admin-label">ID
          <input class="admin-input" data-client-field="id" value="${escapeHtml(c.id)}" ${isNew ? "" : "readonly"} />
        </label>

        <label class="admin-label">Nombre
          <input class="admin-input" data-client-field="nombre" value="${escapeHtml(c.nombre)}" />
        </label>

        <label class="admin-label">Teléfono
          <input class="admin-input" data-client-field="telefono" value="${escapeHtml(c.telefono)}" />
        </label>

        <label class="admin-label">Dirección
          <input class="admin-input" data-client-field="direccion" value="${escapeHtml(c.direccion)}" />
        </label>

        <label class="admin-label">Activo
          <select class="admin-input" data-client-field="activo">
            <option value="si" ${String(c.activo).toLowerCase() !== "no" ? "selected" : ""}>si</option>
            <option value="no" ${String(c.activo).toLowerCase() === "no" ? "selected" : ""}>no</option>
          </select>
        </label>
      </div>

      <div class="admin-actions sticky-actions">
        <button class="admin-btn" type="button" id="btnCancelClientEdit">Cancelar</button>
        <button class="admin-btn primary" type="submit">${isNew ? "Crear cliente" : "Guardar cliente"}</button>
      </div>
    </form>
  `;

  $("#btnCancelClientEdit").onclick = () => {
    wrap.innerHTML = "";
  };

  $("#clientEditForm").onsubmit = saveClientEdit;
  wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveClientEdit(ev) {
  ev.preventDefault();

  const cliente = {};
  $$("[data-client-field]").forEach(input => {
    cliente[input.dataset.clientField] = String(input.value || "").trim();
  });

  if (!cliente.id) return toast("Cliente sin ID", "error");
  if (!cliente.nombre) return toast("Cargá nombre del cliente", "error");

  try {
    const result = await apiPost({ action: "update_clientes", clientes: [cliente] });
    toast(`Cliente guardado · actualizados: ${result.actualizados || 0} · nuevos: ${result.agregados || 0}`);
    await loadBootstrap();
    renderClientesView();
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar cliente: " + err.message, "error");
  }
}


function normalizeUserRow(u = {}) {
  return {
    id: String(u.id ?? "").trim(),
    usuario: String(u.usuario ?? "").trim(),
    nombre: String(u.nombre ?? "").trim(),
    clave: String(u.clave ?? "").trim(),
    rol: String(u.rol ?? "vendedor").trim() || "vendedor",
    wasap_report: String(u.wasap_report ?? "").trim(),
    cliente_id: String(u.cliente_id ?? "").trim(),
    color_1: String(u.color_1 ?? "#DDEEFF").trim() || "#DDEEFF",
    color_2: String(u.color_2 ?? "#FFFFFF").trim() || "#FFFFFF",
    activo: String(u.activo ?? "si").trim() || "si"
  };
}

function renderUsuariosView() {
  const container = $("#view-usuarios");
  if (!container) return;

  const term = String($("#userFilter")?.value || "").trim().toLowerCase();

  const rows = (state.usuarios || [])
    .map(normalizeUserRow)
    .filter(u => {
      if (!term) return true;
      return [u.id, u.usuario, u.nombre, u.rol, u.wasap_report, u.cliente_id, u.activo]
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .sort((a, b) => String(a.nombre || a.usuario || "").localeCompare(String(b.nombre || b.usuario || ""), "es", { sensitivity: "base", numeric: true }));

  container.innerHTML = `
    <div class="admin-page-head">
      <button class="admin-home-btn" data-view="home" type="button">🏠</button>
      <div>
        <h2>Usuarios</h2>
        <p>Buscar, editar y crear usuarios.</p>
      </div>
    </div>

    <div class="admin-card admin-user-tools">
      <input id="userFilter" class="admin-input" placeholder="Buscar usuario, nombre, rol o WhatsApp" value="${escapeHtml(term)}" />
      <button id="btnNewUser" class="admin-btn primary" type="button">+ Nuevo usuario</button>
      <p class="admin-note">${rows.length} usuario${rows.length === 1 ? "" : "s"} mostrado${rows.length === 1 ? "" : "s"} · ${state.usuarios.length} total</p>
    </div>

    <div id="userEditorWrap"></div>

    <div class="admin-card">
      <strong>Usuarios</strong>
      <div class="user-list-admin-d9">
        ${rows.length ? rows.slice(0, 500).map(u => `
          <button class="user-row-admin-d9" type="button" data-user-edit="${escapeHtml(u.id)}">
            <span>
              <strong>${escapeHtml(u.nombre || u.usuario || "Sin nombre")}</strong>
              <small>${escapeHtml([u.usuario, u.rol, u.wasap_report].filter(Boolean).join(" · ") || "Sin datos extra")}</small>
            </span>
            <em>${escapeHtml(u.activo || "si")}</em>
          </button>
        `).join("") : `<p class="admin-note">No encontré usuarios con ese filtro.</p>`}
      </div>
    </div>
  `;

  const newBtn = $("#btnNewUser");
  if (newBtn) newBtn.onclick = openNewUserEditor;

  const filter = $("#userFilter");
  if (filter) {
    filter.oninput = () => renderUsuariosView();
    filter.focus();
    filter.setSelectionRange(filter.value.length, filter.value.length);
  }
}

function nextUserIdAdminD9() {
  const nums = (state.usuarios || [])
    .map(u => Number(String(u.id || "").replace(/\D+/g, "")))
    .filter(n => Number.isFinite(n) && n > 0);

  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next);
}

function openNewUserEditor() {
  openUserEditor("", true);
}

function openUserEditor(id, isNew = false) {
  const original = isNew ? null : (state.usuarios || []).find(u => String(u.id) === String(id));
  if (!isNew && !original) return toast("No encontré ese usuario", "error");

  const u = isNew
    ? { id: nextUserIdAdminD9(), usuario: "", nombre: "", clave: "", rol: "vendedor", wasap_report: "", cliente_id: "", color_1: "#DDEEFF", color_2: "#FFFFFF", activo: "si" }
    : normalizeUserRow(original);

  const wrap = $("#userEditorWrap");
  if (!wrap) return;

  wrap.innerHTML = `
    <form id="userEditForm" class="admin-card user-editor-admin-d9">
      <strong>${isNew ? "Nuevo usuario" : "Editar usuario"}</strong>
      <p class="admin-note">${isNew ? "Se agregará como una fila nueva en usuarios." : "Se actualizará el usuario existente por ID."}</p>

      <div class="admin-form-grid">
        <label class="admin-label">ID
          <input class="admin-input" data-user-field="id" value="${escapeHtml(u.id)}" ${isNew ? "" : "readonly"} />
        </label>

        <label class="admin-label">Usuario
          <input class="admin-input" data-user-field="usuario" value="${escapeHtml(u.usuario)}" />
        </label>

        <label class="admin-label">Nombre
          <input class="admin-input" data-user-field="nombre" value="${escapeHtml(u.nombre)}" />
        </label>

        <label class="admin-label">Clave
          <input class="admin-input" data-user-field="clave" value="${escapeHtml(u.clave)}" />
        </label>

        <label class="admin-label">Rol
          <select class="admin-input" data-user-field="rol">
            <option value="vendedor" ${u.rol === "vendedor" ? "selected" : ""}>vendedor</option>
            <option value="cliente" ${u.rol === "cliente" ? "selected" : ""}>cliente</option>
            <option value="admin" ${u.rol === "admin" ? "selected" : ""}>admin</option>
          </select>
        </label>

        <label class="admin-label">WhatsApp report
          <input class="admin-input" data-user-field="wasap_report" value="${escapeHtml(u.wasap_report)}" />
        </label>

        <label class="admin-label user-client-field-d9">Cliente vinculado
          <select class="admin-input" data-user-field="cliente_id">
            <option value="">Sin cliente vinculado</option>
            ${(state.clientes || []).map(c => `
              <option value="${escapeHtml(c.id)}" ${String(u.cliente_id) === String(c.id) ? "selected" : ""}>
                ${escapeHtml(c.nombre || c.id)}
              </option>
            `).join("")}
          </select>
        </label>

        <label class="admin-label user-color-field-d9">Color 1 vendedor
          <div class="color-picker-row-d9">
            <input class="admin-input color-input-d9" type="color" data-user-field="color_1" value="${escapeHtml(/^#[0-9a-fA-F]{6}$/.test(u.color_1) ? u.color_1 : "#DDEEFF")}" />
            <input class="admin-input color-text-d9" data-color-text-for="color_1" value="${escapeHtml(u.color_1 || "#DDEEFF")}" />
          </div>
        </label>

        <label class="admin-label user-color-field-d9">Color 2 vendedor
          <div class="color-picker-row-d9">
            <input class="admin-input color-input-d9" type="color" data-user-field="color_2" value="${escapeHtml(/^#[0-9a-fA-F]{6}$/.test(u.color_2) ? u.color_2 : "#FFFFFF")}" />
            <input class="admin-input color-text-d9" data-color-text-for="color_2" value="${escapeHtml(u.color_2 || "#FFFFFF")}" />
          </div>
        </label>

        <label class="admin-label">Activo
          <select class="admin-input" data-user-field="activo">
            <option value="si" ${String(u.activo).toLowerCase() !== "no" ? "selected" : ""}>si</option>
            <option value="no" ${String(u.activo).toLowerCase() === "no" ? "selected" : ""}>no</option>
          </select>
        </label>
      </div>

      <div class="admin-actions sticky-actions">
        <button class="admin-btn" type="button" id="btnCancelUserEdit">Cancelar</button>
        <button class="admin-btn primary" type="submit">${isNew ? "Crear usuario" : "Guardar usuario"}</button>
      </div>
    </form>
  `;

  $("#btnCancelUserEdit").onclick = () => {
    wrap.innerHTML = "";
  };

  const roleSelect = document.querySelector('[data-user-field="rol"]');
  if (roleSelect) {
    roleSelect.onchange = updateUserRoleFieldsD9;
  }

  const clientSelect = document.querySelector('[data-user-field="cliente_id"]');
  if (clientSelect) {
    clientSelect.onchange = fillUserNameFromSelectedClientD9;
  }

  $$(".color-input-d9").forEach(colorInput => {
    colorInput.addEventListener("input", () => {
      const textInput = document.querySelector(`[data-color-text-for="${colorInput.dataset.userField}"]`);
      if (textInput) textInput.value = colorInput.value.toUpperCase();
    });
  });

  $$(".color-text-d9").forEach(textInput => {
    textInput.addEventListener("input", () => {
      const key = textInput.dataset.colorTextFor;
      const colorInput = document.querySelector(`[data-user-field="${key}"]`);
      const value = textInput.value.trim();
      if (colorInput && /^#[0-9a-fA-F]{6}$/.test(value)) colorInput.value = value;
    });
  });

  $("#userEditForm").onsubmit = saveUserEdit;
  updateUserRoleFieldsD9();
  wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}


function fillUserNameFromSelectedClientD9() {
  const role = document.querySelector('[data-user-field="rol"]')?.value || "";
  if (role !== "cliente") return;

  const clientId = document.querySelector('[data-user-field="cliente_id"]')?.value || "";
  if (!clientId) return;

  const cliente = (state.clientes || []).find(c => String(c.id) === String(clientId));
  if (!cliente) return;

  const nameInput = document.querySelector('[data-user-field="nombre"]');
  if (nameInput) nameInput.value = String(cliente.nombre || "").trim();
}

function updateUserRoleFieldsD9() {
  const role = document.querySelector('[data-user-field="rol"]')?.value || "";
  $$(".user-client-field-d9").forEach(el => el.classList.toggle("hidden", role !== "cliente"));
  $$(".user-color-field-d9").forEach(el => el.classList.toggle("hidden", role !== "vendedor"));
  fillUserNameFromSelectedClientD9();
}

async function saveUserEdit(ev) {
  ev.preventDefault();

  const usuario = {};
  $$("[data-user-field]").forEach(input => {
    usuario[input.dataset.userField] = String(input.value || "").trim();
  });

  $$(".color-text-d9").forEach(input => {
    const key = input.dataset.colorTextFor;
    if (key) usuario[key] = String(input.value || "").trim();
  });

  if (!usuario.id) return toast("Usuario sin ID", "error");
  if (!usuario.usuario) return toast("Cargá el usuario", "error");
  if (!usuario.nombre) return toast("Cargá el nombre", "error");

  try {
    const result = await apiPost({ action: "update_usuarios", usuarios: [usuario] });
    toast(`Usuario guardado · actualizados: ${result.actualizados || 0} · nuevos: ${result.agregados || 0}`);
    await loadBootstrap();
    renderUsuariosView();
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar usuario: " + err.message, "error");
  }
}


function normalizeAdRow(a = {}) {
  return {
    id: String(a.id ?? a.orden ?? "").trim(),
    orden: String(a.orden ?? a.id ?? "").trim(),
    activo: String(a.activo ?? "si").trim() || "si",
    modo: String(a.modo ?? a.tipo ?? "").trim(),
    texto: String(a.texto ?? a.tag ?? "").trim(),
    titulo: String(a.titulo ?? "").trim(),
    texto_1: String(a.texto_1 ?? a.texto1 ?? "").trim(),
    texto_2: String(a.texto_2 ?? a.texto2 ?? "").trim(),
    imagen_url: String(a.imagen_url ?? a.imagen ?? "").trim(),
    imagen_url_full: String(a.imagen_url_full ?? a.imagen_full ?? "").trim(),
    link_url: String(a.link_url ?? a.link ?? "").trim()
  };
}

function detectAdModeD9(a) {
  if (a.modo) return a.modo;
  if (a.imagen_url_full) return "full";
  return "producto";
}

function renderPublicidadView() {
  const container = $("#view-publicidad");
  if (!container) return;

  const term = String($("#adFilter")?.value || "").trim().toLowerCase();

  const rows = (state.publicidad || [])
    .map(normalizeAdRow)
    .filter(a => {
      if (!term) return true;
      return [a.id, a.orden, a.texto, a.titulo, a.texto_1, a.texto_2, a.link_url, a.activo]
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .sort((a, b) => Number(a.orden || a.id || 0) - Number(b.orden || b.id || 0));

  container.innerHTML = `
    <div class="admin-page-head">
      <button class="admin-home-btn" data-view="home" type="button">🏠</button>
      <div>
        <h2>Publicidad</h2>
        <p>Banners y carrusel. Edición simple y controlada.</p>
      </div>
    </div>

    <div class="admin-card admin-ad-tools">
      <input id="adFilter" class="admin-input" placeholder="Buscar banner, título o link" value="${escapeHtml(term)}" />
      <button id="btnNewAd" class="admin-btn primary" type="button">+ Nuevo banner</button>
      <p class="admin-note">${rows.length} banner${rows.length === 1 ? "" : "s"} mostrado${rows.length === 1 ? "" : "s"} · ${state.publicidad.length} total</p>
    </div>

    <div id="adEditorWrap"></div>

    <div class="admin-card">
      <strong>Banners</strong>
      <div class="ad-list-admin-d9">
        ${rows.length ? rows.slice(0, 300).map(a => `
          <button class="ad-row-admin-d9" type="button" data-ad-edit="${escapeHtml(a.id || a.orden)}">
            <span>
              <strong>${escapeHtml(a.titulo || a.texto || "Banner sin título")}</strong>
              <small>${escapeHtml(`Orden ${a.orden || a.id || "-"} · ${detectAdModeD9(a)} · ${a.link_url || "sin link"}`)}</small>
            </span>
            <em class="${String(a.activo).toLowerCase() === "no" ? "off" : ""}">${escapeHtml(a.activo || "si")}</em>
          </button>
        `).join("") : `<p class="admin-note">No encontré banners.</p>`}
      </div>
    </div>
  `;

  const newBtn = $("#btnNewAd");
  if (newBtn) newBtn.onclick = openNewAdEditor;

  const filter = $("#adFilter");
  if (filter) {
    filter.oninput = () => renderPublicidadView();
    filter.focus();
    filter.setSelectionRange(filter.value.length, filter.value.length);
  }
}

function nextAdIdAdminD9() {
  const nums = (state.publicidad || [])
    .map(a => Number(String(a.id || a.orden || "").replace(/\D+/g, "")))
    .filter(n => Number.isFinite(n) && n > 0);
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

function openNewAdEditor() {
  openAdEditor("", true);
}

function openAdEditor(id, isNew = false) {
  const original = isNew ? null : (state.publicidad || []).find(a => String(a.id || a.orden) === String(id));
  if (!isNew && !original) return toast("No encontré ese banner", "error");

  const a = isNew
    ? { id: nextAdIdAdminD9(), orden: nextAdIdAdminD9(), activo: "si", modo: "full", texto: "", titulo: "", texto_1: "", texto_2: "", imagen_url: "", imagen_url_full: "", link_url: "" }
    : normalizeAdRow(original);

  const modo = detectAdModeD9(a);
  const wrap = $("#adEditorWrap");
  if (!wrap) return;

  wrap.innerHTML = `
    <form id="adEditForm" class="admin-card ad-editor-admin-d9">
      <strong>${isNew ? "Nuevo banner" : "Editar banner"}</strong>
      <p class="admin-note">Modo full usa imagen horizontal. Modo producto usa título/textos + imagen de producto.</p>

      <div class="admin-form-grid">
        <label class="admin-label">ID
          <input class="admin-input" data-ad-field="id" value="${escapeHtml(a.id || a.orden)}" ${isNew ? "" : "readonly"} />
        </label>

        <label class="admin-label">Orden
          <input class="admin-input" data-ad-field="orden" value="${escapeHtml(a.orden || a.id)}" />
        </label>

        <label class="admin-label">Activo
          <select class="admin-input" data-ad-field="activo">
            <option value="si" ${String(a.activo).toLowerCase() !== "no" ? "selected" : ""}>si</option>
            <option value="no" ${String(a.activo).toLowerCase() === "no" ? "selected" : ""}>no</option>
          </select>
        </label>

        <label class="admin-label">Tipo
          <select class="admin-input" data-ad-field="modo" id="adModeSelect">
            <option value="full" ${modo === "full" ? "selected" : ""}>full · imagen completa</option>
            <option value="producto" ${modo !== "full" ? "selected" : ""}>producto · texto + imagen</option>
          </select>
        </label>

        <label class="admin-label ad-product-field-d9">Etiqueta / tag
          <input class="admin-input" data-ad-field="texto" value="${escapeHtml(a.texto)}" />
        </label>

        <label class="admin-label ad-product-field-d9">Título
          <input class="admin-input" data-ad-field="titulo" value="${escapeHtml(a.titulo)}" />
        </label>

        <label class="admin-label ad-product-field-d9">Texto 1
          <input class="admin-input" data-ad-field="texto_1" value="${escapeHtml(a.texto_1)}" />
        </label>

        <label class="admin-label ad-product-field-d9">Texto 2
          <input class="admin-input" data-ad-field="texto_2" value="${escapeHtml(a.texto_2)}" />
        </label>

        <label class="admin-label ad-product-field-d9">Imagen producto URL
          <input class="admin-input" data-ad-field="imagen_url" value="${escapeHtml(a.imagen_url)}" placeholder="https://..." />
        </label>

        <label class="admin-label ad-full-field-d9">Imagen full URL
          <input class="admin-input" data-ad-field="imagen_url_full" value="${escapeHtml(a.imagen_url_full)}" placeholder="https://..." />
        </label>

        <label class="admin-label">Link URL
          <input class="admin-input" data-ad-field="link_url" value="${escapeHtml(a.link_url)}" placeholder="https://..." />
        </label>
      </div>

      <div id="adPreview" class="ad-preview-admin-d9"></div>

      <div class="admin-actions sticky-actions">
        <button class="admin-btn" type="button" id="btnCancelAdEdit">Cancelar</button>
        <button class="admin-btn primary" type="submit">${isNew ? "Crear banner" : "Guardar banner"}</button>
      </div>
    </form>
  `;

  $("#btnCancelAdEdit").onclick = () => { wrap.innerHTML = ""; };

  const mode = $("#adModeSelect");
  if (mode) mode.onchange = () => {
    updateAdModeFieldsD9();
    updateAdPreviewD9();
  };

  $$("[data-ad-field]").forEach(input => {
    input.addEventListener("input", updateAdPreviewD9);
    input.addEventListener("change", updateAdPreviewD9);
  });

  $("#adEditForm").onsubmit = saveAdEdit;
  updateAdModeFieldsD9();
  updateAdPreviewD9();
  wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateAdModeFieldsD9() {
  const mode = $("#adModeSelect")?.value || "full";
  $$(".ad-full-field-d9").forEach(el => el.classList.toggle("hidden", mode !== "full"));
  $$(".ad-product-field-d9").forEach(el => el.classList.toggle("hidden", mode === "full"));
}

function collectAdFormD9() {
  const ad = {};
  $$("[data-ad-field]").forEach(input => {
    ad[input.dataset.adField] = String(input.value || "").trim();
  });
  return ad;
}

function updateAdPreviewD9() {
  const box = $("#adPreview");
  if (!box) return;

  const a = collectAdFormD9();
  const mode = a.modo || "full";

  if (mode === "full") {
    box.innerHTML = `
      <div class="ad-preview-title-d9">Vista previa full</div>
      <div class="ad-preview-full-d9">
        ${a.imagen_url_full ? `<img src="${escapeHtml(a.imagen_url_full)}" alt="">` : `<span>Pegá una imagen horizontal en Imagen full URL</span>`}
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="ad-preview-title-d9">Vista previa producto</div>
    <div class="ad-preview-product-d9">
      <div>
        ${a.texto ? `<small>${escapeHtml(a.texto)}</small>` : ""}
        <strong>${escapeHtml(a.titulo || "Título del banner")}</strong>
        ${a.texto_1 ? `<p>${escapeHtml(a.texto_1)}</p>` : ""}
        ${a.texto_2 ? `<p>${escapeHtml(a.texto_2)}</p>` : ""}
      </div>
      <div class="ad-preview-img-d9">
        ${a.imagen_url ? `<img src="${escapeHtml(a.imagen_url)}" alt="">` : `<span>Imagen</span>`}
      </div>
    </div>
  `;
}

async function saveAdEdit(ev) {
  ev.preventDefault();
  const publicidad = collectAdFormD9();

  if (!publicidad.id) return toast("Banner sin ID", "error");
  if (!publicidad.orden) publicidad.orden = publicidad.id;

  if (publicidad.modo === "full" && !publicidad.imagen_url_full) {
    return toast("Cargá Imagen full URL", "error");
  }

  if (publicidad.modo !== "full" && !publicidad.titulo && !publicidad.imagen_url) {
    return toast("Cargá al menos título o imagen producto", "error");
  }

  try {
    const result = await apiPost({ action: "update_publicidad", publicidad: [publicidad] });
    toast(`Banner guardado · actualizados: ${result.actualizados || 0} · nuevos: ${result.agregados || 0}`);
    await loadBootstrap();
    renderPublicidadView();
  } catch (err) {
    console.error(err);
    toast("No se pudo guardar banner: " + err.message, "error");
  }
}

function renderSimpleTable(name) {
  const data = state[name] || [];
  const title = name[0].toUpperCase() + name.slice(1);
  const container = $(`#view-${name}`);
  const headers = Array.from(new Set(data.flatMap(o => Object.keys(o)))).slice(0, 12);
  container.innerHTML = `<div class="admin-page-head"><button class="admin-home-btn" data-view="home" type="button">🏠</button><div><h2>${title}</h2><p>Vista rápida. Edición completa en próxima etapa.</p></div></div>${tableHtml(data, headers, `${data.length} registros`)}`;
}

function tableHtml(rows, headers, caption = "") {
  if (!rows.length) return `<div class="admin-card"><strong>${caption}</strong><p class="admin-note">Sin datos para mostrar.</p></div>`;
  return `<div class="admin-card"><strong>${caption}</strong><div class="admin-table-scroll"><table class="admin-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${escapeHtml(formatCell(r[h], h))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}

function formatCell(v, key = "") {
  if (v === null || v === undefined) return "";
  if (["precio", "total_item", "total_pedido"].includes(key)) return money(v);
  if (["lista_1", "lista_2", "lista_3"].includes(key)) return v === "" ? "" : priceAR(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function apiPost(payload) {
  const body = JSON.stringify(payload);

  async function tryPost(options) {
    const action = payload?.action ? `?action=${encodeURIComponent(payload.action)}` : "";
    const r = await fetch(API_BASE + action, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      ...options
    });
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Respuesta no JSON del script: " + text.slice(0, 160));
    }
  }

  let data;
  try {
    data = await tryPost({
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
  } catch (firstErr) {
    console.warn("POST text/plain falló, pruebo payload form", firstErr);
    data = await tryPost({
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: "payload=" + encodeURIComponent(body)
    });
  }

  if (!data.ok) throw new Error(data.error || data.message || "Error API");
  return data;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
}

function openCompanyModal() {
  // D9 Admin: el logo queda solo como identidad visual.
  // El institucional se edita desde Confi y lo muestra D9 Pedidos.
  return;
}


function setupBackToHomeD9() {
  if (!window.history || !window.history.pushState || window.__d9AdminBackBound) return;
  window.__d9AdminBackBound = true;

  history.replaceState({ view: "home" }, "", location.href);

  window.addEventListener("popstate", () => {
    const active = document.querySelector(".view.active");
    const current = active?.id?.replace("view-", "") || "home";

    if (current && current !== "home") {
      setView("home", false);
      history.replaceState({ view: "home" }, "", location.href);
    }
  });
}


function getOrderGroupsD9(rows) {
  const map = new Map();
  rows.forEach(row => {
    const id = String(row.pedido_id || "").trim() || `sin_id_${map.size}`;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  });
  return Array.from(map.entries()).map(([id, lines]) => ({ id, lines, first: lines[0] || {} }));
}

function filterStatsRowsD9(rows, range) {
  if (!range || range === "all") return rows;
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  return rows.filter(r => {
    const d = parseOrderDate(r.fecha);
    if (!d) return false;

    if (range === "today") return d === todayKey;

    if (range === "month") {
      const ym = todayKey.slice(0, 7);
      return d.slice(0, 7) === ym;
    }

    const days = Number(range || 0);
    if (!days) return true;

    const dt = new Date(d + "T00:00:00");
    const min = new Date();
    min.setDate(min.getDate() - days + 1);
    min.setHours(0, 0, 0, 0);

    return dt >= min;
  });
}

function addRankD9(map, key, amount, qty = 0) {
  const name = String(key || "Sin dato").trim() || "Sin dato";
  if (!map.has(name)) map.set(name, { name, amount: 0, qty: 0, count: 0 });
  const obj = map.get(name);
  obj.amount += Number(amount || 0);
  obj.qty += Number(qty || 0);
  obj.count += 1;
}

function topRankD9(map, field = "amount", limit = 5) {
  return Array.from(map.values())
    .sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0))
    .slice(0, limit);
}


function cleanRankNameD9(name) {
  const s = String(name || "Sin dato").trim();
  if (!s) return "Sin dato";

  const parts = s.split("|").map(p => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const first = parts[0];
    const second = parts[1];

    if (/^(xd|gordo|cliente|nuevo|ocasional)$/i.test(first) || first.length < 4) {
      return `${first} | ${second}`;
    }

    return first;
  }

  return s;
}

function renderRankListD9(title, rows, mode = "amount") {
  if (!rows.length) {
    return `
      <div class="stats-rank-card-d9">
        <strong>${escapeHtml(title)}</strong>
        <p class="admin-note">Sin datos.</p>
      </div>
    `;
  }

  const max = Math.max(...rows.map(r => Number(r[mode] || 0)), 1);

  return `
    <div class="stats-rank-card-d9">
      <strong>${escapeHtml(title)}</strong>
      <div class="stats-rank-list-d9">
        ${rows.map((r, i) => {
          const value = mode === "qty" ? `${Number(r.qty || 0)} u.` : money(r.amount || 0);
          const sub = mode === "qty" ? money(r.amount || 0) : `${Number(r.qty || 0)} u. · ${r.count} línea${r.count === 1 ? "" : "s"}`;
          const pct = Math.max(4, Math.round((Number(r[mode] || 0) / max) * 100));
          return `
            <div class="stats-rank-row-d9">
              <div class="stats-rank-top-d9">
                <span title="${escapeHtml(r.name)}"><b>${i + 1}.</b> ${escapeHtml(cleanRankNameD9(r.name))}</span>
                <strong>${value}</strong>
              </div>
              <div class="stats-rank-bar-d9"><i style="width:${pct}%"></i></div>
              <small>${escapeHtml(sub)}</small>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function buildStatsD9(rows) {
  const groups = getOrderGroupsD9(rows);
  const total = rows.reduce((s, r) => s + Number(r.total_item || 0), 0);
  const totalItems = rows.reduce((s, r) => s + Number(r.cantidad || 0), 0);
  const ticket = groups.length ? total / groups.length : 0;

  const productos = new Map();
  const vendedores = new Map();
  const clientes = new Map();

  rows.forEach(r => {
    addRankD9(productos, r.item || r.producto || r.nombre, r.total_item, r.cantidad);
    addRankD9(vendedores, r.vendedor || r.vendedor_id, r.total_item, r.cantidad);
    addRankD9(clientes, r.cliente, r.total_item, r.cantidad);
  });

  return {
    rows,
    groups,
    total,
    totalItems,
    ticket,
    productosMonto: topRankD9(productos, "amount"),
    productosCantidad: topRankD9(productos, "qty"),
    vendedores: topRankD9(vendedores, "amount"),
    clientes: topRankD9(clientes, "amount")
  };
}

function renderStatsDashboardD9(stats) {
  return `
    <section class="stats-kpi-grid-d9">
      <div class="stats-kpi-card-d9"><span>Total vendido</span><strong>${money(stats.total)}</strong><small>${stats.groups.length} pedidos</small></div>
      <div class="stats-kpi-card-d9"><span>Ticket promedio</span><strong>${money(stats.ticket)}</strong><small>por pedido</small></div>
      <div class="stats-kpi-card-d9"><span>Productos vendidos</span><strong>${Number(stats.totalItems || 0)}</strong><small>unidades</small></div>
      <div class="stats-kpi-card-d9"><span>Líneas cargadas</span><strong>${stats.rows.length}</strong><small>items en pedidos</small></div>
    </section>

    <section class="stats-rank-grid-d9">
      ${renderRankListD9("Top productos por $", stats.productosMonto, "amount")}
      ${renderRankListD9("Top productos por cantidad", stats.productosCantidad, "qty")}
      ${renderRankListD9("Top vendedores", stats.vendedores, "amount")}
      ${renderRankListD9("Top clientes", stats.clientes, "amount")}
    </section>
  `;
}

async function ensureStatsOrdersD9(force = false) {
  if (!force && Array.isArray(state.pedidos) && state.pedidos.length) return state.pedidos;

  const summary = $("#statsSummary");
  const content = $("#statsContent");

  if (summary) summary.textContent = "Cargando pedidos para estadísticas…";
  if (content) content.innerHTML = "";

  const url = `${API_BASE}?action=list_pedidos&ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  const text = await res.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("El script no devolvió JSON: " + text.slice(0, 120));
  }

  if (!data.ok && !Array.isArray(data)) {
    throw new Error(data.error || "Respuesta sin OK");
  }

  const raw = Array.isArray(data) ? data : (Array.isArray(data.pedidos) ? data.pedidos : []);
  state.pedidos = raw.map(normalizeOrderRow);
  return state.pedidos;
}

async function renderStatsView(force = false) {
  const summary = $("#statsSummary");
  const content = $("#statsContent");
  const range = $("#statsRange")?.value || "all";

  try {
    const rowsAll = await ensureStatsOrdersD9(force);
    const rows = filterStatsRowsD9(rowsAll, range);
    const stats = buildStatsD9(rows);

    if (summary) {
      summary.textContent = `${stats.groups.length} pedido${stats.groups.length === 1 ? "" : "s"} · ${rows.length} línea${rows.length === 1 ? "" : "s"} · ${money(stats.total)}`;
    }

    if (content) content.innerHTML = renderStatsDashboardD9(stats);
  } catch (err) {
    console.error(err);
    if (summary) summary.textContent = "Error cargando estadísticas: " + err.message;
    if (content) content.innerHTML = `<div class="admin-card"><strong>Estadísticas</strong><p class="admin-note">No se pudieron cargar.</p></div>`;
    toast("No se pudieron cargar estadísticas", "error");
  }
}


function bindEvents() {
  document.addEventListener("click", (e) => {
    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) setView(viewBtn.dataset.view);
  });
  $("#btnReload").onclick = loadBootstrap;
  $("#btnCompanyInfo").onclick = openCompanyModal;
  $("#closeCompanyModal").onclick = () => $("#companyModal").classList.add("hidden");
  $("#btnParseXls").onclick = parseXlsFile;
  $("#btnSaveProducts").onclick = saveImportedProducts;
  $("#btnLoadOrders").onclick = loadOrders;
  $("#btnStatsLoad").onclick = () => renderStatsView(true);
  $("#statsRange").onchange = () => renderStatsView(false);
  $("#orderFilterText").oninput = renderOrders;
  $("#orderFilterFrom").onchange = renderOrders;
  $("#orderFilterTo").onchange = renderOrders;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-client-edit]");
    if (btn) openClientEditor(btn.dataset.clientEdit);

    const userBtn = e.target.closest("[data-user-edit]");
    if (userBtn) openUserEditor(userBtn.dataset.userEdit);

    const adBtn = e.target.closest("[data-ad-edit]");
    if (adBtn) openAdEditor(adBtn.dataset.adEdit);
  });
}


document.addEventListener("click", (e) => {
  const badge = e.target.closest?.("#adminBadge.version-alert-d9");
  if (!badge) return;
  window.location.href = `${location.pathname}?v=${Date.now()}`;
});

console.log("D9 Admin", APP_VERSION, API_BASE);
setupBackToHomeD9();

const AUTO_REFRESH_MS_D9 = 10 * 60 * 1000;

function autoRefreshD9(){
  const activeInput = document.querySelector("input:focus, textarea:focus");
  if(activeInput) return;

  if(document.hidden) return;

  loadBootstrap();
}

setInterval(autoRefreshD9, AUTO_REFRESH_MS_D9);

document.addEventListener("visibilitychange", () => {
  if(!document.hidden){
    autoRefreshD9();
  }
});

bindEvents();
loadBootstrap();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
