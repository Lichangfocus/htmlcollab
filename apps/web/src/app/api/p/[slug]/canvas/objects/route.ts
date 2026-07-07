import { anyUser } from '@/lib/auth'
import { canvasForSlug, nextSeq } from '@/lib/canvas'
import { roleFor } from '@/lib/perm'
import { json, uid, now } from '@/lib/util'

const TYPES = new Set(['note', 'intent'])
const STATUSES = new Set(['open', 'claimed', 'resolved'])

/**
 * 对象 upsert（含软删、认领、解决）。粗粒度 LWW：以服务端 seq 为准。
 * body: {id?, type, x,y,w,h, anchor?, content?, status?, claim?, deleted?}
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录' }, 401)

  const { slug } = await ctx.params
  const hit = await canvasForSlug(slug)
  if (!hit) return json({ error: '页面不存在' }, 404)
  const { db, page, canvas } = hit

  const role = await roleFor(page.id, page.owner_id, user)
  if (role === 'anon') return json({ error: '需要先登录' }, 401)

  const b = await req.json().catch(() => null)
  if (!b) return json({ error: '参数错误' }, 400)

  const existing = b.id
    ? await db.prepare('SELECT * FROM canvas_objects WHERE id = ? AND canvas_id = ?').bind(b.id, canvas.id).first<Record<string, unknown>>()
    : null

  if (!existing && !TYPES.has(b.type)) return json({ error: 'type 必须是 note | intent' }, 400)

  const seq = await nextSeq(db, canvas.id)
  const ts = now()

  if (existing) {
    // 更新：位置/内容/状态/软删
    const status = b.claim === true
      ? 'claimed'
      : b.claim === false
        ? 'open'
        : STATUSES.has(b.status) ? b.status : (existing.status as string)
    const claimedBy = b.claim === true ? user.id : b.claim === false ? null : (existing.claimed_by as string | null)
    const claimedName = b.claim === true ? user.name : b.claim === false ? null : (existing.claimed_name as string | null)
    const claimedAt = b.claim === true ? ts : b.claim === false ? null : (existing.claimed_at as string | null)

    await db
      .prepare(
        `UPDATE canvas_objects SET
          x = ?, y = ?, w = ?, h = ?,
          anchor = ?, content = ?,
          status = ?, claimed_by = ?, claimed_name = ?, claimed_at = ?,
          resolved_version_id = ?,
          deleted = ?, updated_at = ?, seq = ?
         WHERE id = ?`
      )
      .bind(
        b.x ?? existing.x, b.y ?? existing.y, b.w ?? existing.w, b.h ?? existing.h,
        b.anchor !== undefined ? JSON.stringify(b.anchor) : existing.anchor,
        b.content !== undefined ? JSON.stringify(b.content) : existing.content,
        status,
        claimedBy, claimedName, claimedAt,
        status === 'resolved' ? (b.resolvedVersionId ?? existing.resolved_version_id) : null,
        b.deleted ? 1 : (existing.deleted as number),
        ts, seq, b.id
      )
      .run()
  } else {
    await db
      .prepare(
        `INSERT INTO canvas_objects
          (id, canvas_id, type, x, y, w, h, anchor, content, status, created_by, created_name, updated_at, deleted, seq)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`
      )
      .bind(
        b.id || uid(10), canvas.id, b.type,
        b.x ?? 0, b.y ?? 0, b.w ?? 0, b.h ?? 0,
        b.anchor ? JSON.stringify(b.anchor) : null,
        JSON.stringify(b.content ?? {}),
        'open', user.id, user.name, ts, seq
      )
      .run()
  }

  const id = b.id || undefined
  const row = await db
    .prepare('SELECT * FROM canvas_objects WHERE canvas_id = ? AND seq = ?')
    .bind(canvas.id, seq)
    .first()
  return json({ object: row, id })
}
