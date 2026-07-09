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
  id?: string
  number: number
  html: string
}

export interface IntentLike {
  id: string
  anchor: string | null
  content: string
  status: string
  claimed_name: string | null
  created_name: string
  created_at?: string
  resolved_version_id?: string | null
  type: string
}

export interface VersionHistoryRow {
  id: string
  number: number
  kind: string
  base_version_id: string | null
  pushed_by_name: string | null
  created_at: string
  notes: string | null
  changes: string | null
}

/**
 * 产品最核心的输出物：交给 agent 的反馈上下文 markdown。
 * 三个分区：待处理（锚点有效）/ 锚点失效（元素已被删）/ 已解决。
 */
const INTENT_LABELS: Record<string, string> = {
  copy: '改文案', style: '调样式', layout: '调布局', rewrite: '重写', remove: '删除', other: '其他',
}

export function buildContext(
  page: PageMeta,
  version: VersionMeta,
  comments: CommentRow[],
  baseUrl: string,
  canvasObjects: IntentLike[] = [],
  history: VersionHistoryRow[] = []
): string {
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
    `页面: ${page.title} · 版本: v${version.number}${version.id ? `（base: ${version.id}，push 时带 --base ${version.id} 可自动检测并行冲突）` : ''} · 在线地址: ${baseUrl}/p/${page.slug}`,
    ``,
    `## 修改约定（给 agent 的指令）`,
    `1. 修改 HTML 时必须保留所有 \`data-cc-id\` 属性 —— 它们是评论的锚点，删除会导致反馈丢失定位。新增元素不需要自己加。`,
    `2. 逐条处理下方“待处理反馈”，可合并处理同一元素上的多条意见。`,
    `3. 处理完毕后运行 \`npx htmlcollab-cli push\` 发布新版本，评审者会在同一链接看到 v${version.number + 1}。`,
    ``,
    `## 待处理反馈 (${open.length})`,
    ``,
    open.length ? open.map(thread).join('\n\n') : `（无）`,
  ]

  // ===== 版本历史（迭代元数据：谁在什么时候改了什么——续改前必读） =====
  if (history.length) {
    const intentsByVersion = new Map<string, IntentLike[]>()
    for (const o of canvasObjects) {
      if (o.type === 'intent' && o.resolved_version_id) {
        const list = intentsByVersion.get(o.resolved_version_id) ?? []
        list.push(o)
        intentsByVersion.set(o.resolved_version_id, list)
      }
    }
    const byId = new Map(history.map((h) => [h.id, h]))
    const recent = [...history].sort((a, b) => b.number - a.number).slice(0, 10)
    parts.push(``, `## 版本历史（每次迭代改了什么——这是持续修改的关键上下文）`, ``)
    recent.forEach((h, idx) => {
      let ch: { added: { id: string; tag: string; text?: string }[]; removed: { id: string; tag: string; text?: string }[]; modified: { id: string; tag: string; from?: string; to?: string }[] } | null = null
      try { ch = h.changes ? JSON.parse(h.changes) : null } catch { ch = null }
      const summary = ch
        ? [ch.modified.length && `修改 ${ch.modified.length}`, ch.added.length && `新增 ${ch.added.length}`, ch.removed.length && `删除 ${ch.removed.length}`].filter(Boolean).join(' · ') || '无结构变化'
        : h.number === 1 ? '（初始版本）' : '（无改动记录）'
      const baseRef = h.base_version_id ? byId.get(h.base_version_id) : null
      const head = `- **v${h.number}**${h.kind === 'variant' ? `（变体，基于 v${baseRef?.number ?? '?'}）` : ''} · ${h.pushed_by_name ?? '?'} · ${fmtTime(h.created_at)} · ${summary}${h.notes ? ` · 备注: ${h.notes}` : ''}`
      parts.push(head)
      // 最近 3 个版本给改动明细
      if (ch && idx < 3) {
        for (const m of ch.modified.slice(0, 8)) parts.push(`  - ~ \`<${m.tag} ${m.id}>\` “${m.from}” → “${m.to}”`)
        for (const a of ch.added.slice(0, 5)) parts.push(`  - + \`<${a.tag} ${a.id}>\` “${a.text}”`)
        for (const r of ch.removed.slice(0, 5)) parts.push(`  - − \`<${r.tag} ${r.id}>\` “${r.text}”`)
      }
      const solved = intentsByVersion.get(h.id) ?? []
      for (const s of solved.slice(0, 5)) {
        const c = JSON.parse(s.content || '{}')
        parts.push(`  - ✓ 解决意图: “${(c.text ?? '').slice(0, 60)}”（${s.created_name} 提出）`)
      }
    })
  }

  // 画布意图卡（结构化待办，处理后 push --resolves <id> 回流状态）
  const intents = canvasObjects.filter((o) => o.type === 'intent' && o.status !== 'resolved')
  if (intents.length) {
    parts.push(``, `## 待处理意图 (${intents.length})`, `处理后发布时用 \`--resolves <id>,<id>\` 关联解决，画布上会实时标记。`, ``)
    intents.forEach((it, i) => {
      const anchor = it.anchor ? JSON.parse(it.anchor) : null
      const content = JSON.parse(it.content || '{}')
      const label = INTENT_LABELS[content.intentType] ?? '意图'
      const lines: string[] = []
      lines.push(`### ${i + 1}. [${label}] ${anchor?.ccId ? `\`<${anchor.tag} data-cc-id="${anchor.ccId}">\`` : '（页面级）'} · id: ${it.id}`)
      if (anchor?.snippet) lines.push(`> 元素内容片段: “${anchor.snippet}”`)
      lines.push(`- 要求（${it.created_name}）: ${content.text ?? ''}`)
      if (it.status === 'claimed' && it.claimed_name) lines.push(`- 认领: ${it.claimed_name} 的 agent 处理中`)
      parts.push(lines.join('\n'), ``)
    })
  }

  // 画布便签 = 全局备注
  const notes = canvasObjects.filter((o) => o.type === 'note')
  if (notes.length) {
    parts.push(``, `## 画布备注 (${notes.length})`)
    for (const n of notes) {
      const content = JSON.parse(n.content || '{}')
      if (content.text?.trim()) parts.push(`- ${n.created_name}: ${content.text.trim().replace(/\s+/g, ' ')}`)
    }
  }

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
