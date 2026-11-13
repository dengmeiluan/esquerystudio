<template>
  <n-modal :show="show" preset="card" title="新建索引" style="width:640px;max-width:94vw" :bordered="false"
    @update:show="v => emit('update:show', v)">
    <div class="cim">
      <!-- 索引名 + 实时校验清单 -->
      <div class="cim-row">
        <label class="cim-lb">索引名 <span class="cim-req">*</span></label>
        <input ref="nameRef" v-model="name" class="inp mono" placeholder="如 my-index-2026"
          style="flex:1" @keydown.enter="canSubmit && canCreate && doCreate()" />
      </div>
      <div v-if="name" class="cim-checks">
        <div v-for="c in checks" :key="c.t" class="cim-check" :class="c.lv">
          <CheckCircle2 v-if="c.lv === 'ok'" :size="12" />
          <AlertTriangle v-else-if="c.lv === 'warn'" :size="12" />
          <XCircle v-else :size="12" />
          {{ c.t }}
        </div>
      </div>

      <!-- 分片 / 副本 / 别名 -->
      <div class="cim-grid">
        <div class="cim-row">
          <label class="cim-lb">主分片数</label>
          <input v-model.number="shards" type="number" min="1" max="1024" class="inp mono" style="width:90px" />
        </div>
        <div class="cim-row">
          <label class="cim-lb">副本数</label>
          <input v-model.number="replicas" type="number" min="0" max="10" class="inp mono" style="width:90px" />
        </div>
        <div class="cim-row" style="flex:1">
          <label class="cim-lb">别名（可选）</label>
          <input v-model="alias" class="inp mono" placeholder="创建后原子挂载" style="flex:1"
            :disabled="!canAlias" title="别名挂载需别名管理权限" />
        </div>
      </div>
      <div class="cim-tip">
        主分片数创建后<b>不可修改</b>（改需重建）；副本数可随时热调。单分片适合 &lt;30GB 的中小索引。
      </div>

      <!-- 高级：settings / mapping JSON -->
      <div class="cim-adv-toggle" role="button" tabindex="0" :aria-expanded="advOpen" @click="advOpen = !advOpen" @keydown.enter.prevent="advOpen = !advOpen" @keydown.space.prevent="advOpen = !advOpen">
        <component :is="advOpen ? ChevronDown : ChevronRight" :size="13" />
        高级配置（settings / mapping JSON）
        <span v-if="advBadge" class="cim-adv-badge">{{ advBadge }}</span>
      </div>
      <template v-if="advOpen">
        <!-- 两个 Monaco 接 dsl-assist（结构化 JSON 语境非 search body，fields 空数组——
 补全按通用检查降级，不误导字段候选）；：bodyKind 显式分档
 （MonacoEditor 缺省 ?? 'search' 会冒充查询体——settings/mapping 目录现成，各归各位） -->
        <div class="cim-adv-lb">Settings JSON <span class="cim-adv-sub">与上方表单深合并，同键以此处为准</span></div>
        <!-- P1-1：档路由静态 lint 划线挂点（lintSettingsBody，见 script queueCimSettingsMarkers） -->
        <MonacoEditor ref="cimSettingsMonaco" v-model="advSettings" height="120px" :dsl-assist="{ fields: () => [], bodyKind: () => 'settings' }" />
        <div v-if="advSettingsErr" class="cim-jsonerr">{{ advSettingsErr }}</div>
        <div class="cim-adv-lb">Mapping JSON <span class="cim-adv-sub">7.x typeless 直传；6.x 后端自动包 _doc</span></div>
        <!-- P1-1：档路由静态 lint 划线挂点（lintMappingBody，见 script queueCimMappingMarkers） -->
        <MonacoEditor ref="cimMappingMonaco" v-model="advMapping" height="150px" :dsl-assist="{ fields: () => [], bodyKind: () => 'mapping' }" />
        <div v-if="advMappingErr" class="cim-jsonerr">{{ advMappingErr }}</div>
      </template>

      <!-- 最终请求预览（可视化确认，不用猜合并结果）；
 裸 JSON → highlightJson 高亮（SnapshotsView 同款范式，输出已转义 v-html 安全）；
 复制请求钮 + 预览高度三档 usePref 记忆（默认 200） -->
      <div class="cim-adv-toggle" role="button" tabindex="0" :aria-expanded="previewOpen" @click="previewOpen = !previewOpen" @keydown.enter.prevent="previewOpen = !previewOpen" @keydown.space.prevent="previewOpen = !previewOpen">
        <component :is="previewOpen ? ChevronDown : ChevronRight" :size="13" />
        请求预览
      </div>
      <div v-if="previewOpen" class="cim-preview-bar">
        <span class="cim-adv-sub">高度</span>
        <input v-model.number="previewH" type="number" min="120" step="40" class="cim-prev-h mono" aria-label="请求预览高度（像素）" title="预览高度（px，跨会话记忆）" />
        <button class="btn sm ghost" title="复制完整请求预览" @click="copyRequest"><Copy :size="11" /> 复制请求</button>
      </div>
      <div v-if="previewOpen" class="cim-preview-wrap" :style="{ '--cim-prev-h': previewH + 'px' }">
        <pre v-if="previewOpen" class="cim-preview mono scroll-y json-view" v-html="previewHtml"></pre>
      </div>
    </div>

    <template #footer>
      <div style="display:flex;align-items:center;gap:var(--sp-2)">
        <span v-if="creating" class="cim-tip" style="margin:0">正在创建…</span>
        <div style="flex:1"></div>
        <button class="btn" @click="emit('update:show', false)">取消</button>
        <button class="btn pri" :disabled="!canSubmit || creating || !canCreate" @click="doCreate">
          <Plus :size="13" /> 创建索引
        </button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { NModal } from 'naive-ui';
