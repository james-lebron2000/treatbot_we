<template>
  <section class="grid">
    <h2>匹配结果</h2>
    <p class="muted">按匹配分从高到低排序，同分按更新时间排序。</p>

    <div class="card" v-if="loading">加载中...</div>
    <div class="card" v-else-if="error">{{ error }}</div>

    <div v-for="match in matches" :key="match.id" class="card grid">
      <div>
        <span class="badge">{{ match.phase }}</span>
        <span class="badge">{{ match.location }}</span>
        <span class="badge">{{ match.type }}</span>
      </div>
      <h3 style="margin:0">{{ match.name }}</h3>
      <p><strong>匹配度：</strong>{{ match.score }}%</p>
      <p><strong>癌种/适应症：</strong>{{ match.indication }}</p>
      <p><strong>机构：</strong>{{ match.institution }}</p>
      <p><strong>入组摘要：</strong>{{ match.inclusionSummary || '待补' }}</p>
      <div>
        <button class="btn ghost" @click="goDetail(match.id)">查看详情</button>
        <button class="btn primary" style="margin-left:8px" @click="apply(match.id)">立即报名</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { sortMatches } from '../utils/schema'
import { usePatientStore } from '../stores/patient'

const router = useRouter()
const patientStore = usePatientStore()

const loading = ref(false)
const error = ref('')
const matches = ref<Record<string, any>[]>([])

const normalize = (item: Record<string, any>) => ({
  id: item.id || item.trialId,
  name: item.name || item.title,
  score: Number(item.score || item.matchScore || 0),
  phase: item.phase || '待补',
  location: item.location || '待补',
  type: item.type || '临床研究',
  indication: item.indication || item.cancerType || '待补',
  institution: item.institution || '待补',
  inclusionSummary: item.inclusionSummary || item.inclusion || '',
  updatedAt: item.updatedAt || item.createdAt || ''
})

const loadMatches = async () => {
  loading.value = true
  error.value = ''

  try {
    const payload = await api.getMatches({
      recordId: patientStore.currentRecordId || undefined
    })
    const list = Array.isArray(payload)
      ? payload
      : payload.list || payload.items || payload.trials || payload.matches || []
    matches.value = sortMatches(list.map(normalize))
  } catch {
    error.value = '加载匹配结果失败'
  } finally {
    loading.value = false
  }
}

const goDetail = (id: string) => {
  router.push(`/matches/${id}`)
}

const apply = async (id: string) => {
  try {
    await api.applyTrial({ trialId: id, recordId: patientStore.currentRecordId || '' })
    window.alert('报名成功')
  } catch (error: any) {
    window.alert(error?.message || '后端暂未开放报名接口')
  }
}

onMounted(loadMatches)
</script>
