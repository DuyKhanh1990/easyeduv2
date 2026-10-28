---
name: Chat permission scopes
description: User-approved staff permission model for internal chat visibility and actions.
---

Staff Chat permissions are independent and scoped: **View** only exposes conversations the staff member belongs to; **View all** exposes conversations across the staff member's center. **Create** enables starting messages, creating groups, and adding members, but only when View or View all is also granted. **Edit** applies to messages the staff member sent. **Delete** applies to removing group members. Students and parents cannot proactively create groups; preserve their existing teacher-directed DM flow.

For group creation, View-only staff may choose classes where they are assigned as teacher or manager; View all may choose classes in locations they can access. Manual recipients must remain within the same view scope: staff in accessible locations and active learners in assigned classes (or accessible center classes with View all).

**Why:** the user chose chat permissions as the authority because teachers may not receive access to Education > Classes. Showing non-member conversations under ordinary View would expose chat channels unexpectedly.

**How to apply:** enforce the same scope in both UI and server routes; never rely on hiding buttons alone. Treat DMs as two-member chat groups, not a separate visibility category.
