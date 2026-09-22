import * as capas from "./capas.js";
import * as scoreMod from "./score.js";
import * as nube from "./supabase-client.js";
import * as motor from "./cipher-beat-skill.js";
import * as musica from "./musica.js";

const $ = (id) => document.getElementById(id);

let plagioData = null;
let bossData = null;
const personajes = {};

let estado = null;
let barIdx = 0;
let poseIdx = 0;
let accionesScore = [];
let puntosAcumulados = 0;
let burstActivo = false;
let burstTimer = null;
let introCtx = null;
const VOLUMEN_INTRO = 0.5;

const PRIETO_SPRITE = "Modelos/personajes/prieto/prieto.png";
const PRIETO_AUDIO = "Modelos/personajes/prieto/plagio mmgvo.mp3";
const PRIETO_DURACION = 5000;
const PRIETO_AVISO = "¡Esto es plagio, mamahuevo!";

let castigoActivo = false;
let prietoCtx = null;
let prietoAudio = null;
const burbujaTimers = {};

const ACCIONES_PUNTUABLES = new Set(["ataque_ok", "defender", "farm", "burst", "plagio"]);
const BOTONES_ACCION = ["btn-atacar", "btn-defender", "btn-farmear", "btn-burst-contextual"];

let turnoBloqueado = false;

function accionDisponible() {
  return !!(estado && !estado.termino && !castigoActivo && !turnoBloqueado);
}

function bloquearTurno() {
  if (turnoBloqueado) return;
  turnoBloqueado = true;
  BOTONES_ACCION.forEach((id) => {
    const el = $(id);
    if (el) el.disabled = true;
  });
}

function desbloquearTurno() {
  turnoBloqueado = false;
  BOTONES_ACCION.forEach((id) => {
    const el = $(id);
    if (el) el.disabled = false;
  });
}

const COMBATE_KEY = {
  desplazamientoY: 15,
  matte: true,
  fondoPosible: 90,
  pluma: 2,
  escala: 0.5,
  umbral: 14,
  rampa: 36,
};
const CROMA_KEY = {
  tipo: "croma",
  verdeMin: 20,
  verdeMax: 60,
  sueloG: 60,
  despill: 0.4,
};
let keyCtx = null;
let keyCtxBoss = null;

async function cargarDatos() {
  const [plagio, boss, neutro, lilsupa, akapellah] = await Promise.all([
    fetch("js/data/plagio.json").then((r) => r.json()),
    fetch("js/data/boss.json").then((r) => r.json()),
    fetch("js/data/personajes/neutro.json").then((r) => r.json()),
    fetch("js/data/personajes/lilsupa.json").then((r) => r.json()),
    fetch("js/data/personajes/akapellah.json").then((r) => r.json()),
  ]);
  plagioData = plagio;
  bossData = boss;
  Object.assign(personajes, { neutro, lilsupa, akapellah });
}

function barraAleatoria(lista, excluir = []) {
  const disponibles = lista.filter((b) => !excluir.includes(b));
  const fuente = disponibles.length ? disponibles : lista;
  return fuente[Math.floor(Math.random() * fuente.length)];
}

function mostrarBossBatalla() {
  asegurarBucleBoss();
  const fase = bossData.fases[String(estado.fase)];
  const barraBoss = barraAleatoria(fase.barra);
  const pose = fase.poses[fase.barra.indexOf(barraBoss) % fase.poses.length];
  $("img-boss").src = pose;
  mostrarBurbuja("burbuja-boss", barraBoss, 4000);
}

function actualizarHUD() {
  $("hp-jugador").style.width = estado.hpJugador + "%";
  $("hp-boss").style.width = estado.hpBoss + "%";
  $("aura-bar").style.width = estado.aura + "%";
  $("aura-porcentaje").textContent = estado.aura + "%";

  const faseEl = $("fase-boss");
  faseEl.textContent = estado.fase === 1 ? "FASE 1" : "FASE 2 · MONSTRUO LÍRICO";
  faseEl.classList.toggle("monstruo", estado.fase === 2);
  $("img-boss").dataset.fase = String(estado.fase);
  if (estado.fase === 2) {
    $("img-boss").src = bossData.assets.fase2;
  }

  $("btn-burst-contextual").classList.toggle("oculto", !(estado.aura >= 100 && !estado.termino));
}

function mostrarVisor(texto, clase = "") {
  const visor = $("barra-texto");
  visor.textContent = texto;
  visor.className = "barra-mostrada" + (clase ? " " + clase : "");
}

function mostrarBurbuja(id, texto, duracion = 3500) {
  const el = $(id);
  if (!el || !texto) return;
  clearTimeout(burbujaTimers[id]);
  el.textContent = texto;
  el.classList.remove("oculto", "entra");
  void el.offsetWidth;
  el.classList.add("entra");
  burbujaTimers[id] = setTimeout(() => el.classList.add("oculto"), duracion);
}

function ocultarBurbujas() {
  ["burbuja-jugador", "burbuja-boss"].forEach((id) => {
    clearTimeout(burbujaTimers[id]);
    const el = $(id);
    if (el) {
      el.classList.add("oculto");
      el.classList.remove("entra");
    }
  });
}

let escudoTimer = null;

