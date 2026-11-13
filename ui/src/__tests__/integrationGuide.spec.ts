/* 接入文档抽屉：节结构完整 + 版本号形态钉死（防构建注入回归成 SNAPSHOT 或变量名裸奔）
   + Maven 坐标与当前注入版本一致（防文档与产物脱节） */
import { describe, expect, it } from 'vitest';
import { GUIDE_SECTIONS, STARTER_VERSION, mavenCoordinate } from '../data/integrationGuide';

describe('integrationGuide 数据', () => {
  it('6 节齐备且 id 稳定（宿主/用户可能按 id 锚点分享）', () => {
    expect(GUIDE_SECTIONS.map(s => s.id)).toEqual([
      'integration', 'maven', 'static-page', 'iframe', 'auth', 'menu-spi',
    ]);
  });

  it('integration 首节列出默认配置与七个主题路径', () => {
    const integration = GUIDE_SECTIONS[0];
    expect(integration.id).toBe('integration');
    expect(integration.body).toContain('esquerystudio.elasticsearch.mapping.auto-register: startup');
    expect(integration.body).toContain('esquerystudio.elasticsearch.mapping.conflict-policy: fail');
    expect(integration.body).toContain('esquerystudio.elasticsearch.mapping.missing-index-policy: skip');
    for (const path of [
      'docs/integration/quickstart.md',
      'docs/integration/configuration-reference.md',
      'docs/integration/troubleshooting.md',
      'docs/integration/mapping-auto-register.md',
      'docs/integration/entity-mapping.md',
      'docs/integration/desired-state.md',
      'docs/integration/mapping-conflict-to-adhoc.md',
    ]) {
      expect(integration.body).toContain(path);
    }
  });

  it('每节有标题与正文，正文非空', () => {
    for (const s of GUIDE_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('STARTER_VERSION 是 semver 形态（构建期注入真实版本，非占位符）', () => {
    expect(STARTER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('mavenCoordinate 坐标 = io.github.dengmeiluan:esquerystudio-console:<注入版本>（字面量锚定 pom 真实 groupId，防自比锁错）', () => {
    expect(mavenCoordinate()).toBe(
      'io.github.dengmeiluan:esquerystudio-console:' + STARTER_VERSION);
  });

  it('menu-spi 节包含 perms 前缀约定（接入方契约）', () => {
    const spi = GUIDE_SECTIONS.find(s => s.id === 'menu-spi')!;
    expect(spi.body).toContain('ops:esquerystudio:conn:');
  });
});
