import { one, pool, rows } from "../../../lib/db";
import { currentUser, requireUser } from "../../../lib/auth";
import { apiError, clean } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const select = `SELECT a.id,a.kind,a.title_en AS "titleEn",a.title_ar AS "titleAr",a.body_en AS "bodyEn",a.body_ar AS "bodyAr",
a.media_url AS "mediaUrl",a.link_url AS "linkUrl",a.published,a.sort_order AS "sortOrder",a.created_at AS "createdAt",
a.show_on_landing AS "showOnLanding",a.show_on_discover AS "showOnDiscover",a.audience,
a.college_id AS "collegeId",a.university_id AS "universityId",a.year_id AS "yearId",a.target_course_id AS "targetCourseId",
COALESCE((SELECT array_agg(ac.course_id ORDER BY ac.course_id) FROM announcement_courses ac WHERE ac.announcement_id=a.id),'{}') AS "courseIds"
FROM announcements a`;

// A visitor's context decides which "academic" or "course" targeted announcements
// they qualify for. Anonymous visitors only ever see 'all'/'public' ones.
async function audienceClause(paramOffset: number) {
  const user = await currentUser();
  if (!user || user.role !== "student") {
    return { clause: "a.audience IN ('all','public')", params: [] as unknown[] };
  }
  const enrolledCourseIds = (await rows<{ course_id: number }>(
    "SELECT DISTINCT course_id FROM enrollments WHERE user_email=$1 AND payment_status='paid' AND status='active'",
    [user.email],
  )).map((row) => row.course_id);
  const p1 = paramOffset, p2 = paramOffset + 1, p3 = paramOffset + 2, p4 = paramOffset + 3;
  return {
    clause: `(a.audience='all' OR (a.audience='academic' AND a.college_id=$${p1} AND a.university_id=$${p2} AND a.year_id=$${p3}) OR (a.audience='course' AND a.target_course_id=ANY($${p4}::bigint[])))`,
    params: [user.collegeId, user.universityId, user.yearId, enrolledCourseIds],
  };
}

export async function GET() {
  try {
    const audience = await audienceClause(1);
    const query = `${select} WHERE a.published=TRUE AND a.show_on_landing=TRUE AND ${audience.clause} ORDER BY a.sort_order,a.id`;
    return Response.json({ announcements: await rows(query, audience.params) });
  }
  catch (error) { return apiError(error, "Announcements GET error"); }
}

export async function POST(request: Request) {
  try {
    const access = await requireUser();
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    if (access.user.role !== "admin") return Response.json({ error: "Administrator access required" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 30);
    const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
    const id = Number(data.id);

    if (action === "list") return Response.json({ announcements: await rows(`${select} ORDER BY a.sort_order,a.id`) });

    if (action === "save") {
      const kind = clean(data.kind, 10);
      if (!["text", "image", "video"].includes(kind)) return Response.json({ error: "Choose text, image, or video" }, { status: 400 });
      const titleEn = clean(data.titleEn, 160), titleAr = clean(data.titleAr, 160);
      const bodyEn = clean(data.bodyEn, 2000), bodyAr = clean(data.bodyAr, 2000);
      const mediaUrl = clean(data.mediaUrl, 500), linkUrl = clean(data.linkUrl, 500);
      if (!titleEn || (kind !== "text" && !mediaUrl)) return Response.json({ error: kind === "text" ? "A title is required" : "A title and media URL are required" }, { status: 400 });
      const sortOrder = Math.floor(Number(data.sortOrder)) || 0;
      const showOnLanding = Boolean(data.showOnLanding), showOnDiscover = Boolean(data.showOnDiscover);
      const audience = clean(data.audience, 20) || "all";
      if (!["all", "public", "academic", "course"].includes(audience)) return Response.json({ error: "Choose a valid audience" }, { status: 400 });

      let collegeId: number | null = null, universityId: number | null = null, yearId: number | null = null, targetCourseId: number | null = null;
      if (audience === "academic") {
        collegeId = Number(data.collegeId); universityId = Number(data.universityId); yearId = Number(data.yearId);
        const university = await one<{ id: number; college_id: string }>("SELECT id,college_id FROM universities WHERE id=$1", [universityId]);
        const year = await one<{ id: number; university_id: string }>("SELECT id,university_id FROM academic_years WHERE id=$1", [yearId]);
        if (!Number.isInteger(collegeId) || !university || Number(university.college_id) !== collegeId || !year || Number(year.university_id) !== universityId) {
          return Response.json({ error: "Choose a college, university, and year in order" }, { status: 400 });
        }
      } else if (audience === "course") {
        targetCourseId = Number(data.targetCourseId);
        if (!await one("SELECT id FROM courses WHERE id=$1", [targetCourseId])) return Response.json({ error: "Choose a valid course" }, { status: 400 });
      }

      const courseIds = Array.isArray(data.courseIds) ? data.courseIds.map((row) => Number(row)).filter((row) => Number.isInteger(row)) : [];

      const params = [kind, titleEn, titleAr || titleEn, bodyEn, bodyAr || bodyEn, mediaUrl, linkUrl, sortOrder, showOnLanding, showOnDiscover, audience, collegeId, universityId, yearId, targetCourseId];
      let announcementId = id;
      if (Number.isInteger(id) && id > 0) {
        await pool.query(
          `UPDATE announcements SET kind=$1,title_en=$2,title_ar=$3,body_en=$4,body_ar=$5,media_url=$6,link_url=$7,sort_order=$8,show_on_landing=$9,show_on_discover=$10,audience=$11,college_id=$12,university_id=$13,year_id=$14,target_course_id=$15 WHERE id=$16`,
          [...params, id],
        );
      } else {
        const inserted = await one<{ id: number }>(
          `INSERT INTO announcements (kind,title_en,title_ar,body_en,body_ar,media_url,link_url,sort_order,show_on_landing,show_on_discover,audience,college_id,university_id,year_id,target_course_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          params,
        );
        announcementId = inserted?.id || 0;
      }
      if (announcementId) {
        await pool.query("DELETE FROM announcement_courses WHERE announcement_id=$1", [announcementId]);
        for (const courseId of courseIds) {
          await pool.query("INSERT INTO announcement_courses (announcement_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [announcementId, courseId]);
        }
      }
      return Response.json({ ok: true });
    }

    if (!Number.isInteger(id)) return Response.json({ error: "Invalid announcement" }, { status: 400 });
    if (!await one("SELECT id FROM announcements WHERE id=$1", [id])) return Response.json({ error: "Announcement not found" }, { status: 404 });

    if (action === "publish") { await pool.query("UPDATE announcements SET published=$1 WHERE id=$2", [Boolean(data.published), id]); return Response.json({ ok: true }); }
    if (action === "delete") { await pool.query("DELETE FROM announcements WHERE id=$1", [id]); return Response.json({ ok: true }); }

    return Response.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) { return apiError(error, "Announcements POST error"); }
}
