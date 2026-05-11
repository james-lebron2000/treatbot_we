<script setup lang="ts">
import { dialogState, close } from '../composables/useDialog'
import AppDialog from './AppDialog.vue'
import AppInput from './AppInput.vue'
import AppButton from './AppButton.vue'

const onConfirm = () => {
  if (dialogState.kind === 'prompt') {
    close(dialogState.inputValue || '')
  } else if (dialogState.kind === 'alert') {
    close(undefined as any)
  } else {
    close(true)
  }
}

const onCancel = () => {
  if (dialogState.kind === 'prompt') close(null)
  else if (dialogState.kind === 'alert') close(undefined as any)
  else close(false)
}
</script>

<template>
  <AppDialog
    :open="dialogState.open"
    :title="dialogState.title"
    :description="dialogState.description"
    :confirm-text="dialogState.confirmText"
    :variant="dialogState.variant"
    :loading="dialogState.loading"
    @update:open="(v) => { if (!v) onCancel() }"
    @confirm="onConfirm"
    @cancel="onCancel"
  >
    <AppInput
      v-if="dialogState.kind === 'prompt'"
      v-model="dialogState.inputValue"
      :placeholder="dialogState.placeholder"
      autocomplete="off"
    />
    <template #footer>
      <AppButton
        v-if="dialogState.kind !== 'alert'"
        variant="ghost"
        :disabled="dialogState.loading"
        @click="onCancel"
      >
        {{ dialogState.cancelText }}
      </AppButton>
      <AppButton
        :variant="dialogState.variant === 'danger' ? 'danger' : 'primary'"
        :loading="dialogState.loading"
        @click="onConfirm"
      >
        {{ dialogState.confirmText }}
      </AppButton>
    </template>
  </AppDialog>
</template>
