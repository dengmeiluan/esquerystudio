<template>
  <div class="xm-conn">
    <div class="seg">
      <button type="button" :class="{ on: view.scheme === 'http' }" @click="setScheme('http')">http</button>
      <button type="button" :class="{ on: view.scheme === 'https' }" @click="setScheme('https')">https</button>
    </div>
    <input :value="view.host" class="inp mono" placeholder="host 或 ${HOST_REF}" style="flex:2" @input="setHost" @keydown.enter="emit('test')" />
    <input :value="view.port" class="inp mono" type="number" placeholder="9200" style="width:90px" @input="setPort" />
    <input :value="view.username" class="inp mono" placeholder="用户名（可空）" style="flex:1" @input="setField('username', $event)" />
    <input :value="view.password" class="inp mono pw-mask" type="text" autocomplete="off" placeholder="密码（可用${PWD_REF}）" style="flex:1;min-width:130px" @input="setField('password', $event)" />
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
import { PlugZap } from 'lucide-vue-next';

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
function setPort(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  /* 原实现 v-model.number 口径：空串保持空（connBody 的 port || 9200 兜底） */
  emitPatch({ port: raw === '' ? '' : Number(raw) });
}
function setField(k: 'username' | 'password', e: Event) { emitPatch({ [k]: (e.target as HTMLInputElement).value }); }
</script>

<style scoped>
/* 类名随锚点契约迁自 XmigrateView（同名 scoped 规则父视图另有续跑弹窗/已选档案条在用，双处各自生效） */
.xm-conn { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
</style>
