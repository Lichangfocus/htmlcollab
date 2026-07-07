import { currentUser, loginOrCreate } from '@/lib/auth'
import { getDb, type D1Database } from '@/lib/db'
import { json, now } from '@/lib/util'

async function pageAndOwnerCheck(db: D1Database, slug: string, userId: string) {
  const page = await db
    .prepare('SELECT id, owner_id FROM pages WHERE slug = ?')
    .bind(slug)
    .first<{ id: string; owner_id: string }>()
  if (!page) return { error: json({ error: '页面不存在' }, 404) }
  if (page.owner_id !== userId) return { error: json({ error: '只有创建者可以管理协作者' }, 403) }
  return { page }
}

/** 协作者列表（owner 专属） */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await currentUser()
  if (!user) return json({ error: '未登录' }, 401)
  const { slug } = await ctx.params
  const db = await getDb()
  const { page, error } = await pageAndOwnerCheck(db, slug, user.id)
  if (error) return error

  const { results: collaborators } = await db
    .prepare(
      `SELECT c.user_id, c.role, c.created_at, u.email, u.name
       FROM collaborators c JOIN users u ON u.id = c.user_id
       WHERE c.page_id = ? ORDER BY c.created_at ASC`
    )
    .bind(page!.id)
    .all()
  return json({ collaborators })
}

/** 添加/更新协作者：{email, role: 'commenter'|'editor'}；用户不存在时按邮箱自动建档 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await currentUser()
  if (!user) return json({ error: '未登录' }, 401)
  const { slug } = await ctx.params
  const db = await getDb()
  const { page, error } = await pageAndOwnerCheck(db, slug, user.id)
  if (error) return error

  const b = await req.json().catch(() => null)
  const email = b?.email?.trim()?.toLowerCase()
  const role = b?.role
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '请输入有效邮箱' }, 400)
  if (!['commenter', 'editor'].includes(role)) return json({ error: 'role 必须是 commenter 或 editor' }, 400)

  const target = await loginOrCreate(email, b?.name ?? '')
  if (target.id === user.id) return json({ error: '你已经是创建者了' }, 400)

  await db
    .prepare(
      `INSERT INTO collaborators (page_id, user_id, role, created_at) VALUES (?,?,?,?)
       ON CONFLICT(page_id, user_id) DO UPDATE SET role = excluded.role`
    )
    .bind(page!.id, target.id, role, now())
    .run()

  return json({ ok: true, user: { id: target.id, email: target.email, name: target.name }, role })
}

/** 移除协作者：?user=<userId> */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await currentUser()
  if (!user) return json({ error: '未登录' }, 401)
  const { slug } = await ctx.params
  const db = await getDb()
  const { page, error } = await pageAndOwnerCheck(db, slug, user.id)
  if (error) return error

  const targetId = new URL(req.url).searchParams.get('user')
  if (!targetId) return json({ error: '缺少 user 参数' }, 400)
  await db.prepare('DELETE FROM collaborators WHERE page_id = ? AND user_id = ?').bind(page!.id, targetId).run()
  return json({ ok: true })
}