function activarEscudo() {
  const cont = document.querySelector(".combatiente-jugador");
  if (!cont) return;
  const avatar = ["img-jugador", "video-jugador", "canvas-jugador"]
    .map((id) => $(id))
    .find((el) => el && !el.classList.contains("oculto"));
  if (avatar) {
    const c = cont.getBoundingClientRect();
    const a = avatar.getBoundingClientRect();
    const tam = Math.max(a.width, a.height) * 1.5;
    cont.style.setProperty("--escudo-x", a.left - c.left + a.width / 2 + "px");
    cont.style.setProperty("--escudo-y", a.top - c.top + a.height / 2 + "px");
    cont.style.setProperty("--escudo-size", Math.max(140, tam) + "px");
  }
  cont.classList.add("shield-active");
  clearTimeout(escudoTimer);
  escudoTimer = setTimeout(() => cont.classList.remove("shield-active"), 1500);
}

let hitFlashTimers = { jugador: null, boss: null };

function parpadeoDanio(lado) {
  const ids =
    lado === "boss"
      ? ["img-boss", "video-boss", "canvas-boss"]
      : ["img-jugador", "video-jugador", "canvas-jugador"];
  const avatar = ids
    .map((id) => $(id))
    .find((el) => el && !el.classList.contains("oculto"));
  if (!avatar) return;
  avatar.classList.add("hit-flash");
  clearTimeout(hitFlashTimers[lado]);
  hitFlashTimers[lado] = setTimeout(() => avatar.classList.remove("hit-flash"), 300);
}

function textoFlotante(texto, lado, { clase = "danio", tope = 0 } = {}) {
  const contenedor = document.querySelector(
    lado === "boss" ? ".combatiente-boss" : ".combatiente-jugador"
  );
  if (!contenedor) return;
  const div = document.createElement("div");
  div.className = "texto-flotante" + (clase ? " " + clase : "");
  div.textContent = texto;
  if (tope) div.style.top = "calc(8% + " + tope + "px)";
  contenedor.appendChild(div);
  setTimeout(() => div.remove(), 950);
}

function sacudirArena() {
  const arena = document.querySelector(".arena");
  if (!arena) return;
  arena.classList.remove("screen-shake");
  void arena.offsetWidth;
  arena.classList.add("screen-shake");
}

function precargarAudioPrieto() {
  if (prietoAudio) return prietoAudio;
  prietoAudio = new Audio(PRIETO_AUDIO);
  prietoAudio.preload = "auto";
  prietoAudio.volume = 1;
  return prietoAudio;
}

function limpiarCastigoPrieto() {
  if (!prietoCtx) return;
  const { overlay, timer, salidaTimer, glitchEl, glitchTimer } = prietoCtx;
  prietoCtx = null;
  clearTimeout(timer);
  clearTimeout(salidaTimer);
  clearTimeout(glitchTimer);
  if (glitchEl) glitchEl.remove();
  if (overlay) overlay.remove();
  if (prietoAudio) {
    try {
      prietoAudio.pause();
      prietoAudio.currentTime = 0;
    } catch (_) {}
  }
  castigoActivo = false;
}

function reproducirCastigoPrieto({ onTerminar } = {}) {
  limpiarCastigoPrieto();
  castigoActivo = true;

  const overlay = document.createElement("div");
  overlay.className = "prieto-overlay";

  const sprite = document.createElement("img");
  sprite.className = "prieto-sprite";
  sprite.src = PRIETO_SPRITE;
  sprite.alt = "Prieto";
  sprite.draggable = false;
  overlay.appendChild(sprite);

  const aviso = document.createElement("p");
  aviso.className = "prieto-aviso";
  aviso.textContent = PRIETO_AVISO;
  overlay.appendChild(aviso);

  document.body.appendChild(overlay);

  const glitchEl = document.createElement("div");
  glitchEl.className = "crt-glitch";
  document.body.appendChild(glitchEl);
  const glitchTimer = setTimeout(() => glitchEl.remove(), 1000);

  const audio = precargarAudioPrieto();
  audio.volume = musica.getVolumen();
  try {
    audio.currentTime = 0;
  } catch (_) {}
  const reproduccion = audio.play();
  if (reproduccion && reproduccion.catch) reproduccion.catch(() => {});

  prietoCtx = { overlay, glitchEl, glitchTimer, timer: null, salidaTimer: null };
  const ctx = prietoCtx;

  ctx.timer = setTimeout(() => {
    if (prietoCtx !== ctx) return;
    overlay.classList.add("salida");
    ctx.salidaTimer = setTimeout(() => {
      if (prietoCtx !== ctx) return;
      limpiarCastigoPrieto();
      if (onTerminar) onTerminar();
    }, 520);
  }, PRIETO_DURACION);
}

function animarHPDanio() {
  const bar = $("hp-jugador");
  bar.style.transition = "width " + PRIETO_DURACION / 1000 + "s linear";
  bar.style.width = estado.hpJugador + "%";
  setTimeout(() => {
    if (bar) bar.style.transition = "";
  }, PRIETO_DURACION + 200);
}

function ocultarPanelAtaque() {
  const panel = $("panel-ataque");
  panel.innerHTML = "";
  panel.classList.add("oculto");
}

