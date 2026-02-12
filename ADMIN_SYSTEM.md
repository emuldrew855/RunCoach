# RunCoach Admin System Documentation

## Overview

The admin system provides comprehensive monitoring, analytics, and user management capabilities for RunCoach administrators.

## Features

### ✅ Implemented (Backend Complete)

1. **System Analytics Dashboard**
   - Total users, active users (24h, 7d, 30d)
   - New user signups over time
   - Session analytics (duration, page views, API calls)
   - API performance metrics (response times, error rates)
   - Database size monitoring

2. **User Management**
   - View all users with detailed analytics
   - Search users by name or email
   - View individual user profiles with activity stats
   - Grant/revoke admin privileges

3. **User Impersonation**
   - Securely login as any user for debugging
   - Requires reason (audit trail)
   - 1-hour expiration on impersonation tokens
   - All impersonation actions logged

4. **Telemetry & Monitoring**
   - Automatic API request tracking (method, endpoint, response time, status)
   - Session tracking (device type, browser, duration)
   - Error logging with stack traces
   - Performance monitoring

5. **Audit Logging**
   - Complete audit trail of all admin actions
   - Track who accessed what data
   - IP address and user agent logging
   - Timestamps for compliance

6. **Security**
   - Admin-only routes with authentication
   - Authorization middleware
   - Audit trail for accountability
   - Impersonation tokens expire after 1 hour

---

## Database Schema

### New Tables

#### `users` (enhanced)
```sql
is_admin BOOLEAN DEFAULT false
admin_notes TEXT
```

#### `user_sessions`
Tracks user sessions for analytics:
- Session duration
- Page views and API calls
- Device type and browser
- Entry/exit pages

#### `admin_audit_log`
Complete audit trail:
- Action type (view_user, impersonate, modify_user, etc.)
- Target user
- Timestamp
- IP address

#### `api_telemetry`
API performance tracking:
- Endpoint and method
- Response time
- Status code
- Request/response sizes
- Error messages

#### `impersonation_tokens`
Temporary tokens for user impersonation:
- Admin user
- Target user
- Expiration (1 hour)
- Reason for impersonation

### Views

#### `user_analytics_summary`
Aggregated user analytics for fast dashboard queries.

#### `system_analytics`
System-wide metrics (users, sessions, API calls, errors).

---

## API Endpoints

All endpoints require authentication + admin privileges (`/api/v1/admin/*`).

### Analytics

#### `GET /api/v1/admin/analytics`
Get system-wide analytics overview.

**Response:**
```json
{
  "success": true,
  "data": {
    "analytics": {
      "total_users": 150,
      "active_users_24h": 45,
      "active_users_7d": 98,
      "new_users_7d": 12,
      "sessions_24h": 203,
      "avg_session_duration_7d": 420,
      "api_calls_24h": 15000,
      "avg_response_time_24h": 85,
      "api_errors_24h": 23,
      "database_size": "2.3 GB"
    }
  }
}
```

#### `GET /api/v1/admin/metrics/growth?days=30`
Get user growth metrics over time.

**Response:**
```json
{
  "success": true,
  "data": {
    "metrics": [
      { "date": "2026-01-01", "new_users": 5 },
      { "date": "2026-01-02", "new_users": 8 },
      ...
    ]
  }
}
```

#### `GET /api/v1/admin/metrics/engagement?days=30`
Get user engagement metrics over time.

---

### User Management

#### `GET /api/v1/admin/users?limit=50&offset=0`
Get all users with analytics.

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 1,
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com",
        "user_since": "2026-01-01T00:00:00Z",
        "last_login_at": "2026-02-05T10:30:00Z",
        "total_sessions": 45,
        "avg_session_duration_seconds": 380,
        "total_activities": 120,
        "total_chat_messages": 89,
        "pending_actions_count": 2
      },
      ...
    ]
  }
}
```

#### `GET /api/v1/admin/users/search?q=john`
Search users by name or email.

#### `GET /api/v1/admin/users/:userId`
Get detailed analytics for specific user.

#### `PUT /api/v1/admin/users/:userId/admin`
Grant or revoke admin privileges.

**Request Body:**
```json
{
  "isAdmin": true,
  "notes": "Granted admin access for testing"
}
```

---

### User Impersonation

#### `POST /api/v1/admin/users/:userId/impersonate`
Generate impersonation token to login as user.

**Request Body:**
```json
{
  "reason": "Debugging training plan issue reported by user"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jwt": "eyJhbGciOiJIUzI1NiIs...",
    "impersonationToken": "abc123...",
    "targetUser": {
      "id": 42,
      "name": "John Doe",
      "email": "john@example.com"
    },
    "expiresIn": "1 hour"
  },
  "message": "Impersonation token created. Use this JWT to login as the user."
}
```

**Usage:**
1. Admin clicks "Impersonate" button in dashboard
2. Backend generates JWT with user ID
3. Frontend stores JWT in localStorage
4. Admin is now "logged in" as the target user
5. All actions performed as that user
6. Token expires after 1 hour
7. Audit log tracks all actions

---

### Telemetry

#### `GET /api/v1/admin/telemetry/api?limit=100&errorsOnly=false`
Get API performance metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "telemetry": [
      {
        "endpoint": "/api/v1/chat/message",
        "method": "POST",
        "status_code": 200,
        "avg_response_time": 145,
        "request_count": 523,
        "error_count": 0
      },
      ...
    ]
  }
}
```

