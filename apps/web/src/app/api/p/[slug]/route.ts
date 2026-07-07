import { currentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { json } from '@/lib/util'

/** 删除页面（owner 专属，dashboard 管理动作） */
export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await currentUser()
  if (!user) return json({ error: '未登录' }, 401)

  const { slug } = await ctx.params
  const db = await getDb()
  const page = await db.prepare('SELECT id, owner_id FROM pages WHERE slug = ?').bind(slug).first<{
    id: string
    owner_id: string
  }>()
  if (!page) return json({ error: '页面不存在' }, 404)
  if (page.owner_id !== user.id) return json({ error: '无权限' }, 403)

  await db.prepare('DELETE FROM comments WHERE page_id = ?').bind(page.id).run()
  await db.prepare('DELETE FROM versions WHERE page_id = ?').bind(page.id).run()
  await db.prepare('DELETE FROM collaborators WHERE page_id = ?').bind(page.id).run()
  await db.prepare('DELETE FROM pages WHERE id = ?').bind(page.id).run()
  return json({ ok: true })
}
