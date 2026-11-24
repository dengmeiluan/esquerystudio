/* Locale 敏感格式化钉死 + 浏览器深链编码卫生看守（852 批·同批预扫三矿族之二）。
 *
 * L 组（Locale）：无参 toLocaleString 族随宿主 locale 漂移——约定先例 UserMenu
 *   「钉死 zh-CN：不带参的 toLocaleString 随宿主 locale 漂移，诊断串贴工单后格式
 *   不可复现」。852 实勘两处用户可见收藏命名（QueryHubView:357 / IndexHubView:1701
 *   「收藏 <本地化时间戳>」），宿主环境一变同名判定与收藏卡排序双双漂移。
 *   合规正面在册：UserMenu（zh-CN）/ TasksView·format.ts（en-US 显式参）。
 * E 组（深链编码）：浏览器深链 query 手拼必须 encodeURIComponent——合规先例
 *   CurrentIdxChip（?idx= + encodeURIComponent）/ LifecycleView 同款；
 *   IndexHubView「/aliases?idx=' + cur」两处裸拼退役。豁免备案：DiffEditorView
 *   388/390/392 三处为 ES 请求体预览文本域（非浏览器 URL，编码语义属 DevTools
 *   执行器契约），不在本看守域。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const BARE_LOCALE = /\.toLocale(?:Date|Time)?String\(\s*\)/;

describe('localeEncodeGuard852 · Locale 钉死与深链编码', () => {
  it('L1 全站 src 树无参 toLocaleString 族清零（宿主 locale 漂移域）', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const st = statSync(p);
        if (st.isDirectory()) { if (f !== '__tests__') walk(p); }
        else if (/\.(ts|vue)$/.test(f)) files.push(p);
      }
    };
    walk(srcDir);
    const dirty: string[] = [];
    for (const f of files) {
      stripComments(readFileSync(f, 'utf8')).split('\n').forEach((ln, i) => {
        if (BARE_LOCALE.test(ln)) dirty.push(f.replace(srcDir, '') + ':' + (i + 1));
      });
    }
    expect(dirty, '无参 toLocaleString 族回流（须显式 locale 参）：\n' + dirty.join('\n')).toEqual([]);
  });

  it('L2 两处收藏命名钉死 zh-CN（同名判定跨环境稳定）', () => {
    for (const f of ['views/QueryHubView.vue', 'views/IndexHubView.vue']) {
      expect(read(f), `${f} 收藏命名未钉死 zh-CN`).toContain(
        "toLocaleString('zh-CN', { hour12: false })",
      );
    }
  });

  it('E1 IndexHubView /aliases 深链裸拼退役，编码接线在场', () => {
    const code = read('views/IndexHubView.vue');
    expect(code, "裸拼「'/aliases?idx=' + cur」复发").not.toContain("'?idx=' + cur");
    expect(code.match(/encodeURIComponent\(cur\)/g)?.length ?? 0, 'encodeURIComponent(cur) 接线须 ≥2 处').toBeGreaterThanOrEqual(2);
  });
});
