import { catalogTotal, catalogVersion } from "../../catalog-data";

export async function GET() {
  return Response.json(
    { version: catalogVersion, total: catalogTotal },
    { headers: { "Cache-Control": "no-cache", ETag: `"${catalogVersion}"` } },
  );
}
