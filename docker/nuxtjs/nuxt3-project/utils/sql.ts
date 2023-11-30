import { ref } from 'vue';
import { useQueryStore } from '../stores/postStore';
import { setActivePinia, createPinia } from 'pinia';
setActivePinia(createPinia());

const queryStore = useQueryStore();

export const executeQuery = async () => {
  const { data: posts } = await useFetch('/api/getDataAurora');
  console.log('putQuery');
  queryStore.putQueryResult(posts.value);
  return posts.value;
};

export const localQuery = async () => {
  const { data: posts } = await useFetch('/api/getData');
  return posts.value;
};

export const executeInsert = async (input: any) => {
  const result = await useFetch('/api/postDataAurora', {
    method: 'POST',
    body: input,
  });
};
