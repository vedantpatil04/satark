// Beep sound generator using Web Audio API

let audioContext: AudioContext | null = null;
let alarmIntervalId: number | null = null;
let isAlarmRunning: boolean = false;

// Gaming alarm state (separate from focus alarm)
let gamingAlarmIntervalId: number | null = null;
let isGamingAlarmRunning: boolean = false;

export const playBeep = async (
  duration: number = 200,
  frequency: number = 800,
  volume: number = 50
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      // Create or reuse audio context
      if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set frequency (higher = more urgent)
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      // Set volume (0-100)
      gainNode.gain.value = volume * 0.01;

      // Play beep
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration * 0.001);

      oscillator.onended = () => resolve();
    } catch (error) {
      console.error("Beep error:", error);
      reject(error);
    }
  });
};

// Continuous alarm that repeats until stopped (for face detection)
export const startContinuousAlarm = (
  frequency: number = 1200,
  beepDuration: number = 400,
  pauseDuration: number = 300
): void => {
  // Prevent multiple alarms
  if (isAlarmRunning) {
    console.log("⚠️ Alarm already running, skipping...");
    return;
  }

  // Stop any existing alarm first
  stopContinuousAlarm();

  isAlarmRunning = true;
  console.log("🚨 ALARM STARTED");

  const playAlarmCycle = async () => {
    // Check if alarm should still be running
    if (!isAlarmRunning) {
      console.log("🛑 Alarm stopped in cycle");
      return;
    }

    try {
      await playBeep(beepDuration, frequency, 70);

      // Schedule next beep after pause (only if still running)
      if (isAlarmRunning) {
        alarmIntervalId = window.setTimeout(playAlarmCycle, beepDuration + pauseDuration);
      }
    } catch (error) {
      console.error("Alarm error:", error);
    }
  };

  // Start the alarm cycle
  playAlarmCycle();
};

// Stop the continuous alarm
export const stopContinuousAlarm = (): void => {
  console.log("✅ STOPPING ALARM");
  isAlarmRunning = false;

  if (alarmIntervalId !== null) {
    clearTimeout(alarmIntervalId);
    alarmIntervalId = null;
  }
};

// Check if alarm is currently playing
export const isAlarmPlaying = (): boolean => {
  return isAlarmRunning;
};

// ========== NEW: GAMING DETECTION ALARM ==========

/**
 * Play a single loud alarm beep for gaming detection
 * More aggressive than regular beep
 */
export const playGamingAlarmBeep = async (): Promise<void> => {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Aggressive alarm sound
    oscillator.frequency.value = 1400; // Higher pitch = more annoying
    oscillator.type = "square"; // Harsher sound

    gainNode.gain.value = 0.5; // Louder

    // Play for 0.8 seconds
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.8);

    console.log("🚨 GAMING ALARM BEEP!");
  } catch (error) {
    console.error("Gaming alarm beep error:", error);
  }
};

/**
 * Start continuous gaming alarm (repeats every 10 seconds)
 */
export const startGamingAlarm = (): void => {
  // Prevent duplicate alarms
  if (isGamingAlarmRunning) {
    console.log("⚠️ Gaming alarm already running");
    return;
  }

  stopGamingAlarm(); // Stop any existing

  isGamingAlarmRunning = true;
  console.log("🎮 GAMING ALARM STARTED - Continuous beeps every 10s");

  const playGamingCycle = async () => {
    if (!isGamingAlarmRunning) {
      console.log("🛑 Gaming alarm stopped");
      return;
    }

    try {
      // Play 3 rapid beeps
      await playBeep(200, 1400, 70);
      await new Promise(resolve => setTimeout(resolve, 150));
      await playBeep(200, 1400, 70);
      await new Promise(resolve => setTimeout(resolve, 150));
      await playBeep(200, 1400, 70);

      // Schedule next cycle in 10 seconds
      if (isGamingAlarmRunning) {
        gamingAlarmIntervalId = window.setTimeout(playGamingCycle, 10000);
      }
    } catch (error) {
      console.error("Gaming alarm cycle error:", error);
    }
  };

  // Start immediately
  playGamingCycle();
};

/**
 * Stop the gaming alarm
 */
export const stopGamingAlarm = (): void => {
  console.log("✅ STOPPING GAMING ALARM");
  isGamingAlarmRunning = false;

  if (gamingAlarmIntervalId !== null) {
    clearTimeout(gamingAlarmIntervalId);
    gamingAlarmIntervalId = null;
  }
};

/**
 * Check if gaming alarm is active
 */
export const isGamingAlarmActive = (): boolean => {
  return isGamingAlarmRunning;
};

// ========== EXISTING BEEP TYPES ==========

// Different beep types
export const playSuccessBeep = () => playBeep(300, 600, 40);
export const playAlertBeep = () => playBeep(400, 1000, 60);
export const playWarningBeep = () => playBeep(200, 1200, 70);

/**
 * Play a "danger" beep (for immediate threats)
 */
export const playDangerBeep = () => playBeep(500, 1600, 80);
