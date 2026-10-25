// Entrenamiento en curso: registrar peso y repeticiones de cada serie.

import {
  getActiveWorkout, saveActiveWorkout, clearActiveWorkout, saveWorkout, getWorkouts,
  getLastPerformance, getExerciseHistory, getAllExercises, getNotes, getPlan, savePlan, getProfile,
} from "../store.js";
import { getPeriods, activePeriod } from "../period.js";
import { blocks, pairRest } from "../supersets.js";
import { bestMarks, sessionRecord } from "../records.js";
import { checkGoals } from "../goals.js";
import { CORE_DIY_REST } from "../data/core-diy.js";
import { celebrate } from "./goals.js";
import { makeItem } from "../generator.js";
import { suggestNext, targetReps, deloadSuggestion } from "../progression.js";
import { getDeload, isDeloadActive, deloadSets } from "../deload.js";
import { t } from "../i18n.js";
import { chooseAlternative, editNote } from "./day.js";
import { esc, icons, closingHeader, formatDose, formatRest, openSheet, confirmSheet, toast, dayLabel, workoutDayLabel } from "../ui.js";
import { getUnits, setExerciseUnit, unitFor, toKg, fromKg, setsInUnit, formatNumber, unitToggle, canBePerSide, isPerSide, setPerSide, weightLabel } from "../units.js";

// ---------- Empezar ----------

export async function startWorkout(plan, dayIndex) {
  const active = await getActiveWorkout();
  if (active && active.dayIndex === dayIndex) {
    location.hash = "#/entrenando";
    return;
  }
  if (active) {
    const ok = await confirmSheet({
      title: t("session.ongoingTitle"),
      text: t("session.ongoingText", { name: workoutDayLabel(active) }),
      confirmLabel: t("session.ongoingConfirm"),
      danger: true,
    });
    if (!ok) return;
  }
  const day = plan.days[dayIndex];
  const units = await getUnits();
  // En semana de descarga: menos series.
  const deload = isDeloadActive(await getDeload());
  const setsFor = (n) => (deload ? deloadSets(n) : n);
  // Durante el período se muestra un recordatorio amable.
  const period = Boolean((await getProfile()).trackPeriod && activePeriod(await getPeriods()));
  await saveActiveWorkout({
    id: Date.now().toString(36),
    dayIndex,
    dayName: dayLabel(day),
    dayTemplate: day.template,
    daySuffix: day.suffix,
    deload,
    period,
    goal: plan.goal,
    goalPerWeek: plan.daysPerWeek,
    startedAt: new Date().toISOString(),
    exercises: day.items.map((item) => ({
      exerciseId: item.exerciseId,
      repMin: item.repMin,
      repMax: item.repMax,
      rest: item.rest,
      ...(item.group && { group: item.group }),
      ...(item.finisher && { finisher: true }),
      plannedSets: setsFor(item.sets),
      unit: unitFor(units, item.exerciseId),
      sets: Array.from({ length: setsFor(item.sets) }, emptySet),
    })),
  });
  location.hash = "#/entrenando";
}

// Core DIY: un circuito de core en el mat. Es un extra (no cuenta para la meta ni mueve el plan).
export async function startCoreCircuit({ ids, rounds, seconds }) {
  const active = await getActiveWorkout();
  if (active?.extra === "core") {
    location.hash = "#/entrenando";
    return;
  }
  if (active) {
    const ok = await confirmSheet({
      title: t("session.ongoingTitle"),
      text: t("session.ongoingText", { name: workoutDayLabel(active) }),
      confirmLabel: t("session.ongoingConfirm"),
      danger: true,
    });
    if (!ok) return;
  }
  const units = await getUnits();
  await saveActiveWorkout({
    id: Date.now().toString(36),
    extra: "core",
    dayName: "Core DIY",
    startedAt: new Date().toISOString(),
    exercises: ids.map((exerciseId) => ({
      exerciseId,
      repMin: seconds,
      repMax: seconds,
      rest: CORE_DIY_REST,
      group: "circuit",
      seconds,
      plannedSets: rounds,
      unit: unitFor(units, exerciseId),
      sets: Array.from({ length: rounds }, emptySet),
    })),
  });
  location.hash = "#/entrenando";
}

const emptySet = () => ({ weight: "", reps: "", done: false });

// ---------- Pantalla ----------

