<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
const baseUrl = computed(() => (typeof route.query.baseUrl === 'string' ? route.query.baseUrl : 'http://192.168.1.144:8000/'))

const { data, pending, error } = await useFetch<{
  baseUrl: string
  id: string
  name?: string
  state?: string
  teams: { id: string; name?: string; score?: number }[]
  rawState: Record<string, unknown>
}>('/api/scoreboard/game', {
  query: { id, baseUrl },
})

const team1 = computed(() => data.value?.teams?.find((t: { id: string }) => t.id === '1'))
const team2 = computed(() => data.value?.teams?.find((t: { id: string }) => t.id === '2'))

type SkaterRow = { id: string; number?: string; name?: string; penaltyCount?: number }

function extractTeamSkaters(teamId: '1' | '2'): SkaterRow[] {
  const raw = data.value?.rawState
  if (!raw) return []

  const prefix = `ScoreBoard.Game(${id.value}).Team(${teamId}).Skater(`
  const ids = new Set<string>()
  for (const k of Object.keys(raw)) {
    if (!k.startsWith(prefix)) continue
    const start = prefix.length
    const end = k.indexOf(')', start)
    if (end === -1) continue
    const skaterId = k.slice(start, end)
    if (skaterId) ids.add(skaterId)
  }

  const rows: SkaterRow[] = [...ids].map((skaterId) => {
    const base = `ScoreBoard.Game(${id.value}).Team(${teamId}).Skater(${skaterId}).`
    const number = raw[`${base}RosterNumber`]
    const name = raw[`${base}Name`]
    const penaltyCount = raw[`${base}PenaltyCount`]
    return {
      id: skaterId,
      number: typeof number === 'string' ? number : undefined,
      name: typeof name === 'string' ? name : undefined,
      penaltyCount: typeof penaltyCount === 'number' ? penaltyCount : undefined,
    }
  })

  rows.sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: false, sensitivity: 'base' }))
  return rows
}

const team1Skaters = computed(() => extractTeamSkaters('1'))
const team2Skaters = computed(() => extractTeamSkaters('2'))

type JamRow = {
  jam: string
  duration?: number
  team1JamScore?: number
  team2JamScore?: number
  team1Total?: number
  team2Total?: number
  team1Jammer?: { id: string; name?: string; number?: string }
  team2Jammer?: { id: string; name?: string; number?: string }
  team1Lead?: boolean
  team2Lead?: boolean
  team1Lost?: boolean
  team2Lost?: boolean
}
type PeriodRow = { period: string; jams: JamRow[] }

