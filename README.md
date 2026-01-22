# Pulse Monitor v4.0.0

Professional Real-time Infrastructure Monitoring System with Applications, Components, JSON Persistence, Email/SMS Alerts, and Text-to-Speech.

## ✨ Features

### Core Monitoring
- **6 Monitor Types**: HTTP/HTTPS, ICMP (Ping), TCP, SSH, Telnet, SFTP
- **Real-time Updates**: WebSocket-based instant status updates
- **Response Time Tracking**: Monitor performance over time
- **SSL Certificate Monitoring**: Track certificate expiration for HTTPS

### Applications & Components
- **Application Grouping**: Organize monitors under applications
- **Health Overview**: See application health at a glance
- **Component Status**: View which components are up/down
- **Uptime Tracking**: Per-application uptime percentage

### Groups
- **Monitor Groups**: Organize monitors by location, function, or team
- **Group Health**: View group-level statistics
- **Easy Navigation**: Quick access to related monitors

### Alerting System
- **Consecutive Failure Threshold**: Configurable number of failures before alert
- **Auto-resolve**: Automatically clear alerts when service recovers
- **Incident Tracking**: Track incident duration and history
- **Alert Acknowledgment**: Acknowledge and resolve alerts

### Notifications
- **Email Notifications**: SMTP-based email alerts
- **SMS Notifications**: Generic HTTP API for SMS providers
- **Browser Notifications**: Push notifications in browser
- **Text-to-Speech**: Voice alerts using system TTS
- **Custom Alert Text**: Define custom messages to be spoken
- **Contacts & Groups**: Manage notification recipients

### SSH Features
- **Remote Terminal**: Execute commands via web interface
- **Sudo Support**: Execute privileged commands with sudo password
- **Private Key Authentication**: Support for SSH keys

### Data Persistence
- **JSON Storage**: All data saved to `data/state.json`
- **Auto-save**: State saved every 30 seconds
- **Graceful Shutdown**: State saved on server stop
- **Auto-reload**: Resume monitoring on server restart

### Activity Logging
- **Comprehensive Logs**: Track all system activities
- **Drill-down Details**: View full activity details
- **Filterable**: Filter by action, entity type, or date

### Reports
- **PDF Reports**: Generate professional PDF reports
- **Multiple Types**: Overview, Uptime, Incidents, Alerts, Activity
- **Application Reports**: Per-application health reports

## 🚀 Quick Start

### Using Node.js

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open browser
open http://localhost:3032
```

### Using Docker

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## 📁 Project Structure

```
pulse-monitor/
├── server.js                 # Main server (Express + Socket.IO)
├── package.json              # Dependencies
├── state/
│   └── monitorState.js       # State management with persistence
├── monitors/
│   └── monitorEngine.js      # Monitor check implementations
├── services/
│   ├── notificationService.js # Email, SMS, TTS
│   └── reportService.js      # PDF report generation
├── handlers/
│   └── socketHandlers.js     # WebSocket event handlers
├── routes/
│   └── apiRoutes.js          # REST API endpoints
├── public/
│   └── index.html            # SPA dashboard
├── data/
│   └── state.json            # Persisted state (auto-created)
├── Dockerfile                # Docker deployment
└── docker-compose.yml        # Docker Compose config
```

## 🔧 Configuration

### Monitor Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Consecutive Failures | Failures before alert | 3 |
| Auto-resolve | Auto-clear alerts on recovery | true |

### Notification Settings

| Setting | Description |
|---------|-------------|
| Browser Notifications | Push notifications |
| Sound Alerts | Audio alerts on incidents |
| Alert Volume | Volume 0-100% |

### Email (SMTP)

| Setting | Description |
|---------|-------------|
| SMTP Host | Mail server hostname |
| SMTP Port | Mail server port (587 default) |
| SMTP Secure | Use SSL/TLS |
| SMTP User | Authentication username |
| SMTP Password | Authentication password |
| From Address | Sender email address |

### SMS (HTTP API)

| Setting | Description |
|---------|-------------|
| API URL | SMS provider endpoint |
| API Key | Authentication key |
| Sender ID | Sender name/number |
| Body Template | JSON template with placeholders |

Placeholders: `{{phone}}`, `{{message}}`, `{{senderId}}`

### Text-to-Speech

| Setting | Description |
|---------|-------------|
| TTS Enabled | Enable voice alerts |
| TTS Voice | Voice selection |
| Speech Rate | Speed (0.5-2.0) |
| Custom Alert Text | Override default message |

## 📡 API Endpoints

### Monitors
- `GET /api/monitors` - List all monitors
- `POST /api/monitors` - Create monitor
- `PUT /api/monitors/:id` - Update monitor
- `DELETE /api/monitors/:id` - Delete monitor
- `POST /api/monitors/:id/check` - Run check now
- `POST /api/monitors/test` - Test configuration

### Applications
- `GET /api/applications` - List all
- `GET /api/applications/:id/health` - Get health
- `POST /api/applications` - Create
- `PUT /api/applications/:id` - Update
- `DELETE /api/applications/:id` - Delete

### Groups
- `GET /api/groups` - List all
- `GET /api/groups/:id` - Get with monitors
- `POST /api/groups` - Create
- `PUT /api/groups/:id` - Update
- `DELETE /api/groups/:id` - Delete

### Contacts
- `GET /api/contacts` - List all
- `POST /api/contacts` - Create
- `PUT /api/contacts/:id` - Update
- `DELETE /api/contacts/:id` - Delete

### Reports
- `GET /api/reports/overview` - Overview PDF
- `GET /api/reports/uptime` - Uptime PDF
- `GET /api/reports/incidents` - Incidents PDF
- `GET /api/reports/alerts` - Alerts PDF
- `GET /api/reports/activity` - Activity PDF
- `GET /api/reports/application?applicationId=xxx` - App PDF

### Other
- `GET /api/statuses` - All monitor statuses
- `GET /api/alerts` - All alerts
- `GET /api/incidents` - All incidents
- `GET /api/activity` - Activity logs
- `GET /api/settings` - Current settings
- `PUT /api/settings` - Update settings
- `GET /api/export` - Export configuration
- `POST /api/import` - Import configuration
- `GET /api/health` - Health check

## 🔌 WebSocket Events

### Client → Server
- `monitor:create`, `monitor:update`, `monitor:delete`
- `monitor:toggle`, `monitor:check-now`, `monitor:test`
- `monitor:execute-command` (SSH terminal)
- `application:create`, `application:update`, `application:delete`
- `application:add-monitor`, `application:remove-monitor`
- `group:create`, `group:update`, `group:delete`
- `contact:create`, `contact:update`, `contact:delete`
- `contactGroup:create`, `contactGroup:update`, `contactGroup:delete`
- `alert:acknowledge`, `alert:resolve`
- `settings:update`, `settings:test-tts`
- `export`, `import`

### Server → Client
- `init` - Initial state
- `monitors-update`, `applications-update`, `groups-update`
- `statuses-update`, `alerts-update`, `incidents-update`
- `contacts-update`, `contactGroups-update`
- `settings-update`, `stats-update`
- `activity-update`, `logs-update`

## 🚢 Production Deployment

### Using PM2

```bash
npm install -g pm2
pm2 start server.js --name pulse-monitor
pm2 save
pm2 startup
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3032 |
| NODE_ENV | Environment | development |

## 🔒 Security Notes

- Credentials stored in memory and encrypted JSON
- Passwords excluded from API responses and exports
- No built-in authentication (use reverse proxy)
- Rate limiting recommended for production

## 📝 License

MIT License - Free for personal and commercial use.

---

Built with ❤️ by Gashie
