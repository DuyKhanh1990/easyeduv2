# EasyEdu schema migration generation

This workflow creates SQL files from `shared/schema.ts`. It does not connect to
a database and does not apply migrations.

## One-time setup

`migrations/meta/schema-baseline.json` records the current EasyEdu app schema as
the starting point for incremental generation. It is generator state, not SQL
to apply to a database.

## After changing `shared/schema.ts`

1. Generate a migration with a descriptive name:

   ```sh
   npm run db:migration:generate -- --name add_organization_contact
   ```

2. Review the new numbered SQL file in this directory before it is used.
   Commit that SQL file, `migrations/meta/schema-baseline.json`, and the
   corresponding schema/code changes together.

The generator rejects SQL containing destructive operations such as dropping
tables/columns or changing column types. For a rename or other non-additive
change, design a data-preserving migration manually and review it carefully.
New `NOT NULL` columns without a default are generated with a warning because
they may not apply to tables that already contain rows.

The initial baseline reflects the current schema only; it does not create the
existing tables on a blank database. Applying migrations and bootstrapping a
new database are separate workflow steps.

Do not use `drizzle-kit push` against production. This generation command only
writes migration files and the schema baseline.
