<template>
  <div class="privacy-promise" :class="[`size-${size}`, { dismissable }]">
    <div class="header">
      <span class="icon">🔒</span>
      <span class="title">数愈健康承诺</span>
      <button v-if="dismissable" class="close" aria-label="关闭" @click="$emit('dismiss')">×</button>
    </div>
    <ul class="bullets">
      <li>我们不存储您的任何隐私数据</li>
      <li>所有信息由您自己保管</li>
      <li>您随时可以带走或删除</li>
    </ul>
    <a v-if="showDetailsLink" class="details" href="/treatbot/privacy" target="_blank" rel="noopener">
      了解我们如何处理您的数据 →
    </a>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md'
  dismissable?: boolean
  showDetailsLink?: boolean
}>()
defineEmits<{ (e: 'dismiss'): void }>()
</script>

<style scoped>
.privacy-promise {
  border-radius: 12px;
  background: linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%);
  border: 1px solid #d1fae5;
  padding: 14px 16px;
  color: #1f2937;
  position: relative;
}

.privacy-promise.size-sm {
  padding: 10px 12px;
  font-size: 0.88rem;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
  color: #065f46;
}

.size-sm .header {
  margin-bottom: 4px;
}

.icon {
  font-size: 1.1rem;
}

.title {
  flex: 1;
}

.close {
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.close:hover {
  color: #111827;
}

.bullets {
  margin: 0;
  padding-left: 20px;
  color: #374151;
  line-height: 1.7;
}

.size-sm .bullets {
  line-height: 1.5;
  font-size: 0.85rem;
}

.bullets li {
  list-style: none;
  position: relative;
}

.bullets li::before {
  content: '✓';
  color: #10b981;
  position: absolute;
  left: -18px;
  font-weight: 700;
}

.details {
  display: inline-block;
  margin-top: 10px;
  color: #2563eb;
  font-size: 0.85rem;
  text-decoration: none;
}

.details:hover {
  text-decoration: underline;
}
</style>
