/**
 * 五百六十三批：Mapping Settings 全宽折叠节打磨（用户「还有很多优化点」开放反馈的
 * 自审落地——562 之上五刀）。源码锁仿 mappingSettings562/flattenWave554 范式。
 *
 * ① 全宽键值断裂根治：SettingsGrid 建容器查询（container-type:inline-size），宽容器
 *    （≥760px，MappingView 全宽 ~1200px 主受益者）值列改左对齐（Kibana 范式：值紧随
 *    键列边界，不再右对齐到容器最右造成 600px 视觉断裂）；窄容器（IndexHub 右栏
 *    ~280px）不触发断点零变——右对齐在窄栏的正确性（值独立可读）保留。
 * ② 全宽高度弹性档：折叠节 SettingsGrid max-height 440px/280px 定高 →
 *    min(60vh,520px)/min(42vh,380px)（「42vh 弹性档+原 px 兜底」约定先例）——全宽下
 *    行不折行同屏行数更多，定高浪费视口。
 * ③ 过滤框上限：.sg-filter max-width:480px——全宽下吃满 1200px 整行失态（窄容器
 *    不触顶零变）。
 * ④ 折叠态交互死路修：折叠态下点「含默认值」原样无任何可见反馈（节体隐藏）——
 *    toggleDefaults 开启时自动展开节。
 * ⑤ 节头钮 hover 反馈 + 计数 chip 动态 title（说明当前行数口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('五百六十三批：全宽折叠节打磨五刀', () => {
  it('① SettingsGrid 容器查询变体：宽容器值列左对齐，窄容器零变', () => {
    const g = read('../components/SettingsGrid.vue');
    expect(g, '建立查询容器').toMatch(/container-type:\s*inline-size/);
    expect(g, '宽容器断点').toMatch(/@container\s*\(min-width:\s*760px\)/);
    const block = g.slice(g.indexOf('@container (min-width: 760px)'));
    expect(block, '宽容器值列左对齐').toMatch(/\.sg-v\s*\{[^}]*text-align:\s*left/);
    /* 基础态（窄容器）保持右对齐 */
    expect(g, '窄容器右对齐保留').toMatch(/\.sg-v\s*\{[^}]*text-align:\s*right/);
  });

  it('③ 过滤框上限 480px（窄容器不触顶零变）', () => {
    const g = read('../components/SettingsGrid.vue');
    expect(g, '过滤框 max-width').toMatch(/\.sg-filter\s*\{[^}]*max-width:\s*480px/);
  });

  it('② 节体高度弹性档（五百六十四批同步更新：定档升级 useTierCycle 四档可调，锁迁 mappingTiers564）', () => {
    const mv = read('../views/MappingView.vue');
    /* 563 原锁双档绑定（60vh/42vh）；564 档位循环成为唯一高度真源，双档绑定退役 */
    expect(mv, '高度绑定走档位值').toContain(':max-height="settingsH"');
    expect(mv, '563 弹性档语义保留在档位表（S/M 首 二档）').toMatch(/min\(42vh,\s*380px\)/);
    expect(mv, '563 弹性档语义保留在档位表（M 档）').toMatch(/min\(60vh,\s*520px\)/);
  });

  it('④ 折叠态点「含默认值」自动展开节（交互死路修）', () => {
    const mv = read('../views/MappingView.vue');
    expect(mv, '开启时若折叠则展开').toMatch(/if\s*\(\s*showDefaults\.value\s*&&\s*setCollapsed\.value\s*\)\s*\{\s*setCollapsed\.value\s*=\s*false/);
  });

  it('⑤ 节头钮 hover 反馈 + 计数 chip 动态 title', () => {
    const mv = read('../views/MappingView.vue');
    expect(mv, '折叠钮 hover 底色').toMatch(/\.mp-set-tg:hover\s*\{[^}]*background:/);
    expect(mv, 'chip 动态 title').toMatch(/<span class="mp-set-n"[^>]*:title=/);
  });
});
