<template>
  <!-- 集群切换器——数据面目标（宿主 / 自定义连接），控制面永远走宿主 -->
  <n-popover trigger="click" placement="bottom-start" :show="menuOpen" @update:show="v => menuOpen = v" raw :show-arrow="false">
    <template #trigger>
      <button class="cs-chip mono" :class="[{ remote: store.isRemote, none: !store.hostVisible && !store.isRemote }, curEnv ? 'env-' + curEnv.toLowerCase() : '']" :title="chipTip" :aria-expanded="menuOpen">
        <component :is="store.isRemote ? Globe : Server" :size="12" />
        <span class="cs-name">{{ chipText }}</span>
        <span v-if="curEnv" class="cs-env" :class="'e-' + curEnv.toLowerCase()">{{ curEnv }}</span>
        <span v-if="curVersion" class="cs-ver mono" :title="legacyTarget ? '老版本 ES 兼容模式：7.x 专属能力自动禁用' : '当前集群版本（GET / 探测）'">v{{ curVersion }}<template v-if="legacyTarget"> · 兼容</template></span>
        <ChevronDown :size="11" class="cs-caret" />
      </button>
    </template>
    <div class="cs-menu">
      <!-- .2：纯管理平台形态藏掉宿主项——数据面只认自定义连接档案；：切换项键盘可达（role/tabindex/Enter， Overview 同口径） -->
      <div v-if="store.hostVisible && hostAllowed" class="cs-item" :class="{ on: !store.isRemote }" role="button" tabindex="0" aria-label="切换到宿主集群" @mousedown.stop @click="pickTarget('', '')" @contextmenu.prevent="openConnMenu($event, null)" @keydown="onConnKey($event, null)">
        <Server :size="12" />
        <span class="cs-item-name">宿主集群</span>
        <span v-if="store.clusterSelf" class="cs-item-sub mono">{{ store.clusterSelf }}</span>
        <Check v-if="!store.isRemote" :size="12" class="cs-check" />
      </div>
      <div v-for="c in sortedConns" :key="c.id" class="cs-item" :class="{ on: store.target === c.id, stale: c.syncState === 'STALE' }" role="button" tabindex="0" :aria-label="'切换到 ' + c.name" @mousedown.stop @click="pickTarget(c.id, c.name)" @contextmenu.prevent="openConnMenu($event, c)" @keydown="onConnKey($event, c)">
        <span class="cs-hdot" :class="hdotCls(c.health)" :title="hdotTip(c.health)"></span>
        <Globe :size="12" />
        <span class="cs-item-name">{{ c.name }}</span>
        <span v-if="c.env" class="cs-env" :class="'e-' + c.env.toLowerCase()" :title="envTip(c.env)">{{ c.env }}<span v-if="c.env === 'PROD'" class="cs-ro">生产</span></span>
        <span v-if="c.syncState === 'STALE'" class="cs-stale" title="连接中心已无此连接(自动同步源失联);确认不再需要可在管理弹窗删除">源已失联</span>
        <span v-if="c.authType === 'API_KEY'" class="cs-ak mono" title="API Key 认证">AK</span>
        <span v-if="verOf(c)" class="cs-ver mono" title="服务端版本（探活自动识别）">v{{ verOf(c) }}</span>
        <span class="cs-item-sub mono">{{ c.host }}:{{ c.port }}</span>
        <Check v-if="store.target === c.id" :size="12" class="cs-check" />
      </div>
      <!-- B：裸空态迁 EmptyState compact（原 .cs-empty 裸文案同文案语义不变，窄弹层走紧凑档） -->
      <EmptyState v-if="!visibleConns.length" compact :icon="Globe"
        :text="canAdmin ? (store.hostVisible ? '尚无自定义连接——点下方「管理连接…」添加第一个连接' : '尚无集群连接，请先在下方「管理连接」添加') : '暂无可用集群，请联系管理员在角色中授权'" />
      <div class="cs-sep"></div>
      <div v-if="canAdmin" class="cs-item manage" role="button" tabindex="0" aria-label="管理连接" @click="openManage" @keydown.enter.prevent="openManage" @keydown.space.prevent="openManage">
        <Settings2 :size="12" />
        <span class="cs-item-name">管理连接…</span>
      </div>
    </div>
  </n-popover>

  <!-- 连接管理弹窗 -->
  <!-- 单框双效后续·深度质感重造（623 设计稿 v3 D1~D7 裁决「开始推进」）——
 骨架=720px+max-height 恒不超屏（头部/排序/双折叠节固定，唯一滚动区=连接列表，滚动条常显）；
 列表与表单双折叠节互让空间；行卡=双层网格（主行身份/次行地址/右锚状态）+grip 拖拽手动排序
 （自动切「手动」第四档+Ctrl+↑/↓ 键盘可达，597 connSort 扩档不替换）+hover-reveal 图标操作
 （触屏 pointer:coarse 恒常显兜底，507 先例） -->
  <n-modal v-model:show="manageOpen" preset="card" content-style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden"
    style="width:720px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column" :bordered="false">
    <template #header>集群连接管理 <span class="cm-cnt mono">{{ visibleConns.length }} 连接<template v-if="errCount"> · <b>{{ errCount }} 异常</b></template></span></template>
    <div class="cm-tip">
      <template v-if="isBrowserMode">连接档案保存在本机扩展存储（localStorage），密码只在本机流转、不上传任何服务端；数据面功能跟随所选连接。删除档案不影响目标 Elasticsearch 集群本身。</template>
      <template v-else>
        连接档案保存在控制集群索引中，密码只在服务端流转、前端不回显。数据面功能（查询/索引/运维等）跟随所选目标；
        <template v-if="store.hostVisible">登录鉴权、Provider 重建、托管重建、配置实验室恒定作用于宿主集群。</template>
        <template v-else>当前部署为纯管理平台形态，所有数据面操作均需先选择一个集群连接。</template>
      </template>
    </div>
    <div class="cm-sort" role="group" aria-label="列表排序方式">
      <span class="dim sm-txt">排序</span>
      <button v-for="opt in sortOptions" :key="opt[0]" class="btn xs" :class="{ pri: sortMode === opt[0] }" @click="setSort(opt[0])">{{ opt[1] }}</button>
      <span v-if="sortMode === 'manual'" class="cm-sort-hint">手动档：拖 ⋮⋮ 或聚焦行 Ctrl+↑/↓ 调整顺序（跨会话记忆）</span>
    </div>
    <div class="cm-fold cm-fold-list" :class="{ open: listFoldOpen }">
      <button class="cm-fold-hd" :aria-expanded="listFoldOpen" @click="listFoldOpen = !listFoldOpen">
        连接列表
        <span class="cm-fold-n mono">{{ visibleConns.length }} 项<template v-if="errCount"> · <b>{{ errCount }} 异常</b></template> —— 收起给表单让位，展开回到列表</span>
        <ChevronDown :size="11" class="cm-caret" :class="{ rot: listFoldOpen }" />
      </button>
      <div class="cm-fold-bd" v-show="listFoldOpen">
        <div class="cm-list" :class="{ 'is-coarse': coarse }" v-if="sortedConns.length">
          <div v-for="c in sortedConns" :key="c.id" class="cm-row" :class="{ err: c.health?.status === 'RED', stale: c.syncState === 'STALE' }"
            :data-cid="c.id" tabindex="0" @keydown="onRowKey($event, c.id)"
            @dragover.prevent="onDragOver($event, c.id)" @drop.prevent="onDrop($event, c.id)">
            <button class="cm-grip" :class="{ 'grip-on': sortMode === 'manual' }" draggable="true" :aria-label="'拖动调整 ' + c.name + ' 顺序（自动切手动档）'"
              title="拖动调整顺序（自动切手动档）；聚焦行 Ctrl+↑/↓ 也可"
              @dragstart="onDragStart($event, c.id)" @dragend="onDragEnd">⋮⋮</button>
            <div class="cm-row-main">
              <span class="cs-hdot" :class="hdotCls(c.health)" :title="hdotTip(c.health)"></span>
              <span class="cm-row-name">{{ c.name }}</span>
              <span v-if="c.env" class="cs-env" :class="'e-' + c.env.toLowerCase()" :title="envTip(c.env)">{{ c.env }}<span v-if="c.env === 'PROD'" class="cs-ro">生产</span></span>
              <span v-if="c.syncState === 'STALE'" class="cs-stale" title="连接中心已无此连接(自动同步源失联);确认不再需要可删除">源已失联</span>
            </div>
            <div class="cm-row-aux">
              <template v-if="c.health?.status === 'GREEN'"><span class="cm-lat mono" :class="{ 'cm-lat-warn': (c.health?.latencyMs ?? 0) >= 1000 }">{{ c.health?.latencyMs }}ms</span></template>
              <template v-else-if="c.health?.status === 'RED'"><span class="cm-lat cm-lat-err">异常</span></template>
              <template v-else><span class="cm-lat cm-lat-idle">未探测</span></template>
              <span v-if="verOf(c)" class="cs-ver mono" title="服务端版本（探活自动识别，据此做版本分叉与能力门禁）">v{{ verOf(c) }}</span>
            </div>
            <div class="cm-row-sub">
              <span class="cm-row-ep mono">{{ c.scheme }}://{{ c.host }}:{{ c.port }}</span>
              <span v-if="c.username" class="cm-row-ep mono">{{ c.username }}{{ c.hasPassword ? ' / ●●●' : '' }}</span>
              <span v-if="c.authType === 'API_KEY'" class="cs-ak mono" title="API Key 认证">AK</span>
            </div>
            <div class="cm-row-ops">
              <button class="cm-icob" :disabled="probingId === c.id" @click="probeConn(c)"
                :title="probingId === c.id ? '探活中…' : '立即探活：GET / 测连通与时延'" :aria-label="'立即探活：' + c.name">
                <Activity :size="13" :class="{ spinning: probingId === c.id }" />
              </button>
              <!-- ⋯ 次级菜单退役改图标直出（hover-reveal；ADMIN 门控不变同步更新 permGating） -->
              <template v-if="canAdmin">
                <button class="cm-icob" :disabled="testingId === c.id" @click="testExisting(c.id)" title="测试连接（含认证）" :aria-label="'测试连接：' + c.name"><PlugZap :size="13" /></button>
                <button class="cm-icob" @click="editConn(c)" title="编辑" :aria-label="'编辑连接：' + c.name"><Pencil :size="13" /></button>
                <button class="cm-icob danger" @click="delConn(c)" title="删除连接" :aria-label="'删除连接：' + c.name"><Trash2 :size="13" /></button>
              </template>
            </div>
          </div>
        </div>
        <div v-else class="cm-empty">尚无自定义连接，用下方表单添加第一个远程集群</div>
      </div>
    </div>

    <div v-if="testResult" class="cm-test" :class="testResult.ok ? 'ok' : 'err'">
      <template v-if="testResult.ok">
        <CircleCheck :size="13" />
        <span>连接成功：<b>{{ testResult.clusterName }}</b> · v{{ testResult.version }} · <!-- ：status 裸枚举换 StatusPill（中文主显 + en 英文小字；tone 走 healthPill） --><StatusPill v-if="testResult.status" :tone="healthPill(testResult.status.toLowerCase())" :label="clusterHealthZh(testResult.status) || testResult.status" :en="testResult.status" /> · {{ testResult.nodes }} 节点</span>
      </template>
      <template v-else>
        <CircleAlert :size="13" />
        <span>连接失败：{{ testResult.message }}</span>
      </template>
    </div>

    <div class="cm-fold cm-fold-form" :class="{ open: formOpen }" v-if="canAdmin" ref="formFoldEl">
      <button class="cm-fold-hd" :aria-expanded="formOpen" @click="formOpen = !formOpen">
        {{ form.id ? '编辑连接：' + form.name : '＋ 新增连接' }}
        <span class="cm-fold-n">表单默认收起——点行「编辑」自动展开并滚到此处</span>
        <ChevronDown :size="11" class="cm-caret" :class="{ rot: formOpen }" />
      </button>
      <div class="cm-fold-bd" v-show="formOpen">
      <div class="cm-form">
      <div class="cm-grid">
        <div class="cm-f">
          <label>名称</label>
          <input v-model.trim="form.name" class="ipt" placeholder="如 生产集群 / UAT" />
        </div>
        <div class="cm-f wide">
          <label>连接串</label>
          <input v-model.trim="form.url" class="ipt mono" placeholder="http://host:9200 或 http://user:pass@host:9200" />
        </div>
        <!-- 连接中心自动同步批·API Key 认证:认证方式切换(渐进披露,账密为默认) -->
        <div class="cm-f wide">
          <label>认证方式</label>
          <div class="cm-roles">
            <button v-for="a in AUTH_OPTS" :key="a.k" class="cm-role-btn" :class="{ on: form.authType === a.k }"
              type="button" :aria-pressed="form.authType === a.k" :title="a.tip" @click="form.authType = a.k">{{ a.t }}</button>
          </div>
        </div>
        <template v-if="form.authType !== 'API_KEY'">
          <div class="cm-f">
            <label>用户名（可空）</label>
            <input v-model.trim="form.username" class="ipt mono" autocomplete="off" placeholder="elastic" />
          </div>
          <div class="cm-f">
            <label>密码（编辑时留空=保留旧密码）</label>
          <!-- type=text + pw-mask：防浏览器密码管理器劫持 -->
          <input v-model="form.password" class="ipt mono pw-mask" type="text" autocomplete="off" placeholder="可空" />
          </div>
        </template>
        <div v-else class="cm-f wide">
          <label>API Key（编辑时留空=保留旧 Key）</label>
          <input v-model="form.password" class="ipt mono pw-mask" type="text" autocomplete="off" placeholder="base64 的 id:api_key" />
        </div>
        <!-- minRole 退役——连接可见性与操作授权由「连接菜单 × 读写档位」RBAC 决定 -->
        <div class="cm-f wide">
          <label>环境标识（纯展示：切换器/顶栏据此着色警示，生产红色）</label>
          <div class="cm-roles">
            <button v-for="e in ENV_OPTS" :key="e.k" class="cm-role-btn" :class="{ on: form.env === e.k }"
              :title="e.tip" @click="form.env = e.k">
{{ e.t }}
</button>
          </div>
        </div>
        <template v-if="!isBrowserMode">
          <div class="cm-f">
            <label>连接超时 ms（空=全局默认）</label>
            <input v-model.number="form.connectTimeoutMs" class="ipt mono" type="number" min="1" placeholder="如 5000" />
          </div>
          <div class="cm-f">
            <label>读写超时 ms（空=全局默认）</label>
            <input v-model.number="form.socketTimeoutMs" class="ipt mono" type="number" min="1" placeholder="如 60000" />
          </div>
        </template>
      </div>
      <div class="cm-form-ops">
        <button v-if="form.id" class="btn sm ghost" @click="cancelForm">取消编辑</button>
        <button class="btn sm ghost" :disabled="!form.url || testingForm" @click="testForm">
          <PlugZap :size="12" /> {{ testingForm ? '测试中…' : '测试连接' }}
        </button>
        <button class="btn primary sm" :disabled="!form.name || !form.url || saving" @click="saveConn">
          <Save :size="12" /> {{ saving ? '保存中…' : (form.id ? '保存修改' : '添加连接') }}
        </button>
      </div>
      </div>
      </div>
    </div>
    <!-- 非 ADMIN 自述（查看/切换/探活可用，档案管理需升权）——不再展示会 403 的表单 -->
    <div v-else class="cm-tip dim" style="margin-top:var(--sp-2)">
      连接档案的新增/编辑/删除需 ADMIN 角色；当前可查看、切换与探活已有连接。
    </div>
  </n-modal>

  <!-- 卡片次级菜单改 NPopover 锚定按钮(placement left-start)——CellContextMenu 挂 body
 在抽屉场景会盖到抽屉外的页面(观感「飘出去」);naive 弹层随按钮定位永在抽屉内 -->
  <CellContextMenu v-if="connMenu" :x="connMenu.x" :y="connMenu.y" :title="connMenuTitle"
    :items="connMenuItems" @close="connMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { NPopover, NModal } from 'naive-ui';
