# API & Event Contract Specification

**Project**: Smart Classroom – Exam Integrity & Focus Management System  
**Version**: 1.1.0  
**Stage**: Phase 1.2 Foundation (Dual Role: Teacher & Student)  

---

## 1. Unified Event Envelope

All real-time and telemetry data exchanged between the Desktop Agent, Backend, and Frontend adhere to the unified Event Envelope schema.

### 1.1 Standard JSON Event Format
```json
{
  "event_id": "evt_550e8400-e29b-41d4-a716-446655440000",
  "type": "activity_event",
  "event_type": "restricted_website",
  "device_id": "PC-001",
  "student_id": "STU-001",
  "classroom_id": "CLASS-001",
  "session_id": "SESSION-001",
  "mode": "exam",
  "occurred_at": "2026-10-30T12:00:00.000Z",
  "source": "agent",
  "severity": "medium",
  "details": {
    "window_title": "Prohibited Resource - Browser",
    "process_name": "chrome.exe",
    "url_or_domain": "chegg.com",
    "confidence_score": 0.95
  }
}
```

### 1.2 Envelope Field Specifications

| Field | Type | Required | Allowed Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `event_id` | String (UUIDv4) | Yes | Valid UUID | Unique idempotency key. Ingested events with existing IDs are rejected as duplicates. |
| `type` | String | Yes | `activity_event`, `heartbeat`, `connectivity_event`, `session_event`, `alert_event` | High-level telemetry category. |
| `event_type` | String | Yes | See Section 1.3 | Specific granular action or observation. |
| `device_id` | String | Yes | Alphanumeric (e.g. `PC-001`) | Unique registered hardware/device identifier. |
| `student_id` | String | Yes | Alphanumeric (e.g. `STU-001`) | Enrolled student ID associated with the session. |
| `classroom_id` | String | Yes | Alphanumeric (e.g. `CLASS-001`) | Classroom context identifier. |
| `session_id` | String | Yes | Alphanumeric (e.g. `SESSION-001`) | Specific ExamSession or FocusSession ID. |
| `mode` | String | Yes | `exam`, `focus` | Policy context. Determines rule evaluation and alert routing. |
| `occurred_at` | String (ISO-8601) | Yes | UTC ISO timestamp | Client wall-clock time when event occurred. |
| `source` | String | Yes | `agent`, `server`, `demo` | **Critical Rule**: Simulated or test events must use `demo` and are never displayed as verified hardware detections. |
| `severity` | String | Yes | `low`, `medium`, `high`, `critical` | Urgency classification. Triggers dashboard toasts on `high` or `critical`. |
| `details` | Object | Yes | JSON Dictionary | Additional structured metadata specific to the `event_type`. |

---

### 1.3 Standardized Event Types

#### A. Activity Events (`type: "activity_event"`)
- `window_blur`: Foreground focus shifted away from approved application.
- `window_focus`: Student returned to the approved exam or study workspace.
- `restricted_app`: A disallowed process or application was spawned (e.g., messaging apps, IDEs during closed-book exams).
- `restricted_website`: A disallowed domain or web page was visited.
- `multi_display_detected`: External monitors or video splitters connected.
- `idle_timeout`: User inactive (no input) beyond policy threshold.
- `face_missing`: Visual sensor detected candidate left camera view (Focus mode/Exam preview).
- `multiple_faces`: Multiple individuals detected in camera view.

#### B. Heartbeat Events (`type: "heartbeat"`)
Sent every 5 seconds by active desktop agents to maintain health and liveness:
```json
{
  "event_id": "evt_hb_89324789",
  "type": "heartbeat",
  "event_type": "agent_heartbeat",
  "device_id": "PC-001",
  "student_id": "STU-001",
  "classroom_id": "CLASS-001",
  "session_id": "SESSION-001",
  "mode": "exam",
  "occurred_at": "2026-10-30T12:00:05.000Z",
  "source": "agent",
  "severity": "low",
  "details": {
    "agent_version": "1.0.0",
    "os_platform": "Windows 11",
    "cpu_usage_percent": 12.4,
    "memory_usage_mb": 84.2,
    "battery_state": "charging"
  }
}
```