import { Plus, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight, Copy } from 'lucide-vue-next';
import MonacoEditor from './MonacoEditor.vue';
import { lintSettingsBody, lintMappingBody } from '../utils/dslLint'; /* P1-1：档路由静态 lint */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P1-1：划线防抖统一件 */
import { api } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { tryParse, highlightJson } from '../utils/jsonc';
import { friendlyEsError } from '../utils/esError';
import { copyText } from '../utils/format';
import { usePref } from '../composables/urlState';
import { useModalEnter } from '../composables/useModalEnter';

/* 新建索引统一入口。此前 createIndex 全站唯一入口藏在配置实验室三层深，
 「增」是 CRUD 里的二等公民——这里做成可复用组件挂 IndexHub / Browser / 命令面板。 */

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'created', name: string): void }>();

const store = useAppStore();
/* 新建索引落 /cluster/create-index（属 config-validator 页）、别名挂载落 /cluster/alias-actions
 （属 aliases 页）——两个端点分属不同页键，conn 模型下必须各判各的门 */
const auth = useAuthStore();
const canCreate = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target));
const canAlias = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/alias-actions', store.target));
const nameRef = ref<HTMLInputElement>();
const name = ref('');
const shards = ref(1);
const replicas = ref(1);
const alias = ref('');
const advOpen = ref(false);
const previewOpen = ref(false);
const advSettings = ref('{\n}');
const advMapping = ref('{\n  "properties": {\n  }\n}');
const creating = ref(false);

/* ═══ P1-1：档路由静态 lint（高级配置双编辑器划线通道） ═══
 lintSettingsBody/lintMappingBody 直接 import 纯函数消费（DevTools dtLint 档路由同源）；
 非法 JSON 静默返 []，setMarkers([]) 即清旧划线（DevTools 同契约）。零请求、零阻塞，
 提交门仍是既有 advSettingsErr/advMappingErr 合法性链路。 */
const cimSettingsMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const cimMappingMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const queueCimSettingsMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintSettingsBody> = [];
  try { findings = lintSettingsBody(JSON.parse(advSettings.value || '')); } catch { findings = []; }
  cimSettingsMonaco.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
const queueCimMappingMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintMappingBody> = [];
  try { findings = lintMappingBody(JSON.parse(advMapping.value || '')); } catch { findings = []; }
  cimMappingMonaco.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(advSettings, () => { queueCimSettingsMarkers(); }, { immediate: true });
watch(advMapping, () => { queueCimMappingMarkers(); }, { immediate: true });

watch(() => props.show, async (v) => {
  if (v) { await nextTick(); nameRef.value?.focus(); }
});

