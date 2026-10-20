export const VERSION = 1;
// Existing accounts get the optional Help entry, without interrupting work.
export const ROLLOUT = '2026-09-08T12:00:00Z';
export type Role = 'ADMIN' | 'GERENCIA' | 'DEPOSITO' | 'CONSULTA';
export type LearningState = { version: number; started?: string; completed?: string; skipped?: string; hints?: Record<string, boolean> };
export function canOperate(role: string) { return ['ADMIN', 'GERENCIA', 'DEPOSITO'].includes(role); }
export function mergeState(a: LearningState, b: LearningState): LearningState {
  return { ...a, ...b, version: Math.max(a.version || 1, b.version || 1), started: a.started || b.started, completed: a.completed || b.completed, skipped: a.skipped || b.skipped, hints: { ...a.hints, ...b.hints } };
}
export function shouldStart(created: string, state: LearningState) { return Date.parse(created) >= Date.parse(ROLLOUT) && !state.completed && !state.skipped; }
export const hints: Record<string, string> = {
  movements: 'Desde aquí puedes consultar qué material se movió, cuándo y entre qué ubicaciones.',
  catalog: 'Busca por nombre o código para identificar un material. El catálogo incluye productos aunque no tengan stock.',
  work: 'Esta vista muestra únicamente los materiales de esta obra. Sus existencias se consultan por separado del depósito y de otras obras.',
};
export const steps = [
  { title: 'Bienvenido a Tecni Cristal', text: 'Inventario, obras y Catálogo Técnico en un mismo lugar. Consulta qué tenemos, dónde está cada material y qué movimientos se realizaron.', note: 'Lo esencial para empezar, en aproximadamente un minuto.' },
  { title: 'Cada material, en su ubicación', text: 'Consulta las existencias del depósito o entra a una obra para ver sus materiales de forma independiente.', note: 'Cada obra tiene su propio stock. Revisa también los materiales que requieren atención.' },
  { title: 'Realiza operaciones', text: 'Registra los movimientos de materiales. Cada operación queda registrada para poder revisar lo ocurrido.', note: 'Las compras pueden llegar al depósito o directamente a una obra.' },
  { title: 'Encuentra cualquier material', text: 'Busca por nombre o código. Revisa imágenes y características para identificar el producto, incluso cuando no tenga stock.', note: 'Primero identifica el material; después consulta cuánto hay y dónde está.' },
  { title: 'Controla lo que ocurre', text: 'Revisa los movimientos, el historial de los materiales y las situaciones que requieren atención.', note: 'Desde Inicio puedes acceder a las consultas y operaciones más utilizadas.' },
];
