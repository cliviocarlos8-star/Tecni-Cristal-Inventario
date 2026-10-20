import TechnicalCatalog from "../technical-catalog";
import { catalogCategories, catalogLines, catalogTotal, queryCatalog } from "../catalog-data";

export default function TechnicalCatalogPage() {
  return <TechnicalCatalog initialPage={queryCatalog({})} lines={catalogLines} categories={catalogCategories} catalogTotal={catalogTotal} />;
}
