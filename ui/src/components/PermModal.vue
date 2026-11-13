<template>
  <n-modal :show="show" preset="card" title="我的权限" style="width:640px;max-width:94vw" :bordered="false"
    @update:show="(v: boolean) => emit('update:show', v)">
    <div v-if="loading" class="pm-loading">加载中…</div>
    <div v-else-if="err" class="pm-loading pm-err">{{ err }}</div>
    <div v-else-if="d" class="pm">
      <!-- 身份摘要：角色 + 目标连接 + 环境 + 授权模型 -->
      <div class="pm-sum" data-test="perm-sum">
        <span class="pm-role mono">{{ d.role }}</span>
        <span class="pm-target">{{ d.connName || (d.target === 'host' ? '宿主集群' : d.target) }}</span>
        <span v-if="d.env" class="pm-env mono">{{ d.env }}</span>
        <span class="pm-model">{{ d.connModel ? '连接授权模型' : '全局角色档' }}</span>
      </div>

      <!-- 高危档位：raw 直连 / 共享写端点 -->
      <div class="pm-sec-t">高危档位</div>
      <div class="pm-cap" data-test="perm-raw">
        <span class="pm-cap-k">REST 直连</span>
        <span class="pm-cap-v" :class="d.rawAllowed ? 'is-ok' : (d.rawReadAllowed ? 'is-partial' : 'is-no')">{{ d.rawAllowed ? '可读可写' : (d.rawReadAllowed ? '只读（仅可发查询类请求）' : '不可用（需 ADMIN 或 rest 页读/写权限）') }}</span>
      </div>
      <div class="pm-cap" data-test="perm-devtools">
        <span class="pm-cap-k">Dev Tools 执行</span>
        <span class="pm-cap-v" :class="d.devtoolsAllowed ? 'is-ok' : (d.devtoolsReadAllowed ? 'is-partial' : 'is-no')">{{ d.devtoolsAllowed ? '可读可写' : (d.devtoolsReadAllowed ? '只读（仅可发查询类请求）' : '不可用（需 ADMIN、devtools 或 rest 页读/写权限）') }}</span>
      </div>
      <div class="pm-cap">
        <span class="pm-cap-k">共享写端点（文档/任务/ILM/DevTools 等归属页）</span>
        <span class="pm-cap-v" :class="d.sharedWriteAllowed ? 'is-ok' : 'is-no'">{{ d.sharedWriteAllowed ? '可用' : '不可用' }}</span>
      </div>
      <div class="pm-note">REST/DevTools 写仅覆盖数据面（检索/文档/批量）；别名切换、reindex、快照恢复、索引模板需对应页面写权限。</div>

      <!-- 逐页判定清单 -->
      <div class="pm-sec-t">逐页判定</div>
      <div v-for="g in d.groups" :key="g.id" class="pm-group">
        <div class="pm-group-t">{{ g.name }}</div>
        <div v-for="p in g.pages" :key="p.key" class="pm-row" :data-test="'perm-page-' + p.key">
          <span class="pm-row-k">{{ p.name }}</span>
          <span class="pm-row-v">
            <span v-if="!p.read" class="is-no">页面未授权</span>
            <template v-else>
              <span v-if="p.write === true" class="is-ok">{{ writeText(p) }}</span>
              <span v-else-if="p.write === false" class="is-no">{{ denyText(p.writeDeny) }}</span>
              <span v-else class="is-na">无写操作</span>
            </template>
          </span>
        </div>
      </div>
      <div class="pm-note">判定与后端拦截器同源（页面门 → 连接写门 → 角色门）；「无写操作」=该页全部端点均为只读查询。</div>
    </div>
    <template #footer>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn sm" @click="emit('update:show', false)">关闭</button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import { api } from '../api';

const props = defineProps<{ show: boolean; target: string | null }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const d = ref<any>(null);
const loading = ref(false);
const err = ref('');

