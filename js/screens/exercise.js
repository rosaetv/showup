// Detalle de un ejercicio: músculos, cómo se hace, nota y alternativas.

import { getExercise, getAllExercises, getFavorites, toggleFavoriteExercise, toggleDislikedExercise, getNotes, getPlan, deleteCustomExercise, getExerciseHistory } from "../store.js";
import { suggestNext } from "../progression.js";
import { bestMarks } from "../records.js";
import { lineChart, bindCharts } from "../chart.js";
import { formatSets, suggestionIcon } from "./session.js";
import { getUnits, setExerciseUnit, unitFor, setsInUnit, formatNumber, unitToggle, isPerSide, weightLabel } from "../units.js";
import { PATTERNS } from "../data/catalog.js";
import { findAlternatives } from "../generator.js";
import { editNote } from "./day.js";
import { esc, icons, header, equipmentName, muscleName, confirmSheet, toast } from "../ui.js";
import { t, locale } from "../i18n.js";

export async function renderExercise(view, id) {
  const exercise = await getExercise(id);
  if (!exercise) {
    view.innerHTML = `${header({ back: "#/ejercicios" })}<p class="empty">${t("exercise.missing")}</p>`;
    return;
  }
  const favorites = await getFavorites();
  const notes = await getNotes();
  const note = notes[id];
  const fav = favorites.exercises.includes(id);
  const disliked = favorites.disliked.includes(id);
  const alternatives = findAlternatives(exercise, await getAllExercises()).slice(0, 8);
  const progress = await progressSection(exercise);

  const tagList = (list, accent) =>
    list.length ? list.map((m) => `<span class="tag ${accent ? "tag-accent" : ""}">${muscleName(m)}</span>`).join("") : `<span class="muted">—</span>`;

  view.innerHTML = `
    ${header({
      back: "javascript:history.back()",
      action: `<span class="head-actions">
        <button class="icon-btn dislike ${disliked ? "on" : ""}" data-action="dislike" aria-label="${t("exercise.dislike")}" aria-pressed="${disliked}">${disliked ? icons.thumbDownFilled : icons.thumbDown}</button>
        <button class="icon-btn star ${fav ? "on" : ""}" data-action="star" aria-label="${t("exercise.favorite")}" aria-pressed="${fav}">${fav ? icons.starFilled : icons.star}</button>
      </span>`,
    })}
    <h1 class="screen-title">${esc(exercise.name)}</h1>
    <div class="tags">
      <span class="tag tag-outline">${equipmentName(exercise.equipment)}</span>
      ${PATTERNS[exercise.pattern] ? `<span class="tag tag-outline">${PATTERNS[exercise.pattern]}</span>` : ""}
      ${exercise.custom ? `<span class="tag tag-outline">${t("exercise.custom")}</span>` : ""}
      ${disliked ? `<span class="tag tag-dislike">${t("exercise.dislikedTag")}</span>` : ""}
    </div>

    <h2 class="section-title">${t("exercise.primary")}</h2>
    <div class="tags">${tagList(exercise.primary, true)}</div>
    <h2 class="section-title">${t("exercise.secondary")}</h2>
    <div class="tags">${tagList(exercise.secondary)}</div>

    <h2 class="section-title">${t("exercise.howTo")}</h2>
    <section class="card prose">
      ${exercise.description ? `<p>${esc(exercise.description)}</p>` : `<p class="muted">${t("exercise.noDescription")}</p>`}
      ${exercise.steps?.length ? `<ol>${exercise.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      ${exercise.tip ? `<p class="tip"><strong>${t("exercise.tip")}</strong> ${esc(exercise.tip)}</p>` : ""}
      <a class="btn btn-secondary youtube-btn" target="_blank" rel="noopener"
        href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} ${t("exercise.youtubeQuery")}`)}">
        ${icons.play} ${t("exercise.youtube")}
      </a>
    </section>

    <h2 class="section-title">${t("exercise.myNote")}</h2>
    <button class="card note-card" data-action="note">
      ${icons.pencil}
      <span class="${note ? "" : "muted"}">${note ? esc(note) : t("exercise.addNote")}</span>
    </button>

    ${progress}

    <h2 class="section-title">${t("exercise.alternatives")}</h2>
    <div class="list">
      ${alternatives
        .map(
          ({ exercise: e, reason }) => `
        <a class="list-row" href="#/ejercicio/${e.id}">
          <span class="list-row-text">
            <strong>${esc(e.name)}</strong>
            <small>${reason} · ${equipmentName(e.equipment)}</small>
          </span>
          ${icons.chevron}
        </a>`
        )
        .join("")}
    </div>

    ${exercise.custom
      ? `<div class="stack btn-spaced">
           <a class="btn btn-secondary" href="#/ejercicio/${id}/editar">${t("exercise.edit")}</a>
           <button class="btn btn-ghost-danger" data-action="delete">${t("exercise.delete")}</button>
         </div>`
      : ""}
  `;

  bindCharts(view);

  view.onclick = async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "star") {
      const on = await toggleFavoriteExercise(id);
      toast(on ? t("exercise.favAdded") : t("exercise.favRemoved"));
      renderExercise(view, id);
    } else if (action === "dislike") {
      const on = await toggleDislikedExercise(id);
      toast(on ? t("exercise.dislikeAdded") : t("exercise.dislikeRemoved"));
      renderExercise(view, id);
    } else if (action === "note") {
      editNote(exercise, note || "", () => renderExercise(view, id));
    } else if (action === "unit") {
      await setExerciseUnit(id, event.target.closest("[data-unit]").dataset.unit);
      const y = window.scrollY;
      await renderExercise(view, id);
      window.scrollTo(0, y);
    } else if (action === "delete") {
      const plan = await getPlan();
      if (plan?.days.some((d) => d.items.some((i) => i.exerciseId === id))) {
        toast(t("exercise.inPlan"));
        return;
      }
      const ok = await confirmSheet({
        title: t("exercise.deleteTitle"),
        text: t("exercise.deleteText", { name: exercise.name }),
        confirmLabel: t("common.delete"),
        danger: true,
      });
      if (!ok) return;
      await deleteCustomExercise(id);
      toast(t("exercise.deleted"));
      location.replace("#/ejercicios");
    }
  };
}

