// state/monitorState.js - Pure Functional State Management with Persistence
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Ensure data directory exists
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

// Create initial application state
const createInitialState = () => ({
  // Applications - top level grouping
  applications: new Map(),
  
  // Monitors (can belong to application or standalone)
  monitors: new Map(),
  
  // Groups for organizing monitors
  groups: new Map(),
  
  // Monitor statuses
  statuses: new Map(),
  
  // Contacts for notifications
  contacts: new Map(),
  
  // Contact groups
  contactGroups: new Map(),
  
  // Incidents
  incidents: [],
  
  // Alerts
  alerts: [],
  
  // Activity logs (comprehensive)
  activityLogs: [],
  
  // System logs
  logs: [],
  
  // Settings
  settings: {
    consecutiveFailuresThreshold: 3,
    autoResolve: true,
    soundEnabled: true,
    browserNotifications: true,
    alertVolume: 80,
    // TTS Settings
    ttsEnabled: true,
    ttsVoice: 'default',
    ttsRate: 1.0,
    customAlertSound: null,
    customAlertText: null,
    // Email Settings
    emailEnabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    // SMS Settings (generic HTTP API)
    smsEnabled: true,
    smsApiUrl: '',
    smsApiKey: 'nppoeaeolIEXKUXQ01pLXP7Tz',
    smsApiMethod: 'POST',
    smsApiHeaders: {},
    smsApiBodyTemplate: '{"to":"{{phone}}","message":"{{message}}"}',
    smsSenderId: 'PULSE'
  },
  
  // Network status
  networkStatus: {
    isConnected: true,
    lastChecked: Date.now(),
    lastConnectedAt: Date.now()
  },
  
  // System stats
  startTime: Date.now()
});

let state = createInitialState();

// ==================== PERSISTENCE ====================

const saveState = () => {
  ensureDataDir();
  try {
    const dataToSave = {
      applications: Array.from(state.applications.entries()),
      monitors: Array.from(state.monitors.entries()).map(([id, m]) => {
        // Exclude sensitive data from monitors
        const { password, privateKey, ...safe } = m;
        return [id, { ...safe, hasPassword: !!password, hasPrivateKey: !!privateKey }];
      }),
      monitorsSecure: Array.from(state.monitors.entries()).map(([id, m]) => {
        return [id, { password: m.password, privateKey: m.privateKey }];
      }),
      groups: Array.from(state.groups.entries()),
      statuses: Array.from(state.statuses.entries()),
      contacts: Array.from(state.contacts.entries()),
      contactGroups: Array.from(state.contactGroups.entries()),
      incidents: state.incidents.slice(-1000),
      alerts: state.alerts.slice(-500),
      activityLogs: state.activityLogs.slice(-5000),
      logs: state.logs.slice(-2000),
      settings: state.settings,
      savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(dataToSave, null, 2));
    return true;
  } catch (error) {
    console.error('[STATE] Failed to save state:', error.message);
    return false;
  }
};

const loadState = () => {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log('[STATE] No saved state found, starting fresh');
      return false;
    }
    
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    
    state.applications = new Map(data.applications || []);
    state.groups = new Map(data.groups || []);
    state.contacts = new Map(data.contacts || []);
    state.contactGroups = new Map(data.contactGroups || []);
    state.incidents = data.incidents || [];
    state.alerts = data.alerts || [];
    state.activityLogs = data.activityLogs || [];
    state.logs = data.logs || [];
    state.settings = { ...state.settings, ...data.settings };
    
    // Load monitors with secure data
    const secureMap = new Map(data.monitorsSecure || []);
    state.monitors = new Map((data.monitors || []).map(([id, m]) => {
      const secure = secureMap.get(id) || {};
      return [id, { ...m, password: secure.password, privateKey: secure.privateKey }];
    }));
    
    // Load statuses
    state.statuses = new Map((data.statuses || []).map(([id, s]) => {
      return [id, { ...s, history: s.history || [] }];
    }));
    
    console.log(`[STATE] Loaded state: ${state.monitors.size} monitors, ${state.applications.size} applications`);
    return true;
  } catch (error) {
    console.error('[STATE] Failed to load state:', error.message);
    return false;
  }
};

// Auto-save every 30 seconds
setInterval(() => {
  if (state.monitors.size > 0 || state.applications.size > 0) {
    saveState();
  }
}, 30000);

// ==================== ACTIVITY LOGGING ====================

const addActivity = (action, entityType, entityId, details = {}, metadata = {}) => {
  const activity = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId,
    entityName: details.name || getEntityName(entityType, entityId),
    details,
    metadata: {
      ...metadata,
      userAgent: metadata.userAgent || 'system',
      ip: metadata.ip || 'localhost'
    },
    // For drill-down
    relatedEntities: details.relatedEntities || [],
    previousState: details.previousState || null,
    newState: details.newState || null
  };
  
  state.activityLogs.unshift(activity);
  
  // Keep last 5000 activities
  if (state.activityLogs.length > 5000) {
    state.activityLogs = state.activityLogs.slice(0, 5000);
  }
  
  return activity;
};