#### C. Connectivity Events (`type: "connectivity_event"`)
- `device_connected`: Agent established authenticated session.
- `device_disconnected`: Agent closed connection cleanly or socket timed out (15s heartbeat lapse).
- `buffer_flushed`: Agent back-propagated buffered offline events upon reconnection.

---

## 1.4 Secure Student-Device Pairing Contract

To prevent student account credential leakage to desktop background processes, agents never store student passwords or permanent JWTs. Pairing uses single-use codes:

### A. Request Pairing Code (Student Portal)
- **Endpoint**: `POST /api/v1/devices/pairing-code`
- **Auth**: Bearer JWT (`role: student`)
- **Response**:
  ```json
  {
    "pairing_code": "8K2NP4",
    "expires_in_seconds": 600
  }
  ```

### B. Exchange Pairing Code (Desktop Agent)
- **Endpoint**: `POST /api/v1/devices/pair`
- **Auth**: None (Public; validated via single-use code)
- **Request**:
  ```json
  {
    "pairing_code": "8K2NP4",
    "hardware_uuid": "3a7b8c9d-...",
    "hostname": "STUDENT-PC",
    "os_type": "windows",
    "os_version": "Windows 11 (10.0.22631)",
    "agent_version": "1.0.0"
  }
  ```
- **Response**:
  ```json
  {
    "device_id": "dev-482a...",
    "device_token": "eyJhbGciOi...",
    "student_id": "usr-192a...",
    "student_name": "John Doe",
    "hardware_uuid": "3a7b8c9d-...",
    "status": "connected"
  }
  ```

### C. Acquire Agent WebSocket Ticket
- **Endpoint**: `POST /api/v1/devices/ws-ticket`
- **Auth**: Bearer Device Token (`role: agent`)
- **Response**:
  ```json
  {
    "ticket": "tkt_agent_8a2f...",
    "expires_in_seconds": 60
  }
  ```

### D. Revoke Device
- **Endpoint**: `POST /api/v1/devices/{device_id}/revoke`
- **Auth**: Bearer JWT (`role: student` owner or `role: teacher`)
- **Response**:
  ```json
  {
    "message": "Device revoked successfully",
    "device_id": "dev-482a..."
  }
  ```

---

## 2. WebSocket Real-Time Channels

The system maintains three dedicated real-time channels:

### 2.1 Ticket-Based Authentication Mechanism
To prevent credential leakage in URL logs or browser history, clients must acquire a short-lived ticket before connecting:
1. Client makes authenticated HTTP request:
   `POST /api/v1/auth/ws-ticket` (Requires Bearer JWT)
2. Server responds with:
   `{"ticket": "tkt_e739bf82...", "expires_in": 60}`
3. Client opens WebSocket connection passing ticket in initial connection handshake (`Sec-WebSocket-Protocol: tkt_e739bf82...` or initial `{"type": "auth", "ticket": "..."}` message frame).
4. If invalid or expired, the backend closes with code `4401 (Unauthorized)`.

### 2.2 Channel Specifications

#### Channel 1: `/ws/teacher`
- **Audience**: Authenticated users with role `teacher`.
- **Scope**: Subscribed to classroom cohorts and active exams.
- **Server-to-Client Messages**:
  - `device_status_update`: Device state changes (`connected`, `disconnected`, `inactive`).
  - `integrity_alert`: Immediate alert on rule breach with severity and evidence.
  - `session_tick`: Aggregated countdown timer, participation tally, and anomaly count.
- **Client-to-Server Messages**:
  - `acknowledge_alert`: Mark an alert as reviewed with optional note.
  - `broadcast_announcement`: Send a message banner to all exam participants.

