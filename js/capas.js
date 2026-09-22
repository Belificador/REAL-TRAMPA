const RUTAS = {
  lobby: "#/lobby",
  select: "#/select",
  pelea: "#/pelea",
  score: "#/score",
  ayuda: "#/ayuda",
};

const CAPAS = Object.keys(RUTAS);

const PADRES = {
  select: "lobby",
  pelea: "select",
  score: "lobby",
  ayuda: "lobby",
};

let profundidad = 0;

export function getCapaActiva() {
  const activa = document.querySelector(".capa.activa");
  return activa ? activa.dataset.capa : null;
}

export function mostrarCapa(nombre) {
  const anterior = getCapaActiva();
  document.querySelectorAll(".capa").forEach((capa) => {
    const activa = capa.dataset.capa === nombre;
    capa.classList.toggle("activa", activa);
  });

  const btnAtras = document.getElementById("btn-atras");
  if (btnAtras) btnAtras.classList.toggle("oculto", nombre === "lobby" || nombre === "pelea");

  if (anterior !== nombre) {
    window.dispatchEvent(
      new CustomEvent("capa:cambio", { detail: { capa: nombre, anterior } })
    );
  }
}

export function capaDesdeRuta(path) {
  const limpia = String(path).replace(/^#\/?/, "").split("/").pop() || "lobby";
  return CAPAS.includes(limpia) ? limpia : "lobby";
}

export function navegar(capa, { reemplazar = false } = {}) {
  if (!CAPAS.includes(capa)) capa = "lobby";
  const url = RUTAS[capa];

  if (location.hash !== url) {
    if (reemplazar) {
      history.replaceState({ capa }, "", url);
    } else {
      history.pushState({ capa }, "", url);
      profundidad += 1;
    }
  }
  mostrarCapa(capa);
}

export function retroceder() {
  const actual = getCapaActiva();
  if (profundidad > 0) {
    history.back();
  } else if (PADRES[actual]) {
    navegar(PADRES[actual]);
  } else {
    navegar("lobby");
  }
}

export function initRouter() {
  if (!location.hash) history.replaceState({ capa: "lobby" }, "", RUTAS.lobby);
  mostrarCapa(capaDesdeRuta(location.hash));
  window.addEventListener("popstate", () => {
    profundidad = Math.max(0, profundidad - 1);
    mostrarCapa(capaDesdeRuta(location.hash));
  });
  window.addEventListener("hashchange", () => {
    mostrarCapa(capaDesdeRuta(location.hash));
  });
}

export function mostrarFinish() {
  document.getElementById("overlay-fin").classList.remove("oculto");
}

export function ocultarFinish() {
  document.getElementById("overlay-fin").classList.add("oculto");
  document.getElementById("fin-paso-nombre").classList.remove("oculto");
  document.getElementById("fin-paso-score").classList.add("oculto");
}