import { Server, Globe, ChevronDown, Check, Settings2, PlugZap, Pencil, Trash2, Save, CircleCheck, CircleAlert, Activity, Copy } from 'lucide-vue-next';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { useAppStore } from '../stores/app';
import { usePref } from '../composables/urlState';
import { sortConns, normalizeSortMode, moveInOrder, type SortMode } from '../utils/connSort'; /* ：列表状态分类排序+可调；：增手动档+moveInOrder 落位 */
import { useAuthStore } from '../stores/auth';
import { askConfirm } from '../composables/confirm';
import { api } from '../api';
import { isBrowserMode } from '../platform/browserApi';
import type { ClusterConnView, ConnHealth } from '../api';
import { useModalEnter } from '../composables/useModalEnter';
import { friendlyEsError } from '../utils/esError';
import EmptyState from './EmptyState.vue';
import StatusPill from './StatusPill.vue';
/* 连通测试结果 status 改用 StatusPill——healthPill tone 档（全等小写匹配，
 后端 GREEN/YELLOW/RED 大写须先归一）+ clusterHealthZh 中文主显（esEnumZh 单源） */
import { healthPill } from '../utils/format';
import { clusterHealthZh } from '../utils/esEnumZh';

const store = useAppStore();
/* 连接档案管理（新增/编辑/删除/测试=ADMIN，/clusters/ 写与 test 均在超管清单）——
 非 ADMIN 保留查看/切换/探活（probe= VIEWER 豁免），不再展示必 403 的管理入口 */
