import { anyUser } from '@/lib/auth'
import { json } from '@/lib/util'

/** cookie 或 bearer 均可——CLI `auth` 命令用 bearer 验证 token 有效性 */
export async function GET(req: Request) {
  const user = await anyUser(req)
  return json({ user: user ? { id: user.id, email: user.email, name: user.name, apiToken: user.api_token } : null })
}
