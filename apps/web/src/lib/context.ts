import { fmtTime } from './util'

export interface CommentRow {
  id: string
  cc_id: string | null
  element_tag: string | null
  element_snippet: string | null
  body: string
  author_name: string
  parent_id: string | null
  status: string
  created_at: string
}

export interface PageMeta {
  slug: string
  title: string
}

export interface VersionMeta {
  number: number
  html: string
}

/**
 * 产品最核心的输出物：交给 agent 的反馈上下文 markdown。
 * 三个分区：待处理（锚点有效）/ 锚点失效（元素已被删）/ 已解决。
 */
export function buildContext(page: PageMeta, version: VersionMeta, comments: CommentRow[], baseUrl: string): string {
  const tops = comments.filter((c) => !c.parent_id)
  const replies = (id: string) => comments.filter((c) => c.parent_id === id)
  const anchored = (c: CommentRow) => !!c.cc_id && version.html.includes(`data-cc-id="${c.cc_id}"`)

  const open = tops.filter((c) => c.status === 'open' && anchored(c))
  const orphaned = tops.filter((c) => c.status === 'open' && !anchored(c))
  const resolved = tops.filter((c) => c.status === 'resolved')

  const thread = (c: CommentRow, i: number) => {
    const lines: string[] = []
    lines.push(`### ${i + 1}. \`<${c.element_tag || '?'} data-cc-id="${c.cc_id}">\``)
    if (c.element_snippet) lines.push(`> 元素内容片段: “${c.element_snippet}”`)
    lines.push(`- **${c.author_name}** (${fmtTime(c.created_at)}): ${c.body}`)
    for (const r of replies(c.id)) {
      lines.push(`  - **${r.author_name}** (${fmtTime(r.created_at)}): ${r.body}`)
    }
    return lines.join('\n')
  }

  const parts: string[] = [
    `# HTML 协作反馈上下文`,
    ``,
    `页面: ${page.title} · 版本: v${version.number} · 在线地址: ${baseUrl}/p/${page.slug}`,
    ``,
    `## 修改约定（给 agent 的指令）`,
    `1. 修改 HTML 时必须保留所有 \`data-cc-id\` 属性 —— 它们是评论的锚点，删除会导致反馈丢失定位。新增元素不需要自己加。`,
    `2. 逐条处理下方“待处理反馈”，可合并处理同一元素上的多条意见。`,
    `3. 处理完毕后运行 \`npx htmlcollab push\` 发布新版本，评审者会在同一链接看到 v${version.number + 1}。`,
    ``,
    `## 待处理反馈 (${open.length})`,
    ``,
    open.length ? open.map(thread).join('\n\n') : `（无）`,
  ]

  if (orphaned.length) {
    parts.push(
      ``,
      `## 锚点已失效的反馈 (${orphaned.length})`,
      `以下评论对应的元素在当前版本中已不存在，请结合内容判断是否仍需处理：`,
      ``,
      orphaned.map(thread).join('\n\n')
    )
  }

  if (resolved.length) {
    parts.push(``, `## 已解决 (${resolved.length})`, ``, resolved.map(thread).join('\n\n'))
  }

  return parts.join('\n')
}
