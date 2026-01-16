# Multi-Location Support

## Overview

The gateway supports connecting to multiple CRG Scoreboard instances simultaneously, each representing a different physical location. This allows clients to subscribe to live updates from any location while maintaining a single gateway endpoint.

## Architecture

### Live Data (WebSocket)

- **Gateway**: Connects to multiple scoreboard instances (one per location)
- **Clients**: Specify location when connecting via query parameter or path
- **Routing**: Messages are routed to clients based on their selected location
- **State**: Separate accumulated state maintained per location

### Historical Data (JSON/HTTP)

Historical game data is accessed via HTTP endpoints (`/SaveJSON/`) on each scoreboard instance. To merge data from multiple locations:

1. **Option A: Client-side merging** - Fetch from multiple locations and merge in the frontend
2. **Option B: Server-side merging** - Create merged API endpoints that fetch from all locations

## Implementation Strategy

### Live WebSocket Data

✅ **Already implemented** - The gateway supports multiple locations via:
- Environment variables: `LOCATION_<name>=ws://host:port/WS/`
- Client location selection via query parameter or path
- Automatic routing of messages to appropriate clients

### Historical JSON Data

#### Option 1: Merged API Endpoints (Recommended)

Create merged versions of the API endpoints that fetch from all configured locations:

**Example: `/api/scoreboard/games-merged.get.ts`**
```typescript
// Fetches games from all configured locations and merges them
// Returns games with location metadata
```

**Example: `/api/scoreboard/game-merged.get.ts`**
```typescript
// Fetches a specific game from all locations (in case same game ID exists in multiple)
// Or searches across locations for a game
```

#### Option 2: Location Configuration

Create a configuration file that maps location names to their HTTP base URLs:

```typescript
// server/utils/locations.ts
export const LOCATIONS = {
  location1: {
    ws: 'ws://192.168.1.144:8000/WS/',
    http: 'http://192.168.1.144:8000/',
  },
  location2: {
    ws: 'ws://192.168.1.145:8000/WS/',
    http: 'http://192.168.1.145:8000/',
  },
}
```

Then update API endpoints to accept `locations` query parameter:
- `?locations=location1,location2` - Fetch from specific locations
- `?locations=all` - Fetch from all configured locations

#### Option 3: Client-Side Merging

Update frontend components to:
- Accept multiple `baseUrl` values
- Fetch from each location
- Merge results client-side
- Display location indicator for each game

## Recommended Approach

**For Live Data**: ✅ Use the gateway with location-based routing (already implemented)

**For Historical Data**: Use **Option 1** (Merged API Endpoints) because:
- Centralized logic for merging
- Consistent data format
- Better error handling
- Can add location metadata to game objects
- Easier to deduplicate if same game exists in multiple locations

## Example: Merged Games Endpoint

```typescript
// server/api/scoreboard/games-merged.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  
  // Get locations from config or query parameter
  const locations = getLocations(query.locations)
  
  // Fetch games from all locations in parallel
  const results = await Promise.allSettled(
    locations.map(loc => 
      $fetch('/api/scoreboard/games', { 
        query: { baseUrl: loc.http } 
      })
    )
  )
  
  // Merge games, adding location metadata
  const allGames = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const location = locations[index]
      result.value.games.forEach(game => {
        allGames.push({
          ...game,
          location: location.name,
          locationBaseUrl: location.http,
        })
      })
    }
  })
  
  // Deduplicate by ID (if same game exists in multiple locations)
  // Sort by name/date
  // Return merged list
})
```

## Location Configuration

To keep locations in sync between gateway and API:

1. **Environment Variables** (Current approach)
   - Gateway: `LOCATION_<name>=ws://...`
   - API: Could use same pattern with `LOCATION_<name>_HTTP=http://...`

2. **Configuration File** (Recommended for production)
   - Single source of truth
   - Easier to manage
   - Can be version controlled

3. **Database/Config Service** (For dynamic locations)
   - Store location config in database
   - Update without restarting services

## Next Steps

1. ✅ Gateway multi-instance support (DONE)
2. ✅ Client location selection (DONE)
3. ⏳ Create merged API endpoints for historical data
4. ⏳ Add location configuration management
5. ⏳ Update frontend to use merged endpoints
6. ⏳ Add location indicators in UI
