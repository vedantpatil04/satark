// Beep sound generator using Web Audio API

let audioContext: AudioContext | null = null;
let alarmIntervalId: number | null = null;
let isAlarmRunning: boolean = false;
let activeOscillator: OscillatorNode | null = null;
let activeGainNode: GainNode | null = null;

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

      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      activeOscillator = oscillator;
      activeGainNode = gainNode;

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

      oscillator.onended = () => {
        if (activeOscillator === oscillator) {
          activeOscillator = null;
          activeGainNode = null;
        }
        resolve();
      };
    } catch (error) {
      console.error("Beep error:", error);
      activeOscillator = null;
      activeGainNode = null;
      reject(error);
    }
  });
};

// Continuous alarm that repeats until stopped (for face / focus detection)
export const startContinuousAlarm = (
  frequency: number = 1200,
  beepDuration: number = 400,
  pauseDuration: number = 300
): void => {
  // Prevent duplicate alarm chains
  if (isAlarmRunning) {
    return;
  }

  // Stop any existing alarm first
  stopContinuousAlarm();

  isAlarmRunning = true;

  const playAlarmCycle = async () => {
    // Check if alarm should still be running
    if (!isAlarmRunning) {
      return;
    }

    try {
      await playBeep(beepDuration, frequency, 70);

      // Schedule next beep after pause (only if still running)
      if (isAlarmRunning) {
        alarmIntervalId = window.setTimeout(playAlarmCycle, pauseDuration);
      }
    } catch (error) {
      console.error("Alarm error:", error);
    }
  };

  // Start the alarm cycle
  playAlarmCycle();
};

// Stop the continuous alarm immediately with instant audio cutoff
export const stopContinuousAlarm = (): void => {
  isAlarmRunning = false;

  if (alarmIntervalId !== null) {
    clearTimeout(alarmIntervalId);
    alarmIntervalId = null;
  }

  // Instant audio cutoff: zero gain and stop active oscillator
  try {
    if (activeGainNode && audioContext) {
      activeGainNode.gain.cancelScheduledValues(audioContext.currentTime);
      activeGainNode.gain.setValueAtTime(0, audioContext.currentTime);
    }
    if (activeOscillator) {
      activeOscillator.stop();
      activeOscillator.disconnect();
    }
  } catch (e) {
    // Oscillator may have already stopped naturally
  }
  activeOscillator = null;
  activeGainNode = null;
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
