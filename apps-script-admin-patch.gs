const SHEET_ID = "16TQVThJf7oPEYQe9wMMrQfrUdgkBLnNO5TOKEc2eRoY";
const TZ = "America/Argentina/Buenos_Aires";

// ─── GET API ──────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const action = String(e?.parameter?.action || "").trim().toLowerCase();

    if (action === "bootstrap") {
      return jsonOut(getBootstrap_());
    }

    if (action === "list_pedidos") {
      return jsonOut({
        ok: true,
        pedidos: leerPedidos_(SpreadsheetApp.openById(SHEET_ID))
      });
    }

    return jsonOut({
      ok: true,
      status: "D9 Script activo",
      endpoints: {
        lectura: "?action=bootstrap",
        pedidos: "POST"
      }
    });

  } catch (err) {
    return jsonOut({
      ok: false,
      error: String(err)
    });
  }
}

function getBootstrap_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  return {
    ok: true,
    timestamp: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss"),
    config: leerConfi_(ss),
    soporte: leerClaveValor_(ss, "soporte"),
    clientes: leerTablaActiva_(ss, "clientes"),
    productos: leerProductos_(ss),
    usuarios: leerTablaActiva_(ss, "usuarios"),
    publicidad: leerTablaActiva_(ss, "publicidad")
  };
}

// ─── LECTURA HOJAS ────────────────────────────────────────────────────

function leerConfi_(ss) {
  const sh = ss.getSheetByName("confi");
  if (!sh) return {};

  const data = sh.getDataRange().getValues();
  const out = {};

  for (let i = 1; i < data.length; i++) {
    const clave = String(data[i][0] || "").trim();
    if (!clave) continue;

    out[clave] = {
      tex1: normalizarValor_(data[i][1]),
      tex2: normalizarValor_(data[i][2]),
      tex3: normalizarValor_(data[i][3])
    };

    if (!out[clave].tex2 && !out[clave].tex3) {
      out[clave] = out[clave].tex1;
    }
  }

  return out;
}

function leerClaveValor_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return {};

  const data = sh.getDataRange().getValues();
  const out = {};

  for (let i = 1; i < data.length; i++) {
    const clave = String(data[i][0] || "").trim();
    if (!clave) continue;
    out[clave] = normalizarValor_(data[i][1]);
  }

  return out;
}

function leerTablaActiva_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => normalizarHeader_(h));
  const idxActivo = headers.indexOf("activo");

  return values.slice(1)
    .map(row => rowToObject_(headers, row))
    .filter(obj => {
      if (idxActivo === -1) return true;
      return esActivo_(obj.activo);
    });
}

function leerProductos_(ss) {
  const productos = leerTablaActiva_(ss, "productos");

  return productos.filter(p => {
    const l1 = Number(p.lista_1 || 0);
    const l2 = Number(p.lista_2 || 0);
    const l3 = Number(p.lista_3 || 0);

    return l1 > 0 || l2 > 0 || l3 > 0;
  });
}

function rowToObject_(headers, row) {
  const obj = {};

  headers.forEach((key, i) => {
    if (!key) return;
    obj[key] = normalizarValor_(row[i]);
  });

  return obj;
}

function leerPedidos_(ss) {
  const sh = ss.getSheetByName("pedidos");
  if (!sh) return [];

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => normalizarHeader_(h));
  return values.slice(1).map(row => rowToObject_(headers, row));
}

