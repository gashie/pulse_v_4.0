// server.js - Main Server Entry Point
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const apiRoutes = require('./routes/apiRoutes');
const { setupSocketHandlers, startAllMonitors, stopAllMonitors, startNetworkCheck, stopNetworkCheck } = require('./handlers/socketHandlers');
const state = require('./state/monitorState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3032;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup WebSocket handlers
setupSocketHandlers(io);

// Start network connectivity check
startNetworkCheck(io);

// Load saved state
console.log('[SERVER] Loading saved state...');
const loaded = state.loadState();
if (loaded) {
  console.log('[SERVER] State loaded successfully');
} else {
  console.log('[SERVER] Starting with fresh state');
}

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ██╗   ██╗██╗     ███████╗███████╗               ║
║   ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝               ║
║   ██████╔╝██║   ██║██║     ███████╗█████╗                 ║
║   ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝                 ║
║   ██║     ╚██████╔╝███████╗███████║███████╗               ║
║   ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝               ║
║                                                           ║
║   MONITOR v4.0.0    
║   AUTHOR: SIR GASHIE                                          ║
║   Real-time Infrastructure Monitoring System              ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   🌐 Server:     http://localhost:${PORT}                   ║
║   📡 WebSocket:  ws://localhost:${PORT}                     ║
║   📊 API:        http://localhost:${PORT}/api               ║
║                                                           ║
║   Features:                                               ║
║   ✅ Applications & Components                            ║
║   ✅ 6 Monitor Types (HTTP, ICMP, TCP, SSH, Telnet, SFTP) ║
║   ✅ Real-time WebSocket Updates                          ║
║   ✅ Email & SMS Notifications                            ║
║   ✅ Text-to-Speech Alerts                                ║
║   ✅ JSON Persistence                                     ║
║   ✅ PDF Reports                                          ║
║   ✅ Activity Logging with Drill-down                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Start all monitors
  console.log('[SERVER] Starting monitors...');
  startAllMonitors(io);
  
  state.addLog('info', 'Server started', { port: PORT });
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n[SERVER] ${signal} received, shutting down gracefully...`);
  
  // Stop network check
  stopNetworkCheck();
  
  // Stop all monitors
  stopAllMonitors();
  
  // Save state
  console.log('[SERVER] Saving state...');
  state.saveState();
  
  // Close server
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('[SERVER] Forcing exit...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
  state.addLog('error', `Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection at:', promise, 'reason:', reason);
  state.addLog('error', `Unhandled Rejection: ${reason}`);
});

module.exports = { app, server, io };
