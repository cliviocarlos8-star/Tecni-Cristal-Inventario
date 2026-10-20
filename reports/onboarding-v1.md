# Introducción a Tecni Cristal

Implementación sobre versión 64. Cinco pasos visuales y una pantalla final. Pantalla móvil con controles fijos; modal centrado en escritorio. Ayuda en pie lateral, Más y Catálogo. Tres ayudas contextuales persistentes: movimientos, catálogo y obra.

Permisos: rol activo de profiles; solo ADMIN, GERENCIA y DEPOSITO reciben operaciones. CONSULTA recibe contenido de lectura. No se modifican políticas, reglas, tablas ni existencias.

Persistencia: Supabase Auth user_metadata.tc_learning, con versión, fechas de inicio/completado/salto y ayudas cerradas. Respaldo local por user_id, fusión, escrituras serializadas y reintento al reconectar. La metadata de aprendizaje nunca concede permisos. Cuentas anteriores al corte de model.ts no reciben apertura automática. Confirmar el corte al publicar.

Pruebas anteriores a la recuperación del entorno: build y 30 pruebas automatizadas correctos. Navegación visual por cinco pasos, regreso, salto, reapertura, Escape y contenido Consulta en una página de presentación temporal. Móvil 390 × 844 sin overflow ni scroll en operaciones. Móvil 320 × 568 sin overflow horizontal, lectura con scroll y CTA fijo. Corregidos centrado y overflow transitorio durante animación. Los archivos QA temporales no se publican.

Pendiente: verificación autenticada real de metadata, cierre/inicio de sesión, otro dispositivo, nuevos usuarios, ayudas y destinos finales. El navegador no tenía sesión autorizada. Las pruebas del modelo serializado no sustituyen esta verificación. No se registraron movimientos ni se alteraron existencias.

El chequeo TypeScript anterior reportó errores en módulos existentes y tipos de Cloudflare, sin errores de la capa nueva. Build y pruebas existentes pasaron. No se ampliaron cambios a esos archivos.
