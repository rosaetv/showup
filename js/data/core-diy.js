// Core DIY: ejercicios de core en el mat, por grupos.
// Eliges 5 (o la app te sugiere uno de cada grupo), haces cada uno el tiempo
// indicado y repites el circuito. Es un extra: no cuenta para tu meta semanal.

export const CORE_DIY_GROUPS = {
  stability: ["plancha", "plancha-alterna", "dead-bug", "bird-dog", "hollow-hold", "plancha-toques-hombro", "bear-hold", "bear-plank-slides"],
  sides: ["plancha-lateral", "plancha-lateral-cadera", "toques-talon", "chinnies", "crunch-bicicleta", "russian-twist", "wind-wipers", "crossbody-crunch-pie", "zancada-giro"],
  lower: ["elevacion-piernas-suelo", "crunch-inverso", "flutter-kicks", "tijeras", "mountain-climbers"],
  upper: ["crunch", "toe-touches", "v-ups"],
  back: ["superman", "swimmers", "ytw-boca-abajo", "puente-gluteo", "puente-una-pierna", "puente-marcha"],
};

export const CORE_DIY_DEFAULTS = { ids: [], rounds: 3, seconds: 30 };
export const CORE_DIY_REST = 60; // descanso entre vueltas, en segundos
export const CORE_DIY_MAX = 5;
