// Core DIY: elegir 5 ejercicios de core en el mat, cuántas vueltas y cuántos
// segundos por ejercicio. Se abre desde "Tu plan" en Inicio y es un extra.

import { db } from "../db.js";
import { getAllExercises, getFavorites, toggleFavoriteExercise, toggleDislikedExercise } from "../store.js";
import { CORE_DIY_GROUPS, CORE_DIY_DEFAULTS, CORE_DIY_MAX } from "../data/core-diy.js";
import { startCoreCircuit } from "./session.js";
import { esc, icons, header, muscleName, equipmentName, openSheet, toast } from "../ui.js";
import { t } from "../i18n.js";

const getChoice = async () => ({ ...CORE_DIY_DEFAULTS, ...((await db.get("kv", "coreDiy")) || {}) });
const saveChoice = (choice) => db.put("kv", choice, "coreDiy");

// Uno al azar de cada grupo (tus favoritos primero; nunca los que no te gustan).
// Los que llevan equipo solo se sugieren si son favoritos: la sugerencia se puede hacer solo con el mat.
function suggestFive(exercises, favorites) {
  return Object.values(CORE_DIY_GROUPS).map((ids) => {
    const usable = ids.filter((id) => exercises.some((e) => e.id === id && !e.advanced) && !favorites.disliked.includes(id));
    const favs = usable.filter((id) => favorites.exercises.includes(id));
    const available = usable.filter((id) => byEquipment(exercises, id) === "peso_corporal");
    const pool = favs.length ? favs : available.length ? available : ids;
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

const byEquipment = (exercises, id) => exercises.find((e) => e.id === id)?.equipment;

export async function renderCore(view) {
  const exercises = await getAllExercises();
  const byId = (id) => exercises.find((e) => e.id === id);
  const choice = await getChoice();
  let favorites = await getFavorites();
  if (!choice.ids.length) choice.ids = suggestFive(exercises, favorites);

  const rank = (e) => (favorites.exercises.includes(e.id) ? 0 : favorites.disliked.includes(e.id) ? 2 : 1);
  // Si los 5 son del mismo grupo: está bien, solo se avisa qué se queda fuera.
  const sameGroupNote = () => {
    if (choice.ids.length < CORE_DIY_MAX) return "";
    const groups = Object.entries(CORE_DIY_GROUPS).filter(([, ids]) => choice.ids.some((id) => ids.includes(id)));
    return groups.length === 1 ? `<p class="muted small-note core-note">${t("core.sameGroup", { group: t(`core.group.${groups[0][0]}`) })}</p>` : "";
  };

  const option = (action, value, label) =>
    `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${String(choice[action]) === String(value)}">${label}</button>`;

  const draw = () => {
    const y = window.scrollY;
    view.innerHTML = `
      ${header({ back: "#/entrenar" })}
      <h1 class="screen-title">${t("core.title")}</h1>
      <p class="muted day-meta">${t("core.intro", { n: CORE_DIY_MAX })}</p>

      <section class="card settings-card">
        <div class="setting-row">
          <span>${t("core.rounds")}</span>
          <span class="unit-toggle" role="group" aria-label="${t("core.rounds")}">${[3, 4, 5].map((n) => option("rounds", n, n)).join("")}</span>
        </div>
        <div class="setting-row setting-divider">
          <span>${t("core.seconds")}</span>
          <span class="unit-toggle" role="group" aria-label="${t("core.seconds")}">${[30, 45].map((n) => option("seconds", n, `${n} s`)).join("")}</span>
        </div>
      </section>

      <div class="title-row section-row">
        <h2 class="section-title">${t("core.chosen", { n: choice.ids.length, max: CORE_DIY_MAX })}</h2>
        <button class="btn-small" data-action="suggest">${t("core.suggest")}</button>
      </div>
      ${sameGroupNote()}
      ${Object.entries(CORE_DIY_GROUPS)
        .map(
          ([group, ids]) => `
        <h3 class="timeline-month">${t(`core.group.${group}`)}</h3>
        <div class="list core-list">
          ${ids
            .map(byId)
            .filter(Boolean)
            // Tus favoritos primero; los que no te gustan, al final.
            .sort((a, b) => rank(a) - rank(b))
            .map(
              (e) => `
            <div class="list-row core-row">
              <label class="check-row">
                <input type="checkbox" value="${e.id}" ${choice.ids.includes(e.id) ? "checked" : ""} />
                <span class="list-row-text">
                  <strong>${esc(e.name)}${favorites.exercises.includes(e.id) ? `<span class="mark-fav" aria-label="${t("core.favorite")}">${icons.starFilled}</span>` : ""}${favorites.disliked.includes(e.id) ? `<span class="mark-dislike" aria-label="${t("core.disliked")}">${icons.thumbDownFilled}</span>` : ""}</strong>
                  <small>${e.primary.map(muscleName).join(", ")}${e.timed ? ` · ${t("core.hold")}` : ""}${e.equipment !== "peso_corporal" ? ` · ${equipmentName(e.equipment)}` : ""}</small>
                </span>
              </label>
              <button class="icon-btn" type="button" data-action="howto" data-id="${e.id}" aria-label="${t("core.howTo", { name: esc(e.name) })}">${icons.info}</button>
            </div>`
            )
            .join("")}
        </div>`
        )
        .join("")}

      <div class="bottom-spacer"></div>
      <div class="bottom-bar above-tabs">
        <button class="btn btn-primary" data-action="start">${choice.ids.length === CORE_DIY_MAX ? t("core.start", { n: CORE_DIY_MAX, rounds: choice.rounds }) : t("core.pickMore", { n: choice.ids.length, max: CORE_DIY_MAX })}</button>
      </div>`;
    window.scrollTo(0, y);
  };
  draw();

  view.onclick = async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action, value } = target.dataset;
    if (action === "rounds" || action === "seconds") choice[action] = Number(value);
    else if (action === "suggest") choice.ids = suggestFive(exercises, favorites);
    else if (action === "howto") return howToSheet(byId(target.dataset.id), async () => {
      favorites = await getFavorites();
      draw();
    });
    else if (action === "start") {
      if (choice.ids.length !== CORE_DIY_MAX) return toast(t("core.needFive", { n: CORE_DIY_MAX, chosen: choice.ids.length }));
      await saveChoice(choice);
      return startCoreCircuit(choice);
    }
    await saveChoice(choice);
    draw();
  };

  view.onchange = async (event) => {
    const box = event.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.checked && choice.ids.length >= CORE_DIY_MAX) {
      box.checked = false;
      return toast(t("core.max", { n: CORE_DIY_MAX }));
    }
    choice.ids = box.checked ? [...choice.ids, box.value] : choice.ids.filter((id) => id !== box.value);
    await saveChoice(choice);
    draw();
  };
}

