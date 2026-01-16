<script setup lang="ts">
type ScoreboardGameSummary = {
  id: string
  name?: string
  state?: string
}

const props = withDefaults(
  defineProps<{
    /**
     * Example: "http://localhost:8000"
     */
    baseUrl?: string
    refreshMs?: number
  }>(),
  {
    baseUrl: 'http://192.168.1.144:8000/',
    refreshMs: 10_000,
  },
)

const { data, pending, error, refresh } = await useFetch<{
  baseUrl: string
  count: number
  games: ScoreboardGameSummary[]
}>('/api/scoreboard/games', {
  query: { baseUrl: props.baseUrl },
})

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  if (!import.meta.client) return
  timer = setInterval(() => refresh(), props.refreshMs)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  timer = null
})
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-white/5 p-4">
    <div class="flex items-center justify-between gap-4">
      <div class="text-sm font-medium">Games</div>
      <div class="text-xs text-gray-400">
        <span v-if="pending">Loading…</span>
        <span v-else-if="error">Error</span>
        <span v-else>{{ data?.count ?? 0 }}</span>
      </div>
    </div>

    <div v-if="error" class="mt-3 text-sm text-rose-300">
      {{ error.message }}
    </div>

    <ul v-else class="mt-3 space-y-2">
      <li
        v-for="g in data?.games ?? []"
        :key="g.id"
        class="rounded-lg border border-white/5 bg-black/20"
      >
        <NuxtLink
          class="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/5"
          :to="{ path: `/games/${g.id}`, query: { baseUrl: props.baseUrl } }"
        >
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">
              {{ g.name ?? `Game ${g.id}` }}
            </div>
            <div class="truncate text-xs text-gray-400">id: {{ g.id }}</div>
          </div>
          <div class="shrink-0 text-xs text-gray-300">
            {{ g.state ?? '—' }}
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

