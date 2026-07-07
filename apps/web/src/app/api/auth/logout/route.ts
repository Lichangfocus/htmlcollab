import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { json } from '@/lib/util'

export async function POST() {
  const store = await cookies()
  const sid = store.get(SESSION_COOKIE)?.value
  if (sid) {
    const db = await getDb()
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(sid).run()
  }
  store.delete(SESSION_COOKIE)
  return json({ ok: true })
}