function abrirOpcionesAtaque() {
  if (!accionDisponible()) return;
  bloquearTurno();
  const personaje = personajes[estado.rosterId];
  const reales = personaje.barras.ataque;
  const real = reales[barIdx % reales.length];
  barIdx += 1;

  const falsas = [];
  while (falsas.length < 2) {
    const falsa = barraAleatoria(plagioData.barra, [real, ...falsas]);
    if (!falsa) break;
    falsas.push(falsa);
  }
  const opciones = [real, ...falsas].sort(() => Math.random() - 0.5);

  const panel = $("panel-ataque");
  panel.innerHTML = "";

  const caja = document.createElement("div");
  caja.className = "panel-ataque-caja";

  const titulo = document.createElement("p");
  titulo.className = "panel-ataque-titulo";
  titulo.textContent = "ELIGE TU BARRA REAL";
  caja.appendChild(titulo);

  opciones.forEach((texto) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "opcion-barra";
    boton.textContent = texto;
    boton.addEventListener("click", () => {
      if (!estado || estado.termino || castigoActivo) return;
      if ($("panel-ataque").classList.contains("oculto")) return;
      ocultarPanelAtaque();
      resolverAccionUI("atacar", texto === real, texto);
    });
    caja.appendChild(boton);
  });

  panel.appendChild(caja);
  panel.classList.remove("oculto");
  mostrarVisor("¿Cuál es la barra real de " + personaje.nombre + "?", "prompt");
}

function procesarFrameKey(ctx) {
  const { video, canvas, c } = ctx;
  const w = canvas.width;
  const h = canvas.height;
  const cro = ctx.crop;
  const sx = cro ? cro.x : 0;
  const sy = cro ? cro.y : 0;
  const sw = cro ? cro.w : video.videoWidth;
  const sh = cro ? cro.h : video.videoHeight;
  c.clearRect(0, 0, w, h);
  if (ctx.flip) {
    c.save();
    c.translate(w, 0);
    c.scale(-1, 1);
    c.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    c.restore();
  } else {
    c.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  }
  let datos;
  try {
    datos = c.getImageData(0, 0, w, h);
  } catch (_) {
    return;
  }
  const d = datos.data;

  if (ctx.tipo === "croma") {
    const vMin = ctx.verdeMin;
    const vMax = ctx.verdeMax;
    const rango = vMax - vMin || 1;
    const suelo = ctx.sueloG;
    const despill = ctx.despill || 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mar = r > b ? r : b;
      let verd = g > mar ? g - mar : 0;
      if (g < suelo) verd = 0;
      let alfa = 255;
      if (verd >= vMax) {
        alfa = 0;
      } else if (verd > vMin) {
        alfa = Math.round(((vMax - verd) / rango) * 255);
        if (despill > 0) {
          const corte = Math.round(((255 - alfa) / 255) * despill * 255);
          const g2 = g - corte;
          d[i + 1] = g2 > mar ? g2 : mar;
        }
      }
      d[i + 3] = alfa;
    }
    c.putImageData(datos, 0, 0);
    return;
  }

  if (!ctx.matte) {
    const aMin = ctx.umbral;
    const aMax = ctx.umbral + ctx.rampa;
    for (let i = 3; i < d.length; i += 4) {
      const r = d[i - 3], g = d[i - 2], b = d[i - 1];
      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      let alfa = 255;
      if (lum <= aMin) {
        alfa = 0;
      } else if (lum < aMax) {
        alfa = Math.round(((lum - aMin) / (aMax - aMin || 1)) * 255);
      }
      d[i] = alfa;
    }
    c.putImageData(datos, 0, 0);
    return;
  }

  const gw = Math.max(2, Math.round(w * ctx.escala));
  const gh = Math.max(2, Math.round(h * ctx.escala));
  let p = ctx.bufes;
  if (!p || p.gw !== gw || p.gh !== gh) {
    p = ctx.bufes = {
      gw,
      gh,
      lum: new Uint8Array(gw * gh),
      lbl: new Uint8Array(gw * gh),
      alfaGrid: new Float32Array(gw * gh),
      suave: new Float32Array(gw * gh),
      pila: new Int32Array(gw * gh),
    };
  }
  const { lum, lbl, alfaGrid, suave, pila } = p;
  const mw = 1 / w;
  const mh = 1 / h;
  const dyEsc = h / gh;

  for (let gy = 0; gy < gh; gy++) {
    const fy = Math.min(h - 1, Math.round(gy * dyEsc));
    const base = fy * w;
    let k = gy * gw;
    for (let gx = 0; gx < gw; gx++) {
      const fx = Math.min(w - 1, Math.round(gx * (w / gw)));
      const j = (base + fx) * 4;
      lum[k] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
      lbl[k] = 0;
      k++;
    }
  }

  const limite = ctx.fondoPosible;
  let tope = 0;
  const push = (idx) => {
    if (!lbl[idx]) {
      lbl[idx] = 1;
      pila[tope++] = idx;
    }
  };
  for (let gx = 0; gx < gw; gx++) {
    if (lum[gx] <= limite) push(gx);
    const fi = (gh - 1) * gw + gx;
    if (lum[fi] <= limite) push(fi);
  }
  for (let gy = 1; gy < gh - 1; gy++) {
    const ri = gy * gw;
    if (lum[ri] <= limite) push(ri);
    const li = ri + gw - 1;
    if (lum[li] <= limite) push(li);
  }
  while (tope > 0) {
    const idx = pila[--tope];
    const x = idx % gw;
    const y = (idx / gw) | 0;
    if (x > 0) {
      const n = idx - 1;
      if (!lbl[n] && lum[n] <= limite) { lbl[n] = 1; pila[tope++] = n; }
    }
    if (x < gw - 1) {
      const n = idx + 1;
      if (!lbl[n] && lum[n] <= limite) { lbl[n] = 1; pila[tope++] = n; }
    }
    if (y > 0) {
      const n = idx - gw;
      if (!lbl[n] && lum[n] <= limite) { lbl[n] = 1; pila[tope++] = n; }
    }
    if (y < gh - 1) {
      const n = idx + gw;
      if (!lbl[n] && lum[n] <= limite) { lbl[n] = 1; pila[tope++] = n; }
    }
  }

  for (let k = 0; k < gw * gh; k++) {
    alfaGrid[k] = lbl[k] ? 0 : 255;
  }

  if (ctx.pluma > 0) {
    for (let y = 0; y < gh; y++) {
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < gh - 1 ? y + 1 : gh - 1;
      for (let x = 0; x < gw; x++) {
        const x0 = x > 0 ? x - 1 : 0;
        const x1 = x < gw - 1 ? x + 1 : gw - 1;
        let acc = 0;
        let n = 0;
        for (let yy = y0; yy <= y1; yy++) {
          let k = yy * gw;
          for (let xx = x0; xx <= x1; xx++) {
            acc += alfaGrid[k + xx];
            n++;
          }
        }
        suave[y * gw + x] = acc / n;
      }
    }
  } else {
    suave.set(alfaGrid);
  }

  const gwm = gw * mw;
  const ghm = gh * mh;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, (y * ghm) | 0);
    const k = gy * gw;
    let i = y * w * 4;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1, (x * gwm) | 0);
      d[i + 3] = suave[k + gx];
      i += 4;
    }
  }
  c.putImageData(datos, 0, 0);
}

