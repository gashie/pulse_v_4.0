# SMS Alert System - Quick Reference

## What Was Implemented

✅ **SMS Integration with mNotify API**
- Endpoint: https://api.mnotify.com/api/sms/quick
- API Key: nppoeaeolIEXKUXQ01pLXP7Tz
- Batch SMS support (send to multiple numbers in one call)
- Pre-configured and enabled by default

✅ **Contact Management**
- Create/update/delete individual contacts
- Phone numbers and SMS notification preferences
- Notification rules (notify on down/up)
- REST API and Socket.IO support

✅ **Contact Groups**
- Create groups to organize contacts
- Add/remove contacts from groups
- Groups expand to all members when sending alerts
- Prevent duplicate notifications

✅ **Smart Alert Routing**
- Resolve groups to individual contacts
- Filter by notification preferences
- Batch send SMS to all recipients
- Support for email and SMS simultaneously

✅ **Complete Testing Suite**
- Test script: `node test-sms-alerts.js`
- Creates test contacts, groups, and verifies SMS delivery
- Simulates alert scenarios
- Shows recipient resolution

## How to Use

### 1. Start Server
```bash
npm run dev
```

### 2. Run Test Suite
```bash
# In another terminal
node test-sms-alerts.js
```

### 3. Create Contact via API
```bash
curl -X POST http://localhost:3032/api/contacts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phone": "0241234567",
    "notifySms": true,
    "notifyOnDown": true
  }'
```

### 4. Create Contact Group
```bash
curl -X POST http://localhost:3032/api/contact-groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "On-Call Team",
    "contactIds": ["contact-id-1", "contact-id-2"]
  }'
```

### 5. Test SMS
```bash
curl -X POST http://localhost:3032/api/settings/test-sms \
  -H "Content-Type: application/json" \
  -d '{
    "testPhone": "0241234567"
  }'
```

## File Changes Summary

### Modified Files:

1. **services/notificationService.js**
   - Updated `sendSms()` to use mNotify API
   - Added `sendSmsBatch()` for batch SMS delivery
   - Updated `sendAlertNotification()` to use group resolution
   - Updated `testSmsConfig()` to test mNotify API

2. **state/monitorState.js**
   - Added `getRecipientsForAlert()` function for group expansion
   - Enabled SMS by default in settings
   - Pre-configured mNotify API key and sender ID
   - Exported new `getRecipientsForAlert` function

3. **handlers/socketHandlers.js**
   - Added `contactGroup:add-member` handler
   - Added `contactGroup:remove-member` handler
   - Added `contactGroup:get-members` handler

4. **routes/apiRoutes.js**
   - Added `GET /contact-groups/:id/members` endpoint
   - Added `POST /contact-groups/:id/members/:contactId` endpoint
   - Added `DELETE /contact-groups/:id/members/:contactId` endpoint

### New Files:

1. **test-sms-alerts.js**
   - Comprehensive testing script
   - Tests all SMS alert features
   - Creates sample data for testing

2. **SMS_ALERTS_GUIDE.md**
   - Complete implementation guide
   - Usage examples
   - Troubleshooting

## Key Functions

### Send SMS Batch
```javascript
// In notificationService.js
await sendSmsBatch(['0241234567', '0201234567'], 'Alert message');
```

### Get Alert Recipients
```javascript
// In monitorState.js
const { emailRecipients, smsRecipients } = state.getRecipientsForAlert();
// Returns all contacts + group members that want notifications
```

### Manage Group Members
```javascript
// Add member
POST /api/contact-groups/:id/members/:contactId

// Remove member
DELETE /api/contact-groups/:id/members/:contactId

// Get members
GET /api/contact-groups/:id/members
```

## Data Flow for Alert

```
Monitor Alert Triggered
        ↓
sendAlertNotification(alert, monitor)
        ↓
getRecipientsForAlert()
        ↓
Get all contacts + expand groups
        ↓
Filter by notification preferences
        ↓
sendSmsBatch(phones, message)
        ↓
mNotify API
        ↓
SMS Delivery to All Recipients
```

## Configuration

SMS is enabled by default with:
- **smsEnabled**: true
- **smsSenderId**: PulseMonitor
- **API Key**: nppoeaeolIEXKUXQ01pLXP7Tz (pre-configured)

Update via:
```bash
PUT /api/settings
{
  "smsEnabled": true,
  "smsSenderId": "Your Company Name"
}
```

## Testing Checklist

- [ ] Run `node test-sms-alerts.js` to verify setup
- [ ] Create test contacts with phone numbers
- [ ] Create contact groups with members
- [ ] Test SMS config endpoint
- [ ] Verify SMS sent in logs (GET /api/logs)
- [ ] Check activities (GET /api/activity)
- [ ] Trigger monitor alert to test real alert flow

## Example: Complete Flow

```bash
# 1. Create Contact
curl -X POST http://localhost:3032/api/contacts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice",
    "phone": "0241234567",
    "notifySms": true,
    "notifyOnDown": true,
    "notifyOnUp": true
  }'
# Returns: {id: "contact-123", ...}

# 2. Create Contact Group
curl -X POST http://localhost:3032/api/contact-groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Team",
    "contactIds": ["contact-123"]
  }'
# Returns: {id: "group-456", ...}

# 3. Test SMS Delivery
curl -X POST http://localhost:3032/api/settings/test-sms \
  -H "Content-Type: application/json" \
  -d '{"testPhone": "0241234567"}'

# 4. When monitor alert triggers -> SMS sent to all group members
```

## API Endpoints

### Contacts
- `GET /api/contacts` - List all
- `POST /api/contacts` - Create
- `PUT /api/contacts/:id` - Update
- `DELETE /api/contacts/:id` - Delete

### Contact Groups
- `GET /api/contact-groups` - List all
- `POST /api/contact-groups` - Create
- `PUT /api/contact-groups/:id` - Update
- `DELETE /api/contact-groups/:id` - Delete
- `GET /api/contact-groups/:id/members` - Get members
- `POST /api/contact-groups/:id/members/:contactId` - Add member
- `DELETE /api/contact-groups/:id/members/:contactId` - Remove member

### Testing
- `POST /api/settings/test-sms` - Test SMS sending

## Troubleshooting

**SMS not sending?**
1. Check SMS enabled: `GET /api/settings` → `smsEnabled: true`
2. Verify contact exists with valid phone
3. Verify contact has `notifySms: true`
4. Test with: `POST /api/settings/test-sms`
5. Check logs: `GET /api/logs?level=error`

**Group members not found?**
1. Verify group exists: `GET /api/contact-groups`
2. Verify contacts exist: `GET /api/contacts`
3. Add members: `POST /api/contact-groups/:id/members/:contactId`
4. Check members: `GET /api/contact-groups/:id/members`

**Phone numbers not working?**
- Test format: +233241234567 (international) or 0241234567 (local)
- Ensure phone is valid for target country
- Test with test endpoint first

## Support

For full documentation, see: `SMS_ALERTS_GUIDE.md`