/* ═══ 索引名实时校验（ES 官方命名规则逐条可视化） ═══ */
const ILLEGAL = /[\\/*?"<>|,# :]/;
interface Check { t: string; lv: 'ok' | 'err' | 'warn' }
const checks = computed<Check[]>(() => {
  const n = name.value;
  const out: Check[] = [];
  const push = (pass: boolean, okT: string, errT: string, warn = false) =>
    out.push(pass ? { t: okT, lv: 'ok' } : { t: errT, lv: warn ? 'warn' : 'err' });
  push(n === n.toLowerCase(), '全小写', '必须全小写（含大写字母不被 ES 接受）');
  push(!ILLEGAL.test(n), '无非法字符', '含非法字符（\\ / * ? " < > | 空格 , # :）');
  push(!/^[-_+]/.test(n), '开头合法', '不能以 - _ + 开头');
  push(n !== '.' && n !== '..', '非保留名', '不能是 . 或 ..');
  push(new TextEncoder().encode(n).length < 255, '长度合规', '超过 255 字节上限');
  const dup = store.indices.some(i => i.index === n);
  push(!dup, '名称未被占用', '同名索引已存在（后端也会拒绝）');
  if (n.startsWith('.')) out.push({ t: '以 . 开头将被视为系统/隐藏索引，请确认这是有意为之', lv: 'warn' });
  return out;
});
const nameOk = computed(() => !!name.value && !checks.value.some(c => c.lv === 'err'));

/* ═══ 高级 JSON 实时校验（仅在非空模板时才拦截） ═══ */
const isBlankJson = (s: string) => { const o = tryParse(s); return !!o && Object.keys(o).length === 0; };
const advSettingsErr = computed(() =>
  advSettings.value.trim() && !tryParse(advSettings.value) ? 'Settings 不是合法 JSON' : '');
const advMappingErr = computed(() =>
  advMapping.value.trim() && !tryParse(advMapping.value) ? 'Mapping 不是合法 JSON' : '');
const advBadge = computed(() => {
  const parts: string[] = [];
  if (advSettings.value.trim() && !isBlankJson(advSettings.value)) parts.push('settings');
  const m = tryParse(advMapping.value);
  if (m && Object.keys(m.properties || {}).length) parts.push('mapping');
  return parts.join(' + ');
});

const canSubmit = computed(() =>
  nameOk.value && shards.value >= 1 && replicas.value >= 0 && !advSettingsErr.value && !advMappingErr.value);

/* ═══ 合并策略：表单为基底，高级 JSON 深合并覆盖 ═══ */
function deepMerge(base: any, over: any): any {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}
const finalSettings = computed(() => {
  const base = { index: { number_of_shards: shards.value || 1, number_of_replicas: replicas.value ?? 1 } };
  const adv = advOpen.value ? tryParse(advSettings.value) : null;
  return adv && Object.keys(adv).length ? deepMerge(base, adv) : base;
});
const finalMapping = computed(() => {
  if (!advOpen.value) return null;
  const m = tryParse(advMapping.value);
  return m && Object.keys(m.properties || m).length ? m : null;
});
const previewText = computed(() => {
  const body: any = { settings: finalSettings.value };
  if (finalMapping.value) body.mappings = finalMapping.value;
  let txt = `PUT /${name.value || '<索引名>'}\n` + JSON.stringify(body, null, 2);
  if (alias.value.trim()) txt += `\n\nPOST /_aliases  →  add { index: ${name.value || '<索引名>'}, alias: ${alias.value.trim()} }`;
  return txt;
});
/* 预览裸 JSON → highlightJson 着色（jsonc399 契约：输出先 HTML 转义，v-html 无注入面；
 非_JSON 前后缀（PUT 行/别名行）正则不命中原样保留，着色容错） */
const previewHtml = computed(() => highlightJson(previewText.value));
/* 预览高度 usePref（默认 200=原封顶值），number input 直绑自动落盘 */
const previewH = usePref('cim.previewH', 200);
async function copyRequest() {
  const ok = await copyText(previewText.value);
  store.notify(ok ? 'success' : 'error', ok ? '请求预览已复制' : '复制失败，请手动选中后 Ctrl+C');
}

async function doCreate() {
  /* 执行体收口：深链 ?create=1 / 命令面板 / Enter 通道同汇入本函数，点位隐藏挡不住旁路 */
  if (!canCreate.value) { store.notify('warning', '新建索引需索引创建权限'); return; }
  /* 别名挂载是第二步独立写端点——无别名权限时先拦，避免索引建成后 alias 403 的半成品 */
  if (alias.value.trim() && !canAlias.value) { store.notify('warning', '别名挂载需别名管理权限'); return; }
  if (!canSubmit.value || creating.value) return;
  creating.value = true;
  const idx = name.value.trim();
  try {
    await api.createIndex(idx, JSON.stringify(finalSettings.value),
      finalMapping.value ? JSON.stringify(finalMapping.value) : undefined);
    /* 别名挂载失败降级为 warn：索引本体已建成，不整体回滚误导用户 */
    const al = alias.value.trim();
    if (al) {
      try {
        await api.aliasActions(JSON.stringify({ actions: [{ add: { index: idx, alias: al } }] }));
      } catch (e: any) {
        /* A：ES 错误友好化——别名挂载失败原因可读化 */
        store.notify('warning', `索引已创建，但别名 ${al} 挂载失败：` + friendlyEsError(String(e?.message ?? e)));
      }
    }
    store.notify('success', '索引已创建：' + idx);
    store.loadIndices();
    emit('created', idx);
    emit('update:show', false);
    name.value = ''; alias.value = '';
  } catch (e: any) {
    /* A：ES 错误友好化（创建失败原因可读化） */
    store.notify('error', '创建失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    creating.value = false;
  }
}
/* 新建索引弹窗 Enter=创建（doCreate 自带 canSubmit+creating 双重防重入，
 无需外部 can 闸；名称是单行 INPUT，settings/mapping 编辑器是 TEXTAREA 天然放行） */
useModalEnter(computed(() => props.show), doCreate);
</script>

<style scoped>
/* 编辑器外框退役（约定③）——monaco-host 是 MonacoEditor 根、携本组件
 scope id，本弹窗仅 Settings/Mapping 两处直挂 Monaco，scoped 裸类规则直接命中
 （MappingView 弹窗先例）；cim-adv-lb 标签行自承分界 */
.monaco-host { border: none; border-radius: 0; }
.cim { display: flex; flex-direction: column; gap: var(--sp-2h); }
.cim-row { display: flex; align-items: center; gap: var(--sp-2); }
.cim-lb { font-size: var(--fs-sm); color: var(--tx1); flex-shrink: 0; }
.cim-req { color: var(--err); }
.cim-grid { display: flex; gap: var(--sp-4); align-items: center; flex-wrap: wrap; }
.cim-checks { display: flex; flex-wrap: wrap; gap: var(--sp-1) 14px; padding: var(--sp-0) var(--sp-0) 0; }
.cim-check { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); }
.cim-check.ok { color: var(--ok); }
.cim-check.err { color: var(--err); }
.cim-check.warn { color: var(--warn); }
.cim-tip { font-size: var(--fs-xs); color: var(--tx2); line-height: 1.6; }
.cim-tip b { color: var(--warn); }
.cim-adv-toggle { display: flex; align-items: center; gap: 5px; font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; user-select: none; padding-top: var(--sp-0); }
.cim-adv-toggle:hover { color: var(--ac-hi); }
.cim-adv-badge { font-size: var(--fs-2xs); color: var(--ac-hi); background: var(--ac-soft); padding: 0 7px; border-radius: 99px; }
.cim-adv-lb { font-size: var(--fs-xs); color: var(--tx2); }
.cim-adv-sub { font-size: var(--fs-2xs); opacity: .75; }
.cim-jsonerr { font-size: var(--fs-xs); color: var(--err); }
.cim-preview { font-size: var(--fs-xs); color: var(--tx1); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m); padding: var(--sp-2) var(--sp-2h); margin: 0; max-height: var(--cim-prev-h, 200px); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
/* 预览工具行（高度档 + 复制请求）与预览体 */
.cim-preview-bar { display: flex; align-items: center; gap: var(--sp-1h); }
.cim-prev-h { width: 64px; height: 24px; padding: 0 var(--sp-1h); font-size: var(--fs-xs); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); }
</style>
