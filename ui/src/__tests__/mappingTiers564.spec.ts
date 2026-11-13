/**
 * 五百六十四批：Mapping Settings 折叠节高度可调（用户「最好可调节通通加上」）。
 *
 * 契约：useTierCycle 统一件四档循环（'mp.settingsH'，usePref 记忆）——
 * S=min(42vh,380px)（缺省，563 纯显式档语义）/ M=min(60vh,520px)（563 含默认值档）/
 * L=min(76vh,680px) / 满=''（空串=无上限，SettingsGrid maxHeight 空串即不设 style，
 * 表格自然吃满页面滚动）。节头加档位循环钮（IndexHub settingsH 同款 ArrowUpDown+
 * title 现档形态）；563 的 showDefaults 双档绑定退役——档位循环是唯一高度真源
 * （双档与手调档互相覆盖必然打架，手调优先是可调节的本意）。
 * 字段树（MappingFieldTree）已是视口满高弹性（calc(100vh - vh-offset + 90px)），
 * 档位无增益不加（备案）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('五百六十四批：Settings 折叠节高度四档可调', () => {
  it('useTierCycle 四档+缺省 S 档+节头档位循环钮（IndexHub 同款形态）', () => {
    const mv = read('../views/MappingView.vue');
    expect(mv, '四档档位表与缺省').toMatch(
      /useTierCycle\(\s*'mp\.settingsH',\s*\['min\(42vh,\s*380px\)',\s*'min\(60vh,\s*520px\)',\s*'min\(76vh,\s*680px\)',\s*''\],\s*'min\(42vh,\s*380px\)'\)/);
    expect(mv, '档位循环钮').toMatch(/aria-label="Settings 区高度档位"/);
    expect(mv, 'title 显现档').toMatch(/Settings 区高度：/);
    expect(mv, '引入 ArrowUpDown').toMatch(/ArrowUpDown/);
  });

  it('高度唯一真源：SettingsGrid 绑定 settingsH，563 双档绑定退役', () => {
    const mv = read('../views/MappingView.vue');
    expect(mv, '绑定档位值').toContain(':max-height="settingsH"');
    expect(mv, '双档绑定退役').not.toContain("showDefaults ? 'min(60vh, 520px)' : 'min(42vh, 380px)'");
  });

  it('SettingsGrid 满档（空串）= 不设 maxHeight 上限', () => {
    const g = read('../components/SettingsGrid.vue');
    expect(g, '空串不上限语义在档').toMatch(/maxHeight \? \{ maxHeight \} : undefined/);
  });
});
