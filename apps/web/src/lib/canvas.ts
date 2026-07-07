import { getDb, type D1Database } from './db'
import { uid, now } from './util'

export interface CanvasObject {
  id: string
  canvas_id: string
  type: 'note' | 'intent'
  x: number
  y: number
  w: number
  h: number
  anchor: string | null
  content: string
  status: string
  claimed_by: string | null
  claimed_name: string | null
  claimed_at: string | null
  resolved_version_id: string | null
  created_by: string
  created_name: string
  updated_at: string
  deleted: number
  seq: number
}

const CLAIM_TIMEOUT_MS = 30 * 60 * 1000

/** 1 页面 = 1 画布，懒创建 */
export async function ensureCanvas(db: D1Database, pageId: string): Promise<{ id: string }> {
  const existing = await db.prepare('SELECT id FROM canvases WHERE page_id = ?').bind(pageId).first<{ id: string }>()
  if (existing) return existing
  const id = uid(10)
  await db.prepare('INSERT INTO canvases (id, page_id, created_at) VALUES (?,?,?)').bind(id, pageId, now()).run()
  return { id }
}

export async function nextSeq(db: D1Database, canvasId: string): Promise<number> {
  const row = await db
    .prepare('SELECT MAX(seq) AS m FROM canvas_objects WHERE canvas_id = ?')
    .bind(canvasId)
    .first<{ m: number | null }>()
  return (row?.m ?? 0) + 1
}

/** 认领超时回落 open（读取时惰性清扫） */
export async function sweepClaims(db: D1Database, canvasId: string): Promise<void> {
  const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString()
  await db
    .prepare(
      `UPDATE canvas_objects SET status='open', claimed_by=NULL, claimed_name=NULL, claimed_at=NULL,
       seq = seq, updated_at = updated_at
       WHERE canvas_id = ? AND status='claimed' AND claimed_at < ?`
    )
    .bind(canvasId, cutoff)
    .run()
}

export async function getObjects(db: D1Database, canvasId: string, sinceSeq = 0): Promise<CanvasObject[]> {
  const { results } = await db
    .prepare('SELECT * FROM canvas_objects WHERE canvas_id = ? AND seq > ? ORDER BY seq ASC')
    .bind(canvasId, sinceSeq)
    .all<CanvasObject>()
  return results
}

export async function canvasForSlug(slug: string) {
  const db = await getDb()
  const page = await db
    .prepare('SELECT id, slug, title, owner_id FROM pages WHERE slug = ?')
    .bind(slug)
    .first<{ id: string; slug: string; title: string; owner_id: string }>()
  if (!page) return null
  const canvas = await ensureCanvas(db, page.id)
  return { db, page, canvas }
}

/** presence 心跳（写入即清扫过期行） */
export async function heartbeat(
  db: D1Database,
  canvasId: string,
  user: { id: string; name: string },
  x: number,
  y: number,
  color: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO presence (canvas_id, user_id, name, color, x, y, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(canvas_id, user_id) DO UPDATE SET x=excluded.x, y=excluded.y, name=excluded.name, updated_at=excluded.updated_at`
    )
    .bind(canvasId, user.id, user.name, color, x, y, now())
    .run()
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  await db.prepare('DELETE FROM presence WHERE canvas_id = ? AND updated_at < ?').bind(canvasId, cutoff).run()
}

export async function livePresence(db: D1Database, canvasId: string) {
  const cutoff = new Date(Date.now() - 10_000).toISOString()
  const { results } = await db
    .prepare('SELECT user_id, name, color, x, y FROM presence WHERE canvas_id = ? AND updated_at >= ?')
    .bind(canvasId, cutoff)
    .all()
  return results
}
