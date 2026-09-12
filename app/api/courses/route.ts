import { one, pool, rows } from "../../../lib/db";
import { currentUser, requireManager } from "../../../lib/auth";
import { apiError, clean, slugify } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const publicSelect = `SELECT id,slug,title_en AS "titleEn",title_ar AS "titleAr",category_en AS "categoryEn",category_ar AS "categoryAr",
 summary_en AS "summaryEn",summary_ar AS "summaryAr",instructor_name AS "instructorName",instructor_email AS "instructorEmail",
 whatsapp,price::float8 AS price,mode,image_url AS "imageUrl",level,duration,published,
 COALESCE((SELECT array_agg(cs.subject_id ORDER BY cs.subject_id) FROM course_subjects cs WHERE cs.course_id=courses.id),'{}') AS "subjectIds" FROM courses`;

// A course with no audience targets is visible to every student (the backward
// compatible default). One with targets is only visible to a student whose own
// (college, university, year) — set at registration — matches one of them; see
// course_academic_targets in schema.sql and the "Target audience" picker in the
// course editor.
const targetVisible = `(NOT EXISTS (SELECT 1 FROM course_academic_targets t WHERE t.course_id=courses.id) OR EXISTS (SELECT 1 FROM course_academic_targets t WHERE t.course_id=courses.id AND t.college_id=$1 AND t.university_id=$2 AND t.year_id=$3))`;

export async function GET() {
  try {
    // On the public site (and course detail pages), a logged-in instructor should
    // only ever see their own courses — never another instructor's. A logged-in
    // student only sees courses with no audience targets, or ones targeted at
    // their own college/university/year. Everyone else (guests, admins) keeps
    // seeing the full published catalog.
    const viewer = await currentUser();
    const courses = viewer && viewer.role === "instructor"
      ? await rows(`${publicSelect} WHERE published=TRUE AND instructor_email=$1 ORDER BY id`, [viewer.email])
      : viewer && viewer.role === "student"
        ? await rows(`${publicSelect} WHERE published=TRUE AND ${targetVisible} ORDER BY id`, [viewer.collegeId, viewer.universityId, viewer.yearId])
        : await rows(`${publicSelect} WHERE published=TRUE ORDER BY id`);
    return Response.json({ courses });
  }
  catch (error) { return apiError(error, "Courses GET error"); }
}

export async function POST(request: Request) {
  try {
    const access = await requireManager();
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 30);
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const id = Number(data.id);
    if (action === "save") {
      const titleEn = clean(data.titleEn, 120);
      if (!titleEn) return Response.json({ error: "English title is required" }, { status: 400 });
      const instructorName = access.user.role === "instructor" ? access.user.name : clean(data.instructorName, 120) || access.user.name;
      const instructorEmail = access.user.role === "instructor" ? access.user.email : clean(data.instructorEmail, 160) || access.user.email;
      const params = [titleEn, clean(data.titleAr, 120) || titleEn, clean(data.categoryEn, 60) || "General", clean(data.categoryAr, 60) || "عام", clean(data.summaryEn, 700), clean(data.summaryAr, 700), instructorName, instructorEmail, clean(data.whatsapp, 30), Number(data.price) || 0, clean(data.mode, 30) || "Recorded", clean(data.imageUrl, 500) || "/assets/course-tech.png", clean(data.level, 40) || "All levels", clean(data.duration, 40)];
      if (Number.isInteger(id) && id > 0) {
        const existing = await one<{ instructor_email: string }>("SELECT instructor_email FROM courses WHERE id=$1", [id]);
        if (!existing || (access.user.role === "instructor" && existing.instructor_email !== access.user.email)) return Response.json({ error: "You cannot edit this course" }, { status: 403 });
        await pool.query(`UPDATE courses SET title_en=$1,title_ar=$2,category_en=$3,category_ar=$4,summary_en=$5,summary_ar=$6,instructor_name=$7,instructor_email=$8,whatsapp=$9,price=$10,mode=$11,image_url=$12,level=$13,duration=$14,updated_at=NOW() WHERE id=$15`, [...params, id]);
      } else {
        const slug = `${slugify(titleEn) || "course"}-${Date.now().toString().slice(-6)}`;
        await pool.query(`INSERT INTO courses (title_en,title_ar,category_en,category_ar,summary_en,summary_ar,instructor_name,instructor_email,whatsapp,price,mode,image_url,level,duration,slug,published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE)`, [...params, slug]);
      }
      return Response.json({ ok: true });
    }
    if (!Number.isInteger(id)) return Response.json({ error: "Invalid course" }, { status: 400 });
    const existing = await one<{ instructor_email: string }>("SELECT instructor_email FROM courses WHERE id=$1", [id]);
    if (!existing || (access.user.role === "instructor" && existing.instructor_email !== access.user.email)) return Response.json({ error: "You cannot manage this course" }, { status: 403 });
    if (action === "delete") await pool.query("DELETE FROM courses WHERE id=$1", [id]);
    else if (action === "publish") await pool.query("UPDATE courses SET published=$1,updated_at=NOW() WHERE id=$2", [Boolean(data.published), id]);
    else if (action === "setTargets") {
      // Which (college, university, year) audiences this course should be visible
      // to. No rows at all means "visible to every student" (backward compatible
      // default for existing courses). See course_academic_targets in schema.sql.
      const targets = Array.isArray(data.targets) ? data.targets as Record<string, unknown>[] : [];
      const parsed = targets.map((row) => ({ collegeId: Number(row.collegeId), universityId: Number(row.universityId), yearId: Number(row.yearId) })).filter((row) => Number.isInteger(row.collegeId) && Number.isInteger(row.universityId) && Number.isInteger(row.yearId));
      await pool.query("DELETE FROM course_academic_targets WHERE course_id=$1", [id]);
      for (const target of parsed) await pool.query("INSERT INTO course_academic_targets (course_id,college_id,university_id,year_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [id, target.collegeId, target.universityId, target.yearId]);
    }
    else if (action === "setSubjects") {
      // Which subjects (college > university > year > term > subject) this course's
      // instructor is offering under. This is what the lock logic and the student
      // catalog filter key off of — see subject_locks / course_subjects in schema.sql.
      const subjectIds = Array.isArray(data.subjectIds) ? [...new Set(data.subjectIds.map((v) => Number(v)).filter((v) => Number.isInteger(v)))] : [];
      if (subjectIds.length) {
        const found = await rows<{ id: number }>("SELECT id FROM subjects WHERE id=ANY($1::bigint[])", [subjectIds]);
        if (found.length !== subjectIds.length) return Response.json({ error: "One or more subjects were not found" }, { status: 400 });
      }
      await pool.query("DELETE FROM course_subjects WHERE course_id=$1", [id]);
      for (const subjectId of subjectIds) await pool.query("INSERT INTO course_subjects (course_id,subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, subjectId]);
    }
    else return Response.json({ error: "Unsupported action" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error, "Courses POST error"); }
}