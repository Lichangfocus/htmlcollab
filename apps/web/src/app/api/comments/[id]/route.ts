import { anyUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { roleFor, canEdit } from '@/lib/perm'
import { json } from '@/lib/util'

interface CommentRow { id: string; page_id: string; author_id: string; parent_id: string | null }

async function load(id: string) {
  const db = await getDb()
  const comment = await db
    .prepare('SELECT id, page_id, author_id, parent_id FROM comments WHERE id = ?')
    .bind(id)
    .first<CommentRow>()
  if (!comment) return { error: json({ error: '评论不存在' }, 404) }
  const page = await db
    .prepare('SELECT id, owner_id FROM pages WHERE id = ?')
    .bind(comment.page_id)
    .first<{ id: string; owner_id: string }>()
  if (!page) return { error: json({ error: '页面不存在' }, 404) }
  return { db, comment, page }
}

/** 编辑自己的评论正文 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录' }, 401)
  const { id } = await ctx.params
  const { db, comment, error } = await load(id)
  if (error) return error
  if (comment!.author_id !== user.id) return json({ error: '只能编辑自己的评论' }, 403)

  const b = await req.json().catch(() => null)
  const body = b?.body?.trim()
  if (!body) return json({ error: '评论内容不能为空' }, 400)
  await db!.prepare('UPDATE comments SET body = ? WHERE id = ?').bind(String(body).slice(0, 2000), id).run()
  return json({ ok: true })
}

/** 删除评论：作者本人或可编辑权限；顶层评论级联删除回复 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录' }, 401)
  const { id } = await ctx.params
  const { db, comment, page, error } = await load(id)
  if (error) return error

  const role = await roleFor(page!.id, page!.owner_id, user)
  if (comment!.author_id !== user.id && !canEdit(role)) {
    return json({ error: '只有评论作者、创建者或可编辑协作者可以删除' }, 403)
  }
  if (!comment!.parent_id) {
    await db!.prepare('DELETE FROM comments WHERE parent_id = ?').bind(id).run()
  }
  await db!.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
  return json({ ok: true })
}