export async function renderSession(view) {
  const active = await getActiveWorkout();
  if (!active) {
    location.replace("#/entrenar");
    return;
  }
  const exercises = await getAllExercises();
  const byId = (id) => exercises.find((e) => e.id === id);
  let notes = await getNotes();
  let units = await getUnits();
  const last = {};
  const bests = {}; // récords anteriores de cada ejercicio (en kg)
  const loadLast = async () => {
    for (const e of active.exercises) {
      last[e.exerciseId] = await getLastPerformance(e.exerciseId);
      bests[e.exerciseId] = bestMarks(await getExerciseHistory(e.exerciseId));
    }
  };
  await loadLast();
  document.body.classList.add("focus-mode");

  // El encabezado fijo es transparente arriba del todo y toma fondo al desplazarse.
  const updateHeader = () => view.querySelector(".session-header")?.classList.toggle("scrolled", window.scrollY > 4);
  window.onscroll = updateHeader;

  const draw = () => {
    const y = window.scrollY;
    view.innerHTML = template(active, byId, last, notes, bests, units);
    window.scrollTo(0, y);
    updateHeader();
  };
  draw();

  const save = () => saveActiveWorkout(active);

  view.oninput = (event) => {
    const input = event.target.closest(".set-input");
    if (!input) return;
    const set = active.exercises[input.dataset.ex].sets[input.dataset.set];
    set[input.dataset.field] = input.value.trim();
    save();
  };

  view.onclick = async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action } = target.dataset;
    const ei = Number(target.dataset.ex);
    const entry = active.exercises[ei];

    if (action === "check") {
      const si = Number(target.dataset.set);
      const set = entry.sets[si];
      if (set.done) {
        set.done = false;
      } else {
        const row = target.closest(".set-row");
        const weightInput = row.querySelector('[data-field="weight"]');
        const repsInput = row.querySelector('[data-field="reps"]');
        const weight = weightInput.value.trim() || numericPlaceholder(weightInput);
        const reps = repsInput.value.trim() || numericPlaceholder(repsInput);
        // Con peso corporal o banda, el peso es opcional.
        const bodyweight = ["peso_corporal", "banda"].includes(byId(entry.exerciseId)?.equipment);
        if (!isNumber(reps) || toNumber(reps) <= 0) return toast(t("session.needReps"));
        if (!bodyweight && !isNumber(weight)) return toast(t("session.needWeight"));
        set.weight = weight;
        set.reps = reps;
        set.done = true;
      }
      document.activeElement?.blur();
      await save();
      draw();
      // Metas de fuerza: se celebran en cuanto haces la serie.
      if (set.done) celebrate(await checkGoals({ workouts: [...(await getWorkouts()), asWorkout(active)] }));
    } else if (action === "effort") {
      // Tocar la opción marcada la quita.
      entry.effort = entry.effort === target.dataset.value ? undefined : target.dataset.value;
      await save();
      draw();
    } else if (action === "side") {
      const perSide = target.dataset.value === "side";
      if (perSide === isPerSide(units, byId(entry.exerciseId))) return;
      await setPerSide(entry.exerciseId, perSide);
      units = await getUnits();
      toast(t("units.sideChanged"));
      draw();
    } else if (action === "unit") {
      const from = entry.unit || "kg";
      const to = target.dataset.unit;
      if (from === to) return;
      // Convierte lo que ya escribiste a la nueva unidad.
      for (const set of entry.sets) {
        if (isNumber(set.weight)) set.weight = formatNumber(fromKg(toKg(toNumber(set.weight), from), to));
      }
      entry.unit = to;
      await setExerciseUnit(entry.exerciseId, to);
      await save();
      draw();
    } else if (action === "add-set") {
      entry.sets.push(emptySet());
      await save();
      draw();
    } else if (action === "remove-set") {
      if (entry.sets.length > 1 && !entry.sets.at(-1).done) entry.sets.pop();
      await save();
      draw();
    } else if (action === "note") {
      const exercise = byId(entry.exerciseId);
      editNote(exercise, notes[exercise.id] || "", async () => {
        notes = await getNotes();
        draw();
      });
    } else if (action === "swap") {
      const plan = await getPlan();
      chooseAlternative(byId(entry.exerciseId), exercises, plan?.excludedEquipment || [], plan?.care || [], (chosen) =>
        swapExercise(active, ei, chosen, plan, async () => {
          await save();
          await loadLast();
          draw();
        })
      );
    } else if (action === "finish") {
      await finish(active, byId);
    } else if (action === "discard") {
      const ok = await confirmSheet({
        title: t("session.discardTitle"),
        text: t("session.discardText"),
        confirmLabel: t("session.discardConfirm"),
        danger: true,
      });
      if (!ok) return;
      await clearActiveWorkout();
      toast(t("session.discarded"));
      location.hash = "#/entrenar";
    }
  };
}

