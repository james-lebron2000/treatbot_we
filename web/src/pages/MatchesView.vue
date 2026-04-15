<template>
  <section class="grid">
    <h2>为您匹配的临床试验</h2>

    <!-- 患者诊断摘要（可折叠） -->
    <details v-if="hasRecord" class="record-summary-toggle" open>
      <summary class="summary-trigger">我的诊断信息 <span class="toggle-hint">{{ summaryOpen ? '收起' : '展开' }}</span></summary>
      <RecordSummaryCard :record="patientStore.structuredRecord" />
    </details>

    <p class="muted" v-if="total > 0">共找到 {{ total }} 个可能适合的试验，按匹配度排列</p>

    <!-- 筛选栏 -->
    <div v-if="filterOptions.phases.length || filterOptions.cities.length" style="display:flex;gap:0.5rem;flex-wrap:wrap">
      <select v-model="filterPhase" @change="resetAndLoad">
        <option value="">全部阶段</option>
        <option v-for="p in filterOptions.phases" :key="p" :value="p">{{ p }}</option>
      </select>
      <select v-model="filterCity" @change="resetAndLoad">
        <option value="">全部城市</option>
        <option v-for="c in filterOptions.cities" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="filterStatus" @change="resetAndLoad">
        <option value="">全部状态</option>
        <option value="recruiting">招募中</option>
        <option value="closed">已关闭</option>
      </select>
    </div>

    <div class="card" v-if="loading" style="text-align:center;padding:30px;">
      <div style="color:#2563eb;">正在匹配中...</div>
    </div>
    <div class="card" v-else-if="error">{{ error }}</div>
    <div v-else-if="!matches.length && !loading" class="card" style="text-align:center;padding:20px;">
      <p style="color:#6b7280;">暂未找到匹配的试验</p>
      <p style="font-size:0.85rem;color:#9ca3af;">请确认病历已完成识别，或尝试补充更多信息</p>
      <router-link to="/upload" class="btn ghost" style="margin-top:8px;">重新上传</router-link>
    </div>

    <div v-for="match in matches" :key="match.id" class="card grid" style="gap:6px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <h3 style="margin:0;font-size:0.95rem;flex:1;">{{ match.name }}</h3>
        <span :style="matchLevelStyle(match.score)" style="padding:2px 8px;border-radius:4px;font-size:0.8rem;white-space:nowrap;margin-left:8px;">
          {{ matchLevelText(match.score) }}
        </span>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        <span class="badge">{{ match.phase }}</span>
        <span class="badge">{{ match.location }}</span>
        <span class="badge" v-if="match.statusText">{{ match.statusText }}</span>
      </div>

      <!-- 匹配理由（人话化） -->
      <div v-if="match.reasons && match.reasons.length" style="display:flex;flex-wrap:wrap;gap:4px;margin:2px 0">
        <span v-for="(reason, idx) in humanizeReasons(match.reasons).slice(0, 4)" :key="idx"
              style="font-size:0.75rem;padding:2px 6px;border-radius:3px;background:#e8f5e9;color:#2e7d32">
          {{ reason }}
        </span>
      </div>

      <p style="margin:0;font-size:0.85rem;color:#6b7280;">{{ match.indication }} | {{ match.institution }}</p>

      <div style="display:flex;gap:8px;">
        <button class="btn ghost" @click="goDetail(match.id)" style="flex:1;">查看详情</button>
        <button class="btn primary" @click="apply(match)" style="flex:1;" :disabled="match.applied">
          {{ match.applied ? '已申请' : '我想参加' }}
        </button>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" style="display:flex;justify-content:center;gap:8px;margin-top:1rem">
      <button class="btn ghost" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">上一页</button>
      <span class="muted" style="line-height:2.2">{{ currentPage }} / {{ totalPages }}</span>
      <button class="btn ghost" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">下一页</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { sortMatches } from '../utils/schema'
import { usePatientStore } from '../stores/patient'
import RecordSummaryCard from '../components/RecordSummaryCard.vue'

const router = useRouter()
const patientStore = usePatientStore()

const hasRecord = computed(() => Object.keys(patientStore.structuredRecord || {}).length > 0)
const summaryOpen = ref(true)

