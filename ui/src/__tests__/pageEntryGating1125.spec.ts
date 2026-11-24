/**
 * 1125 批（全站逐页写入口审计的收口项）——四处「只读身份看得见却发不出去 / 缺解释」的门控回归：
 * ① IlmView 空态「在 Dev Tools 创建示例策略」写过 PUT 草稿，必须与 canDevtools 同门，
 *    无权限时连动作文案都不渲染（EmptyState actionText 空串即隐藏）；
 * ② IlmView 只读说明条：策略写键与 ilm/move 是两个端点，只有 move 缺权时也要有说明，
 *    不能因为 canOps=true 就静默让「重试 step」消失；
 * ③ SnapshotsView.openRestore 是写意图入口（打开即进入 restore 流程），除模板 v-if 外
 *    执行体首行必须自带 canOps 门，挡键盘/程序化直调；
 * ④ SecurityView 重绑区块是 ADMIN 专属：非 ADMIN 隐藏时必须留一条说明，
 *    AliasesView 只有新增权限（canOps 真 / canFullAlias 假）时也要说明缺席的切换类操作。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '../views', p), 'utf-8');
const ilm = read('IlmView.vue');
const snap = read('SnapshotsView.vue');
const sec = read('SecurityView.vue');
const alias = read('AliasesView.vue');

describe('IlmView 示例入口与只读说明（1125）', () => {
  it('示例策略入口按 canDevtools 渲染（无权限不显示动作文案，只给 hint）', () => {
    expect(ilm).toContain(':action-text="canDevtools ? \'在 Dev Tools 创建示例策略 →\' : \'\'"');
    expect(ilm).toContain(":hint=\"canDevtools ? '' : '示例策略需要在 Dev Tools 写权限");
  });

  it('createSample 执行体仍带 canDevtools 首行门（模板收起不替代执行体门）', () => {
    const m = ilm.match(/function createSample\(\) \{[\s\S]{0,400}?\n\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('if (!canDevtools.value)');
  });

  it('只读说明覆盖「策略可写但 ilm/move 不可用」这一组合态', () => {
    expect(ilm).toContain('v-if="auth.probed && !canOps && !canMove" class="ilm-perm-note"');
    expect(ilm).toContain('v-else-if="auth.probed && canOps && !canMove" class="ilm-perm-note"');
    expect(ilm).toContain('手动迁移（重试 step）不可用');
  });
});

describe('SnapshotsView.openRestore 执行体门（1125）', () => {
  it('打开恢复弹窗前先校验 canOps（挡直调）', () => {
    const m = snap.match(/function openRestore\(s: any\) \{[\s\S]{0,800}?\n\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('if (!canOps.value)');
    // 门必须在写入 restoreTarget 之前
    expect(m![0].indexOf('if (!canOps.value)')).toBeLessThan(m![0].indexOf('restoreTarget.value = s'));
  });
});

describe('SecurityView 重绑区块只读说明（1125）', () => {
  it('非 ADMIN 时显示说明而非区块凭空消失', () => {
    expect(sec).toContain('v-else-if="auth.probed" class="sec-ro-note"');
    expect(sec).toContain('重绑控制集群需 ADMIN 角色');
    expect(sec).toContain('.sec-ro-note {');
  });
});

describe('AliasesView 新增-only 说明（1125）', () => {
  it('canOps 真且 canFullAlias 假时说明切换类操作缺席', () => {
    expect(alias).toContain('v-else-if="auth.probed && canOps && !canFullAlias" class="alv-perm-note"');
    expect(alias).toContain('仅可新建别名');
  });

  it('完全只读说明保持原样（两级不互相吞掉）', () => {
    expect(alias).toContain('v-if="auth.probed && !canOps" class="alv-perm-note"');
  });
});
