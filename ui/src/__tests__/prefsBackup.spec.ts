/**
 * R130 一百四十三批：本地偏好备份/恢复（记忆性轴收口）。
 * 锁定：
 * 1) 白名单正则严格限定本站键（同源 iframe 下 localStorage 与宿主共享，禁通配）；
 * 2) 导出：只含白名单键，文件带 kind 标识；
 * 3) 导入：kind 校验 + 非白名单键跳过计数；
 * 4) 清空：askConfirm 确认（confirmAudit 口径）。
 * 源码级锁（FavoritesView 挂载依赖 favReplay 链，轻量锁形态）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/FavoritesView.vue'), 'utf-8');

describe('本地偏好备份（143 批）', () => {
  it('白名单正则：本站前缀命中、宿主键不匹配', () => {
    expect(src).toMatch(/const PREF_KEY_RE = \//);
    expect(src).toContain('esquerystudio\\.');
    expect(src).toContain('es_cols:');
    expect(src).toContain('es_tbl_');
  });

  it('导出带 kind 标识 + 导入校验 kind 与白名单', () => {
    expect(src).toContain("kind: 'esquerystudio-prefs'");
    expect(src).toMatch(/parsed\.kind === 'esquerystudio-prefs'/);
    expect(src).toMatch(/!PREF_KEY_RE\.test\(k\)/);
    expect(src).toContain('刷新页面生效');
  });

  it('清空经 askConfirm + 三按钮接线', () => {
    expect(src).toMatch(/async function clearPrefs\(\)/);
    expect(src).toContain('清空本地偏好');
    expect(src).toMatch(/@click="exportPrefs"/);
    expect(src).toMatch(/@change="importPrefs"/);
    expect(src).toMatch(/@click="clearPrefs"/);
  });
});

describe('偏好白名单补 jobs.seen（一百九十八批）', () => {
  it('作业通知去重键纳入备份白名单（换端不重复通知）', () => {
    expect(src).toContain('esquerystudio\\.jobs\\.seen');
  });
});