function detenerBucle(key, canvasEl) {
  if (!key) return;
  const canvas = canvasEl;
  key.stopped = true;
  cancelAnimationFrame(key.raf);
  if (key.vigilarResize) window.removeEventListener("resize", key.vigilarResize);
  if (key.vigilarFin && canvas) {
    const video = key.video;
    if (video) video.removeEventListener("timeupdate", key.vigilarFin);
    key.vigilarFin = null;
  }
  if (canvas) {
    canvas.classList.add("oculto");
    canvas.style.cssText = "";
  }
}

function detenerKeyJugador() {
  detenerBucle(keyCtx, $("canvas-jugador"));
  keyCtx = null;
}

function iniciarBucleVideo(opts) {
  const { videoEl, canvasEl, imgEl, lado, flip, desplazamientoY } = opts;
  if (!videoEl || !canvasEl) return null;
  const crop = opts.crop || null;
  const c = canvasEl.getContext("2d", { willReadFrequently: true });
  if (!c) return null;

  videoEl.muted = true;
  const p = videoEl.play();
  if (p && p.catch) p.catch(() => {});
  if (imgEl) imgEl.classList.add("oculto");
  canvasEl.classList.remove("oculto");

  const cajon = canvasEl.parentElement;
  const fx = { w: 0, h: 0 };
  const encajar = () => {
    const cw = cajon ? cajon.clientWidth : 0;
    const ch = cajon ? cajon.clientHeight : 0;
    const vw = crop ? crop.w : videoEl.videoWidth;
    const vh = crop ? crop.h : videoEl.videoHeight;
    if (!cw || !ch || !vw || !vh) return false;
    const esc = Math.min(cw / vw, ch / vh);
    const w = Math.round(vw * esc);
    const h = Math.round(vh * esc);
    if (fx.w === w && fx.h === h) return true;
    fx.w = w;
    fx.h = h;
    const s = canvasEl.style;
    s.cssText = "";
    s.position = "absolute";
    s.bottom = "0px";
    s.top = "auto";
    if (lado === "right") {
      s.right = "0px";
      s.left = "auto";
    } else {
      s.left = "0px";
      s.right = "auto";
    }
    s.width = w + "px";
    s.height = h + "px";
    s.transform = desplazamientoY ? "translateY(" + desplazamientoY + "px)" : "";
    return true;
  };

  const ctx = {
    video: videoEl,
    canvas: canvasEl,
    c,
    flip: !!flip,
    crop,
    ...COMBATE_KEY,
    ...(opts.conf || {}),
    raf: 0,
    tick: 0,
    encajar,
    vigilarResize: null,
    vigilarFin: null,
    stopped: false,
  };

  const dimensionar = () => {
    const w = crop ? crop.w : videoEl.videoWidth;
    const h = crop ? crop.h : videoEl.videoHeight;
    if (!w || !h) return false;
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
    encajar();
    return true;
  };

  const paso = () => {
    if (ctx.stopped) return;
    ctx.tick += 1;
    if (ctx.tick % 2 === 0) {
      ctx.raf = requestAnimationFrame(paso);
      return;
    }
    if (dimensionar() && videoEl.readyState >= 2) {
      procesarFrameKey(ctx);
    }
    ctx.raf = requestAnimationFrame(paso);
  };

  const esperar = () => {
    if (ctx.stopped) return;
    if (dimensionar() && videoEl.readyState >= 2) {
      paso();
      return;
    }
    ctx.raf = requestAnimationFrame(esperar);
  };

  ctx.vigilarResize = () => {
    if (!ctx.stopped && ctx.encajar) ctx.encajar();
  };
  window.addEventListener("resize", ctx.vigilarResize);

  const skipFinal = opts.skipFinal || 0;
  if (skipFinal > 0) {
    ctx.vigilarFin = () => {
      const dur = videoEl.duration;
      if (!(dur > skipFinal) || !(videoEl.currentTime >= dur - skipFinal)) return;
      videoEl.currentTime = 0;
      const p = videoEl.play();
      if (p && p.catch) p.catch(() => {});
    };
    videoEl.addEventListener("timeupdate", ctx.vigilarFin);
  }

  ctx.raf = requestAnimationFrame(esperar);
  return ctx;
}

