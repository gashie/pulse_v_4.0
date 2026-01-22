// handlers/socketHandlers.js - WebSocket Event Handlers
const state = require('../state/monitorState');
const { checkMonitorOnce, validateMonitorConfig, executeRemoteCommand } = require('../monitors/monitorEngine');
const { sendAlertNotification, speak } = require('../services/notificationService');

// Active monitor intervals
const monitorIntervals = new Map();

// Broadcast to all clients
const broadcast = (io, event, data) => {
  io.emit(event, data);
};

// ==================== SETUP SOCKET HANDLERS ====================

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    state.addLog('info', 'Client connected', { socketId: socket.id });
    
    // Send initial state
    socket.emit('init', {
      monitors: state.getAllMonitors(),
      applications: state.getAllApplications(),
      groups: state.getAllGroups(),
      statuses: state.getAllStatuses(),
      alerts: state.getAllAlerts(),
      incidents: state.getIncidents(50),
      contacts: state.getAllContacts(),
      contactGroups: state.getAllContactGroups(),
      settings: state.getSettings(),
      stats: state.getStats(),
      logs: state.getLogs({ limit: 50 }),
      activityLogs: state.getActivityLogs({ limit: 50 })
    });
    
    // ==================== APPLICATIONS ====================
    
    socket.on('application:create', (data, callback) => {
      try {
        const app = state.createApplication(data);
        broadcast(io, 'applications-update', state.getAllApplications());
        callback?.({ success: true, application: app });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('application:update', (data, callback) => {
      try {
        const app = state.updateApplication(data.id, data);
        if (app) {
          broadcast(io, 'applications-update', state.getAllApplications());
          callback?.({ success: true, application: app });
        } else {
          callback?.({ success: false, error: 'Application not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('application:delete', (id, callback) => {
      try {
        const result = state.deleteApplication(id);
        if (result) {
          broadcast(io, 'applications-update', state.getAllApplications());
          broadcast(io, 'monitors-update', state.getAllMonitors());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Application not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('application:health', (id, callback) => {
      try {
        const health = state.getApplicationHealth(id);
        callback?.({ success: true, health });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('application:add-monitor', (data, callback) => {
      try {
        const result = state.addMonitorToApplication(data.applicationId, data.monitorId);
        if (result) {
          broadcast(io, 'applications-update', state.getAllApplications());
          broadcast(io, 'monitors-update', state.getAllMonitors());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Failed to add monitor' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('application:remove-monitor', (data, callback) => {
      try {
        const result = state.removeMonitorFromApplication(data.applicationId, data.monitorId);
        if (result) {
          broadcast(io, 'applications-update', state.getAllApplications());
          broadcast(io, 'monitors-update', state.getAllMonitors());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Failed to remove monitor' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== MONITORS ====================
    
    socket.on('monitor:create', async (data, callback) => {
      try {
        const validation = validateMonitorConfig(data);
        if (!validation.valid) {
          callback?.({ success: false, errors: validation.errors });
          return;
        }
        
        const monitor = state.createMonitor(data);
        broadcast(io, 'monitors-update', state.getAllMonitors());
        broadcast(io, 'statuses-update', state.getAllStatuses());
        
        // Start monitoring if enabled
        if (monitor.enabled) {
          startMonitorInterval(io, monitor.id);
          // Run first check immediately
          runCheck(io, monitor.id);
        }
        
        callback?.({ success: true, monitor });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('monitor:update', async (data, callback) => {
      try {
        const monitor = state.updateMonitor(data.id, data);
        if (monitor) {
          broadcast(io, 'monitors-update', state.getAllMonitors());
          broadcast(io, 'applications-update', state.getAllApplications());
          
          // Restart monitoring if schedule changed
          stopMonitorInterval(data.id);
          if (monitor.enabled) {
            startMonitorInterval(io, monitor.id);
          }
          
          callback?.({ success: true, monitor });
        } else {
          callback?.({ success: false, error: 'Monitor not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('monitor:delete', (id, callback) => {
      try {
        stopMonitorInterval(id);
        const result = state.deleteMonitor(id);
        if (result) {
          broadcast(io, 'monitors-update', state.getAllMonitors());
          broadcast(io, 'statuses-update', state.getAllStatuses());
          broadcast(io, 'applications-update', state.getAllApplications());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Monitor not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('monitor:toggle', (id, callback) => {
      try {
        const monitor = state.getMonitor(id);
        if (monitor) {
          const updated = state.updateMonitor(id, { enabled: !monitor.enabled });
          
          if (updated.enabled) {
            startMonitorInterval(io, id);
            runCheck(io, id);
          } else {
            stopMonitorInterval(id);
          }
          
          broadcast(io, 'monitors-update', state.getAllMonitors());
          callback?.({ success: true, enabled: updated.enabled });
        } else {
          callback?.({ success: false, error: 'Monitor not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('monitor:check-now', async (id, callback) => {
      try {
        await runCheck(io, id);
        callback?.({ success: true });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('monitor:test', async (config, callback) => {
      try {
        const validation = validateMonitorConfig(config);
        if (!validation.valid) {
          callback?.({ success: false, errors: validation.errors });
          return;
        }
        
        const result = await checkMonitorOnce(config);
        callback?.({ success: true, result });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== SSH COMMAND EXECUTION ====================
    
    socket.on('monitor:execute-command', async (data, callback) => {
      try {
        const monitor = state.getMonitor(data.monitorId);
        if (!monitor) {
          callback?.({ success: false, error: 'Monitor not found' });
          return;
        }
        
        if (monitor.type !== 'ssh' && monitor.type !== 'sftp') {
          callback?.({ success: false, error: 'Monitor is not SSH/SFTP type' });
          return;
        }
        
        // Get full monitor with credentials
        const fullMonitor = state.monitors ? 
          Array.from(state.monitors?.values?.() || []).find(m => m.id === data.monitorId) :
          monitor;
        
        state.addActivity('execute_command', 'monitor', data.monitorId, {
          name: monitor.name,
          command: data.command.substring(0, 100)
        });
        
        const result = await executeRemoteCommand(fullMonitor || monitor, data.command);
        
        state.addLog(result.success ? 'info' : 'warn', 
          `SSH command ${result.success ? 'succeeded' : 'failed'}: ${data.command.substring(0, 50)}`,
          { monitorId: data.monitorId, exitCode: result.exitCode });
        
        callback?.(result);
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== GROUPS ====================
    
    socket.on('group:create', (data, callback) => {
      try {
        const group = state.createGroup(data);
        broadcast(io, 'groups-update', state.getAllGroups());
        callback?.({ success: true, group });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('group:update', (data, callback) => {
      try {
        const group = state.updateGroup(data.id, data);
        if (group) {
          broadcast(io, 'groups-update', state.getAllGroups());
          callback?.({ success: true, group });
        } else {
          callback?.({ success: false, error: 'Group not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('group:delete', (id, callback) => {
      try {
        const result = state.deleteGroup(id);
        if (result) {
          broadcast(io, 'groups-update', state.getAllGroups());
          broadcast(io, 'monitors-update', state.getAllMonitors());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Group not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('group:get-monitors', (id, callback) => {
      try {
        const groupWithMonitors = state.getGroupWithMonitors(id);
        callback?.({ success: true, group: groupWithMonitors });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== CONTACTS ====================
    
    socket.on('contact:create', (data, callback) => {
      try {
        const contact = state.createContact(data);
        broadcast(io, 'contacts-update', state.getAllContacts());
        callback?.({ success: true, contact });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contact:update', (data, callback) => {
      try {
        const contact = state.updateContact(data.id, data);
        if (contact) {
          broadcast(io, 'contacts-update', state.getAllContacts());
          callback?.({ success: true, contact });
        } else {
          callback?.({ success: false, error: 'Contact not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contact:delete', (id, callback) => {
      try {
        const result = state.deleteContact(id);
        if (result) {
          broadcast(io, 'contacts-update', state.getAllContacts());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Contact not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== CONTACT GROUPS ====================
    
    socket.on('contactGroup:create', (data, callback) => {
      try {
        const group = state.createContactGroup(data);
        broadcast(io, 'contactGroups-update', state.getAllContactGroups());
        callback?.({ success: true, group });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contactGroup:update', (data, callback) => {
      try {
        const group = state.updateContactGroup(data.id, data);
        if (group) {
          broadcast(io, 'contactGroups-update', state.getAllContactGroups());
          callback?.({ success: true, group });
        } else {
          callback?.({ success: false, error: 'Contact group not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contactGroup:delete', (id, callback) => {
      try {
        const result = state.deleteContactGroup(id);
        if (result) {
          broadcast(io, 'contactGroups-update', state.getAllContactGroups());
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: 'Contact group not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contactGroup:add-member', (data, callback) => {
      try {
        const group = state.getContactGroup(data.groupId);
        if (!group) {
          callback?.({ success: false, error: 'Contact group not found' });
          return;
        }
        
        if (!group.contactIds) {
          group.contactIds = [];
        }
        
        // Add contact if not already in group
        if (!group.contactIds.includes(data.contactId)) {
          group.contactIds.push(data.contactId);
          state.updateContactGroup(data.groupId, group);
          
          state.addActivity('member_added', 'contactGroup', data.groupId, {
            name: group.name,
            relatedEntities: [data.contactId],
            action: `Added contact to group`
          });
          
          broadcast(io, 'contactGroups-update', state.getAllContactGroups());
          callback?.({ success: true, group });
        } else {
          callback?.({ success: false, error: 'Contact already in group' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contactGroup:remove-member', (data, callback) => {
      try {
        const group = state.getContactGroup(data.groupId);
        if (!group) {
          callback?.({ success: false, error: 'Contact group not found' });
          return;
        }
        
        if (group.contactIds && Array.isArray(group.contactIds)) {
          group.contactIds = group.contactIds.filter(id => id !== data.contactId);
          state.updateContactGroup(data.groupId, group);
          
          state.addActivity('member_removed', 'contactGroup', data.groupId, {
            name: group.name,
            relatedEntities: [data.contactId],
            action: `Removed contact from group`
          });
          
          broadcast(io, 'contactGroups-update', state.getAllContactGroups());
          callback?.({ success: true, group });
        } else {
          callback?.({ success: false, error: 'Failed to remove member' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('contactGroup:get-members', (id, callback) => {
      try {
        const group = state.getContactGroup(id);
        if (!group) {
          callback?.({ success: false, error: 'Contact group not found' });
          return;
        }
        
        const members = (group.contactIds || [])
          .map(contactId => state.getContact(contactId))
          .filter(c => c !== null);
        
        callback?.({ success: true, group, members });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== ALERTS ====================
    
    socket.on('alert:acknowledge', (id, callback) => {
      try {
        const alert = state.acknowledgeAlert(id);
        if (alert) {
          broadcast(io, 'alerts-update', state.getAllAlerts());
          callback?.({ success: true, alert });
        } else {
          callback?.({ success: false, error: 'Alert not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('alert:resolve', (id, callback) => {
      try {
        const alert = state.resolveAlert(id);
        if (alert) {
          broadcast(io, 'alerts-update', state.getAllAlerts());
          callback?.({ success: true, alert });
        } else {
          callback?.({ success: false, error: 'Alert not found' });
        }
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== SETTINGS ====================
    
    socket.on('settings:update', (data, callback) => {
      try {
        const settings = state.updateSettings(data);
        broadcast(io, 'settings-update', state.getSettings());
        callback?.({ success: true, settings: state.getSettings() });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('settings:test-tts', async (text, callback) => {
      try {
        const result = await speak(text || 'This is a test of the text to speech system.', { force: true });
        callback?.(result);
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== ACTIVITY LOGS ====================
    
    socket.on('activity:get', (options, callback) => {
      try {
        const logs = state.getActivityLogs(options);
        callback?.({ success: true, logs });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('activity:detail', (id, callback) => {
      try {
        const detail = state.getActivityDetail(id);
        callback?.({ success: true, detail });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== EXPORT/IMPORT ====================
    
    socket.on('export', (callback) => {
      try {
        const data = state.exportData();
        callback?.({ success: true, data });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    socket.on('import', (data, callback) => {
      try {
        const result = state.importData(data);
        if (result.success) {
          // Restart all monitors with a delay to allow UI to update
          stopAllMonitors();
          setTimeout(() => {
            startAllMonitors(io);
          }, 500);
          
          broadcast(io, 'monitors-update', state.getAllMonitors());
          broadcast(io, 'applications-update', state.getAllApplications());
          broadcast(io, 'groups-update', state.getAllGroups());
          broadcast(io, 'statuses-update', state.getAllStatuses());
          broadcast(io, 'contacts-update', state.getAllContacts());
          broadcast(io, 'contactGroups-update', state.getAllContactGroups());
        }
        callback?.(result);
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== STATS ====================
    
    socket.on('stats:get', (callback) => {
      try {
        callback?.({ success: true, stats: state.getStats() });
      } catch (error) {
        callback?.({ success: false, error: error.message });
      }
    });
    
    // ==================== DISCONNECT ====================
    
    socket.on('disconnect', () => {
      state.addLog('info', 'Client disconnected', { socketId: socket.id });
    });
  });
};

// ==================== MONITOR EXECUTION ====================

const runCheck = async (io, monitorId) => {
  const monitor = state.getMonitor(monitorId);
  if (!monitor) return;
  
  try {
    const result = await checkMonitorOnce(monitor);
    const previousStatus = state.getStatus(monitorId);
    
    state.updateStatus(monitorId, result);
    
    broadcast(io, 'statuses-update', state.getAllStatuses());
    broadcast(io, 'stats-update', state.getStats());
    
    // Check for status change and send notifications
    if (previousStatus?.status !== result.status) {
      broadcast(io, 'alerts-update', state.getAllAlerts());
      broadcast(io, 'incidents-update', state.getIncidents(50));
      broadcast(io, 'logs-update', state.getLogs({ limit: 50 }));
      broadcast(io, 'activity-update', state.getActivityLogs({ limit: 50 }));
      
      // Send notifications for DOWN status
      if (result.status === 'DOWN') {
        // Get the alert that was just created (incident creates alert immediately)
        const alert = state.getAllAlerts().find(a => 
          a.monitorId === monitorId && a.status === 'active' && new Date(a.createdAt) > new Date(Date.now() - 5000)
        );
        
        if (alert) {
          await sendAlertNotification(alert, monitor);
        }
      } else if (result.status === 'UP' && previousStatus?.status === 'DOWN') {
        // Send recovery notifications
        const alert = state.getAllAlerts().find(a => 
          a.monitorId === monitorId && a.status === 'active'
        );
        
        if (alert) {
          alert.status = 'resolved';
          alert.resolvedAt = new Date().toISOString();
          await sendAlertNotification(alert, monitor);
          broadcast(io, 'alerts-update', state.getAllAlerts());
        }
      }
    }
  } catch (error) {
    state.addLog('error', `Check failed for ${monitor.name}: ${error.message}`, { monitorId });
  }
};

const startMonitorInterval = (io, monitorId) => {
  const monitor = state.getMonitor(monitorId);
  if (!monitor || !monitor.enabled) return;
  
  // Clear existing interval if any
  stopMonitorInterval(monitorId);
  
  const intervalMs = (monitor.schedule || 60) * 1000;
  const interval = setInterval(() => runCheck(io, monitorId), intervalMs);
  
  monitorIntervals.set(monitorId, interval);
  state.addLog('info', `Started monitoring: ${monitor.name} (every ${monitor.schedule}s)`, { monitorId });
};

const stopMonitorInterval = (monitorId) => {
  const interval = monitorIntervals.get(monitorId);
  if (interval) {
    clearInterval(interval);
    monitorIntervals.delete(monitorId);
  }
};

const startAllMonitors = (io) => {
  state.getEnabledMonitors().forEach((monitor, index) => {
    startMonitorInterval(io, monitor.id);
    // Run initial checks with staggered timing (important for startup)
    const delay = index * 500; // 500ms between each monitor's first check
    setTimeout(() => runCheck(io, monitor.id), delay);
  });
};

const stopAllMonitors = () => {
  monitorIntervals.forEach((interval, id) => {
    clearInterval(interval);
  });
  monitorIntervals.clear();
};

// ==================== NETWORK CONNECTIVITY CHECK ====================

let networkCheckInterval = null;
let lastNetworkNotificationTime = 0;
let lastNetworkNotificationType = null; // Track which type of notification was last sent
const NETWORK_NOTIFICATION_COOLDOWN = 60000; // 60 seconds between notifications (prevent spam)
let networkStatusChangeDetected = false;

const checkNetworkConnectivity = async (io) => {
  const https = require('https');
  const http = require('http');
  const previousStatus = state.getNetworkStatus().isConnected;
  
  try {
    // Try multiple reliable endpoints with faster timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Network check timeout'));
      }, 6000); // Reduced from 8000ms for faster detection
      
      const tryConnection = () => {
        const req = https.get('https://www.google.com', { timeout: 4000 }, (res) => {
          clearTimeout(timeout);
          console.log('[NETWORK] Connected - status:', res.statusCode);
          req.destroy();
          resolve(res);
        });
        
        req.on('error', (error) => {
          // If HTTPS fails, try HTTP
          console.log('[NETWORK] HTTPS failed:', error.message);
          clearTimeout(timeout);
          reject(error);
        });
      };
      
      tryConnection();
    });
    
    // If we get here, network is connected
    const newStatus = state.setNetworkStatus(true);
    console.log('[NETWORK] Status set to CONNECTED');
    
    // Broadcast and notify if status changed FROM DISCONNECTED TO CONNECTED
    if (previousStatus === false && newStatus.isConnected === true) {
      console.log('[NETWORK] Status changed from false to true - broadcasting and notifying');
      broadcast(io, 'network-status', newStatus);
      state.addLog('info', 'Network connectivity restored', {});
      
      // Send network recovery notification only if:
      // 1. Cooldown has passed since last notification
      // 2. Last notification was NOT also a "connected" notification (avoid duplicate recoveries)
      const timeSinceLastNotification = Date.now() - lastNetworkNotificationTime;
      if (timeSinceLastNotification > NETWORK_NOTIFICATION_COOLDOWN && lastNetworkNotificationType !== 'connected') {
        console.log('[NETWORK] Sending network restored notification');
        lastNetworkNotificationTime = Date.now();
        lastNetworkNotificationType = 'connected';
        await sendNetworkStatusNotification(io, true);
      } else {
        console.log('[NETWORK] Skipping notification - cooldown or duplicate type. Time since last:', timeSinceLastNotification, 'Last type:', lastNetworkNotificationType);
      }
    } else if (previousStatus === true && newStatus.isConnected === true) {
      // Network is still connected - just broadcast status, no notification
      broadcast(io, 'network-status', newStatus);
    }
  } catch (error) {
    // Network is disconnected
    const newStatus = state.setNetworkStatus(false);
    console.log('[NETWORK] Status set to DISCONNECTED:', error.message);
    
    // Broadcast and notify if status changed FROM CONNECTED TO DISCONNECTED
    if (previousStatus === true && newStatus.isConnected === false) {
      console.log('[NETWORK] Status changed from true to false - broadcasting and notifying');
      broadcast(io, 'network-status', newStatus);
      state.addLog('error', 'Network connectivity lost', { error: error.message });
      
      // Create an incident for network outage
      const networkIncident = state.createIncident(
        'NETWORK',
        'Internet connectivity lost - services may not function properly'
      );
      broadcast(io, 'incidents-update', state.getIncidents(50));
      
      // Create an alert for the network issue
      const networkAlert = state.createAlert(
        'NETWORK',
        'connectivity',
        'Internet connectivity lost',
        'critical'
      );
      broadcast(io, 'alerts-update', state.getAllAlerts());
      console.log('[NETWORK] Created incident and alert for network outage');
      
      // Send network outage notification only if:
      // 1. Cooldown has passed since last notification
      // 2. Last notification was NOT also a "disconnected" notification (avoid duplicate outages)
      const timeSinceLastNotification = Date.now() - lastNetworkNotificationTime;
      if (timeSinceLastNotification > NETWORK_NOTIFICATION_COOLDOWN && lastNetworkNotificationType !== 'disconnected') {
        console.log('[NETWORK] Sending network lost notification');
        lastNetworkNotificationTime = Date.now();
        lastNetworkNotificationType = 'disconnected';
        await sendNetworkStatusNotification(io, false);
      } else {
        console.log('[NETWORK] Skipping notification - cooldown or duplicate type. Time since last:', timeSinceLastNotification, 'Last type:', lastNetworkNotificationType);
      }
    } else if (previousStatus === false && newStatus.isConnected === false) {
      // Network is still disconnected - just broadcast status, no repeated notification
      broadcast(io, 'network-status', newStatus);
    }
  }
};

const sendNetworkStatusNotification = async (io, isConnected) => {
  try {
    const settings = state.getSettingsFull();
    const contacts = state.getContactsForAlert();
    const { speak, sendEmail } = require('../services/notificationService');
    
    // Play sound/TTS for network status change
    if (settings.soundEnabled && settings.ttsEnabled) {
      try {
        const textToSpeak = isConnected 
          ? 'Network connectivity has been restored. All systems operational.'
          : 'Warning! Network connectivity has been lost. Services may not function properly.';
        
        await speak(textToSpeak);
      } catch (error) {
        console.log('[NOTIFICATION] TTS error for network status:', error.message);
      }
    }
    
    // Send email notifications
    if (settings.emailEnabled && contacts.length > 0) {
      const subject = isConnected 
        ? '[INFO] Network Connectivity Restored' 
        : '[CRITICAL] Network Connectivity Lost';
      const statusText = isConnected ? 'restored' : 'lost';
      const html = `<h2>Network Status Update</h2><p>Network connectivity has been ${statusText}.</p><p>Timestamp: ${new Date().toISOString()}</p>`;
      const text = `Network connectivity has been ${statusText}. Timestamp: ${new Date().toISOString()}`;
      
      for (const contact of contacts) {
        if (contact.email && contact.notifyEmail) {
          try {
            await sendEmail(contact.email, subject, html, text);
          } catch (error) {
            console.log('[NOTIFICATION] Email error for network status:', error.message);
          }
        }
      }
    }
  } catch (error) {
    console.log('[NOTIFICATION] Network status notification error:', error.message);
  }
};

const startNetworkCheck = (io) => {
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
  }
  
  // Check immediately on startup
  console.log('[NETWORK] Starting initial connectivity check...');
  checkNetworkConnectivity(io);
  
  // Check more frequently - every 10 seconds instead of 30 for faster detection
  networkCheckInterval = setInterval(() => {
    console.log('[NETWORK] Running connectivity check...');
    checkNetworkConnectivity(io);
  }, 10000);
  
  state.addLog('info', 'Network connectivity check started (every 10s)', {});
  console.log('[NETWORK] Network check interval started (10s)');
};

const stopNetworkCheck = () => {
  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
  }
};

module.exports = {
  setupSocketHandlers,
  startAllMonitors,
  stopAllMonitors,
  startNetworkCheck,
  stopNetworkCheck,
  checkNetworkConnectivity
};
