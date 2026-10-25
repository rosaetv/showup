// Pestaña Historial: entrenamientos terminados por fecha, y el detalle de cada uno.

import { getWorkouts, getWorkout, deleteWorkout, getAllExercises } from "../store.js";
import { formatSets } from "./session.js";
import { getUnits, unitFor, setsInUnit, isPerSide, weightLabel } from "../units.js";
import { esc, icons, header, pageHeader, confirmSheet, toast, workoutDayLabel } from "../ui.js";
import { t, locale } from "../i18n.js";

export async function renderHistory(view) {
  const workouts = await getWorkouts();

  if (!workouts.length) {
    view.innerHTML = `
      ${pageHeader({ eyebrow: t("history.eyebrowEmpty"), title: t("tab.historial") })}
      <section class="card empty"><p>${t("history.empty")}</p></section>`;
    return;
  }

  // Agrupa por mes.
  const groups = new Map();
  for (const w of workouts) {
    const month = new Date(w.finishedAt).toLocaleDateString(locale(), { month: "long", year: "numeric" });
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(w);
  }

  view.innerHTML = `
    ${pageHeader({ eyebrow: t("history.count", { n: workouts.length }), title: t("tab.historial") })}
    ${[...groups.entries()]
      .map(
        ([month, list]) => `
      <h2 class="section-title">${capitalize(month)} · ${list.length}</h2>
      <div class="list">
        ${list
          .map((w) => {
            const date = new Date(w.finishedAt);
            const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
            return `
          <a class="list-row" href="#/historial/${w.id}">
            <span class="date-badge">
              <small>${date.toLocaleDateString(locale(), { weekday: "short" }).replace(".", "")}</small>
              <strong>${date.getDate()}</strong>
            </span>
            <span class="list-row-text">
              <strong>${esc(workoutDayLabel(w))}${w.deload ? ` <span class="deload-chip">${t("deload.tag")}</span>` : ""}${w.extra ? ` <span class="deload-chip">${t("core.extraTag")}</span>` : ""}</strong>
              <small>${t("history.meta", { exercises: w.exercises.length, sets, duration: duration(w) })}</small>
              ${w.records ? `<span class="pr-badge">${TROPHY}${t("record.count", { n: w.records })}</span>` : ""}
            </span>
            ${icons.chevron}
          </a>`;
          })
          .join("")}
      </div>`
      )
      .join("")}
  `;
}

export async function renderWorkout(view, id) {
  const workout = await getWorkout(id);
  if (!workout) {
    location.replace("#/historial");
    return;
  }
  const exercises = await getAllExercises();
  const units = await getUnits();
  const date = new Date(workout.finishedAt);

  view.innerHTML = `
    ${header({ back: "#/historial" })}
    <p class="eyebrow">${capitalize(date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</p>
    <h1 class="screen-title">${esc(workoutDayLabel(workout))}</h1>
    <p class="muted day-meta">${t("history.finishedAt", { time: date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) })} · ${duration(workout)}${workout.deload ? ` · ${t("deload.tag")}` : ""}</p>
    ${workout.exercises
      .map((e) => {
        const ex = exercises.find((x) => x.id === e.exerciseId);
        return `
      <article class="card">
        ${ex ? `<a class="ex-name" href="#/ejercicio/${ex.id}">${esc(ex.name)}</a>` : `<p class="ex-name">${esc(e.name)}</p>`}
        ${e.record || e.effort || e.added ? `<p class="logged-tags">${e.record ? `<span class="pr-badge">${TROPHY}${t("record.badge")}</span>` : ""}${e.added ? `<span class="tag tag-today">${t("session.addedTag")}</span>` : ""}${e.effort ? `<span class="tag">${t(`effort.${e.effort}`)}</span>` : ""}</p>` : ""}
        <div class="logged-sets">
          ${setsInUnit(e.sets, unitFor(units, e.exerciseId)).map((s, i) => `<span><small>${i + 1}</small>${formatSets([s], e.circuit ? { ...ex, timed: true } : ex, weightLabel(unitFor(units, e.exerciseId), isPerSide(units, ex)))}</span>`).join("")}
        </div>
      </article>`;
      })
      .join("")}
    <button class="btn btn-ghost-danger btn-spaced" data-action="delete">${t("history.delete")}</button>
  `;

  view.onclick = async (event) => {
    if (!event.target.closest('[data-action="delete"]')) return;
    const ok = await confirmSheet({
      title: t("history.deleteTitle"),
      text: t("history.deleteText"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await deleteWorkout(id);
    toast(t("history.deleted"));
    location.replace("#/historial");
  };
}

function duration(workout) {
  const minutes = Math.round((new Date(workout.finishedAt) - new Date(workout.startedAt)) / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const TROPHY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/></svg>';