const loading = ref(false)
const error = ref('')
const matches = ref<Record<string, any>[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const totalPages = computed(() => Math.ceil(total.value / pageSize))

const filterPhase = ref('')
const filterCity = ref('')
const filterStatus = ref('')
const filterOptions = ref<{ phases: string[]; cities: string[] }>({ phases: [], cities: [] })

const matchLevelText = (score: number) => {
  if (score >= 80) return '高度匹配'
  if (score >= 65) return '值得关注'
  if (score >= 50) return '可以了解'
  return '仅供参考'
}

const matchLevelStyle = (score: number) => {
  if (score >= 80) return { background: '#dcfce7', color: '#166534' }
  if (score >= 65) return { background: '#fef3c7', color: '#92400e' }
  if (score >= 50) return { background: '#e0e7ff', color: '#3730a3' }
  return { background: '#f3f4f6', color: '#6b7280' }
}

// 将工程术语转为患者能理解的话
const reasonMap: [RegExp, string][] = [
  [/ECOG体能评分.*符合/, '体能状态符合要求'],
  [/ECOG体能评分默认符合/, '体能状态符合要求'],
  [/ECOG体能评分.*超出/, '体能状态可能不符'],
  [/诊断.*匹配|疾病.*匹配/, '癌症类型匹配'],
  [/疾病标签.*命中/, '癌症类型匹配'],
  [/基因.*匹配|突变.*匹配/, '基因检测结果匹配'],
  [/分期匹配/, '疾病分期匹配'],
  [/治疗线.*匹配/, '治疗阶段匹配'],
  [/PD-?L1.*匹配|pdl1/i, 'PD-L1 检测匹配'],
  [/城市匹配|地点匹配/, '有您所在城市的医院'],
  [/招募中/, '正在招募患者'],
  [/泛.*实体瘤/, '适用于多种实体瘤']
]

const humanizeReasons = (reasons: string[]) => {
  return reasons.map((r) => {
    for (const [pattern, friendly] of reasonMap) {
      if (pattern.test(r)) return friendly
    }
    return r
  })
}

const normalize = (item: Record<string, any>) => ({
  id: item.id || item.trialId,
  name: item.name || item.title,
  score: Number(item.score || item.matchScore || 0),
  phase: item.phase || '待补',
  location: item.location || '待补',
  indication: item.indication || item.cancerType || '待补',
  institution: item.institution || '待补',
  reasons: item.reasons || [],
  statusText: item.statusText || '',
  updatedAt: item.updatedAt || item.createdAt || '',
  applied: false
})

const loadMatches = async () => {
  loading.value = true
  error.value = ''
  try {
    const params: Record<string, unknown> = {
      recordId: patientStore.currentRecordId || undefined,
      page: currentPage.value,
      pageSize
    }
    if (filterPhase.value) params.phase = filterPhase.value
    if (filterCity.value) params.city = filterCity.value
    if (filterStatus.value) params.status = filterStatus.value

    const payload = await api.getMatches(params)
    const list = Array.isArray(payload) ? payload : payload.list || payload.items || payload.trials || payload.matches || []
    matches.value = sortMatches(list.map(normalize))
    total.value = payload.pagination?.total || list.length
  } catch {
    error.value = '加载匹配结果失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const resetAndLoad = () => { currentPage.value = 1; loadMatches() }

const loadFilterOptions = async () => {
  try {
    const opts = await api.getFilterOptions()
    filterOptions.value = { phases: opts.phases || [], cities: opts.cities || opts.locations || [] }
  } catch { /* non-fatal */ }
}

const goPage = (page: number) => { currentPage.value = page; loadMatches(); window.scrollTo({ top: 0, behavior: 'smooth' }) }

const goDetail = (id: string) => { router.push(`/matches/${id}`) }

const apply = async (match: any) => {
  if (match.applied) return
  try {
    await api.applyTrial({ trialId: match.id, recordId: patientStore.currentRecordId || '' })
    match.applied = true
    alert('申请已提交！研究机构将在 3 个工作日内通过电话联系您。')
  } catch (err: any) {
    alert(err?.response?.data?.message || '申请失败，请稍后重试')
  }
}

onMounted(() => { loadMatches(); loadFilterOptions() })
</script>

<style scoped>
.record-summary-toggle {
  margin-bottom: 4px;
}

.summary-trigger {
  cursor: pointer;
  font-size: 0.9rem;
  color: #2563eb;
  font-weight: 500;
  padding: 6px 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.summary-trigger::-webkit-details-marker {
  display: none;
}

.summary-trigger::before {
  content: '▸';
  transition: transform 0.2s;
}

details[open] > .summary-trigger::before {
  transform: rotate(90deg);
}

.toggle-hint {
  font-size: 0.78rem;
  color: #9ca3af;
  font-weight: 400;
}
</style>
