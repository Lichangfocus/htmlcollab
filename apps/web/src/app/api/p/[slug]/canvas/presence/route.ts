import { anyUser } from '@/lib/auth'
import { canvasForSlug, heartbeat } from '@/lib/canvas'
import { json } from '@/lib/util'

const PALETTE = ['#4f46e5', '#0891b2', '#db2777', '#d97706', '#059669', '#7c3aed', '#dc2626']

/** 光标心跳：{x, y}（画布世界坐标） */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await anyUser(req)
  if (!user) return json({ ok: true }) // 匿名不参与 presence，静默成功

  const { slug } = await ctx.params
  const hit = await canvasForSlug(slug)
  if (!hit) return json({ error: '页面不存在' }, 404)

  const b = await req.json().catch(() => ({}))
  let hash = 0
  for (const c of user.id) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const color = PALETTE[Math.abs(hash) % PALETTE.length]

  await heartbeat(hit.db, hit.canvas.id, user, Number(b.x) || 0, Number(b.y) || 0, color)
  return json({ ok: true })
}
