import { currentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { json } from '@/lib/util'

/** dashboard：我发布的所有页面 */
export async function GET() {
  const user = await currentUser()
  if (!user) return json({ error: '未登录' }, 401)

  const db = await getDb()
  const { results: pages } = await db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.created_at,
        (SELECT MAX(number) FROM versions v WHERE v.page_id = p.id) AS latest_version,
        (SELECT COUNT(*) FROM comments c WHERE c.page_id = p.id AND c.parent_id IS NULL AND c.status = 'open') AS open_comments,
        (SELECT COUNT(*) FROM comments c WHERE c.page_id = p.id AND c.parent_id IS NULL) AS total_comments
       FROM pages p WHERE p.owner_id = ? ORDER BY p.created_at DESC`
    )
    .bind(user.id)
    .all()

  return json({ pages })
}
