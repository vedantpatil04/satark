import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

const certPath = path.resolve(__dirname, "../../certs/cert.pem");
const keyPath = path.resolve(__dirname, "../../certs/key.pem");
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [react()],
  resolve: {
    alias: {
      "@/api": path.resolve(__dirname, "../../packages/shared-api/src"),
      "@/components/ui": path.resolve(__dirname, "../../packages/shared-ui/src/components"),
      "@/context/AuthContext": path.resolve(__dirname, "../../packages/shared-auth/src/AuthContext"),
      "@/components/auth/ProtectedRoute": path.resolve(__dirname, "../../packages/shared-auth/src/ProtectedRoute"),
      "@/lib/utils": path.resolve(__dirname, "../../packages/shared-ui/src/utils"),
      "@/types": path.resolve(__dirname, "../../packages/shared-types/src/index"),
      "@satark/shared-types": path.resolve(__dirname, "../../packages/shared-types/src"),
      "@satark/shared-api": path.resolve(__dirname, "../../packages/shared-api/src"),
      "@satark/shared-auth": path.resolve(__dirname, "../../packages/shared-auth/src"),
      "@satark/shared-ui": path.resolve(__dirname, "../../packages/shared-ui/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    https: hasCerts
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : undefined,
  },
});
