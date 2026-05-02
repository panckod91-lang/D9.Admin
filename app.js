const API_BASE = "https://script.google.com/macros/s/AKfycbyhcs6trzNcrN1M2Uf-8Wl0LYZ1D61o-iKEzeBInWirrAS8NJ0fUX3GCxJ0990E0hNkFQ/exec";
const BOOTSTRAP_URL = `${API_BASE}?action=bootstrap`;
const APP_VERSION = "v1.3.0-no-modal";

const state = {
  config: {}, soporte: {}, clientes: [], productos: [], usuarios: [], publicidad: [], pedidos: [], importedProducts: []
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const money = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const priceAR = (v) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

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

function setView(name) {
  $$(".view").forEach(v => v.classList.remove("active"));
  const target = $(`#view-${name}`);
  if (target) target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (["clientes", "usuarios", "publicidad"].includes(name)) renderSimpleTable(name);
  if (name === "config") renderConfigForm();
}

async function loadBootstrap() {
  $("#networkStatus").textContent = "Sincronizando…";
  try {
    const r = await fetch(BOOTSTRAP_URL, { cache: "no-store" });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "Bootstrap sin OK");
    Object.assign(state, {
      config: data.config || {}, soporte: data.soporte || {}, clientes: data.clientes || [], productos: data.productos || [], usuarios: data.usuarios || [], publicidad: data.publicidad || []
    });
    applyHeader();
    $("#networkStatus").textContent = "Online";
    $("#networkStatus").classList.remove("muted");
    toast(`Datos cargados desde Sheet DEV · ${APP_VERSION}`);
  } catch (err) {
    $("#networkStatus").textContent = "Error API";
    toast("No se pudo leer el script DEV", "error");
    console.error(err);
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
    const precio = parsePrice(r[iLista1]);
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
    $("#xlsSummary").textContent = `Archivo: ${file.name} · productos válidos: ${state.importedProducts.length}`;
    $("#btnSaveProducts").disabled = !state.importedProducts.length;
    renderProductsPreview();
  } catch (err) {
    console.error(err);
    toast(err.message || "No se pudo leer el XLS", "error");
  }
}

function renderProductsPreview() {
  const sample = state.importedProducts.slice(0, 80);
  $("#productsPreview").innerHTML = tableHtml(sample, ["id", "nombre", "categoria", "lista_1", "lista_2", "lista_3", "activo"], "Vista previa: primeras 80 filas");
}

async function saveImportedProducts() {
  if (!state.importedProducts.length) return toast("No hay productos importados", "error");
  if (!$("#confirmReplaceProducts").checked) return toast("Marcá la confirmación para actualizar productos", "error");

  $("#btnSaveProducts").disabled = true;
  toast("Guardando productos en Sheet DEV…");

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
    cantidad: Number(o.cantidad ?? o.total ?? 0) || 0,
    precio: Number(o.precio || 0) || 0,
    total_item: Number(o.total_item ?? o.totalitem ?? 0) || 0,
    total_pedido: Number(o.total_pedido ?? o.totalpedido ?? 0) || 0,
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
  $("#ordersSummary").textContent = `${rows.length} líneas · total filtrado: ${money(total)} · cargados: ${(state.pedidos || []).length}`;
  $("#ordersTable").innerHTML = tableHtml(rows.slice(0, 500), ["fecha", "pedido_id", "vendedor", "cliente", "item", "cantidad", "precio", "total_item", "total_pedido"], "Pedidos");
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
  return;
}
  // D9 Admin: el logo es solo identidad visual. El institucional se edita desde Confi.
  return;
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
  $("#orderFilterText").oninput = renderOrders;
  $("#orderFilterFrom").onchange = renderOrders;
  $("#orderFilterTo").onchange = renderOrders;
}

console.log("D9 Admin", APP_VERSION, API_BASE);
bindEvents();
loadBootstrap();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});


// D9 Admin: desactiva cualquier click institucional heredado del logo/header.
window.__d9AdminDisableLogoModal = true;
document.addEventListener("click", (e) => {
  const logoTap = e.target.closest?.("#btnCompany, #companyBtn, #brandLogo, .brand-logo, .admin-logo, .app-logo, .top-brand");
  if (!logoTap) return;
  // Permitimos clicks normales en botones internos si existieran, pero bloqueamos modal institucional heredado.
  if (logoTap.closest?.("button, a") || logoTap.matches?.("button, a, .top-brand")) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }
}, true);
