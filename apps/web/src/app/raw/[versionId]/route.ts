import { getDb } from '@/lib/db'

/**
 * 原样吐出某个版本的 HTML，并注入 overlay SDK。
 * TODO(安全模型): 迁到独立子域 + 收紧 sandbox/CSP，隔离不可信 HTML。
 */
export async function GET(_req: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params
  const db = await getDb()
  const v = await db.prepare('SELECT html FROM versions WHERE id = ?').bind(versionId).first<{ html: string }>()
  if (!v) return new Response('not found', { status: 404 })

  const tag = '<script src="/overlay.js"></script>'
  const html = v.html.includes('</body>') ? v.html.replace('</body>', `${tag}</body>`) : v.html + tag

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
