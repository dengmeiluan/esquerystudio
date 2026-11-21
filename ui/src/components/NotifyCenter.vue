<template>
  <!-- 通知中心——toast 转瞬即逝，重度用户切页/离开期间错过的失败通知在这里回看；
 未读只计 error/warning（app store 口径），打开面板即视为已读 -->
  <!-- popover 改受控——清空历史需先关面板再弹确认（避开弹层 z-index 叠加） -->
  <n-popover trigger="click" placement="bottom-end" :show-arrow="false" raw :show="open" @update:show="onToggle">
    <template #trigger>
      <button class="btn ghost sm nc-btn" title="通知历史（最近 50 条，错过的失败提醒可回看）" aria-label="通知历史" :aria-expanded="open">
        <Bell :size="13" />
        <span v-if="unread" class="nc-dot">{{ unread > 99 ? '99+' : unread }}</span>
      </button>
    </template>
    <div class="nc-pane" role="dialog" aria-label="通知历史">
      <div class="nc-head">
        <span>通知历史</span>
        <!-- C：工具行挂全局 .toolrow（theme.css），本地同构 flex 样式退役 -->
        <div class="nc-tools toolrow">
          <!-- 历史里成功类占大头时，真正要回看的异常被淹没——一键只看 error/warning -->
          <button v-if="store.notifyLog.length" class="btn ghost sm" :class="{ on: errOnly }"
            @click="errOnly = !errOnly" title="只看异常（error/warning）">
仅异常
</button>
          <!-- 清空补确认（65 批 RestView 清空历史同款——本地记录清了就没了） -->
          <button v-if="store.notifyLog.length" class="btn ghost sm" @click="clearLog" title="清空历史">
            <Trash2 :size="12" /> 清空
          </button>
        </div>
      </div>
      <!-- B：两支裸空态迁 EmptyState compact（原 .nc-empty 裸文案拆 title/hint，语义不变） -->
      <EmptyState v-if="!store.notifyLog.length" compact :icon="Bell" text="暂无通知"
        hint="作业完成/失败、操作结果都会留档在这里" />
      <EmptyState v-else-if="!shownLog.length" compact :icon="Bell" text="没有异常通知" hint="一切正常" />
      <div v-else class="nc-list">
        <!-- 日期分组的真时间线——跨天回看不用靠「2d 前」心算归属 -->
        <template v-for="g in grouped" :key="g.label">
          <div class="nc-day">{{ g.label }}</div>
          <div v-for="(n, i) in g.items" :key="n.ts + '-' + i" class="nc-item">
            <span class="nc-k" :class="n.kind" />
            <div class="nc-body">
              <div class="nc-msg">{{ n.msg }}</div>
              <div class="nc-meta">
                <span class="nc-ts mono" :title="tsTitle(n)">{{ relTime(n.ts, now) }}</span>
                <!-- 同文案风暴聚合为一条，×N 保留发生次数证据；：首见→最近跨度一并可见 -->
                <span v-if="(n.count || 1) > 1" class="nc-cnt mono" :title="tsTitle(n)">×{{ n.count }}</span>
                <!-- 动作徽标——该通知带过操作按钮（toast 已逝，历史侧至少知悉错过了什么） -->
                <span v-if="n.actions?.length" class="nc-acts mono" :title="'此通知带动作：' + n.actions.join('、') + '（toast 已消失，如需操作请重试原动作）'">⚡{{ n.actions.length }}</span>
                <span v-if="n.firstTs && n.ts - n.firstTs >= 1000" class="nc-span mono" :title="tsTitle(n)">持续 {{ fmtDur(n.ts - n.firstTs) }}</span>
              </div>
            </div>
            <button aria-label="复制这条通知文案" class="nc-copy btn ghost sm" title="复制这条通知文案" @click="copyMsg(n.msg)">
              <Copy :size="11" />
            </button>
          </div>
        </template>
      </div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NPopover } from 'naive-ui';
import { Bell, Trash2, Copy } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { relTime, dayLabel, fmtTime, fmtDur, copyText } from '../utils/format';
import { useNow } from '../composables/useNow';
import { askConfirm } from '../composables/confirm';
import EmptyState from './EmptyState.vue';

const store = useAppStore();
const now = useNow();
const unread = computed(() => store.notifyUnread);
const errOnly = ref(false);
const shownLog = computed(() =>
  errOnly.value ? store.notifyLog.filter(n => n.kind === 'error' || n.kind === 'warning') : store.notifyLog);
