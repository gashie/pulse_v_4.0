// routes/apiRoutes.js - REST API Endpoints
const express = require('express');
const state = require('../state/monitorState');
const { checkMonitorOnce, validateMonitorConfig } = require('../monitors/monitorEngine');
const { generateReport } = require('../services/reportService');
const { testEmailConfig, testSmsConfig, testTts } = require('../services/notificationService');

const router = express.Router();

// ==================== APPLICATIONS ====================

router.get('/applications', (req, res) => {
  res.json(state.getAllApplications());
});

router.get('/applications/:id', (req, res) => {
  const app = state.getApplication(req.params.id);
  if (app) {
    res.json(app);
  } else {
    res.status(404).json({ error: 'Application not found' });
  }
});

router.get('/applications/:id/health', (req, res) => {
  const health = state.getApplicationHealth(req.params.id);
  if (health) {
    res.json(health);
  } else {
    res.status(404).json({ error: 'Application not found' });
  }
});

router.post('/applications', (req, res) => {
  const app = state.createApplication(req.body);
  res.status(201).json(app);
});

router.put('/applications/:id', (req, res) => {
  const app = state.updateApplication(req.params.id, req.body);
  if (app) {
    res.json(app);
  } else {
    res.status(404).json({ error: 'Application not found' });
  }
});

router.delete('/applications/:id', (req, res) => {
  const result = state.deleteApplication(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Application not found' });
  }
});

// ==================== MONITORS ====================

router.get('/monitors', (req, res) => {
  res.json(state.getAllMonitors());
});

router.get('/monitors/:id', (req, res) => {
  const monitor = state.getMonitor(req.params.id);
  if (monitor) {
    res.json(monitor);
  } else {
    res.status(404).json({ error: 'Monitor not found' });
  }
});

router.post('/monitors', (req, res) => {
  const validation = validateMonitorConfig(req.body);
  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }
  const monitor = state.createMonitor(req.body);
  res.status(201).json(monitor);
});

router.put('/monitors/:id', (req, res) => {
  const monitor = state.updateMonitor(req.params.id, req.body);
  if (monitor) {
    res.json(monitor);
  } else {
    res.status(404).json({ error: 'Monitor not found' });
  }
});

router.delete('/monitors/:id', (req, res) => {
  const result = state.deleteMonitor(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Monitor not found' });
  }
});

router.post('/monitors/:id/check', async (req, res) => {
  const monitor = state.getMonitor(req.params.id);
  if (!monitor) {
    return res.status(404).json({ error: 'Monitor not found' });
  }
  const result = await checkMonitorOnce(monitor);
  state.updateStatus(req.params.id, result);
  res.json(result);
});

router.post('/monitors/test', async (req, res) => {
  const validation = validateMonitorConfig(req.body);
  if (!validation.valid) {
    return res.status(400).json({ errors: validation.errors });
  }
  const result = await checkMonitorOnce(req.body);
  res.json(result);
});

// ==================== GROUPS ====================

router.get('/groups', (req, res) => {
  res.json(state.getAllGroups());
});

router.get('/groups/:id', (req, res) => {
  const group = state.getGroupWithMonitors(req.params.id);
  if (group) {
    res.json(group);
  } else {
    res.status(404).json({ error: 'Group not found' });
  }
});

router.post('/groups', (req, res) => {
  const group = state.createGroup(req.body);
  res.status(201).json(group);
});

router.put('/groups/:id', (req, res) => {
  const group = state.updateGroup(req.params.id, req.body);
  if (group) {
    res.json(group);
  } else {
    res.status(404).json({ error: 'Group not found' });
  }
});

router.delete('/groups/:id', (req, res) => {
  const result = state.deleteGroup(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Group not found' });
  }
});

// ==================== CONTACTS ====================

router.get('/contacts', (req, res) => {
  res.json(state.getAllContacts());
});

router.post('/contacts', (req, res) => {
  const contact = state.createContact(req.body);
  res.status(201).json(contact);
});

router.put('/contacts/:id', (req, res) => {
  const contact = state.updateContact(req.params.id, req.body);
  if (contact) {
    res.json(contact);
  } else {
    res.status(404).json({ error: 'Contact not found' });
  }
});

router.delete('/contacts/:id', (req, res) => {
  const result = state.deleteContact(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Contact not found' });
  }
});

// ==================== CONTACT GROUPS ====================

router.get('/contact-groups', (req, res) => {
  res.json(state.getAllContactGroups());
});

router.post('/contact-groups', (req, res) => {
  const group = state.createContactGroup(req.body);
  res.status(201).json(group);
});

router.put('/contact-groups/:id', (req, res) => {
  const group = state.updateContactGroup(req.params.id, req.body);
  if (group) {
    res.json(group);
  } else {
    res.status(404).json({ error: 'Contact group not found' });
  }
});

router.delete('/contact-groups/:id', (req, res) => {
  const result = state.deleteContactGroup(req.params.id);
  if (result) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Contact group not found' });
  }
});

