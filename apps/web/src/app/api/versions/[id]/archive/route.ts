import { anyUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { roleFor, canEdit } from '@/lib/perm'
import { json } from '@/lib/util'

/** 归档/恢复变体：archived 的变体不再出现在画布上（历史仍保留，可随时恢复） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录' }, 401)

  const { id } = await ctx.params
  const db = await getDb()
  const v = await db
    .prepare('SELECT id, page_id, kind FROM versions WHERE id = ?')
    .bind(id)
    .first<{ id: string; page_id: string; kind: string }>()
  if (!v) return json({ error: '版本不存在' }, 404)
  if (v.kind !== 'variant' && v.kind !== 'archived') return json({ error: '只有变体可以归档' }, 400)

  const page = await db
    .prepare('SELECT id, owner_id FROM pages WHERE id = ?')
    .bind(v.page_id)
    .first<{ id: string; owner_id: string }>()
  if (!page) return json({ error: '页面不存在' }, 404)
  if (!canEdit(await roleFor(page.id, page.owner_id, user))) return json({ error: '无编辑权限' }, 403)

  const kind = v.kind === 'variant' ? 'archived' : 'variant'
  await db.prepare('UPDATE versions SET kind = ? WHERE id = ?').bind(kind, id).run()
  return json({ id, kind })
}
