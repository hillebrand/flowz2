<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { TaskEditData } from '#shared/types/tasks'

const { loggedIn } = useUserSession()
if (!loggedIn.value) {
  await navigateTo('/inloggen')
}

const route = useRoute()
const taskId = computed(() => (Array.isArray(route.params.id) ? route.params.id[0] : route.params.id) ?? '')

function is401(fout: unknown): boolean {
  return (fout as FetchError | undefined)?.statusCode === 401
}

useHead({ title: 'Taak bewerken' })

// Story 5.3 — geen golden-path-`useState`-doorgifte hier (zie de story se "Belangrijk"
// punt 2): geen bestaande state bevat genoeg velden voor bewerken.
const { data, error } = useFetch<TaskEditData>(() => `/api/tasks/${encodeURIComponent(taskId.value)}/edit`, { server: false })
watch(error, (waarde) => {
  if (is401(waarde)) navigateTo('/inloggen')
  else if (waarde) navigateTo('/taken')
}, { immediate: true })
</script>

<template>
  <TaakFormulier v-if="data" mode="bewerken" :task-id="taskId" :initial-data="data" />
</template>
