<template>
  <section class="grid">
    <h2>试验详情</h2>
    <div class="card" v-if="loading">加载中...</div>
    <div class="card" v-else-if="error">{{ error }}</div>

    <div v-else-if="trial" class="grid">
      <div class="card">
        <h3>{{ trial.name }}</h3>
        <p><strong>匹配度：</strong><span :style="{ color: trial.score >= 70 ? '#16a34a' : trial.score >= 50 ? '#d97706' : '#dc2626' }">{{ trial.score }}%</span></p>
        <p><strong>适应症：</strong>{{ trial.indication }}</p>
        <p><strong>申办方：</strong>{{ trial.sponsor }}</p>
        <p><strong>状态：</strong>{{ trial.statusText || trial.status }}</p>
      </div>

      <div class="card" v-if="trial.reasons && trial.reasons.length">
        <h4>匹配依据</h4>
        <p v-for="r in trial.reasons" :key="r" style="color:#16a34a;font-size:0.9rem;">{{ r }}</p>
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

      <div class="card" v-if="trial.hospitals && trial.hospitals.length">
        <h4>研究中心</h4>
        <p v-for="h in trial.hospitals" :key="h" style="font-size:0.9rem;">{{ h }}</p>
      </div>

      <div class="card" v-if="trial.required_documents">
        <h4>报名所需资料</h4>
        <p style="white-space:pre-wrap;">{{ trial.required_documents }}</p>
      </div>

      <div class="card" v-if="trial.patient_subsidy">
        <h4>患者补助</h4>
        <p>{{ trial.patient_subsidy }}</p>
      </div>

      <div class="card" v-if="trial.contact && trial.contact.phone">
        <h4>联系方式</h4>
        <p>{{ trial.contact.name }}：{{ trial.contact.phone }}</p>
      </div>

      <div class="card" style="text-align:center;">
        <button v-if="!applied" @click="applyTrial" :disabled="applying" style="padding:0.8rem 2rem;font-size:1rem;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;">
          {{ applying ? '提交中...' : '申请报名' }}
        </button>
        <div v-else class="card" style="background:#f0fdf4;border-color:#86efac;text-align:left;">
          <p style="color:#166534;font-weight:bold;margin:0 0 6px;">申请已提交</p>
          <p style="color:#374151;font-size:0.9rem;margin:0;line-height:1.6;">
            {{ trial.sponsor || '研究机构' }}的工作人员将在 <strong>3 个工作日内</strong>通过电话联系您，请保持手机畅通。
          </p>
          <p style="color:#6b7280;font-size:0.8rem;margin:8px 0 0;">
            您可以在"申请"页面查看所有申请状态。
          </p>
        </div>
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
const applying = ref(false)
const applied = ref(false)

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
      sponsor: payload.sponsor || payload.institution || '待补',
      status: payload.status,
      statusText: payload.statusText || '',
      description: payload.description || '暂无说明',
      inclusion: payload.inclusion || payload.inclusionCriteria || [],
      exclusion: payload.exclusion || payload.exclusionCriteria || [],
      reasons: payload.reasons || [],
      required_documents: payload.required_documents || '',
      patient_subsidy: payload.patient_subsidy || '',
      hospitals: payload.hospitals || [],
      contact: payload.contact || {}
    }
  } catch {
    error.value = '加载详情失败'
  } finally {
    loading.value = false
  }
}

const applyTrial = async () => {
  if (!trial.value) return
  applying.value = true
  try {
    await api.applyTrial({ trialId: trial.value.id })
    applied.value = true
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '申请失败'
    alert(msg)
  } finally {
    applying.value = false
  }
}

onMounted(loadDetail)
</script>
