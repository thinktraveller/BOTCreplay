import { createApp } from 'vue';
import ReplayView from '../shared/presentation/ReplayView.vue';
import type { ReplayPresentation } from '../shared/presentation/types.js';
import '../shared/presentation/style.css';

const data = document.getElementById('replay-data');
if (data) {
  const replay = JSON.parse(data.textContent ?? '') as ReplayPresentation;
  createApp(ReplayView, { replay }).mount('#app');
}
