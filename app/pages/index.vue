<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <div class="mx-auto max-w-4xl p-6">
      <h1 class="text-3xl font-bold tracking-tight">Nuxt CRG Scoreboard Test</h1>

      <div class="mt-6">
        <ClientOnly>
          <ScoreboardCurrentScore ws-url="ws://localhost:8000/WS/" />
        </ClientOnly>
      </div>

      <div class="mt-6">
        <ClientOnly>
          <ScoreboardGameList base-url="http://192.168.1.144:8000/" />
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
