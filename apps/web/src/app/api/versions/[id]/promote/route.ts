import { anyUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { roleFor, canEdit } from '@/lib/perm'
import { json, uid, now } from '@/lib/util'

/** 变体转正：复制 html 成为新的主线版本 v(n+1) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录' }, 401)

  const { id } = await ctx.params
  const db = await getDb()
  const v = await db
    .prepare('SELECT * FROM versions WHERE id = ?')
    .bind(id)
    .first<{ id: string; page_id: string; html: string; kind: string; number: number }>()
  if (!v) return json({ error: '版本不存在' }, 404)
  if (v.kind !== 'variant') return json({ error: '只有变体可以转正' }, 400)

  const page = await db
    .prepare('SELECT id, owner_id FROM pages WHERE id = ?')
    .bind(v.page_id)
    .first<{ id: string; owner_id: string }>()
  if (!page) return json({ error: '页面不存在' }, 404)
  if (!canEdit(await roleFor(page.id, page.owner_id, user))) return json({ error: '无编辑权限' }, 403)

  const last = await db
    .prepare('SELECT MAX(number) AS n FROM versions WHERE page_id = ?')
    .bind(page.id)
    .first<{ n: number | null }>()
  const number = (last?.n ?? 0) + 1
  const newId = uid(10)
  await db
    .prepare(
      "INSERT INTO versions (id, page_id, number, html, notes, created_at, base_version_id, kind, pushed_by_name) VALUES (?,?,?,?,?,?,?, 'mainline', ?)"
    )
    .bind(newId, page.id, number, v.html, `从变体 v${v.number} 转正`, now(), v.id, user.name)
    .run()

  return json({ versionId: newId, number })
}
