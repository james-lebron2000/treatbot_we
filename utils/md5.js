/**
 * Plan §Phase 2.1：客户端 md5（直传 COS 后告诉服务端 fileHash 用于 dedup + 缓存命中）。
 *
 * 为啥自己写：
 *   - 微信小程序无 nodejs crypto；社区有 spark-md5 但要拉外部包，本项目极简化偏好。
 *   - 我们只需要 16 字节 hex 输出（32 字符），且文件最大 30MB —— 自己实现 RFC 1321
 *     200 行内能搞定，依赖 0。
 *
 * 接口：
 *   md5File(filePath) -> Promise<string>      // hex (32 字符 lowercase)
 *   md5Bytes(uint8) -> string                  // 直接对 Uint8Array 算
 *
 * 大文件（>5MB）建议分块读：wx.getFileSystemManager().readFile 一次读 ArrayBuffer
 * 是 OK 的（小程序内存限额 ~150MB），但 30MB 文件 5 张并发 → 150MB 一次读完会被 GC 抖。
 * 这里用 readFile（一次性）+ 让调用方控制并发（uploadFiles 里串行计算 md5）。
 */

// === 纯 JS RFC 1321 实现 ===
// 数学逻辑直接抄 RFC 1321 + 一个最常见 JS 实现的位运算 trick；
// 不直接照搬第三方代码，避免 license 风险。
const safeAdd = (x, y) => {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
};

const rotL = (x, n) => (x << n) | (x >>> (32 - n));

const F = (x, y, z) => (x & y) | (~x & z);
const G = (x, y, z) => (x & z) | (y & ~z);
const H = (x, y, z) => x ^ y ^ z;
const I = (x, y, z) => y ^ (x | ~z);

const step = (fn, a, b, c, d, x, s, t) => safeAdd(rotL(safeAdd(safeAdd(a, fn(b, c, d)), safeAdd(x, t)), s), b);

// 把 Uint8Array → 16 个 32-bit 小端整数（一个 block 64 字节）
const blockToInts = (bytes, blockOffset) => {
  const out = new Array(16);
  for (let i = 0; i < 16; i += 1) {
    const o = blockOffset + i * 4;
    out[i] = (bytes[o]) | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
  }
  return out;
};

// 32-bit int → 4 个小端字节
const intToBytes = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

