CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"location_id" uuid,
	"class_id" uuid,
	"action" varchar(255) NOT NULL,
	"old_content" text,
	"new_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_hub_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_url" text NOT NULL,
	"snapshot_url" text NOT NULL,
	"connection_id" varchar(255) NOT NULL,
	"center_code" varchar(255),
	"auth_token_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" varchar(20) DEFAULT 'never' NOT NULL,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(30) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" text,
	"entity_code" varchar(100),
	"entity_name" text,
	"action" varchar(30) NOT NULL,
	"user_id" uuid,
	"location_id" uuid,
	"old_content" jsonb,
	"new_content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_status" varchar(100) NOT NULL,
	"deducts_fee" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_fee_rules_attendance_status_unique" UNIQUE("attendance_status")
);
--> statement-breakpoint
CREATE TABLE "bidv_location_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"service_id" varchar(100),
	"merchant_id" text,
	"secret_code" text,
	"receive_account" varchar(50),
	"account_name" varchar(200),
	"va_prefix" varchar(10),
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_qr_enabled" boolean DEFAULT true NOT NULL,
	"auto_reconcile" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bidv_location_configs_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "bidv_reconciliation_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"file_name" varchar(500),
	"mime_type" varchar(100) DEFAULT 'text/plain' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"raw_content" text NOT NULL,
	"raw_response_metadata" jsonb,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"encrypted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bidv_reconciliation_files_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "bidv_reconciliation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"external_transaction_id" varchar(200),
	"trace_number" varchar(100),
	"va_code" varchar(100),
	"bill_id" varchar(200),
	"transaction_date" timestamp,
	"value_date" timestamp,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"transaction_type" varchar(20),
	"bank_status" varchar(20),
	"bank_description" text,
	"currency" varchar(3) DEFAULT 'VND' NOT NULL,
	"channel_code" varchar(20),
	"service_id" varchar(20),
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bidv_reconciliation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" varchar(3) NOT NULL,
	"service_id" varchar(6),
	"location_id" uuid,
	"reconcile_date" date NOT NULL,
	"file_type" varchar(100) DEFAULT '1' NOT NULL,
	"request_type" varchar(2) DEFAULT '1' NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"record_count" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"request_id" varchar(100),
	"signature_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bidv_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar(200) NOT NULL,
	"va_code" varchar(50) NOT NULL,
	"invoice_id" uuid,
	"amount" numeric(15, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'processed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bidv_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "bidv_virtual_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"invoice_id" uuid,
	"schedule_id" uuid,
	"location_id" uuid NOT NULL,
	"va_code" varchar(50) NOT NULL,
	"type" varchar(20) DEFAULT 'student' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bidv_virtual_accounts_va_code_unique" UNIQUE("va_code")
);
--> statement-breakpoint
CREATE TABLE "center_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_url" text DEFAULT '' NOT NULL,
	"singleton_key" text DEFAULT 'default' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "center_notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"attendance_enabled" boolean DEFAULT true,
	"class_changed_enabled" boolean DEFAULT true,
	"tuition_enabled" boolean DEFAULT true,
	"attendance_result_enabled" boolean DEFAULT true,
	"zalo_enabled" boolean DEFAULT false,
	"sms_enabled" boolean DEFAULT false,
	"email_enabled" boolean DEFAULT false,
	"channel_priority" varchar(50) DEFAULT 'AUTO',
	"debt_reminder_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "center_notification_settings_center_id_unique" UNIQUE("center_id")
);
--> statement-breakpoint
CREATE TABLE "center_notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"location_id" uuid,
	"template_code" varchar(100) NOT NULL,
	"zns_template_id" varchar(100),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "center_registry" (
	"center_id" varchar(100) PRIMARY KEY NOT NULL,
	"center_url" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"tinode_topic_id" varchar(100),
	"class_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_direct_message" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message_edit_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" varchar(100) NOT NULL,
	"message_seq" integer NOT NULL,
	"previous_content" text NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_grade_book_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_book_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"score" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_grade_book_student_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_book_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_grade_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"score_sheet_id" uuid NOT NULL,
	"score_sheet_category_order_snapshot" uuid[],
	"session_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"excluded_student_ids" uuid[] DEFAULT '{}' NOT NULL,
	"student_ids" uuid[],
	"student_comments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_session_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"from_session_id" uuid NOT NULL,
	"to_session_id" uuid NOT NULL,
	"from_session_order" integer NOT NULL,
	"to_session_order" integer NOT NULL,
	"from_session_date" date NOT NULL,
	"to_session_date" date NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_session_teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_session_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"schedule_key" varchar(80) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"weekday" integer NOT NULL,
	"shift_template_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"teacher_ids" uuid[],
	"teacher_role_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"learning_format" varchar(50) DEFAULT 'offline' NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"cancel_reason" text,
	"session_note" text,
	"cancelled_at" timestamp,
	"cancelled_by" uuid,
	"session_index" integer,
	"change_reason" text,
	"changed_at" timestamp,
	"changed_by" uuid,
	"subject_id" uuid,
	"evaluation_criteria_ids" uuid[],
	"program_id" uuid,
	"score_sheet_id" uuid,
	"score_sheet_assessment_id" uuid,
	"score_sheet_assessment_published" boolean DEFAULT false NOT NULL,
	"score_sheet_assessment_excluded_student_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_id" uuid NOT NULL,
	"created_by" uuid,
	"program_id" uuid,
	"course_id" uuid,
	"manager_ids" uuid[] NOT NULL,
	"teacher_ids" uuid[],
	"shift_template_ids" uuid[],
	"fee_package_id" uuid,
	"use_fee_package_color" boolean DEFAULT false NOT NULL,
	"weekdays" integer[],
	"schedule_config_json" jsonb,
	"teachers_config_json" jsonb,
	"start_date" date,
	"end_date" date,
	"max_students" integer,
	"learning_format" varchar(50) DEFAULT 'offline' NOT NULL,
	"online_link" text,
	"status" varchar(50) DEFAULT 'planning' NOT NULL,
	"color" varchar(20),
	"description" text,
	"subject_id" uuid,
	"evaluation_criteria_ids" uuid[],
	"score_sheet_id" uuid,
	"schedule_generated" boolean DEFAULT false NOT NULL,
	"class_type" varchar(20) DEFAULT 'group',
	"free_class_mode" varchar(30),
	"tinode_topic_id" varchar(100),
	"cycle_history" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "classes_class_code_unique" UNIQUE("class_code")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_id" uuid NOT NULL,
	"capacity" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"invoice_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"invoice_statuses" text[] DEFAULT '{}'::text[] NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"description" text,
	"role_configs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(30) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" text,
	"entity_code" varchar(100),
	"entity_name" text,
	"action" varchar(30) NOT NULL,
	"user_id" uuid,
	"location_id" uuid,
	"old_content" jsonb,
	"new_content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_fee_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"fee" numeric(15, 2) NOT NULL,
	"sessions" numeric(10, 2) NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"color" varchar(7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_locations" (
	"course_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_locations_course_id_location_id_pk" PRIMARY KEY("course_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "course_program_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid,
	"session_number" numeric(10, 2),
	"title" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"exam_id" uuid,
	"score_sheet_id" uuid,
	"score_sheet_assessment_id" uuid,
	"score_sheet_template_id" uuid,
	"content" text,
	"attachments" text[],
	"allow_download" boolean,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_ids" uuid[] NOT NULL,
	"sessions" numeric(10, 2) NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_programs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_id" uuid,
	"note" text,
	"created_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crm_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(255) NOT NULL,
	"field_type" varchar(20) DEFAULT 'text' NOT NULL,
	"options" text[],
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_customer_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"color" varchar(50) DEFAULT '#8b5cf6' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_registration_form_fields" (
	"field_key" varchar(100) PRIMARY KEY NOT NULL,
	"is_visible" boolean DEFAULT false NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_reject_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"color" varchar(50) DEFAULT '#3b82f6' NOT NULL,
	"position" varchar(100),
	"group_id" uuid,
	"is_parent_group" boolean DEFAULT false NOT NULL,
	"parent_id" uuid,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_required_fields" (
	"field_key" varchar(100) PRIMARY KEY NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"user_id" uuid,
	"user_name" varchar(255),
	"action" varchar(50) NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"snapshot_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"progress_message" text,
	"storage_key" text,
	"file_size_bytes" numeric(20, 0),
	"checksum" varchar(128),
	"requested_by" uuid,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_restores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_backup_id" uuid,
	"safety_backup_id" uuid,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"progress_message" text,
	"requested_by" uuid,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_reminder_once_sent" (
	"center_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"rule_type" text NOT NULL,
	"window_start" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_reminder_once_sent_center_id_schedule_id_rule_type_window_start_pk" PRIMARY KEY("center_id","schedule_id","rule_type","window_start")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_sub_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criteria_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"item_type" varchar(20) DEFAULT 'criterion' NOT NULL,
	"input_type" varchar(20) DEFAULT 'text' NOT NULL,
	"exclusion_code" varchar(100),
	"min_checked" integer,
	"max_checked" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_section_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"reading_passage_url" text,
	"reading_passage_name" varchar(255),
	"session_audio_url" text,
	"session_audio_name" varchar(255),
	"ai_grading_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid,
	"student_name" varchar(255),
	"student_code" varchar(50),
	"class_id" uuid,
	"answers" jsonb NOT NULL,
	"score" numeric(5, 2),
	"adjusted_score" numeric(5, 2),
	"comment" text,
	"part_scores" jsonb,
	"ai_grading_results" jsonb,
	"time_taken_seconds" integer,
	"started_at" timestamp,
	"expires_at" timestamp,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50),
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"location_id" uuid,
	"time_limit_minutes" integer,
	"max_attempts" integer DEFAULT 1,
	"passing_score" numeric(5, 2),
	"show_result" boolean DEFAULT false,
	"open_at" timestamp,
	"close_at" timestamp,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facebook_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facebook_page_config_id" uuid,
	"location_id" uuid,
	"psid" varchar NOT NULL,
	"user_name" varchar,
	"user_avatar" text,
	"last_message" text,
	"last_message_at" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"student_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facebook_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"mid" varchar,
	"direction" varchar DEFAULT 'inbound' NOT NULL,
	"message_type" varchar DEFAULT 'text' NOT NULL,
	"content" text,
	"attachments" jsonb,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facebook_page_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid,
	"page_id" varchar NOT NULL,
	"page_name" varchar,
	"page_avatar" text,
	"page_access_token_encrypted" text NOT NULL,
	"verify_token" varchar NOT NULL,
	"is_connected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facebook_page_routes" (
	"page_id" varchar(100) PRIMARY KEY NOT NULL,
	"center_id" varchar(100) NOT NULL,
	"center_url" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"value_amount" numeric(12, 2),
	"value_type" varchar(10) DEFAULT 'percent',
	"quantity" integer,
	"from_date" date,
	"to_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_promotions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "finance_transaction_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"vat_rate" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_voucher_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"audience" varchar(20) DEFAULT 'all' NOT NULL,
	"birthday_mode" varchar(20) DEFAULT 'exact',
	"audience_student_ids" uuid[],
	"start_date" date,
	"end_date" date,
	"value_amount" numeric(12, 2) NOT NULL,
	"value_type" varchar(10) DEFAULT 'percent' NOT NULL,
	"quantity" integer,
	"usage_limit" varchar(20) DEFAULT 'once' NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "free_class_day_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"assignment_date" date NOT NULL,
	"teacher_id" uuid,
	"shift_template_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "free_class_day_assignments_class_date_unique" UNIQUE("class_id","assignment_date")
);
--> statement-breakpoint
CREATE TABLE "free_class_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"registration_date" date NOT NULL,
	"teacher_id" uuid,
	"shift_template_id" uuid,
	"status" varchar(20) DEFAULT 'registered' NOT NULL,
	"registered_by" uuid,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"attended_by" uuid,
	"attended_at" timestamp,
	"note" text,
	"review_data" jsonb,
	"review_published" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "free_class_registrations_student_class_date_unique" UNIQUE("student_class_id","registration_date")
);
--> statement-breakpoint
CREATE TABLE "free_class_session_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"session_date" date NOT NULL,
	"student_id" uuid,
	"content_type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"resource_url" text,
	"display_order" integer DEFAULT 0,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"routing_key" text NOT NULL,
	"center_id" uuid,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hrm_candidate_code_sequences" (
	"key" text PRIMARY KEY NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hrm_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"position" varchar(255) NOT NULL,
	"phone" varchar(60) DEFAULT '' NOT NULL,
	"email" varchar(254) DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"interview_mode" varchar(20) DEFAULT 'offline' NOT NULL,
	"interview_scheduled_at" varchar(40),
	"skills" text DEFAULT '' NOT NULL,
	"result" varchar(20) DEFAULT '' NOT NULL,
	"evaluation" text DEFAULT '' NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scores" jsonb DEFAULT '{"expertise":"","experience":"","communication":"","attitude":""}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hrm_candidates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invoice_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"invoice_code" varchar(50),
	"invoice_type" varchar(20),
	"subject_name" text,
	"grand_total" numeric(15, 2),
	"action" varchar(100) NOT NULL,
	"user_id" uuid,
	"location_id" uuid,
	"old_content" jsonb,
	"new_content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_code_sequences" (
	"key" text PRIMARY KEY NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"package_id" uuid,
	"package_name" varchar(255) NOT NULL,
	"package_type" varchar(20),
	"unit_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"promotion_keys" text[] DEFAULT '{}'::text[],
	"manual_promotion_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"surcharge_keys" text[] DEFAULT '{}'::text[],
	"promotion_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"surcharge_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"vat_rate" integer DEFAULT 0 NOT NULL,
	"vat_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0,
	"category" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payment_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"label" varchar(50) NOT NULL,
	"code" varchar(100),
	"base_amount" numeric(15, 2),
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"promotion_keys" text[] DEFAULT '{}'::text[],
	"surcharge_keys" text[] DEFAULT '{}'::text[],
	"promotion_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"surcharge_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"due_date" date,
	"status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp,
	"paid_by" uuid,
	"sort_order" integer DEFAULT 0,
	"settle_code" varchar(50),
	"payment_method" varchar(20),
	"applied_bank_account" jsonb,
	"einvoice_status" varchar(20),
	"einvoice_fkey" varchar(200),
	"einvoice_ma_tra_cuu" varchar(100),
	"einvoice_message" text,
	"einvoice_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invoice_print_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"page_size" varchar(20) DEFAULT 'A4' NOT NULL,
	"orientation" varchar(20) DEFAULT 'portrait' NOT NULL,
	"invoice_type" varchar(20) DEFAULT 'Thu' NOT NULL,
	"scope" varchar(20) DEFAULT 'general' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_session_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_item_id" uuid NOT NULL,
	"student_session_id" uuid NOT NULL,
	"allocated_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50),
	"settle_code" varchar(50),
	"type" varchar(10) DEFAULT 'Thu' NOT NULL,
	"location_id" uuid,
	"student_id" uuid,
	"subject_name" varchar(255),
	"class_id" uuid,
	"salary_table_id" uuid,
	"category" varchar(100),
	"account" varchar(20),
	"counter_account" varchar(20),
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_promotion" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_surcharge" numeric(15, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"deduction" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"remaining_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"commission" numeric(15, 2) DEFAULT '0',
	"description" text,
	"note" text,
	"payment_note" text,
	"due_date" date,
	"payment_method" varchar(20),
	"applied_bank_account" jsonb,
	"status" varchar(50) DEFAULT 'unpaid' NOT NULL,
	"invoice_promotion_keys" text[] DEFAULT '{}'::text[],
	"invoice_surcharge_keys" text[] DEFAULT '{}'::text[],
	"invoice_promotion_name" text,
	"invoice_promotion_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"invoice_surcharge_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"einvoice_status" varchar(20),
	"einvoice_fkey" varchar(200),
	"einvoice_ma_tra_cuu" varchar(100),
	"einvoice_message" text,
	"einvoice_updated_at" timestamp,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_by" uuid,
	"paid_at" timestamp,
	"store_receipt_id" uuid,
	"store_issue_receipt_id" uuid,
	"store_transfer_id" uuid
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"location_id" uuid,
	"type" varchar(30) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"hours" varchar(20),
	"overtime_from" varchar(5),
	"overtime_to" varchar(5),
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" text,
	"phone" varchar(50),
	"email" varchar(255),
	"logo_url" text,
	"payment_qr_url" text,
	"bank_name" varchar(100),
	"bank_account" varchar(50),
	"account_holder" varchar(255),
	"use_center_bank" boolean DEFAULT true,
	"bank_accounts" text,
	"is_main" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"author_role" varchar(255),
	"category" varchar(50) DEFAULT 'thong-bao' NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"image_urls" jsonb,
	"is_pinned" boolean DEFAULT false,
	"location_id" uuid,
	"post_location_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_feed_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "news_feed_reactions_post_user_uniq" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid,
	"student_id" uuid,
	"type" varchar(100),
	"channel" varchar(50),
	"status" varchar(50),
	"payload" jsonb,
	"error_message" text,
	"reason" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255),
	"channel" varchar(50),
	"variables" jsonb,
	"enabled" boolean DEFAULT true,
	"zns_template_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50) DEFAULT 'in-app' NOT NULL,
	"category" varchar(100) DEFAULT 'general',
	"reference_id" uuid,
	"reference_type" varchar(50),
	"reference_date" varchar(10),
	"deeplink" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omicall_location_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"service_name" varchar(100) DEFAULT 'omicall' NOT NULL,
	"auth_user" varchar(255),
	"sip_realm" varchar(255),
	"auth_key_encrypted" text,
	"hotline" varchar(50),
	"call_history_url" text,
	"auto_call_url" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "omicall_location_configs_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "online_learning_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"early_entry_minutes" integer DEFAULT 0 NOT NULL,
	"late_entry_minutes" integer DEFAULT 0 NOT NULL,
	"early_end_minutes" integer DEFAULT 0 NOT NULL,
	"auto_attendance_on_join" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "online_learning_rules_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "organization_client_locations" (
	"organization_client_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_client_locations_organization_client_id_location_id_pk" PRIMARY KEY("organization_client_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "organization_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classification" varchar(20) NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255),
	"account_status" varchar(20) DEFAULT 'active' NOT NULL,
	"contact_name" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"start_date" date NOT NULL,
	"duration_months" integer NOT NULL,
	"end_date" date NOT NULL,
	"service_package" text,
	"internal_note" text,
	"sales_staff_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manager_staff_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"renewal_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "organization_clients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_gateways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"location_id" uuid,
	"applied_bank_account" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedule_preview_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"payment_schedule_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_schedule_preview_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "public_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"push_token" text NOT NULL,
	"platform" varchar(10) NOT NULL,
	"expo_project_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_push_token_unique" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"media_image_url" text,
	"media_audio_url" text,
	"options" jsonb,
	"correct_answer" text,
	"score" numeric(5, 2) DEFAULT '1' NOT NULL,
	"difficulty" varchar(20),
	"explanation" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"resource" varchar(500) NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_view_all" boolean DEFAULT false NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"code_prefix" varchar(50) DEFAULT '' NOT NULL,
	"code_by_location_role" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "s3_file_logs" (
	"url" text PRIMARY KEY NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_allowance_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"apply_type" varchar(20) DEFAULT 'fixed_month' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_default_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" varchar(255) DEFAULT 'default' NOT NULL,
	"bhxh_percent" numeric(5, 2) DEFAULT '8' NOT NULL,
	"bhyt_percent" numeric(5, 2) DEFAULT '1.5' NOT NULL,
	"bhtn_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
	"giam_tru_ban_than" numeric(15, 2) DEFAULT '15500000' NOT NULL,
	"giam_tru_nguoi_phu_thuoc" numeric(15, 2) DEFAULT '6200000' NOT NULL,
	"tax_brackets" jsonb DEFAULT '[{"bac":1,"from":0,"to":10000000,"rate":"5"},{"bac":2,"from":10000000,"to":30000000,"rate":"10"},{"bac":3,"from":30000000,"to":60000000,"rate":"20"},{"bac":4,"from":60000000,"to":100000000,"rate":"30"},{"bac":5,"from":100000000,"to":null,"rate":"35"}]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_default_configs_center_id_unique" UNIQUE("center_id")
);
--> statement-breakpoint
CREATE TABLE "salary_sheet_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"staff_id" uuid,
	"location_id" uuid,
	"staff_code" varchar(50),
	"staff_name" varchar(255),
	"location_name" varchar(255),
	"role_name" varchar(255),
	"pay_type" varchar(20) DEFAULT 'fixed' NOT NULL,
	"worked_hours" numeric DEFAULT '0' NOT NULL,
	"so_cong" numeric DEFAULT '0' NOT NULL,
	"luong_cb" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cong_thuc" numeric DEFAULT '0' NOT NULL,
	"luong_theo_cong" numeric(15, 2) DEFAULT '0' NOT NULL,
	"phu_cap" numeric(15, 2) DEFAULT '0' NOT NULL,
	"thuong" numeric(15, 2) DEFAULT '0' NOT NULL,
	"phat" numeric(15, 2) DEFAULT '0' NOT NULL,
	"hoa_hong" numeric(15, 2) DEFAULT '0' NOT NULL,
	"luong_dung_lop" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tong_luong" numeric(15, 2) DEFAULT '0' NOT NULL,
	"bhxh" numeric(15, 2) DEFAULT '0' NOT NULL,
	"bhyt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"bhtn" numeric(15, 2) DEFAULT '0' NOT NULL,
	"thue_tncn" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tam_ung" numeric(15, 2) DEFAULT '0' NOT NULL,
	"thuc_nhan" numeric(15, 2) DEFAULT '0' NOT NULL,
	"da_chi" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"location_id" uuid NOT NULL,
	"location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"note" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_sheets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "score_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "score_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "score_sheet_assessment_student_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"class_session_id" uuid,
	"student_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"part_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skill_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_sheet_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_sheet_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"formula" varchar(500) DEFAULT '' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_session_id" uuid NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"resource_url" text,
	"display_order" integer DEFAULT 0,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"name" varchar(255) NOT NULL,
	"location_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"by_weekday" boolean DEFAULT true NOT NULL,
	"shift_template_id" uuid,
	"weekday_schedule" jsonb,
	"effective_from" date,
	"effective_to" date,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"code" varchar(50),
	"name" varchar(100) NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"lunch_break_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_leave_minutes" integer DEFAULT 0 NOT NULL,
	"work_units" numeric(10, 4) DEFAULT '1' NOT NULL,
	"location_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"note" text,
	"type" varchar(20) DEFAULT 'class' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"code" text PRIMARY KEY NOT NULL,
	"target_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"avatar_url" text,
	"phone" varchar(50),
	"email" varchar(255),
	"date_of_birth" date,
	"address" text,
	"status" varchar(50) DEFAULT 'Hoạt động',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "staff_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"location_id" uuid,
	"date" date NOT NULL,
	"document_due_date" date,
	"amount" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"department_id" uuid,
	"role_id" uuid,
	"omicall_extension" varchar(50),
	"omicall_password_encrypted" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "staff_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"shift_template_id" uuid,
	"time_in" varchar(8),
	"time_out" varchar(8),
	"worked_hours" numeric DEFAULT '0',
	"tong_cong" numeric DEFAULT '0',
	"note" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"contract_type" varchar(50) NOT NULL,
	"duration_months" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"work_type" varchar(50) NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_hr_salary_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"location_id" uuid,
	"role_name" varchar(255),
	"pay_type" varchar(20) DEFAULT 'fixed' NOT NULL,
	"luong_cb" numeric(15, 2) DEFAULT '0' NOT NULL,
	"phu_cap" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bhxh_base" numeric(15, 2) DEFAULT '0' NOT NULL,
	"bhxh_percent" numeric(5, 2) DEFAULT '8' NOT NULL,
	"bhyt_base" numeric(15, 2) DEFAULT '0' NOT NULL,
	"bhyt_percent" numeric(5, 2) DEFAULT '1.5' NOT NULL,
	"bhtn_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
	"thue_tncn_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"thue_tncn_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profile_file_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profile_file_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profile_file_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "staff_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"location_id" uuid,
	"type" varchar(10) NOT NULL,
	"date" date NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_salary_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"salary_package_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_teacher_profiles" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"hex" varchar(20) DEFAULT '#ffffff',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_issue_receipt_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" text,
	"receipt_code" varchar(50),
	"action" varchar(50) NOT NULL,
	"user_id" uuid,
	"user_name" varchar(255),
	"location_id" uuid,
	"old_content" jsonb,
	"new_content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_issue_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid,
	"product_code" varchar NOT NULL,
	"product_name" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_id" uuid,
	"unit_name" varchar,
	"sale_price" numeric DEFAULT '0',
	"stock_before" integer DEFAULT 0,
	"price_type" varchar(10) DEFAULT 'money',
	"star_price" integer DEFAULT 0,
	"total_stars" integer DEFAULT 0,
	"promotion_keys" jsonb DEFAULT '[]'::jsonb,
	"surcharge_keys" jsonb DEFAULT '[]'::jsonb,
	"manual_promotion_rows" jsonb DEFAULT '[]'::jsonb,
	"manual_surcharge_rows" jsonb DEFAULT '[]'::jsonb,
	"promotion_amount" numeric DEFAULT '0',
	"surcharge_amount" numeric DEFAULT '0',
	"vat_rate" integer DEFAULT 0 NOT NULL,
	"line_total" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_issue_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"name" varchar NOT NULL,
	"location_id" uuid,
	"warehouse_id" uuid,
	"date" date NOT NULL,
	"recipient_name" varchar,
	"note" text,
	"discount" numeric DEFAULT '0',
	"discount_type" varchar DEFAULT 'VND',
	"surcharge" numeric DEFAULT '0',
	"surcharge_type" varchar DEFAULT 'VND',
	"promotion_keys" jsonb DEFAULT '[]'::jsonb,
	"surcharge_keys" jsonb DEFAULT '[]'::jsonb,
	"manual_promotion_rows" jsonb DEFAULT '[]'::jsonb,
	"manual_surcharge_rows" jsonb DEFAULT '[]'::jsonb,
	"has_invoice" boolean DEFAULT false,
	"invoice_note" text,
	"paid_amount" numeric DEFAULT '0',
	"payment_method" varchar(20) DEFAULT 'cash',
	"payment_due_date" date,
	"status" varchar DEFAULT 'completed' NOT NULL,
	"total_amount" numeric DEFAULT '0',
	"recipient_id" uuid,
	"invoice_id" uuid,
	"created_by" uuid,
	"created_by_name" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"category_id" uuid,
	"unit_id" uuid,
	"supplier_id" uuid,
	"cost_price" numeric(15, 2) DEFAULT '0',
	"sale_price" numeric(15, 2) DEFAULT '0',
	"star_price" integer,
	"description" text,
	"image_url" text,
	"has_variants" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "store_receipt_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" text,
	"receipt_code" varchar(50),
	"action" varchar(50) NOT NULL,
	"user_id" uuid,
	"user_name" varchar(255),
	"location_id" uuid,
	"old_content" jsonb,
	"new_content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid,
	"product_code" varchar(100) NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"category_id" uuid,
	"color_id" uuid,
	"size_id" uuid,
	"unit_id" uuid,
	"cost_price" numeric(15, 2) DEFAULT '0',
	"sale_price" numeric(15, 2) DEFAULT '0',
	"star_price" integer DEFAULT 0,
	"total_stars" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_id" uuid,
	"warehouse_id" uuid,
	"date" date NOT NULL,
	"supplier_id" uuid,
	"note" text,
	"discount" numeric(15, 2) DEFAULT '0',
	"discount_type" varchar(10) DEFAULT 'VND',
	"surcharge" numeric(15, 2) DEFAULT '0',
	"surcharge_type" varchar(10) DEFAULT 'VND',
	"has_invoice" boolean DEFAULT false,
	"invoice_note" text,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"total_amount" numeric(15, 2) DEFAULT '0',
	"created_by" uuid,
	"created_by_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_receipts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "store_reservation_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"session_minutes" integer DEFAULT 5 NOT NULL,
	"draft_minutes" integer DEFAULT 1440 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_stock_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"receipt_id" uuid,
	"receipt_code" varchar,
	"type" varchar NOT NULL,
	"quantity_delta" integer NOT NULL,
	"status" varchar DEFAULT 'completed',
	"description" text,
	"created_by" uuid,
	"created_by_name" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_person" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"address" text,
	"tax_code" varchar(50),
	"note" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_transfer_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" text NOT NULL,
	"transfer_code" varchar(50) NOT NULL,
	"action" varchar(20) NOT NULL,
	"user_id" uuid,
	"user_name" varchar(255),
	"from_location_id" uuid,
	"old_content" jsonb,
	"new_content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_code" varchar NOT NULL,
	"product_name" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar NOT NULL,
	"date" date NOT NULL,
	"from_warehouse_id" uuid NOT NULL,
	"to_warehouse_id" uuid NOT NULL,
	"note" text,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_by_name" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"has_receipt_income" boolean DEFAULT false NOT NULL,
	"has_receipt_expense" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_id" uuid,
	"address" text,
	"min_stock" integer DEFAULT 0,
	"max_stock" integer,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_attendance_qr_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_encrypted" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "student_attendance_qr_tokens_student_id_unique" UNIQUE("student_id"),
	CONSTRAINT "student_attendance_qr_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "student_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'waiting' NOT NULL,
	"start_date" date,
	"end_date" date,
	"student_status" varchar(50) DEFAULT 'Không xác định',
	"total_sessions" integer DEFAULT 0,
	"attended_sessions" integer DEFAULT 0,
	"remaining_sessions" integer DEFAULT 0,
	"scheduled_weekdays" integer[],
	"cycle_history" jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "student_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"schedule_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"schedule_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attendance_approval_mode" varchar(20),
	"rejection_reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"zalo_user_id" text,
	"is_followed" boolean DEFAULT false,
	"has_interacted" boolean DEFAULT false,
	"preferred_channel" varchar(50) DEFAULT 'AUTO',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_notification_channels_student_id_center_id_unique" UNIQUE("student_id","center_id")
);
--> statement-breakpoint
CREATE TABLE "student_relationship_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"from_relationship_id" uuid,
	"from_relationship_name" varchar(255),
	"to_relationship_id" uuid,
	"to_relationship_name" varchar(255),
	"changed_by_user_id" uuid,
	"changed_by_name" varchar(255),
	"note" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_session_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_content_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"custom_title" text,
	"custom_description" text,
	"status" varchar(50),
	"submission_content" text,
	"submission_attachments" jsonb,
	"score" varchar(20),
	"grading_comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_class_id" uuid,
	"class_session_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"attendance_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attendance_at" timestamp,
	"attendance_note" text,
	"note" text,
	"package_id" uuid,
	"package_type" varchar(20),
	"session_price" numeric(10, 2),
	"session_source" varchar(20),
	"makeup_from_session_id" uuid,
	"is_paid" boolean,
	"session_order" integer,
	"review_data" jsonb,
	"review_published" boolean DEFAULT false,
	"online_clicked_at" timestamp,
	"online_ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_star_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text,
	"receipt_id" uuid,
	"receipt_code" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"invoice_id" uuid,
	"type" varchar(10) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"category" varchar(100),
	"action" varchar(255) NOT NULL,
	"class_id" uuid,
	"class_name" varchar(255),
	"invoice_code" varchar(50),
	"invoice_description" text,
	"created_by" uuid,
	"created_by_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"code" varchar(50) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"type" varchar(50) DEFAULT 'Học viên' NOT NULL,
	"phone" varchar(50),
	"date_of_birth" date,
	"gender" varchar(20),
	"email" varchar(255),
	"pipeline_stage" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(50) DEFAULT 'active',
	"account_status" varchar(50) DEFAULT 'Hoạt động',
	"relationship" varchar(100),
	"parent_name" varchar(255),
	"parent_phone" varchar(50),
	"parent_name2" varchar(255),
	"parent_phone2" varchar(50),
	"parent_name3" varchar(255),
	"parent_phone3" varchar(50),
	"address" text,
	"source" varchar(255),
	"reject_reason" text,
	"social_link" varchar(255),
	"academic_level" varchar(255),
	"sales_by_ids" uuid[],
	"managed_by_ids" uuid[],
	"teacher_ids" uuid[],
	"parent_ids" uuid[],
	"created_by" uuid,
	"updated_by" uuid,
	"class_ids" uuid[],
	"relationship_ids" uuid[],
	"customer_source_ids" uuid[],
	"school_ids" uuid[],
	"note" text,
	"avatar_url" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "students_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" varchar(200) DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6b7280' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"color" varchar(20) DEFAULT '#6b7280' NOT NULL,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text DEFAULT '',
	"location_ids" uuid[] DEFAULT '{}' NOT NULL,
	"department_id" uuid,
	"status_id" uuid,
	"level_id" uuid,
	"due_date" timestamp,
	"subject_ids" uuid[] DEFAULT '{}' NOT NULL,
	"manager_ids" uuid[] DEFAULT '{}' NOT NULL,
	"assignee_ids" uuid[] DEFAULT '{}' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_session_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"check_in_at" timestamp,
	"check_out_at" timestamp,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"shift_template_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_salary_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"role" varchar(100) DEFAULT 'Giáo viên' NOT NULL,
	"unit_price" numeric(15, 2),
	"ranges" jsonb,
	"role_rates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_salary_published_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salary_table_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_salary_published_rows_salary_table_id_teacher_id_class_id_unique" UNIQUE("salary_table_id","teacher_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_salary_row_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salary_table_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_salary_row_packages_salary_table_id_teacher_id_class_id_unique" UNIQUE("salary_table_id","teacher_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_salary_session_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salary_table_id" uuid NOT NULL,
	"class_session_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_salary_session_packages_salary_table_id_class_session_id_teacher_id_unique" UNIQUE("salary_table_id","class_session_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "teacher_salary_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_session_content_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"location_id" uuid,
	"test_date" date NOT NULL,
	"time_start" varchar(20) DEFAULT '',
	"time_end" varchar(20) DEFAULT '',
	"teacher_ids" uuid[] DEFAULT '{}',
	"exam_ids" uuid[] DEFAULT '{}',
	"assignment_ids" uuid[] DEFAULT '{}',
	"student_ids" uuid[] DEFAULT '{}',
	"student_count" integer DEFAULT 0,
	"student_results" jsonb DEFAULT '{}'::jsonb,
	"content_settings" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuition_package_change_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"student_class_id" uuid NOT NULL,
	"old_total" numeric(15, 2) NOT NULL,
	"new_total" numeric(15, 2) NOT NULL,
	"difference" numeric(15, 2) NOT NULL,
	"adjustment_invoice_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuition_package_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_key" varchar(80) NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_package_change_requests_operation_key_unique" UNIQUE("operation_key")
);
--> statement-breakpoint
CREATE TABLE "tuition_package_session_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"student_session_id" uuid NOT NULL,
	"effective_amount" numeric(15, 2) NOT NULL,
	"applied_sequence" serial NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tenant_map" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_tenant_map_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"zalo_user_id" varchar(100) NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"tenant_id" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_tenant_map_zalo_user_id_unique" UNIQUE("zalo_user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"password_encrypted" text,
	"auth_version" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true,
	"tinode_user_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "web_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zalo_oa_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid,
	"app_id" varchar(100),
	"app_secret_encrypted" text,
	"oa_id" varchar(100),
	"oa_name" varchar(255),
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"refresh_state" varchar(16) DEFAULT 'ready' NOT NULL,
	"token_expired_at" timestamp,
	"connected_at" timestamp,
	"is_connected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zalo_oa_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zalo_oa_config_id" uuid,
	"location_id" uuid,
	"follower_id" varchar(100) NOT NULL,
	"follower_name" varchar(255),
	"follower_avatar" text,
	"anonymous_key" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"last_message" text,
	"last_message_at" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zalo_oa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"msg_id" varchar(200),
	"direction" varchar(10) DEFAULT 'inbound' NOT NULL,
	"message_type" varchar(30) DEFAULT 'text' NOT NULL,
	"content" text,
	"attachments" jsonb,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zalo_oauth_states" (
	"id" varchar PRIMARY KEY NOT NULL,
	"location_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zalo_routing" (
	"oa_id" varchar(100) PRIMARY KEY NOT NULL,
	"center_id" varchar(100) NOT NULL,
	"center_url" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zbs_template_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"notification_type" varchar(100) NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"compatibility_status" varchar(32) DEFAULT 'unverified' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zbs_template_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zalo_oa_config_id" uuid NOT NULL,
	"notification_type" varchar(100) NOT NULL,
	"template_id" varchar(100),
	"template_name" varchar(255),
	"template_status" varchar(32),
	"compatibility_status" varchar(32) DEFAULT 'compatibility_unverified' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_audit_logs" ADD CONSTRAINT "assessment_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_audit_logs" ADD CONSTRAINT "assessment_audit_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidv_reconciliation_files" ADD CONSTRAINT "bidv_reconciliation_files_session_id_bidv_reconciliation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."bidv_reconciliation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidv_reconciliation_records" ADD CONSTRAINT "bidv_reconciliation_records_session_id_bidv_reconciliation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."bidv_reconciliation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidv_reconciliation_sessions" ADD CONSTRAINT "bidv_reconciliation_sessions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidv_virtual_accounts" ADD CONSTRAINT "bidv_virtual_accounts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidv_virtual_accounts" ADD CONSTRAINT "bidv_virtual_accounts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidv_virtual_accounts" ADD CONSTRAINT "bidv_virtual_accounts_schedule_id_invoice_payment_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."invoice_payment_schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "center_notification_templates" ADD CONSTRAINT "center_notification_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_group_members" ADD CONSTRAINT "chat_group_members_group_id_chat_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."chat_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_group_members" ADD CONSTRAINT "chat_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_groups" ADD CONSTRAINT "chat_groups_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_groups" ADD CONSTRAINT "chat_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_edit_history" ADD CONSTRAINT "chat_message_edit_history_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_book_scores" ADD CONSTRAINT "class_grade_book_scores_grade_book_id_class_grade_books_id_fk" FOREIGN KEY ("grade_book_id") REFERENCES "public"."class_grade_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_book_scores" ADD CONSTRAINT "class_grade_book_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_book_scores" ADD CONSTRAINT "class_grade_book_scores_category_id_score_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."score_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_book_student_comments" ADD CONSTRAINT "class_grade_book_student_comments_grade_book_id_class_grade_books_id_fk" FOREIGN KEY ("grade_book_id") REFERENCES "public"."class_grade_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_book_student_comments" ADD CONSTRAINT "class_grade_book_student_comments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_books" ADD CONSTRAINT "class_grade_books_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_books" ADD CONSTRAINT "class_grade_books_score_sheet_id_score_sheets_id_fk" FOREIGN KEY ("score_sheet_id") REFERENCES "public"."score_sheets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_books" ADD CONSTRAINT "class_grade_books_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_books" ADD CONSTRAINT "class_grade_books_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_grade_books" ADD CONSTRAINT "class_grade_books_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_exclusions" ADD CONSTRAINT "class_session_exclusions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_exclusions" ADD CONSTRAINT "class_session_exclusions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_teacher_assignments" ADD CONSTRAINT "class_session_teacher_assignments_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session_teacher_assignments" ADD CONSTRAINT "class_session_teacher_assignments_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_program_id_course_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."course_programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_score_sheet_id_score_sheets_id_fk" FOREIGN KEY ("score_sheet_id") REFERENCES "public"."score_sheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_program_id_course_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."course_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_fee_package_id_course_fee_packages_id_fk" FOREIGN KEY ("fee_package_id") REFERENCES "public"."course_fee_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_score_sheet_id_score_sheets_id_fk" FOREIGN KEY ("score_sheet_id") REFERENCES "public"."score_sheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_configs" ADD CONSTRAINT "commission_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_configs" ADD CONSTRAINT "commission_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_audit_logs" ADD CONSTRAINT "course_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_audit_logs" ADD CONSTRAINT "course_audit_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_fee_packages" ADD CONSTRAINT "course_fee_packages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_locations" ADD CONSTRAINT "course_locations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_locations" ADD CONSTRAINT "course_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_program_contents" ADD CONSTRAINT "course_program_contents_program_id_course_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."course_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_program_contents" ADD CONSTRAINT "course_program_contents_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_program_contents" ADD CONSTRAINT "course_program_contents_score_sheet_id_score_sheets_id_fk" FOREIGN KEY ("score_sheet_id") REFERENCES "public"."score_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_program_contents" ADD CONSTRAINT "course_program_contents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_relationships" ADD CONSTRAINT "crm_relationships_group_id_crm_pipeline_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."crm_pipeline_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activity_logs" ADD CONSTRAINT "customer_activity_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activity_logs" ADD CONSTRAINT "customer_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_restores" ADD CONSTRAINT "database_restores_source_backup_id_database_backups_id_fk" FOREIGN KEY ("source_backup_id") REFERENCES "public"."database_backups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_restores" ADD CONSTRAINT "database_restores_safety_backup_id_database_backups_id_fk" FOREIGN KEY ("safety_backup_id") REFERENCES "public"."database_backups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_sub_criteria" ADD CONSTRAINT "evaluation_sub_criteria_criteria_id_evaluation_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."evaluation_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_section_questions" ADD CONSTRAINT "exam_section_questions_section_id_exam_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."exam_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_section_questions" ADD CONSTRAINT "exam_section_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_conversations" ADD CONSTRAINT "facebook_conversations_facebook_page_config_id_facebook_page_configs_id_fk" FOREIGN KEY ("facebook_page_config_id") REFERENCES "public"."facebook_page_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_conversations" ADD CONSTRAINT "facebook_conversations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_conversations" ADD CONSTRAINT "facebook_conversations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_messages" ADD CONSTRAINT "facebook_messages_conversation_id_facebook_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."facebook_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_page_configs" ADD CONSTRAINT "facebook_page_configs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_voucher_usages" ADD CONSTRAINT "finance_voucher_usages_voucher_id_finance_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."finance_vouchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_voucher_usages" ADD CONSTRAINT "finance_voucher_usages_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_voucher_usages" ADD CONSTRAINT "finance_voucher_usages_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_vouchers" ADD CONSTRAINT "finance_vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_day_assignments" ADD CONSTRAINT "free_class_day_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_day_assignments" ADD CONSTRAINT "free_class_day_assignments_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_day_assignments" ADD CONSTRAINT "free_class_day_assignments_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_day_assignments" ADD CONSTRAINT "free_class_day_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_day_assignments" ADD CONSTRAINT "free_class_day_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_student_class_id_student_classes_id_fk" FOREIGN KEY ("student_class_id") REFERENCES "public"."student_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_registrations" ADD CONSTRAINT "free_class_registrations_attended_by_users_id_fk" FOREIGN KEY ("attended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_session_contents" ADD CONSTRAINT "free_class_session_contents_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_class_session_contents" ADD CONSTRAINT "free_class_session_contents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_commissions" ADD CONSTRAINT "invoice_commissions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_commissions" ADD CONSTRAINT "invoice_commissions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_package_id_course_fee_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."course_fee_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_schedule" ADD CONSTRAINT "invoice_payment_schedule_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_schedule" ADD CONSTRAINT "invoice_payment_schedule_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_schedule" ADD CONSTRAINT "invoice_payment_schedule_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_schedule" ADD CONSTRAINT "invoice_payment_schedule_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_print_templates" ADD CONSTRAINT "invoice_print_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_session_allocations" ADD CONSTRAINT "invoice_session_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_session_allocations" ADD CONSTRAINT "invoice_session_allocations_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_session_allocations" ADD CONSTRAINT "invoice_session_allocations_student_session_id_student_sessions_id_fk" FOREIGN KEY ("student_session_id") REFERENCES "public"."student_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_feed_posts" ADD CONSTRAINT "news_feed_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_feed_reactions" ADD CONSTRAINT "news_feed_reactions_post_id_news_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."news_feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_feed_reactions" ADD CONSTRAINT "news_feed_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omicall_location_configs" ADD CONSTRAINT "omicall_location_configs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_learning_rules" ADD CONSTRAINT "online_learning_rules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_client_locations" ADD CONSTRAINT "organization_client_locations_organization_client_id_organization_clients_id_fk" FOREIGN KEY ("organization_client_id") REFERENCES "public"."organization_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_client_locations" ADD CONSTRAINT "organization_client_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_clients" ADD CONSTRAINT "organization_clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_clients" ADD CONSTRAINT "organization_clients_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateways" ADD CONSTRAINT "payment_gateways_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_preview_grants" ADD CONSTRAINT "payment_schedule_preview_grants_center_id_center_config_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule_preview_grants" ADD CONSTRAINT "payment_schedule_preview_grants_payment_schedule_id_invoice_payment_schedule_id_fk" FOREIGN KEY ("payment_schedule_id") REFERENCES "public"."invoice_payment_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_sheet_employees" ADD CONSTRAINT "salary_sheet_employees_sheet_id_salary_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."salary_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_sheet_employees" ADD CONSTRAINT "salary_sheet_employees_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_sheet_employees" ADD CONSTRAINT "salary_sheet_employees_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_sheets" ADD CONSTRAINT "salary_sheets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_sheets" ADD CONSTRAINT "salary_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_assessment_student_attempts" ADD CONSTRAINT "score_sheet_assessment_student_attempts_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_assessment_student_attempts" ADD CONSTRAINT "score_sheet_assessment_student_attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_assessment_student_attempts" ADD CONSTRAINT "score_sheet_assessment_student_attempts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_assessment_student_attempts" ADD CONSTRAINT "score_sheet_assessment_student_attempts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_items" ADD CONSTRAINT "score_sheet_items_score_sheet_id_score_sheets_id_fk" FOREIGN KEY ("score_sheet_id") REFERENCES "public"."score_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_sheet_items" ADD CONSTRAINT "score_sheet_items_category_id_score_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."score_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_contents" ADD CONSTRAINT "session_contents_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contracts" ADD CONSTRAINT "staff_contracts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hr_salary_configs" ADD CONSTRAINT "staff_hr_salary_configs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hr_salary_configs" ADD CONSTRAINT "staff_hr_salary_configs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile_file_categories" ADD CONSTRAINT "staff_profile_file_categories_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_rewards" ADD CONSTRAINT "staff_rewards_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_configs" ADD CONSTRAINT "staff_salary_configs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_configs" ADD CONSTRAINT "staff_salary_configs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_configs" ADD CONSTRAINT "staff_salary_configs_salary_package_id_teacher_salary_packages_id_fk" FOREIGN KEY ("salary_package_id") REFERENCES "public"."teacher_salary_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_teacher_profiles" ADD CONSTRAINT "staff_teacher_profiles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_warehouse_id_store_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."store_warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_issue_receipt_audit_logs" ADD CONSTRAINT "store_issue_receipt_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_issue_receipt_audit_logs" ADD CONSTRAINT "store_issue_receipt_audit_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_category_id_store_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."store_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_unit_id_store_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."store_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_supplier_id_store_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."store_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipt_audit_logs" ADD CONSTRAINT "store_receipt_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipt_audit_logs" ADD CONSTRAINT "store_receipt_audit_logs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipt_items" ADD CONSTRAINT "store_receipt_items_receipt_id_store_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."store_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipt_items" ADD CONSTRAINT "store_receipt_items_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipts" ADD CONSTRAINT "store_receipts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipts" ADD CONSTRAINT "store_receipts_warehouse_id_store_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."store_warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_receipts" ADD CONSTRAINT "store_receipts_supplier_id_store_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."store_suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transfer_audit_logs" ADD CONSTRAINT "store_transfer_audit_logs_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_warehouses" ADD CONSTRAINT "store_warehouses_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_attendance_qr_tokens" ADD CONSTRAINT "student_attendance_qr_tokens_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_attendance_qr_tokens" ADD CONSTRAINT "student_attendance_qr_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_classes" ADD CONSTRAINT "student_classes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_classes" ADD CONSTRAINT "student_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_classes" ADD CONSTRAINT "student_classes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_locations" ADD CONSTRAINT "student_locations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_locations" ADD CONSTRAINT "student_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_relationship_history" ADD CONSTRAINT "student_relationship_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_relationship_history" ADD CONSTRAINT "student_relationship_history_from_relationship_id_crm_relationships_id_fk" FOREIGN KEY ("from_relationship_id") REFERENCES "public"."crm_relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_relationship_history" ADD CONSTRAINT "student_relationship_history_to_relationship_id_crm_relationships_id_fk" FOREIGN KEY ("to_relationship_id") REFERENCES "public"."crm_relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_relationship_history" ADD CONSTRAINT "student_relationship_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_session_contents" ADD CONSTRAINT "student_session_contents_session_content_id_session_contents_id_fk" FOREIGN KEY ("session_content_id") REFERENCES "public"."session_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_session_contents" ADD CONSTRAINT "student_session_contents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_class_id_student_classes_id_fk" FOREIGN KEY ("student_class_id") REFERENCES "public"."student_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_package_id_course_fee_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."course_fee_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_makeup_from_session_id_class_sessions_id_fk" FOREIGN KEY ("makeup_from_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_wallet_transactions" ADD CONSTRAINT "student_wallet_transactions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_wallet_transactions" ADD CONSTRAINT "student_wallet_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_wallet_transactions" ADD CONSTRAINT "student_wallet_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_id_task_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."task_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_level_id_task_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."task_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_availability" ADD CONSTRAINT "teacher_availability_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_salary_tables" ADD CONSTRAINT "teacher_salary_tables_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_salary_tables" ADD CONSTRAINT "teacher_salary_tables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_change_operations" ADD CONSTRAINT "tuition_package_change_operations_request_id_tuition_package_change_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tuition_package_change_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_change_operations" ADD CONSTRAINT "tuition_package_change_operations_student_class_id_student_classes_id_fk" FOREIGN KEY ("student_class_id") REFERENCES "public"."student_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_change_operations" ADD CONSTRAINT "tuition_package_change_operations_adjustment_invoice_id_invoices_id_fk" FOREIGN KEY ("adjustment_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_change_operations" ADD CONSTRAINT "tuition_package_change_operations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_change_requests" ADD CONSTRAINT "tuition_package_change_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_session_adjustments" ADD CONSTRAINT "tuition_package_session_adjustments_operation_id_tuition_package_change_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."tuition_package_change_operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_package_session_adjustments" ADD CONSTRAINT "tuition_package_session_adjustments_student_session_id_student_sessions_id_fk" FOREIGN KEY ("student_session_id") REFERENCES "public"."student_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_center_id_center_config_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_oa_configs" ADD CONSTRAINT "zalo_oa_configs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_oa_conversations" ADD CONSTRAINT "zalo_oa_conversations_zalo_oa_config_id_zalo_oa_configs_id_fk" FOREIGN KEY ("zalo_oa_config_id") REFERENCES "public"."zalo_oa_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_oa_conversations" ADD CONSTRAINT "zalo_oa_conversations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zalo_oa_messages" ADD CONSTRAINT "zalo_oa_messages_conversation_id_zalo_oa_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."zalo_oa_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zbs_template_library" ADD CONSTRAINT "zbs_template_library_center_id_center_config_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."center_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zbs_template_library" ADD CONSTRAINT "zbs_template_library_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zbs_template_library" ADD CONSTRAINT "zbs_template_library_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zbs_template_mappings" ADD CONSTRAINT "zbs_template_mappings_zalo_oa_config_id_zalo_oa_configs_id_fk" FOREIGN KEY ("zalo_oa_config_id") REFERENCES "public"."zalo_oa_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_hub_connections_active_idx" ON "admin_hub_connections" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "admin_hub_connections_connection_id_idx" ON "admin_hub_connections" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "assessment_audit_logs_created_at_idx" ON "assessment_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assessment_audit_logs_scope_action_idx" ON "assessment_audit_logs" USING btree ("scope","action");--> statement-breakpoint
CREATE INDEX "bidv_recon_records_session_idx" ON "bidv_reconciliation_records" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "bidv_recon_records_external_idx" ON "bidv_reconciliation_records" USING btree ("external_transaction_id");--> statement-breakpoint
CREATE INDEX "bidv_recon_sessions_lookup_idx" ON "bidv_reconciliation_sessions" USING btree ("provider_id","reconcile_date","file_type");--> statement-breakpoint
CREATE INDEX "bidv_recon_sessions_status_idx" ON "bidv_reconciliation_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bidv_recon_sessions_unique_request_idx" ON "bidv_reconciliation_sessions" USING btree ("provider_id","reconcile_date","file_type");--> statement-breakpoint
CREATE UNIQUE INDEX "center_config_singleton_key_unique" ON "center_config" USING btree ("singleton_key");--> statement-breakpoint
CREATE UNIQUE INDEX "center_notification_templates_center_code_uniq" ON "center_notification_templates" USING btree ("center_id","template_code");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_groups_tinode_topic_id_uidx" ON "chat_groups" USING btree ("tinode_topic_id") WHERE "chat_groups"."tinode_topic_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_message_edit_history_message_idx" ON "chat_message_edit_history" USING btree ("topic_id","message_seq","edited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "class_session_teacher_assignments_session_teacher_uidx" ON "class_session_teacher_assignments" USING btree ("class_session_id","teacher_id");--> statement-breakpoint
CREATE INDEX "class_session_teacher_assignments_session_idx" ON "class_session_teacher_assignments" USING btree ("class_session_id");--> statement-breakpoint
CREATE INDEX "class_session_teacher_assignments_teacher_idx" ON "class_session_teacher_assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "class_sessions_session_date_idx" ON "class_sessions" USING btree ("session_date");--> statement-breakpoint
CREATE INDEX "class_sessions_status_idx" ON "class_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "class_sessions_class_date_idx" ON "class_sessions" USING btree ("class_id","session_date");--> statement-breakpoint
CREATE INDEX "class_sessions_score_sheet_assessment_id_idx" ON "class_sessions" USING btree ("score_sheet_assessment_id");--> statement-breakpoint
CREATE INDEX "class_sessions_room_conflict_idx" ON "class_sessions" USING btree ("room_id","session_date","shift_template_id");--> statement-breakpoint
CREATE INDEX "classes_status_idx" ON "classes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "classes_location_idx" ON "classes" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "classes_location_status_idx" ON "classes" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "classes_created_at_idx" ON "classes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "classes_created_by_idx" ON "classes" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_tinode_topic_id_uidx" ON "classes" USING btree ("tinode_topic_id") WHERE "classes"."tinode_topic_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "commission_configs_effective_from_idx" ON "commission_configs" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "course_locations_location_id_idx" ON "course_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "database_backups_snapshot_at_idx" ON "database_backups" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "database_backups_status_idx" ON "database_backups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "database_restores_status_idx" ON "database_restores" USING btree ("status");--> statement-breakpoint
CREATE INDEX "database_restores_requested_at_idx" ON "database_restores" USING btree ("requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_sessions_user_exam_uidx" ON "exam_sessions" USING btree ("user_id","exam_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_status_idx" ON "exam_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exam_sessions_expires_at_idx" ON "exam_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "facebook_messages_mid_idx" ON "facebook_messages" USING btree ("mid");--> statement-breakpoint
CREATE INDEX "finance_voucher_usages_voucher_student_idx" ON "finance_voucher_usages" USING btree ("voucher_id","student_id");--> statement-breakpoint
CREATE INDEX "finance_voucher_usages_invoice_idx" ON "finance_voucher_usages" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_voucher_usages_invoice_voucher_idx" ON "finance_voucher_usages" USING btree ("invoice_id","voucher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_vouchers_code_idx" ON "finance_vouchers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "finance_vouchers_active_date_idx" ON "finance_vouchers" USING btree ("is_active","start_date","end_date");--> statement-breakpoint
CREATE INDEX "free_class_day_assignments_class_date_idx" ON "free_class_day_assignments" USING btree ("class_id","assignment_date");--> statement-breakpoint
CREATE INDEX "free_class_registrations_class_date_idx" ON "free_class_registrations" USING btree ("class_id","registration_date");--> statement-breakpoint
CREATE INDEX "free_class_registrations_student_class_date_idx" ON "free_class_registrations" USING btree ("student_class_id","registration_date");--> statement-breakpoint
CREATE INDEX "free_class_registrations_status_idx" ON "free_class_registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "free_class_session_contents_class_date_idx" ON "free_class_session_contents" USING btree ("class_id","session_date");--> statement-breakpoint
CREATE INDEX "free_class_session_contents_student_idx" ON "free_class_session_contents" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_registry_provider_key_idx" ON "gateway_registry" USING btree ("provider","routing_key");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoices_student_status_idx" ON "invoices" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "invoices_location_created_at_idx" ON "invoices" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_type_status_idx" ON "invoices" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "news_feed_posts_author_idx" ON "news_feed_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "news_feed_posts_created_at_idx" ON "news_feed_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "news_feed_posts_location_idx" ON "news_feed_posts" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "news_feed_reactions_post_idx" ON "news_feed_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "notifications_user_is_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "organization_client_locations_location_idx" ON "organization_client_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "organization_clients_status_idx" ON "organization_clients" USING btree ("account_status");--> statement-breakpoint
CREATE INDEX "organization_clients_end_date_idx" ON "organization_clients" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "organization_clients_created_by_idx" ON "organization_clients" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "payment_schedule_preview_grants_schedule_idx" ON "payment_schedule_preview_grants" USING btree ("center_id","payment_schedule_id");--> statement-breakpoint
CREATE INDEX "payment_schedule_preview_grants_expiry_idx" ON "payment_schedule_preview_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_sheet_assessment_student_attempts_unique_idx" ON "score_sheet_assessment_student_attempts" USING btree ("assessment_id","class_session_id","student_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "score_sheet_assessment_manual_attempts_unique_idx" ON "score_sheet_assessment_student_attempts" USING btree ("assessment_id","student_id","attempt_number") WHERE "score_sheet_assessment_student_attempts"."class_session_id" IS NULL;--> statement-breakpoint
CREATE INDEX "score_sheet_assessment_student_attempts_session_idx" ON "score_sheet_assessment_student_attempts" USING btree ("assessment_id","class_session_id");--> statement-breakpoint
CREATE INDEX "score_sheet_assessment_student_attempts_student_idx" ON "score_sheet_assessment_student_attempts" USING btree ("assessment_id","student_id");--> statement-breakpoint
CREATE INDEX "staff_user_id_idx" ON "staff" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_advances_location_date_idx" ON "staff_advances" USING btree ("location_id","date");--> statement-breakpoint
CREATE INDEX "staff_assignments_staff_id_idx" ON "staff_assignments" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_attendances_staff_date_shift_uidx" ON "staff_attendances" USING btree ("staff_id","work_date","shift_template_id") WHERE shift_template_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "staff_contracts_staff_id_idx" ON "staff_contracts" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_contracts_staff_code_uidx" ON "staff_contracts" USING btree ("staff_id","code");--> statement-breakpoint
CREATE INDEX "staff_profile_file_categories_staff_id_idx" ON "staff_profile_file_categories" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profile_file_categories_staff_name_uidx" ON "staff_profile_file_categories" USING btree ("staff_id","name");--> statement-breakpoint
CREATE INDEX "staff_rewards_location_date_idx" ON "staff_rewards" USING btree ("location_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "store_inventory_reservations_session_product_warehouse_uidx" ON "store_inventory_reservations" USING btree ("session_id","product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "student_attendance_qr_tokens_student_idx" ON "student_attendance_qr_tokens" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_attendance_qr_tokens_hash_idx" ON "student_attendance_qr_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "student_classes_status_idx" ON "student_classes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "student_classes_class_status_idx" ON "student_classes" USING btree ("class_id","status");--> statement-breakpoint
CREATE INDEX "student_classes_student_status_idx" ON "student_classes" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "student_classes_created_at_idx" ON "student_classes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "student_leave_requests_student_created_at_idx" ON "student_leave_requests" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "student_leave_requests_location_status_idx" ON "student_leave_requests" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "student_leave_requests_status_idx" ON "student_leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "student_locations_student_id_idx" ON "student_locations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_locations_location_id_idx" ON "student_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "student_notification_channels_student_id_idx" ON "student_notification_channels" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_sessions_status_idx" ON "student_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "student_sessions_attendance_status_idx" ON "student_sessions" USING btree ("attendance_status");--> statement-breakpoint
CREATE INDEX "student_sessions_class_session_status_idx" ON "student_sessions" USING btree ("class_session_id","attendance_status");--> statement-breakpoint
CREATE INDEX "student_sessions_student_id_idx" ON "student_sessions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_sessions_student_class_id_idx" ON "student_sessions" USING btree ("student_class_id");--> statement-breakpoint
CREATE INDEX "student_sessions_student_class_session_idx" ON "student_sessions" USING btree ("student_class_id","class_session_id");--> statement-breakpoint
CREATE INDEX "student_sessions_created_at_idx" ON "student_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "students_created_at_idx" ON "students" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "students_status_idx" ON "students" USING btree ("status");--> statement-breakpoint
CREATE INDEX "students_account_status_idx" ON "students" USING btree ("account_status");--> statement-breakpoint
CREATE INDEX "students_user_id_idx" ON "students" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "students_sales_by_ids_gin_idx" ON "students" USING gin ("sales_by_ids");--> statement-breakpoint
CREATE INDEX "students_managed_by_ids_gin_idx" ON "students" USING gin ("managed_by_ids");--> statement-breakpoint
CREATE INDEX "students_teacher_ids_gin_idx" ON "students" USING gin ("teacher_ids");--> statement-breakpoint
CREATE INDEX "students_school_ids_gin_idx" ON "students" USING gin ("school_ids");--> statement-breakpoint
CREATE INDEX "tasks_status_id_idx" ON "tasks" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_location_ids_gin_idx" ON "tasks" USING gin ("location_ids");--> statement-breakpoint
CREATE INDEX "tasks_subject_ids_gin_idx" ON "tasks" USING gin ("subject_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_attendance_session_staff_unique" ON "teacher_attendance" USING btree ("class_session_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tuition_package_change_operation_student_unique" ON "tuition_package_change_operations" USING btree ("request_id","student_class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tuition_package_session_adjustment_unique" ON "tuition_package_session_adjustments" USING btree ("operation_id","student_session_id");--> statement-breakpoint
CREATE INDEX "tuition_package_session_adjustment_session_idx" ON "tuition_package_session_adjustments" USING btree ("student_session_id","applied_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tinode_user_id_uidx" ON "users" USING btree ("tinode_user_id") WHERE "users"."tinode_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "web_push_subscriptions_center_endpoint_uidx" ON "web_push_subscriptions" USING btree ("center_id","endpoint");--> statement-breakpoint
CREATE INDEX "web_push_subscriptions_user_center_idx" ON "web_push_subscriptions" USING btree ("user_id","center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zalo_oa_messages_msg_id_unique" ON "zalo_oa_messages" USING btree ("msg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zbs_template_library_center_code_uniq" ON "zbs_template_library" USING btree ("center_id","code");--> statement-breakpoint
CREATE INDEX "zbs_template_library_center_status_idx" ON "zbs_template_library" USING btree ("center_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "zbs_template_mappings_oa_type_uniq" ON "zbs_template_mappings" USING btree ("zalo_oa_config_id","notification_type");