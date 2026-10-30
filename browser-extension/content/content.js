/**
 * SATARK Browser Extension - Content Script
 * Injected exclusively into SATARK Examination workspaces.
 */

(function () {
  console.log("[SATARK Companion] Content script active on examination workspace.");

  // 1. Detect exam metadata from page context or URL
  const match = window.location.pathname.match(/\/student\/exams\/([a-zA-Z0-9_-]+)/);
  const examId = match ? match[1] : null;

  if (examId) {
    const token = localStorage.getItem("access_token") || localStorage.getItem("token");
    const userJson = localStorage.getItem("user");
    let studentId = null;
    try {
      if (userJson) studentId = JSON.parse(userJson).id;
    } catch (e) {}

    // Register active exam session with background service worker
    chrome.runtime.sendMessage({
      type: "REGISTER_EXAM_SESSION",
      examId: examId,
      studentId: studentId,
      token: token,
      backendUrl: window.location.origin.includes("5173")
        ? window.location.origin.replace(":5173", ":8000")
        : window.location.origin,
    });

    // 2. Render subtle student verification badge
    renderStatusBadge();
  }

  // 3. Monitor Fullscreen exit events
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && examId) {
      chrome.runtime.sendMessage({
        type: "REPORT_EVENT",
        eventData: {
          eventType: "fullscreen_exit",
          details: { message: "Candidate exited fullscreen exam environment" },
        },
      });
    }
  });

  function renderStatusBadge() {
    if (document.getElementById("satark-ext-badge")) return;
    const badge = document.createElement("div");
    badge.id = "satark-ext-badge";
    badge.style.position = "fixed";
    badge.style.bottom = "12px";
    badge.style.right = "12px";
    badge.style.zIndex = "9999";
    badge.style.backgroundColor = "rgba(16, 185, 129, 0.95)";
    badge.style.color = "#ffffff";
    badge.style.padding = "6px 12px";
    badge.style.borderRadius = "20px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "bold";
    badge.style.fontFamily = "sans-serif";
    badge.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.gap = "6px";
    badge.style.pointerEvents = "none";
    badge.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <span>SATARK Guard Active</span>
    `;
    document.body.appendChild(badge);
  }
})();

