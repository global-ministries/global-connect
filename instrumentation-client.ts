// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { createSentryPrivacyOptions, createSentryReplayPrivacyOptions } from "@/lib/support/sentry-privacy";

Sentry.init({
  dsn: "https://abe0497e47210b36f1dd9f50d3aa301b@o4511016277573632.ingest.us.sentry.io/4511016278753280",

  // Replay stays available for explicit future use, but defaults to masked text/media and zero sampling.
  integrations: [Sentry.replayIntegration(createSentryReplayPrivacyOptions())],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Do not capture replay sessions by default; support diagnostics store references only.
  replaysSessionSampleRate: 0,

  // Do not start replay capture automatically when an error occurs.
  replaysOnErrorSampleRate: 0,

  ...createSentryPrivacyOptions(),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