function iniciarKeyJugador() {
  const video = $("video-jugador");
  const canvas = $("canvas-jugador");
  if (!video || !canvas || keyCtx) return false;
  const personaje = estado ? personajes[estado.rosterId] : null;
  if (personaje && personaje.assets && personaje.assets.combateLoop) {
    video.src = personaje.assets.combateLoop;
    video.load();
  }
  keyCtx = iniciarBucleVideo({
    videoEl: video,
    canvasEl: canvas,
    imgEl: $("img-jugador"),
    lado: "left",
    flip: false,
    desplazamientoY: COMBATE_KEY.desplazamientoY,
    conf: CROMA_KEY,
    crop:
      (personaje && personaje.assets && personaje.assets.combateCrop) || null,
    skipFinal:
      (personaje && personaje.assets && personaje.assets.combateRecorteFin) || 0,
  });
  return !!keyCtx;
}

function reproducirBurstJugador() {
  const personaje = estado ? personajes[estado.rosterId] : null;
  const burstLoop =
    personaje && personaje.assets && personaje.assets.burstLoop
      ? personaje.assets.burstLoop
      : null;
  detenerKeyJugador();
  if (!burstLoop) return false;
  const video = $("video-jugador");
  const canvas = $("canvas-jugador");
  if (!video || !canvas) return false;
  video.src = burstLoop;
  video.load();
  video.muted = true;
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
  keyCtx = iniciarBucleVideo({
    videoEl: video,
    canvasEl: canvas,
    imgEl: $("img-jugador"),
    lado: "left",
    flip: false,
    desplazamientoY: COMBATE_KEY.desplazamientoY,
    conf: CROMA_KEY,
    crop:
      (personaje && personaje.assets && personaje.assets.burstCrop) || null,
    skipFinal:
      (personaje && personaje.assets && personaje.assets.burstRecorteFin) || 0,
  });
  return !!keyCtx;
}

function detenerKeyBoss() {
  detenerBucle(keyCtxBoss, $("canvas-boss"));
  const v = $("video-boss");
  if (v) {
    try {
      v.pause();
      v.currentTime = 0;
    } catch (_) {}
  }
  keyCtxBoss = null;
}

function iniciarBucleBoss(loop) {
  const videoEl = $("video-boss");
  const canvasEl = $("canvas-boss");
  if (!videoEl || !canvasEl) return false;
  try {
    videoEl.pause();
    videoEl.currentTime = 0;
    videoEl.removeAttribute("src");
    videoEl.load();
  } catch (_) {}
  videoEl.src = loop.src;
  keyCtxBoss = iniciarBucleVideo({
    videoEl,
    canvasEl,
    imgEl: null,
    lado: "right",
    flip: loop.flip,
    desplazamientoY: 0,
    conf: loop.chroma || CROMA_KEY,
    skipFinal: loop.recorteFin || 0,
  });
  if (keyCtxBoss) keyCtxBoss.faseBoss = estado ? estado.fase : null;
  return !!keyCtxBoss;
}

function asegurarBucleBoss() {
  const loop =
    estado && bossData.assets && bossData.assets.combateLoop &&
    bossData.assets.combateLoop[String(estado.fase)];
  if (!loop) {
    detenerKeyBoss();
    return;
  }
  if (keyCtxBoss && keyCtxBoss.faseBoss === estado.fase && keyCtxBoss.flip === !!loop.flip) return;
  iniciarBucleBoss(loop);
}

function usarBucleJugador() {
  const personaje = estado ? personajes[estado.rosterId] : null;
  if (personaje && personaje.assets && personaje.assets.combateKey) {
    if (keyCtx || iniciarKeyJugador()) return;
  }
  const img = $("img-jugador");
  const video = $("video-jugador");
  img.classList.add("oculto");
  video.classList.remove("oculto");
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
}

function usarImagenJugador() {
  detenerKeyJugador();
  const video = $("video-jugador");
  video.classList.add("oculto");
  try {
    video.pause();
    video.currentTime = 0;
  } catch (_) {}
  $("img-jugador").classList.remove("oculto");
}

function iniciarTurno(mensaje) {
  ocultarPanelAtaque();
  const personaje = personajes[estado.rosterId];
  if (!burstActivo) {
    if (personaje.assets && personaje.assets.combateLoop) {
      usarBucleJugador();
    } else {
      $("img-jugador").src = personaje.assets.poses[poseIdx % personaje.assets.poses.length];
      poseIdx += 1;
    }
  }
  mostrarVisor(mensaje || "Elige tu movimiento: ATAQUE, DEFENSA o FARMEAR AURA.");
  desbloquearTurno();
}

function registrarAccionPuntos(tipo) {
  if (!ACCIONES_PUNTUABLES.has(tipo)) return;
  accionesScore.push(tipo);
  puntosAcumulados = scoreMod.calcularPuntos(estado, accionesScore);
}

function terminarPartida(victoria) {
  estado.termino = true;
  desbloquearTurno();
  clearTimeout(burstTimer);
  burstActivo = false;
  detenerKeyJugador();
  detenerKeyBoss();
  ocultarPanelAtaque();
  mostrarVisor(victoria ? "¡LE GANASTE A CANSERBERO!" : "CANSERBERO TE VENCIÓ...");

  const titulo = $("fin-titulo");
  titulo.textContent = victoria ? "VICTORIA" : "DERROTA";
  titulo.className = "fin-titulo " + (victoria ? "victoria" : "derrota");

  const bonus = scoreMod.bonusFinal(estado);
  const total = puntosAcumulados + bonus;
  $("fin-detalle").textContent =
    "Puntos de la pelea: " + puntosAcumulados +
    " | Bonus: " + bonus +
    (victoria ? " | Urbani alguna vaina bien bacana." : "");

  window.__totalPuntos = total;
  window.__victoria = victoria;

  $("fin-score").textContent = String(total);
  $("fin-paso-nombre").classList.remove("oculto");
  $("fin-paso-score").classList.add("oculto");
  capas.mostrarFinish();
}

