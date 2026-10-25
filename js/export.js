// "Exportar para Claude": un archivo entrenamiento.md con tablas Markdown.
//   - Plan actual: cada día con ejercicio, series × reps, peso actual y notas
//   - Sesiones de las últimas 4 semanas (o de siempre): fecha, día, ejercicio, series como "reps×kg"
//   - Progresión: peso de cada ejercicio en la primera y la última sesión del periodo
//   - Medidas del cuerpo, solo si lo eliges
// Siempre en español (textos, ejercicios, días y medidas), aunque la app esté en inglés.
// El respaldo JSON (Perfil → Sobre la app) sigue siendo aparte.

import { getPlan, getAllExercises, getWorkouts, getMeasurements, getLastPerformance, getNotes } from "./store.js";
import { getUnits, unitFor, fromKg, formatNumber, isPerSide } from "./units.js";
import { BODY_METRICS, DAY_TEMPLATES } from "./data/catalog.js";
import { EXERCISES } from "./data/exercises.js";
import { tIn } from "./i18n.js";

const t = (key, params) => tIn("es", key, params);
const SPANISH_NAMES = new Map(EXERCISES.map((e) => [e.id, e.name]));

// Nombre del día en español. Los planes antiguos solo guardan el nombre (ya en español).
const dayLabel = ({ template, suffix = "", name = "" }) =>
  template && DAY_TEMPLATES[template] ? `${t(`day.${template}`)}${suffix ? ` ${suffix}` : ""}` : name;

const WEEKS = 4;
const DAY = 86400000;

export const EXPORT_FILE = "entrenamiento.md";

const isoDate = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Una celda de tabla no puede llevar "|" ni saltos de línea.
const cell = (text) => String(text ?? "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ");
const row = (cells) => `| ${cells.map(cell).join(" | ")} |`;
const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)];

