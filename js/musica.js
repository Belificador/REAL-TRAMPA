const CLAVE_VOLUMEN = "cipherbeat_volumen";
const VOLUMEN_DEFECTO = 0.5;

const PISTA_MENU = "Musica/musica lobby/select.mp3";
const PISTAS_PELEA = [
  "Musica/musica pelea/musica pelea 1.mp3",
  "Musica/musica pelea/musica pelea 2.mp3",
  "Musica/musica pelea/musica pelea 3.mp3",
];

const VOL_MENU = 0.30;
const VOL_PELEA = 0.4;
const VOL_MENU_DUCK = 0.2;
const FADE_MS = 600;

let menuAudio = null;
let peleaAudio = null;
let peleaTrackIdx = -1;
let escena = "menu";
let volumen = leerVolumen();
let desbloqueado = false;
let desbloqueoInstalado = false;
let menuAtenuado = false;
const fadeTokens = { menu: 0, pelea: 0 };

function clamp(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

function leerVolumen() {
  try {
    const raw = localStorage.getItem(CLAVE_VOLUMEN);
    if (raw === null) return VOLUMEN_DEFECTO;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, 0, 1) : VOLUMEN_DEFECTO;
  } catch (_) {
    return VOLUMEN_DEFECTO;
  }
}

function guardarVolumen(valor) {
  try {
    localStorage.setItem(CLAVE_VOLUMEN, String(valor));
  } catch (_) {}
}

function crearAudio(src) {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  return audio;
}

function audioMenu() {
  if (!menuAudio) menuAudio = crearAudio(PISTA_MENU);
  return menuAudio;
}

function audioPelea() {
  if (!peleaAudio) peleaAudio = crearAudio(PISTAS_PELEA[0]);
  return peleaAudio;
}

function volMenu() {
  return clamp(VOL_MENU * volumen, 0, 1);
}

function volMenuAtenuado() {
  return clamp(VOL_MENU * volumen * VOL_MENU_DUCK, 0, 1);
}

function volPelea() {
  return clamp(VOL_PELEA * volumen, 0, 1);
}

function intentarPlay(audio) {
  try {
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  } catch (_) {}
}

function fade(audio, destino, ms, clave) {
  const token = ++fadeTokens[clave];
  const inicio = audio.volume;
  const delta = destino - inicio;
  if (Math.abs(delta) < 0.01) {
    audio.volume = clamp(destino, 0, 1);
    return;
  }
  const t0 = performance.now();
  const paso = (t) => {
    if (fadeTokens[clave] !== token) return;
    const k = clamp((t - t0) / ms, 0, 1);
    audio.volume = clamp(inicio + delta * k, 0, 1);
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function reproducirEscena() {
  if (escena === "pelea") {
    const activo = audioPelea();
    intentarPlay(activo);
    fade(activo, volPelea(), FADE_MS, "pelea");
    if (menuAudio) fade(menuAudio, 0, FADE_MS, "menu");
    return;
  }
  const activo = audioMenu();
  intentarPlay(activo);
  fade(activo, menuAtenuado ? volMenuAtenuado() : volMenu(), FADE_MS, "menu");
  if (peleaAudio) fade(peleaAudio, 0, FADE_MS, "pelea");
}

function instalarDesbloqueo() {
  if (desbloqueoInstalado) return;
  desbloqueoInstalado = true;
  const intentar = () => {
    desbloqueado = true;
    document.removeEventListener("pointerdown", intentar);
    document.removeEventListener("keydown", intentar);
    document.removeEventListener("touchstart", intentar);
    reproducirEscena();
  };
  document.addEventListener("pointerdown", intentar);
  document.addEventListener("keydown", intentar);
  document.addEventListener("touchstart", intentar);
}

export function init(inputId = "volumen") {
  volumen = leerVolumen();
  const input = document.getElementById(inputId);
  if (input) {
    input.value = String(Math.round(volumen * 100));
    const onCambio = () => fijarVolumen(Number(input.value) / 100);
    input.addEventListener("input", onCambio);
    input.addEventListener("change", onCambio);
  }
  instalarDesbloqueo();
  reproducirEscena();
}

export function getVolumen() {
  return volumen;
}

export function fijarVolumen(valor) {
  volumen = clamp(Number(valor) || 0, 0, 1);
  guardarVolumen(volumen);
  const input = document.getElementById("volumen");
  if (input) input.value = String(Math.round(volumen * 100));

  if (escena === "pelea") {
    if (peleaAudio) peleaAudio.volume = volPelea();
  } else if (menuAudio) {
    menuAudio.volume = menuAtenuado ? volMenuAtenuado() : volMenu();
  }

  if (volumen > 0) reproducirEscena();
}

export function entrarMenu() {
  escena = "menu";
  menuAtenuado = false;
  reproducirEscena();
}

export function entrarPelea() {
  escena = "pelea";
  const activo = audioPelea();

  let idx = Math.floor(Math.random() * PISTAS_PELEA.length);
  if (PISTAS_PELEA.length > 1 && idx === peleaTrackIdx) {
    idx = (idx + 1 + Math.floor(Math.random() * (PISTAS_PELEA.length - 1))) % PISTAS_PELEA.length;
  }
  if (idx !== peleaTrackIdx) {
    peleaTrackIdx = idx;
    activo.src = PISTAS_PELEA[idx];
  } else {
    try {
      activo.currentTime = 0;
    } catch (_) {}
  }

  reproducirEscena();
}

export function atenuarMenu() {
  menuAtenuado = true;
  if (!menuAudio) return;
  fade(menuAudio, volMenuAtenuado(), 300, "menu");
}

export function restaurarMenu() {
  menuAtenuado = false;
  if (escena !== "menu") return;
  if (!desbloqueado) return;
  const activo = audioMenu();
  intentarPlay(activo);
  fade(activo, volMenu(), 300, "menu");
}

export function estaDesbloqueado() {
  return desbloqueado;
}
