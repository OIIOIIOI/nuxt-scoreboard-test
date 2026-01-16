import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { parse } from 'node:url';

// Configuration
const GATEWAY_PORT = process.env.GATEWAY_PORT || 8080;

// Multi-instance configuration
// Format: LOCATION_NAME=ws://host:port/WS/
// Example: LOCATION1=ws://192.168.1.144:8000/WS/, LOCATION2=ws://192.168.1.145:8000/WS/
const locations = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('LOCATION_')) {
    const locationName = key.replace('LOCATION_', '').toLowerCase();
    locations[locationName] = value;
  }
}

// Fallback to single instance if no locations configured
if (Object.keys(locations).length === 0) {
  const defaultUrl = process.env.SCOREBOARD_WS_URL || 'ws://192.168.1.144:8000/WS/';
  locations['default'] = defaultUrl;
  console.log('⚠️  No LOCATION_* env vars found, using SCOREBOARD_WS_URL or default');
}

// Track clients by location
const clientsByLocation = new Map(); // location -> Set of WebSocket clients

// Track which locations each client is subscribed to
const clientSubscriptions = new Map(); // WebSocket -> Set of location names

// Accumulated state per location
const accumulatedStateByLocation = new Map(); // location -> state object

// Scoreboard connections per location
const scoreboardConnections = new Map(); // location -> { ws, reconnectTimer, isConnected }

// Create WebSocket server for clients
const wss = new WebSocketServer({
  port: GATEWAY_PORT,
  perMessageDeflate: false // Disable compression for lower latency
});

console.log(`🚀 WebSocket Gateway started on port ${GATEWAY_PORT}`);
console.log(`📡 Configured locations: ${Object.keys(locations).join(', ')}`);

function connectToScoreboard(location) {
  const conn = scoreboardConnections.get(location);
  if (conn?.ws?.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  const wsUrl = locations[location];
  if (!wsUrl) {
    console.error(`❌ No WebSocket URL configured for location: ${location}`);
    return;
  }

  console.log(`🔌 Connecting to scoreboard for location "${location}" at ${wsUrl}`);
  const ws = new WebSocket(wsUrl);

  const connectionInfo = {
    ws,
    reconnectTimer: null,
    isConnected: false,
  };
  scoreboardConnections.set(location, connectionInfo);

  ws.on('open', () => {
    console.log(`✅ Connected to scoreboard for location "${location}"`);
    connectionInfo.isConnected = true;

    // Clear any reconnect timer
    if (connectionInfo.reconnectTimer) {
      clearTimeout(connectionInfo.reconnectTimer);
      connectionInfo.reconnectTimer = null;
    }

    // Register for all paths that clients might need
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

    ws.send(JSON.stringify(registerMsg));
    console.log(`📋 Registered for ${registerMsg.paths.length} paths (location: ${location})`);
  });

  ws.on('message', (data) => {
    // Parse and accumulate state updates for this location
    try {
      const message = JSON.parse(data.toString());
      if (message.state && typeof message.state === 'object') {
        // Get or create accumulated state for this location
        let locationState = accumulatedStateByLocation.get(location);
        if (!locationState) {
          locationState = {};
          accumulatedStateByLocation.set(location, locationState);
        }
        // Merge new state into accumulated state
        accumulatedStateByLocation.set(location, { ...locationState, ...message.state });
      }
    } catch (error) {
      // If parsing fails, still broadcast the raw message
      console.warn(`Failed to parse scoreboard message for location "${location}":`, error);
    }

    // Broadcast scoreboard updates only to clients subscribed to this location
    const clients = clientsByLocation.get(location);
    if (!clients || clients.size === 0) {
      return; // No clients for this location
    }

    // Parse the message to prefix keys with location for multi-location clients
    let message;
    let messageStr;
    try {
      message = JSON.parse(data.toString());
      // Prefix state keys with location for clients subscribed to multiple locations
      if (message.state && typeof message.state === 'object') {
        const prefixedState = {};
        for (const [key, value] of Object.entries(message.state)) {
          prefixedState[`Location(${location}).${key}`] = value;
        }
        message.state = prefixedState;
        messageStr = JSON.stringify(message);
      } else {
        messageStr = data.toString();
      }
    } catch (error) {
      // If parsing fails, send raw message
      messageStr = data.toString();
    }

    let clientCount = 0;
    let errorCount = 0;

    // Efficient iteration - convert Set to Array once for better performance at scale
    const clientsArray = Array.from(clients);

    for (const client of clientsArray) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          // Check if client is subscribed to multiple locations
          const clientLocs = clientSubscriptions.get(client);
          if (clientLocs && clientLocs.size > 1) {
            // Send prefixed version for multi-location clients
            client.send(messageStr);
          } else {
            // Send original message for single-location clients (backward compatible)
            client.send(data.toString());
          }
          clientCount++;
        } catch (error) {
          errorCount++;
          clients.delete(client);
          clientSubscriptions.delete(client);
        }
      } else {
        // Remove closed connections
        clients.delete(client);
        clientSubscriptions.delete(client);
      }
    }

    // Only log if there are many clients or errors (reduce logging overhead)
    if (clients.size > 100 && clientCount > 0) {
      console.log(`📤 [${location}] Broadcasted to ${clientCount} client(s)${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ [${location}] Scoreboard WebSocket error:`, error.message);
    connectionInfo.isConnected = false;
  });

  ws.on('close', () => {
    console.log(`⚠️  [${location}] Disconnected from scoreboard`);
    connectionInfo.isConnected = false;

    // Clear accumulated state on disconnect (will be rebuilt on reconnect)
    accumulatedStateByLocation.delete(location);

    // Attempt to reconnect after 1 second
    if (!connectionInfo.reconnectTimer) {
      connectionInfo.reconnectTimer = setTimeout(() => {
        connectionInfo.reconnectTimer = null;
        connectToScoreboard(location);
      }, 1000);
    }
  });
}

