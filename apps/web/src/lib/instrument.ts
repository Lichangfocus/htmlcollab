import { parse, serialize } from 'parse5'
import { uid } from './util'

// 可评论元素白名单：块级 + 媒体 + 交互控件，尽可能细粒度（“灵敏”的关键）。
// 内联文字标签（span/b/em…）不注入，评论会落到它们所在的段落上，可通过“选父级”扩大范围。
const TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'blockquote', 'pre', 'figure', 'figcaption',
  'img', 'video', 'audio', 'picture', 'svg', 'canvas', 'iframe',
  'a', 'button', 'input', 'textarea', 'select', 'label', 'form', 'fieldset',
  'ul', 'ol', 'li', 'dl', 'table',
  'section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'div',
  'details', 'summary',
])

// 这些容器内部不再注入（svg 子节点、脚本、模板等；svg 根本身允许注入）
const OPAQUE = new Set(['svg', 'script', 'style', 'template', 'noscript', 'head'])

export interface InstrumentResult {
  html: string
  title: string
  anchors: number
}

// parse5 节点的最小形状
interface P5Node {
  nodeName: string
  tagName?: string
  value?: string
  attrs?: { name: string; value: string }[]
  childNodes?: P5Node[]
}

/** 发布管线：为 HTML 注入稳定锚点 data-cc-id（已有的保留，这是评论跨版本存活的关键） */
export function instrument(rawHtml: string): InstrumentResult {
  const doc = parse(rawHtml) as unknown as P5Node
  let anchors = 0
  let title = ''

  const walk = (node: P5Node, inBody: boolean, inOpaque: boolean) => {
    const tag = node.tagName

    if (tag === 'title' && !title) {
      title = (node.childNodes ?? [])
        .map((c) => c.value ?? '')
        .join('')
        .trim()
    }

    if (tag && inBody && !inOpaque && TAGS.has(tag)) {
      node.attrs = node.attrs ?? []
      if (!node.attrs.some((a) => a.name === 'data-cc-id')) {
        node.attrs.push({ name: 'data-cc-id', value: `cc-${uid(6)}` })
      }
      anchors++
    }

    const childInBody = inBody || tag === 'body'
    const childOpaque = inOpaque || (!!tag && OPAQUE.has(tag))
    for (const child of node.childNodes ?? []) walk(child, childInBody, childOpaque)
  }

  walk(doc, false, false)

  return { html: serialize(doc as never), title, anchors }
}
