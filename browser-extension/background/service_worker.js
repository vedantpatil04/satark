/**
 * SATARK Browser Extension - Background Service Worker (Manifest V3)
 * Non-invasive, transparent exam supervision.
 */

const DEFAULT_RESTRICTED_DOMAINS = [
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "bard.google.com",
  "gemini.google.com",
  "stackoverflow.com",
  "chegg.com",
  "quora.com",
  "brainly.in",
  "brainly.com",
  "discord.com",
  "web.whatsapp.com",
  "web.telegram.org",
];

// In-memory active exam session state
let activeExam = null; // { examId, studentId, token, backendUrl }
let lastAlertTime = 0;

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REGISTER_EXAM_SESSION") {
    activeExam = {
      examId: message.examId,
      studentId: message.studentId,
      token: message.token,
      backendUrl: message.backendUrl || "http://127.0.0.1:8000",
      examTitle: message.examTitle || "Active Examination",
    };
    chrome.storage.local.set({ activeExam });
    console.log("[SATARK Extension] Exam session registered:", activeExam.examId);
    sendResponse({ status: "registered", activeExam });
  } else if (message.type === "UNREGISTER_EXAM_SESSION") {
    activeExam = null;
    chrome.storage.local.remove("activeExam");
    console.log("[SATARK Extension] Exam session ended.");
    sendResponse({ status: "cleared" });
  } else if (message.type === "GET_STATUS") {
    sendResponse({ activeExam, isMonitoring: !!activeExam });
  } else if (message.type === "REPORT_EVENT") {
    handleIncomingEvent(message.eventData);
    sendResponse({ status: "processing" });
  }
  return true;
});

// Restore active session on service worker wake
chrome.storage.local.get(["activeExam"], (result) => {
  if (result.activeExam) {
    activeExam = result.activeExam;
  }
});

// Monitor tab navigation during active exams
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeExam || !changeInfo.url) return;

  const url = changeInfo.url;
  for (const domain of DEFAULT_RESTRICTED_DOMAINS) {
    if (url.includes(domain)) {
      const now = Date.now();
      if (now - lastAlertTime > 4000) {
        lastAlertTime = now;
        sendBreachAlert({
          eventType: "restricted_website",
          domain: domain,
          url: url,
        });
      }
      break;
    }
  }
});

async function handleIncomingEvent(eventData) {
  if (!activeExam) return;
  sendBreachAlert(eventData);
}

async function sendBreachAlert(data) {
  if (!activeExam) return;
  const url = `${activeExam.backendUrl}/api/v1/exams/${activeExam.examId}/tab-switch`;
  const payload = {
    event_id: "ext_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now(),
    occurred_at: new Date().toISOString(),
    details: {
      source: "chromium_extension",
      event_type: data.eventType || "tab_switch",
      restricted_domain: data.domain || null,
      notes: "Detected via SATARK Chromium Extension Companion",
    },
  };

  try {
    const headers = { "Content-Type": "application/json" };
    if (activeExam.token) {
      headers["Authorization"] = `Bearer ${activeExam.token}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    console.log("[SATARK Extension] Telemetry dispatched:", res.status);
  } catch (err) {
    console.warn("[SATARK Extension] Telemetry dispatch offline/delayed:", err);
  }
}

