---
name: Mockup sandbox screenshots
description: Where to capture isolated component previews in this Replit workspace.
---

When verifying a component served by the mockup sandbox, capture its path-proxied sandbox URL rather than using the app-preview screenshot path.

**Why:** The app-preview screenshot path is served by the main application workflow, so a path such as `/__mockup/preview/...` can show the app login screen instead of the isolated Vite preview.

**How to apply:** After the mockup-sandbox workflow is running and the preview route is ready, use the full path-proxied sandbox URL for a screenshot. Keep the internal development URL out of user-facing messages.