// Cómo se hace, sin salir de Core DIY, y marcar favorito o "no me gusta".
async function howToSheet(exercise, onChange) {
  if (!exercise) return;
  const favorites = await getFavorites();
  const fav = favorites.exercises.includes(exercise.id);
  const disliked = favorites.disliked.includes(exercise.id);
  const close = openSheet({
    title: exercise.name,
    body: `
      <div class="prose howto">
        ${exercise.description ? `<p>${esc(exercise.description)}</p>` : ""}
        ${exercise.steps?.length ? `<ol>${exercise.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>` : ""}
        ${exercise.tip ? `<p class="tip"><strong>${t("exercise.tip")}</strong> ${esc(exercise.tip)}</p>` : ""}
      </div>
      <a class="btn btn-secondary youtube-btn" target="_blank" rel="noopener"
        href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} ${t("exercise.youtubeQuery")}`)}">
        ${icons.play} ${t("exercise.youtube")}
      </a>
      <div class="btn-row howto-marks">
        <button class="btn btn-secondary" data-fav aria-pressed="${fav}">${fav ? icons.starFilled : icons.star} ${t("core.favorite")}</button>
        <button class="btn btn-secondary" data-dislike aria-pressed="${disliked}">${disliked ? icons.thumbDownFilled : icons.thumbDown} ${t("core.disliked")}</button>
      </div>`,
    onMount: (sheet) => {
      sheet.querySelector("[data-fav]").onclick = async () => {
        await toggleFavoriteExercise(exercise.id);
        close();
        onChange();
      };
      sheet.querySelector("[data-dislike]").onclick = async () => {
        await toggleDislikedExercise(exercise.id);
        close();
        onChange();
      };
    },
  });
}
