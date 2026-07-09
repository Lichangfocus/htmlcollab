// htmlcollab overlay SDK — 发布管线注入被评审页面。
// hover 高亮 / 点击选中（最深命中元素）/ 选父级扩大 / Esc 取消 / 评论气泡定位。
(() => {
  let mode = false
  let hoverEl = null
  let selectedEl = null
  let badgeData = []

  const style = document.createElement('style')
  style.textContent = `
    .cc-hover { outline: 2px dashed #4f46e5 !important; outline-offset: 2px; cursor: crosshair !important; }
    .cc-selected { outline: 2px solid #4f46e5 !important; outline-offset: 2px; background: rgba(79,70,229,.05) !important; }
    .cc-flash { outline: 3px solid #f59e0b !important; outline-offset: 2px; }
    .cc-badge { position: absolute; z-index: 2147483647; min-width: 22px; height: 22px; padding: 0 5px;
      border-radius: 99px; background: #4f46e5; color: #fff; font: 700 12px/22px -apple-system, sans-serif;
      text-align: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.25); user-select: none; }
    .cc-badge:hover { background: #4338ca; }
    body.cc-mode { cursor: crosshair; }
  `
  document.head.appendChild(style)

  const post = (msg) => parent.postMessage({ source: 'htmlcollab', ...msg }, '*')
  // closest 返回“包含点击目标的最深锚点元素”——粒度灵敏的关键
  const target = (e) => (e.target.closest ? e.target.closest('[data-cc-id]') : null)

  document.addEventListener('mousemove', (e) => {
    if (!mode) return
    const el = target(e)
    if (el === hoverEl) return
    if (hoverEl) hoverEl.classList.remove('cc-hover')
    hoverEl = el
    if (el && el !== selectedEl) el.classList.add('cc-hover')
  }, true)

  document.addEventListener('click', (e) => {
    if (!mode) return
    e.preventDefault()
    e.stopPropagation()
    const el = target(e)
    if (el) select(el)
  }, true)

  document.addEventListener('keydown', (e) => {
    if (mode && e.key === 'Escape') { clearSelect(); post({ type: 'cleared' }) }
  })

  function select(el) {
    if (selectedEl) selectedEl.classList.remove('cc-selected')
    selectedEl = el
    el.classList.remove('cc-hover')
    el.classList.add('cc-selected')
    const r = el.getBoundingClientRect()
    post({
      type: 'select',
      ccId: el.dataset.ccId,
      tag: el.tagName.toLowerCase(),
      snippet: snippetOf(el),
      // 元素在 iframe 视口内的位置，供外层原位弹出标注输入框
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      // 元素当前源码（截断），供“复制给 agent 修改”生成代码块引用
      html: cleanHtml(el),
    })
  }

  function cleanHtml(el) {
    const clone = el.cloneNode(true)
    clone.classList.remove('cc-hover', 'cc-selected', 'cc-flash')
    clone.querySelectorAll('.cc-hover,.cc-selected,.cc-flash').forEach((n) =>
      n.classList.remove('cc-hover', 'cc-selected', 'cc-flash')
    )
    clone.querySelectorAll('.cc-badge').forEach((n) => n.remove())
    const html = clone.outerHTML
    return html.length > 4000 ? html.slice(0, 4000) + '\n<!-- …已截断 -->' : html
  }

  function snippetOf(el) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'img') return el.getAttribute('alt') || el.getAttribute('src') || '图片'
    if (tag === 'input') return el.getAttribute('placeholder') || el.value || 'input'
    return (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
  }

  function clearSelect() {
    if (selectedEl) selectedEl.classList.remove('cc-selected')
    selectedEl = null
  }

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
      badge.addEventListener('click', (e) => { e.stopPropagation(); select(el) })
      document.body.appendChild(badge)
    }
  }
  let raf = false
  const scheduleRender = () => {
    if (raf) return
    raf = true
    requestAnimationFrame(() => { raf = false; renderBadges() })
  }
  window.addEventListener('scroll', scheduleRender, true)
  window.addEventListener('resize', scheduleRender)

  window.addEventListener('message', (e) => {
    const msg = e.data
    if (!msg || msg.source !== 'htmlcollab-shell') return
    if (msg.type === 'mode') {
      mode = msg.on
      document.body.classList.toggle('cc-mode', mode)
      if (!mode) { if (hoverEl) hoverEl.classList.remove('cc-hover'); hoverEl = null; clearSelect() }
    }
    if (msg.type === 'badges') { badgeData = msg.items; renderBadges() }
    if (msg.type === 'clearSelect') clearSelect()
    if (msg.type === 'widen' && selectedEl) {
      const parent = selectedEl.parentElement && selectedEl.parentElement.closest('[data-cc-id]')
      if (parent) select(parent)
    }
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
