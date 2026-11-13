/**
 * 三百一十六批：通知历史保留动作信息（label 清单持久化+历史行 ⚡ 徽标）——
 * toast 转瞬即逝但「错过了可操作按钮」至少知悉；回调不可序列化故只存 label。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const store = readFileSync(join(__dirname, '../stores/app.ts'), 'utf-8');
const center = readFileSync(join(__dirname, '../components/NotifyCenter.vue'), 'utf-8');

describe('通知历史动作徽标（316 批）', () => {
  it('NotifyLogItem.actions+pushNotifyLog 传参', () => {
    expect(store).toMatch(/actions\?: string\[\] \}/);
    expect(store).toMatch(/pushNotifyLog\(kind: NotifyItem\['kind'\], msg: string, actionLabels\?: string\[\]\)/);
    expect(store).toMatch(/pushNotifyLog\(kind, shown, actions\.length \? actions\.map\(a => a\.label\) : undefined\)/);
  });
  it('历史行 ⚡ 徽标+title 说明', () => {
    expect(center).toMatch(/<span v-if="n\.actions\?\.length" class="nc-acts mono"/);
    expect(center).toContain('toast 已消失，如需操作请重试原动作');
  });
});