function template(active, byId, last, notes, bests, units) {
  const total = active.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  // Superseries: A1, A2... en las parejas; número normal en el resto.
  const labels = [];
  let soloNumber = 0;
  for (const { group, entries } of blocks(active.exercises))
    entries.forEach(({ index }, n) => (labels[index] = group === "circuit" ? n + 1 : group ? `${group}${n + 1}` : ++soloNumber));

  const cardHtml = active.exercises
    .map((entry, ei) => {
      const ex = byId(entry.exerciseId) || { id: entry.exerciseId, name: t("common.deletedExercise"), equipment: "", primary: [], secondary: [] };
      const unit = entry.unit || "kg";
      const perSide = isPerSide(units, ex);
      const label = weightLabel(unit, perSide); // "kg" o "kg por lado"
      const stored = last[entry.exerciseId];
      const previous = stored ? { ...stored, sets: setsInUnit(stored.sets, unit) } : null;
      const range = { repMin: entry.repMin, repMax: entry.repMax, sets: entry.plannedSets || entry.sets.length };
      const suggestion = entry.seconds ? null : active.deload ? deloadSuggestion(ex, previous, range, unit, perSide) : suggestNext(ex, previous, range, unit, perSide);
      const note = notes[ex.id];
      const bodyweight = ex.equipment === "peso_corporal";
      const allDone = entry.sets.every((s) => s.done);

      const rows = entry.sets
        .map((set, si) => {
          const prevSet = previousDoneSet(entry.sets, si);
          const lastSet = previous?.sets[si] || previous?.sets.at(-1);
          // Sugerencias en gris: lo que ya hiciste hoy, la progresión sugerida o la última vez.
          const weightHint = prevSet?.weight || (suggestion ? formatNumber(suggestion.weight) : lastSet ? formatNumber(lastSet.weight) : bodyweight ? "0" : "");
          const repsHint = entry.seconds || (suggestion?.reps[si] ?? (prevSet?.reps || (lastSet ? lastSet.reps : targetReps(entry))));
          return `
          <div class="set-row ${set.done ? "done" : ""}">
            <span class="set-num">${si + 1}</span>
            <input class="input set-input" data-ex="${ei}" data-set="${si}" data-field="weight" inputmode="decimal"
              placeholder="${esc(weightHint)}" value="${esc(set.weight)}" aria-label="${t("session.weightLabel", { n: si + 1 })}" />
            <input class="input set-input" data-ex="${ei}" data-set="${si}" data-field="reps" inputmode="numeric"
              placeholder="${esc(repsHint)}" value="${esc(set.reps)}" aria-label="${t("session.repsLabel", { n: si + 1 })}" />
            <button class="check" data-action="check" data-ex="${ei}" data-set="${si}" aria-pressed="${set.done}" aria-label="${t("session.doneLabel", { n: si + 1 })}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            </button>
          </div>`;
        })
        .join("");

      return `
        <article class="card ex-card ${allDone ? "ex-complete" : ""}">
          <div class="ex-head">
            <a class="ex-name" href="#/ejercicio/${ex.id}"><span class="ex-index ${entry.group ? "pair" : ""}">${labels[ei]}</span>${esc(ex.name)}</a>
            <button class="icon-btn ${note ? "has-note" : ""}" data-action="note" data-ex="${ei}" aria-label="${t("note.label")}">${icons.pencil}</button>
          </div>
          <p class="ex-dose">${entry.seconds ? t("core.dose", { rounds: entry.sets.length, seconds: entry.seconds }) : formatDose({ ...entry, sets: entry.sets.length }, ex, targetReps(entry, suggestion), !entry.group)}</p>
          ${entry.seconds ? "" : `<p class="last">${previous ? `<strong>${t("session.lastTime")}</strong> ${formatSets(previous.sets, ex, label)}` : t("session.firstTime")}</p>`}
          ${suggestion ? `<p class="suggestion suggestion-${suggestion.kind}">${suggestionIcon(suggestion.kind)}<span>${esc(suggestion.text)}</span></p>` : ""}
          ${suggestion?.reason ? `<p class="why">${t(`prog.why.${suggestion.reason}`)}</p>` : ""}
          ${recordLine(entryRecord(entry, ex, bests[entry.exerciseId]), ex, unit, label)}
          ${note ? `<p class="ex-note" data-action="note" data-ex="${ei}">${esc(note)}</p>` : ""}
          ${canBePerSide(ex) && !entry.seconds ? sideToggle(perSide, ei) : ""}
          <div class="sets">
            <div class="set-row set-head">
              <span>${t("session.set")}</span>${unitToggle(unit, "unit", `data-ex="${ei}"`)}<span>${ex.timed || entry.seconds ? t("session.sec") : t("session.reps")}</span><span></span>
            </div>
            ${rows}
          </div>
          ${allDone ? effortPicker(entry, ei) : ""}
          <div class="ex-actions">
            <button class="btn-small" data-action="add-set" data-ex="${ei}">${icons.plus} ${t("session.set")}</button>
            ${entry.sets.length > 1 && !entry.sets.at(-1).done ? `<button class="btn-small" data-action="remove-set" data-ex="${ei}" aria-label="${t("session.removeSet")}">− ${t("session.set")}</button>` : ""}
            <button class="btn-small" data-action="swap" data-ex="${ei}">${icons.swap} ${t("common.swap")}</button>
          </div>
        </article>`;
    });

  // Título "Cierre" antes del primer ejercicio del cierre.
  let closingShown = false;
  const closingFor = (entries) => {
    if (!entries[0].item.finisher || closingShown) return "";
    closingShown = true;
    return closingHeader();
  };
  const cards = blocks(active.exercises)
    .map(({ group, entries }) => {
      const closing = closingFor(entries);
      if (!group) return closing + entries.map(({ index }) => cardHtml[index]).join("");
      const circuit = group === "circuit";
      const step = nextStep(entries, byId, circuit);
      const rounds = Math.max(...entries.map(({ item }) => item.sets.length));
      const round = t("superset.round", { n: step ? step.round + 1 : rounds, total: rounds });
      return `${closing}
        <div class="ss-group">
          <p class="ss-label"><span>${circuit ? t("core.roundLabel", { round }) : `${t("superset.label", { letter: group })} · ${round}`}</span><span>${formatRest(pairRest(entries.map((e) => e.item)))}</span></p>
          ${entries.map(({ index }) => `${step?.hint && step.index === index ? step.hint : ""}${cardHtml[index]}`).join("")}
        </div>`;
    })
    .join("");

  return `
    <div class="session-header">
      <header class="topbar">
        <a class="icon-btn" href="#/entrenar" aria-label="${t("session.backLabel")}">${icons.back}</a>
        <span class="topbar-title">${esc(workoutDayLabel(active))}${active.deload ? `<small class="deload-chip">${t("deload.tag")}</small>` : ""}</span>
        <span class="topbar-count" aria-label="${t("home.setsDone", { done, total })}">${done}/${total}</span>
      </header>
      <div class="session-progress"><span style="width:${total ? (done / total) * 100 : 0}%"></span></div>
    </div>
    ${active.period ? `<p class="period-note">${t("period.sessionNote")}</p>` : ""}
    ${cards}
    <button class="btn btn-ghost-danger btn-spaced" data-action="discard">${t("session.discard")}</button>
    <div class="bottom-bar">
      <button class="btn btn-primary" data-action="finish">${t("session.finish")}</button>
    </div>
  `;
}

