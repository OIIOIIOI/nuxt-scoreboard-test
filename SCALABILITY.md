# Scalability Considerations for WebSocket Connections

## Problem Statement

When thousands of clients connect directly to the CRG Scoreboard WebSocket server, several bottlenecks emerge:

### 1. **Direct Connection Limitations**

- **Memory**: Each WebSocket connection consumes memory for session state, registered paths, and buffers
- **CPU**: State changes trigger broadcasts to all registered clients, causing O(n) complexity
- **Network**: The scoreboard server becomes a single point of failure and bandwidth bottleneck
- **Application Impact**: The scoreboard application may slow down during high-frequency updates

### 2. **Architecture Issues**

The current architecture has all clients connecting directly to the scoreboard:
```
[1000+ Clients] → [CRG Scoreboard WebSocket Server]
```

This creates:
- Single point of failure
- No horizontal scaling
- Limited connection capacity (Jetty default limits)
- Potential impact on scoreboard performance

## Recommended Solutions

### Option 1: WebSocket Proxy/Gateway (Recommended)

Introduce a dedicated WebSocket gateway between clients and the scoreboard:

```
[1000+ Clients] → [WebSocket Gateway] → [CRG Scoreboard (1 connection)]
```

**Benefits:**
- Single connection from gateway to scoreboard (reduces load on scoreboard)
- Gateway can handle connection management, reconnection, and buffering
- Can implement rate limiting, authentication, and connection pooling
- Horizontal scaling: deploy multiple gateway instances behind a load balancer

**Implementation Options:**
- **Node.js**: Use `ws` library with a single connection to scoreboard, broadcast to all clients
- **Go**: High-performance WebSocket server (e.g., `gorilla/websocket`)
- **Nginx**: Can proxy WebSocket connections (limited customization)
- **Dedicated services**: Pusher, Ably, or similar managed services

### Option 2: Server-Sent Events (SSE) with HTTP Polling Fallback

Instead of WebSocket, use SSE for one-way updates:

```
[1000+ Clients] → [Nuxt Server API] → [CRG Scoreboard HTTP API]
```

**Benefits:**
- Simpler protocol, better HTTP/2 multiplexing
- Easier to cache and proxy
- Better browser connection limits
- Can fall back to polling if SSE unavailable

**Trade-offs:**
- One-way only (no client-to-server messages)
- Slightly higher latency than WebSocket

### Option 3: Message Queue with Pub/Sub

Use a message broker (Redis Pub/Sub, RabbitMQ, Kafka) to decouple:

```
[CRG Scoreboard] → [Message Queue] → [WebSocket Gateway] → [Clients]
```

**Benefits:**
- Complete decoupling
- Can handle millions of messages
- Multiple consumers can subscribe
- Built-in persistence and replay

**Trade-offs:**
- More complex infrastructure
- Additional latency

### Option 4: Hybrid Approach (Best for Production)

Combine multiple strategies:

```
[CRG Scoreboard] → [Redis Pub/Sub] → [WebSocket Gateway Cluster] → [CDN/Load Balancer] → [Clients]
```

**Components:**
1. **Scoreboard** publishes updates to Redis
2. **WebSocket Gateway** (multiple instances) subscribe to Redis
3. **Load Balancer** distributes client connections
4. **Clients** connect to nearest gateway instance

## Implementation Example: Node.js WebSocket Gateway

```javascript
// gateway.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// Single connection to scoreboard
const scoreboardWS = new WebSocket('ws://scoreboard:8000/WS/');

const clients = new Set();

// Connect to scoreboard and register for all paths
scoreboardWS.on('open', () => {
  scoreboardWS.send(JSON.stringify({
    action: 'Register',
    paths: [
      'ScoreBoard.CurrentGame.Team(1).Name',
      'ScoreBoard.CurrentGame.Team(2).Name',
      'ScoreBoard.CurrentGame.Team(1).Score',
      'ScoreBoard.CurrentGame.Team(2).Score',
      // ... all paths clients might need
    ]
  }));
});

// Broadcast scoreboard updates to all clients
scoreboardWS.on('message', (data) => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
});

// Handle client connections
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});
```

## Performance Estimates

### Direct Connection (Current)
- **Max connections**: ~5,000-10,000 per server (Jetty default)
- **Memory per connection**: ~50-100 KB
- **CPU impact**: High during state changes
- **Bandwidth**: N × message_size per update

### With Gateway (Recommended)
- **Max connections**: 50,000+ per gateway instance
- **Memory**: 1 connection to scoreboard + client overhead
- **CPU impact**: Minimal on scoreboard, distributed across gateways
- **Bandwidth**: 1 × message_size to gateway, then broadcast

## Monitoring Recommendations

1. **Connection metrics**: Track active WebSocket connections
2. **Message throughput**: Messages per second
3. **Latency**: Time from scoreboard update to client receipt
4. **Error rates**: Failed connections, dropped messages
5. **Resource usage**: CPU, memory, network bandwidth

## Conclusion

For production deployments with thousands of concurrent clients, **implement a WebSocket gateway** to:
- Protect the scoreboard from overload
- Enable horizontal scaling
- Improve reliability and performance
- Add features like authentication, rate limiting, and analytics

The gateway acts as a buffer, allowing the scoreboard to focus on game management while the gateway handles client distribution.
