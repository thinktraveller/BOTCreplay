<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReplayPresentation } from './types.js';

const props = defineProps<{ replay: ReplayPresentation; print?: boolean }>();
const phaseId = ref('');
const selectedEventId = ref('');
const events = computed(() => props.print || !phaseId.value ? props.replay.events : props.replay.events.filter(event => event.phaseId === phaseId.value));
const selected = computed(() => props.replay.events.find(event => event.eventId === selectedEventId.value));
function embeddedIcon(assetId?: string) {
  const asset = assetId ? props.replay.assets[assetId] : undefined;
  if (asset?.dataUrl && /^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(asset.dataUrl)) return asset.dataUrl;
  if (asset?.localUrl && /^https?:$/.test(location.protocol)) {
    try { const url = new URL(asset.localUrl, location.href); if (url.origin === location.origin) return url.href; } catch { /* Invalid cached URL uses the placeholder. */ }
  }
  return undefined;
}
</script>

<template>
  <main class="replay" :class="{ 'print-view': print }">
    <header class="replay-header">
      <span class="eyebrow">BOTCREPLAY · 对局复盘</span>
      <h1>{{ replay.title }}</h1>
      <p>{{ replay.events.length }} 条记录 · 修订 {{ replay.revision }}</p>
    </header>
    <nav v-if="!print && replay.events.length" class="phase-nav" aria-label="阶段定位">
      <label>查看阶段 <select v-model="phaseId" aria-label="查看阶段"><option value="">全部阶段</option><option v-for="phase in replay.phases" :key="phase.phaseId" :value="phase.phaseId">{{ phase.label }}</option></select></label>
      <span>{{ events.length }} 条记录</span>
    </nav>
    <section class="event-list" aria-label="复盘事件">
      <article v-for="(event, index) in events" :key="event.eventId" class="event-card" :data-event-id="event.eventId">
        <img v-if="embeddedIcon(event.iconAssetId)" class="role-icon" :src="embeddedIcon(event.iconAssetId)" :alt="replay.assets[event.iconAssetId!]?.label || '角色图标'">
        <span v-else class="role-icon placeholder" role="img" aria-label="缺失图标占位">?</span>
        <div class="event-content">
          <div class="event-heading"><span class="event-index">{{ index + 1 }}</span><span v-if="event.subjectParts" class="subject"><span v-for="(part, partIndex) in event.subjectParts" :key="partIndex" :class="part.alignment">{{ part.text }}</span></span><span v-else class="subject" :class="event.alignment">{{ event.subject }}</span></div>
          <p v-if="event.textParts" class="event-text"><template v-for="(line, lineIndex) in event.textParts" :key="lineIndex"><br v-if="lineIndex"><span v-for="(part, partIndex) in line" :key="partIndex" :class="part.alignment">{{ part.text }}</span></template></p>
          <p v-else class="event-text">{{ event.text }}</p>
          <details v-if="!print"><summary @click="selectedEventId = event.eventId">事件详情与当时座位</summary><p>{{ event.details }}</p></details>
        </div>
      </article>
      <p v-if="!events.length" class="empty-state">尚无复盘记录</p>
    </section>
    <aside v-if="selected && !print" class="seat-panel" aria-label="事件时座位">
      <h2>此时的座位 · {{ selected.subject }}</h2>
      <ol class="seat-list"><li v-for="player in selected.players" :key="player.playerId" :class="player.alignment"><strong>{{ player.seat }} · {{ player.nickname }}</strong><span>{{ player.identity }} · {{ player.alive ? '存活' : '死亡' }}</span></li></ol>
    </aside>
    <footer class="replay-footer">复盘结束 · {{ replay.events.length }} 条记录 · {{ replay.replayId }} / r{{ replay.revision }}</footer>
  </main>
</template>
