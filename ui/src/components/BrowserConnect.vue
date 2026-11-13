<template>
  <Teleport to="body">
    <div v-if="show" class="bc-mask" role="dialog" aria-modal="true" aria-label="连接 Elasticsearch">
      <div class="bc-card">
        <div class="bc-kicker">ESQueryStudio · BROWSER MODE</div>
        <h2>连接 Elasticsearch</h2>
        <p class="bc-sub">纯前端模式：查询直接从浏览器发往集群；凭据只保存在本机扩展存储。</p>
        <label class="bc-label">集群地址</label>
        <input ref="urlInput" v-model.trim="url" class="ipt bc-ipt mono" placeholder="http://es-host:9200" @keyup.enter="connect" />
        <div class="bc-auth" role="group" aria-label="认证方式">
          <button class="bc-auth-btn" :class="{ on: authType === 'BASIC' }" type="button" :aria-pressed="authType === 'BASIC'" @click="authType = 'BASIC'">用户名 / 密码</button>
          <button class="bc-auth-btn" :class="{ on: authType === 'API_KEY' }" type="button" :aria-pressed="authType === 'API_KEY'" @click="authType = 'API_KEY'">API Key</button>
        </div>
        <div v-if="authType === 'BASIC'" class="bc-row">
          <div><label class="bc-label">用户名（可选）</label><input v-model.trim="username" class="ipt bc-ipt" autocomplete="off" /></div>
          <div><label class="bc-label">密码（可选）</label><input v-model="password" type="password" class="ipt bc-ipt" autocomplete="off" /></div>
        </div>
        <div v-else>
          <label class="bc-label">API Key</label>
          <input v-model="password" type="password" class="ipt bc-ipt mono" autocomplete="off" placeholder="base64 的 id:api_key" />
        </div>
        <div v-if="probeInfo" class="bc-ok" role="status">
          连接成功：<b>{{ probeInfo.clusterName }}</b> · v{{ probeInfo.version || '—' }}
          <span v-if="probeInfo.legacy" class="bc-legacy">老版本 ES 兼容模式</span>
        </div>
        <div v-if="err" class="bc-err" role="alert">{{ err }}</div>
        <div class="bc-actions">
          <button class="btn ghost" @click="close">稍后</button>
          <button class="btn primary" :disabled="busy || !url" @click="connect">{{ busy ? '连接中…' : '连接' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { api } from '../api';
import { isBrowserMode } from '../platform/browserApi';
import { profiles, upsertProfile } from '../platform/browserProfiles';

const show = ref(false);
const urlInput = ref<HTMLInputElement>();
const url = ref('http://localhost:9200');
const username = ref('');
const password = ref('');
const authType = ref<'BASIC' | 'API_KEY'>('BASIC');
const busy = ref(false);
const err = ref('');
const probeInfo = ref<{ clusterName?: string; version?: string; legacy?: boolean } | null>(null);

/* Host access is optional (requested at connect time for the exact origin), so the
   install prompt stays narrow; the grant persists for the saved profile afterwards.
   Call request() directly in the click handler: awaiting contains() first can drop
   Chrome's transient user gesture. request() resolves true silently when already granted. */
async function ensureHostPermission(raw: string): Promise<boolean> {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.permissions?.request) return true;
  const origin = new URL(raw).origin + '/*';
  try {
    return Boolean(await chromeApi.permissions.request({ origins: [origin] }));
  } catch {
    return false;
  }
}

async function connect() {
  if (!url.value) return;
  if (!/^https?:\/\/.+/.test(url.value)) { err.value = '集群地址应为 http://host:9200 或 https://host:9200'; return; }
  busy.value = true; err.value = '';
  try {
    if (!(await ensureHostPermission(url.value))) {
      err.value = '需要授权访问该集群地址后才能连接';
      busy.value = false;
      return;
    }
    /* 先真连一次再落档案：地址/凭据错误留在本弹层解释，不把坏档案写进 storage
       再靠 reload 把用户甩进一个必然失败的控制台。 */
    const probe = await api.setup.test({
      url: url.value,
      username: authType.value === 'BASIC' ? username.value : undefined,
      password: password.value || undefined,
      authType: authType.value,
    });
    if (!probe?.ok) throw new Error(probe?.message || '集群未返回有效响应');
    const major = parseInt(String(probe.version || '').split('.')[0], 10);
    probeInfo.value = {
      clusterName: probe.clusterName || 'Elasticsearch',
      version: probe.version || '—',
      legacy: Number.isFinite(major) && major > 0 && major < 7,
    };
    let name = url.value;
    try { name = new URL(url.value).hostname; } catch { /* 交给下方保存校验 */ }
    const saved = upsertProfile({
      name, url: url.value,
      username: authType.value === 'BASIC' ? username.value : '',
      password: password.value, authType: authType.value, env: 'BROWSER',
    });
    if (!saved) {
      err.value = '连接保存失败：地址格式应为 http://host:9200 或 https://host:9200';
      busy.value = false;
      return;
    }
    /* 先把集群名/版本在连接卡片里显示一拍，再进入控制台；旧版本用户能明确看到
       「兼容模式」，而不是连接后才发现部分页面不可用。 */
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    err.value = '连接失败：' + String((e as any)?.message || e);
    busy.value = false;
  }
}
function close() { show.value = false; }
onMounted(() => {
  if (!isBrowserMode) return;
  show.value = profiles().length === 0;
  /* 单遮罩后主动把焦点放进唯一输入框；不再让后台 SetupWizard 的 autofocus 抢焦点。 */
  if (show.value) void nextTick(() => urlInput.value?.focus());
});
</script>

<style scoped>
.bc-mask { position: fixed; inset: 0; z-index: calc(var(--z-fullscreen) + 2); display: flex; align-items: center; justify-content: center; background: var(--mask-heavy); backdrop-filter: blur(6px); }
.bc-card { width: 460px; max-width: 92vw; padding: 24px; border-radius: var(--r-l); background: var(--bg1); border: 1px solid var(--line-strong); box-shadow: var(--shadow-pop); }
.bc-kicker { font-size: var(--fs-2xs); letter-spacing: 1.6px; color: var(--ac); }
.bc-card h2 { margin: 6px 0 4px; font-size: var(--fs-num); color: var(--tx0); }
.bc-sub { margin: 0 0 14px; font-size: var(--fs-xs); line-height: 1.6; color: var(--tx2); }
.bc-label { display: block; margin: 8px 0 4px; font-size: var(--fs-xs); color: var(--tx1); }
.bc-ipt { width: 100%; }
.bc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bc-auth { display: flex; gap: 6px; margin-top: 10px; }
.bc-auth-btn { padding: 3px 9px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg2); color: var(--tx2); font-size: var(--fs-xs); cursor: pointer; }
.bc-auth-btn.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
.bc-ok { margin-top: 10px; padding: 8px 10px; border: 1px solid var(--ok-line, var(--ac-line)); border-radius: var(--r-s); background: var(--ok-soft, var(--ac-soft)); color: var(--tx1); font-size: var(--fs-xs); }
.bc-ok b { color: var(--tx0); }
.bc-legacy { margin-left: 6px; padding: 1px 6px; border: 1px solid var(--warn-line); border-radius: 99px; color: var(--warn); font-size: var(--fs-2xs); }
.bc-err { margin-top: 10px; color: var(--err); font-size: var(--fs-xs); }
.bc-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