// ---------- Progreso ----------

async function progressSection(exercise) {
  const units = await getUnits();
  const weightUnit = unitFor(units, exercise.id);
  const perSide = isPerSide(units, exercise);
  const label = weightLabel(weightUnit, perSide); // "kg" o "kg por lado"
  const title = `
    <div class="title-row section-row">
      <h2 class="section-title">${t("exercise.progress")}</h2>
      ${exercise.timed ? "" : unitToggle(weightUnit, "unit")}
    </div>`;
  // Las series guardadas están en kg; aquí se muestran en la unidad elegida.
  const history = (await getExerciseHistory(exercise.id)).map((h) => ({ ...h, sets: setsInUnit(h.sets, weightUnit) }));
  if (!history.length) {
    return `
      ${title}
      <section class="card"><p class="muted no-margin">${t("exercise.noProgress")}</p></section>`;
  }

  // El rango objetivo: el de tu plan si está en él; si no, el de la última sesión.
  const plan = await getPlan();
  const planItem = plan?.days.flatMap((d) => d.items).find((i) => i.exerciseId === exercise.id);
  const last = history.at(-1);
  const range = planItem || { repMin: last.repMin, repMax: last.repMax, sets: last.sets.length };
  const suggestion = suggestNext(exercise, last, range, weightUnit, perSide);

  // Si nunca usó peso, se grafica el máximo de repeticiones (o segundos).
  const usesWeight = history.some((h) => h.sets.some((s) => s.weight > 0));
  const unit = exercise.timed ? "s" : "reps";
  const points = history.slice(-12).map((h) => ({
    y: usesWeight ? Math.max(...h.sets.map((s) => s.weight)) : Math.max(...h.sets.map((s) => s.reps)),
    label: shortDate(h.date),
  }));
  const format = usesWeight ? (v) => `${formatNumber(v)} ${label}` : (v) => `${Math.round(v)} ${unit}`;

  // Récords (no aplican a ejercicios asistidos: ahí menos peso es más difícil).
  const best = exercise.assisted ? null : bestMarks(history);
  const mark = (set) => formatSets([set], exercise, label);
  const records = best
    ? `
    <h2 class="section-title">${t("record.title")}</h2>
    <section class="card records-card">
      ${usesWeight
        ? `<div><strong>${formatNumber(best.heaviest.weight)} ${label}</strong><small>${t("record.heaviest", { reps: best.heaviest.reps, date: shortDate(best.heaviest.date) })}</small></div>`
        : ""}
      <div><strong>${exercise.timed ? `${best.mostReps.reps} s` : t("record.reps", { n: best.mostReps.reps })}</strong><small>${usesWeight ? t("record.mostRepsWith", { set: mark(best.mostReps), date: shortDate(best.mostReps.date) }) : t("record.mostReps", { date: shortDate(best.mostReps.date) })}</small></div>
    </section>`
    : "";

  return `
    ${title}
    ${records}
    ${suggestion ? `
    <section class="card next-time">
      <p class="eyebrow">${t("exercise.nextTime")}</p>
      <p class="suggestion suggestion-${suggestion.kind}">${suggestionIcon(suggestion.kind)}<span>${suggestion.text}</span></p>
      ${suggestion.reason ? `<p class="why">${t(`prog.why.${suggestion.reason}`)}</p>` : ""}
      <p class="muted no-margin">${t("exercise.target")} ${formatSets(suggestion.reps.map((reps) => ({ weight: suggestion.weight, reps })), exercise, label)}</p>
    </section>` : ""}
    <section class="card chart-card">
      <p class="chart-title">${usesWeight ? t("exercise.chartWeight") : exercise.timed ? t("exercise.chartTime") : t("exercise.chartReps")}</p>
      ${lineChart(points, format)}
    </section>
    <div class="list history-list">
      ${history
        .slice(-8)
        .reverse()
        .map(
          (h) => `
        <a class="list-row" href="#/historial/${h.workoutId}">
          <span class="list-row-text">
            <strong>${formatSets(h.sets, exercise, label)}</strong>
            <small>${longDate(h.date)}</small>
          </span>
        </a>`
        )
        .join("")}
    </div>`;
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
const longDate = (iso) => new Date(iso).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