#### `GET /api/v1/admin/errors?limit=50`
Get recent API errors (status >= 400).

**Response:**
```json
{
  "success": true,
  "data": {
    "errors": [
      {
        "endpoint": "/api/v1/training/workouts",
        "method": "POST",
        "status_code": 400,
        "error_message": "Validation failed",
        "user_id": 42,
        "created_at": "2026-02-05T10:30:00Z"
      },
      ...
    ]
  }
}
```

---

### Sessions

#### `GET /api/v1/admin/sessions?limit=50&userId=42`
Get recent user sessions.

---

### Audit Logs

#### `GET /api/v1/admin/audit-logs?limit=100&adminUserId=1`
Get admin audit logs.

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "admin_user_id": 1,
        "action_type": "impersonate",
        "target_user_id": 42,
        "action_details": {
          "reason": "Debugging issue"
        },
        "ip_address": "192.168.1.1",
        "created_at": "2026-02-05T10:30:00Z"
      },
      ...
    ]
  }
}
```

---

## CLI Tools

### Make Admin Script

Grant or revoke admin privileges via command line.

**Usage:**
```bash
# Grant admin
npm run make-admin john@example.com

# Revoke admin
npm run make-admin john@example.com --revoke
```

**Example Output:**
```
✓ Admin privileges granted to John Doe (john@example.com)
  User ID: 42
  You can now login and access /admin routes
```

---

## Setup Instructions

### 1. Run Database Migration

```bash
cd backend
npm run migrate
```

This creates:
- Admin tables (user_sessions, admin_audit_log, api_telemetry, impersonation_tokens)
- Views (user_analytics_summary, system_analytics)
- Functions (update_session_activity, end_session)

### 2. Make Yourself an Admin

```bash
cd backend
npm run make-admin your-email@example.com
```

### 3. Start Backend

```bash
npm run dev
```

The telemetry middleware will automatically start tracking API calls.

### 4. Login and Access Admin Dashboard

- Login with your Strava account
- Navigate to `/admin` in the frontend
- You should see the admin dashboard

---

## Frontend Implementation (Next Steps)

### Pages to Create

1. **`/admin`** - Main dashboard with analytics overview
2. **`/admin/users`** - User management with search
3. **`/admin/users/:id`** - Individual user details
4. **`/admin/telemetry`** - API performance and errors
5. **`/admin/audit`** - Admin action audit logs

### Components

1. **`AdminLayout`** - Sidebar navigation for admin pages
2. **`AnalyticsCard`** - Metric display cards
3. **`UserTable`** - Sortable/searchable user table
4. **`TelemetryChart`** - Line/bar charts for metrics
5. **`ImpersonateButton`** - Secure impersonation UI
6. **`AuditLogTable`** - Audit trail display

### Required Libraries

```bash
cd frontend
npm install recharts  # For charts
npm install date-fns  # Already installed
```

---

## Security Considerations

### ✅ Implemented

1. **Admin Authentication**
   - `requireAdmin` middleware checks `is_admin` flag
   - All admin routes protected

2. **Audit Trail**
   - Every admin action logged to `admin_audit_log`
   - Includes IP address, timestamp, target user

3. **Impersonation Safety**
   - Requires explicit reason (min 10 characters)
   - 1-hour token expiration
   - Logged to audit trail
   - Original admin tracked in JWT

4. **Authorization**
   - Users can only access their own data
   - Admins can access all data
   - Middleware enforces permissions

### ⚠️ Considerations

1. **Admin Account Security**
   - Use strong passwords
   - Enable 2FA on Strava account
   - Rotate admin credentials regularly

2. **Impersonation**
   - Only use for legitimate debugging
   - Document reason clearly
   - Don't impersonate for malicious purposes
   - Regular audit of impersonation logs

3. **Data Privacy**
   - Admins have access to sensitive user data
   - Follow GDPR/privacy regulations
   - Don't share user data externally

---

## Monitoring & Alerts

### Metrics to Watch

1. **Error Rate**
   - Alert if >5% of API calls fail
   - Check `/admin/errors` daily

2. **Response Time**
   - Alert if avg response >500ms
   - Investigate slow endpoints

3. **User Growth**
   - Track daily signups
   - Identify drop-off points

4. **Session Duration**
   - Monitor engagement
   - Low duration = poor UX

### Recommended Alerts

```sql
-- High error rate (>5%)
SELECT
  COUNT(*) FILTER (WHERE status_code >= 400)::FLOAT / COUNT(*) * 100 as error_rate
