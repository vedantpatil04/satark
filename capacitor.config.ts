import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "edu.smartclassroom.app",
  appName: "Smart Classroom",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
