---
name: Chat permission scopes
description: User-approved staff permission model for internal chat visibility and actions.
---

Staff Chat permissions are independent and scoped: **View** only exposes conversations the staff member belongs to; **View all** exposes conversations across the staff member's center. **Create** enables starting messages, creating groups, and adding members, but only when View or View all is also granted. **Edit** applies to messages the staff member sent. **Delete** applies to removing group members. Students and parents cannot proactively create groups; preserve their existing teacher-directed DM flow.

For group creation, View-only staff may choose classes where they are assigned as teacher or manager; View all may choose classes in locations they can access. Manual recipients must remain within the same view scope: staff in accessible locations and active learners in assigned classes (or accessible center classes with View all).

**Why:** the user chose chat permissions as the authority because teachers may not receive access to Education > Classes. Showing non-member conversations under ordinary View would expose chat channels unexpectedly.

**How to apply:** enforce the same scope in both UI and server routes; never rely on hiding buttons alone. Treat DMs as two-member chat groups, not a separate visibility category.

When changing Chat permissions, preserve existing conversation titles and group names unless the user explicitly asks to change them. View all may expand which conversations are visible, but must not turn ordinary group names into member-name lists.

**Why:** the user asked to change permissions only and corrected an unintended title change that surfaced when View all exposed more direct-message channels.

**How to apply:** keep permission-scope changes separate from display-name behavior; if a newly visible channel needs a label, retain the existing per-viewer DM naming convention and the group's saved name.

Adding a member requires Chat's **Thêm** permission across web and mobile; being the group creator does not bypass it.

**Why:** the user chose one consistent permission rule for adding members instead of a creator-specific exception.

**How to apply:** enforce the same Add permission in both the UI and every member-add API.

When shortening long Chat channel names, preserve the timestamp and message preview; let the title use only the remaining width and show an ellipsis.

**Why:** fixed-character truncation made the timestamp run into the sidebar edge.

**How to apply:** constrain the title flex item, keep timestamps non-shrinking, widen the desktop sidebar when needed, and inspect the whole row rather than the title alone.
