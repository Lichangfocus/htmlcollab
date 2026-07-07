import { getCloudflareContext } from '@opennextjs/cloudflare'

// 最小 D1 类型（避免引入全局 workers-types 与 DOM 类型冲突）
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}
export interface D1Database {
  prepare(sql: string): D1Stmt
}

/** 取 D1 绑定：本地 next dev 由 initOpenNextCloudflareForDev 提供 miniflare 模拟，线上是真 D1 */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true })
  return (env as unknown as { DB: D1Database }).DB
}
