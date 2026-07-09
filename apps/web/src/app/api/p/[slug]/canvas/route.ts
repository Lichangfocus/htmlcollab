import { canvasForSlug, getObjects, sweepClaims, livePresence } from '@/lib/canvas'
import { json } from '@/lib/util'

/** 画布全量：对象 + 版本 + presence（进入页面时调一次） */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const hit = await canvasForSlug(slug)
  if (!hit) return json({ error: '页面不存在' }, 404)
  const { db, page, canvas } = hit

  await sweepClaims(db, canvas.id)
  const objects = (await getObjects(db, canvas.id)).filter((o) => !o.deleted)
  const { results: versions } = await db
    .prepare('SELECT id, number, kind, base_version_id, pushed_by_name, created_at, notes, changes FROM versions WHERE page_id = ? ORDER BY number ASC')
    .bind(page.id)
    .all()
  const maxSeq = objects.reduce((m, o) => Math.max(m, o.seq), 0)

  return json({
    canvasId: canvas.id,
    objects,
    versions,
    presence: await livePresence(db, canvas.id),
    maxSeq,
  })
}
