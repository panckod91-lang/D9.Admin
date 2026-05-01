/*
D9 ADMIN - PARCHE PARA APPS SCRIPT DEV

1) En tu Apps Script DEV, cambiá el nombre de tu función doPost(e) actual a:
   guardarPedido_(e)

2) Reemplazá tu doGet(e) actual por este doGet(e).

3) Pegá este bloque completo debajo de tus helpers actuales.
*/

function doGet(e) {
  try {
    const action = String(e?.parameter?.action || "").trim().toLowerCase();

    if (action === "bootstrap") {
      return jsonOut(getBootstrap_());
    }

    if (action === "pedidos") {
      return jsonOut(getPedidos_(e));
    }

    return jsonOut({
      ok: true,
      status: "D9 Script activo",
      endpoints: {
        lectura: "?action=bootstrap",
        pedidos: "?action=pedidos",
        admin: "POST action=update_config / replace_productos"
      }
    });

  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const raw = getRawBody(e);
  const data = parsePayload(raw);
  const action = String(data?.action || "").trim().toLowerCase();

  if (action === "update_config") {
    return jsonOut(updateConfig_(data.config || {}));
  }

  if (action === "replace_productos") {
    return jsonOut(replaceProductos_(Array.isArray(data.productos) ? data.productos : []));
  }

  // Mantiene la compatibilidad con D9 Pedidos.
  // Tu doPost viejo debe quedar renombrado como guardarPedido_(e).
  return guardarPedido_(e);
}

function updateConfig_(config) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName("confi");
    if (!sh) sh = ss.insertSheet("confi");

    const rows = [["clave", "tex1", "tex2", "tex3"]];
    Object.keys(config).forEach(key => {
      const val = config[key];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        rows.push([key, val.tex1 || "", val.tex2 || "", val.tex3 || ""]);
      } else {
        rows.push([key, val ?? "", "", ""]);
      }
    });

    sh.clearContents();
    sh.getRange(1, 1, rows.length, 4).setValues(rows);
    return { ok: true, updated: rows.length - 1 };
  } finally {
    lock.releaseLock();
  }
}

function replaceProductos_(productos) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName("productos");
    if (!sh) sh = ss.insertSheet("productos");

    const headers = ["id", "nombre", "categoria", "lista_1", "lista_2", "lista_3", "activo"];
    const rows = [headers];

    productos.forEach(p => {
      rows.push([
        p.id || "",
        p.nombre || "",
        p.categoria || "",
        Number(p.lista_1 || 0),
        p.lista_2 || "",
        p.lista_3 || "",
        p.activo || "si"
      ]);
    });

    sh.clearContents();
    sh.getRange(1, 1, rows.length, headers.length).setValues(rows);
    return { ok: true, productos: productos.length };
  } finally {
    lock.releaseLock();
  }
}

function getPedidos_(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName("pedidos");
  if (!sh) return { ok: false, error: "No existe la hoja pedidos" };

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: true, pedidos: [] };

  const headers = values[0].map(h => normalizarHeader_(h));
  const limit = Math.max(1, Math.min(Number(e?.parameter?.limit || 1000), 5000));

  const rows = values.slice(1).slice(-limit).map(row => {
    const obj = rowToObject_(headers, row);
    obj.fecha_iso = fechaPedidoIso_(obj.fecha);
    return obj;
  }).reverse();

  return { ok: true, pedidos: rows, total: rows.length };
}

function fechaPedidoIso_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd HH:mm:ss");
  }

  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  return s;
}
