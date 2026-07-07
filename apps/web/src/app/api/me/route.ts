import { currentUser } from '@/lib/auth'
import { json } from '@/lib/util'

export async function GET() {
  const user = await currentUser()
  return json({ user: user ? { id: user.id, email: user.email, name: user.name, apiToken: user.api_token } : null })
}
