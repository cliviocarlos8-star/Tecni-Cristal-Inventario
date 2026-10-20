import { CATALOG_PAGE_SIZE, queryCatalog } from "../../catalog-data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = queryCatalog({
    query: url.searchParams.get("q") || "",
    line: url.searchParams.get("line") || "Todas",
    category: url.searchParams.get("category") || "Todos",
    offset: Number(url.searchParams.get("offset")) || 0,
    limit: Number(url.searchParams.get("limit")) || CATALOG_PAGE_SIZE,
  });
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } });
}
