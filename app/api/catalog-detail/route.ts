import { getCatalogDetail } from "../../catalog-data";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Falta el artículo" }, { status: 400 });
  const item = getCatalogDetail(id);
  if (!item) return Response.json({ error: "Artículo no encontrado" }, { status: 404 });
  return Response.json(item, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
