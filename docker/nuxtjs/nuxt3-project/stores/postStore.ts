import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useQueryStore = defineStore('queryStore', () => {
  const queryState = ref([]);
  function putQueryResult(props: any) {
    queryState.value = props;
  }
  return { queryState, putQueryResult };
});
