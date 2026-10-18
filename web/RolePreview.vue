<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { renderBranch, selectedTemplate, templateKeys, type EditorRole, type EditorBranch } from '../shared/roles/editor-model.js';
const props = defineProps<{
    role: EditorRole;
    branch?: EditorBranch;
    roleNames: string[];
}>();
const values = reactive<Record<string, string>>({}), customKeys = reactive<Record<string, boolean>>({});
const custom = ref(false), customText = ref(''), alignment = ref('good');
const resultId = ref('');
watch(() => props.branch?.id, () => resultId.value = '');
const previewFields = computed(() => { const keys = new Set(props.branch ? templateKeys(selectedTemplate(props.branch, resultId.value)) : []); return props.branch?.fields.filter(f => keys.has(f.key)) ?? []; });
watch(() => [props.role.id, props.branch?.id], () => {
    Object.keys(values).forEach(k => delete values[k]);
    Object.keys(customKeys).forEach(k => delete customKeys[k]);
    for (const f of props.branch?.fields ?? []) {
        values[f.key] = f.example;
        customKeys[f.key] = f.kind === 'select' && !!f.example && !f.options.includes(f.example);
    }
    custom.value = false;
    customText.value = '';
}, { immediate: true });
watch(() => props.branch?.fields.map(f => ({ key: f.key, example: f.example })), (fields, previous) => {
    for (const f of fields ?? []) {
        const old = previous?.find(p => p.key === f.key);
        if (!Object.hasOwn(values, f.key) || old && values[f.key] === old.example)
            values[f.key] = f.example;
    }
});
const preview = computed(() => props.branch ? renderBranch(props.branch, values, custom.value ? customText.value : undefined, Object.keys(customKeys).filter(k => customKeys[k]), resultId.value) : { text: '为这个角色添加记录分支，即可在这里试填。', missing: [] });
const previewSubject = computed(() => { const actor = props.branch?.fields.find(f => /主语|行动者|本人/.test(f.label) || f.key === 'actor'); return actor && values[actor.key] ? values[actor.key] : `1号玩家（${props.role.name}）`; });
function selectOption(key: string, event: Event) { const value = (event.target as HTMLSelectElement).value; customKeys[key] = value === '__custom'; values[key] = customKeys[key] ? '' : value; }
</script>
<template>
  <aside class="preview-panel" aria-label="实时填写预览">
    <div class="panel-heading"><div><span class="overline">LIVE PREVIEW</span><h2>试填与预览</h2></div><span class="live-dot">实时</span></div>
    <p class="panel-caption">改字段、改句式，马上看到生成效果。</p>
    <template v-if="branch">
      <div class="preview-mode"><button :class="{selected:!custom}" @click="custom=false">按字段填写</button><button :class="{selected:custom}" @click="custom=true">自定义</button></div>
      <div class="preview-inputs" v-if="!custom">
        <label v-if="branch.variants?.length" class="control"><span>本次结果句式</span><select v-model="resultId" aria-label="试填结果句式"><option value="">{{branch.templateLabel??'默认句式'}}</option><option v-for="variant in branch.variants" :key="variant.id" :value="variant.id">{{variant.label}}</option></select></label>
        <label v-for="field in previewFields" :key="field.id" class="control"><span>{{field.label}}<small v-if="field.required"> 必填</small><button v-if="field.kind==='number'" class="text-button number-custom" @click.prevent="customKeys[field.key]=!customKeys[field.key]">{{customKeys[field.key]?'按数字填写':'自定义'}}</button></span>
          <select v-if="field.kind==='select'" :aria-label="'试填'+field.label" :value="customKeys[field.key]?'__custom':values[field.key]" @change="selectOption(field.key,$event)"><option value="">请选择</option><option v-for="option in field.options" :key="option" :value="option">{{option}}</option><option value="__custom">自定义</option></select>
          <textarea v-else-if="field.kind==='textarea'||field.kind==='number'&&customKeys[field.key]" v-model="values[field.key]" :aria-label="'试填'+field.label" rows="2" />
          <input v-else v-model="values[field.key]" :type="field.kind==='number'?'number':'text'" :aria-label="'试填'+field.label" :list="field.kind==='role'?'preview-role-names':undefined" :placeholder="field.kind==='players'?'例如：2号玩家（调查员）':'填写本次实际内容'" />
          <textarea v-if="field.kind==='select'&&customKeys[field.key]" v-model="values[field.key]" :aria-label="'自定义'+field.label" rows="2" placeholder="填写此项原文" />
        </label>
        <p v-if="!branch.fields.length" class="muted">这个分支使用固定句式。你也可以选择自定义。</p>
      </div>
      <label v-else class="control custom-preview"><span>自定义原文</span><textarea v-model="customText" aria-label="自定义预览正文" rows="5" placeholder="原文、换行都会保留" /></label>
      <datalist id="preview-role-names"><option v-for="name in roleNames" :key="name" :value="name" /><option value="自定义" /></datalist>
      <div class="preview-paper">
        <div class="paper-top"><span>复盘记录</span><span>格式试填</span></div>
        <div class="paper-subject"><span class="role-orb">{{role.name.slice(0,1)}}</span><div><strong :class="alignment">{{previewSubject}}</strong><small>{{branch.name}}</small></div></div>
        <p data-testid="record-preview" class="generated-text">{{preview.text}}</p>
        <p v-if="preview.missing.length" class="preview-warning">待完善：{{preview.missing.join('、')}}</p>
        <div class="paper-bottom"><span>示例阵营</span><select aria-label="预览示例阵营" v-model="alignment"><option value="good">善良 · 蓝字</option><option value="evil">邪恶 · 红字</option></select></div>
      </div>
      <p class="preview-note">这里试填文案；真实角色、生死和阵营由复盘中的实际事件记录。</p>
      <details v-if="branch.source" class="source-sample"><summary>查看原有填写示例</summary><p class="muted">{{branch.source.input}}</p><pre>{{branch.source.sample}}</pre></details>
    </template>
    <p v-else class="empty-preview">这个角色没有专用分支，可使用通用记录，或新建分支。</p>
  </aside>
</template>
