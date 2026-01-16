# WebSocket Gateway

A WebSocket gateway server that acts as a proxy between multiple clients and the CRG Scoreboard WebSocket server.

## Purpose

Instead of having thousands of clients connect directly to the scoreboard, this gateway:
- Maintains a single connection to the scoreboard
- Accepts connections from multiple clients
- Broadcasts scoreboard updates to all connected clients

## Installation

```bash
cd gateway
npm install
```

## Configuration

Set environment variables (optional):

```bash
# Port for client connections (default: 8080)
export GATEWAY_PORT=8080

# Scoreboard WebSocket URL (default: ws://192.168.1.144:8000/WS/)
export SCOREBOARD_WS_URL=ws://192.168.1.144:8000/WS/
```

## Running

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Usage in Client

Update your client component to connect to the gateway instead of the scoreboard:

```vue
<ScoreboardCurrentScore ws-url="ws://localhost:8080" />
```

Or use environment variables:

```vue
<ScoreboardCurrentScore 
  :ws-url="`ws://${gatewayHost}:${gatewayPort}`" 
/>
```

## Architecture

```
[CRG Scoreboard] ←→ [Gateway] ←→ [Client 1, Client 2, ..., Client N]
   (1 connection)              (N connections)
```

## Features

- ✅ Single connection to scoreboard (reduces load)
- ✅ Automatic reconnection to scoreboard
- ✅ Broadcasts updates to all clients
- ✅ Connection tracking and logging
- ✅ Graceful shutdown

## Monitoring

The gateway logs:
- Client connections/disconnections
- Scoreboard connection status
- Message broadcast counts
- Errors

## Scaling

For production with many clients:
1. Run multiple gateway instances
2. Use a load balancer (e.g., nginx, HAProxy) to distribute clients
3. All gateways connect to the same scoreboard instance
