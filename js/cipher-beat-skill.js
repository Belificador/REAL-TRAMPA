export const ROSTER = Object.freeze({
  neutro: Object.freeze({ id: "neutro", name: "NEUTRO", hp: 120, maxHp: 120, critChance: 0.1, defenseBonus: 0.4 }),
  lilsupa: Object.freeze({ id: "lilsupa", name: "Lil Supa", hp: 100, maxHp: 100, critChance: 0.25, defenseBonus: 0.2 }),
  akapellah: Object.freeze({ id: "akapellah", name: "AKAPELLAH", hp: 90, maxHp: 90, critChance: 0.4, defenseBonus: 0.15 }),
});

export const BOSS = Object.freeze({
  name: "Canserbero",
  hpTotal: 200,
  hpFase: 100,
  fase1: "Normal",
  fase2: "Monstruo Lírico",
});

export const PORCENTAJES = Object.freeze({
  ataqueBoss: 25,
  contraataqueJugador: 10,
  plagioJugador: 35,
  defensaJugador: 0,
  farmJugador: 20,
  farmAura: 25,
  auraAcierto: 10,
  burstBoss: 75,
});

const LIMITES = {
  hpMax: 100,
  auraMax: 100,
  danioTotalMax: 200,
  rachaMax: 50,
  rachaMin: 0,
};

function numeroClamp(valor, min, max) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return min;
  return Math.max(min, Math.min(max, valor));
}

function normalizarEstado(estado) {
  estado.hpJugador = Math.round(numeroClamp(estado.hpJugador, 0, LIMITES.hpMax));
  estado.aura = Math.round(numeroClamp(estado.aura, 0, LIMITES.auraMax));
  estado.danioTotalBoss = Math.round(numeroClamp(estado.danioTotalBoss, 0, LIMITES.danioTotalMax));
  estado.racha = Math.round(numeroClamp(estado.racha, LIMITES.rachaMin, LIMITES.rachaMax));

  const faseSolicitada = estado.fase === 2 ? 2 : 1;
  estado.fase = faseSolicitada === 2 && estado.danioTotalBoss < BOSS.hpFase ? 1 : faseSolicitada;

  const danioLocal =
    estado.fase === 2 ? Math.max(0, estado.danioTotalBoss - BOSS.hpFase) : estado.danioTotalBoss;
  estado.hpBoss = Math.max(0, BOSS.hpFase - danioLocal);

  if (estado.hpJugador <= 0) {
    estado.ganador = "boss";
    estado.termino = true;
  } else if (estado.fase === 2 && estado.hpBoss <= 0) {
    estado.ganador = "jugador";
    estado.termino = true;
  } else {
    estado.ganador = null;
    estado.termino = false;
  }
  return estado;
}

export function iniciarPartida(rosterId) {
  return {
    rosterId,
    nombreJugador: rosterId && ROSTER[rosterId] ? ROSTER[rosterId].name : "MC",
    fase: 1,
    hpJugador: 100,
    hpBoss: BOSS.hpFase,
    aura: 0,
    racha: 0,
    danioTotalBoss: 0,
    ganador: null,
    termino: false,
  };
}

function clonar(estado) {
  return { ...estado };
}

function aplicarDanioJugador(estado, cantidad) {
  estado.hpJugador = Math.max(0, estado.hpJugador - cantidad);
  if (estado.hpJugador <= 0) {
    estado.ganador = "boss";
    estado.termino = true;
  }
}

function aplicarDanioBoss(estado, cantidad) {
  const aplicado = Math.min(cantidad, estado.hpBoss, 200 - estado.danioTotalBoss);
  estado.hpBoss = Math.max(0, estado.hpBoss - aplicado);
  estado.danioTotalBoss += aplicado;
  return aplicado;
}

function revisarFase(estado) {
  if (estado.hpBoss > 0) return null;
  if (estado.fase === 1) {
    estado.fase = 2;
    estado.hpBoss = BOSS.hpFase;
    return { faseCambio: true, nuevaFase: 2 };
  }
  estado.ganador = "jugador";
  estado.termino = true;
  return { faseCambio: false, nuevaFase: 2 };
}

export function resolverAccion(estadoActual, tipo, opciones = {}) {
  const estado = normalizarEstado(clonar(estadoActual));
  const resultado = { tipo };

  if (estado.termino) {
    resultado.inactivo = true;
    return { estado, resultado };
  }

  if (!["atacar", "defender", "farmear", "burst"].includes(tipo)) {
    resultado.invalido = true;
    return { estado, resultado };
  }

  if (tipo === "atacar") {
    if (opciones.correcto === true) {
      estado.racha += 1;
      const aplicado = aplicarDanioBoss(estado, PORCENTAJES.ataqueBoss);
      resultado.danioBoss = aplicado;
      aplicarDanioJugador(estado, PORCENTAJES.contraataqueJugador);
      resultado.danioJugador = PORCENTAJES.contraataqueJugador;
      estado.aura = Math.min(100, estado.aura + PORCENTAJES.auraAcierto);
      resultado.auraNueva = estado.aura;
      resultado.rachaNueva = estado.racha;
    } else {
      estado.racha = 0;
      estado.aura = 0;
      resultado.plagio = true;
      aplicarDanioJugador(estado, PORCENTAJES.plagioJugador);
      resultado.danioJugador = PORCENTAJES.plagioJugador;
      resultado.auraNueva = 0;
      resultado.rachaNueva = 0;
    }
  } else if (tipo === "defender") {
    aplicarDanioJugador(estado, PORCENTAJES.defensaJugador);
    resultado.danioJugador = PORCENTAJES.defensaJugador;
  } else if (tipo === "farmear") {
    estado.aura = Math.min(100, estado.aura + PORCENTAJES.farmAura);
    resultado.auraNueva = estado.aura;
    aplicarDanioJugador(estado, PORCENTAJES.farmJugador);
    resultado.danioJugador = PORCENTAJES.farmJugador;
  } else if (tipo === "burst") {
    if (estado.aura < 100) {
      resultado.invalido = true;
      return { estado, resultado };
    }
    estado.aura = 0;
    resultado.auraNueva = 0;
    const aplicado = aplicarDanioBoss(estado, PORCENTAJES.burstBoss);
    resultado.danioBoss = aplicado;
  }

  if (estado.ganador === "boss") {
    resultado.derrota = true;
    return { estado, resultado };
  }

  const fase = revisarFase(estado);
  if (fase) {
    resultado.faseCambio = fase.faseCambio;
    resultado.nuevaFase = fase.nuevaFase;
  }
  if (estado.ganador === "jugador") {
    resultado.victoria = true;
  }

  return { estado, resultado };
}