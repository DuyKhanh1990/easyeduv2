ALTER TABLE "student_classes" ADD COLUMN "student_status" varchar(50) DEFAULT 'Không xác định';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION update_student_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.student_status := CASE 
    WHEN NEW.start_date > CURRENT_DATE THEN 'Chờ lịch'
    WHEN NEW.start_date <= CURRENT_DATE AND CURRENT_DATE <= NEW.end_date THEN 'Đang học'
    WHEN NEW.end_date < CURRENT_DATE THEN 'Kết thúc'
    ELSE 'Không xác định'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER student_status_trigger
BEFORE INSERT OR UPDATE ON "student_classes"
FOR EACH ROW
EXECUTE FUNCTION update_student_status();
--> statement-breakpoint
