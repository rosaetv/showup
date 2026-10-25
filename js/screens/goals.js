// Metas y logros: metas con su avance, victorias que anotas tú y una línea de
// tiempo con todo (victorias, récords, hitos de racha y metas cumplidas).

import { getGoals, saveGoals, getVictories, saveVictories, goalProgress, isReached, newId } from "../goals.js";
import { getAllExercises, getWorkouts, getMeasurements, getPlan } from "../store.js";
import { weeklySummary } from "../stats.js";
import { getUnits, unitFor, toKg, fromKg, setsInUnit, formatNumber, isPerSide, weightLabel } from "../units.js";
import { BODY_METRICS } from "../data/catalog.js";
import { formatSets } from "./session.js";
import { bestMarks } from "../records.js";
import { esc, icons, header, openSheet, confirmSheet, toast } from "../ui.js";
import { t, locale } from "../i18n.js";

const MILESTONES = [4, 8, 12, 26, 52];
const VICTORY_TAGS = ["energy", "strength", "mood", "sleep", "clothes", "other"];

const STAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5z"/></svg>';
const TROPHY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3"/></svg>';
const FLAG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
const SPARK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>';

// ---------- Datos compartidos ----------

async function loadData() {
  const [workouts, measurements, plan, exercises, units] = await Promise.all([getWorkouts(), getMeasurements(), getPlan(), getAllExercises(), getUnits()]);
  return { workouts, measurements, exercises, units, summary: weeklySummary(workouts, plan?.daysPerWeek), plan };
}

// Nombre de una meta, en tu unidad.
export function goalTitle(goal, { exercises, units }) {
  if (goal.type === "strength") {
    const ex = exercises.find((e) => e.id === goal.exerciseId);
    const unit = unitFor(units, goal.exerciseId);
    const target = formatSets([{ weight: fromKg(goal.weight, unit), reps: goal.reps }], ex, weightLabel(unit, isPerSide(units, ex)));
    return `${ex?.name || t("common.deletedExercise")}: ${target}`;
  }
  if (goal.type === "consistency") return t("goal.consistencyTitle", { n: goal.weeks });
  if (goal.type === "body") return `${BODY_METRICS[goal.metric]?.label}: ${formatNumber(goal.target)} ${BODY_METRICS[goal.metric]?.unit}`;
  return goal.title;
}

/**
 * Línea de tiempo de logros, del más reciente al más antiguo:
 * [{ date (ISO), kind: "victory" | "record" | "goal" | "milestone", text, tag? }]
 */
