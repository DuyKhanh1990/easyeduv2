---
name: Omicall caller routing
description: Tenant-specific Omicall calling uses location config plus the logged-in staff assignment extension.
---

Omicall calling must resolve the logged-in user's staff assignment for the selected location on the server. The client sends only the destination phone and location, never the extension; the server combines the assignment extension with that location's encrypted tenant config and outbound hotline. Omicall's Call Center API also exposes internal-phone records containing `sip_user`, `password`, and `public_number`, plus a per-extension hotline list; the pipe-delimited legacy value is a storage/UI convention, not an API payload format.

**Why:** Each customer/cơ sở can have different Omicall credentials, hotline, and internal extensions. Trusting a client-supplied extension could call through the wrong tenant or let users impersonate another caller. The internal-phone password is sensitive and must not be exposed to the browser or logged.

**How to apply:** Keep tenant credentials in `omicall_location_configs` and per-location staff extensions in `staff_assignments`; if the Call Center API requires the internal-phone credential for a future flow, fetch and use it server-side or encrypt it separately. Use the hotline-list endpoint to validate/select an outbound number rather than assuming every configured number is permitted.

**Additional rule:** Omicall Call Transaction V3 `filter.fromDate` and `filter.toDate` must be sent as Unix milliseconds; individual call timestamp fields may be Unix seconds.

**Why:** The V3 request examples use 13-digit millisecond values, while response fields such as `time_start_call` may use 10-digit seconds.

**How to apply:** Keep dashboard/server date timestamps in milliseconds in the Call History V3 request; normalize response timestamps independently when rendering rows.

**Additional rule:** Caller availability is evaluated per assigned location. An unreadable or invalid Omicall config at one location must be skipped rather than causing the whole caller lookup to fail for other valid locations; the dialer remains scoped to the currently logged-in staff account.

**Why:** Staff can be assigned to multiple locations, and one stale location credential should not hide a working caller configuration elsewhere.

**How to apply:** Filter out assignments without an extension, isolate each location config lookup, and return only ready locations. Admins editing a staff record should not expect the staff member's dialer to appear in the admin session.

**Additional rule:** The internal phone's `sip_user` (for example, `100`) is separate from the outbound hotline (for example, `842871248190`). Click-to-call first reaches the registered internal device, then places the outbound call using the hotline.

**Why:** A successful Click-to-Call API response only means Omicall accepted the request; no handset will ring when the internal SIP device is not registered, even if the outbound number is active.

**How to apply:** Store the internal extension in the staff assignment and the public caller ID in the location provider config. Register the extension in Zoiper, GrandStream, or an IP phone and verify it is online before testing. Never log internal-phone or staff passwords in the browser.

**Additional rule:** The CRM's one-click calling flow uses Omicall Web SDK v3: register the logged-in staff extension with its SIP Realm and call with `makeCall(remoteNumber, { sipNumber: { number } })`. `remoteCall()` and REST Click-to-Call remain available for legacy/manual use.

**Why:** The REST endpoint deliberately waits for extension pickup, while Web SDK creates the browser-managed call session without requiring the user to click the Omicall web dialog.

**How to apply:** Keep SIP Realm separate from API tenant credentials and outbound hotline. Scope SDK credential responses to the logged-in staff/location, never log or persist the SIP password, and do not fall back to REST after an SDK failure because that could create duplicate calls.

**Additional rule:** Omicall Web SDK registration persists after an outbound call ends. Reuse the active registration for subsequent calls instead of calling `register()` again; this has been validated with consecutive outbound calls.

**Why:** The browser-managed SIP session is longer-lived than an individual remote call, so treating each click as a new registration breaks the second call.

**How to apply:** Track the active registration by SIP realm and extension, serialize concurrent registration attempts, and only call `makeCall()` for later calls using the same registration.

**Additional rule:** Web SDK v3 exposes call lifecycle events and controls for a custom Edu status panel, but its documented UI controls minimize the SDK call dialog rather than fully hiding it.

**Why:** `toggleDial` controls the dialer launcher, while active-call UI is managed separately; relying on undocumented CSS hiding would be fragile across SDK updates.

**How to apply:** Subscribe to `connecting`, `ringing`, `accepted`, `on_calling`, and `ended`; use CallData controls such as `end` and `mute` in Edu, and use `minimizeNewCall`/`CallData.minimize()` when reducing duplicate UI.

**Additional rule:** Do not call `CallData.minimize()` from recurring events such as `on_ringing` or `on_calling`; it toggles the dialog size and causes visible flicker.

**Why:** Those events can fire every second, while `minimize()` is a toggle action rather than an idempotent “set minimized” operation.

**How to apply:** Prefer `ui.minimizeNewCall` during SDK initialization and avoid repeated minimize calls after the call starts.

**Additional rule:** A successful `register()` response may arrive before the SIP connection is actually `connected`; wait for the SDK `register` event with status `connected` before calling `makeCall()`.

**Why:** Calling immediately after the registration response can make the first call fail with “Chưa kết nối với tổng đài”, while a second attempt succeeds after the connection finishes.

**How to apply:** Attach the registration listener before invoking `register()`, wait with a bounded timeout, then start the outbound call. Collapse the Edu dialer on call events and restore it from the floating phone button.

**Additional rule:** Customer-list call actions should pass only the destination phone and selected location to the shared Edu dialer; the dialer/server remains responsible for staff extension and tenant routing.

**Why:** This keeps every call entry point on the same registered Web SDK session and prevents table UI code from duplicating credential or routing logic.

**How to apply:** Use the shared direct-call event for phone cells and let the dialer resolve location-scoped SDK credentials before invoking `makeCall()`.

**Additional rule:** For v3 native call UI, `makeCall(..., { remoteContact })` alone is not enough to keep a contact name; also configure `searchRemoteContact` and resolve the name from the normalized destination number.

**Why:** The SDK can refresh its remote-contact data after the initial call event and replace a previously displayed contact with “Không xác định”.

**How to apply:** Keep a short-lived in-memory number-to-name map for names explicitly selected from Edu, and have the SDK callback return that contact during the call lifecycle.

**Additional rule:** Omicall call history must be fetched server-side through the configured v3 Call Transaction endpoint, scoped to the staff member's allowed locations; never expose the API key in Dashboard requests.

**Why:** Call History requires tenant authentication and may include recordings and customer data, while the Dashboard only needs normalized rows and safe pagination metadata.

**How to apply:** Resolve each location's encrypted config and access token on the server, normalize provider rows before returning them, and report unavailable locations as warnings rather than leaking credentials.

**Additional rule:** Call Transaction V3 returns `items` and pagination at the top level; a configured `*.omicrm.io` CRM URL can return HTML instead of API JSON, so history must fall back to the API host.

**Why:** Treating the whole response as `payload` loses pagination metadata, and accepting an HTML 200 response as an empty result silently hides calls. The API host can be the valid Call Transaction endpoint even when the CRM host is not.

**How to apply:** For history, try the configured Call History URL first, require a valid JSON response, then fall back to the configured Auto Call/API host. Keep click-to-call auth unchanged and read pagination from both response levels for compatibility.