function abortarPelea() {
  estado = null;
  poseIdx = 0;
  desbloquearTurno();
  window.__totalPuntos = 0;
  window.__victoria = false;
  clearTimeout(burstTimer);
  burstActivo = false;
  limpiarCastigoPrieto();
  ocultarBurbujas();
  capas.ocultarFinish();
  const videoJugador = $("video-jugador");
  try {
    videoJugador.pause();
    videoJugador.currentTime = 0;
  } catch (_) {}
  usarImagenJugador();
  detenerKeyBoss();

  ocultarPanelAtaque();
  mostrarVisor("Preparando el escenario...");
}

function resolverAccionUI(tipo, correcto, textoSeleccionado) {
  bloquearTurno();
  const hpAntes = estado ? estado.hpJugador : 100;
  const auraAntes = estado ? estado.aura : 0;
  const { estado: nuevo, resultado } = motor.resolverAccion(estado, tipo, {
    correcto,
  });
  estado = nuevo;
  actualizarHUD();

  if (resultado.danioBoss > 0 || resultado.danioJugador > 0) {
    sacudirArena();
  }
  if (resultado.danioJugador > 0) parpadeoDanio("jugador");
  if (resultado.danioBoss > 0) parpadeoDanio("boss");

  if (resultado.plagio) {
    const bar = $("hp-jugador");
    bar.style.transition = "none";
    bar.style.width = hpAntes + "%";
    void bar.offsetWidth;
    animarHPDanio();
  }

  let mensaje = "";

  if (tipo === "atacar") {
    if (resultado.plagio) {
      registrarAccionPuntos("plagio");
      mensaje = "PLAGIO: esa no era tu barra. -35% de HP y sin Aura.";
      textoFlotante("-" + resultado.danioJugador + "%", "jugador");
      reproducirCastigoPrieto({
        onTerminar: () => {
          if (estado && !estado.termino) {
            if (textoSeleccionado) {
              mostrarBurbuja("burbuja-jugador", textoSeleccionado, 4000);
            }
            mostrarBossBatalla();
            iniciarTurno(mensaje);
          } else {
            terminarPartida(false);
          }
        },
      });
      return;
    }
    registrarAccionPuntos("ataque_ok");
    textoFlotante("-" + resultado.danioBoss + "%", "boss");
    textoFlotante("+" + (resultado.auraNueva - auraAntes) + "% AURA", "jugador", { clase: "aura" });
    const pjOk = personajes[estado.rosterId];
    if (pjOk.assets && pjOk.assets.combateLoop) {
      usarBucleJugador();
    } else {
      $("img-jugador").src = pjOk.assets.power;
    }
    if (textoSeleccionado) {
      mostrarBurbuja("burbuja-jugador", textoSeleccionado);
    }
  } else if (tipo === "defender") {
    registrarAccionPuntos("defender");
    activarEscudo();
    mensaje = personajes[estado.rosterId].barras.proteccion[0];
    mostrarBurbuja("burbuja-jugador", mensaje);
  } else if (tipo === "farmear") {
    registrarAccionPuntos("farm");
    textoFlotante("-" + resultado.danioJugador + "%", "jugador");
    textoFlotante("+" + (resultado.auraNueva - auraAntes) + "% AURA", "jugador", { clase: "aura", tope: 44 });
    mensaje = barraAleatoria(personajes[estado.rosterId].barras.aura);
    mostrarBurbuja("burbuja-jugador", mensaje);
  } else if (tipo === "burst") {
    registrarAccionPuntos("burst");
    textoFlotante("-" + resultado.danioBoss + "%", "boss");
    mensaje = personajes[estado.rosterId].barras.buster[0];
    if (
      personajes[estado.rosterId].assets &&
      personajes[estado.rosterId].assets.burstLoop
    ) {
      reproducirBurstJugador();
    } else {
      $("img-jugador").src = personajes[estado.rosterId].assets.power;
      usarImagenJugador();
    }
    mostrarBurbuja("burbuja-jugador", mensaje, 4600);
    burstActivo = true;
    clearTimeout(burstTimer);
    burstTimer = setTimeout(() => {
      burstActivo = false;
      detenerKeyJugador();
      if (estado && !estado.termino) iniciarTurno();
    }, 15000);
  }

  if (resultado.victoria) {
    terminarPartida(true);
    return;
  }
  if (resultado.derrota) {
    terminarPartida(false);
    return;
  }
  if (resultado.faseCambio) {
    $("img-boss").src = bossData.assets.fase2;
  }
  mostrarBossBatalla();

  if (tipo === "atacar" && !resultado.plagio) {
    setTimeout(() => {
      if (estado && !estado.termino) iniciarTurno();
    }, 650);
  } else {
    iniciarTurno(mensaje);
  }
}

