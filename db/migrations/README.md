# Application database migrations

This directory contains forward-only SQL migrations bundled into each image at build time.

- Use globally unique, increasing names such as `000001_add_example.sql`.
- Never edit a migration after it has been released; add a new migration instead.
- Keep each migration safe for the immediately previous application version where practical.
- DDL is applied transactionally unless a future migration explicitly documents why it cannot be.
- CI validates the filename sequence and image-bundled contents.

The baseline for a fresh database is generated from that image's `shared/schema.ts` during
the build and is not read from an external source at runtime.
