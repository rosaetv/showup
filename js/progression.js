// Sobrecarga progresiva con doble progresión:
// 1. Con el mismo peso, sube repeticiones hasta llegar al tope del rango en todas las series.
// 2. Cuando lo logras, sube el peso y vuelve al mínimo del rango.

import { t } from "./i18n.js";
import { formatNumber, weightLabel } from "./units.js";

// Cuánto subir según el equipo, en cada unidad.
const INCREMENTS = {
  kg: { barra: 2.5, smith: 2.5, maquina: 2.5, polea: 2.5, mancuernas: 2, kettlebell: 4, peso_corporal: 2.5 },
  lb: { barra: 5, smith: 5, maquina: 5, polea: 5, mancuernas: 5, kettlebell: 9, peso_corporal: 5 },
};

/**
 * exercise: ejercicio de la biblioteca
 * last: { sets: [{ weight, reps }], effort } de la última sesión (o null), con el peso YA en `unit`
 *   effort (opcional): "easy" | "ok" | "hard", cómo se sintió
 * range: { repMin, repMax, sets } objetivo actual
 * unit: "kg" o "lb"; el peso sugerido se devuelve en esa unidad
 * Devuelve { kind, weight, reps: [por serie], text, reason } o null si no hay historial.
 *   kind: "up" (sube peso), "reps" (sube repeticiones), "down" (baja peso), "top" (tope sin peso),
 *         "same" (repetir lo mismo porque se sintió pesado)
 *   reason: "hard" | "easy" si la sugerencia cambió por el esfuerzo marcado
 * perSide: true si el peso se anota por lado de la barra (sube la mitad de cada lado)
 */
export function suggestNext(exercise, last, range, unit = "kg", perSide = false) {
  if (!last?.sets.length) return null;
  const { repMin, repMax } = range;
  const plannedSets = range.sets || last.sets.length;
  const assisted = Boolean(exercise.assisted); // más peso = más ayuda
  const fullStep = INCREMENTS[unit][exercise.equipment] ?? INCREMENTS[unit].barra;
  const step = perSide ? fullStep / 2 : fullStep;
  const round = unit === "lb" ? (n) => Math.round(n * 2) / 2 : (n) => Math.round(n * 4) / 4;
  const w = (n) => `${formatNumber(n)} ${weightLabel(unit, perSide)}`;
  const timedStep = 5; // segundos

  // Peso de trabajo: el más usado en la sesión (o el más alto si hay empate).
  const weight = workingWeight(last.sets, assisted);
  const working = last.sets.filter((s) => s.weight === weight);
  const reachedTop = working.length >= plannedSets && working.every((s) => s.reps >= repMax);
  const average = working.reduce((n, s) => n + s.reps, 0) / working.length;
  const bodyweightOnly = exercise.equipment === "peso_corporal" && weight === 0;
  const band = exercise.equipment === "banda";

  // Se sintió pesado: no sube nada; repite lo mismo hasta que se sienta mejor.
  // (Si te quedaste lejos de la meta, abajo se sugiere bajar el peso como siempre.)
  const tooFar = average < repMin && weight > 0;
  if (last.effort === "hard" && !tooFar) {
    return {
      kind: "same",
      weight,
      reps: Array.from({ length: plannedSets }, (_, i) => working[i]?.reps ?? working.at(-1).reps),
      text: weight ? t("prog.sameHard", { weight: w(weight) }) : t("prog.sameHardNoWeight"),
      reason: "hard",
    };
  }

  if (reachedTop) {
    if (band) {
      return {
        kind: "top",
        weight,
        reps: Array(plannedSets).fill(repMin),
        text: t("prog.band"),
      };
    }
    if (bodyweightOnly || exercise.timed) {
      return {
        kind: "top",
        weight,
        reps: Array(plannedSets).fill(repMax),
        text: exercise.timed ? t("prog.topTime") : t("prog.topReps", { weight: w(step) }),
      };
    }
    const next = round(assisted ? Math.max(weight - step, 0) : weight + step);
    return {
      kind: "up",
      weight: next,
      reps: Array(plannedSets).fill(repMin),
      text: assisted ? t("prog.upAssisted", { weight: w(next) }) : t("prog.up", { weight: w(next) }),
    };
  }

  if (average < repMin && weight > 0) {
    const next = round(assisted ? weight + step : Math.max(weight - step, 0));
    return {
      kind: "down",
      weight: next,
      reps: Array(plannedSets).fill(repMin),
      text: t("prog.down", { weight: w(next) }),
    };
  }

  // Mismo peso, una repetición (o 5 segundos) más en cada serie que no llegó al tope.
  // Si se sintió fácil, el doble.
  const easy = last.effort === "easy";
  const add = (exercise.timed ? timedStep : 1) * (easy ? 2 : 1);
  const reps = Array.from({ length: plannedSets }, (_, i) => {
    const previous = working[i]?.reps ?? working.at(-1).reps;
    return Math.min(Math.max(previous + add, repMin), repMax);
  });
  if (working.every((s) => s.reps >= repMax)) {
    return {
      kind: "reps",
      weight,
      reps,
      text: weight ? t("prog.completeSetsWeight", { n: plannedSets, weight: w(weight) }) : t("prog.completeSets", { n: plannedSets }),
    };
  }
  return {
    kind: "reps",
    weight,
    reps,
    text: easy
      ? weight
        ? t(exercise.timed ? "prog.keepTimeEasy" : "prog.keepRepsEasy", { weight: w(weight) })
        : t(exercise.timed ? "prog.moreTimeEasy" : "prog.moreRepsEasy")
      : weight
        ? t(exercise.timed ? "prog.keepTime" : "prog.keepReps", { weight: w(weight) })
        : t(exercise.timed ? "prog.moreTime" : "prog.moreReps"),
    ...(easy && { reason: "easy" }),
  };
}

function workingWeight(sets, assisted) {
  const counts = new Map();
  for (const s of sets) counts.set(s.weight, (counts.get(s.weight) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (assisted ? a[0] - b[0] : b[0] - a[0]))[0][0];
}

/**
 * Sugerencia durante la semana de descarga: ~10% menos de peso y la meta mínima.
 * last: la última sesión normal (la descarga no cuenta para la progresión).
 */
export function deloadSuggestion(exercise, last, range, unit = "kg", perSide = false) {
  const reps = Array(range.sets).fill(range.repMin);
  if (!last?.sets.length) return { kind: "deload", weight: 0, reps, text: t("prog.deloadFirst") };
  const weight = workingWeight(last.sets, Boolean(exercise.assisted));
  const round = unit === "lb" ? (n) => Math.round(n * 2) / 2 : (n) => Math.round(n * 4) / 4;
  // En asistidas, descargar es MÁS ayuda.
  const next = weight ? round(exercise.assisted ? weight * 1.1 : weight * 0.9) : 0;
  return {
    kind: "deload",
    weight: next,
    reps,
    text: next ? t("prog.deload", { weight: `${formatNumber(next)} ${weightLabel(unit, perSide)}` }) : t("prog.deloadNoWeight"),
  };
}

/**
 * Meta de repeticiones como un solo número.
 * Con historial: la meta más alta que sugiere la progresión.
 * Sin historial: el mínimo del rango (8–12 → 8), para empezar con margen para progresar.
 */
export function targetReps(range, suggestion) {
  if (suggestion?.reps.length) return Math.max(...suggestion.reps);
  return range.repMin;
}
