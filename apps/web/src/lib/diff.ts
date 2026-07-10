import { parse } from 'parse5'

/**
 * 版本迭代元数据：按 data-cc-id 对比两个版本，产出"这次改了什么"。
 * 这是 agent 持续修改最重要的上下文之一（谁在什么时候改了哪里）。
 */

interface P5Node {
  nodeName: string
  tagName?: string
  value?: string
  attrs?: { name: string; value: string }[]
  childNodes?: P5Node[]
}

export interface ChangeItem { id: string; tag: string; text?: string; from?: string; to?: string }
export interface VersionChanges {
  added: ChangeItem[]
  removed: ChangeItem[]
  modified: ChangeItem[]
}

const CAP = 20
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80)

/**
 * 收集所有带 cc-id 的元素的 ownText：
 * 元素"自身负责"的文本 = 后代全文本，但遇到带 cc-id 的子树即截断（那部分归子锚点负责）。
 * 这样无锚点的内联标签（span/b/em）文本变化会记到最近的锚点祖先上，而带锚点的子级变化不连坐父级。
 */
function collect(html: string): Map<string, { tag: string; own: string; full: string }> {
  const doc = parse(html) as unknown as P5Node
  const map = new Map<string, { tag: string; own: string; full: string }>()
  const ownText = (node: P5Node): string => {
    if (node.nodeName === '#text') return node.value ?? ''
    if (node.attrs?.some((a) => a.name === 'data-cc-id')) return '' // 子锚点自己负责
    return (node.childNodes ?? []).map(ownText).join('')
  }
  // 完整可读文本（不截断子锚点）——只用于展示；own 缺字（如子锚点里的文字）会误导人和 agent
  const fullText = (node: P5Node): string => {
    if (node.nodeName === '#text') return node.value ?? ''
    return (node.childNodes ?? []).map(fullText).join('')
  }
  const walk = (node: P5Node) => {
    const ccId = node.attrs?.find((a) => a.name === 'data-cc-id')?.value
    if (ccId && node.tagName) {
      const own = (node.childNodes ?? []).map(ownText).join('')
      const full = (node.childNodes ?? []).map(fullText).join('')
      map.set(ccId, { tag: node.tagName, own: norm(own), full: norm(full) })
    }
    for (const c of node.childNodes ?? []) walk(c)
  }
  walk(doc)
  return map
}

export function computeChanges(oldHtml: string, newHtml: string): VersionChanges {
  const before = collect(oldHtml)
  const after = collect(newHtml)
  const changes: VersionChanges = { added: [], removed: [], modified: [] }

  for (const [id, b] of before) {
    const a = after.get(id)
    if (!a) {
      if (changes.removed.length < CAP) changes.removed.push({ id, tag: b.tag, text: b.full })
    } else if (a.own !== b.own && (a.own || b.own)) {
      if (changes.modified.length < CAP) changes.modified.push({ id, tag: a.tag, from: b.full, to: a.full })
    }
  }
  for (const [id, a] of after) {
    if (!before.has(id) && changes.added.length < CAP) changes.added.push({ id, tag: a.tag, text: a.full })
  }
  return changes
}

export function summarizeChanges(c: VersionChanges | null): string {
  if (!c) return ''
  const parts: string[] = []
  if (c.modified.length) parts.push(`修改 ${c.modified.length}`)
  if (c.added.length) parts.push(`新增 ${c.added.length}`)
  if (c.removed.length) parts.push(`删除 ${c.removed.length}`)
  return parts.join(' · ')
}
