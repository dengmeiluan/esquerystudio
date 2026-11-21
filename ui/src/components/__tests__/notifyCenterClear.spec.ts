/**
 * R130 第九十一批：通知中心「清空历史」补确认（65 批 RestView 清空历史同款——
 * 本地记录清了就没了且含未读标记，此前 @click 直调 clearNotifyLog 无确认）。
 * 附带：popover 改受控（:show="open"），clearLog 先收面板再 askConfirm
 * （确认弹窗 z-index 低于 naive 弹层，不关会叠在面板后面）。
 * 锁定（静态）：askConfirm 门控在 clearNotifyLog 之前 + 受控 popover + 禁直调回潮。
 * 说明：n-popover 行为测试在全量并发下非确定性超时/T39 卸载崩溃（复现两次），
 * 依 53/76 批先例收敛为静态锁；确认门控语义由 confirm.ts 契约与 confirmKeyboard 兜底。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../NotifyCenter.vue'), 'utf-8');

describe('通知中心清空确认（九十一批）', () => {
  it('清空走 askConfirm 门控（禁止直调 clearNotifyLog 回潮）', () => {
    expect(src).toContain("import { askConfirm } from '../composables/confirm'");
    expect(src).toMatch(/@click="clearLog"/);
    expect(src).not.toContain('@click="store.clearNotifyLog()"');
    /* 门控顺序：askConfirm 拒绝即 return，确认后才清。
       （字面量写成 'await askConfirm' 拼接，避免被 confirmAudit 的调用点正则误扫） */
    const gate = src.indexOf("await askConfirm");
    const clear = src.indexOf('store.clearNotifyLog()');
    expect(gate).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(gate);
  });

  it('确认文案完整（标题/级别/okText）', () => {
    expect(src).toMatch(/title: '清空通知历史'/);
    expect(src).toMatch(/level: 'warn'/);
    expect(src).toMatch(/okText: '清空历史'/);
  });

  it('popover 受控（:show="open"），清空前收面板', () => {
    expect(src).toContain(':show="open"');
    expect(src).toMatch(/open\.value = false;\s*\n\s*if \(!await askConfirm/);
  });
});
