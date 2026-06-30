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
      'src/**/*.test.jsx',
      'src/**/*.test.ts',
      'lib/**/*.test.js',
      'lib/**/__tests__/**/*.test.js',
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
        'lib/server/financeTxFields.js',
        'lib/server/financeTxAggregate.js',
        'lib/server/bankReconciliationMatcher.js',
        'lib/server/bankReconciliationValidation.js',
        'lib/server/financeClosingData.js',
        'src/lib/inboxConversationState.js',
        'src/lib/conversationsRealtime.js',
        'src/lib/financeCategories.js',
        'src/lib/financeAccountCategories.js',
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'scripts/**',
      ],
      thresholds: {
        lines: 61,
        functions: 71,
        branches: 47,
      },
    },
  }
});
