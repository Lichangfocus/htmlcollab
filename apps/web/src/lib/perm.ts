import { getDb } from './db'
import type { User } from './auth'

/**
 * 角色模型：
 * - owner     创建者：一切权限 + 管理协作者 + 删除页面
 * - editor    协作者（评论+编辑）：可评论、解决评论、push 新版本
 * - commenter 协作者（只能评论）：可评论/回复；拿到链接的登录用户默认即此角色
 * - anon      未登录：只读
 */
export type Role = 'owner' | 'editor' | 'commenter' | 'anon'

export async function roleFor(pageId: string, ownerId: string, user: User | null): Promise<Role> {
  if (!user) return 'anon'
  if (user.id === ownerId) return 'owner'
  const db = await getDb()
  const row = await db
    .prepare('SELECT role FROM collaborators WHERE page_id = ? AND user_id = ?')
    .bind(pageId, user.id)
    .first<{ role: string }>()
  if (row) return row.role as Role
  return 'commenter'
}

export const canEdit = (r: Role) => r === 'owner' || r === 'editor'
export const canComment = (r: Role) => r !== 'anon'
