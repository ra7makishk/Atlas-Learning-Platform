import { one, pool, rows } from "../../../lib/db";
import { currentUser, requireManager } from "../../../lib/auth";
import { apiError, clean, slugify } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const publicSelect = `SELECT id,slug,title_en AS "titleEn",title_ar AS "titleAr",category_en AS "categoryEn",category_ar AS "categoryAr",
 summary_en AS "summaryEn",summary_ar AS "summaryAr",instructor_name AS "instructorName",instructor_email AS "instructorEmail",
 whatsapp,price::float8 AS price,mode,image_url AS "imageUrl",level,duration,published,
 COALESCE((SELECT array_agg(cs.subject_id ORDER BY cs.subject_id) FROM course_subjects cs WHERE cs.course_id=courses.id),'{}') AS "subjectIds" FROM courses`;

export async function GET() {
  try {
    // The public catalog is unauthenticated by default (visitors and students need
    // to browse every instructor's courses to choose one). The one exception: a
    // signed-in instructor browsing the public site should only see their own
    // course(s), never a competing instructor's — so a session is checked here even
    // though none is required to call this endpoint.
    const user = await currentUser();
    const courses = user?.role === "instructor"
      ? await rows(`${publicSelect} WHERE published=TRUE AND instructor_email=$1 ORDER BY id`, [user.email])
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