/**
 * 四百零一批：聚焦面（FocusableSurface）交互根治——用户实报「放大后缩小不了」：
 * 聚焦后右上角按钮仍是「⤢ 聚焦」，点击无效果，唯一退出路径是 Esc（鼠标用户无路可退）。
 * 修：同钮双态（聚焦 Maximize2 ↔ 还原 Minimize2，点击即退出，Esc 双保险）+
 * 聚焦态按钮提级样式（此前小灰钮浮在 Monaco 上不可辨）。
 * DevToolsView 配套三修：dt-actions 窄容器不再逐字断行（截图竖排堆叠）/
 * 搜响应空词不再显示 0/0 假计数/聚焦态 Monaco 随视口拉伸（此前固定 260px 放大后下半屏空白）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fs = readFileSync(join(__dirname, '../components/FocusableSurface.vue'), 'utf-8');
const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('聚焦面双态钮（401 批）', () => {
  it('同钮双态：聚焦 Maximize2 ↔ 还原 Minimize2，点击分派 activate/deactivate', () => {
    expect(fs).toMatch(/<Maximize2 v-if="!enabled" :size="12" \/>/);
    expect(fs).toMatch(/<Minimize2 v-else :size="12" \/>/);
    expect(fs).toMatch(/@click="enabled \? deactivate\(\) : activate\(\)"/);
    expect(fs).toMatch(/aria-label="enabled \? `还原\$\{title\}` : `聚焦\$\{title\}`"/);
    expect(fs).toMatch(/function deactivate\(\) \{\s*emit\('update:enabled', false\);\s*\}/);
    expect(fs, '旧字符图标退役').not.toContain('⤢');
  });

  it('聚焦态按钮提级样式（fs-head.on 主色描边+阴影）', () => {
    expect(fs).toMatch(/\.fs-head\.on \.fs-btn \{/);
    expect(fs).toContain('border-color: var(--ac);');
  });
});

describe('DevTools 响应区配套（401 批）', () => {
  it('dt-actions 换行策略：562 实报升级单轨（nowrap+横滚与聚焦钮同行；子项不逐字断保留）', () => {
    /* 五百二十七批同步更新：gap 收 --sp 半档；五百六十二批同步更新（用户实报窄容器堆竖排）：
       容器「可换行」升级为单轨（543 批 lrBarSingleTrack 约定同刀），行为锁见 dtInsFieldFix562 */
    expect(dt).toMatch(/\.dt-actions \{ display: flex; gap: var\(--sp-1h\); align-items: center; flex-wrap: nowrap; overflow-x: auto; min-width: 0; flex: 1 1 0; \}/);
    expect(dt).toMatch(/\.dt-actions > \* \{ white-space: nowrap; flex-shrink: 0; \}/);
  });

  it('搜响应：空词隐藏 0/0 假计数（模板 v-if 包裹计数与导航钮）', () => {
    expect(dt).toMatch(/<template v-if="respFind\.kw\.value\.trim\(\)">[\s\S]*?dt-resp-mc[\s\S]*?<\/template>/);
  });

  /* 五百零一批：普通态 260px→'100%' 跟随 pane（pane 52vh 起步，工作区不再挤在页面上部）
     524 批同步更新：裸 190px 折算进 --vh-offset 收敛口径（210-20=190 视觉零变化） */
  it('聚焦态 Monaco 拉伸：响应面高度随视口，普通态跟随 pane（100%）', () => {
    expect(dt).toMatch(/:height="focusPaneId === 'devtools\.search\.response' \? 'calc\(100vh - var\(--vh-offset\) \+ 20px\)' : '100%'"/);
  });

  it('404 补：聚焦态解除 dt-out 500px 上限（否则 calc 高度被裁回，放大假拉伸）+busy 占位同步拉伸', () => {
    expect(dt).toMatch(/\.fs-active \.dt-out \{ max-height: none; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; \}/);
    expect(dt).toMatch(/\.fs-active \.dt-out \.dt-out-monaco \{ flex: 1 1 auto; \}/);
    expect(dt).toMatch(/\.fs-active \.dt-waiting \{ flex: 1 1 auto;/);
  });

  /* 五百零一批：普通态 220px→'100%'（405 对称拉伸语义升级为「跟随 pane」）
     524 批同步更新：裸 90px 折算进 --vh-offset 收敛口径（210-120=90 视觉零变化） */
  it('405 补：请求体聚焦态对称拉伸（与 404 响应面同款，普通态跟随 pane）', () => {
    expect(dt).toMatch(/:height="focusPaneId === 'devtools\.search\.request' \? 'calc\(100vh - var\(--vh-offset\) \+ 120px\)' : '100%'"/);
  });
});
