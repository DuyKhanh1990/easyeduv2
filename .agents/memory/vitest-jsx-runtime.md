---
name: Vitest JSX runtime
description: JSX rendered in Node-based Vitest tests may need an explicit React binding even when the app build succeeds.
---

The Node-based Vitest transform can use the classic JSX runtime for TSX tests and components rendered with `react-dom/server`. A missing React binding then throws `ReferenceError: React is not defined`, while the Vite application build can still succeed.

**Why:** The test and application builds use different JSX transforms, so a successful app build alone does not verify JSX used by server-rendered tests.

**How to apply:** For TSX components directly rendered in Node-based Vitest tests, import React explicitly or use `createElement`, then run the targeted test as well as the application build.