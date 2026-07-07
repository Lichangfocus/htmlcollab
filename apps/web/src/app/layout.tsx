import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'htmlcollab — HTML 在线协作',
  description: 'agent 生成的 HTML，一条命令在线化，元素级评论回流为 agent 上下文',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