// ---------- Cambiar ejercicio durante la sesión ----------

function swapExercise(active, ei, chosen, plan, onDone) {
  const entry = active.exercises[ei];
  const item = makeItem(chosen, active.goal, ei, plan || {});
  const originalId = entry.exerciseId;

  const apply = async (alsoInPlan) => {
    active.exercises[ei] = {
      exerciseId: chosen.id,
      repMin: item.repMin,
      repMax: item.repMax,
      rest: item.rest,
      ...(entry.group && { group: entry.group }),
      ...(entry.finisher && { finisher: true }),
      plannedSets: entry.finisher ? entry.plannedSets : item.sets,
      unit: unitFor(await getUnits(), chosen.id),
      sets: entry.sets.map(emptySet),
    };
    if (alsoInPlan && plan) {
      const day = plan.days[active.dayIndex];
      const index = day?.items.findIndex((i) => i.exerciseId === originalId) ?? -1;
      if (index >= 0) {
        const { group, extra, finisher, sets } = day.items[index];
        day.items[index] = { ...makeItem(chosen, plan.goal, index, plan), ...(group && { group }), ...(extra && { extra }), ...(finisher && { finisher, sets }) };
        if (day.originalOrder) day.originalOrder = day.originalOrder.map((id) => (id === originalId ? chosen.id : id));
        await savePlan(plan);
      }
    }
    toast(alsoInPlan ? t("session.swappedPlan") : t("session.swappedToday"));
    await onDone();
  };

  const close = openSheet({
    title: t("session.swapTitle", { name: chosen.name }),
    body: `
      <p class="sheet-text">${t("session.swapText")}</p>
      <div class="stack">
        <button class="btn btn-primary" data-today>${t("session.swapToday")}</button>
        <button class="btn btn-secondary" data-plan>${t("session.swapPlan")}</button>
      </div>`,
    onMount: (sheet) => {
      sheet.querySelector("[data-today]").onclick = () => { close(); apply(false); };
      sheet.querySelector("[data-plan]").onclick = () => { close(); apply(true); };
    },
  });
}