router.get('/contact-groups/:id/members', (req, res) => {
  const group = state.getContactGroup(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Contact group not found' });
    return;
  }
  
  const members = (group.contactIds || [])
    .map(contactId => state.getContact(contactId))
    .filter(c => c !== null);
  
  res.json({ group, members });
});

router.post('/contact-groups/:id/members/:contactId', (req, res) => {
  const group = state.getContactGroup(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Contact group not found' });
    return;
  }
  
  if (!group.contactIds) {
    group.contactIds = [];
  }
  
  if (!group.contactIds.includes(req.params.contactId)) {
    group.contactIds.push(req.params.contactId);
    state.updateContactGroup(req.params.id, group);
    res.status(201).json(group);
  } else {
    res.status(409).json({ error: 'Contact already in group' });
  }
});

router.delete('/contact-groups/:id/members/:contactId', (req, res) => {
  const group = state.getContactGroup(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Contact group not found' });
    return;
  }
  
  if (group.contactIds && Array.isArray(group.contactIds)) {
    group.contactIds = group.contactIds.filter(id => id !== req.params.contactId);
    state.updateContactGroup(req.params.id, group);
    res.json(group);
  } else {
    res.status(404).json({ error: 'Contact not in group' });
  }
});

// ==================== STATUSES ====================

router.get('/statuses', (req, res) => {
  res.json(state.getAllStatuses());
});

router.get('/statuses/:id', (req, res) => {
  const status = state.getStatus(req.params.id);
  if (status) {
    res.json(status);
  } else {
    res.status(404).json({ error: 'Status not found' });
  }
});

// ==================== ALERTS ====================

router.get('/alerts', (req, res) => {
  const activeOnly = req.query.active === 'true';
  res.json(activeOnly ? state.getActiveAlerts() : state.getAllAlerts());
});

router.post('/alerts/:id/acknowledge', (req, res) => {
  const alert = state.acknowledgeAlert(req.params.id);
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

router.post('/alerts/:id/resolve', (req, res) => {
  const alert = state.resolveAlert(req.params.id);
  if (alert) {
    res.json(alert);
  } else {
    res.status(404).json({ error: 'Alert not found' });
  }
});

// ==================== INCIDENTS ====================

router.get('/incidents', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(state.getIncidents(limit));
});

router.get('/incidents/monitor/:monitorId', (req, res) => {
  res.json(state.getIncidentsByMonitor(req.params.monitorId));
});

// ==================== ACTIVITY LOGS ====================

router.get('/activity', (req, res) => {
  const options = {
    entityType: req.query.entityType,
    entityId: req.query.entityId,
    action: req.query.action,
    from: req.query.from,
    to: req.query.to,
    search: req.query.search,
    limit: parseInt(req.query.limit) || 100
  };
  res.json(state.getActivityLogs(options));
});

router.get('/activity/:id', (req, res) => {
  const detail = state.getActivityDetail(req.params.id);
  if (detail) {
    res.json(detail);
  } else {
    res.status(404).json({ error: 'Activity not found' });
  }
});

// ==================== LOGS ====================

router.get('/logs', (req, res) => {
  const options = {
    level: req.query.level,
    monitorId: req.query.monitorId,
    limit: parseInt(req.query.limit) || 100
  };
  res.json(state.getLogs(options));
});

router.delete('/logs', (req, res) => {
  state.clearLogs();
  res.json({ success: true });
});

// ==================== SETTINGS ====================

router.get('/settings', (req, res) => {
  res.json(state.getSettings());
});

router.put('/settings', (req, res) => {
  state.updateSettings(req.body);
  res.json(state.getSettings());
});

router.post('/settings/test-email', async (req, res) => {
  const result = await testEmailConfig(req.body, req.body.testEmail);
  res.json(result);
});

router.post('/settings/test-sms', async (req, res) => {
  const result = await testSmsConfig(req.body, req.body.testPhone);
  res.json(result);
});

router.post('/settings/test-tts', async (req, res) => {
  const result = await testTts(req.body.text);
  res.json(result);
});

// ==================== STATS ====================

router.get('/stats', (req, res) => {
  res.json(state.getStats());
});

// ==================== REPORTS ====================

router.get('/reports/:type', async (req, res) => {
  try {
    const options = {
      applicationId: req.query.applicationId,
      limit: parseInt(req.query.limit) || 50,
      activeOnly: req.query.activeOnly === 'true'
    };
    
    const pdfBuffer = await generateReport(req.params.type, options);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pulse-monitor-${req.params.type}-report.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== EXPORT/IMPORT ====================

router.get('/export', (req, res) => {
  const data = state.exportData();
  res.json(data);
});

router.post('/import', (req, res) => {
  const result = state.importData(req.body);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// ==================== HEALTH ====================

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Date.now() - state.getStats().startTime,
    version: '4.0.0'
  });
});

module.exports = router;
