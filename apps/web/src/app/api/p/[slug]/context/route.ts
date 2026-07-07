import { getDb } from '@/lib/db'
import { buildContext, type CommentRow } from '@/lib/context'
import { ensureCanvas, getObjects } from '@/lib/canvas'
import { json } from '@/lib/util'

/** agent 回流出口：`htmlcollab pull` 调这里 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = await getDb()
  const page = await db
    .prepare('SELECT id, slug, title FROM pages WHERE slug = ?')
    .bind(slug)
    .first<{ id: string; slug: string; title: string }>()
  if (!page) return json({ error: '页面不存在' }, 404)

  const version = await db
    .prepare("SELECT id, number, html FROM versions WHERE page_id = ? AND kind = 'mainline' ORDER BY number DESC LIMIT 1")
    .bind(page.id)
    .first<{ id: string; number: number; html: string }>()
  if (!version) return json({ error: '页面还没有任何版本' }, 404)

  const { results } = await db
    .prepare('SELECT id, cc_id, element_tag, element_snippet, body, author_name, parent_id, status, created_at FROM comments WHERE page_id = ? ORDER BY created_at ASC')
    .bind(page.id)
    .all<CommentRow>()

  // 画布对象（意图卡 + 便签）一并回流
  const canvas = await ensureCanvas(db, page.id)
  const objects = (await getObjects(db, canvas.id)).filter((o) => !o.deleted)

  const url = new URL(req.url)
  const md = buildContext(page, version, results, url.origin, objects)

  if (url.searchParams.get('format') === 'json') {
    return json({ page: { slug: page.slug, title: page.title }, version: version.number, markdown: md })
  }
  return new Response(md, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
