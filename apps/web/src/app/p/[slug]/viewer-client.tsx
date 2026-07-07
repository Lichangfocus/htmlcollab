'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Props {
  slug: string
  title: string
  versions: { id: string; number: number }[]
  current: { id: string; number: number }
  isLatest: boolean
}

interface Comment {
  id: string
  cc_id: string | null
  element_tag: string | null
  element_snippet: string | null
  body: string
  author_id: string
  author_name: string
  parent_id: string | null
  status: string
  created_at: string
  anchored?: boolean
}

interface Selected { ccId: string; tag: string; snippet: string; html?: string }
interface Me { id: string; name: string; email: string }
interface Collab { user_id: string; email: string; name: string; role: string }
type Role = 'owner' | 'editor' | 'commenter' | 'anon'

const fmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Viewer({ slug, title, versions, current, isLatest }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [mode, setMode] = useState(false)
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [role, setRole] = useState<Role>('anon')
  const [comments, setComments] = useState<Comment[]>([])
  const [selected, setSelected] = useState<Selected | null>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [activeCcId, setActiveCcId] = useState<string | null>(null)
  // 内嵌登录
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loginErr, setLoginErr] = useState('')
  // agent 引用弹窗（首次引导 + 内容预览）
  const [agentModal, setAgentModal] = useState<{ text: string; firstTime: boolean } | null>(null)
  const [copied, setCopied] = useState('')
  // 分享面板（owner）
  const [shareOpen, setShareOpen] = useState(false)
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('commenter')
  const [shareErr, setShareErr] = useState('')

  const canEdit = role === 'owner' || role === 'editor'

  const toFrame = useCallback((msg: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ source: 'htmlcollab-shell', ...msg }, '*')
  }, [])

  const pushBadges = useCallback((list: Comment[]) => {
    const counts: Record<string, number> = {}
    for (const c of list) {
      if (!c.parent_id && c.status === 'open' && c.cc_id && c.anchored) {
        counts[c.cc_id] = (counts[c.cc_id] || 0) + 1
      }
    }
    toFrame({ type: 'badges', items: Object.entries(counts).map(([ccId, count]) => ({ ccId, count })) })
  }, [toFrame])

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/p/${slug}/comments?version=${current.id}`)
    if (!res.ok) return
    const data = await res.json()
    setComments(data.comments)
    pushBadges(data.comments)
  }, [slug, current.id, pushBadges])

  const loadRole = useCallback(async () => {
    const d = await fetch(`/api/p/${slug}/role`).then((r) => r.json())
    setRole(d.role ?? 'anon')
  }, [slug])

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => setMe(d.user))
    loadRole()
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh, loadRole])

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const msg = e.data
      if (msg?.source !== 'htmlcollab') return
      if (msg.type === 'ready') refresh()
      if (msg.type === 'select') {
        setSelected({ ccId: msg.ccId, tag: msg.tag, snippet: msg.snippet, html: msg.html })
        setActiveCcId(msg.ccId)
      }
      if (msg.type === 'cleared') { setSelected(null); setActiveCcId(null) }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [refresh])

  function toggleMode() {
    const next = !mode
    setMode(next)
    toFrame({ type: 'mode', on: next })
    if (!next) cancelSelect()
  }

  function cancelSelect() {
    setSelected(null)
    setDraft('')
    toFrame({ type: 'clearSelect' })
  }

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    })
    const data = await res.json()
    if (!res.ok) return setLoginErr(data.error || '登录失败')
    setMe(data.user)
    loadRole()
  }

  async function submitComment() {
    if (!selected || !draft.trim()) return
    await fetch(`/api/p/${slug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ccId: selected.ccId,
        elementTag: selected.tag,
        elementSnippet: selected.snippet,
        body: draft,
      }),
    })
    setDraft('')
    cancelSelect()
    refresh()
  }

  async function submitReply(parentId: string) {
    if (!replyDraft.trim()) return
    await fetch(`/api/p/${slug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId, body: replyDraft }),
    })
    setReplyDraft('')
    setReplyTo(null)
    refresh()
  }

  async function resolve(id: string) {
    await fetch(`/api/comments/${id}/resolve`, { method: 'POST' })
    refresh()
  }

  // ---- 复制给 agent ----
  function agentPrompt(opts: { tag: string; ccId: string; snippet?: string; html?: string; thread?: Comment[] }) {
    const origin = location.origin
    const url = `${origin}/p/${slug}`
    const lines: string[] = [
      `请修改这个在线协作页面（htmlcollab）中的元素：`,
      ``,
      `- 页面: ${url}（当前 v${current.number}）`,
      `- 目标元素: <${opts.tag} data-cc-id="${opts.ccId}">${opts.snippet ? `（${opts.snippet}）` : ''}`,
    ]
    if (opts.html) lines.push(``, `元素当前源码:`, '```html', opts.html, '```')
    if (opts.thread?.length) {
      lines.push(``, `相关评论:`)
      for (const c of opts.thread) lines.push(`- ${c.author_name}: ${c.body}`)
      lines.push(``, `修改要求: 按上述评论处理`)
    } else {
      lines.push(``, `修改要求: （在这里描述你想怎么改）`)
    }
    lines.push(
      ``,
      `操作步骤:`,
      `1. 获取页面完整源码: curl ${origin}/api/p/${slug}/html -o page.html（若本地已有此项目源文件则直接改源文件）`,
      `2. 修改时保留所有 data-cc-id 属性（它们是评论锚点）`,
      `3. 发布新版本: npx htmlcollab push page.html --slug ${slug} --server ${origin}`,
      `   （需先 npx htmlcollab login，且拥有该页面的编辑权限）`,
      `4. 全部反馈: npx htmlcollab pull 或 ${origin}/api/p/${slug}/context`,
      ``,
      `提示: 为 agent 一键安装 skill（之后无需再粘贴本说明）→ ${origin}/install`
    )
    return lines.join('\n')
  }

  async function copyForAgent(opts: { tag: string; ccId: string; snippet?: string; html?: string; thread?: Comment[] }, key: string) {
    const text = agentPrompt(opts)
    try { await navigator.clipboard.writeText(text) } catch { /* 弹窗里仍可手动复制 */ }
    const firstTime = !localStorage.getItem('hc_agent_guide_seen')
    if (firstTime) {
      localStorage.setItem('hc_agent_guide_seen', '1')
      setAgentModal({ text, firstTime: true })
    } else {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    }
  }

  // ---- 分享面板 ----
  async function openShare() {
    setShareOpen(true)
    const d = await fetch(`/api/p/${slug}/collaborators`).then((r) => r.json())
    setCollabs(d.collaborators ?? [])
  }

  async function addCollab(e: React.FormEvent) {
    e.preventDefault()
    setShareErr('')
    const res = await fetch(`/api/p/${slug}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail, role: addRole }),
    })
    const d = await res.json()
    if (!res.ok) return setShareErr(d.error || '添加失败')
    setAddEmail('')
    openShare()
  }

  async function setCollabRole(userId: string, newRole: string) {
    const c = collabs.find((x) => x.user_id === userId)
    if (!c) return
    await fetch(`/api/p/${slug}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: c.email, role: newRole }),
    })
    openShare()
  }

  async function removeCollab(userId: string) {
    await fetch(`/api/p/${slug}/collaborators?user=${userId}`, { method: 'DELETE' })
    openShare()
  }

  const tops = comments
    .filter((c) => !c.parent_id)
    .sort((a, b) => (a.status < b.status ? -1 : a.status > b.status ? 1 : b.created_at.localeCompare(a.created_at)))
  const openCount = tops.filter((c) => c.status === 'open').length
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id)

  return (
    <div className="viewer">
      <header className="topbar">
        <Link href="/dashboard" className="brand">◈ htmlcollab</Link>
        <span className="title">{title} <span className="badge-v">v{current.number}</span></span>
        {versions.length > 1 && (
          <select
            className="ver"
            value={current.number}
            onChange={(e) => { location.href = `/p/${slug}?v=${e.target.value}` }}
          >
            {versions.map((v) => <option key={v.id} value={v.number}>v{v.number}</option>)}
          </select>
        )}
        {!isLatest && <span style={{ fontSize: 12, color: '#b45309' }}>历史版本（只读展示，评论仍针对最新版）</span>}
        <span className="spacer" />
        {role === 'owner' && <button className="btn" onClick={openShare}>👥 分享 / 权限</button>}
        <button className={`btn primary ${mode ? 'danger-on' : ''}`} onClick={toggleMode}>
          {mode ? '✕ 退出评论模式' : '💬 评论模式'}
        </button>
        <button className="btn" onClick={() => window.open(`/api/p/${slug}/context`, '_blank')}>🤖 Agent 上下文</button>
      </header>

      <main>
        <div className="frame-wrap">
          <iframe
            key={current.id}
            ref={frameRef}
            src={`/raw/${current.id}`}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>

        <aside>
          <div className="composer">
            <h2>发表评论</h2>
            {me === undefined ? null : me === null ? (
              <form className="mini-login" onSubmit={login}>
                <p>输入邮箱和用户名即可参与评论（无需验证）</p>
                <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input className="input" placeholder="用户名" value={name} onChange={(e) => setName(e.target.value)} required />
                {loginErr && <p className="error-text" style={{ marginBottom: 8 }}>{loginErr}</p>}
                <button className="btn primary sm" style={{ width: '100%' }}>登录并开始评论</button>
              </form>
            ) : !selected ? (
              <div className="placeholder">
                开启右上角「评论模式」，然后在左侧页面中<b>点击任意元素</b>。
                选中后可以<b>评论</b>，也可以<b>复制引用给你自己的 agent</b> 去修改。
              </div>
            ) : (
              <div>
                <span className="el-chip">
                  <span className="txt">&lt;{selected.tag}&gt; {selected.snippet || selected.ccId}</span>
                  <button title="扩大选区到父级元素" onClick={() => toFrame({ type: 'widen' })}>⬆ 选父级</button>
                </span>
                <textarea
                  className="input"
                  rows={3}
                  autoFocus
                  placeholder="对这个元素说点什么…（回车发送）"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                />
                <div className="row">
                  <button
                    className="btn sm"
                    title="生成含元素代码块与操作说明的提示词，粘贴给你的 agent 即可修改"
                    onClick={() => copyForAgent({ ...selected }, 'composer')}
                  >
                    {copied === 'composer' ? '✓ 已复制' : '🤖 复制给 agent 修改'}
                  </button>
                  <span className="spacer" />
                  <button className="btn sm" onClick={cancelSelect}>取消</button>
                  <button className="btn primary sm" onClick={submitComment}>发送</button>
                </div>
              </div>
            )}
          </div>

          <h2>评论 <span className="count">{tops.length ? `${openCount} 待处理 / ${tops.length} 总计` : ''}</span></h2>
          <div className="threads">
            {tops.length === 0 && <div className="empty">还没有评论</div>}
            {tops.map((c) => (
              <div
                key={c.id}
                className={`thread ${c.status} ${activeCcId && c.cc_id === activeCcId ? 'active' : ''}`}
                onClick={() => { if (c.anchored && c.cc_id) { toFrame({ type: 'scrollTo', ccId: c.cc_id }); setActiveCcId(c.cc_id) } }}
              >
                <span className={`el ${c.anchored === false ? 'orphan' : ''}`}>
                  {c.anchored === false ? '⚠ 元素已不存在 · ' : ''}&lt;{c.element_tag}&gt; {c.element_snippet || c.cc_id}
                </span>
                <div className="msg">
                  <div className="meta">{c.author_name} · {fmt(c.created_at)}</div>
                  {c.body}
                </div>
                {repliesOf(c.id).map((r) => (
                  <div className="msg reply" key={r.id}>
                    <div className="meta">{r.author_name} · {fmt(r.created_at)}</div>
                    {r.body}
                  </div>
                ))}
                {me && (
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="link-btn" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft('') }}>回复</button>
                    {(canEdit || c.author_id === me.id) && (
                      <button className={`link-btn ${c.status === 'open' ? '' : 'grey'}`} onClick={() => resolve(c.id)}>
                        {c.status === 'open' ? '✓ 解决' : '重新打开'}
                      </button>
                    )}
                    <button
                      className="link-btn"
                      title="把这条反馈连同元素引用复制给你的 agent"
                      onClick={() => copyForAgent({ tag: c.element_tag || 'div', ccId: c.cc_id || '', snippet: c.element_snippet || '', thread: [c, ...repliesOf(c.id)] }, c.id)}
                    >
                      {copied === c.id ? '✓ 已复制' : '🤖 复制给 agent'}
                    </button>
                  </div>
                )}
                {replyTo === c.id && (
                  <div className="reply-box" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="input"
                      rows={2}
                      autoFocus
                      placeholder="回复…（回车发送）"
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(c.id) } }}
                    />
                    <div className="row">
                      <button className="btn primary sm" onClick={() => submitReply(c.id)}>发送</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </main>

      {/* 首次“复制给 agent”引导弹窗 */}
      {agentModal && (
        <div className="modal-mask" onClick={() => setAgentModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>已复制！把它粘贴给你的 agent</h3>
            <p className="modal-sub">
              内容包含元素代码块、页面引用和操作说明，Claude Code / Cursor 等任何 agent 都能直接照做。
            </p>
            <textarea className="input" rows={10} readOnly value={agentModal.text} onFocus={(e) => e.target.select()} />
            <div className="modal-tip">
              💡 <b>推荐</b>：为你的 agent 安装 skill —— 打开{' '}
              <a href="/install" target="_blank"><b>{typeof location !== 'undefined' ? location.host : ''}/install</b></a>{' '}
              按指引一条命令完成。之后你只要说「处理这个页面的反馈」，agent 就会自动拉取评论并发布新版本，
              不用再手动复制。
            </div>
            <div className="row" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn primary" onClick={() => setAgentModal(null)}>我知道了</button>
            </div>
          </div>
        </div>
      )}

      {/* 分享 / 权限面板（owner） */}
      {shareOpen && (
        <div className="modal-mask" onClick={() => setShareOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>分享与权限</h3>
            <p className="modal-sub">
              任何拿到链接的人都可以查看；登录后默认<b>可评论</b>。需要让协作者的 agent 直接发布新版本时，把 TA 设为<b>可编辑</b>。
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input className="input" readOnly value={`${location.origin}/p/${slug}`} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => { navigator.clipboard.writeText(`${location.origin}/p/${slug}`); setCopied('link'); setTimeout(() => setCopied(''), 1500) }}>
                {copied === 'link' ? '✓' : '复制'}
              </button>
            </div>
            <h4 style={{ fontSize: 13, marginBottom: 8 }}>协作者</h4>
            {collabs.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>还没有指定协作者</p>}
            {collabs.map((c) => (
              <div className="collab-row" key={c.user_id}>
                <span className="who">{c.name} <span className="mail">{c.email}</span></span>
                <select className="ver" value={c.role} onChange={(e) => setCollabRole(c.user_id, e.target.value)}>
                  <option value="commenter">可评论</option>
                  <option value="editor">可编辑</option>
                </select>
                <button className="link-btn grey" onClick={() => removeCollab(c.user_id)}>移除</button>
              </div>
            ))}
            <form onSubmit={addCollab} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input" type="email" placeholder="协作者邮箱" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} required />
              <select className="ver" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                <option value="commenter">可评论</option>
                <option value="editor">可编辑</option>
              </select>
              <button className="btn primary sm">添加</button>
            </form>
            {shareErr && <p className="error-text" style={{ marginTop: 8 }}>{shareErr}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