function extractPeriodsAndJams(): PeriodRow[] {
  const raw = data.value?.rawState
  if (!raw) return []

  const gamePrefix = `ScoreBoard.Game(${id.value}).Period(`
  const periods = new Map<string, Set<string>>()

  for (const k of Object.keys(raw)) {
    if (!k.startsWith(gamePrefix)) continue

    // Example:
    // ScoreBoard.Game(<id>).Period(1).Jam(3).TeamJam(1).JamScore
    const pStart = gamePrefix.length
    const pEnd = k.indexOf(')', pStart)
    if (pEnd === -1) continue
    const periodId = k.slice(pStart, pEnd)
    if (!periodId) continue

    const jamNeedle = `.Jam(`
    const jamStart = k.indexOf(jamNeedle, pEnd)
    if (jamStart === -1) continue
    const jStart = jamStart + jamNeedle.length
    const jEnd = k.indexOf(')', jStart)
    if (jEnd === -1) continue
    const jamId = k.slice(jStart, jEnd)
    if (!jamId) continue

    if (!periods.has(periodId)) periods.set(periodId, new Set())
    periods.get(periodId)!.add(jamId)
  }

  function jamScoreKey(periodId: string, jamId: string, teamId: '1' | '2') {
    return `ScoreBoard.Game(${id.value}).Period(${periodId}).Jam(${jamId}).TeamJam(${teamId}).JamScore`
  }

  function jammerIdKey(periodId: string, jamId: string, teamId: '1' | '2') {
    return `ScoreBoard.Game(${id.value}).Period(${periodId}).Jam(${jamId}).TeamJam(${teamId}).Fielding(Jammer).Skater`
  }

  function jammerNumberKey(periodId: string, jamId: string, teamId: '1' | '2') {
    return `ScoreBoard.Game(${id.value}).Period(${periodId}).Jam(${jamId}).TeamJam(${teamId}).Fielding(Jammer).SkaterNumber`
  }

  function leadKey(periodId: string, jamId: string, teamId: '1' | '2') {
    return `ScoreBoard.Game(${id.value}).Period(${periodId}).Jam(${jamId}).TeamJam(${teamId}).Lead`
  }

  function lostKey(periodId: string, jamId: string, teamId: '1' | '2') {
    return `ScoreBoard.Game(${id.value}).Period(${periodId}).Jam(${jamId}).TeamJam(${teamId}).Lost`
  }

  function durationKey(periodId: string, jamId: string) {
    return `ScoreBoard.Game(${id.value}).Period(${periodId}).Jam(${jamId}).Duration`
  }

  function extractSkaterIdFromPath(path: unknown): string | undefined {
    if (typeof path !== 'string') return undefined
    // If it's a full path like "ScoreBoard.Game(<id>).Team(1).Skater(abc123)", extract the ID
    const match = path.match(/\.Skater\(([^)]+)\)/)
    return match ? match[1] : path
  }

  const periodRows: PeriodRow[] = [...periods.entries()].map(([periodId, jamIds]) => {
    const jams: JamRow[] = [...jamIds].map((jamId) => {
      const t1 = raw[jamScoreKey(periodId, jamId, '1')]
      const t2 = raw[jamScoreKey(periodId, jamId, '2')]

      // Extract jammer IDs - try .Skater first (may be path or ID), fallback to .SkaterNumber
      const t1SkaterRef = raw[jammerIdKey(periodId, jamId, '1')]
      const t2SkaterRef = raw[jammerIdKey(periodId, jamId, '2')]
      const t1SkaterNumber = raw[jammerNumberKey(periodId, jamId, '1')]
      const t2SkaterNumber = raw[jammerNumberKey(periodId, jamId, '2')]

      // Extract lead status
      const t1Lead = raw[leadKey(periodId, jamId, '1')]
      const t2Lead = raw[leadKey(periodId, jamId, '2')]

      // Extract lost status
      const t1Lost = raw[lostKey(periodId, jamId, '1')]
      const t2Lost = raw[lostKey(periodId, jamId, '2')]

      // Extract duration
      const duration = raw[durationKey(periodId, jamId)]

      // Extract skater ID from reference (handles both path format and direct ID)
      const t1JammerId = extractSkaterIdFromPath(t1SkaterRef)
      const t2JammerId = extractSkaterIdFromPath(t2SkaterRef)

      // Look up jammer info from skater lists - try by ID first, then by roster number
      let t1Jammer: SkaterRow | undefined
      if (t1JammerId) {
        t1Jammer = team1Skaters.value.find((s: SkaterRow) => s.id === t1JammerId)
      }
      if (!t1Jammer && typeof t1SkaterNumber === 'string') {
        t1Jammer = team1Skaters.value.find((s: SkaterRow) => s.number === t1SkaterNumber)
      }

      let t2Jammer: SkaterRow | undefined
      if (t2JammerId) {
        t2Jammer = team2Skaters.value.find((s: SkaterRow) => s.id === t2JammerId)
      }
      if (!t2Jammer && typeof t2SkaterNumber === 'string') {
        t2Jammer = team2Skaters.value.find((s: SkaterRow) => s.number === t2SkaterNumber)
      }

      return {
        jam: jamId,
        duration: typeof duration === 'number' ? duration : undefined,
        team1JamScore: typeof t1 === 'number' ? t1 : undefined,
        team2JamScore: typeof t2 === 'number' ? t2 : undefined,
        team1Jammer: t1Jammer ? { id: t1Jammer.id, name: t1Jammer.name, number: t1Jammer.number } : undefined,
        team2Jammer: t2Jammer ? { id: t2Jammer.id, name: t2Jammer.name, number: t2Jammer.number } : undefined,
        team1Lead: typeof t1Lead === 'boolean' ? t1Lead : t1Lead === true || t1Lead === 'true',
        team2Lead: typeof t2Lead === 'boolean' ? t2Lead : t2Lead === true || t2Lead === 'true',
        team1Lost: typeof t1Lost === 'boolean' ? t1Lost : t1Lost === true || t1Lost === 'true',
        team2Lost: typeof t2Lost === 'boolean' ? t2Lost : t2Lost === true || t2Lost === 'true',
      }
    })

    jams.sort((a, b) => a.jam.localeCompare(b.jam, undefined, { numeric: true, sensitivity: 'base' }))
    return { period: periodId, jams }
  })

  // Period(0) is used internally (e.g. pre-game / non-period context). Hide it from the UI.
  const filtered = periodRows.filter((p) => p.period !== '0')

  filtered.sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true, sensitivity: 'base' }))

  // Calculate cumulative totals across all periods and jams
  let team1RunningTotal = 0
  let team2RunningTotal = 0

  for (const periodRow of filtered) {
    for (const jam of periodRow.jams) {
      team1RunningTotal += jam.team1JamScore ?? 0
      team2RunningTotal += jam.team2JamScore ?? 0
      jam.team1Total = team1RunningTotal
      jam.team2Total = team2RunningTotal
    }
  }

  return filtered
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || ms < 0) return ''
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const periods = computed(() => extractPeriodsAndJams())

