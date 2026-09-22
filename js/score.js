const CLAVE_SCORE = "cipherbeat_score";
const MAX_NOMBRE = 20;
const MAX_PUNTOS = 9999999;

const CARACTERES_PELIGROSOS = /[&<>"'<>=`]/g;
const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029]/g;
const MAPA_HTML = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function sanitizarTexto(texto) {
  return String(texto ?? "")
    .replace(CONTROL, "")
    .replace(CARACTERES_PELIGROSOS, (c) => MAPA_HTML[c] || c);
}

export function sanitizarNombre(texto) {
  const limpio = sanitizarTexto(texto).trim().slice(0, MAX_NOMBRE);
  return limpio || "";
}

function puntosValidados(valor) {
  const num = Math.round(Number(valor));
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(MAX_PUNTOS, num);
}

export const PUNTOS = {
  ataque: 1000,
  farm: 300,
  defender: 200,
  burst: 3000,
  plagio: -2000,
  victoriaBase: 10000,
  victoriaHp: 1000,
  derrotaHp: 30,
};

export function calcularPuntos(estado, acciones) {
  let puntos = 0;
  let racha = 0;
  for (const accion of acciones) {
    if (accion === "ataque_ok") {
      racha += 1;
      const multiplicador = Math.min(5, 1 + 0.5 * (racha - 1));
      puntos += PUNTOS.ataque * multiplicador;
    } else if (accion === "farm") {
      puntos += PUNTOS.farm;
    } else if (accion === "defender") {
      puntos += PUNTOS.defender;
    } else if (accion === "burst") {
      puntos += PUNTOS.burst;
    } else if (accion === "plagio") {
      puntos += PUNTOS.plagio;
      racha = 0;
    }
  }
  return puntos;
}

export function bonusFinal(estado) {
  if (estado.ganador === "jugador") {
    return PUNTOS.victoriaBase + Math.round(estado.hpJugador) * PUNTOS.victoriaHp;
  }
  const bossPerdido = 200 - estado.danioTotalBoss;
  return Math.max(0, Math.round(bossPerdido)) * PUNTOS.derrotaHp;
}

export function registrarScore(nombre, puntos) {
  const lista = leerScores();
  lista.push({
    nombre: sanitizarNombre(nombre) || "Anónimo",
    puntos: puntosValidados(puntos),
    fecha: new Date().toISOString(),
  });
  lista.sort((a, b) => b.puntos - a.puntos);
  const top = lista.slice(0, 10);
  try {
    localStorage.setItem(CLAVE_SCORE, JSON.stringify(top));
  } catch (_) {
    /* modo privado sin storage */
  }
  return top;
}

export function leerScores() {
  try {
    const raw = localStorage.getItem(CLAVE_SCORE);
    const lista = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(lista)) return [];
    const validos = [];
    for (const r of lista) {
      if (!r || typeof r !== "object") continue;
      const puntos = puntosValidados(r.puntos);
      const nombre = sanitizarNombre(r.nombre);
      if (!nombre && puntos === 0) continue;
      validos.push({
        nombre: nombre || "Anónimo",
        puntos,
        fecha: typeof r.fecha === "string" ? r.fecha : new Date().toISOString(),
      });
    }
    return validos;
  } catch (_) {
    return [];
  }
}

export function pintarTabla(tablaEl, lista) {
  const cuerpo = tablaEl.querySelector("tbody");
  cuerpo.innerHTML = "";
  if (!lista.length) {
    const fila = document.createElement("tr");
    const celda = document.createElement("td");
    celda.colSpan = 3;
    celda.textContent = "Aún no hay récords. ¡Sé el primero!";
    fila.appendChild(celda);
    cuerpo.appendChild(fila);
    return;
  }
  lista.forEach((r, i) => {
    const fila = document.createElement("tr");
    const c1 = document.createElement("td");
    c1.textContent = String(i + 1);
    const c2 = document.createElement("td");
    c2.textContent = sanitizarNombre(r.nombre) || "Anónimo";
    const c3 = document.createElement("td");
    c3.textContent = String(puntosValidados(r.puntos));
    fila.append(c1, c2, c3);
    cuerpo.appendChild(fila);
  });
}