// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // devtools: { enabled: true },
  ssr: true,
  modules: [
    '@pinia/nuxt',
    'nuxt-quasar-ui',
    // [
    //   '@nuxtjs/router',
    //   {
    //     path: 'router',
    //     fileName: 'router.ts',
    //     keepDefaultRouter: true,
    //   },
    // ],
  ],
  pinia: {
    autoImports: ['defineStore', 'acceptHMRUpdate'],
  },
  quasar: {
    plugins: ['Loading', 'Notify'],

    /* */
    // extras: {
    //   fontIcons: ['material-icons'],
    // },
  },
  imports: { dirs: ['stores'] },
  runtimeConfig: {
    awsRegion: '',
    public: {
      authUrl: 'https://keycloak.multitenancy.com',
      stripeKey: '',
    },
  },
  // css: ['@quasar/extras/material-icons/material-icons.css'],
});
