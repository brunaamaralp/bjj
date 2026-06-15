import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/**/*.test.js',
      'src/**/*.test.js',
      'src/**/*.test.ts',
      'lib/**/*.test.js',
    ],
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'lib/constants.js',
        'lib/server/agentRespond.js',
        'lib/server/zapsterWebhook.js',
        'lib/server/conversationsStore.js',
        'src/lib/inboxConversationState.js',
        'src/lib/conversationsRealtime.js',
      ],
      exclude: ['node_modules/**', 'tests/**', 'scripts/**'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
      },
    },
  }
});
