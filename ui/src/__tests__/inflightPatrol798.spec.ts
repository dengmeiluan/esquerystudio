/**
 * 七百九十八批：深耕档巡查第四程·在途反馈与守卫族（Overview+Security 两页收尾）。
 *
 * 巡查族谱（713 G51 RefreshCw spinning / 748 G170 busy||loading 一行刀 / 749 G171 纯文本钮
 *   文案通道 / 770 G241 预估钮双态 同族）：深耕页主钮在途反馈残量——
 *   OV 刷新钮 RotateCw 零 spinning、两处 err-bar 重试钮零守卫；
 *   SEC 刷新用户列表/刷新安全状态双钮零守卫零反馈、删除钮守卫半缺（disabled 有 spinning 无）、
 *   users/audit 重试钮零守卫、**加载更多钮守卫错绑 auditLoading（loadMore 从不置位该 ref
 *   =守卫恒空转，在途双击 fetchAuditPage(同 offset) 双发重复追加大页行=真缺陷不止缺反馈）**。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const OV = codeOf('views/OverviewView.vue');
const SEC = codeOf('views/SecurityView.vue');

describe('七百九十八批① OV：监控历史刷新钮在途反馈（spinning 家族）', () => {
  it('刷新钮 RotateCw 绑 mhLoading spinning（713 G51 同款）', () => {
    expect(OV, 'spinning 绑定').toContain('<RotateCw :size="11" :class="{ spinning: mhLoading }" />');
  });

  it('mhErr 重试钮在途守卫（G170 一行刀同款）', () => {
    expect(OV, '重试钮守卫').toContain('<button class="btn xs" :disabled="mhLoading" @click="loadHistory">重试</button>');
  });
});

describe('七百九十八批② OV：主 load 在途 ref（ovLoading）', () => {
  it('load 起手置位/收尾复位（allSettled 不抛也复位=try/finally）', () => {
    expect(OV, 'ref 声明').toContain('const ovLoading = ref(false);');
    expect(OV, '起手置位').toContain('ovLoading.value = true;');
    expect(OV, 'finally 复位').toContain('ovLoading.value = false;');
  });

  it('loadErr 重试钮绑 ovLoading 守卫', () => {
    expect(OV, '重试钮守卫').toContain('<button class="btn xs" :disabled="ovLoading" @click="load">重试</button>');
  });
});

describe('七百九十八批③ SEC：刷新用户列表钮（usersLoading 已在案补绑）', () => {
  it('守卫+spinning 双通道', () => {
    expect(SEC, '钮守卫').toContain('@click="loadUsers" :disabled="usersLoading"');
    expect(SEC, 'spinning 绑定').toContain('<RefreshCw :size="12" :class="{ spinning: usersLoading }" />');
  });

  it('usersErr 重试钮绑 usersLoading 守卫', () => {
    expect(SEC, '重试钮守卫').toContain('<button class="btn sm" :disabled="usersLoading" @click="loadUsers">重试</button>');
  });
});

describe('七百九十八批④ SEC：删除钮在途反馈（Trash2 spinning）', () => {
  it('deleting 守卫已有，补 spinning 视觉通道', () => {
    expect(SEC, 'spinning 绑定').toContain('<Trash2 :size="12" :class="{ spinning: deleting }" />');
  });
});

describe('七百九十八批⑤ SEC：刷新安全状态钮（新增 setupLoading ref）', () => {
  it('loadSetup 起手置位/finally 复位', () => {
    expect(SEC, 'ref 声明').toContain('const setupLoading = ref(false);');
    expect(SEC, '起手置位').toContain('setupLoading.value = true;');
    expect(SEC, 'finally 复位').toContain('setupLoading.value = false;');
  });

  it('钮守卫+spinning 双通道', () => {
    expect(SEC, '钮守卫').toContain('@click="loadSetup" :disabled="setupLoading"');
    expect(SEC, 'spinning 绑定').toContain('<RefreshCw :size="12" :class="{ spinning: setupLoading }" />');
  });
});

describe('七百九十八批⑥ SEC：审计重试钮守卫 + 加载更多守卫错绑根治（真缺陷）', () => {
  it('auditErr 重试钮绑 auditLoading 守卫', () => {
    expect(SEC, '重试钮守卫').toContain('<button class="btn sm" :disabled="auditLoading" @click="loadAudit">重试</button>');
  });

  it('loadMore 自有 moreLoading ref（auditLoading 从不置位=旧守卫恒空转）', () => {
    expect(SEC, 'ref 声明').toContain('const moreLoading = ref(false);');
    expect(SEC, '防重入短路').toContain('if (moreLoading.value) return;');
    expect(SEC, 'finally 复位').toContain('moreLoading.value = false;');
  });

  it('加载更多钮双守卫+纯文本钮文案通道（G81/G171 口径）', () => {
    expect(SEC, '钮守卫').toContain(':disabled="auditLoading || moreLoading" @click="loadMore"');
    expect(SEC, '在途文案').toContain("{{ moreLoading ? '加载中…' : '加载更多' }}");
  });
});
