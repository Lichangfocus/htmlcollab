import { currentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { json } from '@/lib/util'

/** dashboard：我发布的所有页面 */
export async function GET() {
  const user = await currentUser()
  if (!user) return json({ error: '未登录' }, 401)

  const db = await getDb()
  const fields = `p.id, p.slug, p.title, p.created_at,
        (SELECT MAX(number) FROM versions v WHERE v.page_id = p.id AND v.kind = 'mainline') AS latest_version,
        (SELECT COUNT(*) FROM comments c WHERE c.page_id = p.id AND c.parent_id IS NULL AND c.status = 'open') AS open_comments,
        (SELECT COUNT(*) FROM comments c WHERE c.page_id = p.id AND c.parent_id IS NULL) AS total_comments`

  const { results: pages } = await db
    .prepare(`SELECT ${fields} FROM pages p WHERE p.owner_id = ? ORDER BY p.created_at DESC`)
    .bind(user.id)
    .all()

  // 与我协作的页面：被加为协作者的 + 我评论过的（去重，排除自己拥有的）
  const { results: shared } = await db
    .prepare(
      `SELECT ${fields},
        COALESCE((SELECT role FROM collaborators cl WHERE cl.page_id = p.id AND cl.user_id = ?1), 'commenter') AS my_role
       FROM pages p
       WHERE p.owner_id != ?1 AND p.id IN (
         SELECT page_id FROM collaborators WHERE user_id = ?1
         UNION
         SELECT page_id FROM comments WHERE author_id = ?1
       )
       ORDER BY p.created_at DESC`
    )
    .bind(user.id)
    .all()

  return json({ pages, shared })
}