const getEntityName = (entityType, entityId) => {
  switch (entityType) {
    case 'monitor': return state.monitors.get(entityId)?.name || entityId;
    case 'application': return state.applications.get(entityId)?.name || entityId;
    case 'group': return state.groups.get(entityId)?.name || entityId;
    case 'contact': return state.contacts.get(entityId)?.name || entityId;
    case 'contactGroup': return state.contactGroups.get(entityId)?.name || entityId;
    default: return entityId;
  }
};

const getActivityLogs = (options = {}) => {
  let logs = [...state.activityLogs];
  
  if (options.entityType) {
    logs = logs.filter(l => l.entityType === options.entityType);
  }
  if (options.entityId) {
    logs = logs.filter(l => l.entityId === options.entityId || 
      l.relatedEntities?.includes(options.entityId));
  }
  if (options.action) {
    logs = logs.filter(l => l.action === options.action);
  }
  if (options.from) {
    logs = logs.filter(l => new Date(l.timestamp) >= new Date(options.from));
  }
  if (options.to) {
    logs = logs.filter(l => new Date(l.timestamp) <= new Date(options.to));
  }
  if (options.search) {
    const term = options.search.toLowerCase();
    logs = logs.filter(l => 
      l.entityName?.toLowerCase().includes(term) ||
      l.action?.toLowerCase().includes(term) ||
      JSON.stringify(l.details).toLowerCase().includes(term)
    );
  }
  
  return logs.slice(0, options.limit || 100);
};

const getActivityDetail = (activityId) => {
  return state.activityLogs.find(a => a.id === activityId);
};

// ==================== APPLICATIONS ====================

