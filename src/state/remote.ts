import { sanitizeDoc } from '../domain/sync'
import type { SyncDoc } from '../domain/sync'

/**
 * Accès au projet Supabase de l'équipe, par deux fonctions SQL seulement
 * (voir supabase/schema.sql). La table n'est pas lisible directement : il faut
 * connaître le code d'équipe. Seule la clé publique figure ici.
 */

const BASE = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')

// https obligatoire, sauf pour un serveur de test local.
export const syncAvailable = /^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(BASE) && KEY.length > 20

async function rpc(name: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: KEY }
  // Les anciennes clés « anon » sont des JWT et s'envoient aussi en Bearer.
  if (KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export interface RemoteTeam {
  doc: SyncDoc
  version: number
}

export async function fetchTeam(code: string): Promise<RemoteTeam | null> {
  const raw = await rpc('get_team', { p_code: code })
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as { doc?: unknown; version?: unknown }
  const doc = sanitizeDoc(r.doc)
  const version = Number(r.version)
  if (!doc || !Number.isFinite(version)) return null
  return { doc, version }
}

/** Enregistre si la version n'a pas bougé entre-temps. `version` 0 = création. */
export async function saveTeam(code: string, doc: SyncDoc, version: number): Promise<number | null> {
  const raw = await rpc('save_team', { p_code: code, p_doc: doc, p_version: version })
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as { ok?: unknown; version?: unknown }
  return r.ok === true && Number.isFinite(Number(r.version)) ? Number(r.version) : null
}
