/**
 * 三百八十五批：导出链底层行为单测补齐——format.spec 此前覆盖 fmt 系列，
 * downloadText/exportStamp（380 批口径守卫钉住的底层）零行为测试。
 * 契约：exportStamp 本地时间 YYYYMMDD-HHMMSS（toISOString UTC 陷阱的对照面）；
 * downloadText BOM 前缀/mime 透传/生命周期（createObjectURL→click→revokeObjectURL）。
 */
import { describe, it, expect, vi } from 'vitest';
import { exportStamp, downloadText } from '../format';

describe('exportStamp（385 批）', () => {
  it('本地时间格式 YYYYMMDD-HHMMSS，padStart 补零', () => {
    // Date 构造 y,m,d 为本地时区分量——与 toISOString(UTC) 形成对照
    const d = new Date(2026, 8, 11, 7, 5, 9); // 2026-09-11 07:05:09 本地
    expect(exportStamp(d)).toBe('20260911-070509');
    const d2 = new Date(2026, 11, 31, 23, 59, 59);
    expect(exportStamp(d2)).toBe('20261231-235959');
  });
});

describe('downloadText（385 批）', () => {
  it('BOM 可选、对象 URL 创建后点击并释放', async () => {
    const created: Blob[] = [];
    let n = 0;
    const create = vi.fn((b: Blob) => { created.push(b); return `blob:mock-${++n}`; });
    const revoke = vi.fn();
    (globalThis as any).URL.createObjectURL = create;
    (globalThis as any).URL.revokeObjectURL = revoke;
    const clicks: string[] = [];
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.download + '|' + this.href);
    };

    downloadText('a.csv', 'x,y', 'text/csv;charset=utf-8', { bom: true });
    downloadText('b.json', '{}', 'application/json');

    expect(create).toHaveBeenCalledTimes(2);
    expect(clicks[0]).toBe('a.csv|blob:mock-1');
    expect(clicks[1]).toBe('b.json|blob:mock-2');
    expect(revoke).toHaveBeenCalledTimes(2);
    // BOM：首个带 \ufeff 前缀，第二个不带
    expect((await created[0].text()).startsWith('\ufeff')).toBe(true);
    expect((await created[1].text()).startsWith('\ufeff')).toBe(false);
    expect(await created[1].text()).toBe('{}');
  });
});