function iniciarPelea(rosterId) {
  estado = motor.iniciarPartida(rosterId);
  desbloquearTurno();
  barIdx = 0;
  poseIdx = 0;
  accionesScore = [];
  puntosAcumulados = 0;
  window.__totalPuntos = 0;
  clearTimeout(burstTimer);
  burstActivo = false;
  limpiarCastigoPrieto();
  ocultarBurbujas();
  precargarAudioPrieto();

  const personaje = personajes[rosterId];
  const rgb = hexARgb(personaje.color);
  $("capa-pelea").style.setProperty("--acento", personaje.color || "var(--aura)");
  $("capa-pelea").style.setProperty("--acento-rgb", rgb || "255, 206, 46");
  $("nombre-jugador").textContent = personaje.nombre;
  $("img-jugador").src = personaje.assets.poses[0];
  const videoJugador = $("video-jugador");
  if (personaje.assets && personaje.assets.combateLoop) {
    videoJugador.src = personaje.assets.combateLoop;
    usarBucleJugador();
  } else {
    usarImagenJugador();
  }
  $("img-boss").src = bossData.assets.fase1;

  $("hp-jugador").style.width = "100%";
  $("hp-boss").style.width = "100%";
  $("aura-bar").style.width = "0%";
  $("fase-boss").classList.toggle("monstruo", false);

  actualizarHUD();
  capas.navegar("pelea");
  mostrarBossBatalla();
  iniciarTurno();
}

function hexARgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(", ");
}

function cancelarIntro(reanudarMusica = true) {
  if (!introCtx) return;
  const { video, card, timeout, audio, raf } = introCtx;
  introCtx = null;
  clearTimeout(timeout);
  if (raf) cancelAnimationFrame(raf);
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (_) {}
  }
  try {
    video.pause();
  } catch (_) {}
  video.remove();
  const img = card.querySelector(".card-foto img");
  if (img) img.style.display = "";
  delete card.dataset.bloqueada;
  if (reanudarMusica) musica.restaurarMenu();
}

function reproducirIntro(card, personaje) {
  cancelarIntro(false);
  musica.atenuarMenu();
  const foto = card.querySelector(".card-foto");
  const img = foto.querySelector("img");
  const fuentes = Array.isArray(personaje.assets.intro)
    ? personaje.assets.intro.slice()
    : [personaje.assets.intro];

  const video = document.createElement("video");
  video.className = "card-intro";
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "auto";
  const volIntro =
    personaje.assets && typeof personaje.assets.introVolumen === "number"
      ? personaje.assets.introVolumen
      : VOLUMEN_INTRO;
  video.volume = Math.min(1, volIntro * musica.getVolumen());

  if (img) img.style.display = "none";
  foto.appendChild(video);

  const ctx = { video, card, personaje, timeout: null, indice: 0, audio: null, raf: null, audioIniciado: false };
  introCtx = ctx;

  const introAudio = personaje.assets ? personaje.assets.introAudio : null;
  if (introAudio && introAudio.src) {
    const desde = typeof introAudio.desde === "number" ? introAudio.desde : 0;
    const hasta = typeof introAudio.hasta === "number" ? introAudio.hasta : null;
    const audio = new Audio(introAudio.src);
    audio.preload = "auto";
    audio.volume = 0;
    ctx.audio = audio;
    let audioListo = false;
    let videoIniciado = false;
    video.addEventListener("playing", () => {
      videoIniciado = true;
    });
    const preparar = () => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = musica.getVolumen();
      audioListo = true;
    };
    const desbloqueo = audio.play();
    if (desbloqueo && desbloqueo.then) {
      desbloqueo.then(preparar).catch(preparar);
    } else {
      preparar();
    }
    const vigilar = () => {
      if (introCtx !== ctx) return;
      if (!ctx.audioIniciado && audioListo && videoIniciado && !video.ended && video.currentTime >= desde) {
        ctx.audioIniciado = true;
        try {
          audio.currentTime = Math.max(0, video.currentTime - desde);
        } catch (_) {}
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
        if (ctx.personaje.id === "neutro" && desde > 0 && !video.muted && video.volume > 0) {
          video.volume = 0;
        }
      }
      if (ctx.audioIniciado && hasta !== null) {
        if (video.currentTime >= hasta) {
          audio.pause();
          return;
        }
        ctx.raf = requestAnimationFrame(vigilar);
        return;
      }
      if (!ctx.audioIniciado) ctx.raf = requestAnimationFrame(vigilar);
    };
    ctx.raf = requestAnimationFrame(vigilar);
  }

  const irAPelea = () => {
    if (introCtx !== ctx) return;
    cancelarIntro();
    iniciarPelea(ctx.personaje.id);
  };

  const intentarPlay = () => {
    if (introCtx !== ctx) return;
    const p = video.play();
    if (p && p.catch) {
      p.catch(() => {
        if (introCtx !== ctx) return;
        video.muted = true;
        const p2 = video.play();
        if (p2 && p2.catch) p2.catch(irAPelea);
      });
    }
  };

  const cargarFuente = () => {
    if (introCtx !== ctx) return;
    video.src = fuentes[ctx.indice];
    video.load();
    intentarPlay();
  };

  video.addEventListener("ended", irAPelea, { once: true });
  video.addEventListener("error", () => {
    if (introCtx !== ctx) return;
    ctx.indice += 1;
    if (ctx.indice < fuentes.length) cargarFuente();
    else irAPelea();
  });
  video.addEventListener("loadedmetadata", () => {
    if (introCtx !== ctx) return;
    const dur = isFinite(video.duration) ? video.duration : 10;
    clearTimeout(ctx.timeout);
    ctx.timeout = setTimeout(irAPelea, dur * 1000 + 1500);
  });

  cargarFuente();
}

