/**
 * PRD-2026Q3 T1-1：ClinicalTrials.gov v2 API 客户端
 *
 * 上游：https://clinicaltrials.gov/api/v2/studies
 *   - 公开免费，无需 key；遵循 5 QPS 限速（v2 文档建议）。
 *   - 单次按 nct_id 列表查询，最多 100 条 / 请求。
 *
 * 设计：
 *  - 仅一个 fetchByNctIds(nctIds[]) 出口，crawler 内部分批 100 调用。
 *  - 返回 normalize 后的 { nct_id, status, phase, locations, enrolled_count, last_update_posted }
 *    其它字段先不取，避免上游 schema 变化打挂；后续按需扩展。
 *  - 测试时通过 _setHttpClient 注入 mock，不做真实网络。
 *  - HTTP 层：默认用 global fetch（Node 18+）；超时 15s；非 2xx 抛错以便 crawler 入 DLQ。
 */

const DEFAULT_BASE = 'https://clinicaltrials.gov/api/v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BATCH = 100;
const QPS_DELAY_MS = 220; // 5 QPS = 200ms；留 10% 余量

let _httpClient = null; // 测试注入

const setHttpClient = (fn) => { _httpClient = fn; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * NCT v2 status 字段 → 我们的 trials.status（recruiting | closed | completed）
 * 上游 enum：RECRUITING / NOT_YET_RECRUITING / ACTIVE_NOT_RECRUITING /
 *          COMPLETED / TERMINATED / WITHDRAWN / SUSPENDED / UNKNOWN
 */
const mapStatus = (upstream) => {
  const s = String(upstream || '').toUpperCase();
  if (s === 'RECRUITING' || s === 'NOT_YET_RECRUITING' || s === 'ACTIVE_NOT_RECRUITING') {
    return 'recruiting';
  }
  if (s === 'COMPLETED') return 'completed';
  // TERMINATED / WITHDRAWN / SUSPENDED / UNKNOWN → closed（保守处理）
  return 'closed';
};

const callHttp = async (url) => {
  if (typeof _httpClient === 'function') {
    return _httpClient(url);
  }
  if (typeof fetch !== 'function') {
    throw new Error('global fetch not available — Node 18+ required (or inject _httpClient in tests)');
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`upstream ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
};

/**
 * 抓取一批 NCT id（最多 100），返回 normalize 后的列表。
 * 单条解析失败不影响整批；失败信息附在结果的 errors 字段里供 crawler 入 DLQ。
 *
 * @param {string[]} nctIds
 * @param {{ baseUrl?: string }} [opts]
 * @returns {Promise<{ items: Array, errors: Array<{nct_id: string, reason: string}> }>}
 */
const fetchByNctIds = async (nctIds, opts = {}) => {
  if (!Array.isArray(nctIds) || nctIds.length === 0) {
    return { items: [], errors: [] };
  }
  if (nctIds.length > MAX_BATCH) {
    throw new Error(`fetchByNctIds 单次最多 ${MAX_BATCH} 条，收到 ${nctIds.length}`);
  }

  const base = opts.baseUrl || DEFAULT_BASE;
  // v2 用 query.id=NCT0001,NCT0002 形式过滤
  const idParam = nctIds.join(',');
  const url = `${base}/studies?query.id=${encodeURIComponent(idParam)}&pageSize=${MAX_BATCH}&format=json`;

  const json = await callHttp(url);

  const items = [];
  const errors = [];
  const studies = (json && json.studies) || [];

  for (const study of studies) {
    try {
      const protocol = study.protocolSection || {};
      const id = protocol.identificationModule || {};
      const status = protocol.statusModule || {};
      const design = protocol.designModule || {};
      const contacts = protocol.contactsLocationsModule || {};

      const nct = id.nctId;
      if (!nct) throw new Error('missing nctId');

      // PRD-2026Q4 T0-1：null 守门 —— 区分上游显式 null 与字段缺失，
      // crawler.diffAndApply 据此决定是否拦截覆盖（避免上游 null 把库内真值刷掉）。
      const nullSources = {};
      const markNull = (field, present) => {
        nullSources[field] = present ? 'explicit' : 'missing';
      };

      // status：上游 statusModule.overallStatus
      let mappedStatus;
      if (Object.prototype.hasOwnProperty.call(status, 'overallStatus')) {
        const raw = status.overallStatus;
        if (raw === null || raw === undefined || raw === '') {
          mappedStatus = null;
          markNull('status', raw === null);
        } else {
          mappedStatus = mapStatus(raw);
        }
      } else {
        mappedStatus = null;
        markNull('status', false);
      }

      // phase：上游 designModule.phases (数组)
      let phase;
      if (Object.prototype.hasOwnProperty.call(design, 'phases')) {
        const raw = design.phases;
        if (raw === null) {
          phase = null;
          markNull('phase', true);
        } else if (Array.isArray(raw) && raw.length > 0) {
          phase = raw.join('/');
        } else {
          // 空数组或非数组：视为 missing（无可解析 phase 信息）
          phase = null;
          markNull('phase', false);
        }
      } else {
        phase = null;
        markNull('phase', false);
      }

      // enrolled_count：上游 statusModule.enrollmentInfo.count
      let enrolledCount;
      const enrollment = status.enrollmentInfo;
      if (enrollment && Object.prototype.hasOwnProperty.call(enrollment, 'count')) {
        const raw = enrollment.count;
        if (raw === null || raw === undefined) {
          enrolledCount = null;
          markNull('enrolled_count', raw === null);
        } else {
          const n = Number(raw);
          enrolledCount = Number.isFinite(n) ? n : null;
          if (enrolledCount === null) markNull('enrolled_count', true);
        }
      } else {
        enrolledCount = null;
        markNull('enrolled_count', false);
      }

      // locations：上游 contactsLocationsModule.locations (数组)
      let locations;
      if (Object.prototype.hasOwnProperty.call(contacts, 'locations')) {
        const raw = contacts.locations;
        if (raw === null) {
          locations = null;
          markNull('locations', true);
        } else if (Array.isArray(raw)) {
          locations = raw.map((l) => ({
            facility: l.facility || null,
            city: l.city || null,
            country: l.country || null,
            status: l.status || null
          })).slice(0, 50); // 防御：超大 locations
        } else {
          locations = null;
          markNull('locations', false);
        }
      } else {
        locations = null;
        markNull('locations', false);
      }

      items.push({
        nct_id: nct,
        upstream_status: status.overallStatus || null,
        status: mappedStatus,
        phase,
        enrolled_count: enrolledCount,
        last_update_posted: status.lastUpdatePostDateStruct && status.lastUpdatePostDateStruct.date || null,
        locations,
        _null_sources: nullSources
      });
    } catch (e) {
      errors.push({
        nct_id: (study && study.protocolSection && study.protocolSection.identificationModule && study.protocolSection.identificationModule.nctId) || 'unknown',
        reason: e.message
      });
    }
  }

  // 检查请求里有但响应里没回的 NCT —— 视为"上游未找到"（已下架很久 / id 错）
  const returnedSet = new Set(items.map((x) => x.nct_id));
  for (const requested of nctIds) {
    if (!returnedSet.has(requested) && !errors.some((e) => e.nct_id === requested)) {
      errors.push({ nct_id: requested, reason: 'not_found_upstream' });
    }
  }

  return { items, errors };
};

module.exports = {
  fetchByNctIds,
  mapStatus,
  _setHttpClient: setHttpClient,
  _MAX_BATCH: MAX_BATCH,
  _QPS_DELAY_MS: QPS_DELAY_MS,
  _sleep: sleep
};
