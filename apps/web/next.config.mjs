import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// 本地 next dev 时提供 Cloudflare 绑定模拟（D1 → miniflare 本地 SQLite）
initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default nextConfig
