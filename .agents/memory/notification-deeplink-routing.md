---
name: Notification deeplink routing (staff vs student)
description: How in-app/push notification routing is resolved across web bell, mobile student, and mobile staff — and why a single inferred route breaks for one audience.
---

The `notifications` table has a `deeplink: { screen, params }` jsonb column populated at
notification-creation time (server-side call sites: classes/finance/tasks routes,
attendance-notification, class-bell-reminder, tinode-push, notification.routes). This is the
authoritative source for routing — prefer it over inferring from `category`/`referenceType`.
Inference from category/referenceType alone cannot distinguish staff vs student audiences and
was the root cause of a "notification bell routes to the wrong page" bug (staff always got
routed to student `/my-space/*` paths, which they have no access to).

**Why:** category/referenceType conflate multiple audiences into one enum value (e.g.
"finance" fires for both a student's tuition invoice AND a staff salary payment). Only the
`deeplink` object captures which concrete entity (classId/invoiceId/taskId/sessionId/topicId)
and intent to route to, and callers can set audience-appropriate params at creation time.

**How to apply:** any new UI that renders notifications (web bell, mobile apps) must read
`notification.deeplink` first and only fall back to legacy category/referenceType inference for
old rows created before the column existed. Each surface still needs its own screen→route
mapping (web bell in `client/src/components/notifications/NotificationBell.tsx` uses
generic screen names like "Calendar"/"Invoices"/"ScoreSheet"/"StaffTasks"/"Chat" branched by
`useMyPermissions().isStudent`; the mobile staff endpoint in `server/routes/mobile.routes.ts`
(`/api/mobile/staff/notifications`) uses different Staff-prefixed screen names of its own and
was intentionally left on its existing inference — its screen names don't match the generic
ones stored by `deeplink`, so don't assume the same stored screen string works everywhere).
`/chat` web route needed a new `?topicId=` query param handler added to open a specific Tinode
topic on load — previously chat notifications had nowhere to land.