/* 按自然日分组（历史已是时序，顺序扫描即可）；绑 now 保证跨午夜时「今天/昨天」自动滑动 */
const grouped = computed(() => {
  const gs: { label: string; items: typeof store.notifyLog }[] = [];
  for (const n of shownLog.value) {
    const label = dayLabel(n.ts, now.value);
    const last = gs[gs.length - 1];
    if (last && last.label === label) last.items.push(n); else gs.push({ label, items: [n] });
  }
  return gs;
});
/* 聚合条目的完整时间线证据：首见 → 最近＋次数；单条则给绝对时间 */
function tsTitle(n: { ts: number; firstTs?: number; count?: number }): string {
  return n.firstTs && (n.count || 1) > 1
    ? `首见 ${fmtTime(n.firstTs)} → 最近 ${fmtTime(n.ts)}，共 ${n.count} 次（已聚合）`
    : fmtTime(n.ts);
}
/* popover 受控——清空历史要先关面板再弹确认（确认弹窗 z-index 低于
 naive 弹层，不关会叠在面板后面） */
const open = ref(false);
function onToggle(show: boolean) {
  open.value = show;
  if (show) store.markNotifySeen();
}
/* 清空通知历史补确认——65 批 RestView 清空历史同款（本地记录清了就没了，
 且含未读标记）。先收面板，确认弹窗由 App.vue 全局宿主渲染 */
async function clearLog() {
  open.value = false;
  if (!await askConfirm({
    title: '清空通知历史',
    level: 'warn',
    message: `将清空全部 ${store.notifyLog.length} 条通知记录（含未读标记）。仅影响本机回看，不影响集群数据，清空后无法找回。`,
    okText: '清空历史',
  })) return;
  store.clearNotifyLog();
  store.notify('success', '通知历史已清空');
}
async function copyMsg(msg: string) {
  if (await copyText(msg)) store.notify('success', '通知文案已复制');
}
</script>

<style scoped>
.nc-btn { position: relative; flex-shrink: 0; }
/* 未读角标：只在有未读 error/warning 时出现，不给成功类制噪 */
.nc-dot {
  position: absolute; top: -4px; right: -4px; min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 99px; background: var(--err); color: var(--tx-on-strong); font-size: var(--fs-2xs); font-weight: 650;
  display: flex; align-items: center; justify-content: center; font-family: var(--mono); line-height: 1;
}
.nc-pane {
  width: 340px; max-height: 420px; display: flex; flex-direction: column;
  background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-m);
  box-shadow: var(--shadow-pop); overflow: hidden;
}
.nc-head {
  display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm); font-weight: 650; color: var(--tx1); border-bottom: 1px solid var(--line); flex-shrink: 0;
}
/* C：.nc-tools 基础 flex 样式由全局 .toolrow 承担，仅保留选中态 */
.nc-tools .btn.on { color: var(--warn); border-color: currentColor; }
/* B：.nc-empty 裸空态退役迁 EmptyState compact，本地样式同步更新删除 */
.nc-list { overflow-y: auto; padding: var(--sp-1) 0; }
/* 日期组头：时间线的骨架，滚动时吸顶保持当前日期可见 */
.nc-day {
  position: sticky; top: 0; z-index: 1; padding: var(--sp-1) var(--sp-3) 3px;
  font-size: var(--fs-2xs); font-weight: 650; letter-spacing: .4px; color: var(--tx2);
  background: var(--bg1); border-bottom: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.nc-item { display: flex; gap: var(--sp-2); padding: 7px var(--sp-3); border-bottom: 1px solid color-mix(in srgb, var(--line) 45%, transparent); }
.nc-item:last-child { border-bottom: none; }
.nc-copy { opacity: 0; flex-shrink: 0; align-self: flex-start; padding: var(--sp-0) 5px; }
.nc-item:hover .nc-copy { opacity: 1; }
.nc-k { width: 7px; height: 7px; border-radius: 50%; margin-top: var(--sp-1); flex-shrink: 0; }
.nc-k.success { background: var(--ok); }
.nc-k.error { background: var(--err); }
.nc-k.warning { background: var(--warn); }
.nc-k.info { background: var(--info); }
.nc-body { flex: 1; min-width: 0; }
.nc-msg { font-size: var(--fs-sm); color: var(--tx1); line-height: 1.5; word-break: normal; overflow-wrap: anywhere; }
.nc-meta { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-0); }
.nc-ts { font-size: var(--fs-2xs); color: var(--tx2); }
/* 聚合计数：重复风暴的规模一眼可见，不用数十行重复条目去“表达” */
.nc-cnt {
  font-size: var(--fs-2xs); font-weight: 650; padding: 0 5px; border-radius: 99px; line-height: 14px;
  color: var(--warn); border: 1px solid currentColor; opacity: .9;
}
.nc-acts { font-size: var(--fs-2xs); color: var(--ac-hi); cursor: help; }
/* 风暴持续时长：首见→最近的跨度，排障时定位故障窗口 */
.nc-span { font-size: var(--fs-2xs); color: var(--tx2); }
</style>
