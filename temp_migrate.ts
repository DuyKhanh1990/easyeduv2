
  import { db } from "./server/db";
  import { sql } from "drizzle-orm";

  async function main() {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS course_programs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR(50) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          location_ids UUID[] NOT NULL,
          sessions DECIMAL(10, 2) NOT NULL,
          note TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log("Table course_programs created");
      
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS course_program_contents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          program_id UUID NOT NULL REFERENCES course_programs(id) ON DELETE CASCADE,
          session_number DECIMAL(10, 2) NOT NULL,
          title VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          content TEXT,
          attachments TEXT[],
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      console.log("Table course_program_contents created");
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
  main();
  