// services/notificationService.js - Email, SMS, and TTS Notification Service
const nodemailer = require('nodemailer');
const axios = require('axios');
const { exec } = require('child_process');
const state = require('../state/monitorState');

// ==================== EMAIL SERVICE ====================

const createEmailTransporter = (settings) => {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass
    }
  });
};

const sendEmail = async (to, subject, htmlContent, textContent) => {
  const settings = state.getSettingsFull();
  
  if (!settings.emailEnabled) {
    console.log('[NOTIFICATION] Email disabled, skipping');
    return { success: false, reason: 'Email notifications disabled' };
  }
  
  if (!settings.smtpHost || !settings.smtpUser) {
    console.log('[NOTIFICATION] Email not configured');
    return { success: false, reason: 'Email not configured' };
  }
  
  try {
    const transporter = createEmailTransporter(settings);
    
    const result = await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to,
      subject,
      text: textContent,
      html: htmlContent
    });
    
    state.addLog('info', `Email sent to ${to}`, { subject, messageId: result.messageId });
    state.addActivity('notification_sent', 'email', null, { to, subject, type: 'email' });
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    state.addLog('error', `Email failed: ${error.message}`, { to, subject });
    return { success: false, error: error.message };
  }
};

// ==================== SMS SERVICE ====================

// mNotify API Configuration
const MNOTIFY_ENDPOINT = 'https://api.mnotify.com/api/sms/quick';
const MNOTIFY_API_KEY = 'nppoeaeolIEXKUXQ01pLXP7Tz';

const sendSms = async (phone, message) => {
  const settings = state.getSettingsFull();
  
  if (!settings.smsEnabled) {
    console.log('[NOTIFICATION] SMS disabled, skipping');
    return { success: false, reason: 'SMS notifications disabled' };
  }
  
  try {
    // Single phone number or array
    const recipients = Array.isArray(phone) ? phone : [phone];
    
    // Use mNotify API
    const data = {
      recipient: recipients,
      sender: settings.smsSenderId || 'PulseMonitor',
      message: message,
      is_schedule: false,
      schedule_date: ''
    };
    
    const response = await axios.post(
      `${MNOTIFY_ENDPOINT}?key=${MNOTIFY_API_KEY}`,
      data,
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    state.addLog('info', `SMS sent to ${recipients.join(', ')}`, { message: message.substring(0, 50), recipientCount: recipients.length });
    state.addActivity('notification_sent', 'sms', null, { phones: recipients, type: 'sms', recipientCount: recipients.length });
    
    return { success: true, response: response.data, recipientCount: recipients.length };
  } catch (error) {
    const phones = Array.isArray(phone) ? phone.join(', ') : phone;
    state.addLog('error', `SMS failed: ${error.message}`, { phone: phones });
    return { success: false, error: error.message };
  }
};

const sendSmsBatch = async (phones, message) => {
  const settings = state.getSettingsFull();
  
  if (!settings.smsEnabled) {
    console.log('[NOTIFICATION] SMS disabled, skipping');
    return { success: false, reason: 'SMS notifications disabled' };
  }
  
  if (!Array.isArray(phones) || phones.length === 0) {
    return { success: false, error: 'No phone numbers provided' };
  }
  
  try {
    // Send to all phones at once
    return await sendSms(phones, message);
  } catch (error) {
    console.log('[NOTIFICATION] Batch SMS error:', error.message);
    return { success: false, error: error.message };
  }
};

// ==================== TTS SERVICE ====================

const speak = async (text, options = {}) => {
  const settings = state.getSettingsFull();
  
  if (!settings.ttsEnabled && !options.force) {
    return { success: false, reason: 'TTS disabled' };
  }
  
  return new Promise((resolve) => {
    const rate = options.rate || settings.ttsRate || 1.0;
    const voice = options.voice || settings.ttsVoice || 'default';
    
    // Try system TTS
    let command;
    let execTimeout = 60000; // Increased timeout to allow full speech
    
    if (process.platform === 'darwin') {
      // macOS - 'say' command waits for speech to complete
      const voiceArg = voice !== 'default' ? `-v "${voice}"` : '';
      command = `say ${voiceArg} -r ${Math.round(rate * 200)} "${text.replace(/"/g, '\\"')}"`;
    } else if (process.platform === 'linux') {
      // Linux (espeak) - ensure we wait for completion
      command = `espeak -s ${Math.round(rate * 175)} "${text.replace(/"/g, '\\"')}" 2>/dev/null || 
                 spd-say -r ${Math.round((rate - 1) * 50)} "${text.replace(/"/g, '\\"')}" 2>/dev/null ||
                 echo "TTS not available"`;
    } else if (process.platform === 'win32') {
      // Windows PowerShell - SpeechSynthesizer.Speak waits for completion by default
      const psScript = `Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = ${Math.round((rate - 1) * 5)}; $speak.Speak('${text.replace(/'/g, "''")}'); Start-Sleep -Milliseconds 500`;
      command = `powershell -Command "${psScript}"`;
      execTimeout = 120000; // Longer timeout for PowerShell on Windows
    } else {
      resolve({ success: false, reason: 'Unsupported platform' });
      return;
    }
    
    const child = exec(command, { timeout: execTimeout }, (error, stdout, stderr) => {
      if (error) {
        // Check if it's a timeout error
        if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
          console.log('[TTS] Warning: TTS process timeout - speech may have been cut off');
          // Still consider it success since speech was likely played
          resolve({ success: true, warning: 'Process timeout - speech may have completed' });
        } else {
          console.log('[TTS] System TTS failed:', error.message);
          resolve({ success: false, error: error.message });
        }
      } else {
        resolve({ success: true });
      }
    });
    
    // Ensure child process doesn't get killed prematurely
    child.on('error', (error) => {
      console.log('[TTS] Child process error:', error.message);
      resolve({ success: false, error: error.message });
    });
  });
};

