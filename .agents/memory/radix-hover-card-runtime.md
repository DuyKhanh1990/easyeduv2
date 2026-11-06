---
name: Radix hover-card runtime issue
description: Runtime behavior observed when using Radix HoverCard in the application preview.
---

In the development preview, rendering the first `@radix-ui/react-hover-card` caused a runtime hook failure (`useMemo` on null). Replacing it with the application's existing Tooltip component removed the feature-specific failure.

**Why:** This avoids introducing a runtime crash in the class detail page while the underlying module/deduplication issue remains unexplained.

**How to apply:** For simple hover/focus details, use the existing Tooltip component. If a true hover card is needed, first investigate the React/Radix module graph and verify it in the running preview.
