import { getDb } from '@/lib/db'

/** 最新版本的源码（含锚点、不含 overlay）——协作者的 agent 用它获取当前 HTML 再修改 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = await getDb()
  const page = await db.prepare('SELECT id FROM pages WHERE slug = ?').bind(slug).first<{ id: string }>()
  if (!page) return new Response('not found', { status: 404 })

  const v = await db
    .prepare("SELECT id, html FROM versions WHERE page_id = ? AND kind = 'mainline' ORDER BY number DESC LIMIT 1")
    .bind(page.id)
    .first<{ id: string; html: string }>()
  if (!v) return new Response('not found', { status: 404 })

  return new Response(v.html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Version-Id': v.id },
  })
}
