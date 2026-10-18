<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import RolePreview from './RolePreview.vue';
import { TEAM_LABELS, FIELD_LABELS, MAX_LIBRARY_BYTES, copyJson, newRole, newBranch, newField, saveRole, validateRole, parseLibrary, restoreRoleVersion, roleBody, type EditorRole, type RoleLibrary, type EditorBranch, type EditorField, type RoleVersion } from '../shared/roles/editor-model.js';
import './workbench.css';
const library = ref<RoleLibrary>(), draft = ref<EditorRole>(), branchId = ref(''), query = ref(''), team = ref('all'), archived = ref(false);
const tab = ref<'branches' | 'role' | 'versions'>('branches'), busy = ref(false), loading = ref(true), error = ref(''), notice = ref('');
const fileInput = ref<HTMLInputElement>(), imported = ref<RoleLibrary>(), recovery = ref<EditorRole>();
const confirmation = ref<{
    title: string;
    text: string;
    action: () => void;
}>();
const saved = computed(() => library.value?.roles.find(r => r.id === draft.value?.id));
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== JSON.stringify(saved.value));
const issues = computed(() => draft.value ? validateRole(draft.value) : []);
const roles = computed(() => library.value?.roles.filter(r => r.enabled !== archived.value && (team.value === 'all' || r.team === team.value) && (!query.value || `${r.name} ${r.base?.entryId ?? ''}`.toLowerCase().includes(query.value.toLowerCase()))) ?? []);
const activeCount = computed(() => library.value?.roles.filter(r => r.enabled).length ?? 0);
const branch = computed(() => draft.value?.branches.find(b => b.id === branchId.value));
const variantId = ref('');
watch(branchId, () => variantId.value = '');
const variant = computed(() => branch.value?.variants?.find(v => v.id === variantId.value));
const templateText = computed({ get: () => variant.value?.template ?? branch.value?.template ?? '', set: value => { if (variant.value)
        variant.value.template = value;
    else if (branch.value)
        branch.value.template = value; } });
function addVariant() { if (!branch.value)
    return; const next = { id: crypto.randomUUID(), label: '新的结果句式', template: templateText.value }; (branch.value.variants ??= []).push(next); variantId.value = next.id; }
function deleteVariant() { if (!branch.value || !variant.value)
    return; branch.value.variants = branch.value.variants?.filter(v => v.id !== variantId.value); variantId.value = ''; }
