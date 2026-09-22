/**
 * Config de Supabase para el despliegue ESTÁTICO (Vercel/GitHub Pages).
 *
 * SUPABASE_URL y la anon key son PÚBLICAS POR DISEÑO: viajan al navegador en
 * cualquier integración de Supabase (la anon key solo permite RLS seguras).
 * No son secretos. Por eso se pueden commitear sin riesgo.
 *
 * Los secretos reales (service role key + admin token) viven SOLO en .env
 * (local) o en las env vars de Vercel para la función serverless
 * api/highscores/limpiar.py. Nunca en este archivo.
 */
window.__SUPABASE__ = {
  url: "https://fzyylciflwwiaslfljcc.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6eXlsY2lmbHd3aWFzbGZsamNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMTMwOTUsImV4cCI6MjEwNTY4OTA5NX0.2gNkoNXRfHXuaCQnkhCHUIEjta2CBln2xpPgju0Kkis",
};