const auth = useAuthStore();
const hostAllowed = computed(() => auth.canSeeConn('host'));
const canAdmin = computed(() => auth.can('admin')); /* 连接档案/探活配置=系统管理域：ADMIN 角色专属，连接写键不放行 */
/* 列表排序——默认 status（异常置顶），可切 name/latency；usePref 跨会话记忆。
 增第四档「手动」（623 设计稿 D3/D4 裁决）——manualOrder 落盘跨会话记忆；
 sortedConns 传 manualOrder 给 sortConns（非手动档忽略该参） */
const sortMode = usePref<SortMode>('cs.sort', 'status');
const manualOrder = usePref<string[]>('cs.manualOrder', []);
const sortedConns = computed(() => sortConns(visibleConns.value, normalizeSortMode(sortMode.value), manualOrder.value));
const setSort = (m: SortMode) => { sortMode.value = m; };
const sortOptions: [SortMode, string][] = [['status', '状态'], ['name', '名称'], ['latency', '时延'], ['manual', '手动']];
/* 双折叠节（D7）——列表默认展开、表单默认收起 */
const listFoldOpen = ref(true);
const formOpen = ref(false);
const formFoldEl = ref<HTMLElement | null>(null);
/* 头部摘要 chip（623 稿 ）：N 连接 · M 异常 */
const errCount = computed(() => visibleConns.value.filter(c => c.health?.status === 'RED').length);
/* 拖拽与键盘移位共用落位——moveInOrder 纯函数（connSort 单源）；
 非手动档下先以当前可视序播种 manualOrder 再切档（拖到哪/移到哪所见即所得） */
