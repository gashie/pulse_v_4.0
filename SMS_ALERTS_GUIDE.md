# SMS Alert System Implementation Guide

## Overview

The SMS alert system has been fully integrated into Pulse Monitor with support for:
- **Direct Contact Notifications**: Send SMS to individual contacts
- **Group-Based Notifications**: Send SMS to all members of a contact group
- **Batch SMS Delivery**: Send multiple SMS messages in a single API call
- **mNotify API Integration**: Uses professional SMS gateway (https://api.mnotify.com)
- **Flexible Notification Rules**: Configure who gets notified on service up/down events

## Architecture

### Components

1. **Contact Management** (`state/monitorState.js`)
   - Create/update/delete individual contacts
   - Each contact has phone number and notification preferences
   - Can belong to multiple contact groups

2. **Contact Groups** (`state/monitorState.js`)
   - Organize contacts into logical groups (e.g., "On-Call Team", "Escalation")
   - Groups expand to all member contacts when sending alerts
   - Supports add/remove member operations

3. **SMS Service** (`services/notificationService.js`)
   - `sendSms()`: Send SMS to single or multiple phone numbers
   - `sendSmsBatch()`: Send SMS to array of phone numbers
   - Uses mNotify API for reliable SMS delivery

4. **Alert Notification** (`services/notificationService.js`)
   - `sendAlertNotification()`: Main entry point for alert notifications
   - Resolves contact groups to individual contacts
   - Sends to all email and SMS recipients based on preferences
   - Filters recipients based on notification preferences (notify on down/up)

5. **Recipient Resolution** (`state/monitorState.js`)
   - `getRecipientsForAlert()`: Expands contacts and groups to get final recipient list
   - Returns separate arrays for email and SMS recipients
   - Avoids duplicate notifications

## SMS API Configuration

### mNotify API Details
- **Endpoint**: https://api.mnotify.com/api/sms/quick
- **API Key**: `nppoeaeolIEXKUXQ01pLXP7Tz`
- **Request Method**: POST
- **Content-Type**: application/json

### Request Format
```javascript
{
  recipient: ['0241234567', '0201234567'],  // Array of phone numbers
  sender: 'PulseMonitor',                    // Sender ID (configurable)
  message: 'Your alert message here',        // SMS message text
  is_schedule: false,                        // Don't schedule
  schedule_date: ''                          // Not used
}
```

### Response Format
```javascript
{
  success: true,
  response: {
    // mNotify response data
  }
}
```

## How Alerts Work

### Flow Diagram
```
Monitor Status Changes
        ↓
   Alert Created
        ↓
sendAlertNotification()
        ↓
getRecipientsForAlert()
        ↓
    ┌─────────────────────────────┐
    │ Expand Contacts & Groups    │
    └─────────────────────────────┘
        ↓
    ┌─────────────────────────────┐
    │ Filter by Preferences       │
    │ - notifyEmail               │
    │ - notifySms                 │
    │ - notifyOnDown/notifyOnUp   │
    └─────────────────────────────┘
        ↓
    ┌──────────────────┬──────────────────┐
    ↓                  ↓                  ↓
 Email Recipients  SMS Recipients    TTS
    ↓                  ↓
 sendEmail()      sendSmsBatch()
    ↓                  ↓
 nodemailer       mNotify API
```

## Usage Guide

### 1. Create Contacts

**REST API:**
```bash
POST /api/contacts
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "0241234567",
  "role": "Admin",
  "notifyEmail": true,
  "notifySms": true,
  "notifyOnDown": true,
  "notifyOnUp": true
}
```

**Socket.IO:**
```javascript
socket.emit('contact:create', {
  name: "John Doe",
  email: "john@example.com",
  phone: "0241234567",
  notifySms: true,
  notifyOnDown: true
}, (response) => {
  console.log(response);
});
```

### 2. Create Contact Groups

**REST API:**
```bash
POST /api/contact-groups
{
  "name": "On-Call Team",
  "description": "Primary on-call support",
  "contactIds": ["contact-id-1", "contact-id-2"]
}
```

**Socket.IO:**
```javascript
socket.emit('contactGroup:create', {
  name: "On-Call Team",
  contactIds: ["contact-id-1", "contact-id-2"]
}, (response) => {
  console.log(response);
});
```

### 3. Manage Group Members

**Add Member (REST):**
```bash
POST /api/contact-groups/:id/members/:contactId
```

**Remove Member (REST):**
```bash
DELETE /api/contact-groups/:id/members/:contactId
```

**Add Member (Socket.IO):**
```javascript
socket.emit('contactGroup:add-member', {
  groupId: "group-id",
  contactId: "contact-id"
}, (response) => {
  console.log(response);
});
```

**Remove Member (Socket.IO):**
```javascript
socket.emit('contactGroup:remove-member', {
  groupId: "group-id",
  contactId: "contact-id"
}, (response) => {
  console.log(response);
});
```

### 4. Test SMS Configuration

**REST API:**
```bash
POST /api/settings/test-sms
{
  "testPhone": "0241234567",
  "smsSenderId": "PulseMonitor"
}
```

### 5. View Alert Recipients

**REST API:**
```bash
GET /api/contacts              # Get all contacts
GET /api/contact-groups        # Get all groups
GET /api/contact-groups/:id/members  # Get group members
```

## Configuration

### Settings

All SMS settings are stored in the system settings:

```javascript
{
  smsEnabled: true,                           // Enable/disable SMS
  smsApiKey: 'nppoeaeolIEXKUXQ01pLXP7Tz',    // mNotify API key
  smsSenderId: 'PulseMonitor',                // Sender ID for SMS
  smsApiUrl: '',                              // Not used with mNotify
  smsApiMethod: 'POST',                       // Not used with mNotify
  smsApiHeaders: {},                          // Not used with mNotify
  smsApiBodyTemplate: '...'                   // Not used with mNotify
}
```

Update settings via:
```bash
PUT /api/settings
{
  "smsEnabled": true,
  "smsSenderId": "YourCompanyName"
}
```

## Testing

### Run the Test Suite

```bash
# Start the server first
npm run dev

# In another terminal, run the test script
node test-sms-alerts.js
```

The test script will:
1. ✓ Create 3 test contacts with various notification preferences
2. ✓ Create 3 contact groups with different membership
3. ✓ Verify group members can be retrieved
4. ✓ Test SMS configuration with mNotify API
5. ✓ Simulate alert notification scenarios
6. ✓ Show which recipients would receive SMS alerts
7. ✓ Provide summary and next steps

### Manual Testing

1. **Create Test Contacts:**
   - Use the web UI or API to create contacts with:
     - Real or test phone numbers
     - SMS notification enabled (`notifySms: true`)
     - Notification triggers (`notifyOnDown: true`)

2. **Create Test Groups:**
   - Group contacts by role/team
   - Example: "Critical Team", "Support Team"

3. **Trigger Monitor Alert:**
   - Stop a monitored service or simulate failure
   - Monitor should trigger alert notification
   - SMS should be sent to all group members

4. **Check Logs:**
   - View `/api/logs` to see SMS sending attempts
   - View `/api/activity` to see notification activities

## Data Model

### Contact
```javascript
{
  id: "uuid",
  name: "Contact Name",
  email: "contact@example.com",        // Optional, for email alerts
  phone: "0241234567",                 // Required for SMS
  role: "Manager",
  notifyEmail: true,                   // Receive email alerts
  notifySms: true,                     // Receive SMS alerts
  notifyOnDown: true,                  // Notify when service goes down
  notifyOnUp: true,                    // Notify when service recovers
  notifyOnIncident: true,              // Notify on incidents
  groupIds: [],                        // Groups this contact belongs to
  createdAt: "2024-01-21T...",
  updatedAt: "2024-01-21T..."
}
```

### Contact Group
```javascript
{
  id: "uuid",
  name: "Group Name",
  description: "Group description",
  contactIds: ["contact-id-1", "contact-id-2"],  // Members
  createdAt: "2024-01-21T...",
  updatedAt: "2024-01-21T..."
}
```

## Error Handling

### SMS Sending Errors
- Network timeout: Logged and reported
- Invalid phone numbers: Filtered by mNotify API
- API key issues: Test with `/api/settings/test-sms`

### Logging
All SMS operations are logged:
- **Success**: `state.addLog('info', 'SMS sent to X contacts', {...})`
- **Failure**: `state.addLog('error', 'SMS failed: ...', {...})`

Activities are tracked:
```javascript
state.addActivity('notification_sent', 'sms', null, {
  phones: ['0241234567', '0201234567'],
  recipientCount: 2,
  type: 'sms'
});
```

## Troubleshooting

### SMS Not Sending
1. Check if SMS is enabled: `GET /api/settings`
2. Verify mNotify API key is set correctly
3. Test with: `POST /api/settings/test-sms`
4. Check contact has `notifySms: true`
5. Check contact has valid phone number
6. Check alert notification preferences (notifyOnDown/Up)

### Contacts Not in Group
1. Verify contact exists: `GET /api/contacts`
2. Add to group: `POST /api/contact-groups/:id/members/:contactId`
3. Verify membership: `GET /api/contact-groups/:id/members`

### Phone Numbers Not Formatted Correctly
- mNotify accepts international format: +countrycode...
- Example: +233241234567 (Ghana)
- Or local format: 0241234567
- Test with test SMS endpoint first

## Advanced Features

### Recipient Resolution Algorithm
```javascript
// 1. Get all direct contacts (who want notifications)
const directContacts = contacts.filter(c => c.notifyOnDown || c.notifyOnUp);

// 2. Get all group members (who want notifications)
for (group of groups) {
  for (contactId of group.contactIds) {
    if (contact.notifyOnDown || contact.notifyOnUp) {
      addToRecipients(contact);  // Deduplicated
    }
  }
}

// 3. Filter by channel preference
const emailRecipients = recipients.filter(c => c.email && c.notifyEmail);
const smsRecipients = recipients.filter(c => c.phone && c.notifySms);

// 4. Send to all recipients in batch
sendSmsBatch(smsRecipients.map(c => c.phone), message);
```

### Batch SMS Benefits
- Single API call for multiple recipients
- Lower latency than sequential calls
- More reliable delivery
- Better tracking

## Performance Considerations

- **Contact/Group Operations**: O(1) - stored in Map
- **Alert Resolution**: O(n) where n = total recipients
- **SMS Batch Send**: Single API call regardless of recipient count
- **Memory**: Contacts/groups stored in-memory with persistence

## Security Notes

- API keys are stored in settings (not in code)
- Phone numbers should be validated before adding
- Consider encryption for sensitive data
- Test with non-production phone numbers first
- Log all SMS activities for audit trail

## Future Enhancements

- [ ] Message templates with variables
- [ ] Scheduled SMS delivery
- [ ] SMS delivery confirmations
- [ ] Retry failed SMS deliveries
- [ ] Multiple SMS providers (fallback)
- [ ] Contact group hierarchies
- [ ] Time-based notification rules (quiet hours)
- [ ] SMS opt-in/opt-out management
