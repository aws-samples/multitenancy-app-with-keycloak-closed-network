<script setup lang="ts">
import { ref } from 'vue';
import { EssentialLinkProps } from '../components/EssentialLink.vue';
import { useQuasar } from 'quasar';

const { dark } = useQuasar();
const themeIcon = computed(() => (dark.isActive ? 'dark_mode' : 'light_mode'));
const nuxtApp = useNuxtApp();
const essentialLinks: EssentialLinkProps[] = [
  {
    title: 'Dashboard',
    caption: 'home page',
    icon: 'home',
    link: '/',
  },
  {
    title: 'Post',
    caption: 'post page',
    icon: 'post_add',
    link: '/createPosts',
  },
  {
    title: 'About',
    caption: 'about page',
    icon: 'help_outline',
    link: '/about',
  },
];

const leftDrawerOpen = ref(false);

const toggleLeftDrawer = () => {
  leftDrawerOpen.value = !leftDrawerOpen.value;
};
</script>
<template>
  <q-layout view="hHh Lpr lff">
    <q-header elevated>
      <q-toolbar class="bg-secondary">
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title> Nuxt App </q-toolbar-title>

        <q-toggle
          :model-value="dark.isActive"
          checked-icon="dark_mode"
          unchecked-icon="light_mode"
          size="3rem"
          color="secondary"
          @update:model-value="(val) => dark.set(val)"
        />
        <q-btn flat icon="logout" @click="nuxtApp.$keycloak.logout()" />
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <EssentialLink v-for="link in essentialLinks" :key="link.title" v-bind="link" />
      </q-list>
    </q-drawer>
    <q-page-container>
      <slot />
    </q-page-container>
  </q-layout>
</template>