const dragId = ref('');
function seedManualFromView() {
  manualOrder.value = sortedConns.value.map(c => c.id);
  sortMode.value = 'manual';
}
function onDragStart(e: DragEvent, id: string) {
  dragId.value = id;
  if (e.dataTransfer) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }
}
function onDragEnd() { dragId.value = ''; }
function onDragOver(_e: DragEvent, id: string) { dragId.value = dragId.value || ''; void id; }
function onDrop(_e: DragEvent, refId: string) {
  const id = dragId.value;
  dragId.value = '';
  if (!id || id === refId) return;
  if (sortMode.value !== 'manual') seedManualFromView();
  const to = manualOrder.value.indexOf(refId);
  manualOrder.value = moveInOrder(manualOrder.value, id, to);
  sortMode.value = 'manual';
}
function onRowKey(e: KeyboardEvent, id: string) {
  if (!e.ctrlKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  if (sortMode.value !== 'manual') seedManualFromView();
  const idx = manualOrder.value.indexOf(id);
  const to = idx + (e.key === 'ArrowUp' ? -1 : 1);
  if (to < 0 || to >= manualOrder.value.length) return;
  manualOrder.value = moveInOrder(manualOrder.value, id, to);
  sortMode.value = 'manual';
  void nextTick(() => (document.querySelector(`.cm-row[data-cid="${id}"]`) as HTMLElement | null)?.focus());
}
const menuOpen = ref(false);
const manageOpen = ref(false);
const testingId = ref('');
const probingId = ref('');
const testingForm = ref(false);
const saving = ref(false);
const testResult = ref<{ ok: boolean; clusterName?: string; version?: string; status?: string; nodes?: number; message?: string } | null>(null);

/* .2：chip 三态——远程目标 / 宿主 / 纯管理形态未选择（引导态） */
const chipText = computed(() => {
  if (store.isRemote) return store.targetName;
  return store.hostVisible ? '宿主集群' : '选择集群连接…';
});
const chipTip = computed(() => {
  if (store.isRemote) return '数据面目标：' + store.targetName + '（点击切换）';
  return store.hostVisible ? '数据面目标：宿主集群（点击切换）' : '尚未选择数据面目标，点击选择集群连接';
});

/* 环境标识（纯展示）——防止“以为在测试集群实则生产”的误操作 */
const ENV_OPTS = [
  { k: '', t: '无', tip: '不标注环境' },
  { k: 'PROD', t: 'PROD', tip: '生产环境：切换器与顶栏红色警示' },
  { k: 'STAGING', t: 'STAGING', tip: '预发环境：橙色标注' },
  { k: 'QA', t: 'QA', tip: '测试环境：蓝色标注' },
  { k: 'DEV', t: 'DEV', tip: '开发环境：灰色标注' },
] as const;
const curEnv = computed(() => store.conns.find(c => c.id === store.target)?.env || '');
const curVersion = computed(() => {
  if (store.isRemote) {
    const c = store.conns.find(x => x.id === store.target);
    return c ? verOf(c) : '';
  }
  return store.esVersion || '';
});
const legacyTarget = computed(() => {
  const major = parseInt(String(curVersion.value || '').split('.')[0], 10);
  return Number.isFinite(major) && major > 0 && major < 7;
});
function envTip(env: string) {
  /* S2：与后端 env-role-cap 默认建议对齐——PROD 连接封顶只读 */
  if (env === 'PROD') return '生产环境：切换器与顶栏红色警示；写操作仍按页面授权判定（后端不做环境只读封顶）';
  return `环境标识：${env}`;
}

/* 连接中心自动同步批·API Key 认证:认证方式切换(API_KEY 时 password 位承载 ApiKey 秘钥) */
const AUTH_OPTS = [
  { k: 'BASIC', t: '账密', tip: '用户名 + 密码(basic 认证)' },
  { k: 'API_KEY', t: 'API Key', tip: 'ApiKey 秘钥(阿里云托管 ES 等仅签发 Api Key 的集群),以 Authorization: ApiKey 头建连' },
] as const;

const emptyForm = () => ({
  id: '', name: '', url: '', username: '', password: '',
  minRole: 'VIEWER' as string, connectTimeoutMs: '' as number | '', socketTimeoutMs: '' as number | '',
  env: '' as string, authType: 'BASIC' as string,
});
const form = ref(emptyForm());

/* 健康状态点样式/提示（GREEN 绿 / RED 红 / UNKNOWN 灰） */
function hdotCls(h?: ConnHealth) {
  const s = h?.status || 'UNKNOWN';
  return { green: s === 'GREEN', red: s === 'RED', unknown: s === 'UNKNOWN' };
}
function hdotTip(h?: ConnHealth) {
  if (!h || h.status === 'UNKNOWN') return '未探测（后台每分钟自动探活）';
  if (h.status === 'GREEN') return `探活正常 · ${h.latencyMs}ms`;
  return `最近探活失败：${h.error || '未知错误'}`;
}
/* 服务端版本——档案持久化值优先，其次探活内存值 */
function verOf(c: ClusterConnView) {
  return c.esVersion || c.health?.version || '';
}

async function pickTarget(id: string, name: string) {
  menuOpen.value = false;
  /* 纯连接模型下宿主不在授权内：入口已隐藏，执行体再兜一层挡深链/程序化切换 */
  if (!auth.canSeeConn(id || 'host')) {
    store.notify('warning', '暂无该集群的访问权限');
    return;
  }
  if (id === store.target) return;
  const c = store.conns.find(x => x.id === id);
  // RED 集群仍可切（可能刚恢复/探活口径偏差），但前置告知，避免用户对满屏超时一头雾水。
  // 确认统一走 askConfirm 全局服务（原 naive dialog 警告弹层孤例合并）
  if (c?.health?.status === 'RED') {
    const ok = await askConfirm({
      title: '目标集群最近探活失败',
      message: `「${name}」最近一次探活失败：${c.health?.error || '未知错误'}。切换后数据面操作可能超时或报错，确认继续？`,
      level: 'warn',
      okText: '仍然切换',
    });
    if (!ok) return;
  }
  doPick(id, name);
}

function doPick(id: string, name: string) {
  store.setTarget(id, name);
  const v = id ? verOf(store.conns.find(x => x.id === id) as any) : store.esVersion;
  const major = parseInt(String(v || '').split('.')[0], 10);
  if (Number.isFinite(major) && major > 0 && major < 7) {
    store.notify('warning', `数据面已切到：${name || '宿主集群'} · ES ${v} 老版本兼容模式（7.x 专属能力自动禁用）`);
    return;
  }
  store.notify('success', id ? `数据面已切到：${name}` : '已切回宿主集群');
}

/* 连接行右键/菜单键：切换（复用 pickTarget 的授权与 RED 确认）+ 复制连接信息，
   只读本地；生产/测试连接的身份、env、端点可一键带走。 */
const connMenu = ref<{ x: number; y: number; c: ClusterConnView | null } | null>(null);
const connMenuTitle = computed(() => (connMenu.value ? `连接 · ${connMenu.value.c?.name || '宿主集群'}` : ''));
const connMenuItems = computed<CcmItem[]>(() => {
  const m = connMenu.value;
  if (!m) return [];
  const c = m.c;
  const current = c ? store.target === c.id : !store.isRemote;
  const items: CcmItem[] = [];
  if (!current) {
    items.push({
      key: 'conn-switch',
      label: c ? `切换到「${c.name}」` : '切换到宿主集群',
      icon: Globe,
      run: () => { void pickTarget(c ? c.id : '', c ? c.name : ''); },
    });
  }
  const copyChildren: CcmItem[] = [
    { key: 'conn-copy-name', label: '复制名称', icon: Copy, run: () => copyConnVal(c ? c.name : '宿主集群', '名称') },
  ];
  if (c) {
    copyChildren.push({ key: 'conn-copy-id', label: '复制连接 ID', icon: Copy, run: () => copyConnVal(c.id, '连接 ID') });
    copyChildren.push({ key: 'conn-copy-endpoint', label: '复制端点', icon: Copy, run: () => copyConnVal(`${c.scheme}://${c.host}:${c.port}`, '端点') });
    if (c.env) {
      const env = c.env;
      copyChildren.push({ key: 'conn-copy-env', label: '复制环境', icon: Copy, run: () => copyConnVal(env, '环境') });
    }
  } else {
    const self = store.clusterSelf;
    if (self) copyChildren.push({ key: 'conn-copy-self', label: '复制实例', icon: Copy, run: () => copyConnVal(self, '实例') });
  }
  items.push({ key: 'conn-copy', label: '复制…', icon: Copy, sep: items.length > 0, children: copyChildren });
  return items;
});
function copyConnVal(text: string, label: string) {
  void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制${label}` : '复制失败'));
}
function openConnMenu(e: MouseEvent, c: ClusterConnView | null) {
  connMenu.value = { x: e.clientX, y: e.clientY, c };
}
function onConnKey(e: KeyboardEvent, c: ClusterConnView | null) {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    connMenu.value = { x: r.left + 12, y: r.bottom, c };
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void pickTarget(c ? c.id : '', c ? c.name : '');
  }
}

async function probeConn(c: ClusterConnView) {
  probingId.value = c.id;
  try {
    const h = await api.clustersProbe(c.id);
    c.health = h;
    if (h.status === 'GREEN') store.notify('success', `「${c.name}」连通正常 · ${h.latencyMs}ms`);
    else store.notify('warning', `「${c.name}」探活失败：${h.error || '未知错误'}`);
  } catch (e: any) {
    /* A：ES 错误友好化（探活失败原因可读化） */
    store.notify('error', '探活请求失败: ' + friendlyEsError(String(e?.message ?? e)));
  } finally { probingId.value = ''; }
}

/* 非 admin 按连接菜单授权过滤可见连接(grantedPages conn:{id}:{page} 键推导);
 admin 全量管理。visibleConns 供列表与切换菜单共用。 */
const grantedConnIds = computed(() => {
  if (canAdmin.value) return null;
  const gp = auth.grantedPages;
  if (gp == null) return null;
  /* 静态键模型（无 conn: 前缀）对所有连接生效——不得因“未列 conn id”把连接全藏掉 */
  if (!gp.some(g => g.startsWith('conn:'))) return null;
  const ids = new Set<string>();
  for (const g of gp) {
    const m = g.match(/^conn:([^:]+):/);
    if (m) ids.add(m[1]);
  }
  return ids;
});
const visibleConns = computed(() => {
  if (!grantedConnIds.value) return store.conns;
  return store.conns.filter(c => grantedConnIds.value!.has(c.id));
});

function openManage() {
  if (!canAdmin.value) return;
  menuOpen.value = false;
  testResult.value = null;
  resetForm();
  formOpen.value = false; /* ：开弹窗=折叠节默认态（列表满高，表单收起） */
  listFoldOpen.value = true;
  manageOpen.value = true;
  store.loadConns();
}

function resetForm() { form.value = emptyForm(); }

function editConn(c: any) {
  testResult.value = null;
  form.value = {
    id: c.id, name: c.name, url: `${c.scheme}://${c.host}:${c.port}`, username: c.username || '', password: '',
    minRole: c.minRole || 'VIEWER',
    connectTimeoutMs: c.connectTimeoutMs ?? '', socketTimeoutMs: c.socketTimeoutMs ?? '',
    env: c.env || '', authType: c.authType || 'BASIC',
  };
  /* 编辑自动展开表单折叠节并滚至表单（623 稿 状态机） */
  formOpen.value = true;
  void nextTick(() => formFoldEl.value?.scrollIntoView({ block: 'nearest' }));
}

