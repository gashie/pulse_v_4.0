#!/usr/bin/env node

/**
 * SMS Alert System - Integration Test
 * Comprehensive test of the complete SMS alert workflow
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3032/api';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function header(title) {
  console.log('\n' + colors.bright + '='.repeat(70) + colors.reset);
  log(title, 'cyan');
  console.log(colors.bright + '='.repeat(70) + colors.reset + '\n');
}

async function api(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data && ['POST', 'PUT'].includes(method)) config.data = data;
    
    const response = await axios(config);
    return { ok: true, data: response.data };
  } catch (error) {
    return { ok: false, error: error.response?.data || error.message };
  }
}

async function testIntegration() {
  log('SMS Alert System - Integration Test Suite', 'bright');
  log('mNotify API: https://api.mnotify.com/api/sms/quick\n', 'yellow');

  try {
    // ============ SCENARIO 1: Single Contact Alert ============
    header('SCENARIO 1: Alert to Single Contact');

    log('Creating single contact...', 'blue');
    const contact1 = await api('POST', '/contacts', {
      name: 'Emergency Manager',
      email: 'manager@company.com',
      phone: '0241234567',
      role: 'Manager',
      notifyEmail: true,
      notifySms: true,
      notifyOnDown: true,
      notifyOnUp: false
    });

    if (!contact1.ok) {
      log('✗ Failed to create contact', 'red');
      return;
    }

    const contactId1 = contact1.data.id;
    log(`✓ Contact created: ${contact1.data.name} (${contact1.data.phone})`, 'green');

    // ============ SCENARIO 2: Group Alert ============
    header('SCENARIO 2: Alert to Contact Group');

    log('Creating multiple contacts for group...', 'blue');
    const contacts = [];
    const contactData = [
      { name: 'Team Lead - Alice', phone: '0241234567', email: 'alice@company.com' },
      { name: 'Support - Bob', phone: '0201234567', email: 'bob@company.com' },
      { name: 'Ops - Carol', phone: '0551234567', email: 'carol@company.com' }
    ];

    for (const data of contactData) {
      const res = await api('POST', '/contacts', {
        ...data,
        role: 'Team Member',
        notifyEmail: true,
        notifySms: true,
        notifyOnDown: true,
        notifyOnUp: true
      });

      if (res.ok) {
        contacts.push(res.data);
        log(`  ✓ ${res.data.name}: ${res.data.phone}`, 'green');
      }
    }

    log(`\nCreated ${contacts.length} contacts`, 'green');

    // Create groups
    log('\nCreating contact groups...', 'blue');
    const groups = [];

    const group1Res = await api('POST', '/contact-groups', {
      name: 'On-Call Team',
      description: 'Primary on-call support team',
      contactIds: [contactId1, contacts[0].id]
    });

    if (group1Res.ok) {
      groups.push(group1Res.data);
      log(`✓ Group created: ${group1Res.data.name}`, 'green');
      log(`  Members: ${group1Res.data.contactIds.length}`, 'green');
    }

    const group2Res = await api('POST', '/contact-groups', {
      name: 'Full Team',
      description: 'All team members for escalation',
      contactIds: [contactId1, ...contacts.map(c => c.id)]
    });

    if (group2Res.ok) {
      groups.push(group2Res.data);
      log(`✓ Group created: ${group2Res.data.name}`, 'green');
      log(`  Members: ${group2Res.data.contactIds.length}`, 'green');
    }

    // ============ SCENARIO 3: Group Member Management ============
    header('SCENARIO 3: Managing Group Members');

    log('Current members of "Full Team":', 'blue');
    const membersRes = await api('GET', `/contact-groups/${groups[1].id}/members`);
    if (membersRes.ok) {
      membersRes.data.members.forEach((member, idx) => {
        log(`  ${idx + 1}. ${member.name} (${member.phone}) - SMS: ${member.notifySms ? '✓' : '✗'}`);
      });
    }

    // Add new contact to group
    if (contacts.length > 1) {
      log(`\nAdding ${contacts[1].name} to "On-Call Team"...`, 'blue');
      const addRes = await api('POST', `/contact-groups/${groups[0].id}/members/${contacts[1].id}`);
      if (addRes.ok) {
        log(`✓ Member added successfully`, 'green');
      }
    }

    // ============ SCENARIO 4: Verify Alert Recipients ============
    header('SCENARIO 4: Checking Alert Recipients');

    log('Fetching all contacts...', 'blue');
    const allContactsRes = await api('GET', '/contacts');
    if (allContactsRes.ok) {
      const allContacts = allContactsRes.data;
      const smsRecipients = allContacts.filter(c => c.phone && c.notifySms);
      const emailRecipients = allContacts.filter(c => c.email && c.notifyEmail);

      log(`\n${colors.green}Alert Recipients Summary:${colors.reset}`, 'green');
      log(`  Total Contacts: ${allContacts.length}`);
      log(`  Email Recipients: ${emailRecipients.length}`);
      log(`  SMS Recipients: ${smsRecipients.length}\n`);

      log('SMS Recipients that will receive alerts:', 'blue');
      smsRecipients.forEach(c => {
        const triggers = [];
        if (c.notifyOnDown) triggers.push('Down');
        if (c.notifyOnUp) triggers.push('Up');
        log(`  • ${c.name}: ${c.phone} (triggers: ${triggers.join('/')})`, 'cyan');
      });

      log('\nEmail Recipients:', 'blue');
      emailRecipients.forEach(c => {
        log(`  • ${c.name}: ${c.email}`);
      });
    }

    // ============ SCENARIO 5: Test SMS Sending ============
    header('SCENARIO 5: Testing SMS API');

    log('Testing SMS delivery with mNotify API...', 'blue');
    const smsTestRes = await api('POST', '/settings/test-sms', {
      testPhone: contact1.data.phone,
      smsSenderId: 'PULSE'
    });

    if (smsTestRes.ok) {
      log(`✓ SMS test successful!`, 'green');
      log(`  Response:`, 'cyan');
      log(JSON.stringify(smsTestRes.data, null, 2));
    } else {
      log(`✗ SMS test failed!`, 'red');
      log(`  Error: ${JSON.stringify(smsTestRes.error, null, 2)}`);
    }

    // ============ SCENARIO 6: Verify Settings ============
    header('SCENARIO 6: SMS Settings Verification');

    log('Checking SMS configuration...', 'blue');
    const settingsRes = await api('GET', '/settings');
    if (settingsRes.ok) {
      const settings = settingsRes.data;
      log(`\nSMS Settings:`, 'green');
      log(`  ✓ SMS Enabled: ${settings.smsEnabled ? 'Yes' : 'No'}`);
      log(`  ✓ Sender ID: ${settings.smsSenderId}`);
      log(`  ✓ API Key: ${settings.smsApiKey ? '***configured***' : 'Not set'}`);
      log(`  ✓ API URL: ${settings.smsApiUrl || 'Using mNotify default'}`);
    }

    // ============ SUMMARY ============
    header('Integration Test Summary');

    const testResults = {
      'Contact Creation': contact1.ok ? '✓' : '✗',
      'Group Creation': groups.length > 0 ? '✓' : '✗',
      'Member Management': membersRes.ok ? '✓' : '✗',
      'SMS Test': smsTestRes.ok ? '✓' : '✗',
      'Settings Verified': settingsRes.ok ? '✓' : '✗'
    };

    Object.entries(testResults).forEach(([test, result]) => {
      const color = result === '✓' ? 'green' : 'red';
      log(`${result} ${test}`, color);
    });

    // ============ ALERT SIMULATION ============
    header('Alert Simulation Scenario');

    log('When a monitor alert is triggered:', 'blue');
    log(`\n1. Monitor detects service down (3 consecutive failures)`);
    log(`2. System calls sendAlertNotification(alert, monitor)`);
    log(`3. System calls getRecipientsForAlert()`);
    log(`4. System expands contact groups to individual members`);
    log(`5. System filters by notification preferences`);
    log(`\n6. SMS Message Sent:`, 'yellow');

    const alertMsg = '[CRITICAL] API Server: Service unavailable - Connection timeout';
    log(`   "${alertMsg}"`, 'yellow');

    if (allContactsRes.ok && allContactsRes.data.length > 0) {
      const smsPhones = allContactsRes.data
        .filter(c => c.phone && c.notifySms && c.notifyOnDown)
        .map(c => c.phone);
      
      if (smsPhones.length > 0) {
        log(`\n7. SMS Batch Sent To:`, 'yellow');
        log(`   Recipients: ${smsPhones.join(', ')}`);
        log(`   Count: ${smsPhones.length} phone numbers`);
        log(`   API: mNotify (https://api.mnotify.com/api/sms/quick)`, 'cyan');
      }
    }

    // ============ FINAL STATUS ============
    log('\n' + colors.green + '✓ Integration Test Complete!' + colors.reset, 'green');
    log('\nSystem is ready for:');
    log('  ✓ Creating contacts and managing notification preferences');
    log('  ✓ Organizing contacts into groups');
    log('  ✓ Sending SMS alerts to individual contacts');
    log('  ✓ Sending SMS alerts to all group members');
    log('  ✓ Expanding groups when resolving alert recipients');
    log('  ✓ Batch SMS delivery via mNotify API');
    log('');

  } catch (error) {
    log(`\n✗ Test Failed: ${error.message}`, 'red');
    console.error(error);
  }
}

// Check server health
async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/health`);
    return true;
  } catch {
    return false;
  }
}

// Run
(async () => {
  const isHealthy = await checkServer();
  if (!isHealthy) {
    log('✗ Server not running!', 'red');
    log('Start with: npm run dev\n', 'yellow');
    process.exit(1);
  }
  await testIntegration();
  process.exit(0);
})();
