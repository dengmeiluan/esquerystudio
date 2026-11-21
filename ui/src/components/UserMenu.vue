<template>
  <n-popover v-if="auth.me" trigger="click" placement="bottom-end" :show-arrow="false" raw :show="umOpen" @update:show="v => umOpen = v">
    <template #trigger>
      <button class="um-chip" :title="'当前身份：' + primaryName + '（' + roleText + '）'"
        :aria-label="'用户菜单：' + primaryName + '（' + roleText + '）'" :aria-expanded="umOpen">
        <span class="um-avatar" :class="'av-' + roleText.toLowerCase()">{{ initial }}</span>
        <span class="um-name">{{ primaryName }}</span>
        <span class="um-dot" :class="'r-' + roleText.toLowerCase()" />
        <ChevronDown :size="11" class="um-caret" />
      </button>
    </template>
    <div class="um-panel" role="dialog" aria-label="用户菜单">
      <div class="um-head">
        <span class="um-avatar lg" :class="'av-' + roleText.toLowerCase()">{{ initial }}</span>
        <div class="um-head-txt">
          <div class="um-head-name">{{ primaryName }}</div>
          <div v-if="auth.me.displayName && auth.me.displayName !== auth.me.username" class="um-head-sub mono" :title="auth.me.username">
            {{ shortUsername }}
          </div>
        </div>
      </div>
      <div class="um-rows">
        <div class="um-row">
          <span class="um-k">角色</span>
          <span class="um-v">
            <span class="role-tag" :class="'r-' + roleText.toLowerCase()">{{ roleText }}</span>
            <span class="um-hint">{{ roleHint }}</span>
          </span>
        </div>
        <div class="um-row">
          <span class="um-k">身份来源</span>
          <span class="um-v">
            <ShieldCheck :size="12" :class="auth.me.fallback ? 'warn-ic' : 'ok-ic'" />
            {{ sourceLabel }}
          </span>
        </div>
        <div class="um-row" v-for="[k, v] in attrEntries" :key="k">
          <span class="um-k">{{ k }}</span>
          <span class="um-v mono um-attr" :title="v">{{ v }}</span>
        </div>
      </div>
      <div class="um-actions">
        <router-link to="/security" class="um-act">
          <Shield :size="12" /> 安全中心（审计 / 账号）
        </router-link>
        <!-- 复制诊断信息——报障时用户要手抄角色/身份/实例，一键复制 -->
        <button class="um-act" @click="copyDiag">
          <ClipboardCopy :size="12" /> 复制诊断信息
        </button>
        <button v-if="!auth.me.delegated" class="um-act danger" @click="auth.logout()">
          <LogOut :size="12" /> 退出登录
        </button>
        <div v-else class="um-note">凭证由宿主系统管理，随宿主会话进退</div>
      </div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NPopover } from 'naive-ui';
import { ChevronDown, ClipboardCopy, LogOut, Shield, ShieldCheck } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';
import { copyText } from '../utils/format';

/**
 * 顶栏身份组件：displayName 优先展示（宿主委托身份的 username 常是不可读哈希），
 * 长哈希自动缩略；点开可见完整身份档案（角色解释/来源/宿主属性）。
 */
const auth = useAuthStore();

/* 触发钮 :aria-expanded 所需的展开态（仅回写 popover 受控值，无业务逻辑） */
const umOpen = ref(false);

/** 主显名：displayName 优先；无则 username（超长哈希缩略） */
const primaryName = computed(() => {
  const m = auth.me;
  if (!m) return '';
  if (m.displayName) return m.displayName;
  const u = String(m.username ?? '（未命名身份）');
  return u.length > 18 ? u.slice(0, 8) + '…' + u.slice(-4) : u;
});

const shortUsername = computed(() => {
  const u = auth.me?.username ?? '';
  return u.length > 26 ? u.slice(0, 14) + '…' + u.slice(-6) : u;
});

/** 头像字：取主显名首个字符（中文名取姓、英文名取首字母） */
const initial = computed(() => {
  const n = auth.me?.displayName || auth.me?.username || '?';
  return String(n).charAt(0).toUpperCase();
});

/* 身份可能来自宿主委托且字段不全（role 缺席）——模板直读 .toLowerCase() 会白屏，
   这里统一出口：缺席按 VIEWER 档渲染（与后端「无写权限」默认一致）。 */
const roleText = computed(() => String(auth.me?.role || 'VIEWER'));

const roleHint = computed(() => {
  const r = auth.me?.role;
  return r === 'ADMIN' ? '全部能力，含高危操作'
    : r === 'OPERATOR' ? '可写，高危操作受限'
    : r === 'REBUILD_OP' ? '重建 / 迁移 / 回滚专项'
    : r === 'CLUSTER_OP' ? '索引 / 集群管理专项'
    : r === 'AUDIT_OP' ? '审计查看专项'
    : '只读访问';
});

