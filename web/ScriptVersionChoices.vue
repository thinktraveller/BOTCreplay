<script setup lang="ts">
import type { RoleVersionConflict } from '../shared/import/script.js';
import { TEAM_LABELS } from '../shared/roles/editor-model.js';
import type { RoleType } from '../shared/domain/contracts.js';
defineProps<{ conflicts: RoleVersionConflict[] }>();
defineEmits<{ select: [name: string, key: string] }>();
</script>
<template>
  <section v-if="conflicts.length" class="version-choices">
    <h3>选择同名角色的版本</h3><p>同名角色的技能描述或类型不同。请逐项选择，本局按所选版本准备和记录。</p>
    <fieldset v-for="conflict in conflicts" :key="conflict.name"><legend>{{conflict.name}}</legend>
      <label v-for="option in conflict.options" :key="option.key" class="version-option"><input type="radio" :name="'version-'+conflict.name" :checked="conflict.selected===option.key" :aria-label="conflict.name+'：'+option.label" @change="$emit('select',conflict.name,option.key)"><span><strong>{{option.label}} · {{TEAM_LABELS[option.team as RoleType]??option.team}}</strong><span class="ability-text">{{option.ability}}</span></span></label>
      <p v-if="!conflict.selected" class="notice">请选择版本后再采用剧本。</p>
    </fieldset>
  </section>
</template>
<style scoped>
fieldset{border:1px solid #b8cdd2;border-radius:10px;padding:14px;margin:14px 0;min-width:0}legend{font-weight:700}.version-option{display:flex;align-items:flex-start;gap:10px;margin:12px 0;padding:12px;background:#f3f7f7;border-radius:8px}.version-option input{width:auto;margin-top:5px;flex-shrink:0}.ability-text{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px}
</style>