export function buildTimeline({ workouts, exercises, units, summary }, goals, victories) {
  const items = victories.map((v) => ({ date: v.date, kind: "victory", text: v.text, tag: v.tag, id: v.id }));

  for (const g of goals) if (g.achievedAt) items.push({ date: g.achievedAt, kind: "goal", text: goalTitle(g, { exercises, units }) });

  for (const w of workouts) {
    for (const e of w.exercises) {
      if (!e.record) continue;
      const ex = exercises.find((x) => x.id === e.exerciseId);
      const unit = unitFor(units, e.exerciseId);
      const best = [...e.sets].sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
      items.push({ date: w.finishedAt, kind: "record", text: `${ex?.name || e.name}: ${formatSets(setsInUnit([best], unit), ex, unit)}` });
    }
  }

  // Hitos de racha: el día en que la racha llegó a 4, 8, 12, 26, 52 semanas (y cada año).
  let streak = 0;
  for (const week of summary.weeks) {
    if (week.done) {
      streak++;
      if (MILESTONES.includes(streak) || (streak > 52 && streak % 52 === 0)) {
        const end = new Date(week.start);
        end.setDate(end.getDate() + 6);
        const date = week.current ? new Date() : end;
        const name = streak <= 52 ? t(`milestone.w${streak}`) : t("milestone.years", { n: streak / 52 });
        items.push({ date: date.toISOString(), kind: "milestone", text: t("achv.milestone", { name, n: streak }) });
      }
    } else if (!week.current) streak = 0;
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

// Resumen para el menú de Perfil: "2 metas activas · 14 logros".
export async function goalsSummary() {
  const data = await loadData();
  const goals = await getGoals();
  const active = goals.filter((g) => !g.achievedAt).length;
  const achievements = buildTimeline(data, goals, await getVictories()).length;
  if (!active && !achievements) return t("goal.menuEmpty");
  return [active && t("goal.activeCount", { n: active }), achievements && t("achv.count", { n: achievements })].filter(Boolean).join(" · ");
}

// ---------- Celebración ----------

export async function celebrate(goals) {
  if (!goals.length) return;
  const data = await loadData();
  // La celebración reemplaza el aviso breve que pudiera estar encima.
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  openSheet({
    title: goals.length === 1 ? t("goal.reachedTitle") : t("goal.reachedTitleN", { n: goals.length }),
    body: `
      <div class="celebration">
        <span class="celebration-icon">${STAR}</span>
        ${goals.map((g) => `<p class="celebration-goal">${esc(goalTitle(g, data))}</p>`).join("")}
        <p class="sheet-text">${t("goal.reachedText")}</p>
      </div>
      <button class="btn btn-primary" data-sheet-close>${t("goal.reachedButton")}</button>`,
  });
}

// ---------- Pantalla ----------

export async function renderGoals(view) {
  const data = await loadData();
  const goals = await getGoals();
  const victories = await getVictories();
  const active = goals.filter((g) => !g.achievedAt);
  const timeline = buildTimeline(data, goals, victories);

  const goalCards = active
    .map((g) => {
      const { ratio, current } = goalProgress(g, data);
      return `
      <button class="card goal-card" data-action="goal" data-id="${g.id}">
        <span class="goal-type">${t(`goal.type.${g.type}`)}</span>
        <strong>${esc(goalTitle(g, data))}</strong>
        ${g.type === "free"
          ? `<small>${t("goal.freeHint")}</small>`
          : `<span class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"><span style="width:${ratio * 100}%"></span></span>
             <small>${progressText(g, current, data)}</small>`}
      </button>`;
    })
    .join("");

  // Línea de tiempo por mes.
  const months = new Map();
  for (const item of timeline) {
    const key = new Date(item.date).toLocaleDateString(locale(), { month: "long", year: "numeric" });
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(item);
  }
  const icon = { victory: SPARK, record: TROPHY, goal: STAR, milestone: FLAG };
  const timelineHtml = [...months]
    .map(
      ([month, items]) => `
      <h3 class="timeline-month">${month.charAt(0).toUpperCase() + month.slice(1)}</h3>
      <div class="list">
        ${items
          .map(
            (item) => `
          <${item.kind === "victory" ? `button class="list-row achv-row" data-action="victory" data-id="${item.id}"` : 'div class="list-row achv-row"'}>
            <span class="achv-icon achv-${item.kind}">${icon[item.kind]}</span>
            <span class="list-row-text">
              <strong>${esc(item.text)}</strong>
              <small>${t(`achv.kind.${item.kind}`)}${item.tag ? ` · ${t(`victory.tag.${item.tag}`)}` : ""} · ${shortDate(item.date)}</small>
            </span>
          </${item.kind === "victory" ? "button" : "div"}>`
          )
          .join("")}
      </div>`
    )
    .join("");

  view.innerHTML = `
    ${header({ back: "#/perfil" })}
    <h1 class="screen-title">${t("goal.pageTitle")}</h1>

    <div class="title-row section-row">
      <h2 class="section-title">${t("goal.activeTitle")}</h2>
      <button class="btn-small" data-action="new-goal">${icons.plus} ${t("goal.add")}</button>
    </div>
    ${goalCards ? `<div class="goal-list">${goalCards}</div>` : `<p class="muted small-note">${t("goal.empty")}</p>`}

    <div class="title-row section-row">
      <h2 class="section-title">${t("achv.title")}</h2>
      <button class="btn-small" data-action="new-victory">${icons.plus} ${t("victory.add")}</button>
    </div>
    ${timelineHtml || `<p class="muted small-note">${t("achv.empty")}</p>`}
  `;

  const refresh = () => renderGoals(view);
  view.onclick = async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === "new-goal") newGoalSheet(data, refresh);
    else if (action === "goal") goalSheet(goals.find((g) => g.id === id), data, refresh);
    else if (action === "new-victory") victorySheet(null, refresh);
    else if (action === "victory") victorySheet(victories.find((v) => v.id === id), refresh);
  };
}