// ─── POST PEDIDOS ─────────────────────────────────────────────────────

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);
  } catch (_) {
    return jsonOut({ ok: false, error: "El script está ocupado, reintentá en unos segundos." });
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const raw = getRawBody(e);
    const data = parsePayload(raw);
    // ✅ FIX: leer action también desde e.parameter como fallback.
    // El browser pierde el body del POST al seguir el 302 redirect de GAS.
    // La app ahora pasa action en la URL (?action=...) para este caso.
    const action = String(data.action || data.accion || e?.parameter?.action || "").trim().toLowerCase();

    if (action === "update_config") {
      return jsonOut(actualizarConfig_(ss, data));
    }

    if (action === "update_clientes" || action === "upsert_clientes") {
      return jsonOut(actualizarClientes_(ss, data));
    }

    if (action === "update_usuarios" || action === "upsert_usuarios") {
      return jsonOut(actualizarUsuarios_(ss, data));
    }

    if (action === "update_productos" || action === "upsert_productos") {
      return jsonOut(actualizarProductos_(ss, data));
    }

    const sh = ss.getSheetByName("pedidos");

    if (!sh) return jsonOut({ ok: false, error: "No existe la hoja pedidos" });

    const fechaStr = Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm:ss");

    const vendedorId = data.vendedor_id || "";
    const vendedor = data.vendedor || "";
    const cliente = data.cliente || "";
    const items = Array.isArray(data.items) ? data.items : [];

    if (!items.length) return jsonOut({ ok: false, error: "Pedido sin items" });

    // ✅ ID viene desde la app. Si no viene, el script genera uno como fallback.
    const pedidoId = String(data.pedido_id || data.pedidoId || generarPedidoId(vendedorId)).trim();

    // 🔒 Anti-duplicado: si ya existe en columna B, no vuelve a guardar.
    if (pedidoYaExiste_(sh, pedidoId)) {
      return jsonOut({
        ok: true,
        duplicated: true,
        pedido_id: pedidoId,
        message: "Pedido ya recibido. No se volvió a guardar."
      });
    }

    const totalPedido = items.reduce((sum, item) => {
      return sum + Number(item.cantidad || 0) * Number(item.precio || 0);
    }, 0);

    const firstRow = sh.getLastRow() + 1;

    items.forEach(item => {
      const cantidad = Number(item.cantidad || 0);
      const precio = Number(item.precio || 0);
      const totalItem = cantidad * precio;

      sh.appendRow([
        fechaStr,
        pedidoId,
        vendedorId,
        vendedor,
        cliente,
        item.nombre || "",
        cantidad,
        precio,
        totalItem,
        totalPedido
      ]);
    });

    try {
      colorearBloquePedido(ss, sh, firstRow, items.length, vendedorId, vendedor);
    } catch (colorErr) {
      console.warn("No se pudo colorear el pedido:", colorErr);
    }

    return jsonOut({
      ok: true,
      duplicated: false,
      pedido_id: pedidoId,
      items: items.length,
      total_pedido: totalPedido
    });

  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}



// ─── ADMIN CONFI ──────────────────────────────────────────────────────

function actualizarConfig_(ss, data) {
  const sh = ss.getSheetByName("confi");
  if (!sh) return { ok: false, error: "No existe la hoja confi" };

  const config = data.config || {};
  const keys = Object.keys(config);
  if (!keys.length) return { ok: false, error: "No llegaron datos de confi" };

  // Encabezados fijos
  sh.getRange(1, 1, 1, 4).setValues([["clave", "tex1", "tex2", "tex3"]]);

  const lastRow = sh.getLastRow();
  const rows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, 4).getValues() : [];

  const index = {};
  rows.forEach((row, i) => {
    const clave = String(row[0] || "").trim();
    if (clave) index[clave] = i + 2;
  });

  let actualizados = 0;
  let agregados = 0;

  keys.forEach(clave => {
    const value = config[clave];

    let tex1 = "";
    let tex2 = "";
    let tex3 = "";

    if (value && typeof value === "object" && !Array.isArray(value)) {
      tex1 = normalizarValor_(value.tex1 ?? value.valor ?? value.texto ?? "");
      tex2 = normalizarValor_(value.tex2 ?? "");
      tex3 = normalizarValor_(value.tex3 ?? "");
    } else {
      tex1 = normalizarValor_(value ?? "");
    }

    const rowValues = [clave, tex1, tex2, tex3];

    if (index[clave]) {
      sh.getRange(index[clave], 1, 1, 4).setValues([rowValues]);
      actualizados++;
    } else {
      sh.appendRow(rowValues);
      agregados++;
    }
  });

  return {
    ok: true,
    actualizados,
    agregados,
    total_claves: keys.length,
    mensaje: "Confi actualizada."
  };
}



// ─── ADMIN CLIENTES ───────────────────────────────────────────────────