const sourceLabel = computed(() => {
  const m = auth.me;
  if (!m) return '';
  if (m.delegated) return '宿主委托（SSO 单点身份）';
  if (m.fallback) return '兜底默认账号（建议尽快建正式账号）';
  return '控制台内置账号';
});

/** 宿主附加属性（部门/工号等，委托模式按需下发） */
const attrEntries = computed(() => Object.entries(auth.me?.attributes ?? {}));

/** 复制诊断信息——报障时一键带走身份/角色/来源/实例，免手抄 */
async function copyDiag() {
  const app = useAppStore();
  const me = auth.me;
  if (!me) return;
  const lines = [
    `身份: ${primaryName.value}`,
    `角色: ${me.role}（${roleHint.value}）`,
    `来源: ${sourceLabel.value}`,
  ];
  for (const [k, v] of attrEntries.value) lines.push(`${k}: ${v}`);
  const self = (app.clusterSelf || '').trim();
  if (self) lines.push(`ES 实例: ${self}`);
  const ver = (app.esVersion || '').trim();
  if (ver) lines.push(`ES 版本: ${ver}`);
  /* 钉死 zh-CN：不带参的 toLocaleString 随宿主 locale 漂移，诊断串贴工单后格式不可复现 */
  lines.push(`时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  const ok = await copyText(lines.join('\n'));
  app.notify(ok ? 'success' : 'error', ok ? '诊断信息已复制' : '复制失败');
}
</script>

<style scoped>
.um-chip {
  display: inline-flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-0) var(--sp-2) var(--sp-0) 3px; font-size: var(--fs-xs);
  color: var(--tx1); background: var(--bg2); border: 1px solid var(--line); border-radius: 99px; cursor: pointer;
}
.um-chip:hover { border-color: var(--ac-hi); }
/* 头像字收 --tx-on-strong（彩底白字语义档）：渐变底随主题深浅翻转，字色跟着 token 走 */
.um-avatar {
  width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--fs-2xs); font-weight: 600; flex-shrink: 0; color: var(--tx-on-strong);
}
.um-avatar.lg { width: 30px; height: 30px; font-size: var(--fs-lg); }
/* 角色头像渐变：从语义 token 派生，深端用 color-mix 压黑，随主题自适应 */
.av-admin { background: linear-gradient(135deg, var(--err), color-mix(in srgb, var(--err) 72%, #000)); }
.av-operator { background: linear-gradient(135deg, var(--warn), color-mix(in srgb, var(--warn) 72%, #000)); }
.av-viewer { background: linear-gradient(135deg, var(--info), color-mix(in srgb, var(--info) 72%, #000)); }
.um-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.um-dot.r-admin { background: var(--err); }
.um-dot.r-operator { background: var(--warn); }
.um-dot.r-viewer { background: var(--info); }
.um-caret { color: var(--tx2); flex-shrink: 0; }

.um-panel {
  width: 264px; background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-m);
  box-shadow: var(--shadow-pop); overflow: hidden; font-size: var(--fs-sm);
}
.um-head { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-3) 14px var(--sp-2h); }
.um-head-txt { min-width: 0; }
.um-head-name { font-size: var(--fs-md); font-weight: 600; color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-head-sub { font-size: var(--fs-2xs); color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-rows { border-top: 1px solid var(--line); padding: var(--sp-2) 14px; display: flex; flex-direction: column; gap: 7px; }
.um-row { display: flex; align-items: center; gap: var(--sp-2h); min-width: 0; }
.um-k { width: 56px; flex-shrink: 0; color: var(--tx2); font-size: var(--fs-xs); }
.um-v { display: inline-flex; align-items: center; gap: 5px; color: var(--tx1); min-width: 0; }
.um-attr { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.um-hint { color: var(--tx2); font-size: var(--fs-2xs); }
.role-tag { font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); letter-spacing: .4px; }
.r-admin { background: var(--err-soft); color: var(--err); }
.r-operator { background: var(--warn-soft); color: var(--warn); }
.r-viewer { background: var(--info-soft); color: var(--info); }
.ok-ic { color: var(--ok); }
.warn-ic { color: var(--warn); }
.um-actions { border-top: 1px solid var(--line); padding: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-0); }
.um-act {
  display: flex; align-items: center; gap: 7px; padding: var(--sp-1h) var(--sp-2); font-size: var(--fs-sm); color: var(--tx1);
  text-decoration: none; background: none; border: none; border-radius: var(--r-s); cursor: pointer; text-align: left;
}
.um-act:hover { background: var(--bg2); }
.um-act.danger { color: var(--err); }
.um-note { padding: 5px var(--sp-2) 3px; font-size: var(--fs-2xs); color: var(--tx2); }
</style>
