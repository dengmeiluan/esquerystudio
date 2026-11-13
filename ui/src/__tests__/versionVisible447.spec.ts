/**
 * 四百四十七批：当前版本号 UI 可见——发版三链 MATCH 后的「最后一米」核验：
 * 用户/运维在侧栏底部直接看到 v2.8.19，不必解包 jar 或查接口。
 * 数据源 = vite define 构建期注入的 __STARTER_VERSION__（pom 单点，integrationGuide
 * 已消费），SideNav 底部微缩显示，icon 折叠态隐藏。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/SideNav.vue'), 'utf-8');
const guide = readFileSync(join(__dirname, '../data/integrationGuide.ts'), 'utf-8');

describe('UI 版本号可见（447 批）', () => {
  it('SideNav 底部版本行：注入常量消费+icon 态折叠', () => {
    expect(s).toContain("import { STARTER_VERSION } from '../data/integrationGuide';");
    expect(s).toMatch(/<span class="foot-tx mono v-num">v\{\{ STARTER_VERSION \}\}<\/span>/);
    expect(s).toMatch(/\.snav\.icon \.v-num \{ flex: 0 0 0; max-width: 0; min-width: 0; opacity: 0; overflow: hidden; \}/);
  });

  it('版本数据单点：integrationGuide 的 STARTER_VERSION 来源构建期注入', () => {
    expect(guide).toContain('export const STARTER_VERSION: string = __STARTER_VERSION__;');
  });
});
