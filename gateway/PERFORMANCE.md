# Gateway Performance & Scalability

## Node.js vs Java Scoreboard Capacity

### Why Node.js Gateway Can Handle More Connections

1. **Single-purpose**: Gateway only relays messages, no game logic
2. **Event-driven**: Non-blocking I/O handles many connections efficiently
3. **Lower memory per connection**: ~5-10 KB per connection vs Java's 50-100 KB+
4. **No thread overhead**: Single event loop vs Java's thread-per-connection model

### Typical Capacity Estimates

| Server Type | Typical Concurrent Connections | Notes |
|------------|--------------------------------|-------|
| **Java Scoreboard** | 1,000 - 5,000 | Limited by game logic + WebSocket overhead |
| **Node.js Gateway** | 10,000 - 30,000+ | Can scale to 100k+ with optimizations |

### Real-World Benchmarks

- **Node.js with `ws` library**: Can handle 1,000,000+ connections on beefy hardware (with OS tuning)
- **Production realistic**: 10,000-30,000 per instance is a safe target
- **Memory usage**: ~3.5 GB RAM for ~700k connections in tests

## Current Gateway Bottlenecks

### 1. **Broadcasting Performance**
- Sending to N clients is O(n) operation
- With 10,000 clients, one update = 10,000 sends
- **Solution**: Batch sends, use efficient broadcasting

### 2. **Memory Usage**
- Each connection: ~5-10 KB
- 10,000 connections ≈ 50-100 MB
- Message buffers add overhead
- **Solution**: Limit message queue size, clear old state

### 3. **CPU for JSON Serialization**
- Parsing/stringifying JSON for each message
- **Solution**: Use binary protocols (MessagePack) or optimize JSON

### 4. **OS Limits**
- File descriptor limits (default ~1024)
- **Solution**: Increase `ulimit -n` to 65535+

## Optimization Strategies

### Immediate Improvements

1. **Increase OS limits**:
   ```bash
   # Linux
   ulimit -n 65535
   # Or in /etc/security/limits.conf
   * soft nofile 65535
   * hard nofile 65535
   ```

2. **Use connection pooling**:
   - Limit per-client message queue
   - Drop slow clients gracefully

3. **Optimize broadcasting**:
   - Batch multiple updates
   - Use efficient iteration

### Horizontal Scaling

For 10,000+ connections, run multiple gateway instances:

```
[Load Balancer] → [Gateway 1] ┐
                → [Gateway 2] ├→ [Scoreboard]
                → [Gateway 3] ┘
```

- Use sticky sessions (optional)
- Each gateway connects to same scoreboard
- Distribute clients across instances

### Advanced Optimizations

1. **Message compression**: Enable `perMessageDeflate: true` for large payloads
2. **Binary protocols**: Use MessagePack instead of JSON (smaller, faster)
3. **Selective updates**: Only send changed paths, not full state
4. **Connection limits**: Reject new connections when at capacity

## Monitoring

Track these metrics:
- Active connections count
- Memory usage per connection
- Message throughput (messages/second)
- Broadcast latency
- CPU usage
- Network bandwidth

## Expected Performance

With current implementation:
- **1,000 connections**: ✅ Easy
- **10,000 connections**: ✅ Should work well
- **50,000 connections**: ⚠️ May need optimizations
- **100,000+ connections**: ⚠️ Requires horizontal scaling + optimizations

## Conclusion

The Node.js gateway will handle **significantly more** connections than the Java scoreboard (10-30x more is realistic). The bottleneck shifts from the scoreboard to the gateway, but the gateway is:
- Easier to scale horizontally
- Simpler to optimize
- Can be replicated across multiple servers

For most use cases, a single gateway instance can handle 10,000-30,000 concurrent connections comfortably.
