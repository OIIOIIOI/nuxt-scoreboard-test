// https://nuxt.com/docs/api/configuration/nuxt-config
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - defineNuxtConfig is auto-imported by Nuxt
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss', 'nuxt-charts'],
  css: ['~/assets/css/main.css'],
})
