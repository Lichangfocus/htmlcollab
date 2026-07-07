import { anyUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { roleFor } from '@/lib/perm'
import { json } from '@/lib/util'

/** 当前用户在该页面的角色（viewer 用来决定显示哪些操作） */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = await getDb()
  const page = await db
    .prepare('SELECT id, owner_id FROM pages WHERE slug = ?')
    .bind(slug)
    .first<{ id: string; owner_id: string }>()
  if (!page) return json({ error: '页面不存在' }, 404)

  const user = await anyUser(req)
  return json({ role: await roleFor(page.id, page.owner_id, user) })
}
