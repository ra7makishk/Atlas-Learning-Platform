CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin','instructor','student')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','needs_changes','blocked')),
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '',
  trusted_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  category_en TEXT NOT NULL,
  category_ar TEXT NOT NULL,
  summary_en TEXT NOT NULL DEFAULT '',
  summary_ar TEXT NOT NULL DEFAULT '',
  instructor_name TEXT NOT NULL,
  instructor_email TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'Recorded',
  image_url TEXT NOT NULL DEFAULT '/assets/course-tech.png',
  level TEXT NOT NULL DEFAULT 'All levels',
  duration TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lessons (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('video','live','file')),
  asset_url TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  section_type TEXT NOT NULL DEFAULT 'full_curriculum' CHECK (section_type IN ('full_curriculum','mid_review','before_mid','after_mid','final_review')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  student_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('full_curriculum','mid_review','before_mid','after_mid','final_review')),
  section_type TEXT NOT NULL CHECK (section_type IN ('full_curriculum','mid_review','before_mid','after_mid','final_review')),
  section_limit INTEGER NOT NULL DEFAULT 1 CHECK (section_limit BETWEEN 1 AND 200),
  available_from TIMESTAMPTZ NOT NULL,
  available_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','redeemed','revoked')),
  redeemed_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_email, course_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  provider_reference TEXT NOT NULL DEFAULT '',
  receipt_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id BIGINT REFERENCES lessons(id) ON DELETE SET NULL,
  sender_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  receiver_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_requests (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  current_device_id TEXT NOT NULL DEFAULT '',
  requested_device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS file_assets (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS colleges (
  id BIGSERIAL PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS universities (
  id BIGSERIAL PRIMARY KEY,
  college_id BIGINT NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(college_id, name_ar)
);

CREATE TABLE IF NOT EXISTS academic_years (
  id BIGSERIAL PRIMARY KEY,
  university_id BIGINT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 8),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(university_id, year_number)
);

CREATE TABLE IF NOT EXISTS terms (
  id BIGSERIAL PRIMARY KEY,
  year_id BIGINT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 4),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(year_id, term_number)
);

-- A subject's real identity: one row per (term, subject name). This is the id every
-- lock/enrollment decision is keyed on — never the free-text name.
CREATE TABLE IF NOT EXISTS subjects (
  id BIGSERIAL PRIMARY KEY,
  term_id BIGINT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(term_id, name_ar)
);

-- Links a course (= one instructor's offering) to every subject it satisfies.
-- One subject can be linked to several courses (several instructors teaching it).
-- One course can be linked to several subjects (same instructor/content offered
-- under more than one college/university/year/term "window").
CREATE TABLE IF NOT EXISTS course_subjects (
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, subject_id)
);

-- Records, per student per subject, which single course/instructor they are locked
-- to. Written once at redemption time and never recomputed from the student's
-- profile, so changing college/university/year/term later never disturbs an
-- existing lock. One row per (student, subject) by design.
CREATE TABLE IF NOT EXISTS subject_locks (
  id BIGSERIAL PRIMARY KEY,
  student_email TEXT NOT NULL REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_email, subject_id)
);

CREATE TABLE IF NOT EXISTS course_academic_targets (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  college_id BIGINT NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  university_id BIGINT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  year_id BIGINT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE(course_id, college_id, university_id, year_id)
);

CREATE INDEX IF NOT EXISTS course_academic_targets_course_idx ON course_academic_targets(course_id);
CREATE INDEX IF NOT EXISTS course_academic_targets_year_idx ON course_academic_targets(year_id);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'text',
  title_en TEXT NOT NULL DEFAULT '',
  title_ar TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  body_ar TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS universities_college_idx ON universities(college_id);
CREATE INDEX IF NOT EXISTS academic_years_university_idx ON academic_years(university_id);
CREATE INDEX IF NOT EXISTS terms_year_idx ON terms(year_id);
CREATE INDEX IF NOT EXISTS subjects_term_idx ON subjects(term_id);
CREATE INDEX IF NOT EXISTS course_subjects_subject_idx ON course_subjects(subject_id);
CREATE INDEX IF NOT EXISTS subject_locks_student_idx ON subject_locks(student_email);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_participants_idx ON messages(sender_email, receiver_email, created_at DESC);
CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons(course_id, sort_order);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS access_codes_student_course_idx ON access_codes(student_email, course_id);