function progressText(goal, current, data) {
  if (goal.type === "strength") {
    if (!current) return t("goal.strengthNone", { reps: goal.reps });
    const ex = data.exercises.find((e) => e.id === goal.exerciseId);
    const unit = unitFor(data.units, goal.exerciseId);
    return t("goal.best", { set: formatSets(setsInUnit([current], unit), ex, unit) });
  }
  if (goal.type === "consistency") return t("goal.weeksProgress", { n: current, total: goal.weeks });
  if (goal.type === "body") return current == null ? t("goal.bodyNone") : t("goal.now", { value: `${formatNumber(current)} ${BODY_METRICS[goal.metric].unit}` });
  return "";
}

// ---------- Ver o borrar una meta; marcar una libre ----------

function goalSheet(goal, data, onDone) {
  if (!goal) return;
  const close = openSheet({
    title: goalTitle(goal, data),
    body: `
      <p class="sheet-text">${t("goal.createdOn", { date: shortDate(goal.createdAt) })}</p>
      <div class="stack">
        ${goal.type === "free" ? `<button class="btn btn-primary" data-done>${t("goal.markDone")}</button>` : ""}
        <button class="btn btn-ghost-danger" data-delete>${t("goal.delete")}</button>
      </div>`,
    onMount: (sheet) => {
      sheet.querySelector("[data-done]")?.addEventListener("click", async () => {
        const goals = await getGoals();
        const stored = goals.find((g) => g.id === goal.id);
        stored.achievedAt = new Date().toISOString();
        await saveGoals(goals);
        close();
        onDone();
        celebrate([stored]);
      });
      sheet.querySelector("[data-delete]").addEventListener("click", async () => {
        close();
        const ok = await confirmSheet({ title: t("goal.deleteTitle"), text: t("goal.deleteText"), confirmLabel: t("common.delete"), danger: true });
        if (!ok) return;
        await saveGoals((await getGoals()).filter((g) => g.id !== goal.id));
        toast(t("goal.deleted"));
        onDone();
      });
    },
  });
}

// ---------- Nueva meta ----------

function newGoalSheet(data, onDone) {
  const types = ["strength", "consistency", "body", "free"];
  const close = openSheet({
    title: t("goal.newTitle"),
    body: `
      <div class="list">
        ${types
          .map(
            (type) => `
          <button class="list-row" data-type="${type}">
            <span class="list-row-text"><strong>${t(`goal.type.${type}`)}</strong><small>${t(`goal.typeHint.${type}`)}</small></span>
            ${icons.chevron}
          </button>`
          )
          .join("")}
      </div>`,
    onMount: (sheet) => {
      sheet.addEventListener("click", (event) => {
        const row = event.target.closest("[data-type]");
        if (!row) return;
        close();
        setTimeout(() => goalForm(row.dataset.type, data, onDone), 220);
      });
    },
  });
}

