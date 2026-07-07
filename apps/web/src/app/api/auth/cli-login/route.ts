import { loginOrCreate } from '@/lib/auth'
import { json } from '@/lib/util'

/** CLI 登录：email + 用户名换 apiToken（免验证，与产品决策一致） */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = body?.email?.trim()
  const name = body?.name?.trim()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '请输入有效邮箱' }, 400)
  if (!name) return json({ error: '请输入用户名' }, 400)

  const user = await loginOrCreate(email, name)
  return json({ apiToken: user.api_token, email: user.email, name: user.name })
}