function actualizarClientes_(ss, data) {
  const sh = ss.getSheetByName("clientes");
  if (!sh) return { ok: false, error: "No existe la hoja clientes" };

  const incoming = Array.isArray(data.clientes) ? data.clientes : [];
  if (!incoming.length) return { ok: false, error: "No llegaron clientes para guardar" };

  const requiredHeaders = ["id", "nombre", "telefono", "direccion", "ciudad", "activo"];
  let lastCol = Math.max(sh.getLastColumn(), requiredHeaders.length);
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizarHeader_);

  requiredHeaders.forEach(h => {
    if (!headers.includes(h)) {
      lastCol++;
      sh.getRange(1, lastCol).setValue(h);
      headers.push(h);
    }
  });

  const idCol = headers.indexOf("id") + 1;
  if (idCol <= 0) return { ok: false, error: "La hoja clientes no tiene columna id" };

  const lastRow = sh.getLastRow();
  const rows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];

  const indexPorId = {};
  rows.forEach((row, i) => {
    const id = String(row[idCol - 1] || "").trim();
    if (id) indexPorId[id] = i + 2;
  });

  let actualizados = 0;
  let agregados = 0;

  incoming.forEach(raw => {
    const c = normalizarClienteAdmin_(raw);
    if (!c.id || !c.nombre) return;

    const rowValues = new Array(headers.length).fill("");

    if (indexPorId[c.id]) {
      const current = sh.getRange(indexPorId[c.id], 1, 1, headers.length).getValues()[0];
      headers.forEach((h, i) => rowValues[i] = current[i]);
    }

    Object.keys(c).forEach(key => {
      const idx = headers.indexOf(key);
      if (idx >= 0) rowValues[idx] = c[key];
    });

    if (indexPorId[c.id]) {
      sh.getRange(indexPorId[c.id], 1, 1, headers.length).setValues([rowValues]);
      actualizados++;
    } else {
      sh.appendRow(rowValues);
      agregados++;
    }
  });

  return {
    ok: true,
    actualizados,
    agregados,
    recibidos: incoming.length,
    mensaje: "Clientes actualizados por id."
  };
}

function normalizarClienteAdmin_(c) {
  return {
    id: String(c.id || "").trim(),
    nombre: String(c.nombre || "").trim(),
    telefono: String(c.telefono || "").trim(),
    direccion: String(c.direccion || "").trim(),
    ciudad: String(c.ciudad || c.localidad || "").trim(),
    activo: normalizarActivoAdmin_(c.activo)
  };
}



// ─── ADMIN USUARIOS ──────────────────────────────────────────────────

function actualizarUsuarios_(ss, data) {
  const sh = ss.getSheetByName("usuarios");
  if (!sh) return { ok: false, error: "No existe la hoja usuarios" };

  const incoming = Array.isArray(data.usuarios) ? data.usuarios : [];
  if (!incoming.length) return { ok: false, error: "No llegaron usuarios para guardar" };

  const requiredHeaders = ["id", "usuario", "nombre", "clave", "rol", "wasap_report", "cliente_id", "color_1", "color_2", "activo"];
  let lastCol = Math.max(sh.getLastColumn(), requiredHeaders.length);
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizarHeader_);

  requiredHeaders.forEach(h => {
    if (!headers.includes(h)) {
      lastCol++;
      sh.getRange(1, lastCol).setValue(h);
      headers.push(h);
    }
  });

  const idCol = headers.indexOf("id") + 1;
  if (idCol <= 0) return { ok: false, error: "La hoja usuarios no tiene columna id" };

  const lastRow = sh.getLastRow();
  const rows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];

  const indexPorId = {};
  rows.forEach((row, i) => {
    const id = String(row[idCol - 1] || "").trim();
    if (id) indexPorId[id] = i + 2;
  });

  let actualizados = 0;
  let agregados = 0;

  incoming.forEach(raw => {
    const u = normalizarUsuarioAdmin_(raw);
    if (!u.id || !u.usuario || !u.nombre) return;

    const rowValues = new Array(headers.length).fill("");

    if (indexPorId[u.id]) {
      const current = sh.getRange(indexPorId[u.id], 1, 1, headers.length).getValues()[0];
      headers.forEach((h, i) => rowValues[i] = current[i]);
    }

    Object.keys(u).forEach(key => {
      const idx = headers.indexOf(key);
      if (idx >= 0) rowValues[idx] = u[key];
    });

    if (indexPorId[u.id]) {
      sh.getRange(indexPorId[u.id], 1, 1, headers.length).setValues([rowValues]);
      actualizados++;
    } else {
      sh.appendRow(rowValues);
      agregados++;
    }
  });

  return {
    ok: true,
    actualizados,
    agregados,
    recibidos: incoming.length,
    mensaje: "Usuarios actualizados por id."
  };
}

