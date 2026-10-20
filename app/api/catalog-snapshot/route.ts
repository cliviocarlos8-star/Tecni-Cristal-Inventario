import { catalogSnapshot, catalogVersion } from "../../catalog-data";

export async function GET(request: Request) {
  if (request.headers.get("if-none-match") === `"${catalogVersion}"`) {
    return new Response(null, { status: 304, headers: { ETag: `"${catalogVersion}"` } });
  }
  return Response.json(
    { version: catalogVersion, items: catalogSnapshot },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400", ETag: `"${catalogVersion}"` } },
  );
}
