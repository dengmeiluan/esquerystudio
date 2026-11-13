/**
 * 九百六十三批：索引域权限面收口（新建索引弹窗/索引工作区/映射/别名/浏览器/优化向导/
 * Analysis/Synonyms 全链执行体守卫）。
 *
 * 矿相（962 范式延续）：点位隐藏（v-if）只挡鼠标路径——Enter、Ctrl+S、?create=1 深链、
 * 程序内直调（doPut/applyChecked/doReload 被内部链复用）都能绕过按钮门直达执行体，
 * 防线只剩后端 403。本批按「执行体首行早退」范式统一收口，并把分属不同页键的端点
 * 拆门（新建索引=create-index / 别名=alias-actions；应用勾选=index-settings/update /
 * force_merge=force-merge；热重载=reload-analyzers / 保存=analysis-update·synonyms-upsert）。
 *
 * 锁定口径：源码锁（readFileSync + toContain / toMatch），断言「门存在 + 执行体首行守卫
 * 紧随函数签名 + 旁路通道（Enter/深链/raw）已断」。行为面由各页既有挂载测试兜底。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
const cim = read('components/CreateIndexModal.vue');
const ih = read('views/IndexHubView.vue');
const isv = read('views/IndexSettingsView.vue');
const mp = read('views/MappingView.vue');
const md = read('views/MappingDesignerView.vue');
const alv = read('views/AliasesView.vue');
const bw = read('views/BrowserView.vue');
const io = read('views/IndexOptimizerView.vue');
const asv = read('views/AnalysisSettingsView.vue');
const sy = read('views/SynonymsManagerView.vue');

/* 执行体首行守卫定位：函数签名后（允许单行说明注释）第一个语句即权限早退 */
const guardAfter = (src: string, signature: string, cond: string) =>
  new RegExp(signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + ' \\{\\r?\\n(?:\\s+/\\*[^\\n]*\\*/\\r?\\n)*\\s+if \\(' + cond + '\\)').test(src);

