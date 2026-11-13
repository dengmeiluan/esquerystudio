import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 五百二十七批（W-E）：应用底色双源锚。
   应用底色有三处手写字面量，与 theme.css --bg0 的同步此前无锚：
     ① theme.css :root（dark）  --bg0: #0c1213          ← 单源本体
     ② App.vue darkOverrides    bodyColor: '#0c1213'    ← naive 不认 CSS var，必须字面量 → 双源
     ③ MonacoEditor es-light    'editor.background'      ← Monaco 主题同样要字面量 → 双源
   本锚从 theme.css 提取 --bg0 值（dark/light 两档），逐一 equal 到消费端字面量
   （正则容忍引号/空白差异）——改 --bg0 不同步消费端即红灯。
   五百二十七批核查备案（任务4 前提修正）：MonacoEditor **dark** 档 'editor.background'
   现值 #101116（偏蓝中性，全库唯一字面量），并非 --bg0 #0c1213 同值——任务简报
   「三处均为 #0c1213」与代码事实不符，且 MonacoEditor.vue 不在文件权限内不可改。
   处置：dark 档以变更探测器钉住现值（漂移即红灯强制过目）；是否向 R125 青调底色
   收敛归 theme 归属方裁决，收敛时同步更新本锚。 */

const theme = readFileSync(join(__dirname, '../theme.css'), 'utf-8');
const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8');
const monaco = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');

/* dark 档 --bg0 = 全文首个取值（:root 基座）；light 档从 :root[data-theme="light"] 块内提取 */
const bg0Dark = theme.match(/--bg0:\s*(#[0-9a-fA-F]{3,8})/)?.[1] ?? '';
const bg0Light = theme.match(/:root\[data-theme="light"\]\s*\{[^}]*?--bg0:\s*(#[0-9a-fA-F]{3,8})/s)?.[1] ?? '';

describe('五百二十七批：底色双源锚（theme.css --bg0 ⇄ 字面量消费端）', () => {
  it('防空跑：theme.css 两档 --bg0 都提取到', () => {
    expect(bg0Dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(bg0Light).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('App.vue naive dark bodyColor 与 --bg0 逐一 equal', () => {
    expect(app).toMatch(new RegExp(`bodyColor:\\s*['"]${bg0Dark}['"]`));
  });

  it('MonacoEditor light editor.background 与 light 档 --bg0 逐一 equal', () => {
    expect(monaco).toMatch(new RegExp(`'editor.background':\\s*['"]${bg0Light}['"]`));
  });

  it('MonacoEditor dark editor.background 变更探测器（现值 #101116 非 --bg0，收敛须显式过本锚）', () => {
    /* 备案：dark 编辑器画布与 #0c1213 并非同值（详见文件头注）。钉住现值防静默漂移；
       若 theme 归属方裁决收敛/再调色，请连同本断言与文件头备案一起更新。 */
    expect(monaco).toMatch(/'editor.background':\s*['"]#101116['"]/);
    expect(bg0Dark).not.toBe('#101116');
  });
});
