<script setup lang="ts">
type SkaterRow = { id: string; number?: string; name?: string; penaltyCount?: number }

const props = withDefaults(
  defineProps<{
    teamName?: string
    skaters?: SkaterRow[]
    alignRight?: boolean
  }>(),
  {
    teamName: '',
    skaters: () => [],
    alignRight: false,
  },
)
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-white/5 p-4">
    <div :class="['text-sm font-medium', alignRight ? 'text-right' : '']">
      {{ teamName || 'Team' }}
    </div>
    <div class="mt-3 divide-y divide-white/10">
      <div
        v-for="s in skaters"
        :key="s.id"
        class="flex items-center justify-between gap-3 py-2 text-sm"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">{{ s.name ?? '—' }}</div>
        </div>
        <div class="shrink-0 flex items-center gap-2 tabular-nums text-gray-300">
          <span v-if="s.penaltyCount !== undefined" class="text-xs text-gray-400">{{ s.penaltyCount }}P</span>
          <span>{{ s.number || '—' }}</span>
        </div>
      </div>
      <div v-if="skaters.length === 0" class="py-2 text-sm text-gray-400">No skaters found.</div>
    </div>
  </div>
</template>
