// htmlcollab demo server — 零依赖，node demo/server.mjs 即可运行
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4870
const DATA_DIR = path.join(__dirname, 'data')
const DB = path.join(DATA_DIR, 'comments.json')

fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(DB)) fs.writeFileSync(DB, '[]')

const load = () => JSON.parse(fs.readFileSync(DB, 'utf8'))
const save = (c) => fs.writeFileSync(DB, JSON.stringify(c, null, 2))
const file = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8')

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8` })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) }
    })
  })

const fmtTime = (iso) => {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 生成给 agent 的上下文 markdown —— 这是产品最核心的输出物
function buildContext() {
  const comments = load()
  const tops = comments.filter((c) => !c.parentId)
  const replies = (id) => comments.filter((c) => c.parentId === id)
  const open = tops.filter((c) => c.status === 'open')
  const resolved = tops.filter((c) => c.status === 'resolved')

  const thread = (c, i) => {
    const lines = []
    lines.push(`### ${i + 1}. \`<${c.elementTag} data-cc-id="${c.ccId}">\``)
    if (c.elementSnippet) lines.push(`> 元素内容片段: “${c.elementSnippet}”`)
    lines.push(`- **${c.author}** (${fmtTime(c.createdAt)}): ${c.body}`)
    for (const r of replies(c.id)) lines.push(`  - **${r.author}** (${fmtTime(r.createdAt)}): ${r.body}`)
    return lines.join('\n')
  }

  return [
    `# HTML 协作反馈上下文`,
    ``,
    `页面: AI 落地页（demo） · 版本: v1 · 生成时间: ${fmtTime(new Date().toISOString())}`,
    ``,
    `## 修改约定（给 agent 的指令）`,
    `1. 修改 HTML 时必须保留所有 \`data-cc-id\` 属性 —— 它们是评论的锚点，删除会导致反馈丢失定位。`,
    `2. 逐条处理下方“待处理反馈”，可合并处理同一元素上的多条意见。`,
    `3. 处理完毕后运行 \`npx htmlcollab-cli push\` 发布新版本（demo 环境省略此步）。`,
    ``,
    `## 待处理反馈 (${open.length})`,
    ``,
    open.length ? open.map(thread).join('\n\n') : `（暂无，去页面上用评论模式提几条试试）`,
    ``,
    resolved.length ? `## 已解决 (${resolved.length})\n\n${resolved.map(thread).join('\n\n')}` : ``,
  ].join('\n')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const route = `${req.method} ${url.pathname}`

  try {
    if (route === 'GET /') return send(res, 200, file('shell.html'), 'text/html')
    if (route === 'GET /overlay.js') return send(res, 200, file('overlay.js'), 'application/javascript')

    // 发布管线的 demo 版：吐 HTML 时注入 overlay SDK（真实产品在此之外还会做 cc-id instrument）
    if (route === 'GET /raw') {
      const html = file('page.html').replace('</body>', '<script src="/overlay.js"></script></body>')
      return send(res, 200, html, 'text/html')
    }

    if (route === 'GET /api/comments') return send(res, 200, load())

    if (route === 'POST /api/comments') {
      const b = await readBody(req)
      if (!b.body?.trim() || !b.author?.trim()) return send(res, 400, { error: 'body 和 author 必填' })
      if (!b.parentId && !b.ccId) return send(res, 400, { error: '顶层评论必须带 ccId 锚点' })
      const comments = load()
      const comment = {
        id: crypto.randomUUID().slice(0, 8),
        ccId: b.ccId || null,
        elementTag: b.elementTag || '',
        elementSnippet: (b.elementSnippet || '').slice(0, 80),
        body: b.body.trim().slice(0, 2000),
        author: b.author.trim().slice(0, 30),
        parentId: b.parentId || null,
        status: 'open',
        createdAt: new Date().toISOString(),
      }
      comments.push(comment)
      save(comments)
      return send(res, 201, comment)
    }

    if (route === 'POST /api/resolve') {
      const b = await readBody(req)
      const comments = load()
      const c = comments.find((x) => x.id === b.id && !x.parentId)
      if (!c) return send(res, 404, { error: 'not found' })
      c.status = c.status === 'open' ? 'resolved' : 'open'
      save(comments)
      return send(res, 200, c)
    }

    // agent 侧出口：curl localhost:4870/context 即模拟 `htmlcollab pull`
    if (route === 'GET /context') return send(res, 200, buildContext(), 'text/plain')

    if (route === 'POST /api/reset') { save([]); return send(res, 200, { ok: true }) }

    send(res, 404, { error: 'not found' })
  } catch (e) {
    send(res, 500, { error: String(e) })
  }
})

server.listen(PORT, () => {
  console.log(`htmlcollab demo 已启动:`)
  console.log(`  评审页面   http://localhost:${PORT}`)
  console.log(`  agent 上下文  curl http://localhost:${PORT}/context`)
})
