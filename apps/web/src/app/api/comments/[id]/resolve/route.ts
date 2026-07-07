import { anyUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { roleFor, canEdit } from '@/lib/perm'
import { json, uid, now } from '@/lib/util'

/** 解决/重开评论；可附带回复（agent 处理完反馈时用） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录' }, 401)

  const { id } = await ctx.params
  const db = await getDb()
  const comment = await db
    .prepare('SELECT * FROM comments WHERE id = ? AND parent_id IS NULL')
    .bind(id)
    .first<Record<string, string>>()
  if (!comment) return json({ error: '评论不存在' }, 404)

  // 解决/重开：创建者、可编辑协作者、或评论作者本人
  const page = await db
    .prepare('SELECT id, owner_id FROM pages WHERE id = ?')
    .bind(comment.page_id)
    .first<{ id: string; owner_id: string }>()
  if (!page) return json({ error: '页面不存在' }, 404)
  const role = await roleFor(page.id, page.owner_id, user)
  if (!canEdit(role) && comment.author_id !== user.id) {
    return json({ error: '只有创建者、可编辑协作者或评论作者可以解决评论' }, 403)
  }

  const b = await req.json().catch(() => ({}))
  const status = comment.status === 'open' ? 'resolved' : 'open'
  await db.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(status, id).run()

  if (b?.reply?.trim()) {
    await db
      .prepare(
        `INSERT INTO comments (id, page_id, version_id, cc_id, element_tag, element_snippet, body, author_id, author_name, parent_id, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        uid(10), comment.page_id, comment.version_id, null, '', '',
        String(b.reply).trim().slice(0, 2000), user.id, user.name, id, 'open', now()
      )
      .run()
  }

  return json({ id, status })
}
