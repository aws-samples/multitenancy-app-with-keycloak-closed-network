<script setup lang="ts">
import { ref } from 'vue';
import { set } from 'lodash';
import { Loading, useQuasar } from 'quasar';

const $q = useQuasar();
const input = {
  title: '',
  description: '',
};
let data = ref(input);

const setInput = (event: any, index: any) => {
  set(input, index, event);
};

const toast = (message: string, color: string) => {
  $q.notify({
    position: 'top',
    message: message,
    color: color,
  });
};

const publish = async () => {
  Loading.show({
    message: 'Publishing your post is in progress. Hang on...',
  });
  const result = await executeInsert(input);
  console.log(result);
  if (result !== null) {
    toast('Success', 'green');
    Loading.hide();
  } else {
    toast('Error', 'red');
    Loading.hide();
  }
};
</script>
<template>
  <q-page class="q-pl-lg">
    <h2>Post</h2>
    <div class="q-gutter-md q-py-sm">
      <q-input
        filled
        v-model="data.title"
        label="Title"
        @change="(event) => setInput(event, 'title')"
      />
      <q-input
        filled
        v-model="data.description"
        type="textarea"
        label="Description"
        @change="(event) => setInput(event, 'description')"
      />

      <q-btn color="secondary" @click="publish()">Publish</q-btn>
    </div>
  </q-page>
</template>
