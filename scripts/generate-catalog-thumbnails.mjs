import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourcePublic = process.argv[2];
if (!sourcePublic) throw new Error("Uso: node scripts/generate-catalog-thumbnails.mjs RUTA_PUBLIC_CATALOGO");

const projectRoot = process.cwd();
const catalog = JSON.parse(await readFile(path.join(projectRoot, "app/catalog-index.json"), "utf8"));
const outputRoot = path.join(projectRoot, "public/catalog-thumbnails");
await mkdir(outputRoot, { recursive: true });

function thumbnailName(url) {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, "0")}.webp`;
}

const manifest = {};
let created = 0;
let missing = 0;
for (const item of catalog) {
  if (manifest[item.thumbnail_url]) continue;
  const sourcePath = path.join(sourcePublic, decodeURIComponent(new URL(item.thumbnail_url).pathname));
  const fileName = thumbnailName(item.thumbnail_url);
  try {
    const sourceKey = decodeURIComponent(new URL(item.thumbnail_url).pathname);
    const verifiedCrops = {
      "/templado/1504AM.png": { left: 285, top: 285, width: 285, height: 155 },
    };
    const source = verifiedCrops[sourceKey] ? sharp(await sharp(sourcePath).extract(verifiedCrops[sourceKey]).png().toBuffer()) : sharp(sourcePath);
    const trimmed = await source.trim({ background: "#ffffff", threshold: 2 }).toBuffer({ resolveWithObject: true });
    const safePadding = Math.max(10, Math.min(24, Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.08)));
    const framed = await sharp(trimmed.data)
      .extend({ top: safePadding, right: safePadding, bottom: safePadding, left: safePadding, background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png().toBuffer();
    await sharp(framed)
      .resize(116, 92, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 }, withoutEnlargement: true })
      .webp({ quality: 72, alphaQuality: 80 })
      .toFile(path.join(outputRoot, fileName));
    manifest[item.thumbnail_url] = `/catalog-thumbnails/${fileName}`;
    created += 1;
  } catch {
    manifest[item.thumbnail_url] = item.thumbnail_url;
    missing += 1;
  }
}

await writeFile(path.join(projectRoot, "app/catalog-thumbnail-map.json"), `${JSON.stringify(manifest)}\n`);
console.log(JSON.stringify({ created, missing, total: Object.keys(manifest).length }));
