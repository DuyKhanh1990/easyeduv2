---
name: Staff role assignment permissions
description: Rules for per-department, per-role grants in staff creation and editing.
---

Staff create/edit access remains governed by the existing staff permissions. Separate checkboxes grant which department roles a user may assign. In the staff dialog, all applicable roles remain visible; unchecked roles are dimmed and cannot be added or removed. Existing assignments the editor cannot manage must be preserved. New department roles start without assignment permission until explicitly granted.

**Why:** The user wants role-specific limits without changing the existing staff CRUD model or hiding roles from the picker.

**How to apply:** Use this rule when changing the staff role picker or its permissions. The grant applies to the permission roles assigned to the logged-in account; users sharing the same permission role therefore share these grants.