/* 取消编辑=重置并收起折叠节（表单不常驻占位） */
function cancelForm() {
  resetForm();
  formOpen.value = false;
}

async function testExisting(id: string) {
  if (!canAdmin.value) return; /* 963 执行体守卫：连接档案测试=clusters 管理域（模板已隐藏，直调再兜一层） */
  /* 已存连接的测试反馈 toast 化（原写入共享 testResult 区，渲染在列表顶部易被忽略） */
  testingId.value = id;
  try {
    const r = await api.clustersTest({ id });
    if (r.ok) store.notify('success', `「${store.conns.find(x => x.id === id)?.name || '连接'}」连通正常 · v${r.version} · ${r.nodes} 节点`);
    else store.notify('warning', `连接失败：${r.message || '未知错误'}`);
  } catch (e: any) {
    /* A：ES 错误友好化（测试连接失败原因可读化） */
    store.notify('error', '测试请求失败: ' + friendlyEsError(String(e?.message ?? e)));
  } finally { testingId.value = ''; }
}

async function testForm() {
  if (!canAdmin.value) return; /* 963 执行体守卫（表单测试同属 clusters 管理域） */
  testingForm.value = true;
  testResult.value = null;
  try {
    testResult.value = await api.clustersTest({
      id: form.value.id || undefined,
      url: form.value.url,
      username: form.value.authType === 'API_KEY' ? undefined : (form.value.username || undefined),
      password: form.value.password || undefined,
      authType: form.value.authType || undefined,
    });
  } catch (e: any) { /* A：ES 错误友好化 */ testResult.value = { ok: false, message: friendlyEsError(String(e?.message ?? e)) }; }
  finally { testingForm.value = false; }
}

