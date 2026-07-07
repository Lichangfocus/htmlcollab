import { cookies } from 'next/headers'
import { loginOrCreate, createSession, SESSION_COOKIE } from '@/lib/auth'
import { json } from '@/lib/util'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email?.trim()
  const name = body?.name?.trim()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '请输入有效邮箱' }, 400)
  if (!name) return json({ error: '请输入用户名' }, 400)

  const user = await loginOrCreate(email, name)
  const sid = await createSession(user.id)
  const store = await cookies()
  store.set(SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 })
  return json({ user: { id: user.id, email: user.email, name: user.name } })
}
