/**
 * 九百三十九批：轨6 走查批 OverviewView 三刀。
 *
 * 刀① 监控历史自动刷新死开关：mh 区 useAutoRefresh 实例返回值被丢弃，setOn 从未接线——
 *   内部 on 恒 false，setInterval 永不创建，勾选「自动」后 60s 轮询零发生，
 *   「上次自动」弱提示（645 收口面）永不出现。修法=DiagView diagRefresher 同型接线
 *   （setOn(true) + watch→restart）+ mhAuto 升 usePref 落盘（铁律 B：重进页面还原，
 *   与 mhRange/diag.autoRefresh 同域归一）。
 * 刀② 「上次自动」提示 v-if 条件出现/消失推挤同行 TSV/MD/刷新 三钮（铁律 B 位置恒定，
 *   936 刀②/938 刀③ 同族）——提示移至卡头行尾，末位增减零推挤；645 字面锚零扰动。
 * 刀③ AlertTriangle 死 import 退役（785 死码族续账：import 行外全文件零消费）。
 *
 * 九六四批随迁：mhAuto 布尔勾选收编 AutoRefreshSelect 档位件（ovAutoTiers964 本锁）——
 *   落盘语义不变（usePref 持久化+setOn 接线+勾选联动），字面随档位键/档位 watch 升格；
 *   「上次自动」占位条前位置锁与死 import 负锁原样守恒。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const OV = codeOf('views/OverviewView.vue');
const RAW = read('views/OverviewView.vue');

describe('九百三十九批：概览监控历史自动刷新接线 + 卡头位置恒定 + 死 import 退役', () => {
  it('刀①：间隔档升 usePref 落盘（重进页面还原；九六四批收编档位件+旧布尔键一次性迁移）', () => {
    expect(OV, '档位走 usePref 新键').toContain("usePref<number>('overview.mhAutoMs', legacyAuto.value ? 60000 : 0);");
    expect(OV, '旧布尔键迁移源在场').toContain("usePref<boolean>('overview.mhAuto', false)");
    expect(OV, '会话态 ref(false) 退役').not.toContain('const mhAuto = ref(false);');
  });

  it('刀①：refresher 捕获 + setOn 接线 + 档位联动（DiagView diagRefresher 同型）', () => {
    expect(OV, 'refresher 实例捕获').toContain('const mhRefresher = useAutoRefresh(');
    expect(OV, 'setOn 接线在场').toContain('mhRefresher.setOn(true);');
    expect(OV, '档位开→即刷+重启定时 / 选关→停表').toContain(
      'watch(mhMs, (v) => { if (v) void loadHistory(); mhRefresher.restart(); });',
    );
  });

  it('刀②：「上次自动」提示位于弹性占位条之前（宽度增减全被占位条吸收，动作组零位移）', () => {
    /* 布局定律（本批真机两折实测）：行中 flex:1 占位条存在时，占位条之后的任何宽度增减
     都会平移其前方的整组控件——行尾放置与恒在场占位两形态均伪绿；唯一稳定槽位=占位条
     之前（副标题之后），提示出现/消失/变宽全部由占位条吸收，右侧动作组钉在右缘。 */
    const subEnd = OV.indexOf('环形保留</span>');
    const spacer = OV.indexOf('style="flex:1"', subEnd);
    expect(subEnd, '副标题字面在场').toBeGreaterThan(-1);
    expect(spacer, '弹性占位条字面在场').toBeGreaterThan(subEnd);
    const hint = OV.indexOf('上次自动');
    expect(hint, '提示在副标题之后').toBeGreaterThan(subEnd);
    expect(hint, '提示在弹性占位条之前').toBeLessThan(spacer);
  });

  it('刀③：AlertTriangle 死 import 退役', () => {
    expect(RAW, '全文件零消费').not.toContain('AlertTriangle');
  });
});
