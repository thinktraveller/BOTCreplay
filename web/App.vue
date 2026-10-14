<script setup lang="ts">
import ReplayView from '../shared/presentation/ReplayView.vue';
import type { ReplayPresentation } from '../shared/presentation/types.js';

const replay: ReplayPresentation = { replayId: 'new-replay', revision: 0, title: '记录每一局的故事', phases: [], events: [], assets: {} };
</script>
<template><ReplayView :replay="replay" /></template>