#### Channel 2: `/ws/student`
- **Audience**: Authenticated users with role `student`.
- **Server-to-Client Messages**:
  - `session_state_change`: Exam paused, resumed, or ended by teacher.
  - `teacher_announcement`: Official instructions or clarifications from proctor.
  - `focus_nudge`: Gentle suggestion to resume focus (Focus mode only).
- **Client-to-Server Messages**:
  - `ping`: Keepalive.

#### Channel 3: `/ws/agent`
- **Audience**: Desktop background agent running on student PC.
- **Client-to-Server Messages**:
  - `event_batch`: Array of standard Event Envelopes.
  - `heartbeat`: Periodic liveness proof.
- **Server-to-Client Messages**:
  - `policy_update`: Configuration payload defining active blacklists, thresholds, and allowed applications.
  - `ack`: Acknowledgments of received event IDs to release agent local buffer.

---

## 3. REST API Endpoint Groups

Base URL: `/api/v1`

### Application Roles
The system strictly supports two roles:
1. `teacher`: Full administrative access to classrooms, exams, devices, focus oversight, alerts, and audit logs.
2. `student`: Access restricted to own enrollments, joined exams, personal focus sessions, and personal device telemetry.

---

### 3.1 Authentication & Identity (`/auth`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Register new student or teacher account | No | Public (Teacher requires server key) |
| `POST` | `/auth/login` | Authenticate and obtain JWT access token | No | Public |
| `GET` | `/auth/me` | Retrieve profile and verified role of user | Yes (Bearer) | `teacher`, `student` |
| `POST` | `/auth/ws-ticket` | Issue single-use 60s WebSocket ticket | Yes (Bearer) | `teacher`, `student` |

#### Controlled Role Provisioning (`POST /auth/register`):
- Defaults to role `student`.
- To register as `teacher`, the request must include a valid `teacher_provisioning_key` matching server environment configuration.

---

### 3.2 Classrooms (`/classrooms`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/classrooms` | Create a new classroom cohort | Yes | `teacher` |
| `GET` | `/classrooms` | List classrooms owned or enrolled in | Yes | `teacher`, `student` |
| `GET` | `/classrooms/{id}` | Get specific classroom details | Yes | `teacher`, `student` |
| `POST` | `/classrooms/join` | Join classroom via 6-character code | Yes | `student` |
| `GET` | `/classrooms/{id}/students` | List enrolled students in classroom | Yes | `teacher` |
| `POST` | `/classrooms/{id}/announcements` | Broadcast announcement to classroom | Yes | `teacher` |
| `DELETE` | `/classrooms/{id}/students/{student_id}` | Remove student from classroom cohort | Yes | `teacher` |
| `DELETE` | `/classrooms/{id}/leave` | Student voluntarily leaves classroom | Yes | `student` |

---

### 3.3 Devices & Hardware (`/devices`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/devices/register` | Register desktop agent hardware fingerprint | Yes | `teacher`, `student` |
| `GET` | `/devices` | List registered devices | Yes | `teacher` |
| `GET` | `/devices/{id}` | Get device details | Yes | `teacher`, `student` (owner) |
| `POST` | `/devices/{id}/heartbeat` | REST fallback for device heartbeat | Yes | `teacher`, `student` (agent) |
| `GET` | `/devices/{id}/events` | Retrieve recent events for device | Yes | `teacher`, `student` (owner) |
| `POST` | `/devices/events` | Ingest batch of activity event envelopes | Yes | `teacher`, `student` (agent) |

---

