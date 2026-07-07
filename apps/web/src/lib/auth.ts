import { cookies } from 'next/headers'
import { getDb } from './db'
import { uid, token, now } from './util'

export interface User {
  id: string
  email: string
  name: string
  api_token: string
}

export const SESSION_COOKIE = 'hc_sid'

/** email 登录（免验证）：存在则更新昵称，不存在则创建 */
export async function loginOrCreate(email: string, name: string): Promise<User> {
  const db = await getDb()
  const normalized = email.trim().toLowerCase()
  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(normalized).first<User>()
  if (existing) {
    if (name.trim() && name.trim() !== existing.name) {
      await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name.trim(), existing.id).run()
      existing.name = name.trim()
    }
    return existing
  }
  const user: User = {
    id: uid(10),
    email: normalized,
    name: name.trim() || normalized.split('@')[0],
    api_token: token(),
  }
  await db
    .prepare('INSERT INTO users (id, email, name, api_token, created_at) VALUES (?,?,?,?,?)')
    .bind(user.id, user.email, user.name, user.api_token, now())
    .run()
  return user
}

export async function createSession(userId: string): Promise<string> {
  const db = await getDb()
  const t = token()
  await db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').bind(t, userId, now()).run()
  return t
}

/** 网页端：cookie 会话 */
export async function currentUser(): Promise<User | null> {
  const store = await cookies()
  const sid = store.get(SESSION_COOKIE)?.value
  if (!sid) return null
  const db = await getDb()
  return db
    .prepare('SELECT u.id, u.email, u.name, u.api_token FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
    .bind(sid)
    .first<User>()
}

/** CLI / agent 端：Bearer token */
export async function bearerUser(req: Request): Promise<User | null> {
  const m = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/)
  if (!m) return null
  const db = await getDb()
  return db.prepare('SELECT id, email, name, api_token FROM users WHERE api_token = ?').bind(m[1]).first<User>()
}

/** 双通道：cookie 或 bearer 任一 */
export async function anyUser(req: Request): Promise<User | null> {
  return (await bearerUser(req)) ?? (await currentUser())
}
