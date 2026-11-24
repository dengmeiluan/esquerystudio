/**
 * 一千三百七十批：批量写入「失败样例」右键菜单。
 *
 * 用户要求「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」。
 * 批量写入结果里「前 20 条失败样例」此前右键是浏览器默认菜单——运营拿到失败清单
 * 第一件事就是「把这条错误拿去搜/贴给同事」，却只能手动划选文本。
 *
 * 本 spec 锁：
 *  ① 失败条目挂 contextmenu.prevent + 用项目统一右键件
 *  ② 一级符合约定：≤3（2 动作 + 1 分组父行），且"复制错误原因"确实读 error.reason/type
 *  ③ 空原因不许谎称复制成功（提示要说明这条没有原因字段）
 *  ④ 负控：去掉 contextmenu 绑定 → ① 必须红
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../views/BulkEditorView.vue'), 'utf-8');

describe('1370 批量写入失败样例右键菜单', () => {
  it('① 失败条目挂 contextmenu.prevent + 统一右键件', () => {
    expect(SRC, 'be-fail-item 必须有右键绑定').toMatch(
      /class="be-fail-item"[\s\S]{0,120}@contextmenu\.prevent="openFailMenu\(\$event, f, i\)"/,
    );
    expect(SRC, '必须用项目统一右键件').toContain("import CellContextMenu, { type CcmItem }");
    expect(SRC, '菜单必须真渲染').toContain(':items="failMenuItems"');
  });

  it('② 一级 ≤3（2 动作 + 分组父行）且错误原因读 error.reason/type', () => {
    const i = SRC.indexOf('const failMenuItems = computed<CcmItem[]>');
    expect(i, '必须有 failMenuItems').toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n});', i));
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const l1 = [...beforeChildren.matchAll(/key: '([a-z-]+)',\s*label:/g)].map(m => m[1]);
    expect(l1.length, `一级必须 ≤3，实际：${l1.join(',')}`).toBeLessThanOrEqual(3);
    expect(l1, '必须有分组父行').toContain('fail-more');
    /* 形状兼容：后端扁平 {error} 与 ES 原生 {index:{error}} 两种都要认 */
    const helper = SRC.slice(SRC.indexOf('function failErr'), SRC.indexOf('const failMenuItems'));
    expect(helper, '必须兼容扁平与 index 包裹两种形状').toMatch(/f\.error\s*\|\|\s*\(f\.index\s*&&\s*f\.index\.error\)/);
    expect(body, '错误原因必须读 reason 或 type').toMatch(/\(e && \(e\.reason \|\| e\.type\)\)|e\.reason\s*\|\|\s*e\.type/);
    expect(body, '整条明细必须真的 JSON 化').toContain('JSON.stringify(m.f, null, 2)');
  });

  it('③ 空原因不许谎称复制成功', () => {
    const i = SRC.indexOf('const failMenuItems = computed<CcmItem[]>');
    const body = SRC.slice(i, SRC.indexOf('\n});', i));
    expect(body, '必须为「没有原因字段」给出不同文案').toMatch(/这条没有错误原因字段/);
    /* 该文案必须只在 reason 为空时出现（三元），不能恒真 */
    expect(body, '空原因分支必须是条件式的').toMatch(/reason\s*\?\s*'已复制错误原因'\s*:\s*'这条没有错误原因字段'/);
  });

  it('④ 负控：去掉 contextmenu 绑定 → ① 必须红', () => {
    const broken = SRC.replace('@contextmenu.prevent="openFailMenu($event, f, i)"', '');
    expect(broken, '负控必须真的改掉源码').not.toBe(SRC);
    expect(broken, '去掉后必须判不合格').not.toMatch(
      /class="be-fail-item"[\s\S]{0,120}@contextmenu\.prevent="openFailMenu/,
    );
  });
});