### 3.4 Exam Mode (`/exams`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/exams` | Create an examination with integrity rules | Yes | `teacher` |
| `GET` | `/exams` | List exams (filtered by role & classroom) | Yes | `teacher`, `student` |
| `GET` | `/exams/{id}` | Get detailed exam specification and rules | Yes | `teacher`, `student` |
| `POST` | `/exams/{id}/join` | Student joins exam session with device check | Yes | `student` |
| `POST` | `/exams/{id}/start` | Transition exam state to `ACTIVE` | Yes | `teacher` |
| `POST` | `/exams/{id}/pause` | Temporarily pause exam for all participants | Yes | `teacher` |
| `POST` | `/exams/{id}/resume`| Resume paused exam | Yes | `teacher` |
| `POST` | `/exams/{id}/end`   | Terminate exam and seal audit history | Yes | `teacher` |
| `POST` | `/exams/{id}/grant-time` | Grant +X minutes to exam countdown | Yes | `teacher` |
| `POST` | `/exams/{id}/questions` | Add MCQ question with 4 options & marks | Yes | `teacher` |
| `GET` | `/exams/{id}/questions` | Fetch questions (answers masked for student) | Yes | `teacher`, `student` |
| `PUT` | `/exams/{id}/questions/{qid}` | Edit question prior to exam activation | Yes | `teacher` |
| `DELETE` | `/exams/{id}/questions/{qid}` | Remove question from draft/scheduled exam | Yes | `teacher` |
| `POST` | `/exams/{id}/answers` | Save selected option index for a question | Yes | `student` |
| `GET` | `/exams/{id}/answers` | Get student's previously saved answers | Yes | `student` |
| `POST` | `/exams/{id}/submit` | Final submission with server-side grading | Yes | `student` |
| `GET` | `/exams/{id}/submissions` | List candidate submissions and scores | Yes | `teacher`, `student` (own) |
| `POST` | `/exams/{id}/tab-switch` | Report browser Page Visibility tab-switch | Yes | `student` |

---

### 3.5 Focus Mode (`/focus`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/focus/sessions` | Start a new Pomodoro focus session | Yes | `student` |
| `GET`  | `/focus/sessions` | List active/recent sessions | Yes | `teacher`, `student` |
| `GET`  | `/focus/sessions/{id}` | Get details of a focus session | Yes | `teacher`, `student` (owner) |
| `POST` | `/focus/sessions/{id}/pause` | Pause active timer | Yes | `student` (owner) |
| `POST` | `/focus/sessions/{id}/resume` | Resume focus countdown | Yes | `student` (owner) |
| `POST` | `/focus/sessions/{id}/complete` | Finish session and compute focus score | Yes | `student` (owner) |
| `GET`  | `/focus/history` | Retrieve student's past focus sessions | Yes | `student` |
| `GET`  | `/focus/analytics` | Compute 7-day focus totals & completion rate | Yes | `teacher`, `student` |

---

### 3.6 Alerts & Notifications (`/alerts`, `/notifications`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `GET`  | `/alerts` | Query active or historical integrity alerts | Yes | `teacher` |
| `POST` | `/alerts/{id}/acknowledge` | Acknowledge alert with review decision | Yes | `teacher` |
| `GET`  | `/notifications` | Get user notifications and reminders | Yes | `teacher`, `student` |
| `POST` | `/notifications/{id}/read` | Mark specific notification as read | Yes | `teacher`, `student` |
| `POST` | `/notifications/read-all` | Mark all user notifications as read | Yes | `teacher`, `student` |

---

### 3.7 Health & Audit (`/health`, `/audit`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `GET`  | `/health` | Server and system health status | No | Public |
| `GET`  | `/api/v1/health` | API v1 and Database connectivity status | No | Public |
| `GET`  | `/audit/records` | Query immutable audit log | Yes | `teacher` |

---

### 3.8 Institutional Reports & Evidence (`/reports`)

| Method | Endpoint | Summary | Auth Required | Roles |
| :--- | :--- | :--- | :--- | :--- |
| `GET`  | `/reports/exams/{id}/summary` | Comprehensive exam participation & score summary | Yes | `teacher` |
| `GET`  | `/reports/exams/{id}/export-csv` | Download complete exam results as CSV spreadsheet | Yes | `teacher` |
| `POST` | `/reports/exams/{id}/evidence/snapshot` | Record timestamped transparent evidence checkpoint | Yes | `teacher`, `student` |