const names = computed(() => library.value?.roles.filter(r => r.enabled).map(r => r.name) ?? []);
const fieldCount = computed(() => draft.value?.branches.reduce((n, b) => n + b.fields.length, 0) ?? 0);
function setDraft(role: EditorRole) { draft.value = copyJson(role); branchId.value = role.branches[0]?.id ?? ''; tab.value = 'branches'; error.value = ''; }
function guard(action: () => void) {
    if (dirty.value)
        confirmation.value = { title: '保留当前修改？', text: '当前角色有尚未保存的修改。你可以返回保存，或放弃这份草稿继续。', action };
    else
        action();
}
function selectRole(role: EditorRole) {
    if (role.id === draft.value?.id)
        return;
    guard(() => setDraft(role));
}
function createRole() { guard(() => { setDraft(newRole()); tab.value = 'role'; archived.value = false; }); }
function cloneRole() {
    if (!draft.value)
        return;
    const original = draft.value;
    guard(() => { const copy = { ...newRole(), ...roleBody(original), id: 'custom-' + crypto.randomUUID(), origin: 'custom' as const, enabled: true, revision: 0, history: [] }; copy.name = original.name + ' 副本'; copy.branches = copy.branches.map(b => ({ ...b, id: crypto.randomUUID() })); setDraft(copy); tab.value = 'role'; });
}
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const response = await fetch('/api/role-library');
        if (!response.ok)
            throw new Error((await response.json()).error ?? '无法载入本地角色库');
        const value: unknown = await response.json();
        const parsed = parseLibrary(JSON.stringify(value));
        library.value = parsed;
        const first = parsed.roles.find(r => r.enabled);
        if (first)
            setDraft(first);
        const local = localStorage.getItem('botcreplay-role-draft-v1');
        if (local) {
            try {
                const candidate = JSON.parse(local);
                if (!validateRole(candidate).length && JSON.stringify(candidate) !== JSON.stringify(parsed.roles.find(r => r.id === candidate.id)))
                    recovery.value = candidate;
            }
            catch { /* Invalid local drafts do not replace saved library. */ }
        }
    }
    catch (e) {
        error.value = String((e as Error).message);
    }
    finally {
        loading.value = false;
    }
}
async function persist(next: RoleLibrary) {
    const response = await fetch('/api/role-library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: library.value!.revision, library: next }) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error ?? '本地保存失败');
    library.value = data as RoleLibrary;
    return data as RoleLibrary;
}
async function save() {
    if (!library.value || !draft.value || issues.value.length || busy.value)
        return;
    busy.value = true;
    error.value = '';
    try {
        const next = saveRole(library.value, draft.value);
        const result = await persist(next);
        const current = result.roles.find(r => r.id === draft.value!.id)!;
        setDraft(current);
        localStorage.removeItem('botcreplay-role-draft-v1');
        recovery.value = undefined;
        notice.value = `已保存「${current.name}」· 本地版本 ${current.revision}`;
    }
    catch (e) {
        error.value = (e as Error).message;
    }
    finally {
        busy.value = false;
    }
}
function archiveRole() {
    if (!draft.value)
        return;
    confirmation.value = { title: draft.value.enabled ? '删除这个角色？' : '恢复这个角色？', text: draft.value.enabled ? '角色将移到归档，随时可恢复。已有版本仍然保留。' : '恢复后，它会重新出现在当前角色库。', action: () => { draft.value!.enabled = !draft.value!.enabled; void save(); } };
}
function discard() {
    if (saved.value)
        setDraft(saved.value);
    else if (library.value?.roles[0])
        setDraft(library.value.roles[0]);
    else
        draft.value = undefined;
    localStorage.removeItem('botcreplay-role-draft-v1');
}
function ignoreRecovery() { recovery.value = undefined; localStorage.removeItem('botcreplay-role-draft-v1'); }
function addBranch() {
    if (!draft.value)
        return;
    const b = newBranch();
    draft.value.branches.push(b);
    branchId.value = b.id;
}
function deleteBranch() {
    if (!draft.value || !branch.value)
        return;
    const removed = branch.value;
    confirmation.value = { title: '删除这个分支？', text: `保存后仍可从角色历史版本恢复「${removed.name}」。`, action: () => { draft.value!.branches = draft.value!.branches.filter(b => b.id !== removed.id); branchId.value = draft.value!.branches[0]?.id ?? ''; } };
}
function moveBranch(step: number) {
    if (!draft.value || !branch.value)
        return;
    const list = draft.value.branches, index = list.findIndex(b => b.id === branchId.value), target = index + step;
    if (target < 0 || target >= list.length)
        return;
    [list[index], list[target]] = [list[target], list[index]];
}
function addField() {
    if (!branch.value)
        return;
    let index = branch.value.fields.length + 1;
    while (branch.value.fields.some(f => f.key === `field_${index}`))
        index++;
    branch.value.fields.push(newField(index));
}
function updateKind(field: EditorField) {
    if (field.kind === 'select' && !field.options.length)
        field.options = ['是', '否'];
}
function updateOptions(field: EditorField, event: Event) { field.options = (event.target as HTMLTextAreaElement).value.split('\n').map(s => s.trim()).filter(Boolean); }
function insertField(field: EditorField) {
    if (branch.value)
        templateText.value += '{{' + field.key + '}}';
}
function useHistory(version: RoleVersion) {
    if (!draft.value)
        return;
    confirmation.value = { title: `恢复到版本 ${version.revision}？`, text: '恢复会创建一个新的本地版本，当前版本也会留在历史中。', action: () => { draft.value = restoreRoleVersion(draft.value!, version); void save(); } };
}
function download(text: string, name: string) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function exportLibrary() {
    if (library.value)
        download(JSON.stringify(library.value, null, 2), `BOTCreplay-role-library-${new Date().toISOString().slice(0, 10)}.json`);
}
function exportDraft() {
    if (draft.value && library.value)
        download(JSON.stringify({ ...library.value, roles: [draft.value] }, null, 2), 'BOTCreplay-role-draft.json');
}
async function importFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (fileInput.value)
        fileInput.value.value = '';
    if (!file)
        return;
    error.value = '';
    try {
        if (file.size > MAX_LIBRARY_BYTES)
            throw new Error('配置文件不能超过16MB');
        imported.value = parseLibrary(await file.text());
    }
    catch (e) {
        error.value = (e as Error).message;
    }
}
async function confirmImport() {
    if (!imported.value || !library.value)
        return;
    busy.value = true;
    try {
        const result = await persist(imported.value);
        imported.value = undefined;
        const first = result.roles.find(r => r.enabled) ?? result.roles[0];
        if (first)
            setDraft(first);
        else
            draft.value = undefined;
        localStorage.removeItem('botcreplay-role-draft-v1');
        notice.value = '角色库已导入并保存到本机';
    }
    catch (e) {
        error.value = (e as Error).message;
    }
    finally {
        busy.value = false;
    }
}
function confirmAction() { const action = confirmation.value?.action; confirmation.value = undefined; action?.(); }
function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value) {
        event.preventDefault();
        event.returnValue = '';
    }
}
let draftTimer: ReturnType<typeof setTimeout> | undefined;
watch(draft, () => {
    if (draftTimer)
        clearTimeout(draftTimer);
    if (dirty.value && draft.value)
        draftTimer = setTimeout(() => {
            if (!dirty.value)
                return;
            try {
                localStorage.setItem('botcreplay-role-draft-v1', JSON.stringify(draft.value));
            }
            catch { /* Server save and JSON export remain available. */ }
        }, 400);
}, { deep: true });
onMounted(() => { void load(); window.addEventListener('beforeunload', beforeUnload); });
onBeforeUnmount(() => {
    if (draftTimer)
        clearTimeout(draftTimer);
    window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
 <div class="workbench">
  <header class="workbench-header"><a class="brand" href="/" aria-label="BOTCreplay 首页"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M16 6v10l6 4M4 16h3m18 0h3M16 25v3"/></svg><span>BOTC<span class="brand-light">replay</span></span></a><span class="header-divider"></span><span class="header-page">角色工作台</span><div class="header-actions"><span class="storage-status"><i></i>本机保存</span><button class="quiet-button" @click="fileInput?.click()" :disabled="!library||busy">导入配置</button><button class="quiet-button" @click="exportLibrary" :disabled="!library">导出备份 ↗</button></div><input ref="fileInput" type="file" accept=".json,application/json" class="sr-only" aria-label="导入角色配置文件" @change="importFile" /></header>
  <div class="workbench-intro"><div><span class="overline">ROLE STUDIO / 角色与记录格式</span><h1>把规则，变成可填写的记录。</h1><p>配置一次，反复使用。角色、字段、句式都在这里。</p></div><div class="library-summary"><strong>{{activeCount}}</strong><span>当前角色</span><i></i><strong>{{library?.roles.filter(r=>!r.enabled).length??0}}</strong><span>已归档</span></div></div>
  <div v-if="error" class="feedback error" role="alert"><span>{{error}}</span><div><button v-if="error.includes('其他窗口')" class="quiet-button" @click="exportDraft">导出草稿</button><button class="quiet-button" @click="guard(()=>void load())">重新载入</button><button class="quiet-button" aria-label="关闭错误" @click="error=''">×</button></div></div>
  <div v-if="notice" class="feedback success" role="status">{{notice}}<button class="quiet-button" aria-label="关闭提示" @click="notice=''">×</button></div>
  <div v-if="recovery" class="feedback recover"><span>发现未保存的「{{recovery.name}}」草稿。</span><div><button class="quiet-button" @click="guard(()=>{setDraft(recovery!);recovery=undefined;})">恢复草稿</button><button class="quiet-button" @click="ignoreRecovery">忽略</button></div></div>
  <div v-if="loading" class="loading-state">正在载入本地角色库…</div>
  <div v-else-if="library" class="studio-layout">
   <aside class="role-sidebar" aria-label="角色目录"><div class="sidebar-top"><h2>角色库 <span>{{roles.length}}</span></h2><button class="icon-button" aria-label="新增角色" title="新增角色" @click="createRole">＋</button></div><label class="search-box"><span>⌕</span><input v-model="query" type="search" aria-label="搜索角色" placeholder="搜索名称或代号" /></label><div class="role-filters"><select v-model="team" aria-label="筛选角色类型"><option value="all">全部类型</option><option v-for="(label,key) in TEAM_LABELS" :key="key" :value="key">{{label}}</option></select><button :class="{active:archived}" @click="archived=!archived">{{archived?'归档中':'查看归档'}}</button></div><div class="role-list"><button v-for="role in roles" :key="role.id" class="role-item" :class="{selected:draft?.id===role.id}" @click="selectRole(role)"><span class="role-initial" :class="role.team">{{role.name.slice(0,1)}}</span><span class="role-item-copy"><strong>{{role.name}}</strong><small>{{role.base?.entryId.slice(-4)??'自定义角色'}} · {{role.branches.length}} 个分支</small></span><span v-if="role.origin==='custom'||role.revision>1" class="local-dot" title="本地配置"></span></button><p v-if="!roles.length" class="sidebar-empty">没有匹配的角色。<button class="text-button" @click="createRole">创建一个新角色</button></p></div><button class="sidebar-add" @click="createRole">＋ 新建角色</button></aside>
   <main class="editor-panel" v-if="draft" aria-label="角色配置编辑器">
    <div class="editor-heading"><div class="role-title-group"><span class="large-role-initial" :class="draft.team">{{draft.name.slice(0,1)}}</span><div><div class="role-title-row"><h2>{{draft.name}}</h2><span v-if="!draft.enabled" class="pill">已归档</span><span v-else class="type-pill" :class="draft.team">{{TEAM_LABELS[draft.team]}}</span></div><p>{{draft.base?.entryId??'自定义角色'}} <span>／</span> 本地版本 {{draft.revision||'草稿'}} <span v-if="dirty" class="unsaved">· 未保存</span></p></div></div><button class="quiet-button" @click="cloneRole">复制角色</button></div>
    <nav class="editor-tabs" aria-label="配置分区"><button :class="{active:tab==='branches'}" @click="tab='branches'">分支与字段 <span>{{draft.branches.length}}</span></button><button :class="{active:tab==='role'}" @click="tab='role'">角色资料</button><button :class="{active:tab==='versions'}" @click="tab='versions'">版本历史 <span>{{draft.history.length}}</span></button></nav>
    <div class="editor-content" v-if="tab==='branches'">
     <div class="section-caption"><div><h3>记录流程</h3><p>选择一个分支，配置它的输入和生成文字。</p></div><button class="secondary-button" @click="addBranch">＋ 添加分支</button></div>
     <div class="branch-picker"><button v-for="(item,index) in draft.branches" :key="item.id" :class="{active:branchId===item.id}" @click="branchId=item.id"><span>{{String(index+1).padStart(2,'0')}}</span>{{item.name}}</button></div>
     <template v-if="branch">
      <div class="flow-strip"><span><i>1</i> 触发时点</span><b>→</b><span><i>2</i> 填写字段</span><b>→</b><span><i>3</i> 生成记录</span><b>→</b><span class="flow-end">✓ 可预览</span></div>
      <section class="configuration-section"><div class="section-label"><span class="step-number">01</span><h3>分支与时点</h3><div class="branch-tools"><button class="icon-button" aria-label="上移分支" @click="moveBranch(-1)">↑</button><button class="icon-button" aria-label="下移分支" @click="moveBranch(1)">↓</button><button class="text-button danger-text" @click="deleteBranch">删除分支</button></div></div><div class="two-controls"><label class="control"><span>分支名称</span><input v-model="branch.name" aria-label="分支名称" /></label><label class="control"><span>出现时点</span><input v-model="branch.timing" aria-label="出现时点" /></label></div></section>
      <section class="configuration-section"><div class="section-label"><span class="step-number">02</span><h3>填写字段</h3><span class="section-count">{{branch.fields.length}} 个</span><button class="text-button add-field-button" @click="addField">＋ 添加字段</button></div><div class="field-stack"><div v-for="(field,index) in branch.fields" :key="field.id" class="field-card"><div class="field-card-top"><span class="field-index">{{String(index+1).padStart(2,'0')}}</span><input v-model="field.label" :aria-label="'字段'+(index+1)+'名称'" placeholder="字段名称" /><select v-model="field.kind" :aria-label="'字段'+(index+1)+'控件'" @change="updateKind(field)"><option v-for="(label,key) in FIELD_LABELS" :key="key" :value="key">{{label}}</option></select><button class="icon-button remove-field" :aria-label="'删除字段'+(index+1)" @click="branch!.fields=branch!.fields.filter(f=>f.id!==field.id)">×</button></div><div class="field-details"><label class="key-control"><span>变量</span><input v-model="field.key" :aria-label="'字段'+(index+1)+'变量'" spellcheck="false" /></label><label class="field-required"><input type="checkbox" v-model="field.required" />必填</label><button class="variable-chip" @click="insertField(field)" :title="'插入变量 '+field.key"><span v-text="'{{'+field.key+'}} ↗'"></span></button></div><label class="control compact"><span>示例值</span><input v-model="field.example" :aria-label="'字段'+(index+1)+'示例值'" placeholder="用示例值初始化右侧试填" /></label><details class="field-more"><summary>说明与选项</summary><label class="control"><span>填写说明</span><textarea v-model="field.help" :aria-label="'字段'+(index+1)+'说明'" rows="2" /></label><label v-if="field.kind==='select'" class="control"><span>预设选项 · 每行一个，自定义始终可用</span><textarea :value="field.options.join('\n')" :aria-label="'字段'+(index+1)+'选项'" rows="3" @input="updateOptions(field,$event)" /></label></details></div><p v-if="!branch.fields.length" class="muted">当前是固定句式。添加字段后，点击变量标签即可插入。</p></div></section>
      <section class="configuration-section"><div class="section-label"><span class="step-number">03</span><h3>生成句式</h3><span class="template-hint">点击字段变量插入</span></div><div class="result-template-tools"><label class="control"><span>正在编辑的结果句式</span><select v-model="variantId" aria-label="编辑结果句式"><option value="">{{branch.templateLabel??'默认句式'}}</option><option v-for="item in branch.variants" :key="item.id" :value="item.id">{{item.label}}</option></select></label><button class="text-button" @click="addVariant">＋ 添加句式</button><button v-if="variant" class="text-button danger-text" @click="deleteVariant">删除句式</button></div><label class="control"><span>句式名称</span><input v-if="variant" v-model="variant.label" aria-label="结果句式名称" /><input v-else :value="branch.templateLabel??'默认句式'" @input="branch.templateLabel=($event.target as HTMLInputElement).value" aria-label="结果句式名称" /></label><textarea class="template-editor" v-model="templateText" aria-label="生成句式" rows="4" spellcheck="false" /><p class="template-footer"><code class="code-tag" v-text="'{{field_key}}'"></code> 使用变量拼接句子，换行会保留。</p><label class="control branch-note"><span>分支说明与条件</span><textarea v-model="branch.notes" aria-label="分支说明与条件" rows="3" /></label><details v-if="branch.source" class="source-fields"><summary>来源填写规范 · {{branch.source.fields.length}} 项</summary><dl v-for="(spec,i) in branch.source.fields" :key="i"><dt>{{spec.label}} <small>{{spec.control}}</small></dt><dd>{{spec.detail}}</dd></dl></details></section>
     </template>
     <div v-else class="no-branches"><span>◇</span><h3>从一条记录开始</h3><p>这个角色没有专用填写分支。你可以继续使用通用记录，或创建自己的分支。</p><button class="secondary-button" @click="addBranch">＋ 添加第一个分支</button></div>
    </div>
    <div class="editor-content role-metadata" v-else-if="tab==='role'"><h3>角色资料</h3><p class="muted">名称可随时修改，稳定ID用来保留配置与历史的关联。</p><div class="two-controls"><label class="control"><span>角色名称</span><input v-model="draft.name" aria-label="角色名称" /></label><label class="control"><span>角色类型</span><select v-model="draft.team" aria-label="角色类型"><option v-for="(label,key) in TEAM_LABELS" :key="key" :value="key">{{label}}</option></select></label></div><label class="control"><span>技能描述</span><textarea v-model="draft.ability" aria-label="技能描述" rows="5" /></label><label class="control"><span>角色说明</span><textarea v-model="draft.notes" aria-label="角色说明" rows="3" /></label><div class="definition-id"><span>稳定ID</span><code>{{draft.id}}</code></div><div v-if="draft.base" class="definition-origin"><span>内置来源</span><p>{{draft.base.entryId}} · {{draft.base.proposalVersion}} · {{draft.base.reviewStatus==='approved'?'来源方案已有通过记录':'来源方案保留原审查状态'}}</p><small>本地修改单独保存为工作台配置版本。</small></div><details class="configuration-json"><summary>查看配置 JSON</summary><pre>{{JSON.stringify(draft,null,2)}}</pre></details><div class="archive-zone"><div><strong>{{draft.enabled?'删除角色':'恢复角色'}}</strong><p>{{draft.enabled?'移入归档，保留配置和历史版本。':'将这个角色恢复到当前角色库。'}}</p></div><button class="secondary-button" :class="{'danger-text':draft.enabled}" @click="archiveRole">{{draft.enabled?'删除角色':'恢复角色'}}</button></div></div>
    <div class="editor-content" v-else><h3>版本历史</h3><p class="muted">每次保存保留上一版本。恢复会生成新版本，最多保留最近30次修改。</p><div class="current-version"><span class="version-node"></span><div><strong>版本 {{draft.revision||'草稿'}} <span class="pill">当前</span></strong><p>{{draft.savedAt?new Date(draft.savedAt).toLocaleString('zh-CN'):'尚未保存到本机'}}</p></div></div><div v-for="version in draft.history" :key="version.revision" class="version-item"><span class="version-node"></span><div><strong>版本 {{version.revision}} · {{version.body.name}}</strong><p>{{version.body.branches.length}} 个分支 · {{version.savedAt?new Date(version.savedAt).toLocaleString('zh-CN'):'内置初始版本'}}</p></div><button class="text-button" @click="useHistory(version)">恢复此版本</button></div><p v-if="!draft.history.length" class="muted history-empty">保存一次修改后，上一版本会出现在这里。</p></div>
    <div v-if="issues.length" class="validation-panel" role="alert"><strong>保存前请完善 {{issues.length}} 处</strong><p v-for="item in issues.slice(0,6)" :key="item.path+item.message">{{item.path}}：{{item.message}}</p></div>
    <footer class="editor-save-bar"><span><i :class="{dirty}"></i>{{dirty?'有未保存的修改':'已与本机配置同步'}}<small>{{draft.branches.length}} 分支 · {{fieldCount}} 字段</small></span><div><button class="quiet-button" :disabled="!dirty||busy" @click="discard">放弃修改</button><button class="primary-button" :disabled="!dirty||issues.length>0||busy" @click="save">{{busy?'正在保存…':'保存角色'}} <span>↗</span></button></div></footer>
   </main>
   <main v-else class="editor-panel no-role"><h2>创建你的第一个角色</h2><p>也可以导入已有的角色库备份。</p><button class="primary-button" @click="createRole">＋ 新建角色</button></main>
   <RolePreview v-if="draft" :role="draft" :branch="branch" :role-names="names" />
  </div>
  <footer class="studio-footer"><span>BOTCreplay · 本地角色配置</span><span>角色 → 分支 → 字段 → 句式 → 预览</span><span>配置以 JSON 保存，可备份、可迁移。</span></footer>
  <div v-if="confirmation" class="modal-backdrop" @click.self="confirmation=undefined"><section class="studio-modal" role="dialog" aria-modal="true" :aria-label="confirmation.title"><span class="overline">ROLE STUDIO</span><h2>{{confirmation.title}}</h2><p>{{confirmation.text}}</p><div class="modal-actions"><button class="secondary-button" @click="confirmation=undefined">返回</button><button class="primary-button" @click="confirmAction">确认继续</button></div></section></div>
  <div v-if="imported" class="modal-backdrop"><section class="studio-modal" role="dialog" aria-modal="true" aria-label="导入角色库"><span class="overline">IMPORT LIBRARY</span><h2>导入角色库</h2><p>将用这份备份替换当前工作台配置。备份内含 {{imported.roles.length}} 个角色，其中 {{imported.roles.filter(r=>r.enabled).length}} 个可用角色。</p><p class="muted">当前角色库可以先导出备份；导入完成后自动保存到本机。</p><div class="modal-actions"><button class="secondary-button" @click="imported=undefined">取消</button><button class="secondary-button" @click="exportLibrary">先导出当前配置</button><button class="primary-button" :disabled="busy" @click="confirmImport">确认导入</button></div></section></div>
 </div>
</template>
