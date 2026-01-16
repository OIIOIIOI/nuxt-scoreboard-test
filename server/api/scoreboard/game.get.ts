type SaveJsonResponse = {
  state?: Record<string, unknown>
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const baseUrl = typeof query.baseUrl === 'string' ? query.baseUrl : 'http://192.168.1.144:8000/'
  const id = typeof query.id === 'string' ? query.id : undefined
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "id" query param' })
  }

  const url = new URL('/SaveJSON/', baseUrl)
  url.searchParams.set('path', `ScoreBoard.Game(${id})`)

  let json: SaveJsonResponse = {}
  try {
    json = await $fetch<SaveJsonResponse>(url.toString())
  } catch (e) {
    // Optionally log the error for debugging
    // console.error('Error fetching game state:', e)
    json = {}
    // You could also handle this with a custom error, or by indicating an error in the response
  }
  const state = (json?.state ?? {}) as Record<string, unknown>

  const prefix = `ScoreBoard.Game(${id}).`

  const name = asString(state[`${prefix}Name`])
  const gameState = asString(state[`${prefix}State`])

  const team1Name = asString(state[`${prefix}Team(1).Name`])
  const team2Name = asString(state[`${prefix}Team(2).Name`])
  const team1Score = asNumber(state[`${prefix}Team(1).Score`])
  const team2Score = asNumber(state[`${prefix}Team(2).Score`])

  return {
    baseUrl,
    id,
    name,
    state: gameState,
    teams: [
      { id: '1', name: team1Name, score: team1Score },
      { id: '2', name: team2Name, score: team2Score },
    ],
    // keep the raw state around for debugging / later expansion
    rawState: state,
  }
})

