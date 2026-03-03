<template>
  <section class="grid">
    <h2>试验详情</h2>
    <div class="card" v-if="loading">加载中...</div>
    <div class="card" v-else-if="error">{{ error }}</div>

    <div v-else-if="trial" class="grid">
      <div class="card">
        <h3>{{ trial.name }}</h3>
        <p><strong>匹配度：</strong>{{ trial.score }}%</p>
        <p><strong>适应症：</strong>{{ trial.indication }}</p>
        <p><strong>机构：</strong>{{ trial.institution }}</p>
      </div>
      <div class="card">
        <h4>研究介绍</h4>
        <p>{{ trial.description }}</p>
      </div>
      <div class="card">
        <h4>入排标准</h4>
        <p><strong>入选：</strong>{{ (trial.inclusion || []).join('；') || '待补' }}</p>
        <p><strong>排除：</strong>{{ (trial.exclusion || []).join('；') || '待补' }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../services/api'

const route = useRoute()
const loading = ref(false)
const error = ref('')
const trial = ref<Record<string, any> | null>(null)

const loadDetail = async () => {
  loading.value = true
  error.value = ''

  try {
    const payload = await api.getTrialDetail(String(route.params.id))
    trial.value = {
      id: payload.id || payload.trialId,
      name: payload.name || payload.title,
      score: Number(payload.score || payload.matchScore || 0),
      indication: payload.indication || payload.cancerType || '待补',
      institution: payload.institution || '待补',
      description: payload.description || '暂无说明',
      inclusion: payload.inclusion || payload.inclusionCriteria || [],
      exclusion: payload.exclusion || payload.exclusionCriteria || []
    }
  } catch {
    error.value = '加载详情失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>
