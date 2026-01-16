import { WebSocketServer } from 'ws';
import WebSocket from 'ws';

// Configuration
const GATEWAY_PORT = process.env.GATEWAY_PORT || 8080;
const SCOREBOARD_WS_URL = process.env.SCOREBOARD_WS_URL || 'ws://192.168.1.144:8000/WS/';

// Track all connected clients
const clients = new Set();

// Accumulated state from scoreboard (sent to new clients on connect)
let accumulatedState = {};

// Create WebSocket server for clients
const wss = new WebSocketServer({
  port: GATEWAY_PORT,
  perMessageDeflate: false // Disable compression for lower latency
});

console.log(`🚀 WebSocket Gateway started on port ${GATEWAY_PORT}`);
console.log(`📡 Connecting to scoreboard at ${SCOREBOARD_WS_URL}`);

// Single connection to scoreboard
let scoreboardWS = null;
let reconnectTimer = null;
let isConnected = false;

function connectToScoreboard() {
  if (scoreboardWS?.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  console.log('Connecting to scoreboard...');
  scoreboardWS = new WebSocket(SCOREBOARD_WS_URL);

  scoreboardWS.on('open', () => {
    console.log('✅ Connected to scoreboard');
    isConnected = true;

    // Clear any reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Register for all paths that clients might need
    // You can customize this list based on what your clients actually use
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
        // Add more paths as needed
      ],
    };

    scoreboardWS.send(JSON.stringify(registerMsg));
    console.log(`📋 Registered for ${registerMsg.paths.length} paths`);
  });

  scoreboardWS.on('message', (data) => {
    // Parse and accumulate state updates
    try {
      const message = JSON.parse(data.toString());
      if (message.state && typeof message.state === 'object') {
        // Merge new state into accumulated state
        accumulatedState = { ...accumulatedState, ...message.state };
      }
    } catch (error) {
      // If parsing fails, still broadcast the raw message
      console.warn('Failed to parse scoreboard message:', error);
    }

    // Broadcast scoreboard updates to all connected clients
    // Use cached string to avoid re-stringifying
    const messageStr = data.toString();
    let clientCount = 0;
    let errorCount = 0;

    // Efficient iteration - convert Set to Array once for better performance at scale
    const clientsArray = Array.from(clients);

    for (const client of clientsArray) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          clientCount++;
        } catch (error) {
          errorCount++;
          clients.delete(client);
        }
      } else {
        // Remove closed connections
        clients.delete(client);
      }
    }

    // Only log if there are many clients or errors (reduce logging overhead)
    if (clients.size > 100 && clientCount > 0) {
      console.log(`📤 Broadcasted to ${clientCount} client(s)${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);
    }
  });

  scoreboardWS.on('error', (error) => {
    console.error('❌ Scoreboard WebSocket error:', error.message);
    isConnected = false;
  });

  scoreboardWS.on('close', () => {
    console.log('⚠️  Disconnected from scoreboard');
    isConnected = false;

    // Clear accumulated state on disconnect (will be rebuilt on reconnect)
    accumulatedState = {};

    // Attempt to reconnect after 1 second
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToScoreboard();
      }, 1000);
    }
  });
}

// Handle client connections
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  const totalClients = clients.size + 1;

  // Reduce logging frequency at scale to avoid performance impact
  if (totalClients <= 100 || totalClients % 100 === 0) {
    console.log(`🔌 New client connected from ${clientIp} (Total: ${totalClients})`);
  }

  clients.add(ws);

  // Send connection status and full accumulated state
  const initialState = {
    'Gateway.Connected': true,
    'Gateway.ScoreboardConnected': isConnected,
    ...accumulatedState,
  };

  ws.send(JSON.stringify({
    state: initialState,
  }));

  // Only log state size for first few clients or periodically
  const stateKeys = Object.keys(accumulatedState).length;
  if (isConnected && stateKeys > 0 && (clients.size <= 10 || clients.size % 50 === 0)) {
    console.log(`📦 Sent full state to new client (${stateKeys} keys)`);
  }

  ws.on('close', () => {
    clients.delete(ws);
    const remaining = clients.size;
    // Reduce logging frequency at scale
    if (remaining <= 100 || remaining % 100 === 0) {
      console.log(`🔌 Client disconnected (Total: ${remaining})`);
    }
  });

  ws.on('error', (error) => {
    console.error('Client WebSocket error:', error);
    clients.delete(ws);
  });

  // Forward client messages to scoreboard (if needed)
  // Currently, clients are read-only, but you can enable this if needed
  // ws.on('message', (message) => {
  //   if (scoreboardWS?.readyState === WebSocket.OPEN) {
  //     scoreboardWS.send(message);
  //   }
  // });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gateway...');

  // Close all client connections
  clients.forEach((client) => {
    client.close();
  });

  // Close scoreboard connection
  if (scoreboardWS) {
    scoreboardWS.close();
  }

  // Close server
  wss.close(() => {
    console.log('✅ Gateway shut down');
    process.exit(0);
  });
});

// Start connection to scoreboard
connectToScoreboard();

// Health check endpoint info
console.log(`\n📊 Gateway Status:`);
console.log(`   - Client WebSocket: ws://localhost:${GATEWAY_PORT}`);
console.log(`   - Scoreboard: ${SCOREBOARD_WS_URL}`);
console.log(`   - Clients: 0 (waiting for connections)\n`);