// ---------- Terminar ----------

async function finish(active, byId) {
  const total = active.exercises.reduce((n, e) => n + e.sets.length, 0);
  const done = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  if (done === 0) {
    const ok = await confirmSheet({
      title: t("session.noSetsTitle"),
      text: t("session.noSetsText"),
      confirmLabel: t("session.discardConfirm"),
      danger: true,
    });
    if (ok) {
      await clearActiveWorkout();
      location.hash = "#/entrenar";
    }
    return;
  }

  const ok = await confirmSheet({
    title: t("session.finishTitle"),
    text: done < total ? t("session.finishPartial", { done, total }) : t("session.finishAll", { total }),
    confirmLabel: t("session.finishConfirm"),
  });
  if (!ok) return;

  // Récords de hoy (contra todo lo anterior).
  const records = new Set();
  for (const e of active.exercises) {
    if (entryRecord(e, byId(e.exerciseId), bestMarks(await getExerciseHistory(e.exerciseId)))) records.add(e);
  }

  await saveWorkout({
    id: active.id,
    ...(active.extra && { extra: active.extra }),
    dayIndex: active.dayIndex,
    dayName: active.dayName,
    dayTemplate: active.dayTemplate,
    daySuffix: active.daySuffix,
    deload: Boolean(active.deload),
    goal: active.goal,
    goalPerWeek: active.goalPerWeek,
    startedAt: active.startedAt,
    finishedAt: new Date().toISOString(),
    exercises: active.exercises
      .map((e) => ({
        exerciseId: e.exerciseId,
        name: byId(e.exerciseId)?.name || t("common.deletedExercise"),
        repMin: e.repMin,
        repMax: e.repMax,
        // El peso se guarda siempre en kg.
        sets: e.sets
          .filter((s) => s.done)
          .map((s) => ({ weight: Math.round(toKg(toNumber(s.weight) || 0, e.unit || "kg") * 10000) / 10000, reps: toNumber(s.reps) })),
        ...(e.effort && { effort: e.effort }),
        ...(e.seconds && { circuit: true }),
        ...(records.has(e) && { record: true }),
      }))
      .filter((e) => e.sets.length),
    records: records.size,
  });

  // La rotación sigue con el día siguiente al que acabas de hacer.
  const plan = await getPlan();
  if (plan && !active.extra) {
    plan.nextDay = (active.dayIndex + 1) % plan.days.length;
    await savePlan(plan);
  }
  await clearActiveWorkout();
  toast(records.size ? t("session.savedRecords", { n: records.size }) : t("session.saved"));
  location.hash = "#/entrenar";
  // Metas de constancia (la semana cuenta al guardar el entrenamiento).
  celebrate(await checkGoals());
}

// El entrenamiento en curso como si estuviera guardado (pesos en kg), para revisar metas.
function asWorkout(active) {
  return {
    finishedAt: new Date().toISOString(),
    exercises: active.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.filter((s) => s.done).map((s) => ({ weight: toKg(toNumber(s.weight) || 0, e.unit || "kg"), reps: toNumber(s.reps) })),
    })),
  };
}

// ---------- Récords y esfuerzo ----------

const TROPHY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3"/></svg>';

// Récord de un ejercicio con las series hechas hoy (o null).
function entryRecord(entry, exercise, best) {
  if (entry.seconds) return null; // Core DIY se registra en segundos: no se compara con tus series
  const unit = entry.unit || "kg";
  const sets = entry.sets
    .filter((s) => s.done)
    .map((s) => ({ weight: toKg(toNumber(s.weight) || 0, unit), reps: toNumber(s.reps) }));
  return sessionRecord(exercise, sets, best);
}

