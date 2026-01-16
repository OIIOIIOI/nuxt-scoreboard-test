type SaveJsonResponse = {
  state?: Record<string, unknown>
}

type ScoreboardGameSummary = {
  id: string
  name?: string
  state?: string
}

function extractIds(state: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  for (const k of Object.keys(state)) {
    // Example key: "ScoreBoard.Game(123).Name"
    if (!k.startsWith('ScoreBoard.Game(')) continue
    const start = 'ScoreBoard.Game('.length
    const end = k.indexOf(')', start)
    if (end === -1) continue
    const id = k.slice(start, end)
    if (id) ids.add(id)
  }
  return [...ids]
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const baseUrl = typeof query.baseUrl === 'string' ? query.baseUrl : 'http://192.168.1.144:8000/'

  const url = new URL('/SaveJSON/', baseUrl)
  url.searchParams.set('path', 'ScoreBoard.Game')

  let json: SaveJsonResponse = {}
  try {
    json = await $fetch<SaveJsonResponse>(url.toString())
  } catch (e) {
    // Optionally log the error for debugging
    // console.error('Error fetching games:', e)
    json = {}
    // You could also handle this with a custom error, or by indicating an error in the response
  }
  const state = (json?.state ?? {}) as Record<string, unknown>

  const ids = extractIds(state)

  const games: ScoreboardGameSummary[] = ids.map((id) => {
    const name = state[`ScoreBoard.Game(${id}).Name`]
    const gameState = state[`ScoreBoard.Game(${id}).State`]
    return {
      id,
      name: typeof name === 'string' ? name : undefined,
      state: typeof gameState === 'string' ? gameState : undefined,
    }
  })

  games.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))

  return { baseUrl, count: games.length, games }
})

