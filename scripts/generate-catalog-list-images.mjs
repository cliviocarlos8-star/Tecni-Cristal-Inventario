import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourcePublic = process.argv[2];
if (!sourcePublic) throw new Error("Uso: node scripts/generate-catalog-list-images.mjs RUTA_PUBLIC_CATALOGO");

const projectRoot = process.cwd();
const catalog = JSON.parse(await readFile(path.join(projectRoot, "app/catalog-index.json"), "utf8"));
const listRoot = path.join(projectRoot, "public/catalog-list-images");
const detailRoot = path.join(projectRoot, "public/catalog-detail-images");
await mkdir(listRoot, { recursive: true });
await mkdir(detailRoot, { recursive: true });

function imageName(url) {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}.webp`;
}

const uniqueItems = [...new Map(catalog.map((item) => [item.thumbnail_url, item])).values()];
const listManifest = {};
const detailManifest = {};
const audit = [];
let created = 0;
let missing = 0;

// Recortes manuales verificados para fuentes que contienen restos de la página
// del catálogo. Solo eliminan texto y artículos vecinos; nunca atraviesan el producto.
const verifiedCrops = {
  "/templado/1504AM.png": { left: 285, top: 285, width: 285, height: 155 },
};

for (const item of uniqueItems) {
  const sourcePath = path.join(sourcePublic, decodeURIComponent(new URL(item.thumbnail_url).pathname));
  const sourceKey = decodeURIComponent(new URL(item.thumbnail_url).pathname);
  const fileName = imageName(item.thumbnail_url);
  try {
    const metadata = await sharp(sourcePath).metadata();
    const crop = verifiedCrops[sourceKey];
    // Materializar primero el recorte manual: sharp puede adelantar `trim()`
    // respecto de `extract()` si si ambas operaciones quedan en el mismo pipeline.
    const source = crop ? sharp(await sharp(sourcePath).extract(crop).png().toBuffer()) : sharp(sourcePath);
    // Umbral deliberadamente mínimo: conserva bordes grises o casi blancos del
    // producto. La prioridad es integridad geométrica, no el recorte máximo.
    const trimmed = await source.trim({ background: "#ffffff", threshold: 2 }).toBuffer({ resolveWithObject: true });
    const safePadding = Math.max(14, Math.min(46, Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.08)));
    const framed = await sharp(trimmed.data)
      .extend({ top: safePadding, right: safePadding, bottom: safePadding, left: safePadding, background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png().toBuffer();
    await sharp(framed)
      .resize(320, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 }, withoutEnlargement: false })
      .webp({ quality: 80, alphaQuality: 84, smartSubsample: true })
      .toFile(path.join(listRoot, fileName));
    await sharp(framed)
      .resize(900, 720, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 }, withoutEnlargement: false })
      .webp({ quality: 86, alphaQuality: 90, smartSubsample: true })
      .toFile(path.join(detailRoot, fileName));

    const coverage = (trimmed.info.width * trimmed.info.height) / ((metadata.width || 1) * (metadata.height || 1));
    listManifest[item.thumbnail_url] = `/catalog-list-images/${fileName}`;
    detailManifest[item.thumbnail_url] = `/catalog-detail-images/${fileName}`;
    audit.push({ code: item.code, name: item.name, source_width: metadata.width, source_height: metadata.height, content_width: trimmed.info.width, content_height: trimmed.info.height, content_coverage: Number(coverage.toFixed(4)), classification: crop ? "verified-crop" : Math.max(trimmed.info.width, trimmed.info.height) < 220 ? "source-review" : coverage < 0.35 ? "reframed" : "healthy" });
    created += 1;
  } catch {
    listManifest[item.thumbnail_url] = item.thumbnail_url;
    detailManifest[item.thumbnail_url] = item.thumbnail_url;
    audit.push({ code: item.code, name: item.name, classification: "missing" });
    missing += 1;
  }
}

const listBytes = (await Promise.all(Object.values(listManifest).filter((url) => url.startsWith("/catalog-list-images/")).map((url) => stat(path.join(projectRoot, "public", url)).then((value) => value.size)))).reduce((sum, size) => sum + size, 0);
const detailBytes = (await Promise.all(Object.values(detailManifest).filter((url) => url.startsWith("/catalog-detail-images/")).map((url) => stat(path.join(projectRoot, "public", url)).then((value) => value.size)))).reduce((sum, size) => sum + size, 0);
const summary = { generated_at: new Date().toISOString(), created, missing, total: uniqueItems.length, reframed: audit.filter((item) => item.classification === "reframed").length, source_review: audit.filter((item) => item.classification === "source-review").length, list_output_bytes: listBytes, list_average_bytes: created ? Math.round(listBytes / created) : 0, detail_output_bytes: detailBytes, detail_average_bytes: created ? Math.round(detailBytes / created) : 0 };
await writeFile(path.join(projectRoot, "app/catalog-list-image-map.json"), `${JSON.stringify(listManifest)}\n`);
await writeFile(path.join(projectRoot, "app/catalog-detail-image-map.json"), `${JSON.stringify(detailManifest)}\n`);
await mkdir(path.join(projectRoot, "reports"), { recursive: true });
await writeFile(path.join(projectRoot, "reports/catalog-image-audit.json"), `${JSON.stringify({ summary, items: audit }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
