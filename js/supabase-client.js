import { createClient } from "@supabase/supabase-js";

const TABLA = "highscores";

const config = window.__SUPABASE__ || null;

let cliente = null;

function getCliente() {
  if (!config || !config.url || !config.anonKey) return null;
  if (!cliente) {
    cliente = createClient(String(config.url), String(config.anonKey));
  }
  return cliente;
}

export function supabaseConfigurado() {
  return !!(config && config.url && config.anonKey);
}

export async function guardarScoreNube(playerName, score, createdAt) {
  const client = getCliente();
  if (!client) return null;
  const { data, error } = await client.from(TABLA).insert({
    player_name: String(playerName),
    score: Math.round(Number(score)),
    created_at: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
  });
  if (error) throw error;
  return data;
}

export async function listarScoresNube(limite = 10) {
  const client = getCliente();
  if (!client) return null;
  const { data, error } = await client
    .from(TABLA)
    .select("player_name, score, created_at")
    .order("score", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}