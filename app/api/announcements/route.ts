import { one, pool, rows } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";
import { apiError, clean } from "../../../lib/validation";

export const dynamic = "force-dynamic";

const select = `SELECT id,kind,title_en AS "titleEn",title_ar AS "titleAr",body_en AS "bodyEn",body_ar AS "bodyAr",
media_url AS "mediaUrl",link_url AS "linkUrl",published,sort_order AS "sortOrder",created_at AS "createdAt" FROM announcements`;

export async function GET() {
  try { return Response.json({ announcements: await rows(`${select} WHERE published=TRUE ORDER BY sort_order,id`) }); }
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

    if (action === "list") return Response.json({ announcements: await rows(`${select} ORDER BY sort_order,id`) });

    if (action === "save") {
      const kind = clean(data.kind, 10);
      if (!["text", "image", "video"].includes(kind)) return Response.json({ error: "Choose text, image, or video" }, { status: 400 });
      const titleEn = clean(data.titleEn, 160), titleAr = clean(data.titleAr, 160);
      const bodyEn = clean(data.bodyEn, 2000), bodyAr = clean(data.bodyAr, 2000);
      const mediaUrl = clean(data.mediaUrl, 500), linkUrl = clean(data.linkUrl, 500);
      if (!titleEn || (kind !== "text" && !mediaUrl)) return Response.json({ error: kind === "text" ? "A title is required" : "A title and media URL are required" }, { status: 400 });
      const sortOrder = Math.floor(Number(data.sortOrder)) || 0;
      const params = [kind, titleEn, titleAr || titleEn, bodyEn, bodyAr || bodyEn, mediaUrl, linkUrl, sortOrder];
      if (Number.isInteger(id) && id > 0) {
        await pool.query(`UPDATE announcements SET kind=$1,title_en=$2,title_ar=$3,body_en=$4,body_ar=$5,media_url=$6,link_url=$7,sort_order=$8 WHERE id=$9`, [...params, id]);
      } else {
        await pool.query(`INSERT INTO announcements (kind,title_en,title_ar,body_en,body_ar,media_url,link_url,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, params);
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