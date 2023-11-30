<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useQueryStore } from '../../stores/postStore';
import { columns } from '../../types/tableColumn';

const queryStore = useQueryStore();
const { queryState } = storeToRefs(queryStore);

const nuxtApp = useNuxtApp();
nuxtApp.$keycloak;
console.log(nuxtApp.$keycloak);
</script>
<template>
  <q-page class="q-pl-lg">
    <h2>Dashboard</h2>
    <div class="q-gutter-md q-py-sm">
      <q-table
        title="Posts"
        title-class="text-h5 text-bold text-grey"
        row-key="id"
        :rows="queryState"
        :columns="columns"
      />
      <q-btn
        color="secondary"
        @click="
          async () => {
            const res = await executeQuery();
            queryStore.putQueryResult(res);
          }
        "
        >Query</q-btn
      >
    </div>
  </q-page>
</template>
