// User & Auth Types
export type UserRole = "teacher" | "student" | "agent";

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role: "teacher" | "student";
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserResponse;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  role?: "teacher" | "student";
  teacher_provisioning_key?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface WsTicketResponse {
  ticket: string;
  expires_in: number;
}

// Classroom Types
export interface Classroom {
  id: string;
  teacher_id: string;
  title: string;
  subject_code?: string;
  description?: string;
  join_code: string;
  is_archived: boolean;
  created_at: string;
  enrolled_count?: number;
}

export interface EnrolledStudent {
  student_id: string;
  full_name: string;
  email: string;
  enrolled_at: string;
}

// Exam Types
export interface PolicyConfig {
  require_face_tracking?: boolean;
  prohibit_tab_switch?: boolean;
  require_device_agent?: boolean;
  allow_multiple_attempts?: boolean;
  max_warnings?: number;
}

export interface Exam {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  exam_code: string;
  duration_minutes: number;
  scheduled_start: string;
  actual_start?: string;
  actual_end?: string;
  status: "draft" | "active" | "concluded" | "cancelled";
  policy_config: PolicyConfig;
  created_at: string;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_text: string;
  options: string[];
  marks: number;
  order_num: number;
  correct_option_index?: number;
  created_at: string;
}

export interface ExamSubmission {
  id: string;
  exam_id: string;
  student_id: string;
  student_name?: string;
  score?: number;
  total_marks?: number;
  percentage?: number;
  status: "in_progress" | "submitted" | "auto_graded" | "reviewed";
  submitted_at: string;
}

export interface StudentAnswer {
  id: string;
  exam_id: string;
  question_id: string;
  selected_option_index?: number;
  answered_at: string;
}

// Device Types
export interface Device {
  id: string;
  hardware_uuid: string;
  hostname?: string;
  os_type: string;
  os_version?: string;
  agent_version: string;
  owner_user_id?: string;
  last_heartbeat_at?: string;
  status: "registered" | "active" | "connected" | "offline" | "inactive" | "disconnected" | "revoked";
  created_at: string;
}

export interface DevicePairResponse {
  device_id: string;
  device_token: string;
  student_id: string;
  student_name: string;
  hardware_uuid: string;
  status: string;
}

// Focus Types
export interface FocusSession {
  id: string;
  student_id: string;
  classroom_id?: string;
  goal_title: string;
  planned_duration_minutes: number;
  actual_focus_seconds: number;
  actual_break_seconds: number;
  status: "active" | "paused" | "completed" | "abandoned";
  started_at: string;
  ended_at?: string;
  notes?: string;
}

export interface FocusDailyTrend {
  date: string;
  focus_minutes: number;
  break_minutes: number;
}

export interface FocusAnalytics {
  daily_focus_seconds: number;
  weekly_focus_seconds: number;
  total_completed_sessions: number;
  total_abandoned_sessions: number;
  total_break_seconds: number;
  completion_rate_percentage: number;
  daily_trends: FocusDailyTrend[];
}

// Alerts & Notifications
export interface Alert {
  id: string;
  session_id: string;
  student_id: string;
  device_id?: string;
  primary_event_id?: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence_summary?: Record<string, any>;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  proctor_notes?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

// WebRTC & Streaming
export interface WebRTCMessage {
  type: "webrtc_offer" | "webrtc_answer" | "webrtc_ice" | "request_stream" | "stop_stream";
  sender_id: string;
  recipient_id: string;
  payload: any;
}

// Question Bank & Dataset Types
export interface QuestionBankItem {
  id: string;
  bank_id: string;
  external_id?: string;
  question_type: string;
  question_text: string;
  options: string[];
  correct_option_index: number;
  marks: number;
  negative_marks: number;
  difficulty: "easy" | "medium" | "hard";
  topic?: string;
  explanation?: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionBank {
  id: string;
  teacher_id: string;
  title: string;
  subject: string;
  topic?: string;
  description?: string;
  item_count?: number;
  total_marks?: number;
  created_at: string;
  updated_at: string;
  items?: QuestionBankItem[];
}

export interface QuestionDatasetItem {
  externalId: string;
  type: "mcq";
  question: string;
  options: string[];
  correctOptionIndex: number;
  marks: number;
  negativeMarks: number;
  difficulty: "easy" | "medium" | "hard";
  topic?: string;
  explanation?: string;
}

export interface QuestionBankDataset {
  schemaVersion: string;
  title: string;
  subject: string;
  topic?: string;
  description?: string;
  questions: QuestionDatasetItem[];
}

export interface QuestionValidationSummary {
  valid: boolean;
  schema_version: string;
  total_questions: number;
  valid_count: number;
  invalid_count: number;
  valid_questions: any[];
  errors: { index?: number; externalId?: string; field?: string; message: string }[];
}

export interface ExamQuestionSnapshot {
  id: string;
  exam_id: string;
  total_questions: number;
  total_marks: number;
  snapshot_data: any[];
  created_at: string;
}

// WebRTC Live Monitoring Types
export interface LiveKitTokenResponse {
  token: string;
  url: string;
  room_name: string;
  identity: string;
  participant_name: string;
  role: string;
  can_publish: boolean;
  can_subscribe: boolean;
  expires_in: number;
  is_configured: boolean;
}

export interface StudentMonitoringCard {
  student_id: string;
  student_name: string;
  email: string;
  roll_number: string;
  device_id?: string | null;
  device_hostname?: string | null;
  os_type: string;
  os_version?: string | null;
  connection_status: "connected" | "offline";
  is_sharing_screen: boolean;
  share_status: "not_started" | "pending" | "approved" | "sharing" | "stopped" | "rejected";
  alert_count: number;
  unacknowledged_alerts: number;
  last_activity_at?: string | null;
  recent_alerts: {
    id: string;
    alert_type: string;
    severity: string;
    description: string;
    is_acknowledged: boolean;
    created_at: string;
  }[];
}

export interface MonitoringOverview {
  exam_id: string;
  title: string;
  classroom_id: string;
  exam_code: string;
  status: string;
  duration_minutes: number;
  actual_start?: string | null;
  room_name: string;
  is_livekit_configured: boolean;
  is_webrtc_configured?: boolean;
  total_enrolled: number;
  connected_count: number;
  active_streamers: number;
  total_alerts: number;
  students: StudentMonitoringCard[];
}


