<template>
  <main class="app-shell">
    <header class="app-header">
      <h1>Treatbot 患者端</h1>
      <nav>
        <RouterLink to="/upload">上传</RouterLink>
        <RouterLink to="/matches">匹配</RouterLink>
        <RouterLink to="/profile">我的</RouterLink>
      </nav>
    </header>
    <section class="app-main">
      <RouterView />
    </section>
  </main>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>
