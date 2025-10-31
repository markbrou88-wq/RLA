// src/lib/optimistic.js
export async function optimistic(action, { apply, rollback }) {
  try { apply?.(); return await action(); }
  catch (e) { rollback?.(); throw e; }
}
