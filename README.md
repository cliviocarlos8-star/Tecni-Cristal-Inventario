# Tecni Cristal Inventario

Proyecto de la aplicación de inventario de Tecni Cristal. Incluye el código de la interfaz, catálogo e imágenes, módulos de inventario y las migraciones de la base de datos.

## Origen de esta copia

- Sitio original: https://tecni-cristal-inventario.cliviocarlos8.chatgpt.site
- Versión de Sites: **67**.
- Commit de origen: `97ebb08bc568e7170048e9cd103932462f3ae0d9`.
- Fecha de copia a GitHub: **20 de octubre de 2026**.

Se conserva el proyecto original, incluidos los archivos de configuración de Sites. La documentación técnica del entorno original está en [docs/README-Sites.md](docs/README-Sites.md).

## Contenido

- `app/`: interfaz y módulos de productos, movimientos, depósitos, obras, proveedores, usuarios, alertas y auditoría.
- `public/`: imágenes del catálogo y recursos de la aplicación.
- `supabase/migrations/`: estructura y reglas de la base de datos.
- `scripts/`, `tests/`, `build/` y `worker/`: herramientas de desarrollo, pruebas e integración con el entorno de Sites.
- `package.json` y `package-lock.json`: dependencias y versiones del proyecto.

## Datos y configuración

Los datos actuales del inventario continúan en **Supabase**. Por decisión del propietario, este repositorio no incluye una exportación de productos, existencias, movimientos, usuarios ni otros registros operativos.

La conexión del cliente se define en `lib/supabase.ts` mediante `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, con los valores públicos originales como respaldo. Las claves privadas y los archivos `.env` no deben guardarse en Git.

Esta subida no cambia la publicación del sitio ni la base de datos. Tampoco configura una sincronización automática entre GitHub y Sites.

## Desarrollo

El proyecto usa React, Vinext y Supabase. Requiere Node.js `>=22.13.0`. Los scripts originales están preparados para Linux, con `bash`, `flock`, `curl` y GNU `timeout`; en Windows requieren un entorno compatible, como WSL.

```bash
npm run install:ci
npm run dev
```

Para compilar, usar `npm run build`. Consultar [la documentación original](docs/README-Sites.md) para los detalles del entorno.
