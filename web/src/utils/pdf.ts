/**
 * pdf.ts — 将任意 DOM 区块导出为 A4 PDF（前端纯客户端，不依赖后端）
 *
 * 用法：
 *   const { exportElementAsPdf } = await import('@/utils/pdf')   // 动态 import 避免首屏加载 ~150KB
 *   await exportElementAsPdf(dom, '病历摘要-原发性肝癌')
 *
 * 设计要点：
 *   - 中文字体：动态注入 Noto Sans SC CDN，html2canvas 渲染前 `document.fonts.ready` 等待就绪
 *     （CDN 挂掉时回退系统字体，PDF 中文仍可显示只是视觉稍差）
 *   - 多页切片：按 A4 高度（297mm）循环 addImage，避免超长内容被截断
 *   - 传入 DOM 的建议 style：`background:#fff; width: 800px; padding: 24px;`
 */
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const NOTO_SC_LINK_ID = 'demo-pdf-noto-sans-sc'
const NOTO_SC_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600&display=swap'

const ensureFontLoaded = async (timeoutMs = 3000) => {
  if (typeof document === 'undefined') return
  if (!document.getElementById(NOTO_SC_LINK_ID)) {
    const link = document.createElement('link')
    link.id = NOTO_SC_LINK_ID
    link.rel = 'stylesheet'
    link.href = NOTO_SC_HREF
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  }

  if ((document as any).fonts?.ready) {
    await Promise.race([
      (document as any).fonts.ready as Promise<unknown>,
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ])
  }
}

const sanitizeFileName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'export'

const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export interface ExportPdfOptions {
  /** 保存文件名，不含扩展名；默认自动带日期 */
  fileName?: string
  /** html2canvas scale，值越大越清晰也越慢；默认 2 */
  scale?: number
}

/**
 * 把 DOM 元素导出为 A4 PDF 并触发浏览器下载。
 * 内容高于 1 页会自动分页（在 A4 高度处硬切，不做段落感知）。
 */
export async function exportElementAsPdf(
  element: HTMLElement,
  titleOrFileName: string,
  options: ExportPdfOptions = {}
): Promise<void> {
  if (!element) throw new Error('exportElementAsPdf: element is required')

  await ensureFontLoaded()

  const scale = options.scale ?? 2
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false
  })

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidthMm = pdf.internal.pageSize.getWidth()
  const pageHeightMm = pdf.internal.pageSize.getHeight()

  // canvas 像素 → PDF 毫米的换算：imgWidthMm 固定为页宽，高度按比例推导
  const imgWidthMm = pageWidthMm
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width

  const imgData = canvas.toDataURL('image/jpeg', 0.92)

  if (imgHeightMm <= pageHeightMm) {
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMm, imgHeightMm)
  } else {
    // 多页：每页绘制同一张大图，但用负的 Y 偏移把不同段落推到可视区域
    let heightLeftMm = imgHeightMm
    let positionMm = 0
    while (heightLeftMm > 0) {
      pdf.addImage(imgData, 'JPEG', 0, positionMm, imgWidthMm, imgHeightMm)
      heightLeftMm -= pageHeightMm
      positionMm -= pageHeightMm
      if (heightLeftMm > 0) pdf.addPage()
    }
  }

  const baseName = sanitizeFileName(titleOrFileName)
  const file = options.fileName
    ? `${sanitizeFileName(options.fileName)}.pdf`
    : `${baseName}-${today()}.pdf`
  pdf.save(file)
}
