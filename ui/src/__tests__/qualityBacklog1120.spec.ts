/**
 * 组件质量存量迁移看守（与 componentQualityBan1120 只减不增门禁配套）：
 * 计数门禁只保证「命中数不超白名单」，本 spec 锁「迁移后的接线形态」——
 * 已迁走的长释义/换算不得以别的写法回潮。
 * - 看守一（title→Tip）：12 处超长原生 title（61~176 字符）已迁 Tip 组件承载，
 *   对应文件必须 <Tip ... text="..."> 接线在场、import Tip 在场、旧 title 属性
 *   字面不再在场（防手滑回退）。短 title（≤60）与动态 :title 绑定不在本 spec 范围。
 * - 看守二（1024→parseBytes）：ReindexPreviewView 的体积阈值与速率换算全部走
 *   utils/format.ts 的 parseBytes 单源，手搓 1024 字面在该文件零残留；页内展示
 *   字节格式化仍走 fmtSize（semFormat bytes 档单源包装）。
 * 数值行为锁：parseBytes 的四档换算值与原手搓字面逐一相等（迁移零语义漂移）。
 * Tip 组件的渲染冒烟（插槽透传/long 档样式）已在 componentQualityBan1120 覆盖，
 * 此处不重复。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBytes } from '../utils/format';

const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf-8');

/* 12 处迁移登记：file=迁移文件；text=Tip text 属性特征子串；oldForms=不得再出现的
   旧原生 title 写法（静态 title= / 绑定 :title="'…'" / 组件 title prop 透传）——
   旧释义只许以 text="..." 形态在场，不许以任何 title= 形态回潮。 */
const TIP_MIGRATIONS: { file: string; text: string; count?: number; oldForms: string[] }[] = [
  {
    file: 'views/LifecycleView.vue',
    text: 'ILM 动作名（下拉候选=官方九动作',
    count: 2,
    oldForms: [`:title="'ILM 动作名（下拉候选=官方九动作`],
  },
  {
    file: 'views/ReindexAdvancedView.vue',
    text: 'Power Mode — 请谨慎操作：这是不设幂等/自动校验的原生入口',
    oldForms: ['title="Power Mode — 请谨慎操作：这是不设幂等'],
  },
  {
    file: 'views/ReindexAdvancedView.vue',
    text: 'version_type：版本控制——internal 用 dest 内部自增版本',
    oldForms: ['title="version_type：版本控制'],
  },
  {
    file: 'components/ResultTable.vue',
    text: '表格已获焦：↑↓ 切换行、Home/End 跳首末行、Enter 打开文档',
    oldForms: ['title="表格已获焦：↑↓ 切换行、Home/End 跳首末行、Enter 打开文档'],
  },
  {
    file: 'views/TemplatesView.vue',
    text: '目标集群版本 < 7.8，已降级读写 legacy /_template',
    oldForms: ['title="目标集群版本 < 7.8'],
  },
  {
    file: 'views/AdhocRebuildView.vue',
    text: '业务侧实体没有 @Mapping，这份来自 starter 对实体注解的推导',
    oldForms: ['title="业务侧实体没有 @Mapping'],
  },
  {
    file: 'views/DevToolsView.vue',
    text: '运行需 ADMIN、DevTools 或 REST 页写权限',
    oldForms: ['title="运行需 ADMIN、DevTools 或 REST 页写权限'],
  },
  {
    file: 'components/QueryResultTable.vue',
    text: '表格已获焦：↑↓ 切换行、Home/End 跳首末行、Ctrl+C 复制行 JSON',
    oldForms: ['title="表格已获焦：↑↓ 切换行、Home/End 跳首末行、Ctrl+C 复制行 JSON'],
  },
  {
    file: 'components/HistogramSection.vue',
    text: '自动注入直方图聚合（date 型走时间直方图',
    oldForms: ['title="自动注入直方图聚合'],
  },
  {
    file: 'views/DslQueryView.vue',
    text: '自动注入直方图聚合（date 型走时间直方图',
    oldForms: ['title="自动注入直方图聚合'],
  },
  {
    file: 'views/SqlConsoleView.vue',
    text: 'SQL 参数：SQL 里用 ? 占位，按顺序填 JSON 数组',
    oldForms: ['title="SQL 参数：SQL 里用 ? 占位'],
  },
];

describe('1120 存量迁移看守：超长原生 title 已迁 Tip（接线形态不回退）', () => {
  for (const m of TIP_MIGRATIONS) {
    const src = read(m.file);
    it(`${m.file}：Tip 承载「${m.text.slice(0, 18)}…」`, () => {
      expect(src, 'import Tip 在场（缺了模板不渲染）').toContain('import Tip from');
      const n = src.split(`text="${m.text}`).length - 1;
      expect(n, 'Tip text 接线在场').toBe(m.count ?? 1);
    });
    it(`${m.file}：旧原生 title 写法不再在场`, () => {
      for (const old of m.oldForms) {
        expect(src, `不得回退：${old.slice(0, 40)}…`).not.toContain(old);
      }
    });
  }

  it('12 处迁移登记面与门禁白名单收缩一致（LifecycleView 动作名两处同文）', () => {
    /* 登记表 11 条（LifecycleView 两处同文并成一条 count=2），覆盖 10 个文件 */
    expect(TIP_MIGRATIONS.length).toBe(11);
    expect(new Set(TIP_MIGRATIONS.map(m => m.file)).size).toBe(10);
  });
});

describe('1120 存量迁移看守：ReindexPreviewView 手搓 1024 → parseBytes 单源', () => {
  const rp = read('views/ReindexPreviewView.vue');

  it('四档换算接线在场（50GB 阈值 / 100KB、10KB 档位 / 1MB 速率）', () => {
    expect(rp).toContain("parseBytes('50gb')");
    expect(rp).toContain("parseBytes('100kb')");
    expect(rp).toContain("parseBytes('10kb')");
    expect(rp).toContain("parseBytes('1mb')");
    expect(rp, 'parseBytes 走 utils/format 单源导入').toContain("import { fmtNum, parseBytes } from '../utils/format'");
  });

  it('手搓 1024 字面零残留', () => {
    expect(rp, '/1024、1024 **、* 1024 均不得再现').not.toMatch(/\/\s*1024|1024\s*\*\*|\* 1024\b/);
  });

  it('展示字节格式化仍走 fmtSize（semFormat bytes 档单源包装）', () => {
    expect(rp).toContain("const fmtSize = (bytes?: number | null): string => semFormat(bytes, 'bytes')");
  });

  it('parseBytes 四档数值与原手搓字面逐一相等（迁移零语义漂移）', () => {
    expect(parseBytes('50gb')).toBe(50 * 1024 ** 3);
    expect(parseBytes('100kb')).toBe(100 * 1024);
    expect(parseBytes('10kb')).toBe(10 * 1024);
    expect(parseBytes('1mb')).toBe(1024 * 1024);
  });
});
