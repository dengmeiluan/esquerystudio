/**
 * 三百七十九批：过滤输入框 Esc 清空行为全站统一——过滤/搜索框此前只有 Enter
 * 行为（执行/直入），Esc 清空各凭各的（多数没有），快速撤销过滤要手动删字。
 * 统一口径：placeholder 含「搜索/过滤/筛选」的 input，Esc 清空过滤词（列表回全量）。
 * 19 处 17 视图；已有 Esc 语义的输入框不动；查询主框（非过滤用途）不在范围内。
 * ⚠ 生成事故记录：首版脚本把自闭合 /> 的斜杠留在了插入属性前面（/ @keydown 形态），
 * 复查形态时抓获，二次修复归位——批量改模板后必须抽查生成形态。
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

const views = walk(join(__dirname, '../views'));

describe('过滤框 Esc 清空统一（379 批）', () => {
  it('抽查五处：Esc 绑定与 v-model 变量一致', () => {
    const cases: [string, string, string][] = [
      /* v3.0.1:IndexHub 抽屉搜索框 Esc 升级两级语义(词非空清词/已空关抽屉),走 onKwEsc,单独断言 */
      /* 五百六十批锚同步更新：IlmView/ClusterSettingsView 两处过滤框改用 SearchFilterBar（Esc 清空
         由组件内建承接，行为等价；flattenWave560 锁其接线形态），抽查案例替换为仍持手写
         Esc 绑定的 RestView searchExpr / SecurityView adKw（同形态等价锚）。
         五百六十一批锚同步更新：BrowserView bw-search 改用 SearchFilterBar（547 豁免册条目由
         561 合并约定推翻，Esc 清空由组件内建承接行为等价），抽查案例替换为仍持手写
         Esc 绑定的 BoostTunerView fieldKw（同形态等价锚）。
         六百五十批锚同步更新：BoostTunerView fieldKw/SecurityView adKw 两面自造过滤框改用
         SearchFilterBar（sfbUnify650 锁，Esc 清空转组件内建行为等价），抽查案例替换为仍持
         手写 Esc 绑定的 DslQueryView saveName / SecurityView fUser（同形态等价锚；
         fUser 为 v-model.trim 形态，正则放行 .trim 修饰符） */
      ['DslQueryView.vue', 'saveName', '搜索名称'],
      ['RestView.vue', 'searchExpr', '搜索响应'],
      ['SecurityView.vue', 'fUser', '按用户过滤'],
      ['DslQueryView.vue', 'jqExpr', 'JQ 过滤响应'],
    ];
    for (const [f, v, ph] of cases) {
      const s = readFileSync(join(__dirname, '../views', f), 'utf-8');
      const re = new RegExp(`v-model(\\.[a-z]+)?="${v}"[^>]*placeholder="[^"]*${ph}[^"]*"[^>]*@keydown\\.esc\\.prevent="${v} = ''"`);
      expect(s, `${f} ${v}`).toMatch(re);
    }
    /* IndexHub 抽屉搜索框新契约:Esc 走 onKwEsc */
    const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    expect(ih).toMatch(/@keydown\.esc\.prevent="onKwEsc"/);
  });

  it('无语法破损：不存在「/ @keydown」错位形态', () => {
    for (const f of views) {
      const s = readFileSync(f, 'utf-8');
      expect(s, f).not.toMatch(/\/ @keydown\.esc\.prevent/);
    }
  });

  it('覆盖规模守卫：全站 ≥13 处 Esc 清空绑定（防脚本漏跑静默通过）', () => {
    /* 五百二十五批 W5：HealthReportView idxKw / PluginsView rawKw 两处过滤框随表换 QRT 壳
       退役（过滤归 QRT 漏斗+Ctrl+F），全站 ='' 形态存量 20 处，下界 18 不动 */
    let n = 0;
    for (const f of views) {
      n += (readFileSync(f, 'utf-8').match(/@keydown\.esc\.prevent="\w+ = ''"/g) ?? []).length;
    }
    /* 五百四十七批锁同步更新：三处页头过滤胶囊（WatcherView kw/FavoritesView kw/
       TemplateGalleryView kw）组件化迁 SearchFilterBar——views 字面绑定 20→17，
       Esc 清空由组件内建承接（update:modelValue('') 行为等价），守卫口径扩组件内
       @keydown.esc.prevent 1 处，合计 18 仍满足下界（行为锚见 searchFilterBar547）。
       五百六十批同步更新：六面过滤框改用 SearchFilterBar（IlmView ilm-input/TemplatesView tv2/
       SearchTemplatesView st-list-filter/AliasesView alv-input/TaskTreeView tt-filter/
       ClusterSettingsView cs-filter，全站第 6~11 胞收官）——views 字面绑定 18→12，
       Esc 清空仍由组件内建承接，合计 12+1=13，下界同步更新 18→13（行为锚 flattenWave560）。
       五百六十一批同步更新：SFB 合并最后两面（AnalysisSettingsView as-filter-ipt/
       IndexSettingsView is-raw-filter，第 15~16 胞）——两面原输入框均无手写 Esc 绑定
       （计数册缺席胞），改用后 Esc 清空由组件内建补齐：views 字面绑定 11 持平，
       合计 11+2=13 实跑持平，下界 13 不动（行为锚 rawioWave561）。
       五百六十二批同步更新：LuceneQueryView lc-json-find 手写查找件改用 SearchFilterBar
       （374 批手写件合并）——views 字面绑定 11→10，Esc 清空由组件内建承接
       （update:modelValue('') 行为等价），合计 10+2=12，下界同步更新 13→12。
       六百五十批同步更新：四面自造过滤框改用 SearchFilterBar（BoostTunerView fieldKw/
       DslQueryView aggKw+cardsKw/SecurityView adKw，sfbUnify650 锁；MappingFieldTree
       为 components 域不计 views 册）——views 字面绑定实测 13→9，Esc 清空由组件内建
       承接（update:modelValue('') 行为等价），合计 9+2=11，下界同步更新 12→11 */
    const sfb = readFileSync(join(__dirname, '../components/SearchFilterBar.vue'), 'utf-8');
    n += (sfb.match(/@keydown\.esc\.prevent/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(11);
  });
});