function goalForm(type, data, onDone) {
  const planIds = new Set((data.plan?.days || []).flatMap((d) => d.items.map((i) => i.exerciseId)));
  const byName = (a, b) => a.name.localeCompare(b.name, locale());
  const inPlan = data.exercises.filter((e) => planIds.has(e.id) && !e.assisted).sort(byName);
  const others = data.exercises.filter((e) => !planIds.has(e.id) && !e.assisted).sort(byName);
  const option = (e) => `<option value="${e.id}">${esc(e.name)}</option>`;
  const latest = (metric) => data.measurements.filter((m) => m.values[metric] != null).at(-1)?.values[metric];

  const fields = {
    strength: `
      <label class="field"><span>${t("goal.exercise")}</span>
        <select class="input" name="exercise">
          ${inPlan.length ? `<optgroup label="${t("goal.inPlan")}">${inPlan.map(option).join("")}</optgroup>` : ""}
          <optgroup label="${t("goal.allExercises")}">${others.map(option).join("")}</optgroup>
        </select>
      </label>
      <div class="metric-grid">
        <label class="field"><span>${t("goal.weight")} <small data-unit></small></span><input class="input" name="weight" inputmode="decimal" autocomplete="off" /></label>
        <label class="field"><span>${t("goal.reps")}</span><input class="input" name="reps" inputmode="numeric" value="8" autocomplete="off" /></label>
      </div>
      <p class="muted small-note" data-best></p>`,
    consistency: `
      <label class="field"><span>${t("goal.weeks")}</span><input class="input" name="weeks" inputmode="numeric" value="12" autocomplete="off" /></label>
      <p class="muted small-note">${t("goal.weeksNow", { n: data.summary.current })}</p>`,
    body: `
      <label class="field"><span>${t("goal.metric")}</span>
        <select class="input" name="metric">
          ${Object.entries(BODY_METRICS).map(([key, m]) => `<option value="${key}">${m.label}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span>${t("goal.target")} <small data-unit></small></span><input class="input" name="target" inputmode="decimal" autocomplete="off" /></label>
      <p class="muted small-note" data-current></p>`,
    free: `
      <label class="field"><span>${t("goal.freeLabel")}</span><input class="input" name="title" maxlength="120" placeholder="${t("goal.freePlaceholder")}" autocomplete="off" /></label>`,
  };

  const close = openSheet({
    title: t(`goal.type.${type}`),
    body: `
      <form class="form" novalidate>
        ${fields[type]}
        <p class="form-error" role="alert"></p>
        <button class="btn btn-primary" type="submit">${t("goal.save")}</button>
      </form>`,
    onMount: (sheet) => {
      const form = sheet.querySelector("form");
      const number = (name) => parseFloat(String(form.elements[name].value).trim().replace(",", "."));
      const error = (key, params) => (form.querySelector(".form-error").textContent = t(key, params));

      // Ayudas que cambian según lo elegido.
      const update = () => {
        if (type === "strength") {
          const id = form.elements.exercise.value;
          const unit = unitFor(data.units, id);
          sheet.querySelector("[data-unit]").textContent = unit;
          const best = bestMarks(data.workouts.flatMap((w) => w.exercises.filter((e) => e.exerciseId === id).map((e) => ({ date: w.finishedAt, sets: e.sets }))))?.heaviest;
          const ex = data.exercises.find((e) => e.id === id);
          sheet.querySelector("[data-best]").textContent = best ? t("goal.yourBest", { set: formatSets(setsInUnit([best], unit), ex, unit) }) : t("goal.noHistory");
        }
        if (type === "body") {
          const metric = form.elements.metric.value;
          sheet.querySelector("[data-unit]").textContent = BODY_METRICS[metric].unit;
          const value = latest(metric);
          sheet.querySelector("[data-current]").textContent = value != null ? t("goal.now", { value: `${formatNumber(value)} ${BODY_METRICS[metric].unit}` }) : t("goal.bodyFirst");
        }
      };
      form.addEventListener("change", update);
      update();
      setTimeout(() => form.querySelector("input")?.focus(), 250);

      form.onsubmit = async (event) => {
        event.preventDefault();
        const goal = { id: newId(), type, createdAt: new Date().toISOString() };
        if (type === "strength") {
          const unit = unitFor(data.units, form.elements.exercise.value);
          const weight = number("weight");
          const reps = Math.round(number("reps"));
          if (!(weight >= 0) || !(reps > 0)) return error("goal.checkValues");
          Object.assign(goal, { exerciseId: form.elements.exercise.value, weight: toKg(weight, unit), reps });
        } else if (type === "consistency") {
          const weeks = Math.round(number("weeks"));
          if (!(weeks > 0)) return error("goal.checkValues");
          goal.weeks = weeks;
        } else if (type === "body") {
          const metric = form.elements.metric.value;
          const target = number("target");
          const start = latest(metric);
          if (start == null) return error("goal.bodyFirst");
          if (!(target > 0)) return error("goal.checkValues");
          Object.assign(goal, { metric, target, start });
        } else {
          const title = form.elements.title.value.trim();
          if (!title) return error("goal.freeEmpty");
          goal.title = title;
        }
        // Si ya la cumpliste, mejor elegir algo nuevo.
        if (isReached(goal, data) || (type === "body" && goal.target === goal.start)) return error("goal.alreadyReached");
        const goals = await getGoals();
        goals.push(goal);
        await saveGoals(goals);
        close();
        toast(t("goal.saved"));
        onDone();
      };
    },
  });
}

// ---------- Victorias ----------

function victorySheet(victory, onDone) {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const date = victory ? iso(new Date(victory.date)) : iso(today);
  const close = openSheet({
    title: victory ? t("victory.editTitle") : t("victory.newTitle"),
    body: `
      <form class="form" novalidate>
        <p class="sheet-text">${t("victory.text")}</p>
        <label class="field"><span>${t("victory.what")}</span>
          <textarea class="input textarea" name="text" rows="3" maxlength="280" placeholder="${t("victory.placeholder")}">${esc(victory?.text || "")}</textarea>
        </label>
        <div class="field">
          <span>${t("victory.tagLabel")} <small>${t("victory.optional")}</small></span>
          <div class="chip-row" role="group" aria-label="${t("victory.tagLabel")}">
            ${VICTORY_TAGS.map((tag) => `<button type="button" class="chip" data-tag="${tag}" aria-pressed="${victory?.tag === tag}">${t(`victory.tag.${tag}`)}</button>`).join("")}
          </div>
        </div>
        <label class="field"><span>${t("metric.date")}</span><input class="input" type="date" name="date" value="${date}" max="${iso(today)}" /></label>
        <p class="form-error" role="alert"></p>
        <div class="stack">
          <button class="btn btn-primary" type="submit">${t("common.save")}</button>
          ${victory ? `<button class="btn btn-ghost-danger" type="button" data-delete>${t("victory.delete")}</button>` : ""}
        </div>
      </form>`,
    onMount: (sheet) => {
      const form = sheet.querySelector("form");
      let tag = victory?.tag || null;
      sheet.querySelector(".chip-row").addEventListener("click", (event) => {
        const chip = event.target.closest("[data-tag]");
        if (!chip) return;
        tag = tag === chip.dataset.tag ? null : chip.dataset.tag;
        sheet.querySelectorAll("[data-tag]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.tag === tag)));
      });
      if (!victory) setTimeout(() => form.elements.text.focus(), 250);
      form.onsubmit = async (event) => {
        event.preventDefault();
        const text = form.elements.text.value.trim();
        if (!text) return (form.querySelector(".form-error").textContent = t("victory.empty"));
        const day = form.elements.date.value || iso(today);
        const list = await getVictories();
        const entry = victory ? list.find((v) => v.id === victory.id) : { id: newId() };
        Object.assign(entry, { text, date: new Date(`${day}T12:00:00`).toISOString() });
        if (tag) entry.tag = tag;
        else delete entry.tag;
        if (!victory) list.push(entry);
        await saveVictories(list);
        close();
        toast(t("victory.saved"));
        onDone();
      };
      sheet.querySelector("[data-delete]")?.addEventListener("click", async () => {
        close();
        const ok = await confirmSheet({ title: t("victory.deleteTitle"), text: victory.text, confirmLabel: t("common.delete"), danger: true });
        if (!ok) return;
        await saveVictories((await getVictories()).filter((v) => v.id !== victory.id));
        toast(t("victory.deleted"));
        onDone();
      });
    },
  });
}

const shortDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
