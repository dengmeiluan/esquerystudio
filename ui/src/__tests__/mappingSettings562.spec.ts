/**
 * 五百六十二批：Mapping 页 Settings 上下全宽布局（用户实报「右边 setting 太小了看不清，
 * 为什么不按照双排/上下」）。静态源码断言仿 flattenWave554/analyLink331 范式。
 *
 * 改造契约：
 * - Settings 迁出 240–300px 窄右栏（长键 indexing.slowlog.* 折 2–3 行不可读的根因）
 *   → 字段树下方全宽折叠节（用户「上下」选项终审；设计稿 docs/design-mapping-settings-562.html，
 *   visual-judge 五点通过在档）
 * - 节头=折叠钮（图标+Settings+共 N 项 chip+静态 M 摘要+chevron）+右「含默认值」钮
 *   （兄弟位，规避 button 嵌套 button 非法结构）
 * - usePref('mp.settingsCollapsed') 缺省 false（展开——用户诉求就是「看见」；对照
 *   DslQuery buildCollapsed 缺省 true 因构建区体量大）
 * - 类型分布环图留右栏（体量小、窄栏适配）；mp-side 内不再有 SettingsGrid
 * - isStaticSettingKey 自 SettingsGrid 合并 utils/settingsView 单源（节头静态摘要与
 *   行内徽标共用一套清单，防漂移）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isStaticSettingKey } from '../utils/settingsView';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('五百六十二批：Mapping 页 Settings 上下全宽折叠节', () => {
  it('Settings 迁出 mp-grid 右栏 → 栅格之后全宽折叠节（.mp-set-sec）', () => {
    const s = read('../views/MappingView.vue');
    const gridClose = s.indexOf('</div><!-- mp-grid');
    /* mp-grid 闭合锚：以 mp-set-sec 出现在「最后一个 mp-side/mp-sec 之后」为界 */
    const lastMpSec = s.lastIndexOf('class="mp-sec"');
    const setSec = s.indexOf('mp-set-sec');
    expect(lastMpSec, '右栏分节仍在').toBeGreaterThan(-1);
    expect(setSec, '全宽折叠节存在').toBeGreaterThan(lastMpSec);
    expect(s, '折叠节体仍有 SettingsGrid（全宽承载）').toMatch(/mp-set-body[\s\S]{0,400}SettingsGrid/);
  });

  it('mp-side 窄栏内 SettingsGrid 绝迹（类型分布独占右栏）', () => {
    const s = read('../views/MappingView.vue');
    const sideStart = s.indexOf('class="mp-side"');
    const sideEnd = s.indexOf('</div>', s.indexOf('mp-sec', sideStart));
    const side = s.slice(sideStart, sideEnd + 6);
    expect(sideStart).toBeGreaterThan(-1);
    expect(side, '右栏只留类型分布分节').not.toContain('SettingsGrid');
    expect(side).toContain('类型分布');
  });

  it('折叠态 usePref 记忆 + 缺省展开 + 节头摘要（计数 chip/静态 M）', () => {
    const s = read('../views/MappingView.vue');
    expect(s, 'usePref 键与缺省').toContain("usePref('mp.settingsCollapsed', false)");
    expect(s, '计数 chip').toMatch(/mp-set-n[^>]*>\{\{ settingsRows\.length \}\}/);
    expect(s, '静态摘要').toMatch(/静态 \{\{ staticCount \}\}/);
    expect(s, 'aria 展开/收起语义').toMatch(/aria-expanded="!setCollapsed"/);
    expect(s, '含默认值钮在节头右侧（兄弟位非嵌套；五百六十四批同步更新：中间插入档位循环钮，窗口放宽）').toMatch(/mp-set-sp[\s\S]{0,900}含默认值/);
  });

  it('isStaticSettingKey 单源合并 utils/settingsView，SettingsGrid 改引共用', () => {
    const g = read('../components/SettingsGrid.vue');
    expect(g, 'SettingsGrid 引单源').toMatch(/import \{[^}]*isStaticSettingKey[^}]*\} from '\.\.\/utils\/settingsView'/);
    expect(g, '本地清单退役').not.toContain('const STATIC_KEYS = new Set');
    const mv = read('../views/MappingView.vue');
    expect(mv, 'MappingView 引单源算节头静态摘要').toMatch(/isStaticSettingKey/);
  });

  it('isStaticSettingKey 行为：静态清单命中（带/不带 index. 前缀双口径）', () => {
    expect(isStaticSettingKey('number_of_shards')).toBe(true);
    expect(isStaticSettingKey('index.number_of_shards')).toBe(true);
    expect(isStaticSettingKey('index.codec')).toBe(true);
    expect(isStaticSettingKey('refresh_interval')).toBe(false);
    expect(isStaticSettingKey('indexing.slowlog.threshold.index.debug')).toBe(false);
  });
});
