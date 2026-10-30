document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusTitle = document.getElementById("statusTitle");
  const statusDesc = document.getElementById("statusDesc");
  const sessionCard = document.getElementById("sessionCard");
  const examIdText = document.getElementById("examIdText");
  const checkConnBtn = document.getElementById("checkConnBtn");

  // Query background service worker for status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      statusDot.className = "status-indicator";
      statusTitle.textContent = "Standby";
      statusDesc.textContent = "Companion ready. Navigate to your exam room.";
      return;
    }

    if (response.isMonitoring && response.activeExam) {
      statusDot.className = "status-indicator active";
      statusTitle.textContent = "Monitoring Active";
      statusDesc.textContent = "Protecting assessment integrity in real time.";
      sessionCard.style.display = "block";
      examIdText.textContent = response.activeExam.examId;
    } else {
      statusDot.className = "status-indicator standby";
      statusTitle.textContent = "Standby Mode";
      statusDesc.textContent = "No active examination in progress.";
      sessionCard.style.display = "none";
    }
  });

  // Health check button
  checkConnBtn.addEventListener("click", async () => {
    checkConnBtn.textContent = "Pinging Backend...";
    checkConnBtn.disabled = true;

    try {
      const res = await fetch("http://127.0.0.1:8000/health", { timeout: 3000 });
      if (res.ok) {
        checkConnBtn.textContent = "Uplink Verified (HTTP 200)";
        checkConnBtn.style.backgroundColor = "#10b981";
      } else {
        checkConnBtn.textContent = `Server Error (${res.status})`;
        checkConnBtn.style.backgroundColor = "#ef4444";
      }
    } catch (e) {
      checkConnBtn.textContent = "Uplink Offline (Check Backend)";
      checkConnBtn.style.backgroundColor = "#ef4444";
    }

    setTimeout(() => {
      checkConnBtn.textContent = "Test Backend Uplink";
      checkConnBtn.style.backgroundColor = "#0284c7";
      checkConnBtn.disabled = false;
    }, 3000);
  });
});