async function saveConn() {
  if (!canAdmin.value) return; /* 963 执行体守卫：连接档案保存=clusters 管理域（Enter 通道同汇入此处） */
  if (saving.value) return; /* 2.1.6：执行体防重（Enter 通道不经按钮 disabled） */
  /* URL 前置校验（提交前拦——必须 http(s):// 开头且带端口，免得服务端报错绕一圈） */
  const url = form.value.url.trim();
  if (!/^https?:\/\/.+/.test(url) || !/:\d+/.test(url.replace(/^https?:\/\//, '').split('/')[0])) {
    store.notify('error', 'URL 格式应为 http://host:9200（可选 http://user:pass@host:9200）');
    return;
  }
  saving.value = true;
  try {
    await api.clustersSave({
      id: form.value.id || undefined,
      name: form.value.name,
      url: form.value.url,
      username: form.value.username || undefined,
      password: form.value.password || undefined,
      authType: form.value.authType,
      minRole: form.value.minRole || 'VIEWER',
      connectTimeoutMs: form.value.connectTimeoutMs === '' ? undefined : Number(form.value.connectTimeoutMs),
      socketTimeoutMs: form.value.socketTimeoutMs === '' ? undefined : Number(form.value.socketTimeoutMs),
      env: form.value.env || undefined,
    });
    store.notify('success', form.value.id ? '连接已更新' : '连接已添加');
    resetForm();
    formOpen.value = false; /* ：保存成功收起表单折叠节（列表回到满高） */
    testResult.value = null;
    await store.loadConns();
  } catch (e: any) {
    /* A：ES 错误友好化（保存连接失败原因可读化） */
    store.notify('error', '保存失败: ' + friendlyEsError(String(e?.message ?? e)));
  } finally { saving.value = false; }
}
/* 连接表单弹窗 Enter=保存（can 与主按钮 disabled 同口径——canAdmin 门 + name/url 必填且非保存中） */
useModalEnter(manageOpen, saveConn, () => canAdmin.value && !!form.value.name && !!form.value.url && !saving.value);

async function delConn(c: any) {
  if (!canAdmin.value) return; /* 963 执行体守卫：删除连接档案=clusters 管理域 */
  if (!await askConfirm({
    level: 'warn',
    title: '删除集群连接',
    message: `将删除连接档案「${c.name}」（仅删控制台档案，不影响目标集群本身）；若当前正指向它将自动回落可用目标。`,
    okText: '删除连接',
  })) return;
  try {
    await api.clustersDelete(c.id);
    store.notify('success', '连接已删除');
    await store.loadConns(); // 若删的是当前目标，loadConns 内部会自动回落宿主
  } catch (e: any) {
    /* A：ES 错误友好化（删除连接失败原因可读化） */
    store.notify('error', '删除失败: ' + friendlyEsError(String(e?.message ?? e)));
  }
}

/* D2 触屏兜底：粗指针下操作钮恒常显——本组件在 adaptSweep563 豁免册（媒体查询
 须经裁决迁册后才能新增），改 matchMedia + is-coarse 类 */
const coarse = ref(false);
onMounted(() => {
  const mq = matchMedia('(pointer: coarse)');
  coarse.value = mq.matches;
  mq.addEventListener?.('change', (e) => { coarse.value = e.matches; });
});
onMounted(() => store.loadConns());
</script>

<style scoped>
.cs-chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px var(--sp-2h); font-size: var(--fs-xs); cursor: pointer;
  color: var(--tx1); background: var(--bg2); border: 1px solid var(--line); border-radius: 99px; white-space: nowrap;
}
.cs-chip:hover { border-color: var(--ac-hi); }
.cs-chip.remote { color: var(--warn); border-color: var(--warn); background: var(--warn-soft); }
/* 生产环境目标——chip 整体红色警示，压过 remote 黄色 */
.cs-chip.env-prod { color: var(--err); border-color: var(--err); background: var(--err-soft); }
/* .2：未选择引导态——强调色呼吸提示，避免用户对空白页一头雾水 */
.cs-chip.none { color: var(--ac-hi); border-color: var(--ac-hi); background: var(--ac-soft); animation: cs-breath 2.4s ease-in-out infinite; }
@keyframes cs-breath { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ac) 25%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ac) 0%, transparent); } }
.cs-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.cs-caret { opacity: .6; }

