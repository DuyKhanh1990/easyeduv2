---
name: CMC S3 streaming uploads
description: Direct browser presigned uploads versus server-to-CMC S3 streaming behavior.
---

CMC Telecom's S3-compatible endpoint accepted a small server-side SigV4 PUT using `UNSIGNED-PAYLOAD`; a presigned query-string PUT returned `AccessDenied`, while CORS preflight for the tested center origin succeeded. This is a protocol compatibility result, not a production-scale performance guarantee.

**Why:** The existing S3 endpoint uses custom SigV4 signing because of Ceph-compatible SDK behavior, so direct presigning cannot be assumed to work just because ordinary server uploads do.

**How to apply:** For large uploads, prefer testing a server-side streaming path that preserves backpressure and uses the accepted header-authenticated request. Keep browser-to-S3 presigning disabled unless CMC confirms the required policy/signature configuration. Test realistic file sizes and concurrency before replacing the existing upload path.