function normalizarColorAdmin_(value) {
  const v = String(value || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : "";
}

function normalizarUsuarioAdmin_(u) {
  return {
    id: String(u.id || "").trim(),
    usuario: String(u.usuario || "").trim().toLowerCase(),
    nombre: String(u.nombre || "").trim(),
    clave: String(u.clave || "").trim(),
    rol: String(u.rol || "vendedor").trim().toLowerCase(),
    wasap_report: String(u.wasap_report || "").trim(),
    cliente_id: String(u.cliente_id || "").trim(),
    color_1: normalizarColorAdmin_(u.color_1 || ""),
    color_2: normalizarColorAdmin_(u.color_2 || ""),
    activo: normalizarActivoAdmin_(u.activo)
  };
}


// ─── ADMIN PRODUCTOS ─────────────────────────────────────────────────

function actualizarProductos_(ss, data) {
  const sh = ss.getSheetByName("productos");
  if (!sh) return { ok: false, error: "No existe la hoja productos" };

  const incoming = Array.isArray(data.productos) ? data.productos : [];
  if (!incoming.length) return { ok: false, error: "No llegaron productos para guardar" };

  const headersFinales = ["id", "nombre", "categoria", "lista_1", "lista_2", "lista_3", "activo"];

  asegurarHeadersProductos_(sh, headersFinales);

  const normalizados = incoming
    .map(normalizarProductoAdmin_)
    .filter(p => p.id && p.nombre);

  if (!normalizados.length) {
    return { ok: false, error: "No quedaron productos válidos luego de normalizar" };
  }

  const lastRow = sh.getLastRow();
  const values = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, headersFinales.length).getValues() : [];

  const existentes = values.map(row => {
    const obj = {};
    headersFinales.forEach((h, i) => obj[h] = normalizarValor_(row[i]));
    return obj;
  });

  const indexPorId = {};
  existentes.forEach((p, i) => {
    const id = String(p.id || "").trim();
    if (id) indexPorId[id] = i;
  });

  let actualizados = 0;
  let agregados = 0;

  normalizados.forEach(p => {
    if (Object.prototype.hasOwnProperty.call(indexPorId, p.id)) {
      existentes[indexPorId[p.id]] = p;
      actualizados++;
    } else {
      existentes.push(p);
      agregados++;
    }
  });

  const salida = existentes.map(p => headersFinales.map(h => p[h] ?? ""));

  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
  }

  if (salida.length) {
    sh.getRange(2, 1, salida.length, headersFinales.length).setValues(salida);
  }

  return {
    ok: true,
    modo: "upsert_por_id",
    recibidos: incoming.length,
    validos: normalizados.length,
    actualizados,
    agregados,
    total_hoja: salida.length,
    mensaje: "Productos actualizados por coincidencia de id. Los productos no incluidos en el XLS se conservaron."
  };
}

function asegurarHeadersProductos_(sh, headersFinales) {
  const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headersFinales.length)).getValues()[0];
  const actualesNormalizados = current.map(normalizarHeader_);

  const necesitaHeaders = headersFinales.some((h, i) => actualesNormalizados[i] !== h);

  if (necesitaHeaders) {
    sh.getRange(1, 1, 1, headersFinales.length).setValues([headersFinales]);
  }
}

function normalizarProductoAdmin_(p) {
  const id = String(p.id || p.codigo || p.Codigo || "").trim();
  const nombre = String(p.nombre || p.descripcion || p.Descripcion || "").trim();
  const categoria = String(p.categoria || p.rubro || p.Rubro || "").trim();

  return {
    id,
    nombre,
    categoria,
    lista_1: normalizarPrecioAdmin_(p.lista_1 || p.Lista1 || p.precio || 0),
    lista_2: normalizarPrecioAdmin_(p.lista_2 || p.lista_02 || ""),
    lista_3: normalizarPrecioAdmin_(p.lista_3 || p.lista_03 || ""),
    activo: normalizarActivoAdmin_(p.activo)
  };
}