.cs-menu {
  min-width: 240px; padding: 5px; background: var(--bg1); border: 1px solid var(--line);
  border-radius: var(--r-m); box-shadow: var(--shadow-pop);
}
.cs-item {
  display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-2h); font-size: var(--fs-sm); color: var(--tx1);
  border-radius: var(--r-s); cursor: pointer;
}
.cs-item:hover { background: var(--bg2); }
.cs-item.on { color: var(--ac-hi); }
/* 长连接名自身省略，不再把右侧 endpoint/版本徽章挤出菜单 */
.cs-item-name { flex-shrink: 1; min-width: 0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-item-sub { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: var(--fs-xs); color: var(--tx2); text-align: right; }
/* 服务端版本徽章（探活自动识别） */
.cs-ver { flex-shrink: 0; padding: 1px 5px; font-size: var(--fs-xs); font-weight: 600; color: var(--ac-hi); background: var(--ac-soft); border: 1px solid var(--ac-line); border-radius: 3px; }
.cs-check { color: var(--ac-hi); flex-shrink: 0; }
/* B：.cs-empty 裸空态退役迁 EmptyState compact，本地样式同步更新删除 */
.cs-sep { height: 1px; margin: var(--sp-1) var(--sp-0); background: var(--line); }
.cs-item.manage { color: var(--tx2); }
.cs-item.manage:hover { color: var(--tx1); }

.cm-tip { font-size: var(--fs-xs); line-height: 1.7; color: var(--tx2); margin-bottom: var(--sp-3); }
/* 弹窗骨架 flex 列——头部/说明/排序/双折叠节固定，唯一滚动区=连接列表 */
.cm-tip { flex-shrink: 0; }
.cm-sort { flex-shrink: 0; }
.cm-list { display: flex; flex-direction: column; gap: var(--sp-1h); overflow-y: auto; min-height: 0; flex: 1 1 auto;
  padding-right: var(--sp-0); scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
.cm-list::-webkit-scrollbar { width: 8px; }
.cm-list::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: var(--r-xs); }
.cm-list::-webkit-scrollbar-thumb:hover { background: var(--tx2); }
/* 双折叠节（列表/表单互让空间）——折叠头摘要行 + 开合态 */
.cm-fold { border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg2); margin-bottom: var(--sp-3); flex-shrink: 0; }
.cm-fold-hd { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-2h) var(--sp-3);
  background: none; border: 0; cursor: pointer; font: 650 var(--fs-sm) var(--font); color: var(--tx0); text-align: left; }
.cm-fold-hd:hover { color: var(--ac-hi); }
.cm-fold-n { font-size: var(--fs-2xs); color: var(--tx2); font-weight: 400; }
.cm-fold-n b { color: var(--err); }
.cm-caret { margin-left: auto; transition: transform .15s ease-out; color: var(--tx2); flex-shrink: 0; }
.cm-caret.rot { transform: rotate(180deg); }
.cm-fold-bd { display: none; }
.cm-fold.open .cm-fold-bd { display: block; }
.cm-fold-list { border: 0; background: none; }
.cm-fold-list .cm-fold-hd { padding: 0 0 var(--sp-1h); }
/* 列表保底（使用反馈「连接列表被挤没」）——原 min-height:0 意味列表可被无条件压扁，
 表单节 flex-shrink:0 吃满固有高后，全部高度亏空只能由列表承担（真机 1842×937 实测列表仅剩 151px、
 10 个连接只有 2 行可见；视口高 800px 时仅 34px、0 行完整可见，末行被横切成半看着像被下卡片压住）。
 保底 = 折叠头 ~32px + 3 行卡（~63px/行）→ 表单无论开合，列表恒有 3 个连接可见可点。 */
.cm-fold-list.open { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 222px; }
.cm-fold-list .cm-fold-bd { min-height: 0; flex: 1; }
.cm-fold-list.open .cm-fold-bd { display: flex; flex-direction: column; }
/* 让位方改「表单」——列表保底之后，高度亏空由表单折叠节收缩承担并自滚
 （此前表单 flex-shrink:0 恒不让位，正是列表被挤没的直接原因；唯一滚动区语义由「列表独有」
 扩为「列表 + 表单体两处」，列表滚动条常显不变）。 */
.cm-fold-form.open { display: flex; flex-direction: column; min-height: 0; flex-shrink: 1; }
.cm-fold-form.open .cm-fold-hd { flex-shrink: 0; }
.cm-fold-form.open .cm-fold-bd { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-top: var(--sp-2); }
/* 表单自滚后主按钮不得滚出视野——操作行钉住表单滚动区底缘（同底色遮挡滚过内容，
 不新增色值） */
.cm-fold-form.open .cm-form-ops { position: sticky; bottom: 0; background: var(--bg2); }
/* 双层行卡——主行身份/次行地址/右锚状态/悬停操作（623 稿 解剖学） */
.cm-row {
  display: grid; grid-template-columns: 14px minmax(0, 1fr) auto;
  grid-template-areas: "grip main aux" "grip sub ops";
  column-gap: var(--sp-2); align-items: center;
  padding: var(--sp-1h) var(--sp-3) var(--sp-1h) var(--sp-1h);
  background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m);
  transition: border-color .15s ease-out, background .15s ease-out;
}
.cm-row:hover { border-color: var(--line-strong); background: var(--bg3); }
/* 探活失败（RED）整卡警示——左侧红条+浅红底，异常一眼可辨 */
.cm-row.err { border-color: var(--err-line); background: var(--err-soft); box-shadow: inset 3px 0 0 var(--err); }
.cm-row.dragover { border-color: var(--ac-line); }
.cm-grip { grid-area: grip; align-self: stretch; display: flex; align-items: center; justify-content: center;
  color: var(--tx2); cursor: grab; opacity: 0; transition: opacity .12s ease-out; border: 0; background: none;
  font-size: var(--fs-sm); letter-spacing: -1px; padding: 0 var(--sp-0); }