const md5Bytes = (uint8) => {
  // 预处理：长度（bit）+ 1 个 0x80 标志 + 0 padding 至 56 (mod 64) + 8 字节小端长度
  const len = uint8.length;
  const bitLen = len * 8;
  const padLen = (len % 64 < 56 ? 56 : 56 + 64) - (len % 64);
  const total = len + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(uint8, 0);
  buf[len] = 0x80;
  // 长度（小端 64-bit）
  // bitLen 可能超过 32-bit；分两半写
  const lo = bitLen >>> 0;
  const hi = Math.floor(bitLen / 0x100000000) >>> 0;
  buf[total - 8] = lo & 0xff;
  buf[total - 7] = (lo >>> 8) & 0xff;
  buf[total - 6] = (lo >>> 16) & 0xff;
  buf[total - 5] = (lo >>> 24) & 0xff;
  buf[total - 4] = hi & 0xff;
  buf[total - 3] = (hi >>> 8) & 0xff;
  buf[total - 2] = (hi >>> 16) & 0xff;
  buf[total - 1] = (hi >>> 24) & 0xff;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let off = 0; off < total; off += 64) {
    const x = blockToInts(buf, off);
    const aa = a; const bb = b; const cc = c; const dd = d;

    a = step(F, a, b, c, d, x[0], 7, -680876936);
    d = step(F, d, a, b, c, x[1], 12, -389564586);
    c = step(F, c, d, a, b, x[2], 17, 606105819);
    b = step(F, b, c, d, a, x[3], 22, -1044525330);
    a = step(F, a, b, c, d, x[4], 7, -176418897);
    d = step(F, d, a, b, c, x[5], 12, 1200080426);
    c = step(F, c, d, a, b, x[6], 17, -1473231341);
    b = step(F, b, c, d, a, x[7], 22, -45705983);
    a = step(F, a, b, c, d, x[8], 7, 1770035416);
    d = step(F, d, a, b, c, x[9], 12, -1958414417);
    c = step(F, c, d, a, b, x[10], 17, -42063);
    b = step(F, b, c, d, a, x[11], 22, -1990404162);
    a = step(F, a, b, c, d, x[12], 7, 1804603682);
    d = step(F, d, a, b, c, x[13], 12, -40341101);
    c = step(F, c, d, a, b, x[14], 17, -1502002290);
    b = step(F, b, c, d, a, x[15], 22, 1236535329);

    a = step(G, a, b, c, d, x[1], 5, -165796510);
    d = step(G, d, a, b, c, x[6], 9, -1069501632);
    c = step(G, c, d, a, b, x[11], 14, 643717713);
    b = step(G, b, c, d, a, x[0], 20, -373897302);
    a = step(G, a, b, c, d, x[5], 5, -701558691);
    d = step(G, d, a, b, c, x[10], 9, 38016083);
    c = step(G, c, d, a, b, x[15], 14, -660478335);
    b = step(G, b, c, d, a, x[4], 20, -405537848);
    a = step(G, a, b, c, d, x[9], 5, 568446438);
    d = step(G, d, a, b, c, x[14], 9, -1019803690);
    c = step(G, c, d, a, b, x[3], 14, -187363961);
    b = step(G, b, c, d, a, x[8], 20, 1163531501);
    a = step(G, a, b, c, d, x[13], 5, -1444681467);
    d = step(G, d, a, b, c, x[2], 9, -51403784);
    c = step(G, c, d, a, b, x[7], 14, 1735328473);
    b = step(G, b, c, d, a, x[12], 20, -1926607734);

    a = step(H, a, b, c, d, x[5], 4, -378558);
    d = step(H, d, a, b, c, x[8], 11, -2022574463);
    c = step(H, c, d, a, b, x[11], 16, 1839030562);
    b = step(H, b, c, d, a, x[14], 23, -35309556);
    a = step(H, a, b, c, d, x[1], 4, -1530992060);
    d = step(H, d, a, b, c, x[4], 11, 1272893353);
    c = step(H, c, d, a, b, x[7], 16, -155497632);
    b = step(H, b, c, d, a, x[10], 23, -1094730640);
    a = step(H, a, b, c, d, x[13], 4, 681279174);
    d = step(H, d, a, b, c, x[0], 11, -358537222);
    c = step(H, c, d, a, b, x[3], 16, -722521979);
    b = step(H, b, c, d, a, x[6], 23, 76029189);
    a = step(H, a, b, c, d, x[9], 4, -640364487);
    d = step(H, d, a, b, c, x[12], 11, -421815835);
    c = step(H, c, d, a, b, x[15], 16, 530742520);
    b = step(H, b, c, d, a, x[2], 23, -995338651);

    a = step(I, a, b, c, d, x[0], 6, -198630844);
    d = step(I, d, a, b, c, x[7], 10, 1126891415);
    c = step(I, c, d, a, b, x[14], 15, -1416354905);
    b = step(I, b, c, d, a, x[5], 21, -57434055);
    a = step(I, a, b, c, d, x[12], 6, 1700485571);
    d = step(I, d, a, b, c, x[3], 10, -1894986606);
    c = step(I, c, d, a, b, x[10], 15, -1051523);
    b = step(I, b, c, d, a, x[1], 21, -2054922799);
    a = step(I, a, b, c, d, x[8], 6, 1873313359);
    d = step(I, d, a, b, c, x[15], 10, -30611744);
    c = step(I, c, d, a, b, x[6], 15, -1560198380);
    b = step(I, b, c, d, a, x[13], 21, 1309151649);
    a = step(I, a, b, c, d, x[4], 6, -145523070);
    d = step(I, d, a, b, c, x[11], 10, -1120210379);
    c = step(I, c, d, a, b, x[2], 15, 718787259);
    b = step(I, b, c, d, a, x[9], 21, -343485551);

    a = safeAdd(a, aa);
    b = safeAdd(b, bb);
    c = safeAdd(c, cc);
    d = safeAdd(d, dd);
  }

  // 输出小端 hex
  const bytes = []
    .concat(intToBytes(a))
    .concat(intToBytes(b))
    .concat(intToBytes(c))
    .concat(intToBytes(d));
  return bytes.map((n) => n.toString(16).padStart(2, '0')).join('');
};

const md5File = (filePath) => new Promise((resolve, reject) => {
  try {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => {
        try {
          const ab = res.data;
          const u8 = ab instanceof ArrayBuffer ? new Uint8Array(ab) : new Uint8Array(ab.buffer || ab);
          resolve(md5Bytes(u8));
        } catch (e) {
          reject(e);
        }
      },
      fail: (err) => reject(err)
    });
  } catch (e) {
    reject(e);
  }
});

module.exports = {
  md5Bytes,
  md5File
};