FROM api_telemetry
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Slow endpoints (>1s average)
SELECT endpoint, AVG(response_time_ms) as avg_ms
FROM api_telemetry
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY endpoint
HAVING AVG(response_time_ms) > 1000;
```

---

## Performance Optimization

### Database Indexes

All critical queries are indexed:
- `idx_users_is_admin` - Admin lookups
- `idx_api_telemetry_created_at` - Time-based queries
- `idx_user_sessions_started_at` - Session analytics

### Telemetry Overhead

- Telemetry logging is asynchronous (doesn't block requests)
- Minimal performance impact (~1-2ms per request)
- Can be disabled in production if needed

### Cleanup Strategy

Archive old data to keep queries fast:

```sql
-- Archive telemetry older than 90 days
DELETE FROM api_telemetry
WHERE created_at < NOW() - INTERVAL '90 days';

-- Archive old sessions
DELETE FROM user_sessions
WHERE started_at < NOW() - INTERVAL '180 days';
```

---

## Future Enhancements

### Planned Features

1. **Email Notifications**
   - Send weekly admin summary emails
   - Alert on critical errors
   - User activity reports

2. **Advanced Analytics**
   - Cohort analysis
   - Funnel visualization
   - A/B testing framework

3. **User Communication**
   - Broadcast messages to all users
   - Targeted announcements
   - In-app notifications

4. **Feature Flags**
   - Enable/disable features per user
   - Gradual rollout
   - A/B testing

5. **Data Export**
   - Export user data for GDPR compliance
   - CSV/JSON export of analytics
   - Scheduled reports

---

## Troubleshooting

### "Admin privileges required" error

1. Verify user has `is_admin = true`:
   ```sql
   SELECT id, email, is_admin FROM users WHERE email = 'your-email@example.com';
   ```

2. If false, run:
   ```bash
   npm run make-admin your-email@example.com
   ```

### Telemetry not tracking

1. Check middleware is loaded in `index.ts`
2. Verify `api_telemetry` table exists
3. Check database connection
4. Look for errors in server logs

### Impersonation not working

1. Verify token hasn't expired (1 hour limit)
2. Check audit logs for token creation
3. Ensure JWT is properly formatted
4. Verify target user exists

---

## Testing

### Manual Testing Checklist

- [ ] Login as admin user
- [ ] View analytics dashboard
- [ ] Search for users
- [ ] View individual user details
- [ ] Impersonate a user
- [ ] Verify audit log entries
- [ ] Check telemetry data
- [ ] Review error logs
- [ ] Grant admin to another user
- [ ] Revoke admin privileges

### API Testing with cURL

```bash
# Get analytics (replace TOKEN with your JWT)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3001/api/v1/admin/analytics

# Search users
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3001/api/v1/admin/users/search?q=john"

# Impersonate user
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Testing user impersonation feature"}' \
  http://localhost:3001/api/v1/admin/users/42/impersonate
```

---

## Summary

The admin system provides:
- ✅ **Comprehensive analytics** (users, sessions, API performance)
- ✅ **User management** (view, search, modify admin status)
- ✅ **Secure impersonation** (with audit trail)
- ✅ **Telemetry tracking** (automatic API monitoring)
- ✅ **Audit logging** (accountability and compliance)
- ✅ **CLI tools** (easy admin management)

**Backend is 100% complete and ready to use!**

**Next step:** Build the frontend admin dashboard UI to visualize all this data. 🎨
