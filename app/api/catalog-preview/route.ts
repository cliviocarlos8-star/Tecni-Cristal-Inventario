import { queryCatalog, type CatalogListItem } from "../../catalog-data";

export async function GET(request:Request){
  const raw=new URL(request.url).searchParams.get("codes")||"";
  const codes=[...new Set(raw.split(",").map(code=>code.trim().toUpperCase()).filter(Boolean))].slice(0,40);
  const items:CatalogListItem[]=[];
  for(const code of codes){
    const match=queryCatalog({query:code,limit:1}).items.find(item=>item.code.toUpperCase()===code);
    if(match)items.push(match);
  }
  return Response.json(items,{headers:{"Cache-Control":"public, max-age=3600, stale-while-revalidate=86400"}});
}
