#!/bin/sh
# Vercel "Ignored Build Step" — skips Git-triggered production builds so
# GitHub Actions (gated on CI passing) is the only path to production.
# Preview builds for other branches/PRs are unaffected.
# Exit 0 = skip build, exit 1 = proceed.
if [ "$VERCEL_ENV" = "production" ]; then
  echo "Skipping Git-triggered production build — deploys go through GitHub Actions"
  exit 0
else
  exit 1
fi
