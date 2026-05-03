// components/icon/icon.js
// Q3 视觉对齐 §B.1.3：跨端 Lucide 图标语言；mini-program 通过 SVG data URI 渲染。
// 与 Web `lucide-vue-next` 视觉一致（同 stroke-width / 同 viewBox / 同 path）。

// 24×24 viewBox，stroke-based。新增图标只需在 PATHS 里追加一条。
const PATHS = {
  'file-text':
    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="16" y1="13" x2="8" y2="13"/>' +
    '<line x1="16" y1="17" x2="8" y2="17"/>' +
    '<polyline points="10 9 9 9 8 9"/>',

  pill:
    '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>' +
    '<path d="m8.5 8.5 7 7"/>',

  'shield-check':
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>' +
    '<path d="m9 12 2 2 4-4"/>',

  'clipboard-list':
    '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' +
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
    '<path d="M12 11h4"/>' +
    '<path d="M12 16h4"/>' +
    '<path d="M8 11h.01"/>' +
    '<path d="M8 16h.01"/>',

  'phone-call':
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',

  search:
    '<circle cx="11" cy="11" r="8"/>' +
    '<path d="m21 21-4.3-4.3"/>',

  'building-2':
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>' +
    '<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>' +
    '<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>' +
    '<path d="M10 6h4"/>' +
    '<path d="M10 10h4"/>' +
    '<path d="M10 14h4"/>' +
    '<path d="M10 18h4"/>',

  'map-pin':
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>' +
    '<circle cx="12" cy="10" r="3"/>',

  lightbulb:
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
    '<path d="M9 18h6"/>' +
    '<path d="M10 22h4"/>',

  // Q3 视觉对齐 §C.1：第二批 12 个 —— 替换 emoji / 中文字符 / `›` / `✓` 等所有非 Lucide 图标
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>' +
    '<circle cx="12" cy="13" r="3"/>',

  'upload-cloud':
    '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>' +
    '<path d="M12 12v9"/>' +
    '<path d="m16 16-4-4-4 4"/>',

  check:
    '<polyline points="20 6 9 17 4 12"/>',

  'check-circle':
    '<circle cx="12" cy="12" r="10"/>' +
    '<path d="m9 12 2 2 4-4"/>',

  'x-circle':
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="15" y1="9" x2="9" y2="15"/>' +
    '<line x1="9" y1="9" x2="15" y2="15"/>',

  'alert-circle':
    '<circle cx="12" cy="12" r="10"/>' +
    '<line x1="12" y1="8" x2="12" y2="12"/>' +
    '<line x1="12" y1="16" x2="12.01" y2="16"/>',

  'chevron-right':
    '<polyline points="9 18 15 12 9 6"/>',

  'arrow-right':
    '<line x1="5" y1="12" x2="19" y2="12"/>' +
    '<polyline points="12 5 19 12 12 19"/>',

  'trash-2':
    '<polyline points="3 6 5 6 21 6"/>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<path d="M10 11v6"/>' +
    '<path d="M14 11v6"/>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',

  plus:
    '<line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/>',

  user:
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="12" cy="7" r="4"/>',

  lock:
    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
}

// 与 shared/tokens/tokens.json 保持同步；改色优先改 tokens.json 再回填这里。
const COLORS = {
  brand: '#2563eb',
  'brand-hover': '#1d4ed8',
  mint: '#10b981',
  red: '#dc2626',
  amber: '#b45309',
  lilac: '#8b5cf6',
  text: '#0f172a',
  'text-dim': '#475569',
  'text-muted': '#94a3b8',
  white: '#ffffff'
}

function buildSrc(name, color, sw) {
  const inner = PATHS[name]
  if (!inner) return ''
  const stroke = COLORS[color] || color || COLORS['text-dim']
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
    stroke +
    '" stroke-width="' +
    sw +
    '" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</svg>'
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

Component({
  properties: {
    name: { type: String, value: '' },
    color: { type: String, value: 'text-dim' },
    size: { type: Number, value: 40 }, // rpx
    strokeWidth: { type: Number, value: 1.75 }
  },

  data: {
    src: ''
  },

  observers: {
    'name, color, strokeWidth': function (name, color, sw) {
      this.setData({ src: buildSrc(name, color, sw) })
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        src: buildSrc(this.data.name, this.data.color, this.data.strokeWidth)
      })
    }
  }
})
