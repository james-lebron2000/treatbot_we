// Plan §Phase 3.2：客户端模糊度 advisory 的纯计算部分。
// 拆出来独立模块的两个理由：
//   1. 主调用方 pages/upload/upload.js 是 Page() 模块，require 它会触发 wx 全局；
//      把无 wx 依赖的纯算法放这里，jest 直接 require 即可单测。
//   2. 后续可能有 H5 端复用（pages/web 也有同样的拍照模糊问题）。
//
// 算法：RGBA → 灰度（BT.601）→ 5-point Laplacian → 方差。
// OpenCV 社区惯用阈值 < 100 视为模糊；本仓 conservative 取 80（见 upload.js）。

const computeLaplacianVariance = (rgbaData, size) => {
  const N = Number(size) | 0
  if (!rgbaData || N <= 2) return 0
  if (rgbaData.length < N * N * 4) return 0

  const gray = new Float32Array(N * N)
  for (let i = 0, j = 0; j < gray.length; i += 4, j += 1) {
    gray[j] = 0.299 * rgbaData[i] + 0.587 * rgbaData[i + 1] + 0.114 * rgbaData[i + 2]
  }

  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < N - 1; y += 1) {
    const rowBase = y * N
    const rowAbove = (y - 1) * N
    const rowBelow = (y + 1) * N
    for (let x = 1; x < N - 1; x += 1) {
      const c = gray[rowBase + x]
      const lap = 4 * c
        - gray[rowAbove + x]
        - gray[rowBelow + x]
        - gray[rowBase + x - 1]
        - gray[rowBase + x + 1]
      sum += lap
      sumSq += lap * lap
      count += 1
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}

module.exports = {
  computeLaplacianVariance
}