describe('963-1 CreateIndexModal：创建/别名两端点分门（点位+Enter+执行体）', () => {
  it('两端点各自 canEndpoint（create-index / alias-actions，均按 store.target 裁决）', () => {
    expect(cim).toContain("import { useAuthStore } from '../stores/auth';");
    expect(cim).toContain("const canCreate = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target));");
    expect(cim).toContain("const canAlias = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/alias-actions', store.target));");
  });
  it('名称输入 Enter 走 canSubmit && canCreate；创建钮 disabled 增 !canCreate', () => {
    expect(cim).toContain('@keydown.enter="canSubmit && canCreate && doCreate()"');
    expect(cim).toContain(':disabled="!canSubmit || creating || !canCreate"');
  });
  it('别名输入按 canAlias 禁用并 title 说明', () => {
    expect(cim).toContain(':disabled="!canAlias" title="别名挂载需别名管理权限"');
  });
  it('doCreate 首行 canCreate 早退；带别名但无别名权限时先拦（防索引建成别名 403 半成品）', () => {
    expect(cim).toMatch(/async function doCreate\(\) \{\r?\n\s+\/\*[^\n]*\*\/\r?\n\s+if \(!canCreate\.value\) \{ store\.notify\('warning', '新建索引需索引创建权限'\); return; \}/);
    expect(cim).toContain("if (alias.value.trim() && !canAlias.value) { store.notify('warning', '别名挂载需别名管理权限'); return; }");
  });
});

describe('963-2 IndexHubView：弹窗卸载/查看态编辑/结果表 editable/执行体守卫', () => {
  it('CreateIndexModal 以 v-if="canCreateIdx" 彻底卸载（堵 ?create=1 深链）', () => {
    expect(ih).toContain('<CreateIndexModal v-if="canCreateIdx" :show="createOpen === \'1\'"');
  });
  it('查看态「编辑」钮 canWrite；docs/query 两 tab 的 ResultTable/AltHitsViews 全部改绑定', () => {
    expect(ih).toContain('<button v-if="canWrite" class="btn sm pri" @click="docEditMode = true">');
    expect(ih.match(/:editable="canWrite"/g)?.length, 'docs/query 两域 ResultTable 2 处 + AltHitsViews json/tree 4 处（971 cards 编辑退役，编辑=导航条钮+抽屉显式通道）').toBe(6);
    expect(ih).not.toMatch(/(?<!:)\beditable\s+@/);
  });
  it('删除执行体首行按端点归属守卫（文档 delete-by-id / 索引 delete-index）', () => {
    expect(guardAfter(ih, 'async function askDelDoc(hit: SearchHit)', '!canDeleteDoc\\.value')).toBe(true);
    expect(guardAfter(ih, 'async function askBatchDel(ids: string[])', '!canDeleteDoc\\.value')).toBe(true);
    expect(guardAfter(ih, 'async function askDelIndex()', '!canOps\\.value')).toBe(true);
    expect(ih).toContain("if (!canOps.value) { store.notify('warning', '删除需专项或 ADMIN 角色'); return; }");
  });
  it('raw 系四执行体（opRaw/askForceMerge/askClose/askOpen）首行 canAdmin 守卫', () => {
    expect(guardAfter(ih, 'async function opRaw(method: string, path: string, okMsg: string, reloadList = false)', '!canAdmin\\.value')).toBe(true);
    expect(guardAfter(ih, 'async function askForceMerge()', '!canAdmin\\.value')).toBe(true);
    expect(guardAfter(ih, 'async function askClose()', '!canAdmin\\.value')).toBe(true);
    expect(guardAfter(ih, 'async function askOpen()', '!canAdmin\\.value')).toBe(true);
    expect(ih.match(/'原始透传需 ADMIN 角色'/g)?.length).toBe(4);
  });
  it('applySetting 首行 canSettings 守卫（改 Setting 与 raw 分离）', () => {
    expect(guardAfter(ih, 'async function applySetting(body: Record<string, any>, okMsg: string)', '!canSettings\\.value')).toBe(true);
    expect(ih).toContain("if (!canSettings.value) { store.notify('warning', '索引设置需专项角色'); return; }");
  });
});

describe('963-3 IndexSettingsView：save() 首行 canOps 早退', () => {
  it('直存回退路径也受门（Guard edAction 之外的函数直调）', () => {
    expect(guardAfter(isv, 'async function save()', '!canOps\\.value')).toBe(true);
    expect(isv).toContain("if (!canOps.value) { store.notify('warning', '索引设置保存需专项角色'); return; }");
  });
});

describe('963-4 MappingView：Enter 闸 + 四执行体首行 canOps 守卫', () => {
  it('useModalEnter 第三参接 canOps（与提交钮 v-if 同口径）', () => {
    expect(mp).toContain('useModalEnter(addOpen, askPutMapping, () => canOps.value);');
    expect(mp).toContain('useModalEnter(settingsOpen, askPutSettings, () => canSettings.value);');
  });
  it('askPut/doPut 两两执行体首行守卫', () => {
    expect(guardAfter(mp, 'async function askPutMapping()', '!canOps\\.value')).toBe(true);
    expect(guardAfter(mp, 'async function doPutMapping()', '!canOps\\.value')).toBe(true);
    expect(guardAfter(mp, 'async function askPutSettings()', '!canSettings\\.value')).toBe(true);
    expect(guardAfter(mp, 'async function doPutSettings()', '!canSettings\\.value')).toBe(true);
  });
});

describe('963-5 MappingDesignerView：页头加字段入口 + doAdd 守卫', () => {
  it('加字段钮 canOps；doAdd 首行早退', () => {
    expect(md).toContain('<button v-if="canOps" class="btn primary sm" @click="showAdd = true" :disabled="!tree.length">');
    expect(guardAfter(md, 'async function doAdd()', '!canOps\\.value')).toBe(true);
  });
});

describe('963-6 AliasesView：创建面板提交/Enter + 五执行体守卫', () => {
  it('创建提交钮 canOps；别名输入 Enter 路径先检 canOps', () => {
    expect(alv).toContain('<button v-if="canOps" class="btn sm primary" @click="doCreate" :disabled="!cAlias || !cIndex || acting">');
    expect(alv).toContain('@keydown.enter="canOps && cAlias && cIndex && !acting && doCreate()"');
  });
  it('doCreate/execActions/doSwitch/setWrite/unbind 首行守卫（共享写入也收口）', () => {
    expect(guardAfter(alv, 'async function doCreate()', '!canOps\\.value')).toBe(true);
    expect(guardAfter(alv, 'async function execActions(actions: any[], okMsg: string, opts?: { stayOpen?: boolean }): Promise<boolean>', '!canOps\\.value')).toBe(true);
    expect(guardAfter(alv, 'async function doSwitch()', '!canOps\\.value')).toBe(true);
    expect(guardAfter(alv, 'async function setWrite(g: Group, idx: string)', '!canOps\\.value')).toBe(true);
    expect(guardAfter(alv, 'async function unbind(alias: string, index: string)', '!canOps\\.value')).toBe(true);
  });
});

describe('963-7 BrowserView：弹窗卸载/深链文档改 GET /cluster/doc/两执行体守卫', () => {
  it('CreateIndexModal 以 v-if="canCreateIdx" 挂载', () => {
    expect(bw).toContain('<CreateIndexModal v-if="canCreateIdx" v-model:show="createOpen" @created="goHub" />');
  });
  it('openLinkedDoc 走 api.getDoc（VIEWER 可读），不再借道 ADMIN raw', () => {
    expect(bw).toContain('const r: any = await api.getDoc(idx, id);');
    expect(bw).not.toContain("await api.raw('GET', `/${idx}/_doc/");
  });
  it('askFm 首行 canForceMerge、askDel 首行 canOps', () => {
    expect(guardAfter(bw, 'async function askFm(idx: IndexCat)', '!canForceMerge\\.value')).toBe(true);
    expect(guardAfter(bw, 'async function askDel(idx: IndexCat)', '!canOps\\.value')).toBe(true);
  });
});

describe('963-8 IndexOptimizerView：应用勾选与 force_merge 拆门', () => {
  it('canApply=index-settings/update 端点，应用钮 v-if 改 canApply；force_merge 钮继续 canOps', () => {
    expect(io).toContain("const canApply = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/index-settings/update', store.target));");
    expect(io).toContain('<button v-if="canApply" class="btn sm pri" :disabled="!hasChecked || applying" @click="applyChecked">');
    expect(io).toContain('<button v-if="canOps" class="btn sm warn" :disabled="segMerging" @click="runForceMerge">');
  });
  it('applyChecked 首行 canApply、runForceMerge 首行 canOps', () => {
    expect(guardAfter(io, 'async function applyChecked()', '!canApply\\.value')).toBe(true);
    expect(guardAfter(io, 'async function runForceMerge()', '!canOps\\.value')).toBe(true);
  });
});

describe('963-9 AnalysisSettingsView：热重载拆 reload-analyzers 门', () => {
  it('canReload 定义 + 热重载钮 v-if=canReload（保存钮仍 canOps）', () => {
    expect(asv).toContain("const canReload = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reload-analyzers', store.target));");
    expect(asv).toContain('<button v-if="canReload" class="btn ghost sm" @click="doReload" :disabled="!index || busy">');
    expect(asv).toContain('<button v-if="canOps" class="btn sm pri" @click="doSave"');
  });
  it('doReload 首行 canReload、doSave 首行 canOps', () => {
    expect(guardAfter(asv, 'async function doReload()', '!canReload\\.value')).toBe(true);
    expect(guardAfter(asv, 'async function doSave()', '!canOps\\.value')).toBe(true);
  });
});

describe('963-10 SynonymsManagerView：热重载拆 reload-analyzers 门', () => {
  it('canReload 定义 + 热重载钮 v-if=canReload（下发钮仍 canOps）', () => {
    expect(sy).toContain("const canReload = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reload-analyzers', store.target));");
    expect(sy).toContain('<button v-if="canReload" class="btn ghost sm" @click="doReload" :disabled="!index || busy">');
    expect(sy).toMatch(/<button v-if="canOps" class="btn primary sm" :disabled="!index \|\| !parsed\.length \|\| busy/);
  });
  it('doReload 首行 canReload、doSave 首行 canOps（doSave 内链复用 doReload 也受门）', () => {
    expect(guardAfter(sy, 'async function doReload()', '!canReload\\.value')).toBe(true);
    expect(guardAfter(sy, 'async function doSave()', '!canOps\\.value')).toBe(true);
  });
});
