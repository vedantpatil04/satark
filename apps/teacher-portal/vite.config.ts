import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/api": path.resolve(__dirname, "../../packages/shared-api/src"),
      "@/components/ui": path.resolve(__dirname, "../../packages/shared-ui/src/components"),
      "@/context/AuthContext": path.resolve(__dirname, "../../packages/shared-auth/src/AuthContext"),
      "@/components/auth/ProtectedRoute": path.resolve(__dirname, "../../packages/shared-auth/src/ProtectedRoute"),
      "@/lib/supabase": path.resolve(__dirname, "../../packages/shared-auth/src/supabase"),
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
    port: 5174,
  },
});
