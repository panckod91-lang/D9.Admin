const BASE = "https://script.google.com/macros/s/AKfycbxE5JByaA5iSrvIhD7S4WTgYBWL4ZPZYkf3Gi6lKQ8Xo8oov20HLhaeyeUMKjeglsHTPA/exec";

async function cargarPedidos(){
  const res = await fetch(BASE + "?action=list_pedidos");
  const data = await res.json();

  const pedidos = data.pedidos || [];

  document.getElementById("out").textContent = JSON.stringify(pedidos.slice(0,20), null, 2);
}
