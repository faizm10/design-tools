import { defineConfig } from "@neon/config/v1";

// Neon services for every branch of this project. Apply with `neon deploy`.
export default defineConfig({
  auth: true,
  // Live collaboration (shared plans, live cursors). Realtime is in beta.
  // List every origin the app runs on; add your production origin before deploying.
  preview: { realtime: { allowedOrigins: ["http://localhost:3000", "http://localhost:3210"] } },
});
