-- Add fee_package_id column to classes table
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "fee_package_id" uuid;

-- Add learning_format and online_link columns to classes table  
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "learning_format" varchar(50) DEFAULT 'offline' NOT NULL;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "online_link" text;

-- Add learning_format column to class_sessions table
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "learning_format" varchar(50) DEFAULT 'offline' NOT NULL;

-- Add foreign key constraint for fee_package_id if it doesn't exist
ALTER TABLE "classes" 
  ADD CONSTRAINT "classes_fee_package_id_course_fee_packages_id_fk" 
  FOREIGN KEY ("fee_package_id") REFERENCES "public"."course_fee_packages"("id") 
  ON DELETE no action ON UPDATE no action;
