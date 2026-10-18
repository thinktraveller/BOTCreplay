<script setup lang="ts">
import RoleWorkbench from './RoleWorkbench.vue';
import ReplayEditor from './ReplayEditor.vue';
import { ref } from 'vue';
import './replay-editor.css';
const tab=ref(location.hash==='#roles'?'roles':'replays');
function select(value:string){tab.value=value;location.hash=value;}
</script>
<template><nav class="app-nav" aria-label="工作区"><strong>BOTCreplay</strong><button :class="{active:tab==='replays'}" @click="select('replays')">整局复盘</button><button :class="{active:tab==='roles'}" @click="select('roles')">角色配置工作台</button></nav><KeepAlive><ReplayEditor v-if="tab==='replays'"/><RoleWorkbench v-else /></KeepAlive></template>
