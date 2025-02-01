import express, { Request, Response } from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import client from "prom-client";
import cors from "cors";

const app = express();
const httpServer = createServer(app);
// app.use(cors());
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket"] // Force WebSocket only
});

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics()

const connectedClients = new client.Gauge({
  name: 'socket_active_connections',
  help: "Number of active Websocket connections"
})

const totalConnections = new client.Counter({
  name: "socket_total_connections",
  help: "Number of active Websocket connections"
});

const messagesReceived = new client.Counter({
  name: "socket_messages_received",
  help: "Total Messages Received"
});

const responseTime = new client.Histogram({
  name: "socket_response_time",
  help: "Time taken to respond a message",
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});


io.on("connection", (socket) => {
  totalConnections.inc();
  connectedClients.inc();
  console.log(`New client connected: ${socket.id}`);

  socket.on("message", (data: any, callback: (data: string) => void) => {
    const start = process.hrtime();
    messagesReceived.inc();

    console.log(`Message received: ${data}`);
    
    // Simulate processing 
    setTimeout(() => {
      
      const diff = process.hrtime(start);
      const responseDuration = diff[0] + diff[1] / 1e9;
      responseTime.observe(responseDuration);

      //callback(`Message received: ${data}`)
    }, Math.random() * 500);
  })

  socket.on("disconnect", () => {
    connectedClients.dec();
    console.log(`Client disconnected: ${socket.id}`);
  })
})


// Expose Prometheus metrics
app.get("/metrics", async (req: Request, res: Response) => {
  console.log("GET /metrics 200 OK");
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
})


// Start Server
const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
})
