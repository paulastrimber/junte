import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'tests/**/*.test.js'],
    environment: 'node',
    globalSetup: ['tests/helpers/global-setup.js'],
    testTimeout: 20_000,
    // MongoMemoryReplSet puede tardar en arrancar (descarga del binario la primera vez).
    hookTimeout: 120_000
  }
})
