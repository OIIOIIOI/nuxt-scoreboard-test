<script setup lang="ts">
type WsUpdate = { state?: Record<string, unknown> }

const props = withDefaults(
  defineProps<{
    /**
     * WebSocket URL - can be direct scoreboard (ws://host:port/WS/) or gateway (ws://host:port)
     * Example: "ws://localhost:8000/WS/" (direct) or "ws://localhost:8080" (gateway)
     */
    wsUrl?: string
    /**
     * Explicitly specify if connecting through a gateway.
     * If not provided, will auto-detect based on URL (gateway if URL doesn't end with /WS/)
     */
    isGateway?: boolean
  }>(),
  {
    wsUrl: 'ws://192.168.1.144:8000/WS/',
    isGateway: undefined,
  },
)

// Auto-detect gateway connection: gateway URLs don't end with /WS/
const isGatewayConnection = computed(() => {
  if (props.isGateway !== undefined) return props.isGateway
  return !props.wsUrl.endsWith('/WS/')
})

const connected = ref(false)
const lastError = ref<string | null>(null)

const state = ref<Record<string, unknown>>({})

const team1Name = computed(() => String(state.value['ScoreBoard.CurrentGame.Team(1).Name'] ?? 'Team 1'))
const team2Name = computed(() => String(state.value['ScoreBoard.CurrentGame.Team(2).Name'] ?? 'Team 2'))
const team1Score = computed(() => Number(state.value['ScoreBoard.CurrentGame.Team(1).Score'] ?? 0))
const team2Score = computed(() => Number(state.value['ScoreBoard.CurrentGame.Team(2).Score'] ?? 0))
const currentPeriodId = computed(() => {
  const periodId = state.value['ScoreBoard.CurrentGame.CurrentPeriod']
  return periodId !== undefined ? String(periodId) : null
})

// Find the period number by matching Period(*).Id with currentPeriodId
const currentPeriodNumber = computed(() => {
  if (!currentPeriodId.value) return null

  // Look through all Period(*).Id keys to find the one matching currentPeriodId
  const periodPrefix = 'ScoreBoard.CurrentGame.Period('
  const idSuffix = ').Id'

  for (const key of Object.keys(state.value)) {
    if (!key.startsWith(periodPrefix) || !key.endsWith(idSuffix)) continue

    // Extract period number from key: Period(1).Id -> "1"
    const periodNum = key.slice(periodPrefix.length, key.length - idSuffix.length)

    // Check if this period's ID matches the current period ID
    if (String(state.value[key]) === currentPeriodId.value) {
      return periodNum
    }
  }

  return null
})

const currentPeriod = computed(() => {
  if (!currentPeriodNumber.value) return null

  // Get the period number value
  const periodNumber = state.value[`ScoreBoard.CurrentGame.Period(${currentPeriodNumber.value}).Number`]

  // If no Number field exists, use the period number from parentheses
  return periodNumber !== undefined ? String(periodNumber) : currentPeriodNumber.value
})

const currentJam = computed(() => {
  if (!currentPeriodNumber.value) return null

  const jam = state.value[`ScoreBoard.CurrentGame.Period(${currentPeriodNumber.value}).CurrentJamNumber`]

  return jam !== undefined ? String(jam) : null
})

const periodClockTime = computed(() => {
  const time = state.value['ScoreBoard.CurrentGame.Clock(Period).Time']
  return time !== undefined ? Number(time) : null
})

// Format time in milliseconds as MM:SS
function formatTime(timeMs: number | null): string | null {
  if (timeMs === null) return null

  // Convert milliseconds to seconds
  const totalSeconds = Math.floor(timeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const formattedPeriodClock = computed(() => formatTime(periodClockTime.value))

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function connect() {
  clearReconnectTimer()
  lastError.value = null

  ws = new WebSocket(props.wsUrl)

  ws.onopen = () => {
    connected.value = true

    // Only register for paths if connecting directly to scoreboard
    // Gateway connections receive all updates without registration
    if (!isGatewayConnection.value) {
      const registerMsg = {
        action: 'Register',
        paths: [
          'ScoreBoard.CurrentGame.Team(1).Name',
          'ScoreBoard.CurrentGame.Team(2).Name',
          'ScoreBoard.CurrentGame.Team(1).Score',
          'ScoreBoard.CurrentGame.Team(2).Score',
          'ScoreBoard.CurrentGame.CurrentPeriod',
          'ScoreBoard.CurrentGame.Period(*).Id',
          'ScoreBoard.CurrentGame.Period(*).Number',
          'ScoreBoard.CurrentGame.Period(*).CurrentJamNumber',
          'ScoreBoard.CurrentGame.Clock(Period).Time',
          'ScoreBoard.CurrentGame.Clock(Period).InvertedTime',
        ],
      }

      ws?.send(JSON.stringify(registerMsg))
    }
  }

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data) as WsUpdate
      // console.log(msg.state)
      if (msg.state && typeof msg.state === 'object') {
        state.value = { ...state.value, ...msg.state }
      }
    } catch (e) {
      // ignore malformed messages
    }
  }

  ws.onerror = () => {
    lastError.value = 'WebSocket error'
  }

  ws.onclose = () => {
    connected.value = false
    ws = null
    clearReconnectTimer()
    reconnectTimer = setTimeout(connect, 1000)
  }
}

onMounted(() => {
  connect()
})

onBeforeUnmount(() => {
  clearReconnectTimer()
  ws?.close()
  ws = null
})
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-white/5 p-4">
    <div class="flex items-center justify-between gap-4">
      <div class="text-sm text-gray-300">
        <span class="mr-2 inline-block h-2 w-2 rounded-full" :class="connected ? 'bg-emerald-400' : 'bg-rose-400'" />
        <span class="font-medium">{{ connected ? 'Live' : 'Disconnected' }}</span>
        <span v-if="lastError" class="ml-2 text-gray-400">({{ lastError }})</span>
      </div>
      <div class="text-xs text-gray-400">
        {{ wsUrl }}
        <span v-if="isGatewayConnection" class="ml-1 text-emerald-400">(via gateway)</span>
        <span v-else class="ml-1 text-blue-400">(direct)</span>
      </div>
    </div>

    <div class="flex flex-col gap-2 items-center">
      <!-- Score -->
      <div class="flex items-baseline justify-between gap-3">
        <div class="truncate text-lg font-semibold">
          {{ team1Name }}
        </div>
        <div class="text-3xl tabular-nums font-bold">
          {{ team1Score }}&nbsp;-&nbsp;{{ team2Score }}
        </div>
        <div class="truncate text-lg font-semibold text-right">
          {{ team2Name }}
        </div>
      </div>
      <!-- Period and Jam -->
      <div class="text-2xl font-bold flex flex-col">
        <div v-if="currentPeriod !== null || currentJam !== null"
          class="mt-3 flex items-center justify-center gap-2 text-base text-gray-400">
          <span v-if="currentPeriod !== null">Period {{ currentPeriod }}</span>
          <span v-if="currentPeriod !== null && currentJam !== null">•</span>
          <span v-if="currentJam !== null">Jam {{ currentJam }}</span>
        </div>
        <span class="text-center" v-if="formattedPeriodClock !== null">{{ formattedPeriodClock }}</span>
      </div>
    </div>
  </div>
</template>
