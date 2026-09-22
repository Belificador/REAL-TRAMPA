#!/usr/bin/env python3
"""Servidor local de REAL TRAMPA.

Sirve la app en http://127.0.0.1:5500 y resuelve las rutas de la SPA
(/lobby, /select, /pelea, /score, /ayuda) devolviendo index.html.

También inyecta la configuración de Supabase (GET /config.js) a partir de
las variables de entorno y expone un endpoint protegido para limpiar la
tabla highscores (POST /api/highscores/limpiar).
"""
import argparse
import json
import os
import sys
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

RAIZ = os.path.dirname(os.path.abspath(__file__))

RUTAS_SPA = {"lobby", "select", "pelea", "score", "ayuda"}

TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v",
    ".ogv": "video/ogg",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
}


def cargar_env():
    """Carga variables del archivo .env (sin dependencias externas)."""
    ruta = os.path.join(RAIZ, ".env")
    if not os.path.exists(ruta):
        return
    with open(ruta, "r", encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, _, valor = linea.partition("=")
            clave = clave.strip()
            valor = valor.strip().strip('"').strip("'")
            if clave:
                os.environ.setdefault(clave, valor)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in TIPOS:
            return TIPOS[ext]
        return super().guess_type(path)

    def _es_ruta_spa(self, ruta):
        limpia = ruta.strip("/")
        if not limpia:
            return True
        if "." in os.path.basename(limpia):
            return False
        return limpia in RUTAS_SPA

    def do_GET(self):
        ruta = unquote(urlparse(self.path).path)
        if ruta == "/config.js":
            self._servir_config()
            return
        if self._es_ruta_spa(ruta):
            self._servir_index()
            return
        super().do_GET()

    def do_HEAD(self):
        ruta = unquote(urlparse(self.path).path)
        if ruta == "/config.js":
            self._servir_config(solo_cabeceras=True)
            return
        if self._es_ruta_spa(ruta):
            self._servir_index(solo_cabeceras=True)
            return
        super().do_HEAD()

    def do_POST(self):
        ruta = unquote(urlparse(self.path).path)
        if ruta == "/api/highscores/limpiar":
            self._limpiar_highscores()
            return
        self.send_error(404, "Ruta no encontrada")

    def _servir_config(self, solo_cabeceras=False):
        """Inyecta la config de Supabase desde las variables de entorno."""
        url = os.environ.get("SUPABASE_URL", "").strip()
        anon = os.environ.get("SUPABASE_ANON_KEY", "").strip()
        cuerpo = "window.__SUPABASE__ = %s;" % json.dumps(
            {"url": url, "anonKey": anon}
        ).encode("utf-8").decode("utf-8")
        datos = cuerpo.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not solo_cabeceras:
            self.wfile.write(datos)

    def _responder_json(self, codigo, objeto):
        datos = json.dumps(objeto).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)

    def _limpiar_highscores(self):
        """Vacía la tabla highscores usando el service role de Supabase.

        Protegido: exige Authorization: Bearer <SUPABASE_ADMIN_TOKEN>.
        """
        token_admin = os.environ.get("SUPABASE_ADMIN_TOKEN", "").strip()
        clave_serv = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        url_supabase = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")

        if not token_admin or not clave_serv or not url_supabase:
            self._responder_json(503, {"error": "Supabase no configurado en el servidor"})
            return

        cabeceras = {k.lower(): v for k, v in self.headers.items()}
        auth = cabeceras.get("authorization", "")
        if auth != "Bearer %s" % token_admin:
            self._responder_json(403, {"error": "No autorizado"})
            return

        req = urllib.request.Request(
            url_supabase + "/rest/v1/highscores?id=gte.0",
            method="DELETE",
            headers={
                "apikey": clave_serv,
                "Authorization": "Bearer " + clave_serv,
                "Content-Type": "application/json",
                "Prefer": "count=exact",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as respuesta:
                borrados = int(respuesta.headers.get("Content-Range", "0").split("/")[-1] or 0)
                self._responder_json(200, {"ok": True, "borrados": borrados})
        except urllib.error.HTTPError as err:
            self._responder_json(502, {"error": "Supabase: %s %s" % (err.code, err.reason)})
        except Exception as err:  # noqa: BLE001
            self._responder_json(500, {"error": str(err)})

    def _servir_index(self, solo_cabeceras=False):
        archivo = os.path.join(RAIZ, "index.html")
        try:
            with open(archivo, "rb") as f:
                contenido = f.read()
        except OSError:
            self.send_error(404, "index.html no encontrado")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(contenido)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not solo_cabeceras:
            self.wfile.write(contenido)

    def log_message(self, formato, *args):
        sys.stderr.write("[servidor] %s\n" % (formato % args))


def main():
    cargar_env()
    parser = argparse.ArgumentParser(description="Servidor local de REAL TRAMPA")
    parser.add_argument("--host", default="127.0.0.1", help="Host (por defecto 127.0.0.1)")
    parser.add_argument("--port", type=int, default=5500, help="Puerto (por defecto 5500)")
    args = parser.parse_args()

    try:
        servidor = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as err:
        print("No se pudo iniciar el servidor en %s:%s -> %s" % (args.host, args.port, err))
        print("¿El puerto %s ya está en uso (Live Server de VS Code)? Deténlo e intenta de nuevo." % args.port)
        sys.exit(1)

    base = "http://%s:%s" % (args.host, args.port)
    print("REAL TRAMPA disponible en %s/lobby" % base)
    print("Rutas: /lobby /select /pelea /score /ayuda")
    print("Ctrl+C para detener el servidor.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