function pintarCard(personaje) {
  const card = document.createElement("div");
  card.className = "card-personaje";
  card.dataset.id = personaje.id;
  card.style.setProperty("--acento", personaje.color || "var(--aura)");
  const rgb = hexARgb(personaje.color);
  if (rgb) card.style.setProperty("--acento-rgb", rgb);

  const foto = document.createElement("div");
  foto.className = "card-foto";

  const img = document.createElement("img");
  img.src = personaje.assets.select;
  img.alt = personaje.nombre;
  foto.appendChild(img);

  const h3 = document.createElement("h3");
  h3.textContent = personaje.nombre;

  const p = document.createElement("p");
  p.textContent = personaje.estilo;

  card.append(foto, h3, p);
  card.addEventListener("click", () => {
    if (card.dataset.bloqueada === "1") return;
    cancelarIntro(false);
    document.querySelectorAll(".card-personaje").forEach((c) => c.classList.remove("seleccionado"));
    card.classList.add("seleccionado");
    if (personaje.assets && personaje.assets.intro) {
      card.dataset.bloqueada = "1";
      reproducirIntro(card, personaje);
    } else {
      iniciarPelea(personaje.id);
    }
  });
  return card;
}

function pintarPersonajes() {
  const cont = $("lista-personajes");
  cont.innerHTML = "";
  Object.values(personajes).forEach((p) => cont.appendChild(pintarCard(p)));
}

async function refrescarScore() {
  const tabla = $("tabla-score");
  if (!nube.supabaseConfigurado()) {
    scoreMod.pintarTabla(tabla, scoreMod.leerScores());
    return;
  }
  try {
    const cloud = await nube.listarScoresNube(10);
    const lista = (cloud || [])
      .map((r) => ({
        nombre: scoreMod.sanitizarNombre(r.player_name) || "Anónimo",
        puntos: Math.max(0, Math.round(Number(r.score))) || 0,
        fecha: typeof r.created_at === "string" ? r.created_at : new Date().toISOString(),
      }))
      .sort((a, b) => b.puntos - a.puntos);
    scoreMod.pintarTabla(tabla, lista);
  } catch (_) {
    scoreMod.pintarTabla(tabla, scoreMod.leerScores());
  }
}

function init() {
  musica.init("volumen");

  $("btn-jugar").addEventListener("click", () => capas.navegar("select"));
  $("btn-records").addEventListener("click", () => {
    refrescarScore();
    capas.navegar("score");
  });
  $("btn-como-jugar").addEventListener("click", () => capas.navegar("ayuda"));
  $("btn-volver-ayuda").addEventListener("click", () => capas.navegar("lobby"));
  $("btn-volver-score").addEventListener("click", () => capas.navegar("lobby"));
  $("btn-jugar-otra").addEventListener("click", () => capas.navegar("select"));
  $("btn-atras").addEventListener("click", () => capas.retroceder());

  window.addEventListener("capa:cambio", (e) => {
    if (keyCtx && e.detail && e.detail.capa !== "pelea") detenerKeyJugador();
    if (keyCtxBoss && e.detail && e.detail.capa !== "pelea") detenerKeyBoss();
    const capa = e.detail && e.detail.capa;
    if (capa === "pelea") musica.entrarPelea();
    else if (capa === "lobby" || capa === "select" || capa === "score" || capa === "ayuda") musica.entrarMenu();
  });

  $("btn-atacar").addEventListener("click", () => {
    if (!accionDisponible()) return;
    abrirOpcionesAtaque();
  });

  $("btn-defender").addEventListener("click", () => {
    if (!accionDisponible()) return;
    resolverAccionUI("defender", true);
  });
  $("btn-farmear").addEventListener("click", () => {
    if (!accionDisponible()) return;
    resolverAccionUI("farmear", true);
  });
  $("btn-burst-contextual").addEventListener("click", () => {
    if (!accionDisponible()) return;
    if (estado.aura < 100) return;
    resolverAccionUI("burst", true);
  });

  $("fin-registrar").addEventListener("click", async () => {
    const totalAutoritativo = estado
      ? Math.max(0, scoreMod.calcularPuntos(estado, accionesScore) + scoreMod.bonusFinal(estado))
      : 0;
    const puntos = Math.max(0, Math.min(9999999, Math.round(totalAutoritativo)));
    const nombre = scoreMod.sanitizarNombre($("fin-nombre").value) || "Anónimo";
    scoreMod.registrarScore(nombre, puntos);
    const estadoFin = $("fin-estado");
    estadoFin.className = "fin-estado";
    estadoFin.textContent = "";
    let cloudOk = false;
    if (nube.supabaseConfigurado()) {
      estadoFin.textContent = "Sincronizando con la nube…";
      try {
        await nube.guardarScoreNube(nombre, puntos, new Date());
        cloudOk = true;
      } catch (_) {
        estadoFin.textContent = "Sin conexión a la nube. Se guardó solo en este navegador.";
        estadoFin.classList.add("error");
      }
    }
    if (cloudOk) estadoFin.textContent = "Récord sincronizado en la nube.";
    try {
      localStorage.setItem(
        "cipherbeat_ultimo",
        JSON.stringify({ nombre, puntos, victoria: Boolean(estado && estado.ganador === "jugador") })
      );
    } catch (_) {}
    $("fin-score").textContent = String(puntos);
    $("fin-paso-nombre").classList.add("oculto");
    $("fin-paso-score").classList.remove("oculto");
  });

  $("fin-continuar").addEventListener("click", () => {
    capas.ocultarFinish();
    refrescarScore();
    capas.navegar("score", { reemplazar: true });
  });

  capas.initRouter();
  if (!estado && capas.getCapaActiva() === "pelea") {
    capas.navegar("select", { reemplazar: true });
  }
}

cargarDatos()
  .then(() => {
    pintarPersonajes();
    init();
  })
  .catch((err) => {
    $("barra-texto").textContent = "Error cargando datos: " + err.message;
  });