function recordLine(record, exercise, unit, label = unit) {
  if (!record) return "";
  const format = (set) => formatSets(setsInUnit([set], unit), exercise, label);
  return `<p class="pr-line" role="status">${TROPHY}<span>${t("record.new", { now: format(record.set), before: format(record.previous) })}</span></p>`;
}

// Barra y Smith: ¿el peso que anotas es lo de un lado o el total?
function sideToggle(perSide, ei) {
  return `
    <div class="side-row">
      <span>${perSide ? t("units.sideHint") : t("units.totalHint")}</span>
      <span class="unit-toggle" role="group" aria-label="${t("units.sideLabel")}">
        <button type="button" data-action="side" data-ex="${ei}" data-value="side" aria-pressed="${perSide}">${t("units.side")}</button>
        <button type="button" data-action="side" data-ex="${ei}" data-value="total" aria-pressed="${!perSide}">${t("units.total")}</button>
      </span>
    </div>`;
}

function effortPicker(entry, ei) {
  const options = ["easy", "ok", "hard"];
  return `
    <div class="effort">
      <p>${t("effort.question")}</p>
      <div class="effort-options" role="group" aria-label="${t("effort.question")}">
        ${options.map((value) => `<button type="button" data-action="effort" data-ex="${ei}" data-value="${value}" aria-pressed="${entry.effort === value}">${t(`effort.${value}`)}</button>`).join("")}
      </div>
    </div>`;
}

// ---------- Utilidades ----------

export function suggestionIcon(kind) {
  const paths = { up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6", reps: "M5 12h14M12 5v14", top: "M5 13l4 4L19 7", deload: "M9 6v12M15 6v12", same: "M5 9h14M5 15h14" };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[kind]}"/></svg>`;
}

const toNumber = (value) => parseFloat(String(value).replace(",", "."));
const isNumber = (value) => value !== "" && Number.isFinite(toNumber(value)) && toNumber(value) >= 0;
const numericPlaceholder = (input) => (isNumber(input.placeholder) ? input.placeholder : "");

// Siguiente serie de una superserie, alternando: A1 serie 1, A2 serie 1, A1 serie 2...
// Devuelve { index, round, hint } o null si la pareja está completa.
// circuit: en Core DIY los avisos hablan de vueltas.
function nextStep(entries, byId, circuit = false) {
  const rounds = Math.max(...entries.map(({ item }) => item.sets.length));
  const order = [];
  for (let round = 0; round < rounds; round++)
    for (const { item, index } of entries) if (item.sets[round]) order.push({ item, index, round });
  const at = order.findIndex((s) => !s.item.sets[s.round].done);
  if (at === -1) return null;
  const next = order[at];
  const started = order.some((s) => s.item.sets[s.round].done);
  if (!started) return { ...next, hint: "" };
  const name = esc(byId(next.item.exerciseId)?.name || "");
  const sameRound = at > 0 && order[at - 1].round === next.round;
  const rest = formatRest(pairRest(entries.map((e) => e.item)));
  const text = circuit
    ? sameRound
      ? t("core.next", { name })
      : t("core.restThen", { time: rest, n: next.round + 1, name })
    : sameRound
      ? t("superset.nowNoRest", { n: next.round + 1, name })
      : t("superset.restThen", { time: rest, n: next.round + 1, name });
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
  return { ...next, hint: `<p class="next-hint" role="status">${arrow}<span>${text}</span></p>` };
}

function previousDoneSet(sets, index) {
  for (let i = index - 1; i >= 0; i--) if (sets[i].done) return sets[i];
  return null;
}

export const formatKg = formatNumber;

// "40 kg × 12 · 12 · 11" si el peso no cambió; si cambió, "40×12 · 42.5×10 kg".
// Los pesos de `sets` ya deben estar en `unit`.
export function formatSets(sets, exercise = {}, unit = "kg") {
  const time = exercise?.timed ? " s" : "";
  const sameWeight = sets.every((s) => s.weight === sets[0].weight);
  if (sameWeight) {
    const reps = sets.map((s) => s.reps + time).join(" · ");
    return sets[0].weight ? `${formatNumber(sets[0].weight)} ${unit} × ${reps}` : `${reps}${exercise?.timed ? "" : ` ${t("session.reps")}`}`;
  }
  return sets.map((s) => `${formatNumber(s.weight)}×${s.reps}${time}`).join(" · ") + ` ${unit}`;
}
