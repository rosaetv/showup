// Unidades de peso (kg / lb).
// Todo se guarda en kg con precisión completa; solo se convierte para mostrar.
// Cada ejercicio recuerda la unidad que elegiste para él.

import { db } from "./db.js";
import { t } from "./i18n.js";

const KG_PER_LB = 0.45359237;

export async function getUnits() {
  return (await db.get("kv", "units")) || { default: "kg", byExercise: {} };
}

export async function setExerciseUnit(exerciseId, unit) {
  const units = await getUnits();
  units.byExercise[exerciseId] = unit;
  await db.put("kv", units, "units");
}

export async function setDefaultUnit(unit) {
  const units = await getUnits();
  units.default = unit;
  await db.put("kv", units, "units");
}

export const unitFor = (units, exerciseId) => units.byExercise[exerciseId] || units.default || "kg";

// ---------- Peso por lado (barra y Smith) ----------
// En barra es más fácil anotar lo que pones de cada lado (5 kg + 5 kg → "5").
// Por defecto se anota por lado; se puede cambiar por ejercicio a "total".
// El número se guarda tal cual lo anotas: la app solo cambia cómo lo explica
// y cuánto sugiere subir (la mitad, porque se sube de cada lado).

const PER_SIDE_EQUIPMENT = new Set(["barra", "smith"]);

export const canBePerSide = (exercise) => PER_SIDE_EQUIPMENT.has(exercise?.equipment);

export const isPerSide = (units, exercise) => canBePerSide(exercise) && (units.perSide?.[exercise.id] ?? true);

export async function setPerSide(exerciseId, perSide) {
  const units = await getUnits();
  units.perSide = { ...(units.perSide || {}), [exerciseId]: perSide };
  await db.put("kv", units, "units");
}

// "kg" o "kg por lado"
export const weightLabel = (unit, perSide) => (perSide ? t("units.perSide", { unit }) : unit);

// De la unidad mostrada a kg (para guardar).
export const toKg = (value, unit) => (unit === "lb" ? value * KG_PER_LB : value);

// De kg a la unidad mostrada: lb en pasos de 0,5; kg con hasta 2 decimales.
export function fromKg(kg, unit) {
  return unit === "lb" ? Math.round((kg / KG_PER_LB) * 2) / 2 : Math.round(kg * 100) / 100;
}

// Convierte una lista de series guardadas (kg) a la unidad mostrada.
export const setsInUnit = (sets, unit) => sets.map((s) => ({ ...s, weight: fromKg(s.weight, unit) }));

// 42.5 → "42.5" (punto decimal en ambos idiomas, como se usa en México).
// Al escribir, se aceptan punto o coma.
export function formatNumber(n) {
  return String(Math.round(n * 100) / 100);
}

// Selector "kg | lb". attrs: atributos extra para los botones (ej. data-ex="0").
export function unitToggle(current, action, attrs = "") {
  return `
    <span class="unit-toggle" role="group" aria-label="${t("units.label")}">
      ${["kg", "lb"]
        .map((u) => `<button type="button" data-action="${action}" data-unit="${u}" ${attrs} aria-pressed="${u === current}">${u}</button>`)
        .join("")}
    </span>`;
}