function normalizarPrecioAdmin_(value) {
  if (value === "" || value === null || typeof value === "undefined") return "";

  if (typeof value === "number") return value;

  let s = String(value).trim();
  if (!s) return "";

  s = s.replace(/\s/g, "").replace(/\$/g, "");

  const tieneComa = s.indexOf(",") >= 0;
  const tienePunto = s.indexOf(".") >= 0;

  if (tieneComa && tienePunto) {
    // Formato argentino: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (tieneComa && !tienePunto) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizarActivoAdmin_(value) {
  if (value === false) return false;
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "si";
  if (["false", "no", "0", "inactivo"].includes(v)) return "no";
  return "si";
}


// ─── ID PEDIDO ────────────────────────────────────────────────────────

function generarPedidoId(vendedorId) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${vendedorId || "0"}-${code}`;
}

function pedidoYaExiste_(sh, pedidoId) {
  if (!pedidoId) return false;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return false;

  const ids = sh
    .getRange(2, 2, lastRow - 1, 1)
    .getValues()
    .flat()
    .map(v => String(v || "").trim());

  return ids.includes(String(pedidoId).trim());
}

// ─── COLORES ──────────────────────────────────────────────────────────

function colorearBloquePedido(ss, sh, firstRow, rowCount, vendedorId, vendedor) {
  const colores = obtenerColoresVendedor(ss, vendedorId, vendedor);
  const range = sh.getRange(firstRow, 1, rowCount, sh.getLastColumn());

  if (colores && esColorValido(colores.color_1) && esColorValido(colores.color_2)) {
    const color = obtenerColorAlternadoVendedor(vendedorId || vendedor, colores.color_1, colores.color_2);
    range.setBackground(color);
    return;
  }

  colorearBloquePedidoDefault(sh, firstRow, rowCount);
}

function obtenerColoresVendedor(ss, vendedorId, vendedor) {
  const usuarios = ss.getSheetByName("usuarios");
  if (!usuarios) return null;

  const data = usuarios.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers = data[0].map(h => String(h).trim().toLowerCase());

  const idxId = headers.indexOf("id");
  const idxNombre = headers.indexOf("nombre");
  const idxColor1 = headers.indexOf("color_1");
  const idxColor2 = headers.indexOf("color_2");

  if (idxColor1 === -1 || idxColor2 === -1) return null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const rowId = idxId >= 0 ? String(row[idxId] || "").trim() : "";
    const rowNombre = idxNombre >= 0 ? String(row[idxNombre] || "").trim() : "";

    const coincideId = vendedorId && rowId && String(vendedorId).trim() === rowId;
    const coincideNombre = vendedor && rowNombre && String(vendedor).trim().toLowerCase() === rowNombre.toLowerCase();

    if (coincideId || coincideNombre) {
      return {
        color_1: String(row[idxColor1] || "").trim(),
        color_2: String(row[idxColor2] || "").trim()
      };
    }
  }

  return null;
}

function obtenerColorAlternadoVendedor(vendedorKey, color1, color2) {
  const props = PropertiesService.getScriptProperties();
  const key = "d9_color_toggle_vendedor_" + normalizarKey(valueOrDefault_(vendedorKey, "sin_vendedor"));

  const useSecond = props.getProperty(key) === "true";
  const color = useSecond ? color2 : color1;

  props.setProperty(key, useSecond ? "false" : "true");

  return color;
}

function colorearBloquePedidoDefault(sh, firstRow, rowCount) {
  const props = PropertiesService.getScriptProperties();
  const key = "d9_color_toggle";
  const useColor = props.getProperty(key) !== "true";

  const range = sh.getRange(firstRow, 1, rowCount, sh.getLastColumn());

  if (useColor) {
    range.setBackground("#DDEEFF");
  } else {
    range.setBackground(null);
  }

  props.setProperty(key, useColor ? "true" : "false");
}

function esColorValido(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(color || "").trim());
}

function resetColorToggle() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty("d9_color_toggle");
  Logger.log("Toggle general de color reseteado.");
}

function resetColorToggleVendedores() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  Object.keys(all).forEach(key => {
    if (key.indexOf("d9_color_toggle_vendedor_") === 0) {
      props.deleteProperty(key);
    }
  });

  Logger.log("Toggles de color por vendedor reseteados.");
}

// ─── HELPERS ──────────────────────────────────────────────────────────

function getRawBody(e) {
  if (!e) return "";
  if (e.postData && e.postData.contents) return e.postData.contents;
  if (e.parameter && e.parameter.payload) return e.parameter.payload;
  return "";
}

function parsePayload(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/(?:^|&)payload=([^&]*)/);
    if (match) {
      const decoded = decodeURIComponent(match[1].replace(/\+/g, " "));
      return JSON.parse(decoded);
    }
    throw new Error("No se pudo interpretar el payload");
  }
}

function normalizarHeader_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizarValor_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd HH:mm:ss");
  }

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;

  return String(value ?? "").trim();
}

function esActivo_(value) {
  if (value === true) return true;

  const v = String(value || "").trim().toLowerCase();

  return ["true", "si", "sí", "1", "activo", "yes"].includes(v);
}

function normalizarKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

function valueOrDefault_(value, fallback) {
  return value || fallback;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}