// Calculate game statistics
const gameStats = computed(() => {
  const allJams = periods.value.flatMap((p: PeriodRow) => p.jams)
  const totalJams = allJams.length

  let team1TotalPoints = 0
  let team2TotalPoints = 0
  let team1LeadCount = 0
  let team2LeadCount = 0
  let noLeadCount = 0
  let team1TotalPenalties = 0
  let team2TotalPenalties = 0
  let totalDuration = 0
  let durationCount = 0

  for (const jam of allJams) {
    team1TotalPoints += jam.team1JamScore ?? 0
    team2TotalPoints += jam.team2JamScore ?? 0
    if (jam.team1Lead) team1LeadCount++
    else if (jam.team2Lead) team2LeadCount++
    else noLeadCount++
    if (jam.duration !== undefined) {
      totalDuration += jam.duration
      durationCount++
    }
  }

  // Calculate team penalties from skaters
  const team1Penalties = team1Skaters.value.reduce((sum: number, s: SkaterRow) => sum + (s.penaltyCount ?? 0), 0)
  const team2Penalties = team2Skaters.value.reduce((sum: number, s: SkaterRow) => sum + (s.penaltyCount ?? 0), 0)

  const avgPointsPerJam1 = totalJams > 0 ? team1TotalPoints / totalJams : 0
  const avgPointsPerJam2 = totalJams > 0 ? team2TotalPoints / totalJams : 0
  const avgDuration = durationCount > 0 ? totalDuration / durationCount : 0

  const team1LeadPercent = totalJams > 0 ? (team1LeadCount / totalJams) * 100 : 0
  const team2LeadPercent = totalJams > 0 ? (team2LeadCount / totalJams) * 100 : 0
  const noLeadPercent = totalJams > 0 ? (noLeadCount / totalJams) * 100 : 0

  return {
    totalJams,
    team1TotalPoints,
    team2TotalPoints,
    team1LeadCount,
    team2LeadCount,
    noLeadCount,
    team1LeadPercent,
    team2LeadPercent,
    noLeadPercent,
    team1TotalPenalties: team1Penalties,
    team2TotalPenalties: team2Penalties,
    avgPointsPerJam1,
    avgPointsPerJam2,
    avgDuration,
  }
})

