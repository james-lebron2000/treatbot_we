<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  label?: string
  placeholder?: string
  type?: 'text' | 'tel' | 'email' | 'password' | 'number' | 'search'
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search'
  autocomplete?: string
  maxlength?: number
}>(), {
  type: 'text',
  required: false,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'blur', ev: FocusEvent): void
  (e: 'focus', ev: FocusEvent): void
}>()

const inputId = useId()
const hasError = computed(() => Boolean(props.error))
const describedBy = computed(() => {
  if (props.error) return `${inputId}-error`
  if (props.hint) return `${inputId}-hint`
  return undefined
})
</script>

<template>
  <div class="app-input" :class="{ 'is-error': hasError, 'is-disabled': disabled }">
    <label v-if="label" :for="inputId" class="app-input__label">
      {{ label }}<span v-if="required" class="req">*</span>
    </label>
    <input
      :id="inputId"
      class="app-input__field"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :inputmode="inputmode"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      :aria-invalid="hasError"
      :aria-describedby="describedBy"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
    />
    <p v-if="error" :id="`${inputId}-error`" class="app-input__error">{{ error }}</p>
    <p v-else-if="hint" :id="`${inputId}-hint`" class="app-input__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  font-family: var(--font-sans);
}
.app-input__label {
  font-size: var(--fs-callout);
  font-weight: 600;
  color: var(--text);
  line-height: var(--lh-tight);
}
.req { color: var(--red); margin-left: 2px; }
.app-input__field {
  width: 100%;
  min-height: var(--size-tap);
  padding: var(--s-3) var(--s-4);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-normal);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  transition: border-color 0.15s, box-shadow 0.15s;
  -webkit-appearance: none;
}
.app-input__field::placeholder { color: var(--text-muted); }
.app-input__field:focus { outline: none; border-color: var(--brand); box-shadow: var(--shadow-focus); }
.app-input.is-error .app-input__field { border-color: var(--red); }
.app-input.is-error .app-input__field:focus { box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.18); }
.app-input.is-disabled .app-input__field { background: var(--bg-soft); cursor: not-allowed; opacity: 0.7; }
.app-input__hint { margin: 0; font-size: var(--fs-caption); color: var(--text-muted); }
.app-input__error { margin: 0; font-size: var(--fs-caption); color: var(--red); }
</style>
