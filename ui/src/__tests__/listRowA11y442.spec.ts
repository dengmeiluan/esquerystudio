/**
 * 四百四十二批：列表行键盘可达全站收口（441 历史行同族放大）——17 处 v-for 列表行
 * （IndexHub 索引清单/ConfigDrift 对象清单/Ilm 策略行/Templates·模板画廊/DslQuery
 * 卡片视图/QueryHistoryPanel 历史项/builder FieldSelect 等）此前纯 @click 键盘不可达。
 * 统一补 role="button"+tabindex="0"+Enter 触发（与 @click 同一表达式）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, '..');

describe('列表行键盘可达收口（442 批）', () => {
  it('全站 v-for+@click 列表行必带 role=button+tabindex（扫描守卫）', () => {
    const offenders: string[] = [];
    let total = 0;
    for (const f of walk(SRC)) {
      const s = readFileSync(f, 'utf-8');
      for (const m of s.matchAll(/<(div|li)\b[^>]*v-for[^>]*@click(?:\.\w+)*="[^">]+"[^>]*>/g)) {
        const tag = String(m[0]);
        if (tag.includes('role=') && /role="button"/.test(tag) && /tabindex/.test(tag)) { total++; continue; }
        if (/role=/.test(tag) || /tabindex/.test(tag)) { total++; continue; }
        offenders.push(`${f}: ${tag.slice(0, 70)}`);
      }
    }
    expect(total, '扫描覆盖存量').toBeGreaterThanOrEqual(15);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('核心三处锚定：IndexHub 索引行/ConfigDrift 清单/QueryHistoryPanel 历史项', () => {
    /* 五百三十一批：「选完即收」退役（选中不自动关抽屉，支持跨索引反复对比）——Enter 触发
       表达式同批同步更新去掉 listOpen = false，role/tabindex 键盘可达契约不变 */
    expect(readFileSync(join(SRC, 'views/IndexHubView.vue'), 'utf-8')).toMatch(/role="button" tabindex="0" @keydown\.enter\.prevent="select\(idx\.index\)"/);
    /* 1439d：ConfigDrift 行统一 keydown 收口（右键菜单 + Enter/Space 检测），
       键盘可达契约仍在 handler 内；按 spaceGuard826 约定②泛 keydown 域判定 */
    const cd = readFileSync(join(SRC, 'views/ConfigDriftView.vue'), 'utf-8');
    expect(cd).toMatch(/role="button" tabindex="0"\s+@keydown="onKeyMenuKey\(\$event, k\)"/);
    expect(cd).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
    expect(readFileSync(join(SRC, 'components/QueryHistoryPanel.vue'), 'utf-8')).toMatch(/role="button" tabindex="0" @keydown\.enter\.prevent="clickable && \$emit\('play', it\)"/);
  });
});
