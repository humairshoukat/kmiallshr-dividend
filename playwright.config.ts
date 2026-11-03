import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    channel: "chromium",
  },
});
