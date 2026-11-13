import { defineConfig } from '@trigger.dev/sdk'

export default defineConfig({
  // Project ref from the Trigger.dev dashboard (Project settings). Not a secret.
  project: 'proj_glqfolostzulxyxrbtcl',
  dirs: ['./src/trigger'],
  // Upper limit for any run, in seconds; tasks can set a lower maxDuration.
  maxDuration: 600,
  retries: {
    // Retry in development too, so failures behave the same as in production.
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10_000,
      randomize: true,
    },
  },
})
