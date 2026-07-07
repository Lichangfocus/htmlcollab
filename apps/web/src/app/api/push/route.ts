import { anyUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { instrument } from '@/lib/instrument'
import { roleFor, canEdit } from '@/lib/perm'
import { ensureCanvas, nextSeq } from '@/lib/canvas'
import { json, uid, now } from '@/lib/util'

const MAX_HTML = 5 * 1024 * 1024

interface PageRow { id: string; slug: string; title: string; owner_id: string }

/**
 * 发布入口（CLI / agent）：无 slug 创建新页面，有 slug 追加版本。
 * P1 升级：base != 最新主线 → 自动落为变体帧（不阻塞不覆盖）；resolves 关联解决意图卡。
 */
export async function POST(req: Request) {
  const user = await anyUser(req)
  if (!user) return json({ error: '未登录：先运行 npx htmlcollab-cli login' }, 401)

  const body = await req.json().catch(() => null)
  const html: string | undefined = body?.html
  if (!html?.trim()) return json({ error: 'html 必填' }, 400)
  if (html.length > MAX_HTML) return json({ error: 'HTML 超过 5MB 限制' }, 413)

  const db = await getDb()
  const result = instrument(html)

  let page = body.slug
    ? await db.prepare('SELECT * FROM pages WHERE slug = ?').bind(body.slug).first<PageRow>()
    : null

  if (body.slug && !page) return json({ error: `页面 ${body.slug} 不存在` }, 404)
  if (page && !canEdit(await roleFor(page.id, page.owner_id, user))) {
    return json({ error: '无编辑权限：请让页面创建者在「分享」里把你设为可编辑协作者' }, 403)
  }

  if (!page) {
    page = {
      id: uid(10),
      slug: uid(8),
      title: body.title?.trim() || result.title || '未命名页面',
      owner_id: user.id,
    }
    await db
      .prepare('INSERT INTO pages (id, slug, title, owner_id, created_at) VALUES (?,?,?,?,?)')
      .bind(page.id, page.slug, page.title, page.owner_id, now())
      .run()
  } else if (body.title?.trim()) {
    await db.prepare('UPDATE pages SET title = ? WHERE id = ?').bind(body.title.trim(), page.id).run()
    page.title = body.title.trim()
  }

  // 最新主线（变体不算 latest）
  const latestMainline = await db
    .prepare("SELECT id FROM versions WHERE page_id = ? AND kind = 'mainline' ORDER BY number DESC LIMIT 1")
    .bind(page.id)
    .first<{ id: string }>()
  const last = await db
    .prepare('SELECT MAX(number) AS n FROM versions WHERE page_id = ?')
    .bind(page.id)
    .first<{ n: number | null }>()

  // 并行 push 检测：声明的 base 不是最新主线 → 变体帧
  const base: string | null = body.base ?? latestMainline?.id ?? null
  const kind = latestMainline && body.base && body.base !== latestMainline.id ? 'variant' : 'mainline'

  const number = (last?.n ?? 0) + 1
  const versionId = uid(10)
  await db
    .prepare(
      'INSERT INTO versions (id, page_id, number, html, notes, created_at, base_version_id, kind, pushed_by_name) VALUES (?,?,?,?,?,?,?,?,?)'
    )
    .bind(versionId, page.id, number, result.html, body.notes ?? null, now(), base, kind, user.name)
    .run()

  // resolves：把意图卡标记为已解决并关联版本
  const resolves: string[] = Array.isArray(body.resolves) ? body.resolves.filter(Boolean) : []
  let resolved = 0
  if (resolves.length) {
    const canvas = await ensureCanvas(db, page.id)
    for (const objId of resolves) {
      const seq = await nextSeq(db, canvas.id)
      const r = await db
        .prepare(
          `UPDATE canvas_objects SET status='resolved', resolved_version_id=?, updated_at=?, seq=?
           WHERE id=? AND canvas_id=? AND type='intent'`
        )
        .bind(versionId, now(), seq, objId, canvas.id)
        .run() as { meta?: { changes?: number } }
      resolved += r?.meta?.changes ?? 0
    }
  }

  const origin = new URL(req.url).origin
  return json({
    slug: page.slug,
    title: page.title,
    version: number,
    versionId,
    kind,
    baseVersionId: base,
    resolved,
    anchors: result.anchors,
    url: `${origin}/p/${page.slug}`,
    // 关键：把 instrument 后的 HTML 还给 CLI 写回本地文件，锚点才能跨版本存活
    html: result.html,
  })
}
