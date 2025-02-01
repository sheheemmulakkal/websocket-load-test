import express, { Request, Response } from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import client from "prom-client";
import cluster from "cluster";
import { cpus } from "os";
import { Worker } from "cluster";

const numCPUs = cpus().length;

if (cluster.isPrimary) {
  console.log(`Primary process ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Restart workers if they exit
  cluster.on("exit", (worker: Worker, code: number, signal: string) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  const app = express();
  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["polling", "websocket"], // WebSocket support
  });

  // Prometheus Metrics
  const collectDefaultMetrics = client.collectDefaultMetrics;
  collectDefaultMetrics();

  const connectedClients = new client.Gauge({
    name: "socket_active_connections",
    help: "Number of active WebSocket connections",
  });

  const totalConnections = new client.Counter({
    name: "socket_total_connections",
    help: "Total WebSocket connections",
  });

  const messagesReceived = new client.Counter({
    name: "socket_messages_received",
    help: "Total Messages Received",
  });

  const responseTime = new client.Histogram({
    name: "socket_response_time",
    help: "Time taken to respond to a message",
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  });

  io.on("connection", (socket) => {
    totalConnections.inc();
    connectedClients.inc();
    console.log(`Worker ${process.pid}: New client connected: ${socket.id}`);

    socket.on("message", (data: any, callback: (data: string) => void) => {
      const start = process.hrtime();
      messagesReceived.inc();
      console.log(`Message received: ${data}`);

      // Simulate processing
      setTimeout(() => {
        const diff = process.hrtime(start);
        const responseDuration = diff[0] + diff[1] / 1e9;
        responseTime.observe(responseDuration);
      }, Math.random() * 500);
    });

    socket.on("disconnect", () => {
      connectedClients.dec();
      console.log(`Worker ${process.pid}: Client disconnected: ${socket.id}`);
    });
  });

  // Expose Prometheus metrics
  app.get("/metrics", async (req: Request, res: Response) => {
    console.log(`Worker ${process.pid}: GET /metrics 200 OK`);
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  });

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`Worker ${process.pid}: Server running on http://localhost:${PORT}`);
  });
}
