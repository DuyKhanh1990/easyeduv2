---
name: Harbor npm lockfile URLs
description: External Docker builds must normalize Replit package proxy URLs before npm ci
---

## Rule
The Dockerfile must rewrite both `package-firewall.replit.local` and `package-firewall.replit.internal` resolved URLs in `package-lock.json` before running `npm ci` in every image stage.

**Why:** Replit can emit either internal hostname in the lockfile. Harbor runners cannot resolve those hosts, even when `npm ci --registry=https://registry.npmjs.org` is supplied, because npm follows the lockfile's `resolved` URLs.

**How to apply:** Keep the normalization in both builder and production stages, use a delimiter that does not conflict with the regex alternation, and verify an external `docker build` before pushing the pipeline change.