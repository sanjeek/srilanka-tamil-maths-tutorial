CREATE TABLE IF NOT EXISTS guardian (
  id uuid PRIMARY KEY,
  phone_key text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS consent (
  guardian_id uuid NOT NULL REFERENCES guardian,
  version text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, version)
);
CREATE TABLE IF NOT EXISTS student (
  id uuid PRIMARY KEY,
  guardian_id uuid NOT NULL REFERENCES guardian,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 13),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_guardian ON student (guardian_id);
CREATE TABLE IF NOT EXISTS otp_challenge (
  id uuid PRIMARY KEY,
  phone_key text NOT NULL,
  ip_key text NOT NULL,
  device_key text NOT NULL,
  proof text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  signup_name text
);
CREATE INDEX IF NOT EXISTS otp_phone_recent ON otp_challenge (phone_key, created_at);
CREATE INDEX IF NOT EXISTS otp_ip_recent ON otp_challenge (ip_key, created_at);
CREATE INDEX IF NOT EXISTS otp_device_recent ON otp_challenge (device_key, created_at);
CREATE TABLE IF NOT EXISTS guardian_session (
  token_key text PRIMARY KEY,
  guardian_id uuid NOT NULL REFERENCES guardian,
  student_id uuid REFERENCES student,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS skill (
  id text PRIMARY KEY,
  grade integer NOT NULL,
  name_ta text NOT NULL,
  name_en text NOT NULL,
  curriculum_reference text,
  competency text,
  reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS question (
  id text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES skill
);
CREATE TABLE IF NOT EXISTS question_version (
  question_id text NOT NULL REFERENCES question,
  version integer NOT NULL CHECK (version > 0),
  locale text NOT NULL CHECK (locale IN ('ta','en')),
  status text NOT NULL CHECK (status IN ('draft','in_review','published','archived')),
  difficulty text NOT NULL,
  content jsonb NOT NULL,
  PRIMARY KEY (question_id, version, locale)
);
CREATE TABLE IF NOT EXISTS practice_set (
  id text PRIMARY KEY,
  grade integer NOT NULL,
  mode text NOT NULL CHECK (mode IN ('sample','topic','mixed')),
  paid boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS practice_set_item (
  set_id text NOT NULL REFERENCES practice_set,
  position integer NOT NULL,
  question_id text NOT NULL,
  version integer NOT NULL,
  locale text NOT NULL,
  PRIMARY KEY (set_id, position, locale),
  FOREIGN KEY (question_id, version, locale) REFERENCES question_version
);
CREATE TABLE IF NOT EXISTS attempt (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES student,
  set_id text NOT NULL REFERENCES practice_set,
  locale text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_attempt ON attempt(student_id,set_id,locale) WHERE submitted_at IS NULL;
CREATE INDEX IF NOT EXISTS attempt_student_date ON attempt(student_id, started_at DESC);
CREATE TABLE IF NOT EXISTS attempt_item (
  attempt_id uuid NOT NULL REFERENCES attempt,
  position integer NOT NULL,
  question_id text NOT NULL,
  version integer NOT NULL,
  locale text NOT NULL,
  response text,
  status text NOT NULL DEFAULT 'unsubmitted' CHECK (status IN ('unsubmitted','correct','incorrect','skipped')),
  PRIMARY KEY (attempt_id,position),
  FOREIGN KEY (question_id, version, locale) REFERENCES question_version
);
CREATE INDEX IF NOT EXISTS attempt_item_question ON attempt_item(question_id,status);
CREATE TABLE IF NOT EXISTS staff_identity (
  subject text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS cohort_membership (
  staff_subject text NOT NULL REFERENCES staff_identity,
  student_id uuid NOT NULL REFERENCES student,
  shared_at timestamptz,
  PRIMARY KEY (staff_subject, student_id)
);
CREATE TABLE IF NOT EXISTS teacher_note (
  id uuid PRIMARY KEY,
  staff_subject text NOT NULL REFERENCES staff_identity,
  attempt_id uuid NOT NULL,
  position integer NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attempt_id,position) REFERENCES attempt_item
);
CREATE TABLE IF NOT EXISTS recommendation (
  staff_subject text NOT NULL REFERENCES staff_identity,
  student_id uuid NOT NULL REFERENCES student,
  skill_id text NOT NULL REFERENCES skill,
  state text NOT NULL CHECK (state IN ('needs_practice','recommended','improved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_subject, student_id, skill_id)
);
CREATE TABLE IF NOT EXISTS audit_event (
  id uuid PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  subject text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS content_issue (
  id uuid PRIMARY KEY,
  question_id text NOT NULL,
  version integer NOT NULL,
  locale text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (question_id, version, locale) REFERENCES question_version
);
CREATE TABLE IF NOT EXISTS plan (
  id text PRIMARY KEY,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'LKR' CHECK (currency = 'LKR'),
  period_months integer NOT NULL CHECK (period_months > 0)
);
CREATE TABLE IF NOT EXISTS payment_order (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES student,
  plan_id text NOT NULL REFERENCES plan,
  amount_minor integer NOT NULL,
  currency text NOT NULL CHECK (currency = 'LKR'),
  period_months integer NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','active','failed','refunded','cancelled')),
  transaction_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order ON payment_order(student_id) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS payment_event (
  provider_id text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES payment_order,
  kind text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS entitlement (
  student_id uuid PRIMARY KEY REFERENCES student,
  order_id uuid NOT NULL REFERENCES payment_order,
  paid_through timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('active','cancelled','expired','refunded','revoked'))
);
CREATE TABLE IF NOT EXISTS staff_session (
  token_key text PRIMARY KEY,
  staff_subject text NOT NULL REFERENCES staff_identity,
  expires_at timestamptz NOT NULL
);
