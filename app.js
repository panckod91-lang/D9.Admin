const BOOTSTRAP_URL = "https://script.google.com/macros/s/AKfycbxE5JByaA5iSrvIhD7S4WTgYBWL4ZPZYkf3Gi6lKQ8Xo8oov20HLhaeyeUMKjeglsHTPA/exec?action=bootstrap";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

async function checkOnline() {
  try {
    const res = await fetch(BOOTSTRAP_URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function updateOnlineStatus() {
  const online = await checkOnline();
  const el = document.querySelector(".status-online");
  el.textContent = online ? "Online" : "Offline";
}

async function sync(){
  const res = await fetch(BOOTSTRAP_URL);
  const data = await res.json();
  console.log(data);
  alert("Sync OK");
}

updateOnlineStatus();