// Handle client connections
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  
  // Extract location(s) from query parameter or path
  // Examples: 
  //   ws://gateway:8080?location=location1 (single)
  //   ws://gateway:8080?location=location1,location2 (multiple)
  //   ws://gateway:8080/location1 (single, path-based)
  const url = parse(req.url || '', true);
  let locationParam = url.query?.location || url.pathname?.replace(/^\//, '') || 'default';
  
  // Parse comma-separated locations
  const requestedLocations = String(locationParam)
    .split(',')
    .map(loc => loc.toLowerCase().trim())
    .filter(loc => loc.length > 0);
  
  // Validate all locations exist
  const invalidLocations = requestedLocations.filter(loc => !locations[loc]);
  if (invalidLocations.length > 0) {
    console.error(`❌ Invalid location(s) "${invalidLocations.join(', ')}" requested by ${clientIp}. Available: ${Object.keys(locations).join(', ')}`);
    ws.close(1008, `Invalid location(s): ${invalidLocations.join(', ')}. Available: ${Object.keys(locations).join(', ')}`);
    return;
  }

  // Store client subscriptions
  const clientLocs = new Set(requestedLocations);
  clientSubscriptions.set(ws, clientLocs);

  // Add client to each location's client set
  for (const location of requestedLocations) {
    let clients = clientsByLocation.get(location);
    if (!clients) {
      clients = new Set();
      clientsByLocation.set(location, clients);
    }
    clients.add(ws);
  }

  const totalClientsAllLocations = Array.from(clientsByLocation.values()).reduce((sum, s) => sum + s.size, 0);
  const locationList = requestedLocations.join(', ');

  // Reduce logging frequency at scale to avoid performance impact
  if (totalClientsAllLocations <= 100 || totalClientsAllLocations % 100 === 0) {
    console.log(`🔌 [${locationList}] New client connected from ${clientIp} (Total: ${totalClientsAllLocations})`);
  }

  // Build initial state from all subscribed locations
  const initialState = {
    'Gateway.Connected': true,
    'Gateway.Locations': requestedLocations,
  };

  // Merge states from all subscribed locations, prefixing keys with location
  for (const location of requestedLocations) {
    const conn = scoreboardConnections.get(location);
    const isConnected = conn?.isConnected || false;
    
    // Add connection status for this location
    initialState[`Gateway.Location(${location}).Connected`] = isConnected;
    
    // Get accumulated state for this location
    const locationState = accumulatedStateByLocation.get(location) || {};
    
    // Prefix all state keys with location
    for (const [key, value] of Object.entries(locationState)) {
      initialState[`Location(${location}).${key}`] = value;
    }
    
    // Ensure we're connected to the scoreboard for this location
    if (!conn || !conn.isConnected) {
      connectToScoreboard(location);
    }
  }

  ws.send(JSON.stringify({
    state: initialState,
  }));

  // Only log state size for first few clients or periodically
  const totalStateKeys = Object.keys(initialState).length;
  if (totalStateKeys > 0 && (totalClientsAllLocations <= 10 || totalClientsAllLocations % 50 === 0)) {
    console.log(`📦 [${locationList}] Sent initial state to new client (${totalStateKeys} keys from ${requestedLocations.length} location(s))`);
  }

  ws.on('close', () => {
    // Remove client from all subscribed locations
    const clientLocs = clientSubscriptions.get(ws);
    if (clientLocs) {
      for (const location of clientLocs) {
        const clients = clientsByLocation.get(location);
        if (clients) {
          clients.delete(ws);
          // Clean up empty location sets
          if (clients.size === 0) {
            clientsByLocation.delete(location);
          }
        }
      }
    }
    clientSubscriptions.delete(ws);
    
    const remainingAll = Array.from(clientsByLocation.values()).reduce((sum, s) => sum + s.size, 0);
    
    // Reduce logging frequency at scale
    if (remainingAll <= 100 || remainingAll % 100 === 0) {
      const locList = clientLocs ? Array.from(clientLocs).join(', ') : 'unknown';
      console.log(`🔌 [${locList}] Client disconnected (Total: ${remainingAll})`);
    }
  });

  ws.on('error', (error) => {
    const clientLocs = clientSubscriptions.get(ws);
    const locList = clientLocs ? Array.from(clientLocs).join(', ') : 'unknown';
    console.error(`[${locList}] Client WebSocket error:`, error);
    
    // Clean up on error
    if (clientLocs) {
      for (const location of clientLocs) {
        const clients = clientsByLocation.get(location);
        if (clients) {
          clients.delete(ws);
        }
      }
    }
    clientSubscriptions.delete(ws);
  });

  // Forward client messages to scoreboard (if needed)
  // Currently, clients are read-only, but you can enable this if needed
  // ws.on('message', (message) => {
  //   const conn = scoreboardConnections.get(location);
  //   if (conn?.ws?.readyState === WebSocket.OPEN) {
  //     conn.ws.send(message);
  //   }
  // });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gateway...');

  // Close all client connections
  for (const clients of clientsByLocation.values()) {
    clients.forEach((client) => {
      client.close();
    });
  }
  clientSubscriptions.clear();

  // Close all scoreboard connections
  for (const conn of scoreboardConnections.values()) {
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
    }
    if (conn.ws) {
      conn.ws.close();
    }
  }

  // Close server
  wss.close(() => {
    console.log('✅ Gateway shut down');
    process.exit(0);
  });
});

// Start connections to all configured scoreboards
for (const location of Object.keys(locations)) {
  connectToScoreboard(location);
}

// Health check endpoint info
console.log(`\n📊 Gateway Status:`);
console.log(`   - Client WebSocket: ws://localhost:${GATEWAY_PORT}`);
console.log(`   - Available locations:`);
for (const [location, url] of Object.entries(locations)) {
  console.log(`     • ${location}: ${url}`);
}
console.log(`   - Usage: ws://localhost:${GATEWAY_PORT}?location=<location_name>`);
console.log(`   - Or: ws://localhost:${GATEWAY_PORT}/<location_name>`);
console.log(`   - Clients: 0 (waiting for connections)\n`);
