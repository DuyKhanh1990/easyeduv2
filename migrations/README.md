# EasyEdu Drizzle migrations

`drizzle.easyedu.config.ts` is the migration-generation config for the EasyEdu
application database. It reads only `shared/schema.ts` and writes to
`migrations/easyedu/`. It intentionally has no database connection setting.
The older SQL files directly in `migrations/` are retained as legacy history;
they are not part of this new Drizzle migration journal.

## Generate a migration after a schema change

1. Update `shared/schema.ts`.
2. Generate SQL using the installed Drizzle Kit version:

   ```sh
   npm run db:migration:generate -- --name add_example
   ```

3. Review the generated SQL and snapshot changes in `migrations/easyedu/`.
4. Commit the SQL, journal, snapshots, schema, and related code together.

For DDL that Drizzle cannot represent, create a versioned custom migration:

```sh
npm run db:migration:custom -- --name add_manual_database_objects
```

Then write and review the required SQL in the generated file. Do not put
data-cleanup steps into a new-database bootstrap migration unless they are
proven safe for existing rows.

## Bootstrap and safety

`migrations/easyedu/0000_baseline.sql` is the full Drizzle-generated baseline
for the current 180-table `shared/schema.ts`. `0001_manual_database_objects.sql`
adds the current hand-written sequences, partial indexes, trigger, and indexes
that Drizzle does not declare. Together, these files describe the current
EasyEdu app schema for a blank database.

Later `generate` runs compare the schema to the latest committed Drizzle
snapshot and should emit only new differences. Generation does not connect to
or update a database. Do not use `drizzle-kit push` against production.

This bootstrap covers database structure, not center-specific seed data or
data backfills. Existing SQL directly under `migrations/` is retained as legacy
history and must not be combined with this new baseline when bootstrapping a
blank database.

## Running migrations from a tagged image

Build the runner with the application using `npm run build`; the image contains
`dist/db-migrate.cjs`, `migrations/easyedu/`, the latest snapshot, and
`shared/schema.ts`. Run `npm run db:migrate` with the target database URL supplied
through the deployment secret. The runner uses a per-database ledger, a
transaction per migration, checksums, and an advisory lock. A migration failure
stops the process so the deployment Job can block the application rollout.

For a blank database, the runner applies the baseline and later migrations in
journal order. For an existing database with a ledger, it applies only pending
migrations. For a legacy database without a ledger, it validates the current
snapshot before adoption; it may add missing nullable columns or columns with a
constant default, but stops on missing tables, incompatible types, indexes, or
constraints. It never drops tables, columns, or rows. Legacy drift that cannot
be safely reconciled requires a reviewed migration.

Do not run `drizzle-kit push` against production. The runner only executes the
SQL files packaged in the image selected for that deployment.
