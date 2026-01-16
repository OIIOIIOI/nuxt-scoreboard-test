# WebSocket Gateway

A WebSocket gateway server that acts as a proxy between multiple clients and one or more CRG Scoreboard WebSocket servers.

## Purpose

Instead of having thousands of clients connect directly to the scoreboard(s), this gateway:
- Maintains connections to one or more scoreboard instances (by location)
- Accepts connections from multiple clients
- Routes clients to the appropriate scoreboard instance based on location
- Broadcasts scoreboard updates to clients subscribed to each location

## Installation

```bash
cd gateway
npm install
```

## Configuration

### Single Instance (Legacy)

For a single scoreboard instance, you can use the legacy configuration:

```bash
# Port for client connections (default: 8080)
export GATEWAY_PORT=8080

# Scoreboard WebSocket URL (default: ws://192.168.1.144:8000/WS/)
export SCOREBOARD_WS_URL=ws://192.168.1.144:8000/WS/
```

This will create a location named `default` automatically.

### Multiple Instances (Recommended)

For multiple scoreboard instances (e.g., different physical locations), configure each location:

```bash
# Port for client connections (default: 8080)
export GATEWAY_PORT=8080

# Define locations with LOCATION_<name> environment variables
export LOCATION_LOCATION1=ws://192.168.1.144:8000/WS/
export LOCATION_LOCATION2=ws://192.168.1.145:8000/WS/
# Add more locations as needed
```

**Location naming:**
- Use uppercase `LOCATION_` prefix
- Location name after the prefix (e.g., `LOCATION_LOCATION1`) becomes the location identifier
- Location names are case-insensitive (converted to lowercase)
- Examples: `LOCATION_VENUE_A`, `LOCATION_VENUE_B`, `LOCATION_LOCATION1`

**Example with two physical locations:**

```bash
export GATEWAY_PORT=8080
export LOCATION_VENUE_A=ws://scoreboard-venue-a.example.com:8000/WS/
export LOCATION_VENUE_B=ws://scoreboard-venue-b.example.com:8000/WS/
```

## Running

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Usage in Client

### Single Instance

Connect to the gateway (will use `default` location):

```vue
<ScoreboardCurrentScore ws-url="ws://localhost:8080" :is-gateway="true" />
```

### Multiple Instances

#### Single Location (One Connection)

Specify a single location when connecting:

```vue
<!-- Location 1 -->
<ScoreboardCurrentScore 
  ws-url="ws://localhost:8080" 
  :is-gateway="true" 
  location="location1" 
/>

<!-- Location 2 -->
<ScoreboardCurrentScore 
  ws-url="ws://localhost:8080" 
  :is-gateway="true" 
  location="location2" 
/>
```

#### Multiple Locations (One Connection)

Subscribe to multiple locations in a single connection by using comma-separated locations:

```vue
<!-- Both locations in one connection -->
<ScoreboardCurrentScore 
  ws-url="ws://localhost:8080" 
  :is-gateway="true" 
  location="location1,location2" 
/>
```

**Note:** When subscribing to multiple locations, state keys are prefixed with `Location(<name>).` to distinguish between locations. For example:
- Single location: `ScoreBoard.CurrentGame.Team(1).Score`
- Multiple locations: `Location(location1).ScoreBoard.CurrentGame.Team(1).Score`

**Location can be specified in three ways:**

1. **Query parameter** (recommended): 
   - Single: `ws://localhost:8080?location=location1`
   - Multiple: `ws://localhost:8080?location=location1,location2`
2. **Path**: `ws://localhost:8080/location1` (single location only)
3. **Component prop**: Use the `location` prop as shown above

The component will automatically append the location(s) as a query parameter to the WebSocket URL.

## Architecture

### Single Instance

```
[CRG Scoreboard] ←→ [Gateway] ←→ [Client 1, Client 2, ..., Client N]
   (1 connection)              (N connections)
```

### Multiple Instances

```
[Scoreboard A] ←→┐
                 ├→ [Gateway] ←→ [Clients for Location A]
[Scoreboard B] ←→┘              [Clients for Location B]
   (1 conn each)                 (N connections total)
```

The gateway:
- Maintains one WebSocket connection per scoreboard instance
- Routes messages to clients based on their selected location
- Maintains separate accumulated state per location
- Automatically connects to all configured locations on startup

## Features

- ✅ **Multi-instance support**: Connect to multiple scoreboard instances simultaneously
- ✅ **Location-based routing**: Clients subscribe to specific locations
- ✅ **Single connection per location**: Reduces load on each scoreboard instance
- ✅ **Automatic reconnection**: Reconnects to each scoreboard if connection drops
- ✅ **State management**: Maintains separate accumulated state per location
- ✅ **Efficient broadcasting**: Only sends updates to clients subscribed to that location
- ✅ **Connection tracking**: Logs connections per location
- ✅ **Graceful shutdown**: Cleanly closes all connections

## Monitoring

The gateway logs:
- Client connections/disconnections (per location)
- Scoreboard connection status (per location)
- Message broadcast counts (per location)
- Available locations on startup
- Errors (with location context)

**Example log output:**
```
🚀 WebSocket Gateway started on port 8080
📡 Configured locations: location1, location2
🔌 Connecting to scoreboard for location "location1" at ws://192.168.1.144:8000/WS/
✅ Connected to scoreboard for location "location1"
📋 Registered for 10 paths (location: location1)
🔌 [location1] New client connected from ::1 (Location: 1, Total: 1)
📦 [location1] Sent full state to new client (150 keys)
```

## Scaling

For production with many clients:
1. Run multiple gateway instances (one per location or load-balanced)
2. Use a load balancer (e.g., nginx, HAProxy) to distribute clients
3. Each gateway instance can connect to one or more scoreboard instances
4. Clients specify their desired location when connecting

## Historical Data (JSON)

For past and future games accessed via JSON (not WebSocket), you can merge data from multiple locations:

- Each scoreboard instance maintains its own JSON game data
- Your application can fetch from both locations and merge the results
- The gateway only handles live WebSocket data routing
- For historical data, make HTTP requests directly to each scoreboard instance's JSON endpoints