watch(() => props.show, (v) => {
  if (!v) return;
  loading.value = true;
  err.value = '';
  api.auth.permissions(props.target || undefined).then((r: any) => {
    d.value = r;
  }).catch((e: any) => {
    err.value = e?.message || '权限信息拉取失败';
  }).finally(() => {
    loading.value = false;
  });
}, { immediate: true });

function denyText(reason?: string): string {
  if (!reason) return '不可写';
  if (reason === 'WRITE_DENIED') return '连接写权限未授予';
  if (reason === 'PAGE_DENIED') return '页面未授权';
  if (reason === 'DELEGATED_SECURITY_READONLY') return '委派会话只读（账号仅 ADMIN 管理）';
  if (reason === 'PAGE_SCOPED_SECURITY_READONLY') return '页面授权只读（本地账号是全局身份，仅 ADMIN 可管理）';
  if (reason === 'HOST_DEST_WRITE_REQUIRED') return '可中止/探测；启动与续跑还需宿主集群的迁移写权限';
  if (reason === 'CLUSTER_SCOPE_REQUIRED') return '集群级动作需 rank3 或集群设置写权（页内操作不受限）';
  if (reason === 'CONN_FORBIDDEN') return '当前角色低于该连接要求';
  if (reason === 'CONN_NOT_FOUND') return '目标连接不存在或已删除';
  if (reason.startsWith('ROLE_INSUFFICIENT:')) return `需 ${reason.slice('ROLE_INSUFFICIENT:'.length)} 角色`;
  return reason;
}

/** 可写档的精细说明：写出真实范围（数据面全权/仅新增别名/部分受限），不留「可写」黑盒。 */
function writeText(p: any): string {
  if (p.writeScope === 'DATA_PLANE') return '可写（数据面全权）';
  if (p.writeScope === 'ADD_ONLY') return '可写（仅新增别名）';
  if (p.writeDeny === 'CLUSTER_SCOPE_REQUIRED') return '可写（集群开关需 rank3）';
  if (p.writeDeny === 'HOST_DEST_WRITE_REQUIRED') return '可写（启动/续跑需宿主写权）';
  if (typeof p.writeDeny === 'string' && p.writeDeny.startsWith('PARTIAL_ROLE:')) {
    return `可写（高危端点需 ${p.writeDeny.slice('PARTIAL_ROLE:'.length)}）`;
  }
  if (p.writeDeny) return '可写（部分受限）';
  return '可写';
}
</script>

<style scoped>
.pm-sum { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.pm-role { background: var(--ok-soft); color: var(--ok); border-radius: var(--r-xs); padding: 1px 7px; font-size: var(--fs-sm); font-weight: 600; }
.pm-target { font-size: var(--fs-md); font-weight: 600; color: var(--tx0); }
.pm-env { background: var(--warn-soft); color: var(--warn); border-radius: var(--r-xs); padding: 1px 7px; font-size: var(--fs-xs); }
.pm-model { margin-left: auto; font-size: var(--fs-sm); color: var(--tx2); }
.pm-sec-t { font-size: var(--fs-sm); font-weight: 600; color: var(--tx0); margin: 14px 0 6px; }
.pm-cap { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); }
.pm-cap-k { color: var(--tx1); }
.pm-group { margin-bottom: 10px; }
.pm-group-t { font-size: var(--fs-sm); color: var(--tx2); margin: 8px 0 2px; }
.pm-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); }
.pm-row:last-child { border-bottom: 0; }
.pm-row-k { color: var(--tx1); }
.pm-row-v { text-align: right; }
.pm-cap-v { text-align: right; }
.is-ok { color: var(--ok); }
.is-no { color: var(--err); }
.is-na { color: var(--tx2); }
.pm-note { margin-top: 12px; font-size: var(--fs-xs); color: var(--tx2); }
.pm-loading { padding: 24px 0; text-align: center; color: var(--tx2); font-size: var(--fs-sm); }
.pm-err { color: var(--err); }
</style>