// ==================== ALERT NOTIFICATION ====================

const sendAlertNotification = async (alert, monitor) => {
  try {
    const settings = state.getSettingsFull();
    
    // Get recipients from contacts and groups
    const { emailRecipients, smsRecipients } = state.getRecipientsForAlert();
    
    // Determine message
    const isDown = alert.type === 'incident' || alert.severity === 'critical';
    const alertText = settings.customAlertText || alert.message;
    
    console.log(`[NOTIFICATION] Sending alert to ${emailRecipients.length} email recipients and ${smsRecipients.length} SMS recipients`);
    
    // Play sound/TTS
    if (settings.soundEnabled && settings.ttsEnabled) {
      try {
        const textToSpeak = alertText || 
          `Alert! ${monitor?.name || 'Unknown service'} is ${isDown ? 'down' : 'recovered'}. ${alert.message}`;
        
        await speak(textToSpeak);
      } catch (error) {
        console.log('[NOTIFICATION] TTS error:', error.message);
      }
    }
    
    // Send email notifications
    if (settings.emailEnabled && emailRecipients.length > 0) {
      for (const contact of emailRecipients) {
        try {
          const subject = `[${alert.severity.toUpperCase()}] ${monitor?.name || 'Unknown'}: ${alert.type}`;
          const html = generateAlertEmailHtml(alert, monitor);
          const text = `${alert.type}: ${alert.message}\nMonitor: ${monitor?.name}\nTime: ${alert.createdAt}`;
          
          await sendEmail(contact.email, subject, html, text);
        } catch (error) {
          console.log('[NOTIFICATION] Email error:', error.message);
        }
      }
    }
    
    // Send SMS notifications in batch
    if (settings.smsEnabled && smsRecipients.length > 0) {
      try {
        const smsText = `[${alert.severity}] ${monitor?.name}: ${alert.message}`;
        const phones = smsRecipients.map(c => c.phone).filter(p => p);
        
        if (phones.length > 0) {
          await sendSmsBatch(phones, smsText);
        }
      } catch (error) {
        console.log('[NOTIFICATION] Batch SMS error:', error.message);
      }
    }
    
    return {
      emailsSent: emailRecipients.length,
      smsSent: smsRecipients.length,
      ttsFired: settings.soundEnabled && settings.ttsEnabled
    };
  } catch (error) {
    console.log('[NOTIFICATION] Alert notification error:', error.message);
    return { success: false, error: error.message };
  }
};

// ==================== EMAIL HTML TEMPLATE ====================

const generateAlertEmailHtml = (alert, monitor) => {
  const statusColor = alert.severity === 'critical' ? '#ef4444' : '#f59e0b';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: ${statusColor}; color: white; padding: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .info-row { display: flex; border-bottom: 1px solid #eee; padding: 12px 0; }
    .info-label { font-weight: 600; color: #666; width: 120px; }
    .info-value { color: #333; }
    .footer { background: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #999; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge.critical { background: #fef2f2; color: #dc2626; }
    .badge.warning { background: #fffbeb; color: #d97706; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Pulse Monitor Alert</h1>
    </div>
    <div class="content">
      <div class="info-row">
        <span class="info-label">Monitor</span>
        <span class="info-value">${monitor?.name || 'Unknown'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Type</span>
        <span class="info-value">${monitor?.type?.toUpperCase() || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value"><span class="badge ${alert.severity}">${alert.severity}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Message</span>
        <span class="info-value">${alert.message}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Time</span>
        <span class="info-value">${new Date(alert.createdAt).toLocaleString()}</span>
      </div>
      ${monitor?.url ? `
      <div class="info-row">
        <span class="info-label">URL</span>
        <span class="info-value">${monitor.url}</span>
      </div>
      ` : ''}
      ${monitor?.host ? `
      <div class="info-row">
        <span class="info-label">Host</span>
        <span class="info-value">${monitor.host}:${monitor.port || ''}</span>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      Sent by Pulse Monitor v4.0.0 • ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>
  `;
};

// ==================== TEST FUNCTIONS ====================

const testEmailConfig = async (settings, testEmail) => {
  try {
    const transporter = createEmailTransporter(settings);
    await transporter.verify();
    
    if (testEmail) {
      await transporter.sendMail({
        from: settings.smtpFrom || settings.smtpUser,
        to: testEmail,
        subject: 'Pulse Monitor - Email Test',
        text: 'This is a test email from Pulse Monitor. If you received this, your email configuration is working correctly.',
        html: '<h2>Pulse Monitor Email Test</h2><p>If you received this, your email configuration is working correctly.</p>'
      });
    }
    
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const testSmsConfig = async (settings, testPhone) => {
  try {
    if (!testPhone) {
      return { success: false, error: 'Test phone number is required' };
    }
    
    const testMessage = 'Pulse Monitor SMS test message - Configuration is working!';
    
    // Use mNotify API for testing
    const data = {
      recipient: [testPhone],
      sender: settings.smsSenderId || 'PulseMonitor',
      message: testMessage,
      is_schedule: false,
      schedule_date: ''
    };
    
    const response = await axios.post(
      `https://api.mnotify.com/api/sms/quick?key=nppoeaeolIEXKUXQ01pLXP7Tz`,
      data,
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    return { success: true, message: 'Test SMS sent successfully', response: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const testTts = async (text) => {
  return speak(text || 'This is a test of the text to speech system.', { force: true });
};

module.exports = {
  sendEmail,
  sendSms,
  sendSmsBatch,
  speak,
  sendAlertNotification,
  testEmailConfig,
  testSmsConfig,
  testTts
};
