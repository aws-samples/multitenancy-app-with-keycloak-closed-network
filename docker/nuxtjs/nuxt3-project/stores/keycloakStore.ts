import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useKeycloakStore = defineStore('keycloakStore', () => {
  const keycloakState = ref('');
  function put(props: any) {
    keycloakState.value = props;
  }
  return { keycloakState, put };
});
