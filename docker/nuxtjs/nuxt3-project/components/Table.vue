<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useQueryStore } from '../stores/postStore';

const queryStore = useQueryStore();
const { queryState } = storeToRefs(queryStore);
</script>
<template>
  <div>
    <q-table
      title="Posts"
      title-class="text-h5 text-bold text-grey"
      row-key="id"
      :rows="queryState"
      :columns="columns"
    />
  </div>
</template>
