import { canvasForSlug, getObjects, livePresence } from '@/lib/canvas'
import { json } from '@/lib/util'

/** 增量同步：?since=<seq>。返回该 seq 之后的对象变更（含软删）+ presence + 版本列表 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const hit = await canvasForSlug(slug)
  if (!hit) return json({ error: '页面不存在' }, 404)
  const { db, page, canvas } = hit

  const since = parseInt(new URL(req.url).searchParams.get('since') ?? '0', 10) || 0
  const changed = await getObjects(db, canvas.id, since)
  const { results: versions } = await db
    .prepare('SELECT id, number, kind, base_version_id, pushed_by_name, created_at FROM versions WHERE page_id = ? ORDER BY number ASC')
    .bind(page.id)
    .all()

  const maxSeq = changed.reduce((m, o) => Math.max(m, o.seq), since)
  return json({ changed, versions, presence: await livePresence(db, canvas.id), maxSeq })
}
