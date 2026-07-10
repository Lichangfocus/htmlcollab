'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { VersionInfo } from './page'

/* ================= 类型 ================= */

interface Props {
  slug: string
  title: string
  initialVersions: VersionInfo[]
  initialFocusId: string
}

interface CObj {
  id: string
  type: 'note' | 'intent'
  x: number; y: number; w: number; h: number
  anchor: string | null
  content: string
  status: string
  claimed_by: string | null
  claimed_name: string | null
  resolved_version_id: string | null
  created_by: string
  created_name: string
  updated_at: string
  deleted: number
  seq: number
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

interface Rect { x: number; y: number; w: number; h: number }
interface Selected { ccId: string; tag: string; snippet: string; html?: string; rect?: Rect }
interface Me { id: string; name: string; email: string }
interface Presence { user_id: string; name: string; color: string; x: number; y: number }
interface Changes {
  added: { id: string; tag: string; text?: string }[]
  removed: { id: string; tag: string; text?: string }[]
  modified: { id: string; tag: string; from?: string; to?: string }[]
}
type Role = 'owner' | 'editor' | 'commenter' | 'anon'

/* ================= 常量 & 工具 ================= */

const FW = 1280, FH = 800, BAR = 40, GX = 220, GY = 140
const MIN_Z = 0.04, MAX_Z = 2
const LIVE_MIN_Z = 0.3, LIVE_LIMIT = 3
const PANEL_W = 340

const INTENT_TYPES: [string, string][] = [
  ['copy', '改文案'], ['style', '调样式'], ['layout', '调布局'], ['rewrite', '重写'], ['remove', '删除'], ['other', '其他'],
]
const intentLabel = (t?: string) => INTENT_TYPES.find(([k]) => k === t)?.[1] ?? '修改'

const fmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const pj = <T,>(s: string | null | undefined, fallback: T): T => {
  try { return s ? JSON.parse(s) : fallback } catch { return fallback }
}
const parseChanges = (s: string | null): Changes | null => {
  const c = pj<Changes | null>(s, null)
  return c && (c.added || c.removed || c.modified) ? c : null
}
const changesSummary = (c: Changes | null) => {
  if (!c) return ''
  return [
    c.modified?.length ? `修改 ${c.modified.length}` : '',
    c.added?.length ? `新增 ${c.added.length}` : '',
    c.removed?.length ? `删除 ${c.removed.length}` : '',
  ].filter(Boolean).join(' · ')
}

interface FramePos { v: VersionInfo; x: number; y: number }

function layoutFrames(versions: VersionInfo[]): FramePos[] {
  const mains = versions.filter((v) => v.kind !== 'variant' && v.kind !== 'archived').sort((a, b) => a.number - b.number)
  const byId = new Map(versions.map((v) => [v.id, v]))
  const col = new Map<string, number>()
  mains.forEach((v, i) => col.set(v.id, i))
  const frames: FramePos[] = mains.map((v, i) => ({ v, x: i * (FW + GX), y: 0 }))
  const stack = new Map<number, number>()
  for (const v of versions.filter((x) => x.kind === 'variant').sort((a, b) => a.number - b.number)) {
    let cur: VersionInfo | undefined = v
    let guard = 0
    while (cur && cur.kind === 'variant' && guard++ < 20) cur = cur.base_version_id ? byId.get(cur.base_version_id) : undefined
    const c = cur && col.has(cur.id) ? col.get(cur.id)! : Math.max(0, mains.length - 1)
    const k = (stack.get(c) ?? 0) + 1
    stack.set(c, k)
    frames.push({ v, x: c * (FW + GX), y: k * (FH + BAR + GY) })
  }
  return frames
}

/* ================= 主组件 ================= */

export default function CanvasClient({ slug, title, initialVersions, initialFocusId }: Props) {
  /* ---- 数据态 ---- */
  const [versions, setVersions] = useState<VersionInfo[]>(initialVersions)
  const [objects, setObjects] = useState<Record<string, CObj>>({})
  const [presence, setPresence] = useState<Presence[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [role, setRole] = useState<Role>('anon')

  /* ---- 画布态 ---- */
  const [t, setT] = useState({ x: 60, y: 80, z: 0.5 })
  const [animating, setAnimating] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [mode, setMode] = useState(false)
  const [selected, setSelected] = useState<Selected | null>(null)

  /* ---- 标注弹窗（原位） ---- */
  const [popMode, setPopMode] = useState<'comment' | 'intent'>('comment')
  const [popText, setPopText] = useState('')
  const [popIntentType, setPopIntentType] = useState('copy')
  const [toast, setToast] = useState('')

  /* ---- 登录引导（全屏） ---- */
  const [gateOpen, setGateOpen] = useState(false)
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [loginErr, setLoginErr] = useState('')

  /* ---- 面板 / 弹层 ---- */
  const [panelOpen, setPanelOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [basket, setBasket] = useState<Set<string>>(new Set())
  const [promptModal, setPromptModal] = useState<{ text: string; intentIds: string[]; basketKeys: string[] } | null>(null)
  const [claimOnCopy, setClaimOnCopy] = useState(true)
  const [copied, setCopied] = useState('')
  const [pageIntentOpen, setPageIntentOpen] = useState(false)
  const [pageIntentText, setPageIntentText] = useState('')
  const [pageIntentType, setPageIntentType] = useState('other')
  const [shareOpen, setShareOpen] = useState(false)
  const [verMenuOpen, setVerMenuOpen] = useState(false)
  const [collabs, setCollabs] = useState<{ user_id: string; email: string; name: string; role: string }[]>([])
  const [participants, setParticipants] = useState<{ user_id: string; email: string; name: string; last_active: string }[]>([])
  const [addEmail, setAddEmail] = useState(''); const [addRole, setAddRole] = useState('commenter'); const [shareErr, setShareErr] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)

  /* ---- refs ---- */
  const rootRef = useRef<HTMLDivElement>(null)
  const iframes = useRef(new Map<string, HTMLIFrameElement>())
  const tRef = useRef(t); tRef.current = t
  const seqRef = useRef(0)
  const dragRef = useRef<null | { kind: 'pan' | 'obj'; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }>(null)
  const pointerWorld = useRef({ x: 0, y: 0 })
  const objectsRef = useRef(objects); objectsRef.current = objects
  const focusRef = useRef(focusId); focusRef.current = focusId
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const frames = useMemo(() => layoutFrames(versions), [versions])
  const mainlines = useMemo(() => versions.filter((v) => v.kind !== 'variant').sort((a, b) => a.number - b.number), [versions])
  const latestMain = mainlines[mainlines.length - 1]
  const canEdit = role === 'owner' || role === 'editor'
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 860)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const objList = useMemo(() => Object.values(objects).filter((o) => !o.deleted), [objects])
  const intents = useMemo(() => objList.filter((o) => o.type === 'intent'), [objList])
  const notes = useMemo(() => objList.filter((o) => o.type === 'note'), [objList])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 4000)
  }, [])

  /* ================= 坐标 & 视图控制 ================= */

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cur = tRef.current
    return { x: (sx - cur.x) / cur.z, y: (sy - cur.y) / cur.z }
  }, [])

  const animateTo = useCallback((next: { x: number; y: number; z: number }) => {
    setAnimating(true)
    setT(next)
    setTimeout(() => setAnimating(false), 380)
  }, [])

  const fitDone = useRef(false)
  const interacted = useRef(false) // 用户是否手动动过相机（此后 resize 不再自动聚焦）

  // cv-root 自身已用 right 让出侧栏宽度，clientWidth 即可用区域——不要再减 PANEL_W
  const fitFrame = useCallback((vid: string, attempt = 0) => {
    const f = layoutFrames(versions).find((fp) => fp.v.id === vid)
    if (!f) return
    const root = rootRef.current
    // 容器尚未有真实尺寸（CSS 未加载/布局未完成）时绝不计算相机，否则得到废相机（空白画布）
    if (!root || root.clientWidth < 200 || root.clientHeight < 200) {
      if (attempt < 50) setTimeout(() => fitFrame(vid, attempt + 1), 100)
      return
    }
    fitDone.current = true
    const rw = root.clientWidth
    const rh = root.clientHeight
    const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min(rw / FW, (rh - BAR) / (FH + BAR)) * 0.96))
    animateTo({ z, x: (rw - FW * z) / 2 - f.x * z, y: (rh - (FH + BAR) * z) / 2 - f.y * z + 10 })
  }, [versions, animateTo])
  const fitFrameRef = useRef(fitFrame); fitFrameRef.current = fitFrame

  const fitAll = useCallback(() => {
    const root = rootRef.current
    if (!root || !frames.length || root.clientWidth < 200) return
    const maxX = Math.max(...frames.map((f) => f.x)) + FW
    const maxY = Math.max(...frames.map((f) => f.y)) + FH + BAR
    const rw = root.clientWidth
    const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min(rw / (maxX + 200), root.clientHeight / (maxY + 200), 1)))
    animateTo({ z, x: Math.max(40, (rw - maxX * z) / 2), y: 100 * z + 40 })
  }, [frames, animateTo])

  const focusFrame = useCallback((vid: string) => {
    setFocusId(vid)
    fitFrame(vid)
  }, [fitFrame])

  const exitFocus = useCallback(() => {
    setFocusId(null)
    setMode(false)
    setSelected(null)
    fitAll()
  }, [fitAll])

  useLayoutEffect(() => {
    setFocusId(initialFocusId)
    const timer = setTimeout(() => fitFrame(initialFocusId), 50)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 版本菜单点外关闭
  useEffect(() => {
    if (!verMenuOpen) return
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.cv-vermenu-wrap')) setVerMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [verMenuOpen])

  // 兜底：容器尺寸变化（CSS 后到 / 侧栏插入 / 窗口 resize）且用户尚未手动操作画布时，
  // 重新聚焦当前帧——初始 fit 在布局未稳定时算出的偏移相机由此自愈
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (interacted.current) return
      if (root.clientWidth < 200 || root.clientHeight < 200) return
      const target = focusRef.current ?? initialFocusId
      if (target) fitFrameRef.current(target)
    })
    ro.observe(root)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ================= 数据同步 ================= */

  const mergeObjects = useCallback((changed: CObj[]) => {
    if (!changed.length) return
    setObjects((prev) => {
      const next = { ...prev }
      for (const o of changed) {
        if (dragRef.current?.kind === 'obj' && dragRef.current.id === o.id) continue
        const cur = next[o.id]
        if (!cur || o.seq >= cur.seq) next[o.id] = o
        if (o.seq > seqRef.current) seqRef.current = o.seq
      }
      return next
    })
  }, [])

  // 新版本到达提示（他人/自己的 agent push 后，开着页面的人立即知道）
  const [newVer, setNewVer] = useState<VersionInfo | null>(null)
  const knownVerIds = useRef<Set<string>>(new Set(initialVersions.map((v) => v.id)))
  const verSig = (vs: VersionInfo[]) => vs.map((v) => `${v.id}:${v.kind}`).join('|')

  const mergeVersions = useCallback((incoming: VersionInfo[]) => {
    setVersions((prev) => (verSig(incoming) !== verSig(prev) ? incoming : prev))
    const unseen = incoming.filter((v) => !knownVerIds.current.has(v.id))
    if (unseen.length) {
      for (const v of unseen) knownVerIds.current.add(v.id)
      setNewVer(unseen.sort((a, b) => b.number - a.number)[0])
    }
  }, [])

  useEffect(() => {
    let stop = false
    fetch('/api/me').then((r) => r.json()).then((d) => {
      setMe(d.user)
      // 首次进入且未登录 → 全屏引导（可跳过）
      if (!d.user && !localStorage.getItem('hc_login_skipped')) setGateOpen(true)
    })
    fetch(`/api/p/${slug}/role`).then((r) => r.json()).then((d) => setRole(d.role ?? 'anon'))
    fetch(`/api/p/${slug}/canvas`).then((r) => r.json()).then((d) => {
      if (stop || !d.objects) return
      seqRef.current = d.maxSeq ?? 0
      mergeObjects(d.objects)
      setPresence(d.presence ?? [])
      if (d.versions?.length) mergeVersions(d.versions)
    })
    const timer = setInterval(async () => {
      const d = await fetch(`/api/p/${slug}/canvas/sync?since=${seqRef.current}`).then((r) => r.json()).catch(() => null)
      if (!d || stop) return
      mergeObjects(d.changed ?? [])
      setPresence(d.presence ?? [])
      if (d.versions?.length) mergeVersions(d.versions)
    }, 1500)
    return () => { stop = true; clearInterval(timer) }
  }, [slug, mergeObjects, mergeVersions])

  const refreshComments = useCallback(async () => {
    const vid = focusRef.current ?? latestMain?.id
    if (!vid) return
    const res = await fetch(`/api/p/${slug}/comments?version=${vid}`).catch(() => null)
    if (!res?.ok) return
    const data = await res.json()
    setComments(data.comments)
    const counts: Record<string, number> = {}
    for (const c of data.comments as Comment[]) {
      if (!c.parent_id && c.status === 'open' && c.cc_id && c.anchored) counts[c.cc_id] = (counts[c.cc_id] || 0) + 1
    }
    const fr = iframes.current.get(vid)
    fr?.contentWindow?.postMessage({ source: 'htmlcollab-shell', type: 'badges', items: Object.entries(counts).map(([ccId, count]) => ({ ccId, count })) }, '*')
  }, [slug, latestMain?.id])

  useEffect(() => {
    refreshComments()
    const timer = setInterval(refreshComments, 3000)
    return () => clearInterval(timer)
  }, [refreshComments, focusId])

  useEffect(() => {
    if (!me) return
    const timer = setInterval(() => {
      fetch(`/api/p/${slug}/canvas/presence`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pointerWorld.current),
      }).catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [slug, me])

  /* overlay 消息（按 e.source 匹配帧） */
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const msg = e.data
      if (msg?.source !== 'htmlcollab') return
      let vid: string | null = null
      for (const [k, el] of iframes.current) if (el.contentWindow === e.source) { vid = k; break }
      if (!vid) return
      if (msg.type === 'ready') refreshComments()
      if (msg.type === 'select') {
        setSelected({ ccId: msg.ccId, tag: msg.tag, snippet: msg.snippet, html: msg.html, rect: msg.rect })
        setPopText('')
        setPopMode('comment')
      }
      if (msg.type === 'cleared') setSelected(null)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [refreshComments])

  const toFocusedFrame = useCallback((msg: Record<string, unknown>) => {
    const vid = focusRef.current
    if (!vid) return
    iframes.current.get(vid)?.contentWindow?.postMessage({ source: 'htmlcollab-shell', ...msg }, '*')
  }, [])

  useEffect(() => {
    toFocusedFrame({ type: 'mode', on: mode })
    if (!mode) { setSelected(null); toFocusedFrame({ type: 'clearSelect' }) }
  }, [mode, toFocusedFrame])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (promptModal || shareOpen || pageIntentOpen || gateOpen) { setPromptModal(null); setShareOpen(false); setPageIntentOpen(false); setGateOpen(false); return }
      if (selected) { setSelected(null); toFocusedFrame({ type: 'clearSelect' }); return }
      if (mode) { setMode(false); return }
      if (focusRef.current && !isMobile) exitFocus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, mode, exitFocus, promptModal, shareOpen, pageIntentOpen, gateOpen, toFocusedFrame, isMobile])

  /* ================= 画布手势 ================= */

  const onWheel = useCallback((e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest?.('.cv-panel, .modal, .cv-toolbar, .cv-popover, .cv-gate')) return
    e.preventDefault()
    interacted.current = true
    const cur = tRef.current
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.0022)
      const z = Math.min(MAX_Z, Math.max(MIN_Z, cur.z * factor))
      const rect = rootRef.current!.getBoundingClientRect()
      const px = e.clientX - rect.left, py = e.clientY - rect.top
      const wx = (px - cur.x) / cur.z, wy = (py - cur.y) / cur.z
      setT({ z, x: px - wx * z, y: py - wy * z })
    } else {
      setT({ ...cur, x: cur.x - e.deltaX, y: cur.y - e.deltaY })
    }
  }, [])

  const pushObject = useCallback(async (partial: Record<string, unknown>) => {
    const res = await fetch(`/api/p/${slug}/canvas/objects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(partial),
    })
    if (!res.ok) return null
    const d = await res.json()
    if (d.object) mergeObjects([d.object])
    return d.object as CObj
  }, [slug, mergeObjects])

  const dragSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('.cv-panel, .cv-toolbar, .modal, .cv-popover, .cv-gate, button, textarea, input, select, a')) return
    const objEl = el.closest<HTMLElement>('[data-obj-id]')
    if (objEl && me) {
      const id = objEl.dataset.objId!
      const o = objectsRef.current[id]
      if (!o) return
      dragRef.current = { kind: 'obj', id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, moved: false }
    } else if (el.closest('.cv-pannable')) {
      interacted.current = true
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: tRef.current.x, oy: tRef.current.y, moved: false }
    } else return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [me])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) {
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      pointerWorld.current = { x: Math.round(w.x), y: Math.round(w.y) }
    }
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.kind === 'pan') {
      setT({ ...tRef.current, x: d.ox + dx, y: d.oy + dy })
    } else if (d.kind === 'obj' && d.id) {
      const nx = d.ox + dx / tRef.current.z, ny = d.oy + dy / tRef.current.z
      setObjects((prev) => prev[d.id!] ? { ...prev, [d.id!]: { ...prev[d.id!], x: nx, y: ny } } : prev)
      if (dragSaveTimer.current) clearTimeout(dragSaveTimer.current)
      dragSaveTimer.current = setTimeout(() => {
        const o = objectsRef.current[d.id!]
        if (o) pushObject({ id: o.id, x: o.x, y: o.y })
      }, 180)
    }
  }, [screenToWorld, pushObject])

  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    if (d?.kind === 'obj' && d.id && d.moved) {
      const o = objectsRef.current[d.id]
      if (o) pushObject({ id: o.id, x: o.x, y: o.y })
    }
    dragRef.current = null
  }, [pushObject])

  const requireAuth = useCallback((): boolean => {
    if (me) return true
    setGateOpen(true)
    return false
  }, [me])

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    if (!el.classList.contains('cv-bg')) return
    if (!requireAuth()) return
    const rect = rootRef.current!.getBoundingClientRect()
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    pushObject({ type: 'note', x: w.x - 110, y: w.y - 70, w: 220, h: 140, content: { text: '' } }).then((o) => o && setEditingNote(o.id))
  }, [requireAuth, screenToWorld, pushObject])

  /* ================= 业务动作 ================= */

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr('')
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name }) })
    const data = await res.json()
    if (!res.ok) return setLoginErr(data.error || '登录失败')
    setMe(data.user)
    setGateOpen(false)
    fetch(`/api/p/${slug}/role`).then((r) => r.json()).then((d) => setRole(d.role ?? 'anon'))
    showToast(`👋 欢迎 ${data.user.name}，点「✍️ 标注」开始在页面上圈点`)
  }

  /* ---- 原位标注提交 ---- */
  async function submitAnnotation() {
    if (!selected || !popText.trim()) return
    if (!requireAuth()) return
    if (popMode === 'comment') {
      await fetch(`/api/p/${slug}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ccId: selected.ccId, elementTag: selected.tag, elementSnippet: selected.snippet, body: popText }),
      })
      showToast('✓ 已评论 · 继续点选其他元素，或在右侧动态里查看')
      refreshComments()
    } else {
      const vid = focusRef.current ?? latestMain?.id ?? null
      const f = frames.find((fp) => fp.v.id === vid)
      const siblings = intents.filter((i) => pj<{ versionId?: string }>(i.anchor, {}).versionId === vid).length
      await pushObject({
        type: 'intent',
        x: f ? f.x + FW + 60 : pointerWorld.current.x, y: f ? f.y + siblings * 190 : pointerWorld.current.y,
        w: 260, h: 170,
        anchor: { versionId: vid, ccId: selected.ccId, tag: selected.tag, snippet: selected.snippet, html: selected.html },
        content: { intentType: popIntentType, text: popText.trim() },
      })
      showToast('✓ 已标注修改 · 可继续标注，攒一批后在右侧多选「生成指令」交给 agent')
    }
    setPopText('')
    setSelected(null)
    toFocusedFrame({ type: 'clearSelect' })
  }

  async function submitReply(parentId: string) {
    if (!replyDraft.trim() || !requireAuth()) return
    await fetch(`/api/p/${slug}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, body: replyDraft }) })
    setReplyDraft(''); setReplyTo(null); refreshComments()
  }

  async function resolveComment(id: string) {
    await fetch(`/api/comments/${id}/resolve`, { method: 'POST' })
    refreshComments()
  }

  async function deleteComment(c: Comment) {
    if (!confirm(c.parent_id ? '删除这条回复？' : '删除这条评论及其所有回复？')) return
    const res = await fetch(`/api/comments/${c.id}`, { method: 'DELETE' })
    if (!res.ok) { showToast((await res.json()).error ?? '删除失败'); return }
    setBasket((prev) => { const n = new Set(prev); n.delete('c:' + c.id); return n })
    refreshComments()
  }

  async function saveCommentEdit(id: string) {
    if (!editDraft.trim()) return
    const res = await fetch(`/api/comments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: editDraft }) })
    if (!res.ok) { showToast((await res.json()).error ?? '保存失败'); return }
    setEditingComment(null); setEditDraft('')
    refreshComments()
  }

  async function threadToIntent(c: Comment) {
    if (!requireAuth()) return
    const replies = comments.filter((r) => r.parent_id === c.id)
    const text = [c.body, ...replies.map((r) => `${r.author_name}: ${r.body}`)].join('；')
    const vid = latestMain?.id ?? null
    const f = frames.find((fp) => fp.v.id === vid)
    const siblings = intents.filter((i) => pj<{ versionId?: string }>(i.anchor, {}).versionId === vid).length
    await pushObject({
      type: 'intent',
      x: f ? f.x + FW + 60 : 0, y: f ? f.y + siblings * 190 : 0,
      w: 260, h: 170,
      anchor: c.cc_id ? { versionId: vid, ccId: c.cc_id, tag: c.element_tag, snippet: c.element_snippet } : null,
      content: { intentType: 'other', text, sourceCommentId: c.id },
    })
    showToast('✓ 评论已转为修改标注')
  }

  /* ---- Prompt 生成 ---- */
  function buildPrompt(intentObjs: CObj[], threadTops: Comment[]): string {
    const origin = location.origin
    const items: string[] = []
    let i = 0
    for (const it of intentObjs) {
      i++
      const anchor = pj<{ ccId?: string; tag?: string; snippet?: string; html?: string }>(it.anchor, {})
      const content = pj<{ intentType?: string; text?: string }>(it.content, {})
      const lines = [`## ${i}. [修改·${intentLabel(content.intentType)}] ${anchor.ccId ? `<${anchor.tag} data-cc-id="${anchor.ccId}">${anchor.snippet ? `（“${anchor.snippet}”）` : ''}` : '（页面级）'}`]
      lines.push(`要求（${it.created_name} · ${fmt(it.updated_at)}）: ${content.text ?? ''}`)
      lines.push(`标注 id: ${it.id}`)
      if (anchor.html) lines.push('元素当前源码:', '```html', anchor.html, '```')
      items.push(lines.join('\n'))
    }
    for (const c of threadTops) {
      i++
      const replies = comments.filter((r) => r.parent_id === c.id)
      const lines = [`## ${i}. [评论] <${c.element_tag} data-cc-id="${c.cc_id}">${c.element_snippet ? `（“${c.element_snippet}”）` : ''}`]
      lines.push(`- ${c.author_name}（${fmt(c.created_at)}）: ${c.body}`)
      for (const r of replies) lines.push(`  - ${r.author_name}（${fmt(r.created_at)}）: ${r.body}`)
      lines.push(`评论 id: ${c.id}`)
      items.push(lines.join('\n'))
    }
    // 意图卡与评论都能被 push --resolves 关联解决（服务端按 id 类型自动识别）
    const resolveIds = [...intentObjs.map((o) => o.id), ...threadTops.map((c) => c.id)].join(',')
    return [
      `请处理在线协作页面的以下 ${i} 项反馈（htmlcollab）：`,
      ``,
      `页面: ${origin}/p/${slug}（当前 v${latestMain?.number}，base: ${latestMain?.id}）`,
      ``,
      items.join('\n\n'),
      ``,
      `操作步骤:`,
      `1. 先拉取完整上下文（含版本历史——之前每一版改了什么）: npx htmlcollab-cli pull 或 curl ${origin}/api/p/${slug}/context`,
      `2. 获取页面源码: curl ${origin}/api/p/${slug}/html -o page.html（本地已有项目源文件则直接改）`,
      `3. 修改时保留所有 data-cc-id 属性（评论锚点）`,
      `4. 发布: npx htmlcollab-cli push page.html --slug ${slug} --server ${origin} --base ${latestMain?.id}${resolveIds ? ` --resolves ${resolveIds}` : ''}`,
      `   （需编辑权限；--resolves 会把上面的标注与评论自动标记为已解决，评审者实时看到）`,
    ].join('\n')
  }

  async function generatePrompt(intentObjs: CObj[], threadTops: Comment[]) {
    const text = buildPrompt(intentObjs, threadTops)
    try { await navigator.clipboard.writeText(text) } catch { /* modal 里可手动复制 */ }
    setPromptModal({
      text,
      intentIds: intentObjs.map((o) => o.id).filter(Boolean),
      basketKeys: [...intentObjs.map((o) => o.id), ...threadTops.map((c) => 'c:' + c.id)],
    })
  }

  async function confirmPrompt() {
    if (promptModal && claimOnCopy && me) {
      for (const id of promptModal.intentIds) {
        const o = objects[id]
        if (o && o.status === 'open') await pushObject({ id, claim: true })
      }
    }
    // 只清掉这次打包的条目，不动用户手动多选中的其他项
    if (promptModal) {
      const used = new Set(promptModal.basketKeys)
      setBasket((prev) => new Set([...prev].filter((k) => !used.has(k))))
    }
    setPromptModal(null)
  }

  async function promote(vid: string) {
    if (!confirm('把这个变体设为新的主线版本？')) return
    await fetch(`/api/versions/${vid}/promote`, { method: 'POST' })
    const d = await fetch(`/api/p/${slug}/canvas`).then((r) => r.json())
    if (d.versions) mergeVersions(d.versions)
  }

  async function archiveVersion(vid: string, restore = false) {
    if (!restore && !confirm('归档这个变体？画布上不再显示（历史保留，可在动态里恢复）')) return
    const res = await fetch(`/api/versions/${vid}/archive`, { method: 'POST' })
    if (!res.ok) { showToast((await res.json()).error ?? '操作失败'); return }
    setVersions((prev) => prev.map((v) => (v.id === vid ? { ...v, kind: restore ? 'variant' : 'archived' } : v)))
    if (!restore && focusRef.current === vid && latestMain) focusFrame(latestMain.id)
  }

  async function openShare() {
    setShareOpen(true)
    const d = await fetch(`/api/p/${slug}/collaborators`).then((r) => r.json())
    setCollabs(d.collaborators ?? [])
    setParticipants(d.participants ?? [])
  }
  async function addCollab(e: React.FormEvent) {
    e.preventDefault(); setShareErr('')
    const res = await fetch(`/api/p/${slug}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: addEmail, role: addRole }) })
    const d = await res.json()
    if (!res.ok) return setShareErr(d.error || '添加失败')
    setAddEmail(''); openShare()
  }

  const toggleBasket = (key: string) => setBasket((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleExpand = (key: string) => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  function generateFromBasket() {
    const intentObjs = [...basket].filter((k) => !k.startsWith('c:')).map((k) => objects[k]).filter(Boolean)
    const threadTops = [...basket].filter((k) => k.startsWith('c:')).map((k) => comments.find((c) => c.id === k.slice(2))).filter(Boolean) as Comment[]
    if (intentObjs.length + threadTops.length === 0) return
    generatePrompt(intentObjs, threadTops)
  }

  /* ================= live iframe 选择 ================= */

  const liveIds = useMemo(() => {
    const root = rootRef.current
    const set = new Set<string>()
    if (focusId) set.add(focusId)
    if (root && t.z >= LIVE_MIN_Z) {
      const rw = root.clientWidth, rh = root.clientHeight
      const cands = frames
        .filter((f) => {
          const sx = f.x * t.z + t.x, sy = f.y * t.z + t.y
          const sw = FW * t.z, sh = (FH + BAR) * t.z
          return sx < rw && sy < rh && sx + sw > 0 && sy + sh > 0
        })
        .map((f) => {
          const cx = (f.x + FW / 2) * t.z + t.x - rw / 2
          const cy = (f.y + FH / 2) * t.z + t.y - rh / 2
          return { id: f.v.id, d: cx * cx + cy * cy }
        })
        .sort((a, b) => a.d - b.d)
      for (const c of cands) { if (set.size >= LIVE_LIMIT) break; set.add(c.id) }
    }
    return set
  }, [frames, t, focusId])

  /* ================= 协作动态：待处理 / 已处理两段式 ================= */

  type PendingItem = { kind: 'comment'; time: string; c: Comment } | { kind: 'intent'; time: string; o: CObj }

  const tops2 = useMemo(() => comments.filter((x) => !x.parent_id), [comments])

  const pending = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = []
    for (const c of tops2.filter((x) => x.status === 'open')) items.push({ kind: 'comment', time: c.created_at, c })
    for (const o of intents.filter((x) => x.status !== 'resolved')) items.push({ kind: 'intent', time: o.updated_at, o })
    return items.sort((a, b) => b.time.localeCompare(a.time))
  }, [tops2, intents])

  const resolvedComments = useMemo(() => tops2.filter((x) => x.status === 'resolved'), [tops2])
  const versionEvents = useMemo(() => [...versions].sort((a, b) => b.number - a.number), [versions])

  // “新”标记：上次访问之后出现的条目
  const [lastSeen] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    const key = `hc_seen_${slug}`
    const prev = localStorage.getItem(key) ?? ''
    localStorage.setItem(key, new Date().toISOString())
    return prev
  })
  const isNew = (time: string) => !!lastSeen && time > lastSeen

  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id)
  const focusedFrame = frames.find((f) => f.v.id === focusId)

  // 标签页标题带未读数：切走的评审者/创作者能看到有新反馈
  useEffect(() => {
    document.title = pending.length ? `(${pending.length}) ${title}` : title
  }, [pending.length, title])

  // 相机自愈提示：内容完全不在视野内时给一个"回到内容"入口
  const contentVisible = useMemo(() => {
    const root = rootRef.current
    if (!root || !frames.length || root.clientWidth < 10) return true
    const rw = root.clientWidth, rh = root.clientHeight
    return frames.some((f) => {
      const sx = f.x * t.z + t.x, sy = f.y * t.z + t.y
      const sw = FW * t.z, sh = (FH + BAR) * t.z
      return sx < rw && sy < rh && sx + sw > 0 && sy + sh > 0
    })
  }, [frames, t])

  /* ---- 标注弹窗屏幕坐标 ---- */
  const popoverPos = useMemo(() => {
    if (!selected?.rect || !focusedFrame) return null
    const r = selected.rect
    const wx = focusedFrame.x + r.x
    const wy = focusedFrame.y + BAR + r.y + r.h
    const root = rootRef.current
    const maxX = (root?.clientWidth ?? 1200) - (panelOpen && !isMobile ? PANEL_W : 0) - 340
    const maxY = (root?.clientHeight ?? 800) - 260
    return {
      x: Math.max(12, Math.min(wx * t.z + t.x, maxX)),
      y: Math.max(60, Math.min(wy * t.z + t.y + 8, maxY)),
    }
  }, [selected, focusedFrame, t, panelOpen, isMobile])

  /* ================= 渲染 ================= */

  return (
    <div
      ref={rootRef}
      className="cv-root"
      style={{ right: panelOpen && !isMobile ? PANEL_W : 0 }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {/* 世界 */}
      <div
        className={`cv-world ${animating ? 'cv-anim' : ''}`}
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.z})`, '--inv-z': Math.min(1 / t.z, 3.2) } as React.CSSProperties}
      >
        <div className="cv-bg cv-pannable" />

        {frames.map((f) => {
          const live = liveIds.has(f.v.id)
          const isFocused = focusId === f.v.id
          return (
            <div key={f.v.id} className={`cv-frame ${isFocused ? 'focused' : ''} ${f.v.kind === 'variant' ? 'variant' : ''}`} style={{ left: f.x, top: f.y, width: FW }}>
              <div className="cv-frame-bar">
                <span className="cv-vchip">v{f.v.number}</span>
                {f.v.kind === 'variant' && (
                  <span className="cv-varchip">
                    变体{(() => { const b = versions.find((x) => x.id === f.v.base_version_id); return b ? ` · 基于 v${b.number}` : '' })()}
                  </span>
                )}
                <span className="cv-frame-meta">{f.v.pushed_by_name ?? ''} · {fmt(f.v.created_at)}{changesSummary(parseChanges(f.v.changes)) ? ` · ${changesSummary(parseChanges(f.v.changes))}` : ''}</span>
                <span className="spacer" />
                {f.v.kind === 'variant' && canEdit && (
                  <>
                    <button className="cv-mini-btn" onClick={() => promote(f.v.id)}>↑ 设为主线</button>
                    <button className="cv-mini-btn" title="从画布上收起（历史保留，可在动态里恢复）" onClick={() => archiveVersion(f.v.id)}>归档</button>
                  </>
                )}
                {!isFocused && <button className="cv-mini-btn" onClick={() => focusFrame(f.v.id)}>进入</button>}
              </div>
              <div className="cv-frame-body" style={{ height: FH }}>
                {live ? (
                  <iframe
                    ref={(el) => { if (el) iframes.current.set(f.v.id, el); else iframes.current.delete(f.v.id) }}
                    src={`/raw/${f.v.id}`}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    title={`v${f.v.number}`}
                  />
                ) : (
                  <div className="cv-placeholder">
                    <div className="ph-num">v{f.v.number}</div>
                    <div className="ph-title">{title}</div>
                    <div className="ph-meta">{f.v.pushed_by_name ?? ''} {f.v.kind === 'variant' ? '· 变体' : ''}</div>
                  </div>
                )}
                {!isFocused && <div className="cv-frame-shield cv-pannable" onDoubleClick={(e) => { e.stopPropagation(); focusFrame(f.v.id) }} />}
              </div>
            </div>
          )
        })}

        {notes.map((o) => {
          const content = pj<{ text?: string }>(o.content, {})
          return (
            <div key={o.id} data-obj-id={o.id} className="cv-note" style={{ left: o.x, top: o.y, width: o.w || 220, minHeight: o.h || 140 }}>
              {editingNote === o.id ? (
                <textarea
                  autoFocus
                  defaultValue={content.text}
                  onBlur={(e) => { pushObject({ id: o.id, content: { ...content, text: e.target.value } }); setEditingNote(null) }}
                />
              ) : (
                <div className="cv-note-text" onDoubleClick={(e) => { e.stopPropagation(); if (me) setEditingNote(o.id) }}>
                  {content.text || <span className="cv-dim">双击编辑…</span>}
                </div>
              )}
              <div className="cv-note-foot">
                <span>{o.created_name} · {fmt(o.updated_at)}</span>
                {me && (me.id === o.created_by || canEdit) && (
                  <button className="cv-x" onClick={() => pushObject({ id: o.id, deleted: true })}>✕</button>
                )}
              </div>
            </div>
          )
        })}

        {intents.map((o) => {
          const anchor = pj<{ ccId?: string; tag?: string; snippet?: string; versionId?: string }>(o.anchor, {})
          const content = pj<{ intentType?: string; text?: string }>(o.content, {})
          const rv = o.resolved_version_id ? versions.find((v) => v.id === o.resolved_version_id) : null
          return (
            <div key={o.id} data-obj-id={o.id} className={`cv-intent st-${o.status}`} style={{ left: o.x, top: o.y, width: o.w || 260 }}>
              <div className="cv-intent-head">
                <input type="checkbox" checked={basket.has(o.id)} disabled={o.status === 'resolved'} onChange={() => toggleBasket(o.id)} onPointerDown={(e) => e.stopPropagation()} />
                <span className="cv-chip">{intentLabel(content.intentType)}</span>
                <span className={`cv-dot st-${o.status}`} />
                <span className="cv-status-txt">
                  {o.status === 'resolved' ? `已解决${rv ? ` v${rv.number}` : ''}` : o.status === 'claimed' ? `${o.claimed_name} 处理中` : '待处理'}
                </span>
              </div>
              {anchor.ccId && (
                <div className="cv-intent-anchor" onClick={() => { if (anchor.versionId) { focusFrame(anchor.versionId); setTimeout(() => iframes.current.get(anchor.versionId!)?.contentWindow?.postMessage({ source: 'htmlcollab-shell', type: 'scrollTo', ccId: anchor.ccId }, '*'), 600) } }}>
                  &lt;{anchor.tag}&gt; {anchor.snippet}
                </div>
              )}
              <div className="cv-intent-text">{content.text}</div>
              <div className="cv-intent-foot">
                <span>{o.created_name} · {fmt(o.updated_at)}</span>
                <span className="spacer" />
                {me && o.status !== 'resolved' && (
                  <button className="link-btn" onClick={() => generatePrompt([o], [])}>🤖 指令</button>
                )}
                {me && (canEdit || me.id === o.created_by) && (
                  o.status === 'resolved'
                    ? <button className="link-btn grey" onClick={() => pushObject({ id: o.id, status: 'open', claim: false })}>重开</button>
                    : <button className="link-btn" onClick={() => pushObject({ id: o.id, status: 'resolved' })}>✓ 解决</button>
                )}
                {me && (me.id === o.created_by || canEdit) && o.status !== 'resolved' && (
                  <button className="cv-x" onClick={() => pushObject({ id: o.id, deleted: true })}>✕</button>
                )}
              </div>
            </div>
          )
        })}

        {presence.filter((p) => p.user_id !== me?.id).map((p) => (
          <div key={p.user_id} className="cv-cursor" style={{ left: p.x, top: p.y, color: p.color }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M4 2l16 7.6-7 2.2-2.6 6.9z" /></svg>
            <span style={{ background: p.color }}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* ===== 原位标注弹窗 ===== */}
      {selected && popoverPos && (
        <div className="cv-popover" style={{ left: popoverPos.x, top: popoverPos.y }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="cv-pop-head">
            <span className="el-chip">
              <span className="txt">&lt;{selected.tag}&gt; {selected.snippet || selected.ccId}</span>
              <button title="扩大到父级" onClick={() => toFocusedFrame({ type: 'widen' })}>⬆</button>
            </span>
            <button className="cv-x" onClick={() => { setSelected(null); toFocusedFrame({ type: 'clearSelect' }) }}>✕</button>
          </div>
          <div className="cv-pop-tabs">
            <button className={popMode === 'comment' ? 'on' : ''} onClick={() => setPopMode('comment')}>💬 评论</button>
            <button className={popMode === 'intent' ? 'on' : ''} onClick={() => setPopMode('intent')}>✏️ 标注修改</button>
          </div>
          {popMode === 'intent' && (
            <div className="cv-chips" style={{ margin: '8px 0 0' }}>
              {INTENT_TYPES.map(([k, label]) => (
                <button key={k} className={`cv-chip-btn ${popIntentType === k ? 'on' : ''}`} onClick={() => setPopIntentType(k)}>{label}</button>
              ))}
            </div>
          )}
          <textarea
            className="input"
            rows={2}
            autoFocus
            placeholder={popMode === 'comment' ? '说点什么…（回车发送）' : '想怎么改？会变成给 agent 的修改标注（回车确认）'}
            value={popText}
            onChange={(e) => setPopText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnnotation() } }}
          />
          <div className="cv-actions-row">
            <span className="cv-pop-hint">{me ? `以 ${me.name} 提交` : '提交前需登录'}</span>
            <span className="spacer" />
            <button className="btn primary sm" onClick={submitAnnotation}>{popMode === 'comment' ? '发送评论' : '确认标注'}</button>
          </div>
        </div>
      )}

      {/* ===== 工具栏（左上停靠） ===== */}
      <header className="cv-toolbar">
        <Link href="/dashboard" className="brand">◈</Link>
        <span className="cv-title">{title}</span>
        {!isMobile && (
          <span className="cv-vermenu-wrap">
            <button className="badge-v clickable" onClick={() => setVerMenuOpen((o) => !o)} title="版本时间轴：点击跳转任意版本">
              v{(focusedFrame ?? { v: latestMain }).v?.number}
              {focusedFrame?.v.kind === 'variant' ? ' 变体' : ''} ▾
            </button>
            {verMenuOpen && (
              <div className="cv-vermenu" onPointerDown={(e) => e.stopPropagation()}>
                {[...versions].filter((v) => v.kind !== 'archived').sort((a, b) => b.number - a.number).map((v) => (
                  <button key={v.id} className={`cv-vermenu-item ${focusId === v.id ? 'on' : ''}`}
                    onClick={() => { setVerMenuOpen(false); focusFrame(v.id) }}>
                    <b>v{v.number}</b>
                    {v.kind === 'variant' && <span className="cv-varchip">变体{(() => { const b = versions.find((x) => x.id === v.base_version_id); return b ? `·基于v${b.number}` : '' })()}</span>}
                    {v.id === latestMain?.id && <span className="cv-latest-chip">最新</span>}
                    <span className="cv-vermenu-meta">{v.pushed_by_name ?? ''} · {fmt(v.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
        {me && role !== 'anon' && (
          <span className={`role-chip r-${role}`} title={role === 'owner' ? '你是页面创建者：可管理协作者、发布版本、删除页面' : role === 'editor' ? '可编辑：你的 agent 可以直接 push 新版本' : '可评论：可以评论与标注；需要 push 权限请找创建者提权'}>
            {role === 'owner' ? '创建者' : role === 'editor' ? '可编辑' : '可评论'}
          </span>
        )}
        <span className="cv-divider" />
        {!isMobile && (
          <>
            <div className="cv-zoom">
              <button onClick={() => { interacted.current = true; setT((c) => ({ ...c, z: Math.max(MIN_Z, c.z / 1.25) })) }}>−</button>
              <span>{Math.round(t.z * 100)}%</span>
              <button onClick={() => { interacted.current = true; setT((c) => ({ ...c, z: Math.min(MAX_Z, c.z * 1.25) })) }}>＋</button>
            </div>
            {focusId ? (
              <button className="btn sm" onClick={exitFocus}>⤢ 画布</button>
            ) : (
              <button className="btn sm" onClick={() => latestMain && focusFrame(latestMain.id)}>◎ 聚焦最新</button>
            )}
          </>
        )}
        {isMobile && versions.length > 1 && (
          <select className="ver" value={focusId ?? ''} onChange={(e) => focusFrame(e.target.value)}>
            {[...versions].filter((v) => v.kind !== 'archived').sort((a, b) => b.number - a.number).map((v) => (
              <option key={v.id} value={v.id}>v{v.number}{v.kind === 'variant' ? ' 变体' : ''}</option>
            ))}
          </select>
        )}
        <button className={`btn primary sm ${mode ? 'danger-on' : ''}`} onClick={() => { if (!focusId && latestMain) focusFrame(latestMain.id); setMode(!mode) }}>
          {mode ? '✕ 退出标注' : '✍️ 标注'}
        </button>
        <button className="btn sm" title="Agent 上下文" onClick={() => window.open(`/api/p/${slug}/context`, '_blank')}>🤖</button>
        {role === 'owner' && <button className="btn sm" title="分享 / 权限" onClick={openShare}>👥</button>}
        {!me && <button className="btn sm" onClick={() => setGateOpen(true)}>登录</button>}
        <button className="btn sm" title="收起/展开动态" onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? '⇥' : '⇤'}</button>
      </header>

      {/* ===== 右侧：协作动态（统一 feed，全高对齐） ===== */}
      {panelOpen && (
        <aside className="cv-panel">
          <div className="cv-panel-head">
            <b>协作动态</b>
            <span className="count">{pending.length ? `${pending.length} 项待处理` : ''}</span>
            <span className="spacer" />
            {me && !isMobile && <button className="link-btn" onClick={() => { setPageIntentText(''); setPageIntentOpen(true) }}>+ 页面级标注</button>}
          </div>
          {mode && (
            <div className="cv-panel-tip">正在标注：点选左侧页面中的任意元素 → 原位输入评论或修改要求</div>
          )}
          <div className="cv-list">
            {/* ===== 待处理：新收到的评注与修改标注 ===== */}
            <div className="cv-sec-head">
              <b>待处理</b>
              {pending.length > 0 && <span className="cv-sec-count">{pending.length}</span>}
              <span className="spacer" />
              {me && pending.length > 1 && (
                <button className="link-btn" onClick={() => setBasket(new Set(pending.map((i) => (i.kind === 'intent' ? i.o.id : 'c:' + i.c.id))))}>
                  全选生成指令
                </button>
              )}
            </div>
            {pending.length === 0 && <div className="empty">没有待处理反馈——点「✍️ 标注」在页面上圈点</div>}
            {pending.map((item) => {
              if (item.kind === 'comment') {
                const c = item.c
                return (
                  <div key={'c' + c.id} className="cv-feed-item"
                    onClick={() => { if (c.anchored && c.cc_id) toFocusedFrame({ type: 'scrollTo', ccId: c.cc_id }) }}>
                    <div className="cv-feed-meta">
                      <input type="checkbox" checked={basket.has('c:' + c.id)} onChange={() => toggleBasket('c:' + c.id)} onClick={(e) => e.stopPropagation()} />
                      <span className="cv-avatar" style={{ background: '#0891b2' }}>💬</span>
                      <b>{c.author_name}</b> 评论了
                      <span className={`el ${c.anchored === false ? 'orphan' : ''}`}>{c.anchored === false ? '⚠ ' : ''}&lt;{c.element_tag}&gt; {c.element_snippet?.slice(0, 16)}</span>
                      {isNew(c.created_at) && <span className="cv-new">新</span>}
                      <span className="time">{fmt(c.created_at)}</span>
                    </div>
                    {editingComment === c.id ? (
                      <div className="reply-box" onClick={(e) => e.stopPropagation()}>
                        <textarea className="input" rows={2} autoFocus value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveCommentEdit(c.id) } }} />
                        <div className="actions">
                          <button className="link-btn" onClick={() => saveCommentEdit(c.id)}>保存</button>
                          <button className="link-btn grey" onClick={() => { setEditingComment(null); setEditDraft('') }}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <div className="cv-feed-body">{c.body}</div>
                    )}
                    {repliesOf(c.id).map((r) => (
                      <div className="msg reply" key={r.id}>
                        <div className="meta">
                          {r.author_name} · {fmt(r.created_at)}
                          {me && (r.author_id === me.id || canEdit) && (
                            <button className="cv-x" style={{ marginLeft: 6 }} onClick={(e) => { e.stopPropagation(); deleteComment(r) }}>✕</button>
                          )}
                        </div>
                        {r.body}
                      </div>
                    ))}
                    {me && editingComment !== c.id && (
                      <div className="actions" onClick={(e) => e.stopPropagation()}>
                        <button className="link-btn strong" title="自动生成含元素锚点与源码定位的指令，粘给你的 agent 即可修改" onClick={() => generatePrompt([], [c])}>🤖 引用为指令</button>
                        <button className="link-btn" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft('') }}>回复</button>
                        {(canEdit || c.author_id === me.id) && (
                          <button className="link-btn" onClick={() => resolveComment(c.id)}>✓ 解决</button>
                        )}
                        <button className="link-btn grey" onClick={() => threadToIntent(c)}>转修改标注</button>
                        {c.author_id === me.id && (
                          <button className="link-btn grey" onClick={() => { setEditingComment(c.id); setEditDraft(c.body) }}>编辑</button>
                        )}
                        {(canEdit || c.author_id === me.id) && (
                          <button className="link-btn grey" onClick={() => deleteComment(c)}>删除</button>
                        )}
                      </div>
                    )}
                    {replyTo === c.id && (
                      <div className="reply-box" onClick={(e) => e.stopPropagation()}>
                        <textarea className="input" rows={2} autoFocus value={replyDraft} placeholder="回复…（回车发送）"
                          onChange={(e) => setReplyDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(c.id) } }} />
                      </div>
                    )}
                  </div>
                )
              }
              const o = item.o
              const anchor = pj<{ ccId?: string; tag?: string; snippet?: string; versionId?: string }>(o.anchor, {})
              const content = pj<{ intentType?: string; text?: string }>(o.content, {})
              return (
                <div key={'o' + o.id} className={`cv-feed-item st-${o.status}`}
                  onClick={() => { if (anchor.versionId && anchor.ccId) { focusFrame(anchor.versionId); setTimeout(() => iframes.current.get(anchor.versionId!)?.contentWindow?.postMessage({ source: 'htmlcollab-shell', type: 'scrollTo', ccId: anchor.ccId }, '*'), 600) } }}>
                  <div className="cv-feed-meta">
                    <input type="checkbox" checked={basket.has(o.id)} onChange={() => toggleBasket(o.id)} onClick={(e) => e.stopPropagation()} />
                    <span className="cv-avatar" style={{ background: '#d97706' }}>✏️</span>
                    <b>{o.created_name}</b> 标注修改
                    {anchor.ccId ? <span className="el">&lt;{anchor.tag}&gt; {anchor.snippet?.slice(0, 14)}</span> : <span className="el">整个页面</span>}
                    {isNew(o.updated_at) && <span className="cv-new">新</span>}
                    <span className="time">{fmt(o.updated_at)}</span>
                  </div>
                  <div className="cv-feed-body">
                    <span className="cv-chip">{intentLabel(content.intentType)}</span> {content.text}
                  </div>
                  <div className="cv-feed-status" onClick={(e) => e.stopPropagation()}>
                    {o.status === 'claimed' ? `⏳ ${o.claimed_name} 的 agent 处理中` : '待处理'}
                    {me && o.status === 'open' && (
                      <button className="link-btn strong" style={{ marginLeft: 10 }} onClick={() => generatePrompt([o], [])}>🤖 引用为指令</button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* ===== 已处理记录：agent 每次优化的版本 + 该版本解决的反馈 ===== */}
            <div className="cv-sec-head" style={{ marginTop: 18 }}>
              <b>已处理记录</b>
            </div>
            {versionEvents.map((v) => {
              const ch = parseChanges(v.changes)
              const summary = changesSummary(ch)
              const baseRef = v.base_version_id ? versions.find((x) => x.id === v.base_version_id) : null
              const solved = intents.filter((o) => o.resolved_version_id === v.id)
              const open = expanded.has('v' + v.id)
              const archived = v.kind === 'archived'
              return (
                <div key={'v' + v.id} className={`cv-feed-version ${archived ? 'cv-done' : ''}`} onClick={() => { if (!archived) focusFrame(v.id) }}>
                  <div className="cv-feed-meta">
                    <span className="cv-avatar" style={{ background: archived ? '#9ca3af' : '#4f46e5' }}>🚀</span>
                    <b>{v.pushed_by_name ?? '系统'}</b> 发布了 <b>v{v.number}</b>
                    {v.kind === 'variant' && <span className="cv-varchip">变体{baseRef ? ` · 基于 v${baseRef.number}` : ''}</span>}
                    {archived && <span className="cv-varchip grey">已归档</span>}
                    {isNew(v.created_at) && <span className="cv-new">新</span>}
                    <span className="time">{fmt(v.created_at)}</span>
                  </div>
                  {(summary || v.notes) && (
                    <div className="cv-feed-body">
                      {summary && <span className="cv-change-sum">{summary}</span>}
                      {v.notes && <span className="cv-feed-notes">{v.notes}</span>}
                      {ch && (ch.modified?.length || ch.added?.length || ch.removed?.length) ? (
                        <button className="link-btn" onClick={(e) => { e.stopPropagation(); toggleExpand('v' + v.id) }}>{open ? '收起' : '改动明细'}</button>
                      ) : null}
                    </div>
                  )}
                  {open && ch && (
                    <div className="cv-change-list" onClick={(e) => e.stopPropagation()}>
                      {ch.modified?.map((m, i) => <div key={'m' + i}>~ <code>&lt;{m.tag}&gt;</code> “{m.from}” → “{m.to}”</div>)}
                      {ch.added?.map((a, i) => <div key={'a' + i} className="add">+ <code>&lt;{a.tag}&gt;</code> “{a.text}”</div>)}
                      {ch.removed?.map((r, i) => <div key={'r' + i} className="del">− <code>&lt;{r.tag}&gt;</code> “{r.text}”</div>)}
                    </div>
                  )}
                  {solved.map((s) => {
                    const sc = pj<{ intentType?: string; text?: string }>(s.content, {})
                    return (
                      <div key={s.id} className="cv-feed-solved">
                        ✓ <span className="cv-chip">{intentLabel(sc.intentType)}</span> “{(sc.text ?? '').slice(0, 40)}” — {s.created_name} 提出
                      </div>
                    )
                  })}
                  {v.kind === 'variant' && canEdit && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <button className="link-btn" onClick={() => promote(v.id)}>↑ 设为主线</button>
                      <button className="link-btn grey" onClick={() => archiveVersion(v.id)}>归档</button>
                    </div>
                  )}
                  {archived && canEdit && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <button className="link-btn" onClick={() => archiveVersion(v.id, true)}>恢复到画布</button>
                    </div>
                  )}
                </div>
              )
            })}
            {resolvedComments.map((c) => (
              <div key={'rc' + c.id} className="cv-feed-item cv-done"
                onClick={() => { if (c.anchored && c.cc_id) toFocusedFrame({ type: 'scrollTo', ccId: c.cc_id }) }}>
                <div className="cv-feed-meta">
                  <span className="cv-avatar" style={{ background: '#10b981' }}>✓</span>
                  <b>{c.author_name}</b> 的评论已处理
                  <span className="el">&lt;{c.element_tag}&gt; {c.element_snippet?.slice(0, 14)}</span>
                  <span className="time">{fmt(c.created_at)}</span>
                </div>
                <div className="cv-feed-body cv-strike">{c.body}</div>
                {me && (canEdit || c.author_id === me.id) && (
                  <div className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="link-btn grey" onClick={() => resolveComment(c.id)}>重开</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ===== 新版本到达浮条 ===== */}
      {newVer && (
        <div className="cv-newver">
          🚀 {newVer.pushed_by_name ?? '有人'} 发布了 <b>v{newVer.number}</b>{newVer.kind === 'variant' ? '（变体）' : ''}
          <button className="btn primary sm" onClick={() => { focusFrame(newVer.id); setNewVer(null) }}>查看</button>
          <button className="cv-x" onClick={() => setNewVer(null)}>✕</button>
        </div>
      )}

      {/* ===== 视野外回归 ===== */}
      {!contentVisible && (
        <button className="cv-refocus" onClick={() => latestMain && focusFrame(latestMain.id)}>
          ◎ 内容不在视野内 · 回到最新版本
        </button>
      )}

      {/* ===== 底部生成条 ===== */}
      {basket.size > 0 && (
        <div className="cv-basket">
          已选 {basket.size} 项
          <button className="btn primary sm" onClick={generateFromBasket}>🤖 生成指令</button>
          <button className="btn sm" onClick={() => setBasket(new Set())}>清空</button>
        </div>
      )}

      {/* ===== Toast ===== */}
      {toast && <div className="cv-toast">{toast}</div>}

      {/* ===== 全屏登录引导 ===== */}
      {gateOpen && me === null && (
        <div className="cv-gate">
          <div className="cv-gate-card">
            <h1>◈ {title}</h1>
            <p>这是一个可协作的在线页面：选中任意元素<b>评论</b>或<b>标注修改</b>，所有反馈会实时同步给协作者，并回流给 agent 迭代下一版。</p>
            <form onSubmit={login}>
              <input className="input" type="email" placeholder="邮箱（免验证）" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="input" placeholder="你的名字（评论时展示）" value={name} onChange={(e) => setName(e.target.value)} required />
              {loginErr && <p className="error-text">{loginErr}</p>}
              <button className="btn primary" style={{ width: '100%', padding: 12 }}>进入协作</button>
            </form>
            <button className="cv-gate-skip" onClick={() => { localStorage.setItem('hc_login_skipped', '1'); setGateOpen(false) }}>先随便看看 →</button>
          </div>
        </div>
      )}

      {/* ===== 页面级标注弹窗 ===== */}
      {pageIntentOpen && (
        <div className="modal-mask" onClick={() => setPageIntentOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>页面级修改标注</h3>
            <p className="modal-sub">不针对具体元素的整体要求（如"整体配色往深色调走"）</p>
            <div className="cv-chips">
              {INTENT_TYPES.map(([k, label]) => (
                <button key={k} className={`cv-chip-btn ${pageIntentType === k ? 'on' : ''}`} onClick={() => setPageIntentType(k)}>{label}</button>
              ))}
            </div>
            <textarea className="input" rows={3} autoFocus value={pageIntentText} onChange={(e) => setPageIntentText(e.target.value)} placeholder="想怎么改？" />
            <div className="cv-actions-row" style={{ marginTop: 10 }}>
              <span className="spacer" />
              <button className="btn primary" onClick={async () => {
                if (!pageIntentText.trim() || !requireAuth()) return
                await pushObject({ type: 'intent', x: pointerWorld.current.x, y: pointerWorld.current.y, w: 260, h: 170, anchor: null, content: { intentType: pageIntentType, text: pageIntentText.trim() } })
                setPageIntentOpen(false)
                showToast('✓ 已添加页面级标注')
              }}>确认标注</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Prompt 弹窗 ===== */}
      {promptModal && (
        <div className="modal-mask" onClick={confirmPrompt}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>已复制！粘贴给你的 agent</h3>
            <p className="modal-sub">包含元素源码、修改要求与发布命令；agent 会先拉取版本历史再动手。</p>
            <textarea className="input" rows={12} readOnly value={promptModal.text} onFocus={(e) => e.target.select()} />
            {promptModal.intentIds.length > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
                <input type="checkbox" checked={claimOnCopy} onChange={(e) => setClaimOnCopy(e.target.checked)} />
                认领这些标注（动态里显示"我的 agent 处理中"）
              </label>
            )}
            <div className="cv-actions-row" style={{ marginTop: 12 }}>
              <button className="btn sm" onClick={() => navigator.clipboard.writeText(promptModal.text).then(() => { setCopied('p'); setTimeout(() => setCopied(''), 1500) })}>{copied === 'p' ? '✓' : '再次复制'}</button>
              <span className="spacer" />
              <button className="btn primary" onClick={confirmPrompt}>完成</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 分享弹窗 ===== */}
      {shareOpen && (
        <div className="modal-mask" onClick={() => setShareOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>分享与权限</h3>
            <p className="modal-sub">拿到链接的人可查看；登录后默认<b>可评论</b>。需要对方的 agent 直接发布版本时设为<b>可编辑</b>。</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input className="input" readOnly value={`${typeof location !== 'undefined' ? location.origin : ''}/p/${slug}`} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => { navigator.clipboard.writeText(`${location.origin}/p/${slug}`); setCopied('link'); setTimeout(() => setCopied(''), 1500) }}>{copied === 'link' ? '✓' : '复制'}</button>
            </div>
            {collabs.map((c) => (
              <div className="collab-row" key={c.user_id}>
                <span className="who">{c.name} <span className="mail">{c.email}</span></span>
                <select className="ver" value={c.role} onChange={async (e) => { await fetch(`/api/p/${slug}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, role: e.target.value }) }); openShare() }}>
                  <option value="commenter">可评论</option>
                  <option value="editor">可编辑</option>
                </select>
                <button className="link-btn grey" onClick={async () => { await fetch(`/api/p/${slug}/collaborators?user=${c.user_id}`, { method: 'DELETE' }); openShare() }}>移除</button>
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
            {participants.length > 0 && (
              <>
                <p className="modal-sub" style={{ marginTop: 18, marginBottom: 6 }}>通过链接参与的人（默认可评论，可在此提权）</p>
                {participants.map((p) => (
                  <div className="collab-row" key={p.user_id}>
                    <span className="who">{p.name} <span className="mail">{p.email}</span></span>
                    <span className="mail">{fmt(p.last_active)} 活跃</span>
                    <button className="link-btn" onClick={async () => {
                      await fetch(`/api/p/${slug}/collaborators`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, role: 'editor' }) })
                      openShare()
                    }}>设为可编辑</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