const createApplication = (data) => {
  const id = uuidv4();
  const application = {
    id,
    name: data.name,
    description: data.description || '',
    icon: data.icon || 'box',
    color: data.color || '#6366f1',
    tags: data.tags || [],
    monitorIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.applications.set(id, application);
  addActivity('create', 'application', id, { name: application.name, newState: application });
  addLog('info', `Application created: ${application.name}`, { applicationId: id });
  saveState();
  
  return application;
};

const updateApplication = (id, data) => {
  const app = state.applications.get(id);
  if (!app) return null;
  
  const previousState = { ...app };
  const updated = {
    ...app,
    ...data,
    id,
    updatedAt: new Date().toISOString()
  };
  
  state.applications.set(id, updated);
  addActivity('update', 'application', id, { 
    name: updated.name, 
    previousState, 
    newState: updated,
    changes: Object.keys(data)
  });
  addLog('info', `Application updated: ${updated.name}`, { applicationId: id });
  saveState();
  
  return updated;
};

const deleteApplication = (id) => {
  const app = state.applications.get(id);
  if (!app) return false;
  
  // Remove application reference from monitors
  app.monitorIds.forEach(monitorId => {
    const monitor = state.monitors.get(monitorId);
    if (monitor) {
      state.monitors.set(monitorId, { ...monitor, applicationId: null });
    }
  });
  
  state.applications.delete(id);
  addActivity('delete', 'application', id, { name: app.name, previousState: app });
  addLog('info', `Application deleted: ${app.name}`, { applicationId: id });
  saveState();
  
  return true;
};

const getApplication = (id) => state.applications.get(id);

const getAllApplications = () => Array.from(state.applications.values());

const getApplicationHealth = (applicationId) => {
  const app = state.applications.get(applicationId);
  if (!app) return null;
  
  const monitors = app.monitorIds.map(id => ({
    monitor: state.monitors.get(id),
    status: state.statuses.get(id)
  })).filter(m => m.monitor);
  
  const total = monitors.length;
  const up = monitors.filter(m => m.status?.status === 'UP').length;
  const down = monitors.filter(m => m.status?.status === 'DOWN').length;
  const pending = monitors.filter(m => !m.status || m.status.status === 'PENDING').length;
  
  let health = 'healthy';
  if (down > 0) health = 'critical';
  else if (pending > 0) health = 'warning';
  
  return {
    applicationId,
    name: app.name,
    health,
    total,
    up,
    down,
    pending,
    uptime: total > 0 ? Math.round((up / total) * 100) : 0,
    monitors: monitors.map(m => ({
      id: m.monitor.id,
      name: m.monitor.name,
      type: m.monitor.type,
      status: m.status?.status || 'PENDING',
      responseTime: m.status?.responseTime,
      lastCheck: m.status?.lastCheck
    }))
  };
};

const addMonitorToApplication = (applicationId, monitorId) => {
  const app = state.applications.get(applicationId);
  const monitor = state.monitors.get(monitorId);
  
  if (!app || !monitor) return false;
  
  // Remove from previous application if any
  if (monitor.applicationId && monitor.applicationId !== applicationId) {
    const prevApp = state.applications.get(monitor.applicationId);
    if (prevApp) {
      prevApp.monitorIds = prevApp.monitorIds.filter(id => id !== monitorId);
      state.applications.set(monitor.applicationId, prevApp);
    }
  }
  
  // Add to new application
  if (!app.monitorIds.includes(monitorId)) {
    app.monitorIds.push(monitorId);
    state.applications.set(applicationId, app);
  }
  
  // Update monitor
  state.monitors.set(monitorId, { ...monitor, applicationId });
  
  addActivity('link', 'monitor', monitorId, {
    name: monitor.name,
    relatedEntities: [applicationId],
    action: `Added to application: ${app.name}`
  });
  saveState();
  
  return true;
};

const removeMonitorFromApplication = (applicationId, monitorId) => {
  const app = state.applications.get(applicationId);
  const monitor = state.monitors.get(monitorId);
  
  if (!app || !monitor) return false;
  
  app.monitorIds = app.monitorIds.filter(id => id !== monitorId);
  state.applications.set(applicationId, app);
  
  state.monitors.set(monitorId, { ...monitor, applicationId: null });
  
  addActivity('unlink', 'monitor', monitorId, {
    name: monitor.name,
    relatedEntities: [applicationId],
    action: `Removed from application: ${app.name}`
  });
  saveState();
  
  return true;
};

// ==================== MONITORS ====================

const createMonitor = (data) => {
  const id = uuidv4();
  const monitor = {
    id,
    name: data.name,
    type: data.type,
    enabled: data.enabled !== false,
    // Connection details
    url: data.url || null,
    host: data.host || null,
    port: data.port || null,
    // Authentication
    username: data.username || null,
    password: data.password || null,
    privateKey: data.privateKey || null,
    // SSH specific
    sshSudo: data.sshSudo || false,
    sshSudoPassword: data.sshSudoPassword || null,
    // HTTP specific
    method: data.method || 'GET',
    headers: data.headers || {},
    body: data.body || null,
    expectedStatus: data.expectedStatus || 200,
    expectedContent: data.expectedContent || null,
    ignoreTls: data.ignoreTls || false,
    // Timing
    timeout: data.timeout || 10000,
    schedule: data.schedule || 60,
    // Organization
    groupId: data.groupId || null,
    applicationId: data.applicationId || null,
    tags: data.tags || [],
    description: data.description || '',
    // Metadata
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.monitors.set(id, monitor);
  
  // Initialize status
  state.statuses.set(id, {
    status: 'PENDING',
    responseTime: null,
    lastCheck: null,
    consecutiveFailures: 0,
    totalChecks: 0,
    successfulChecks: 0,
    history: []
  });
  
  // Add to application if specified
  if (monitor.applicationId) {
    const app = state.applications.get(monitor.applicationId);
    if (app && !app.monitorIds.includes(id)) {
      app.monitorIds.push(id);
      state.applications.set(monitor.applicationId, app);
    }
  }
  
  addActivity('create', 'monitor', id, { 
    name: monitor.name, 
    type: monitor.type,
    newState: { ...monitor, password: undefined, privateKey: undefined }
  });
  addLog('info', `Monitor created: ${monitor.name}`, { monitorId: id });
  saveState();
  
  return monitor;
};

const updateMonitor = (id, data) => {
  const monitor = state.monitors.get(id);
  if (!monitor) return null;
  
  const previousState = { ...monitor, password: undefined, privateKey: undefined };
  const previousAppId = monitor.applicationId;
  
  const updated = {
    ...monitor,
    ...data,
    id,
    updatedAt: new Date().toISOString()
  };
  
  state.monitors.set(id, updated);
  
  // Handle application change
  if (data.applicationId !== undefined && data.applicationId !== previousAppId) {
    // Remove from old application
    if (previousAppId) {
      const oldApp = state.applications.get(previousAppId);
      if (oldApp) {
        oldApp.monitorIds = oldApp.monitorIds.filter(mid => mid !== id);
        state.applications.set(previousAppId, oldApp);
      }
    }
    // Add to new application
    if (data.applicationId) {
      const newApp = state.applications.get(data.applicationId);
      if (newApp && !newApp.monitorIds.includes(id)) {
        newApp.monitorIds.push(id);
        state.applications.set(data.applicationId, newApp);
      }
    }
  }
  
  addActivity('update', 'monitor', id, {
    name: updated.name,
    previousState,
    newState: { ...updated, password: undefined, privateKey: undefined },
    changes: Object.keys(data)
  });
  addLog('info', `Monitor updated: ${updated.name}`, { monitorId: id });
  saveState();
  
  return updated;
};

const deleteMonitor = (id) => {
  const monitor = state.monitors.get(id);
  if (!monitor) return false;
  
  // Remove from application
  if (monitor.applicationId) {
    const app = state.applications.get(monitor.applicationId);
    if (app) {
      app.monitorIds = app.monitorIds.filter(mid => mid !== id);
      state.applications.set(monitor.applicationId, app);
    }
  }
  
  state.monitors.delete(id);
  state.statuses.delete(id);
  
  addActivity('delete', 'monitor', id, { 
    name: monitor.name,
    previousState: { ...monitor, password: undefined, privateKey: undefined }
  });
  addLog('info', `Monitor deleted: ${monitor.name}`, { monitorId: id });
  saveState();
  
  return true;
};

const getMonitor = (id) => state.monitors.get(id);

const getAllMonitors = () => Array.from(state.monitors.values()).map(m => ({
  ...m,
  password: m.password ? '***' : null,
  privateKey: m.privateKey ? '***' : null,
  sshSudoPassword: m.sshSudoPassword ? '***' : null
}));

const getMonitorsByGroup = (groupId) => 
  Array.from(state.monitors.values()).filter(m => m.groupId === groupId);

const getMonitorsByApplication = (applicationId) =>
  Array.from(state.monitors.values()).filter(m => m.applicationId === applicationId);

const getEnabledMonitors = () => 
  Array.from(state.monitors.values()).filter(m => m.enabled);

// ==================== GROUPS ====================

const createGroup = (data) => {
  const id = uuidv4();
  const group = {
    id,
    name: data.name,
    description: data.description || '',
    icon: data.icon || 'folder',
    color: data.color || '#6366f1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.groups.set(id, group);
  addActivity('create', 'group', id, { name: group.name, newState: group });
  addLog('info', `Group created: ${group.name}`, { groupId: id });
  saveState();
  
  return group;
};

const updateGroup = (id, data) => {
  const group = state.groups.get(id);
  if (!group) return null;
  
  const previousState = { ...group };
  const updated = {
    ...group,
    ...data,
    id,
    updatedAt: new Date().toISOString()
  };
  
  state.groups.set(id, updated);
  addActivity('update', 'group', id, { name: updated.name, previousState, newState: updated });
  addLog('info', `Group updated: ${updated.name}`, { groupId: id });
  saveState();
  
  return updated;
};

const deleteGroup = (id) => {
  const group = state.groups.get(id);
  if (!group) return false;
  
  // Remove group reference from monitors
  state.monitors.forEach((monitor, monitorId) => {
    if (monitor.groupId === id) {
      state.monitors.set(monitorId, { ...monitor, groupId: null });
    }
  });
  
  state.groups.delete(id);
  addActivity('delete', 'group', id, { name: group.name, previousState: group });
  addLog('info', `Group deleted: ${group.name}`, { groupId: id });
  saveState();
  
  return true;
};

const getGroup = (id) => state.groups.get(id);

const getAllGroups = () => Array.from(state.groups.values());

const getGroupWithMonitors = (groupId) => {
  const group = state.groups.get(groupId);
  if (!group) return null;
  
  const monitors = getMonitorsByGroup(groupId).map(m => ({
    ...m,
    password: m.password ? '***' : null,
    privateKey: m.privateKey ? '***' : null,
    status: state.statuses.get(m.id)
  }));
  
  return { ...group, monitors };
};

// ==================== CONTACTS ====================

const createContact = (data) => {
  const id = uuidv4();
  const contact = {
    id,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    role: data.role || '',
    notifyEmail: data.notifyEmail !== false,
    notifySms: data.notifySms || false,
    notifyOnDown: data.notifyOnDown !== false,
    notifyOnUp: data.notifyOnUp !== false,
    notifyOnIncident: data.notifyOnIncident !== false,
    groupIds: data.groupIds || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.contacts.set(id, contact);
  addActivity('create', 'contact', id, { name: contact.name, newState: contact });
  addLog('info', `Contact created: ${contact.name}`, { contactId: id });
  saveState();
  
  return contact;
};

const updateContact = (id, data) => {
  const contact = state.contacts.get(id);
  if (!contact) return null;
  
  const previousState = { ...contact };
  const updated = {
    ...contact,
    ...data,
    id,
    updatedAt: new Date().toISOString()
  };
  
  state.contacts.set(id, updated);
  addActivity('update', 'contact', id, { name: updated.name, previousState, newState: updated });
  addLog('info', `Contact updated: ${updated.name}`, { contactId: id });
  saveState();
  
  return updated;
};

const deleteContact = (id) => {
  const contact = state.contacts.get(id);
  if (!contact) return false;
  
  state.contacts.delete(id);
  addActivity('delete', 'contact', id, { name: contact.name, previousState: contact });
  addLog('info', `Contact deleted: ${contact.name}`, { contactId: id });
  saveState();
  
  return true;
};

const getContact = (id) => state.contacts.get(id);
const getAllContacts = () => Array.from(state.contacts.values());

// ==================== CONTACT GROUPS ====================

const createContactGroup = (data) => {
  const id = uuidv4();
  const group = {
    id,
    name: data.name,
    description: data.description || '',
    contactIds: data.contactIds || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  state.contactGroups.set(id, group);
  addActivity('create', 'contactGroup', id, { name: group.name, newState: group });
  addLog('info', `Contact group created: ${group.name}`, { contactGroupId: id });
  saveState();
  
  return group;
};

const updateContactGroup = (id, data) => {
  const group = state.contactGroups.get(id);
  if (!group) return null;
  
  const previousState = { ...group };
  const updated = {
    ...group,
    ...data,
    id,
    updatedAt: new Date().toISOString()
  };
  
  state.contactGroups.set(id, updated);
  addActivity('update', 'contactGroup', id, { name: updated.name, previousState, newState: updated });
  saveState();
  
  return updated;
};

const deleteContactGroup = (id) => {
  const group = state.contactGroups.get(id);
  if (!group) return false;
  
  state.contactGroups.delete(id);
  addActivity('delete', 'contactGroup', id, { name: group.name, previousState: group });
  saveState();
  
  return true;
};

const getContactGroup = (id) => state.contactGroups.get(id);
const getAllContactGroups = () => Array.from(state.contactGroups.values());

const getContactsForAlert = () => {
  // Get all contacts that should receive alerts
  return Array.from(state.contacts.values()).filter(c => 
    c.notifyOnDown || c.notifyOnUp || c.notifyOnIncident
  );
};

const getRecipientsForAlert = () => {
  // Collect all email and SMS recipients from both direct contacts and groups
  const recipientMap = new Map(); // Use map to avoid duplicates
  
  // Get all contacts
  const contacts = Array.from(state.contacts.values());
  
  // Get all contact groups
  const contactGroups = Array.from(state.contactGroups.values());
  
  // Add direct contacts that want notifications
  for (const contact of contacts) {
    if (contact.notifyOnDown || contact.notifyOnUp || contact.notifyOnIncident) {
      recipientMap.set(contact.id, contact);
    }
  }
  
  // Expand groups and add member contacts
  for (const group of contactGroups) {
    if (group.contactIds && Array.isArray(group.contactIds)) {
      for (const contactId of group.contactIds) {
        const contact = state.contacts.get(contactId);
        if (contact && (contact.notifyOnDown || contact.notifyOnUp || contact.notifyOnIncident)) {
          recipientMap.set(contact.id, contact);
        }
      }
    }
  }
  
  // Convert map to array
  const allRecipients = Array.from(recipientMap.values());
  
  // Separate into email and SMS recipients based on their preferences
  const emailRecipients = allRecipients.filter(c => c.email && c.notifyEmail);
  const smsRecipients = allRecipients.filter(c => c.phone && c.notifySms);
  
  console.log(`[ALERT] Found ${emailRecipients.length} email recipients and ${smsRecipients.length} SMS recipients`);
  
  return {
    emailRecipients,
    smsRecipients,
    allRecipients
  };
};

// ==================== STATUSES ====================

const updateStatus = (monitorId, statusData) => {
  const currentStatus = state.statuses.get(monitorId) || {
    status: 'PENDING',
    consecutiveFailures: 0,
    totalChecks: 0,
    successfulChecks: 0,
    history: []
  };
  
  const monitor = state.monitors.get(monitorId);
  const previousStatus = currentStatus.status;
  const isUp = statusData.status === 'UP';
  
  // Update consecutive failures
  const consecutiveFailures = isUp ? 0 : currentStatus.consecutiveFailures + 1;
  
  // Create history entry
  const historyEntry = {
    timestamp: new Date().toISOString(),
    status: statusData.status,
    responseTime: statusData.responseTime,
    message: statusData.message
  };
  
  // Keep last 100 history entries
  const history = [historyEntry, ...(currentStatus.history || [])].slice(0, 100);
  
  const newStatus = {
    status: statusData.status,
    responseTime: statusData.responseTime,
    message: statusData.message,
    lastCheck: new Date().toISOString(),
    consecutiveFailures,
    totalChecks: currentStatus.totalChecks + 1,
    successfulChecks: isUp ? currentStatus.successfulChecks + 1 : currentStatus.successfulChecks,
    history,
    sslInfo: statusData.sslInfo || null
  };
  
  state.statuses.set(monitorId, newStatus);
  
  // Log status change
  if (previousStatus !== statusData.status) {
    addActivity('status_change', 'monitor', monitorId, {
      name: monitor?.name,
      previousStatus,
      newStatus: statusData.status,
      responseTime: statusData.responseTime,
      message: statusData.message
    });
  }
  
  // Check for incident creation/resolution
  if (previousStatus === 'UP' && statusData.status === 'DOWN') {
    // Create incident immediately on first failure if coming from UP state
    createIncident(monitorId, statusData.message);
  } else if (previousStatus === 'DOWN' && statusData.status === 'DOWN') {
    // For subsequent failures, only create additional alert if threshold crossed
    if (consecutiveFailures >= state.settings.consecutiveFailuresThreshold) {
      // Check if incident already exists
      const existingIncident = state.incidents.find(i => 
        i.monitorId === monitorId && i.status === 'ongoing'
      );
      if (!existingIncident) {
        createIncident(monitorId, statusData.message);
      }
    }
  } else if (previousStatus === 'DOWN' && statusData.status === 'UP' && state.settings.autoResolve) {
    resolveIncidentForMonitor(monitorId);
  }
  
  saveState();
  return newStatus;
};

const getStatus = (monitorId) => state.statuses.get(monitorId);

const getAllStatuses = () => {
  const statuses = {};
  state.statuses.forEach((status, id) => {
    statuses[id] = status;
  });
  return statuses;
};

// ==================== ALERTS ====================

const createAlert = (monitorId, type, message, severity = 'critical') => {
  const monitor = state.monitors.get(monitorId);
  const id = uuidv4();
  
  const alert = {
    id,
    monitorId,
    monitorName: monitor?.name || 'Unknown',
    type,
    message,
    severity,
    status: 'active',
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: new Date().toISOString()
  };
  
  state.alerts.unshift(alert);
  
  addActivity('alert_created', 'monitor', monitorId, {
    name: monitor?.name,
    alertId: id,
    type,
    message,
    severity
  });
  addLog('warn', `Alert: ${monitor?.name} - ${message}`, { monitorId, alertId: id });
  saveState();
  
  return alert;
};

const acknowledgeAlert = (alertId) => {
  const alert = state.alerts.find(a => a.id === alertId);
  if (!alert) return null;
  
  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date().toISOString();
  
  addActivity('alert_acknowledged', 'monitor', alert.monitorId, {
    alertId,
    monitorName: alert.monitorName
  });
  saveState();
  
  return alert;
};

const resolveAlert = (alertId) => {
  const alert = state.alerts.find(a => a.id === alertId);
  if (!alert) return null;
  
  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  
  addActivity('alert_resolved', 'monitor', alert.monitorId, {
    alertId,
    monitorName: alert.monitorName
  });
  saveState();
  
  return alert;
};

const getActiveAlerts = () => state.alerts.filter(a => a.status === 'active');
const getAllAlerts = () => state.alerts;

// ==================== INCIDENTS ====================

const createIncident = (monitorId, message) => {
  const monitor = state.monitors.get(monitorId);
  const id = uuidv4();
  
  const incident = {
    id,
    monitorId,
    monitorName: monitor?.name || 'Unknown',
    status: 'ongoing',
    message,
    startedAt: new Date().toISOString(),
    resolvedAt: null,
    duration: null,
    updates: [{
      timestamp: new Date().toISOString(),
      status: 'started',
      message: `Incident detected: ${message}`
    }]
  };
  
  state.incidents.unshift(incident);
  
  // Create alert
  createAlert(monitorId, 'incident', message, 'critical');
  
  addActivity('incident_created', 'monitor', monitorId, {
    name: monitor?.name,
    incidentId: id,
    message
  });
  addLog('error', `Incident started: ${monitor?.name} - ${message}`, { monitorId, incidentId: id });
  saveState();
  
  return incident;
};

const resolveIncidentForMonitor = (monitorId) => {
  const incident = state.incidents.find(i => i.monitorId === monitorId && i.status === 'ongoing');
  if (!incident) return null;
  
  const now = new Date();
  incident.status = 'resolved';
  incident.resolvedAt = now.toISOString();
  incident.duration = now - new Date(incident.startedAt);
  incident.updates.push({
    timestamp: now.toISOString(),
    status: 'resolved',
    message: 'Service recovered'
  });
  
  // Resolve related alerts
  state.alerts
    .filter(a => a.monitorId === monitorId && a.status === 'active')
    .forEach(a => {
      a.status = 'resolved';
      a.resolvedAt = now.toISOString();
    });
  
  addActivity('incident_resolved', 'monitor', monitorId, {
    incidentId: incident.id,
    duration: incident.duration,
    monitorName: incident.monitorName
  });
  addLog('info', `Incident resolved: ${incident.monitorName}`, { monitorId, incidentId: incident.id });
  saveState();
  
  return incident;
};

const getIncidents = (limit = 100) => state.incidents.slice(0, limit);

const getIncidentsByMonitor = (monitorId) => 
  state.incidents.filter(i => i.monitorId === monitorId);

// ==================== LOGS ====================

const addLog = (level, message, metadata = {}) => {
  const log = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata
  };
  
  state.logs.unshift(log);
  
  // Keep last 2000 logs
  if (state.logs.length > 2000) {
    state.logs = state.logs.slice(0, 2000);
  }
  
  return log;
};

const getLogs = (options = {}) => {
  let logs = [...state.logs];
  
  if (options.level) {
    logs = logs.filter(l => l.level === options.level);
  }
  if (options.monitorId) {
    logs = logs.filter(l => l.metadata?.monitorId === options.monitorId);
  }
  
  return logs.slice(0, options.limit || 100);
};

const clearLogs = () => {
  state.logs = [];
  state.activityLogs = [];
  saveState();
};

// ==================== SETTINGS ====================

const updateSettings = (newSettings) => {
  const previousSettings = { ...state.settings };
  state.settings = { ...state.settings, ...newSettings };
  
  addActivity('update', 'settings', 'system', {
    previousState: previousSettings,
    newState: state.settings,
    changes: Object.keys(newSettings)
  });
  addLog('info', 'Settings updated', { changes: Object.keys(newSettings) });
  saveState();
  
  return state.settings;
};

const getSettings = () => ({
  ...state.settings,
  smtpPass: state.settings.smtpPass ? '***' : '',
  smsApiKey: state.settings.smsApiKey ? '***' : ''
});

const getSettingsFull = () => state.settings;

// ==================== STATS ====================

const getStats = () => {
  const monitors = Array.from(state.monitors.values());
  const statuses = Array.from(state.statuses.values());
  
  const up = statuses.filter(s => s.status === 'UP').length;
  const down = statuses.filter(s => s.status === 'DOWN').length;
  const pending = statuses.filter(s => s.status === 'PENDING').length;
  
  const avgResponseTime = statuses
    .filter(s => s.responseTime)
    .reduce((sum, s, _, arr) => sum + s.responseTime / arr.length, 0);
  
  const totalChecks = statuses.reduce((sum, s) => sum + (s.totalChecks || 0), 0);
  const successfulChecks = statuses.reduce((sum, s) => sum + (s.successfulChecks || 0), 0);
  
  return {
    monitors: {
      total: monitors.length,
      enabled: monitors.filter(m => m.enabled).length,
      up,
      down,
      pending
    },
    applications: {
      total: state.applications.size
    },
    groups: {
      total: state.groups.size
    },
    contacts: {
      total: state.contacts.size
    },
    alerts: {
      active: state.alerts.filter(a => a.status === 'active').length,
      total: state.alerts.length
    },
    incidents: {
      ongoing: state.incidents.filter(i => i.status === 'ongoing').length,
      total: state.incidents.length
    },
    uptime: totalChecks > 0 ? Math.round((successfulChecks / totalChecks) * 100) : 0,
    avgResponseTime: Math.round(avgResponseTime),
    startTime: state.startTime
  };
};

// ==================== NETWORK STATUS ====================

const getNetworkStatus = () => state.networkStatus;

const setNetworkStatus = (isConnected) => {
  const previousStatus = state.networkStatus.isConnected;
  state.networkStatus = {
    isConnected,
    lastChecked: Date.now(),
    lastConnectedAt: isConnected ? Date.now() : state.networkStatus.lastConnectedAt
  };
  
  // Log status change
  if (previousStatus !== isConnected) {
    addLog('warn', `Network status: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`, {});
  }
  
  return state.networkStatus;
};

// ==================== EXPORT/IMPORT ====================

const exportData = () => {
  return {
    applications: Array.from(state.applications.values()),
    monitors: Array.from(state.monitors.values()).map(m => ({
      ...m,
      password: undefined,
      privateKey: undefined,
      sshSudoPassword: undefined
    })),
    groups: Array.from(state.groups.values()),
    contacts: Array.from(state.contacts.values()),
    contactGroups: Array.from(state.contactGroups.values()),
    settings: getSettings(),
    exportedAt: new Date().toISOString(),
    version: '4.0.0'
  };
};

// ==================== IMPORT DATA NORMALIZATION ====================

const normalizeImportData = (data) => {
  // Handle both old Map format (nested [id, {data}] with "0", "1" keys) and new export format
  const normalized = { ...data };
  
  // Helper function to extract actual data from Map serialization format
  const extractFromMapFormat = (array) => {
    if (!Array.isArray(array)) return array;
    
    return array.map(item => {
      // Check if this is a Map entry [id, object]
      if (Array.isArray(item) && item.length >= 2) {
        const id = item[0];
        let obj = item[1];
        
        // Check if the object has numeric keys "0", "1", "2" (corrupted format)
        if (obj && typeof obj === 'object' && ('0' in obj || '1' in obj)) {
          // This is a corrupted Map serialization - extract the actual data
          // The pattern is [id, {"0": id2, "1": actualData, ...}]
          // We want the actual data which is usually in the second nested item
          if (obj['1'] && typeof obj['1'] === 'object') {
            obj = { ...obj['1'], id };
          } else if (obj['0'] && typeof obj['0'] === 'object') {
            obj = { ...obj['0'], id };
          }
        }
        
        // Ensure id is set
        if (!obj.id) {
          obj.id = id;
        }
        return obj;
      }
      
      // Already in simple format
      return item;
    });
  };
  
  // Normalize all array fields that might have Map format
  if (normalized.groups) {
    normalized.groups = extractFromMapFormat(normalized.groups);
  }
  if (normalized.applications) {
    normalized.applications = extractFromMapFormat(normalized.applications);
  }
  if (normalized.monitors) {
    normalized.monitors = extractFromMapFormat(normalized.monitors);
  }
  if (normalized.contacts) {
    normalized.contacts = extractFromMapFormat(normalized.contacts);
  }
  if (normalized.contactGroups) {
    normalized.contactGroups = extractFromMapFormat(normalized.contactGroups);
  }
  
  return normalized;
};

const importData = (data) => {
  try {
    // Normalize the data format - handle both old Map format and new export format
    const normalized = normalizeImportData(data);
    
    // Import groups
    if (normalized.groups) {
      normalized.groups.forEach(g => {
        const id = g.id || uuidv4();
        state.groups.set(id, { ...g, id });
      });
    }
    
    // Import applications
    if (normalized.applications) {
      normalized.applications.forEach(a => {
        const id = a.id || uuidv4();
        state.applications.set(id, { ...a, id, monitorIds: a.monitorIds || [] });
      });
    }
    
    // Import monitors - with proper field defaults like createMonitor does
    if (normalized.monitors) {
      normalized.monitors.forEach(m => {
        const id = m.id || uuidv4();
        
        // Normalize expectedStatus: convert array to first element or default to 200
        let expectedStatus = m.expectedStatus || 200;
        if (Array.isArray(expectedStatus)) {
          expectedStatus = expectedStatus[0] || 200;
        }
        
        // Ensure all required fields have defaults (mirroring createMonitor logic)
        const monitor = {
          id,
          name: m.name || 'Unnamed Monitor',
          type: m.type || 'http',
          enabled: m.enabled !== false,
          // Connection details with defaults
          url: m.url || null,
          host: m.host || null,
          port: m.port || null,
          // Authentication with defaults
          username: m.username || null,
          password: m.password || null,
          privateKey: m.privateKey || null,
          // SSH specific with defaults
          sshSudo: m.sshSudo || false,
          sshSudoPassword: m.sshSudoPassword || null,
          // HTTP specific with defaults
          method: m.method || 'GET',
          headers: m.headers || {},
          body: m.body || null,
          expectedStatus: expectedStatus,
          expectedContent: m.expectedContent || null,
          ignoreTls: m.ignoreTls || false,
          followRedirects: m.followRedirects !== false,
          // Timing with defaults
          timeout: m.timeout || 10000,
          schedule: m.schedule || 60,
          // Organization with defaults
          groupId: m.groupId || null,
          applicationId: m.applicationId || null,
          tags: m.tags || [],
          description: m.description || '',
          priority: m.priority || 3,
          // Metadata
          createdAt: m.createdAt || new Date().toISOString(),
          updatedAt: m.updatedAt || new Date().toISOString()
        };
        
        state.monitors.set(id, monitor);
        state.statuses.set(id, {
          status: 'PENDING',
          responseTime: null,
          lastCheck: null,
          consecutiveFailures: 0,
          totalChecks: 0,
          successfulChecks: 0,
          history: []
        });
        
        // Add to application if specified
        if (monitor.applicationId) {
          const app = state.applications.get(monitor.applicationId);
          if (app && !app.monitorIds.includes(id)) {
            app.monitorIds.push(id);
          }
        }
      });
    }
    
    // Import contacts
    if (normalized.contacts) {
      normalized.contacts.forEach(c => {
        const id = c.id || uuidv4();
        state.contacts.set(id, { ...c, id });
      });
    }
    
    // Import contact groups
    if (normalized.contactGroups) {
      normalized.contactGroups.forEach(cg => {
        const id = cg.id || uuidv4();
        state.contactGroups.set(id, { ...cg, id });
      });
    }
    
    // Import settings (partial)
    if (normalized.settings) {
      state.settings = { ...state.settings, ...normalized.settings };
    }
    
    addActivity('import', 'system', 'system', {
      monitors: normalized.monitors?.length || 0,
      applications: normalized.applications?.length || 0,
      groups: normalized.groups?.length || 0
    });
    addLog('info', `Data imported: ${normalized.monitors?.length || 0} monitors, ${normalized.applications?.length || 0} applications`);
    saveState();
    
    return { success: true };
  } catch (error) {
    addLog('error', `Import failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ==================== RESET ====================

const resetState = () => {
  state = createInitialState();
  addLog('info', 'System reset');
  saveState();
};

module.exports = {
  // Persistence
  loadState,
  saveState,
  
  // Network Status
  getNetworkStatus,
  setNetworkStatus,
  
  // Applications
  createApplication,
  updateApplication,
  deleteApplication,
  getApplication,
  getAllApplications,
  getApplicationHealth,
  addMonitorToApplication,
  removeMonitorFromApplication,
  
  // Monitors
  createMonitor,
  updateMonitor,
  deleteMonitor,
  getMonitor,
  getAllMonitors,
  getMonitorsByGroup,
  getMonitorsByApplication,
  getEnabledMonitors,
  
  // Groups
  createGroup,
  updateGroup,
  deleteGroup,
  getGroup,
  getAllGroups,
  getGroupWithMonitors,
  
  // Contacts
  createContact,
  updateContact,
  deleteContact,
  getContact,
  getAllContacts,
  
  // Contact Groups
  createContactGroup,
  updateContactGroup,
  deleteContactGroup,
  getContactGroup,
  getAllContactGroups,
  getContactsForAlert,
  getRecipientsForAlert,
  
  // Statuses
  updateStatus,
  getStatus,
  getAllStatuses,
  
  // Alerts
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  getActiveAlerts,
  getAllAlerts,
  
  // Incidents
  createIncident,
  resolveIncidentForMonitor,
  getIncidents,
  getIncidentsByMonitor,
  
  // Activity Logs
  addActivity,
  getActivityLogs,
  getActivityDetail,
  
  // Logs
  addLog,
  getLogs,
  clearLogs,
  
  // Settings
  updateSettings,
  getSettings,
  getSettingsFull,
  
  // Stats
  getStats,
  
  // Export/Import
  exportData,
  importData,
  
  // Reset
  resetState
};