// Peso de trabajo: el más usado en la sesión (o el más alto si hay empate).
function workingWeight(sets) {
  const counts = new Map();
  for (const s of sets) counts.set(s.weight, (counts.get(s.weight) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** options: { allTime: todas las sesiones en vez de las últimas 4 semanas, body: incluir medidas } */
export async function routineText({ allTime = false, body = false } = {}) {
  const [plan, exercises, workouts, units, notes] = await Promise.all([getPlan(), getAllExercises(), getWorkouts(), getUnits(), getNotes()]);
  const byId = (id) => exercises.find((e) => e.id === id);
  // Ejercicios de la app con su nombre en español; los tuyos, como los escribiste.
  const nameOf = (id, fallback) => SPANISH_NAMES.get(id) || byId(id)?.name || fallback || t("common.deletedExercise");
  const noWeight = (ex) => ["peso_corporal", "banda"].includes(ex?.equipment);
  const repsLabel = (ex) => (ex?.timed ? "s" : t("session.reps"));
  // "10 kg", "22.5 lb"; sin peso: "Peso corporal" / "Banda".
  const weightText = (kg, id) => {
    const ex = byId(id);
    if (!(kg > 0)) return noWeight(ex) ? t(`export.noWeight.${ex.equipment}`) : "—";
    const unit = unitFor(units, id);
    return `${formatNumber(fromKg(kg, unit))} ${unit}${isPerSide(units, ex) ? ` ${t("export.perSide")}` : ""}`;
  };
  // Series como "12×10, 11×10" (reps × peso); sin peso, solo las repeticiones.
  const setsText = (sets, id, circuit = false) => {
    const unit = unitFor(units, id);
    const suffix = byId(id)?.timed || circuit ? " s" : "";
    const text = sets.map((s) => (s.weight > 0 ? `${s.reps}${suffix}×${formatNumber(fromKg(s.weight, unit))}` : `${s.reps}${suffix}`)).join(", ");
    if (!sets.some((s) => s.weight > 0)) return text;
    const perSide = isPerSide(units, byId(id));
    if (perSide) return `${text} (${unit} ${t("export.perSide")})`;
    return unit !== "kg" ? `${text} (${unit})` : text;
  };

  const lines = [`# ${t("export.title")}`];
  lines.push(
    [t("export.exported", { date: isoDate(Date.now()) }), plan && t("export.frequency", { n: plan.daysPerWeek, minutes: plan.minutes })].filter(Boolean).join(" · "),
    ""
  );
  // Si hay ejercicios de barra anotados por lado, se aclara para quien lea el archivo.
  const ids = new Set([...(plan?.days || []).flatMap((d) => d.items.map((i) => i.exerciseId)), ...workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))]);
  if ([...ids].some((id) => isPerSide(units, byId(id)))) lines.push(`> ${t("export.perSideNote")}`, "");

  // ---------- Plan actual ----------
  lines.push(`## ${t("export.plan")}`);
  if (!plan) lines.push("", t("export.noPlan"));
  for (const [i, day] of (plan?.days || []).entries()) {
    lines.push("", `### ${t("common.dayN", { n: i + 1 })} · ${dayLabel(day)}`, "");
    const rows = [];
    for (const item of day.items) {
      const ex = byId(item.exerciseId);
      const last = await getLastPerformance(item.exerciseId);
      const current = last ? weightText(workingWeight(last.sets), item.exerciseId) : t("export.notYet");
      const note = [
        item.finisher && t("closing.title"),
        item.group && t("superset.label", { letter: item.group }),
        last?.effort && `${t("export.effort")}: ${t(`effort.${last.effort}`)}`,
        notes[item.exerciseId],
      ]
        .filter(Boolean)
        .join(" · ");
      rows.push([nameOf(item.exerciseId), `${item.sets} × ${item.repMin}–${item.repMax} ${repsLabel(ex)}`, current, note]);
    }
    lines.push(...table([t("export.col.exercise"), t("export.col.setsReps"), t("export.col.current"), t("export.col.notes")], rows));
  }
  lines.push("");

  // ---------- Últimas 4 semanas ----------
  const since = allTime ? 0 : Date.now() - WEEKS * 7 * DAY;
  const recent = workouts.filter((w) => new Date(w.finishedAt) >= since).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  lines.push(`## ${allTime ? t("export.allSessions") : t("export.recent", { n: WEEKS })}`);
  if (!recent.length) lines.push("", t("export.noRecent"));
  else {
    const rows = recent.flatMap((w) =>
      w.exercises.map((e) => [
        isoDate(w.finishedAt),
        dayLabel({ template: w.dayTemplate, suffix: w.daySuffix, name: w.dayName }),
        `${nameOf(e.exerciseId, e.name)}${e.added ? ` (${t("export.addedToday")})` : ""}`,
        setsText(e.sets, e.exerciseId, e.circuit),
      ])
    );
    lines.push("", ...table([t("export.col.date"), t("export.col.day"), t("export.col.exercise"), t("export.col.sets")], rows));
  }
  lines.push("");

  // ---------- Progresión ----------
  lines.push(`## ${allTime ? t("export.progressAll") : t("export.progress")}`);
  const byExercise = new Map();
  for (const w of recent) {
    if (w.extra) continue;
    for (const e of w.exercises) {
      if (!e.sets.length) continue;
      if (!byExercise.has(e.exerciseId)) byExercise.set(e.exerciseId, []);
      byExercise.get(e.exerciseId).push(e);
    }
  }
  if (!byExercise.size) lines.push("", t("export.noRecent"));
  else {
    // Con peso: el peso más alto de la sesión. Sin peso: las repeticiones más altas.
    const mark = (e) => {
      const top = Math.max(...e.sets.map((s) => s.weight));
      if (top > 0) return weightText(top, e.exerciseId);
      return `${Math.max(...e.sets.map((s) => s.reps))} ${repsLabel(byId(e.exerciseId))}`;
    };
    const rows = [...byExercise].map(([id, entries]) => [nameOf(id, entries[0].name), mark(entries[0]), mark(entries.at(-1))]);
    lines.push("", ...table([t("export.col.exercise"), t("export.col.before"), t("export.col.now")], rows));
  }
  lines.push("");

  // ---------- Medidas (opcional) ----------
  if (body) {
    const measurements = await getMeasurements();
    const rows = [];
    for (const [key, { unit }] of Object.entries(BODY_METRICS)) {
      const metric = { label: t(`metric.${key}`), unit };
      const values = measurements.filter((m) => m.values[key] != null);
      if (!values.length) continue;
      const first = values[0];
      const latest = values.at(-1);
      rows.push([metric.label, `${formatNumber(latest.values[key])} ${metric.unit}`, latest.date, values.length > 1 ? `${formatNumber(first.values[key])} ${metric.unit} (${first.date})` : "—"]);
    }
    lines.push(`## ${t("profile.body")}`, "");
    if (rows.length) lines.push(...table([t("export.col.metric"), t("export.col.latest"), t("export.col.date"), t("export.col.first")], rows));
    else lines.push(t("profile.noRecords"));
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
