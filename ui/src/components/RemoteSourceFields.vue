<template>
  <div class="xm-conn">
    <div class="seg">
      <button type="button" :class="{ on: view.scheme === 'http' }" @click="setScheme('http')">http</button>
      <button type="button" :class="{ on: view.scheme === 'https' }" @click="setScheme('https')">https</button>
    </div>
    <TextInput :model-value="view.host" input-class="inp mono rsf-host" placeholder="host 或 ${HOST_REF}" @input="setHost" @keydown.enter="emit('test')" />
    <!-- 端口数值位升档 NInputNumber（隐藏步进钮保持 90px 窄形）；空=不拼端口串（formatHostRaw 兜底 9200 语义不变） -->
    <n-input-number :value="portNum" :min="1" :max="65535" :show-button="false" placeholder="9200" size="small"
      style="width:90px" class="mono rsf-port" @update:value="setPort" />
    <TextInput :model-value="view.username" input-class="inp mono rsf-user" placeholder="用户名（可空）" @input="setField('username', $event)" />
    <!-- 密码框 NInput password 档原生遮蔽（Firefox 不支持 -webkit-text-security 圆点遮蔽会露明文；
         内存流转口径不变），autocomplete=new-password（新凭据录入语义，较 off 防自动填充更稳）
         经 input-props 落真实 input -->
    <n-input :value="view.password" type="password" show-password-on="click" size="small"
      :input-props="{ autocomplete: 'new-password' }" placeholder="密码（可用${PWD_REF}）"
      @update:value="v => emitPatch({ password: v })" />
    <button v-if="testable" type="button" class="btn sm" :disabled="testBusy" @click="emit('test')"><PlugZap :size="12" /> {{ testBusy ? '检查中…' : '连接检查' }}</button>
  </div>
</template>

<script lang="ts">
/* hostRaw 拆/拼纯函数（导出供行为 spec 直测）。
 hostRaw 模式下父视图（ReindexAdvancedView）的 conn.host 承载完整
 "[scheme://]host[:port]" 串（ES remote source 的 host 口径），组件内拆成
 scheme/host/port 三段编辑、拼回单串回传。拼回恒等规则：拆不动的输入原样
 落 host 段、scheme/port 缺席即不拼——任何输入 x 都满足 format(parse(x)) === x。 */
interface HostRawView { scheme: string; host: string; port: string | number }
interface RemoteConn {
  scheme: 'http' | 'https' | '';
  host: string;
  port: number | string;
  username?: string;
  password?: string;
}
export function parseHostRaw(s: string): HostRawView {
  const m = String(s || '').match(/^(?:(https?):\/\/)?([^:/]*)(?::(\d+))?$/);
  /* 容错：正则拆不动（IPv6/畸形串）→ 整串进 host 段，拼回原样，不改用户输入 */
  if (!m) return { scheme: '', host: String(s || ''), port: '' };
  return { scheme: m[1] || '', host: m[2] || '', port: m[3] ? Number(m[3]) : '' };
}
export function formatHostRaw(v: HostRawView): string {
  const host = String(v.host ?? '');
  if (!host) return ''; /* host 清空 = 关掉远程源（与原单框清空即 v-if 消隐语义一致） */
  return (v.scheme ? v.scheme + '://' : '') + host + (v.port ? ':' + v.port : '');
}
</script>

<script setup lang="ts">
/* 两页远程源连接表单统一件（XmigrateView 手动模式 / ReindexAdvancedView 远程源三框合并）。
 纯展示件：状态与草稿策略留在父视图——Xmigrate 的 conn 草稿走 useScopedDraftState
 （password 由 redactDraft 掩埋不落盘 + 挂载清残留），RA 三字段不进 formDraft（凭据永不落盘）。
 DOM 锚点契约：容器类 .xm-conn 与 host 输入框 placeholder 以 "host" 开头、「连接检查」
 按钮文案——rebuildThreeState 挂载型 spec 以最终 DOM 查询这些特征，改名即破锁。 */
import { computed } from 'vue';
import { NInput, NInputNumber } from 'naive-ui';
import { PlugZap } from 'lucide-vue-next';
import TextInput from './TextInput.vue';

const props = withDefaults(defineProps<{
  /** 连接状态对象（父持有）；hostRaw 模式下 host 字段承载完整 URL 串 */
  conn: RemoteConn;
  /** RA 模式：host 单串含 scheme:port，组件内部拆/拼（见文件头 parseHostRaw/formatHostRaw） */
  hostRaw?: boolean;
  /** 渲染「连接检查」按钮（Xmigrate true；RA 远程源无检查动作） */
  testable?: boolean;
  testBusy?: boolean;
}>(), { hostRaw: false, testable: false, testBusy: false });

const emit = defineEmits<{
  (e: 'update:conn', v: RemoteConn): void;
  (e: 'test'): void;
}>();

/* 统一视图：hostRaw 拆 host 串，否则直接取 conn 字段（非 hostRaw 拆/拼恒等） */
const view = computed<HostRawView & { username: string; password: string }>(() => {
  const base = props.hostRaw ? parseHostRaw(props.conn.host) : { scheme: props.conn.scheme, host: props.conn.host, port: props.conn.port };
  return { ...base, username: props.conn.username || '', password: props.conn.password || '' };
});

function emitPatch(patch: Partial<HostRawView & { username?: string; password?: string }>) {
  if (props.hostRaw) {
    /* 拆/拼闭环：任一段编辑都从当前拆解视图出发拼回完整串，父侧 srcRemote 口径不变 */
    const next = { ...view.value, ...patch };
    emit('update:conn', { ...props.conn, host: formatHostRaw(next), username: next.username, password: next.password });
  } else {
    emit('update:conn', { ...props.conn, ...patch } as RemoteConn);
  }
}
function setScheme(s: 'http' | 'https') { emitPatch({ scheme: s }); }
function setHost(e: Event) { emitPatch({ host: (e.target as HTMLInputElement).value }); }
/* 端口受控显示值：空串/非有限数字回落 null（清空态），数字正常显示；
   非数字串仅在展示层被遮蔽，不编辑即不回写（树/连接对象上的原值不被破坏） */
const portNum = computed<number | null>(() => {
  const raw = view.value.port;
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
});
function setPort(v: number | null) {
  /* 原 v-model.number 口径：清空保持空串（connBody 的 port || 9200 兜底） */
  emitPatch({ port: v === null ? '' : v });
}
function setField(k: 'username' | 'password', e: Event) { emitPatch({ [k]: (e.target as HTMLInputElement).value }); }
</script>

<style scoped>
/* 类名随锚点契约迁自 XmigrateView（同名 scoped 规则父视图另有续跑弹窗/已选档案条在用，双处各自生效） */
.xm-conn { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
/* 端口数值位（NInputNumber）内部输入继承 mono，与相邻 .inp mono 同语言 */
.rsf-port :deep(.n-input__input-el) { font-family: var(--mono); }
/* 文本两件迁 TextInput：原内联 flex 份额经 :has 下探输入件根容器（Chromium 105+） */
.xm-conn > :deep(.ti:has(.rsf-host)) { flex: 2; }
.xm-conn > :deep(.ti:has(.rsf-user)) { flex: 1; }
/* 密码框 NInput password 档（Firefox 无 -webkit-text-security 圆点遮蔽会露明文）：
   flex 份额直接落 NInput 根（flex 1 + 130px 地板，与 host/用户名同预算） */
.xm-conn > :deep(.n-input) { flex: 1; min-width: 130px; }
</style>