.cm-row:hover .cm-grip, .cm-grip.grip-on, .cm-grip:focus-visible { opacity: .75; }
.cm-row-main { grid-area: main; display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.cm-row-name { font-size: var(--fs-sm); font-weight: 650; color: var(--tx0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-row-aux { grid-area: aux; display: flex; align-items: center; gap: var(--sp-1h); justify-self: end; }
.cm-lat { font-size: var(--fs-2xs); color: var(--ok); font-family: var(--mono); }
.cm-lat-err { color: var(--err); }
.cm-lat-idle { color: var(--tx2); }
.cm-row-sub { grid-area: sub; display: flex; align-items: center; gap: var(--sp-2); min-width: 0; margin-top: var(--sp-0); }
.cm-row-ep { font-size: var(--fs-2xs); color: var(--tx2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 操作图标 hover-reveal（507 先例）——「立即探活」文字钮与 ⋯ 次级菜单在此退役
 （permGating 门控语义同步更新：探活全角色，三管理钮 canAdmin）；触屏兜底走 matchMedia+is-coarse 类（本组件在 adaptSweep563 豁免册：媒体查询须经裁决迁册后才能新增） */
.cm-row-ops { grid-area: ops; display: flex; gap: var(--sp-1); justify-self: end; opacity: 0; transition: opacity .12s ease-out; }
.cm-row:hover .cm-row-ops, .cm-row:focus-within .cm-row-ops { opacity: 1; }
.is-coarse .cm-row-ops { opacity: 1; }
.cm-icob { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 22px;
  border-radius: var(--r-s); border: 1px solid var(--line); background: var(--bg2); color: var(--tx1); cursor: pointer; }
.cm-icob:hover { background: var(--bg3); color: var(--tx0); }
.cm-icob.danger:hover { color: var(--err); border-color: var(--err-line); }
.cm-icob:disabled { opacity: .5; cursor: not-allowed; }
/* 头部摘要 chip + 手动档提示（623 稿 ） */
.cm-cnt { font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg2); border: 1px solid var(--line); border-radius: 10px; padding: 0 var(--sp-2); margin-left: var(--sp-2); }
.cm-cnt b { color: var(--err); }
.cm-sort-hint { font-size: var(--fs-2xs); color: var(--ac-hi); margin-left: auto; }
.cm-empty { padding: 14px; font-size: var(--fs-sm); color: var(--tx2); text-align: center; background: var(--bg2); border: 1px dashed var(--line); border-radius: var(--r-m); margin-bottom: var(--sp-3); }

.cm-test { display: flex; align-items: center; gap: 7px; padding: 7px 11px; font-size: var(--fs-sm); border-radius: 7px; margin-bottom: var(--sp-3); }
.cm-test.ok { color: var(--ok); background: var(--ok-soft); border: 1px solid var(--ok-line); }
.cm-test.err { color: var(--err); background: var(--err-soft); border: 1px solid var(--err-line); }

.cm-form { padding: var(--sp-3); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m); }
/* .cm-form-title 退役（标题并入折叠头 cm-fold-hd） */
.cm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2h); }
.cm-f { display: flex; flex-direction: column; gap: var(--sp-1); }
.cm-f.wide { grid-column: span 2; }
.cm-f label { font-size: var(--fs-xs); color: var(--tx2); }
.cm-form-ops { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-3); }
.btn.danger:hover { color: var(--err); border-color: var(--err); }

/* 健康状态点（切换菜单 + 管理列表共用）与 minRole 徽标 */
.cs-hdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--tx2); opacity: .55; }
/* 环境徽章（chip/切换菜单/管理列表共用），生产红色醒目警示 */
.cs-env { flex-shrink: 0; padding: 1px 5px; font-size: var(--fs-2xs); font-weight: 650; letter-spacing: .3px; border-radius: 3px; border: 1px solid; }
.cs-ro { font-size: var(--fs-2xs); margin-left: 3px; opacity: .85; }
.cs-env.e-prod { color: var(--err); background: var(--err-soft); border-color: var(--err-line); }
.cs-env.e-staging { color: var(--warn); background: var(--warn-soft); border-color: var(--warn-line); }
.cs-env.e-qa { color: var(--info); background: var(--info-soft); border-color: var(--info-line); }
.cs-env.e-dev { color: var(--tx2); background: var(--bg2); border-color: var(--line); }
.cs-hdot.green { background: var(--ok); opacity: 1; box-shadow: 0 0 0 3px var(--ok-line); }
.cs-hdot.red { background: var(--err); opacity: 1; box-shadow: 0 0 0 3px var(--err-line); }
/* .cm-health 系退役（时延转右锚 .cm-lat；状态点直入主行 .cs-hdot，与切换菜单单源复用） */
/* 探活延迟简单分档——≥1000ms 落警告色（既有 --warn token，勿新建色值） */
.cm-lat-warn { color: var(--warn); }
/* 连接中心自动同步批·API Key 认证:AK 迷你角标(token 化,与 .cs-ver 同构) */
.cs-ak { flex-shrink: 0; padding: 1px 5px; font-size: var(--fs-2xs); font-weight: 600; color: var(--tx2); background: var(--bg2); border: 1px solid var(--line-strong); border-radius: 3px; }
/* 连接中心自动同步批:失联档案置灰+角标(保留展示,人工确认后删;token 化配色不新增裸色值) */
.cs-item.stale { opacity: .55; }
.cm-row.stale { opacity: .6; }
.cs-stale { flex-shrink: 0; padding: 1px 5px; font-size: var(--fs-2xs); font-weight: 600; color: var(--tx2); background: var(--bg2); border: 1px dashed var(--line-strong); border-radius: 3px; }
.cm-role { padding: 1px var(--sp-1h); font-size: var(--fs-xs); font-weight: 600; color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: 3px; }
.cm-roles { display: flex; gap: var(--sp-1h); }
.cm-role-btn {
  flex: 1; padding: 5px 0; font-size: var(--fs-xs); cursor: pointer; color: var(--tx2);
  background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s);
}
.cm-role-btn:hover { color: var(--tx1); border-color: var(--ac-hi); }
.cm-role-btn.on { color: var(--ac-hi); border-color: var(--ac-hi); background: var(--ac-soft); font-weight: 600; }
/* 本地 .spin 旋转档（自造 keyframes）退役，统一走 theme.css 全局 .spinning（svg 适用） */
</style>