// Chart data for lead percentage (donut chart)
/* const leadChartCategories = [
  { name: 'Team 1', color: '#3b82f6' },
  { name: 'Team 2', color: '#22c55e' },
  { name: 'No Lead', color: '#f59e0b' },
] */
const leadChartCategories = computed(() => {
  const team1Name = team1.value?.name ?? 'Team 1'
  const team2Name = team2.value?.name ?? 'Team 2'

  return {
    [team1Name]: { name: team1Name, color: '#3b82f6' },
    [team2Name]: { name: team2Name, color: '#22c55e' },
    'No Lead': { name: 'No Lead', color: '#f59e0b' },
  }
})
const leadChartData = computed(() => {
  return [
    gameStats.value.team1LeadCount,
    gameStats.value.team2LeadCount,
    gameStats.value.noLeadCount,
  ]
})

</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <div class="mx-auto max-w-4xl p-6">
      <!-- Header: Game title and back link -->
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-bold tracking-tight">Game {{ id }}</h1>
        <NuxtLink class="text-sm text-gray-300 hover:text-white underline underline-offset-4" to="/">
          Back
        </NuxtLink>
      </div>

      <div class="mt-1 text-sm text-gray-400">
        Source: {{ baseUrl }}
      </div>

      <!-- Loading/Error states -->
      <div v-if="pending" class="mt-6 text-gray-300">Loading…</div>
      <div v-else-if="error" class="mt-6 text-rose-300">
        {{ error.message }}
      </div>
      <div v-else class="mt-6 space-y-6">
        <!-- Game info: State, match score, game name -->
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-sm text-gray-300">State</div>
          <div class="mt-1 text-lg font-semibold">
            {{ data?.state ?? '—' }}
          </div>

          <div class="mt-4 text-sm text-gray-300">Match</div>
          <div class="mt-1 grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
            <div class="truncate text-lg font-semibold">
              {{ team1?.name ?? 'Team 1' }}
            </div>
            <div class="text-3xl tabular-nums font-bold">
              {{ team1?.score ?? 0 }}&nbsp;-&nbsp;{{ team2?.score ?? 0 }}
            </div>
            <div class="truncate text-lg font-semibold text-right">
              {{ team2?.name ?? 'Team 2' }}
            </div>
          </div>

          <div v-if="data?.name" class="mt-4 text-sm text-gray-400">
            Name: {{ data.name }}
          </div>
        </div>

        <!-- Stats panel: Game statistics -->
        <details class="rounded-xl border border-white/10 bg-white/5 p-4" :open="true">
          <summary class="cursor-pointer select-none text-sm font-medium text-gray-300">
            Statistics
          </summary>
          <div class="mt-4 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg border border-white/10 bg-black/20 p-3">
                <div class="text-xs text-gray-400">Total Jams</div>
                <div class="mt-1 text-2xl font-bold tabular-nums">{{ gameStats.totalJams }}</div>
              </div>
              <div class="rounded-lg border border-white/10 bg-black/20 p-3">
                <div class="text-xs text-gray-400">Avg Jam Duration</div>
                <div class="mt-1 text-2xl font-bold tabular-nums">
                  {{ formatDuration(gameStats.avgDuration) || '—' }}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg border border-white/10 bg-black/20 p-3">
                <div class="text-xs text-gray-400">{{ team1?.name ?? 'Team 1' }}</div>
                <div class="mt-2 space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-300">Total Points</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.team1TotalPoints }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-300">Avg per Jam</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.avgPointsPerJam1.toFixed(1) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-300">Lead Jams</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.team1LeadCount }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-300">Total Penalties</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.team1TotalPenalties }}</span>
                  </div>
                </div>
              </div>
              <div class="rounded-lg border border-white/10 bg-black/20 p-3">
                <div class="text-xs text-gray-400 text-right">{{ team2?.name ?? 'Team 2' }}</div>
                <div class="mt-2 space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-300">Total Points</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.team2TotalPoints }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-300">Avg per Jam</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.avgPointsPerJam2.toFixed(1) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-300">Lead Jams</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.team2LeadCount }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-300">Total Penalties</span>
                    <span class="font-semibold tabular-nums">{{ gameStats.team2TotalPenalties }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-lg border border-white/10 bg-black/20 p-3">
              <div class="text-xs text-gray-400 mb-3">Lead Jammer Percentage</div>
              <DonutChart v-if="leadChartData" :data="leadChartData" :categories="leadChartCategories" :height="250"
                :radius="15" :pad-angle="0.05" :arc-width="30" />
            </div>
          </div>
        </details>

        <!-- Team rosters: Two columns showing skaters for each team -->
        <details class="rounded-xl border border-white/10 bg-white/5 p-4" :open="false">
          <summary class="cursor-pointer select-none text-sm font-medium">Rosters</summary>
          <div class="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            <TeamRoster :team-name="team1?.name ?? 'Team 1'" :skaters="team1Skaters" />
            <TeamRoster :team-name="team2?.name ?? 'Team 2'" :skaters="team2Skaters" :align-right="true" />
          </div>
        </details>

        <!-- Jams table: Period-by-period breakdown with scores and jammers -->
        <div class="rounded-xl border border-white/10 bg-white/5 p-4">
          <div class="text-sm font-medium">Jams</div>
          <div v-if="periods.length === 0" class="mt-3 text-sm text-gray-400">No jam data found.</div>

          <div v-else class="mt-4 space-y-6">
            <details v-for="p in periods" :key="p.period" :open="false">
              <summary class="cursor-pointer select-none text-sm text-gray-300">Period {{ p.period }}</summary>

              <div class="mt-2 overflow-auto rounded-lg border border-white/10">
                <table class="min-w-full text-sm">
                  <thead class="bg-black/30 text-gray-300">
                    <tr>
                      <th class="px-3 py-2 text-left font-medium">Jam</th>
                      <th class="px-3 py-2 text-right font-medium">{{ team1?.name ?? 'Team 1' }}</th>
                      <th class="px-3 py-2 text-left font-medium">{{ team2?.name ?? 'Team 2' }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/10">
                    <tr v-for="j in p.jams" :key="j.jam" class="bg-black/10">
                      <td class="px-3 py-2 text-left tabular-nums text-gray-200">
                        {{ j.jam }}
                        <span v-if="j.duration !== undefined" class="ml-2 text-xs text-gray-400">
                          {{ formatDuration(j.duration) }}
                        </span>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <div class="tabular-nums text-gray-200">
                          <span v-if="j.team1Total !== undefined" class="text-gray-600">({{ j.team1Total }})</span>
                          {{ j.team1JamScore ?? '—' }}
                        </div>
                        <div v-if="j.team1Jammer" class="mt-1 text-xs text-gray-400 flex gap-1 justify-end text-right">
                          <span>{{ j.team1Jammer.name ?? '—' }}</span>
                          <span v-if="j.team1Jammer.number">#{{ j.team1Jammer.number }}</span>
                          <span v-if="j.team1Lead"
                            :class="j.team1Lead && j.team1Lost ? 'text-red-400' : 'text-yellow-400'">
                            ★
                          </span>
                        </div>
                      </td>
                      <td class="px-3 py-2 text-left">
                        <div class="tabular-nums text-gray-200">
                          {{ j.team2JamScore ?? '—' }}
                          <span v-if="j.team2Total !== undefined" class="text-gray-600">({{ j.team2Total }})</span>
                        </div>
                        <div v-if="j.team2Jammer" class="mt-1 text-xs text-gray-400 flex gap-1">
                          <span v-if="j.team2Lead"
                            :class="j.team2Lead && j.team2Lost ? 'text-red-400' : 'text-yellow-400'">
                            ★
                          </span>
                          <span>{{ j.team2Jammer.name ?? '—' }}</span>
                          <span v-if="j.team2Jammer.number">#{{ j.team2Jammer.number }}</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>

        <!-- Raw state debug: Expandable JSON dump of all game data -->
        <details class="rounded-xl border border-white/10 bg-white/5 p-4">
          <summary class="cursor-pointer select-none text-sm text-gray-300">
            Raw state (debug)
          </summary>
          <pre class="mt-3 max-h-[50vh] overflow-auto rounded-lg bg-black/40 p-3 text-xs text-gray-200">{{
            JSON.stringify(data?.rawState ?? {}, null, 2)
          }}</pre>
        </details>
      </div>
    </div>
  </div>
</template>
