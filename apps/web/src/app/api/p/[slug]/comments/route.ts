import { anyUser } from '@/lib/auth'
import { getDb, type D1Database } from '@/lib/db'
import { json, uid, now } from '@/lib/util'

async function getPage(db: D1Database, slug: string) {
  return db.prepare('SELECT id, slug, title FROM pages WHERE slug = ?').bind(slug).first<{
    id: string
    slug: string
    title: string
  }>()
}

/** 评论列表：附带 anchored 标记（锚点是否存在于指定版本） */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = await getDb()
  const page = await getPage(db, slug)
  if (!page) return json({ error: '页面不存在' }, 404)

  const url = new URL(req.url)
  const versionId = url.searchParams.get('version')
  const version = versionId
    ? await db.prepare('SELECT html FROM versions WHERE id = ? AND page_id = ?').bind(versionId, page.id).first<{ html: string }>()
    : await db.prepare('SELECT html FROM versions WHERE page_id = ? ORDER BY number DESC LIMIT 1').bind(page.id).first<{ html: string }>()
  if (!version) return json({ error: '版本不存在' }, 404)

  const { results: comments } = await db
    .prepare('SELECT id, cc_id, element_tag, element_snippet, body, author_id, author_name, parent_id, status, created_at FROM comments WHERE page_id = ? ORDER BY created_at ASC')
    .bind(page.id)
    .all()

  for (const c of comments) {
    if (!c.parent_id) c.anchored = !!c.cc_id && version.html.includes(`data-cc-id="${c.cc_id}"`)
  }
  return json({ comments })
}

/** 发评论 / 回复：需登录（cookie 或 bearer，agent 也可以回复） */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ error: '需要先登录才能评论' }, 401)

  const { slug } = await ctx.params
  const db = await getDb()
  const page = await getPage(db, slug)
  if (!page) return json({ error: '页面不存在' }, 404)

  const b = await req.json().catch(() => null)
  if (!b?.body?.trim()) return json({ error: '评论内容不能为空' }, 400)
  if (!b.parentId && !b.ccId) return json({ error: '顶层评论必须带 ccId 锚点' }, 400)
  if (b.parentId) {
    const parent = await db
      .prepare('SELECT id FROM comments WHERE id = ? AND page_id = ? AND parent_id IS NULL')
      .bind(b.parentId, page.id)
      .first()
    if (!parent) return json({ error: '被回复的评论不存在' }, 404)
  }

  const latest = await db
    .prepare('SELECT id FROM versions WHERE page_id = ? ORDER BY number DESC LIMIT 1')
    .bind(page.id)
    .first<{ id: string }>()
  if (!latest) return json({ error: '页面还没有任何版本' }, 400)

  const comment = {
    id: uid(10),
    page_id: page.id,
    version_id: latest.id,
    cc_id: b.ccId ?? null,
    element_tag: (b.elementTag ?? '').slice(0, 20),
    element_snippet: (b.elementSnippet ?? '').slice(0, 80),
    body: String(b.body).trim().slice(0, 2000),
    author_id: user.id,
    author_name: user.name,
    parent_id: b.parentId ?? null,
    status: 'open',
    created_at: now(),
  }
  await db
    .prepare(
      `INSERT INTO comments (id, page_id, version_id, cc_id, element_tag, element_snippet, body, author_id, author_name, parent_id, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(...Object.values(comment))
    .run()

  return json({ comment }, 201)
}
