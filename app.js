const API_BASE = "https://script.google.com/macros/s/AKfycbyhcs6trzNcrN1M2Uf-8Wl0LYZ1D61o-iKEzeBInWirrAS8NJ0fUX3GCxJ0990E0hNkFQ/exec";
const BOOTSTRAP_URL = `${API_BASE}?action=bootstrap`;
const APP_VERSION = "v1.8.0-usuarios-plus";

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

  if (name === "clientes") renderClientesView();
  if (name === "usuarios") renderUsuariosView();
  if (["publicidad"].includes(name)) renderSimpleTable(name);
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

function updateUserRoleFieldsD9() {
  const role = document.querySelector('[data-user-field="rol"]')?.value || "";
  $$(".user-client-field-d9").forEach(el => el.classList.toggle("hidden", role !== "cliente"));
  $$(".user-color-field-d9").forEach(el => el.classList.toggle("hidden", role !== "vendedor"));
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
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-client-edit]");
    if (btn) openClientEditor(btn.dataset.clientEdit);

    const userBtn = e.target.closest("[data-user-edit]");
    if (userBtn) openUserEditor(userBtn.dataset.userEdit);
  });
}

console.log("D9 Admin", APP_VERSION, API_BASE);
bindEvents();
loadBootstrap();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
