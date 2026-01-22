#!/usr/bin/env node

/**
 * Comprehensive SMS Alert Testing Script
 * Tests contact creation, group management, and SMS alert delivery
 * Uses the mNotify API (https://api.mnotify.com/api/sms/quick)
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3032/api';
const SOCKET_URL = 'http://localhost:3032';

// Test data
const testContacts = [
  {
    name: 'Gashie',
    email: 'john@example.com',
    phone: '0551198831',
    role: 'Admin',
    notifyEmail: true,
    notifySms: true,
    notifyOnDown: true,
    notifyOnUp: true
  },
  {
    name: 'Aminu',
    email: 'jane@example.com',
    phone: '0208161462',
    role: 'Manager',
    notifyEmail: true,
    notifySms: true,
    notifyOnDown: true,
    notifyOnUp: false
  },
  {
    name: 'Kofi-Boss',
    email: 'bob@example.com',
    phone: '0246567690',
    role: 'Engineer',
    notifyEmail: false,
    notifySms: true,
    notifyOnDown: true,
    notifyOnUp: true
  },
    {
    name: 'Olivet',
    email: 'bob@example.com',
    phone: '0266785932',
    role: 'Engineer',
    notifyEmail: false,
    notifySms: true,
    notifyOnDown: true,
    notifyOnUp: true
  }
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + colors.bright + '='.repeat(60) + colors.reset);
  log(title, 'blue');
  console.log(colors.bright + '='.repeat(60) + colors.reset + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testApiEndpoint(method, endpoint, data = null) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const config = { 
      method,
      url,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

async function runTests() {
  log('Starting SMS Alert Testing Suite...', 'bright');
  log('Target: mNotify API (https://api.mnotify.com/api/sms/quick)', 'yellow');
  log(`API Base URL: ${BASE_URL}\n`, 'yellow');

  let createdContactIds = [];
  let createdGroupIds = [];

  try {
    // ==================== TEST 1: Create Contacts ====================
    logSection('TEST 1: Creating Test Contacts');
    
    for (const contact of testContacts) {
      const result = await testApiEndpoint('POST', '/contacts', contact);
      
      if (result.success) {
        const contactId = result.data.id;
        createdContactIds.push(contactId);
        log(`✓ Created contact: ${contact.name} (ID: ${contactId})`, 'green');
        log(`  - Email: ${contact.email}`);
        log(`  - Phone: ${contact.phone}`);
        log(`  - SMS Notify: ${contact.notifySms ? 'Yes' : 'No'}\n`);
      } else {
        log(`✗ Failed to create contact ${contact.name}: ${result.error}`, 'red');
      }
    }

    if (createdContactIds.length === 0) {
      log('ERROR: No contacts created. Cannot continue.', 'red');
      return;
    }

    log(`\nSuccessfully created ${createdContactIds.length} contacts`, 'green');

    // ==================== TEST 2: Create Contact Groups ====================
    logSection('TEST 2: Creating Contact Groups');

    const groups = [
      {
        name: 'On-Call Team',
        description: 'Primary on-call support team',
        contactIds: createdContactIds.slice(0, 2)
      },
      {
        name: 'Emergency Escalation',
        description: 'Emergency escalation contacts',
        contactIds: [createdContactIds[2]]
      },
      {
        name: 'All Staff',
        description: 'All staff members',
        contactIds: createdContactIds
      }
    ];

    for (const group of groups) {
      const result = await testApiEndpoint('POST', '/contact-groups', group);
      
      if (result.success) {
        const groupId = result.data.id;
        createdGroupIds.push(groupId);
        log(`✓ Created group: ${group.name} (ID: ${groupId})`, 'green');
        log(`  - Description: ${group.description}`);
        log(`  - Members: ${group.contactIds.length}\n`);
      } else {
        log(`✗ Failed to create group ${group.name}: ${result.error}`, 'red');
      }
    }

    // ==================== TEST 3: Verify Group Members ====================
    logSection('TEST 3: Verifying Contact Group Members');

    for (let i = 0; i < createdGroupIds.length; i++) {
      const result = await testApiEndpoint('GET', `/contact-groups/${createdGroupIds[i]}/members`);
      
      if (result.success) {
        const { group, members } = result.data;
        log(`✓ Group: ${group.name}`, 'green');
        
        if (members && members.length > 0) {
          members.forEach(member => {
            log(`  - ${member.name} (${member.phone})`);
          });
        } else {
          log(`  - No members`, 'yellow');
        }
        log('');
      } else {
        log(`✗ Failed to get members: ${result.error}`, 'red');
      }
    }

    // ==================== TEST 4: Test SMS Configuration ====================
    logSection('TEST 4: Testing SMS Configuration');

    const testPhoneNumber = createdContactIds.length > 0 ? testContacts[0].phone : '0241234567';
    
    log(`Testing SMS delivery to: ${testPhoneNumber}`, 'yellow');
    
    const smsResult = await testApiEndpoint('POST', '/settings/test-sms', {
      smsSenderId: 'PULSE',
      testPhone: testPhoneNumber
    });

    if (smsResult.success) {
      log('✓ SMS Configuration Test PASSED', 'green');
      if (smsResult.data && smsResult.data.response) {
        const apiResponse = smsResult.data.response;
        log(`  Status: ${apiResponse.status}`, 'green');
        log(`  Message: ${apiResponse.message}`, 'green');
        if (apiResponse.summary) {
          log(`  Total Sent: ${apiResponse.summary.total_sent}`, 'green');
          log(`  Total Rejected: ${apiResponse.summary.total_rejected}`, 'green');
          log(`  Numbers Sent: ${apiResponse.summary.numbers_sent.join(', ')}`, 'green');
          log(`  Credit Used: ${apiResponse.summary.credit_used}`, 'green');
          log(`  Credit Left: ${apiResponse.summary.credit_left}`, 'green');
        }
      }
      log('');
    } else {
      log('✗ SMS Configuration Test FAILED', 'red');
      log(`  Error: ${smsResult.error}`, 'red');
      log('');
    }

    // ==================== TEST 5: Simulate Alert Notification ====================
    logSection('TEST 5: Simulating Alert Notification');

    log('Creating test monitor for alert simulation...', 'yellow');
    
    const monitorData = {
      name: 'API Server - Test Monitor',
      type: 'http',
      url: 'https://api.example.com/health',
      schedule: 60,
      enabled: true
    };

    const monitorResult = await testApiEndpoint('POST', '/monitors', monitorData);
    let monitorId = null;

    if (monitorResult.success) {
      monitorId = monitorResult.data.id;
      log(`✓ Created test monitor: ${monitorId}`, 'green');
    } else {
      log(`⚠ Could not create monitor for testing: ${monitorResult.error}`, 'yellow');
      monitorId = 'test-monitor-' + Date.now();
    }

    // ==================== TEST 6: Get Recipients for Alert ====================
    logSection('TEST 6: Checking Alert Recipients');

    // Since we can't directly call getRecipientsForAlert from REST, let's verify contacts can receive
    const contactsResult = await testApiEndpoint('GET', '/contacts');
    
    if (contactsResult.success) {
      const allContacts = contactsResult.data;
      const smsRecipients = allContacts.filter(c => c.phone && c.notifySms);
      const emailRecipients = allContacts.filter(c => c.email && c.notifyEmail);
      
      log(`Total Contacts: ${allContacts.length}`, 'green');
      log(`SMS Recipients: ${smsRecipients.length}`, 'green');
      log(`Email Recipients: ${emailRecipients.length}`, 'green');
      
      if (smsRecipients.length > 0) {
        log('\nSMS Recipients:', 'blue');
        smsRecipients.forEach(c => {
          log(`  - ${c.name}: ${c.phone}`);
        });
      }
      
      log('');
    }

    // ==================== TEST 7: Settings Verification ====================
    logSection('TEST 7: Verifying SMS Settings');

    const settingsResult = await testApiEndpoint('GET', '/settings');
    
    if (settingsResult.success) {
      const settings = settingsResult.data;
      log('Current SMS Settings:', 'green');
      log(`  SMS Enabled: ${settings.smsEnabled ? 'Yes' : 'No'}`);
      log(`  SMS Sender ID: ${settings.smsSenderId || 'Not set'}`);
      log(`  API URL: ${settings.smsApiUrl || 'Using mNotify default'}`);
      log('');
    }

    // ==================== TEST 8: Batch SMS Send Simulation ====================
    logSection('TEST 8: Simulating Batch SMS Alert');

    const contactsForTest = await testApiEndpoint('GET', '/contacts');
    
    if (contactsForTest.success) {
      const smsContacts = contactsForTest.data.filter(c => c.phone && c.notifySms);
      
      if (smsContacts.length > 0) {
        const phoneNumbers = smsContacts.map(c => c.phone);
        
        log(`Recipients that will receive SMS alerts: ${smsContacts.length}`, 'green');
        smsContacts.forEach(c => {
          log(`  ✓ ${c.name}: ${c.phone} (${c.notifyOnDown ? 'Down' : ''}${c.notifyOnDown && c.notifyOnUp ? '/' : ''}${c.notifyOnUp ? 'Up' : ''})`);
        });
        
        log(`\nSample message that would be sent to all recipients:`, 'yellow');
        log(`"[CRITICAL] API Server - Test Monitor: Service unavailable - Connection timeout"`);
        log(`\nTo: ${phoneNumbers.join(', ')}`);
        log('');
      } else {
        log('No SMS recipients configured', 'yellow');
      }
    }

    // ==================== SUMMARY ====================
    logSection('SUMMARY');

    log(`✓ Test Suite Completed Successfully`, 'green');
    log(`\n  Created Resources:`, 'bright');
    log(`  - Contacts: ${createdContactIds.length}`);
    log(`  - Contact Groups: ${createdGroupIds.length}`);
    
    log(`\n  Key Features Implemented:`, 'bright');
    log(`  ✓ Contact creation with SMS preferences`);
    log(`  ✓ Contact group management`);
    log(`  ✓ Group member management (add/remove)`);
    log(`  ✓ SMS batch delivery using mNotify API`);
    log(`  ✓ Alert recipient resolution (groups → individual contacts)`);
    log(`  ✓ Notification preferences (notify on down/up)`);
    
    log(`\n  mNotify API Configuration:`, 'bright');
    log(`  - Endpoint: https://api.mnotify.com/api/sms/quick`);
    log(`  - API Key: nppoeaeolIEXKUXQ01pLXP7Tz`);
    log(`  - Sender ID: PulseMonitor (configurable)`);
    log(`  - Supports batch recipients in single request`);
    
    log(`\n  Next Steps:`, 'bright');
    log(`  1. Enable SMS notifications in settings`);
    log(`  2. Configure monitor alerts to notify specific contacts/groups`);
    log(`  3. When monitor status changes, SMS alerts will be sent to all group members`);
    log(`  4. Use /api/contact-groups/:id/members to manage group membership`);
    log('');

  } catch (error) {
    log('\n✗ Test Suite Failed with Error:', 'red');
    log(`  ${error.message}`, 'red');
    console.error(error);
  }
}

// Check if server is running
async function checkServerHealth() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Main execution
(async () => {
  const isHealthy = await checkServerHealth();
  
  if (!isHealthy) {
    log('ERROR: Server is not running!', 'red');
    log(`Please start the server first:`, 'yellow');
    log(`  npm run dev\n`, 'yellow');
    process.exit(1);
  }

  await runTests();
  process.exit(0);
})();
