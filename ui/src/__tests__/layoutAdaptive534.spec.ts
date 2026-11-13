/**
 * 五百三十四批：布局自适应源码锁（全源码锁，零挂载）。
 * 锁三件事：
 * ① 补 900 紧凑微调档的 5 视图（SearchTemplates/Topology/TemplateGallery/Slm/Watcher）
 *    档在场且非空（responsive900Sweep529 同口径：多行块提取正则兼容写法，防回删防空壳档）；
 * ② WorkspaceView .ws-grid auto-fit minmax 自适应列（固定 3 列退役），且 ≤1100/≤900 压列档
 *    不回归（auto-fit 只接管宽档，窄档压列仍由断点承担）；
 * ③ 900 档纪律口径同步更新：档内无 ≥300px 裸 width、视图侧无 min-width:901px（responsiveGuard239
 *    锚①④同源，新增档不得破例）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (name: string) => readFileSync(join(__dirname, '..', 'views', `${name}.vue`), 'utf-8');
/* 900 档块提取：与 responsive900Sweep529 同正则（规则全为单行，非贪婪到首个行首 `}` 即块尾） */
const block900Of = (src: string) => src.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);

describe('五百三十四批：5 视图 900 紧凑微调档在场且非空', () => {
  const VIEWS = [
    'SearchTemplatesView', 'TopologyView', 'TemplateGalleryView', 'SlmView', 'WatcherView',
  ] as const;

  it('① 档在场且档内非空（防回删、防空壳档）', () => {
    for (const name of VIEWS) {
      const block = block900Of(srcOf(name));
      expect(block, `${name}.vue 缺 900 紧凑微调档`).toBeTruthy();
      expect(block![0], `${name}.vue 900 档为空壳`).toMatch(/\{[^{}]+\}/);
    }
  });

  it('③ 新增档不踩纪律口径：无 ≥300px 裸 width、无视图侧 min-width:901px', () => {
    for (const name of VIEWS) {
      const src = srcOf(name);
      expect(src, `${name}.vue 视图侧不得自写 901 补集`).not.toContain('min-width: 901px');
      for (const line of block900Of(src)![0].split('\n')) {
        const m = line.match(/(?:^|[^-.\w])width:\s*(\d{3,})px/);
        expect(!!m && Number(m[1]) >= 300, `${name}.vue 900 档出现 ≥300px 裸 width：${line.trim()}`).toBe(false);
      }
    }
  });
});

describe('五百三十四批：WorkspaceView .ws-grid 自适应列', () => {
  it('② 固定 3 列退役改 auto-fit minmax(340px,1fr)；≤1100/≤900 压列档不回归', () => {
    const src = srcOf('WorkspaceView');
    expect(src, '.ws-grid 须为 auto-fit minmax 自适应列（超宽 3 大列/中宽挤压双收口）')
      .toMatch(/\.ws-grid \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(340px, 1fr\)\); gap: var\(--sp-3\); \}/);
    expect(src, '固定 repeat(3, 1fr) 不得回潮').not.toContain('grid-template-columns: repeat(3, 1fr)');
    expect(src, '≤1100 两列档不得回删').toMatch(/@media \(max-width: 1100px\) \{\s*\n\s*\.ws-grid \{ grid-template-columns: repeat\(2, 1fr\); \}/);
    expect(src, '≤900 单列档不得回删').toMatch(/@media \(max-width: 900px\) \{\s*\n\s*\.ws-grid \{ grid-template-columns: 1fr; \}/);
  });
});
