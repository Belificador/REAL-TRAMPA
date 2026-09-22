"""Vercel Function: POST /api/highscores/limpiar

Vacía la tabla `highscores` usando el service role de Supabase.

Protegida: exige `Authorization: Bearer <SUPABASE_ADMIN_TOKEN>`.
Las claves se leen SOLO de las Environment Variables de Vercel:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - SUPABASE_ADMIN_TOKEN
"""
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

TABLA = "highscores"


def _token_bearer(cabeceras):
    auth = cabeceras.get("Authorization", "") or ""
    if not auth.startswith("Bearer "):
        return ""
    return auth[len("Bearer "):].strip()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        token_admin = os.environ.get("SUPABASE_ADMIN_TOKEN", "").strip()
        clave_serv = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        url_supabase = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")

        if not (token_admin and clave_serv and url_supabase):
            self._responder_json(503, {"error": "Supabase no configurado en Vercel"})
            return

        if _token_bearer(self.headers) != token_admin:
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
                conteo = respuesta.headers.get("Content-Range", "0").split("/")[-1]
                borrados = int(conteo) if conteo.isdigit() else 0
                self._responder_json(200, {"ok": True, "borrados": borrados})
        except urllib.error.HTTPError as err:
            self._responder_json(502, {"error": "Supabase: %s %s" % (err.code, err.reason)})
        except Exception as err:  # noqa: BLE001
            self._responder_json(500, {"error": str(err)})

    def do_GET(self):
        self._responder_json(405, {"error": "Método no permitido; usa POST"})

    def _responder_json(self, codigo, objeto):
        datos = json.dumps(objeto).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)

    def log_message(self, formato, *args):
        pass
