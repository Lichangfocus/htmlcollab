// htmlcollab overlay SDK（demo 版）— 由发布管线注入被评审页面，
// 负责：hover 高亮 / 点击选中 / 评论气泡定位，通过 postMessage 与外层 Shell 通信。
(() => {
  let mode = false
  let hoverEl = null
  let selectedEl = null
  let badgeData = [] // [{ccId, count}]

  const style = document.createElement('style')
  style.textContent = `
    .cc-hover { outline: 2px dashed #4f46e5 !important; outline-offset: 2px; cursor: crosshair !important; }
    .cc-selected { outline: 2px solid #4f46e5 !important; outline-offset: 2px; background: rgba(79,70,229,.05) !important; }
    .cc-flash { outline: 3px solid #f59e0b !important; outline-offset: 2px; transition: outline .2s; }
    .cc-badge { position: absolute; z-index: 99999; min-width: 22px; height: 22px; padding: 0 5px;
      border-radius: 99px; background: #4f46e5; color: #fff; font: 700 12px/22px -apple-system, sans-serif;
      text-align: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.25); user-select: none; }
    .cc-badge:hover { background: #4338ca; transform: scale(1.1); }
    body.cc-mode { cursor: crosshair; }
  `
  document.head.appendChild(style)

  const post = (msg) => parent.postMessage({ source: 'htmlcollab', ...msg }, '*')
  const target = (e) => e.target.closest?.('[data-cc-id]')

  // --- hover 高亮 ---
  document.addEventListener('mousemove', (e) => {
    if (!mode) return
    const el = target(e)
    if (el === hoverEl) return
    hoverEl?.classList.remove('cc-hover')
    hoverEl = el
    if (el && el !== selectedEl) el.classList.add('cc-hover')
  }, true)

  // --- 点击选中（捕获阶段拦截，评论模式下不触发页面原有交互）---
  document.addEventListener('click', (e) => {
    if (!mode) return
    e.preventDefault()
    e.stopPropagation()
    const el = target(e)
    if (!el) return
    select(el)
  }, true)

  function select(el) {
    selectedEl?.classList.remove('cc-selected')
    selectedEl = el
    el.classList.remove('cc-hover')
    el.classList.add('cc-selected')
    post({
      type: 'select',
      ccId: el.dataset.ccId,
      tag: el.tagName.toLowerCase(),
      snippet: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    })
  }

  function clearSelect() {
    selectedEl?.classList.remove('cc-selected')
    selectedEl = null
  }

  // --- 评论气泡 ---
  function renderBadges() {
    document.querySelectorAll('.cc-badge').forEach((b) => b.remove())
    for (const { ccId, count } of badgeData) {
      const el = document.querySelector(`[data-cc-id="${ccId}"]`)
      if (!el || !count) continue
      const rect = el.getBoundingClientRect()
      const badge = document.createElement('div')
      badge.className = 'cc-badge'
      badge.textContent = count
      badge.style.top = `${rect.top + window.scrollY - 10}px`
      badge.style.left = `${rect.right + window.scrollX - 10}px`
      badge.addEventListener('click', (e) => {
        e.stopPropagation()
        select(el)
      })
      document.body.appendChild(badge)
    }
  }
  let rafPending = false
  const scheduleRender = () => {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => { rafPending = false; renderBadges() })
  }
  window.addEventListener('scroll', scheduleRender, true)
  window.addEventListener('resize', scheduleRender)

  // --- Shell 指令 ---
  window.addEventListener('message', (e) => {
    const msg = e.data
    if (msg?.source !== 'htmlcollab-shell') return
    if (msg.type === 'mode') {
      mode = msg.on
      document.body.classList.toggle('cc-mode', mode)
      if (!mode) { hoverEl?.classList.remove('cc-hover'); hoverEl = null; clearSelect() }
    }
    if (msg.type === 'badges') { badgeData = msg.items; renderBadges() }
    if (msg.type === 'clearSelect') clearSelect()
    if (msg.type === 'scrollTo') {
      const el = document.querySelector(`[data-cc-id="${msg.ccId}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('cc-flash')
      setTimeout(() => el.classList.remove('cc-flash'), 1600)
    }
  })

  post({ type: 'ready' })
})()
