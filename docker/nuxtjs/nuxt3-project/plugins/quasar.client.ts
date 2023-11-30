import { NuxtApp } from 'nuxt/dist/app/nuxt';
import { Quasar } from 'quasar';
import '@quasar/extras/material-icons/material-icons.css';

// Import Quasar css
import 'quasar/dist/quasar.css';

export default defineNuxtPlugin((nuxtApp: NuxtApp) => {
  nuxtApp.vueApp.use(Quasar, {});
  return {};
});
