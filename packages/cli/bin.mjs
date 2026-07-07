#!/usr/bin/env node
// htmlcollab CLI — 所有 agent 的通用入口：能跑 shell 就能用。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline/promises'
import { spawn } from 'node:child_process'

const GLOBAL_CFG = path.join(os.homedir(), '.htmlcollab.json')
const PROJECT_CFG = path.join(process.cwd(), '.htmlcollab.json')
const DEFAULT_SERVER = 'https://htmlcollab.lichangin.workers.dev'

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} } }
const writeJson = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n')

// --flag value 解析
const args = process.argv.slice(2)
const cmd = args[0]
const flags = {}
const positional = []
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; i++ }
  else positional.push(args[i])
}

const globalCfg = readJson(GLOBAL_CFG)
const projectCfg = readJson(PROJECT_CFG)
const server = flags.server || projectCfg.server || globalCfg.server || DEFAULT_SERVER

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }

async function api(method, url, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    if (!globalCfg.apiToken) die('未登录，先运行: npx htmlcollab-cli login')
    headers.Authorization = `Bearer ${globalCfg.apiToken}`
  }
  let res
  try {
    res = await fetch(`${server}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    die(`无法连接服务器 ${server}（用 --server 指定地址）`)
  }
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok) die(data.error || `${res.status} ${text.slice(0, 200)}`)
  return data
}

async function login() {
  let { email, name } = flags
  if (!email || !name) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    email = email || (await rl.question('邮箱: '))
    name = name || (await rl.question('用户名: '))
    rl.close()
  }
  const data = await api('POST', '/api/auth/cli-login', { email, name }, false)
  writeJson(GLOBAL_CFG, { ...globalCfg, server, apiToken: data.apiToken, email: data.email, name: data.name })
  console.log(`✓ 已登录 ${data.name} <${data.email}>（配置保存在 ~/.htmlcollab.json）`)
}

async function push() {
  const file = positional[0] || projectCfg.file || 'index.html'
  const filePath = path.resolve(file)
  if (!fs.existsSync(filePath)) die(`文件不存在: ${file}`)
  const html = fs.readFileSync(filePath, 'utf8')

  const data = await api('POST', '/api/push', {
    // --slug 允许协作者向他人的页面发布（需要创建者授予编辑权限）
    slug: flags.slug || projectCfg.slug,
    title: flags.title,
    notes: flags.notes,
    html,
  })

  // 关键一步：把 instrument 后的 HTML 写回本地，评论锚点才能跨版本存活
  fs.writeFileSync(filePath, data.html)
  writeJson(PROJECT_CFG, { server, slug: data.slug, file: path.relative(process.cwd(), filePath) })

  console.log(`✓ 已发布 v${data.version}「${data.title}」（${data.anchors} 个可评论锚点）`)
  console.log(`  协作链接: ${data.url}`)
  console.log(`  拉取反馈: npx htmlcollab-cli pull`)
}

async function pull() {
  if (!projectCfg.slug) die('当前目录还没发布过页面，先运行: npx htmlcollab-cli push <file>')
  let res
  try {
    res = await fetch(`${server}/api/p/${projectCfg.slug}/context`)
  } catch {
    die(`无法连接服务器 ${server}`)
  }
  if (!res.ok) die(`拉取失败: ${res.status}`)
  console.log(await res.text())
}

function openPage() {
  if (!projectCfg.slug) die('当前目录还没发布过页面')
  const url = `${server}/p/${projectCfg.slug}`
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref()
  console.log(url)
}

// 与 plugins/htmlcollab/skills/htmlcollab/SKILL.md 保持同步（canonical 在插件目录）
const SKILL_MD = `---
name: htmlcollab
description: HTML 在线协作。当用户想把 HTML 页面“做成在线的 / 部署一下 / 发给别人看看 / 协同修改 / 收集反馈 / 要一个可分享链接”，或项目中存在 .htmlcollab.json，或用户粘贴了 htmlcollab 页面链接（形如 …/p/xxxxxxxx）或评论引用时使用。
---

# htmlcollab — HTML 在线协作

## 触发场景 → 动作
- “做成在线的 / 发给 XX 看看 / 给我个链接 / 收集反馈” → \`npx htmlcollab-cli push <file>\`，把协作链接给用户
- “处理这个页面的反馈” → \`npx htmlcollab-cli pull\`，按输出逐条处理后 push
- 项目存在 .htmlcollab.json 且要改 HTML → 先 pull 检查未处理反馈；改完主动询问是否 push

## 命令
\`\`\`bash
npx htmlcollab-cli login --email <邮箱> --name <用户名>  # 首次；不带参数是交互式提问，agent 环境务必带 flags
npx htmlcollab-cli push <file>           # 发布/更新 → 协作链接
npx htmlcollab-cli pull                  # 拉取反馈（markdown，含元素锚点）
npx htmlcollab-cli open                  # 打开协作页
npx htmlcollab-cli push <file> --slug <slug> --server <url>   # 向他人页面发布（需编辑权限）
\`\`\`

## 铁律
1. 修改 HTML 必须保留所有 data-cc-id 属性（评论锚点）；新增元素无需自己加，push 时服务端注入。
2. push 会把注入锚点后的 HTML 写回本地文件，这是预期行为。
3. 处理完反馈可解决评论并附回复：POST <server>/api/comments/<id>/resolve，Bearer token 在 ~/.htmlcollab.json。
4. push 403 = 无编辑权限：让页面创建者在网页「分享 / 权限」里授权。
5. 他人页面源码：curl <server>/api/p/<slug>/html
`

async function install() {
  const wrote = []
  // Claude Code: skill
  if (fs.existsSync(path.join(process.cwd(), '.claude'))) {
    const dir = path.join(process.cwd(), '.claude', 'skills', 'htmlcollab')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL_MD)
    wrote.push('.claude/skills/htmlcollab/SKILL.md')
  }
  // Cursor: rules
  if (fs.existsSync(path.join(process.cwd(), '.cursor'))) {
    const dir = path.join(process.cwd(), '.cursor', 'rules')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'htmlcollab.mdc'), SKILL_MD)
    wrote.push('.cursor/rules/htmlcollab.mdc')
  }
  // 兜底: AGENTS.md 追加片段
  const agentsMd = path.join(process.cwd(), 'AGENTS.md')
  const existing = fs.existsSync(agentsMd) ? fs.readFileSync(agentsMd, 'utf8') : ''
  if (!existing.includes('htmlcollab')) {
    fs.writeFileSync(agentsMd, existing + (existing ? '\n\n' : '') + SKILL_MD.replace(/^---[\s\S]*?---\n\n/, ''))
    wrote.push('AGENTS.md')
  }
  if (flags.server) writeJson(GLOBAL_CFG, { ...globalCfg, server: flags.server })
  console.log(`✓ 已安装 agent 物料: ${wrote.join('、') || '(均已存在)'}`)
  console.log('  之后对你的 agent 说“把这个页面做成在线的”或“处理这个页面的反馈”即可自动触发。')
}

const HELP = `htmlcollab — HTML 在线协作

用法:
  htmlcollab login   [--email x --name y --server url]   登录（免验证）
  htmlcollab push    [file] [--title 标题] [--slug s]    发布 / 更新版本
  htmlcollab pull                                        拉取反馈上下文（给 agent 读）
  htmlcollab open                                        浏览器打开协作链接
  htmlcollab install [--server url]                      为当前项目的 agent 安装 skill/规则

给 agent 的提示: pull 输出的 markdown 包含元素锚点与修改约定，
按其处理反馈后再次 push 即完成一轮协作循环。`

const commands = { login, push, pull, open: openPage, install }
if (!cmd || !commands[cmd]) { console.log(HELP); process.exit(cmd ? 1 : 0) }
await commands[cmd]()
