/**
 * 监控快照落库批④:多集群监控历史前端契约——
 * ①api.ts 读侧面:MonitorRow 行类型 + monitorHistory 方法指向 /monitor-history;
 * ②OverviewView 监控历史分区:标题/筛选行(集群/状态/时间范围+自动刷新)/QRT 列序/状态色映射,
 *   且带「唯一写入方=服务端定时任务,页面轮询只读不入库」契约注释锚;
 * ③页面契约单源 JSON:overview 页 apiPrefixes 覆盖 /internal/es/index/monitor-history。
 * source-lock 风格(OverviewView 挂载需全页接口桩,面板语义以源码锚+后端 store 测试互补)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const view = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');
const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const pagesJson = readFileSync(
  join(__dirname, '../../../platform/src/main/resources/META-INF/esquerystudio-pages.json'), 'utf-8');

describe('api.ts 监控历史读侧契约面', () => {
  it('MonitorRow 行类型在案(键与后端落档一一对应)', () => {
    expect(apiSrc).toContain('export interface MonitorRow {');
    expect(apiSrc).toContain('timestamp: number; connId?: string; connName?: string; env?: string;');
    expect(apiSrc).toContain('status?: string; latencyMs?: number; esVersion?: string; error?: string;');
  });
  it('monitorHistory 指向 /monitor-history 且 GET 只读(? 分隔符显式——q() 不带前导 ?,缺失曾致 404 monitor-historyfromMs=...)', () => {
    expect(apiSrc).toMatch(/monitorHistory: \(p: \{ connId\?: string; status\?: string; fromMs\?: number; toMs\?: number;/);
    expect(apiSrc).toContain("get<{ records: MonitorRow[] }>(`/monitor-history?${q(p)}`)");
  });
  it('只读契约注释锚:服务端定时任务=唯一写入方,页面轮询永不入库', () => {
    expect(apiSrc).toContain('服务端定时任务=唯一写入方,此处只读');
  });
});

describe('OverviewView 监控历史分区', () => {
  it('分区标题与只读语义注释在案', () => {
    expect(view).toContain('集群监控历史');
    expect(view).toContain('服务端定时任务=唯一写入方');
    expect(view).toContain('页面轮询永不入库');
  });
  it('筛选行:集群/状态/时间范围独立行(ov-mh-filters,标题行不再混排挤压)+自动刷新+刷新在案', () => {
    expect(view).toContain('class="ov-mh-filters"');
    expect(view).toContain('v-model="mhConn"');
    expect(view).toContain('v-model="mhStatus"');
    expect(view).toContain('v-model="mhRange"');
    expect(view).toContain('v-model:ms="mhMs"'); /* 九六四批收编 AutoRefreshSelect，布尔勾选退役 */
    expect(view).toContain('@click="loadHistory"');
  });
  it('QRT 列序:时间/集群/环境/状态/时延/版本/错误', () => {
    expect(view).toContain("const MH_COLS = ['时间', '集群', '环境', '状态', '时延(ms)', '版本', '错误'];");
    expect(view).toContain('storage-key="overview:monitor-history"');
  });
  it('状态色映射 GREEN→g / RED→r / 其余 n', () => {
    expect(view).toContain("function mhTone(s: string): 'g' | 'r' | 'n' { return s === 'GREEN' ? 'g' : s === 'RED' ? 'r' : 'n'; }");
  });
  it('筛选变化即重查+自动刷新档位(useAutoRefresh 统一停续；六百四十五批 G18 tick 记 mhAutoAt；九六四批收编档位件)', () => {
    expect(view).toContain('watch([mhConn, mhStatus, mhRange], () => { void loadHistory(); });');
    expect(view).toContain('useAutoRefresh(() => { mhAutoAt.value = Date.now(); void loadHistory(); }, { ms: () => mhMs.value });');
  });
  it('时间范围偏好落 usePref(跨会话记忆;R20 起与大盘历史趋势共享 live.histRange 键)', () => {
    expect(view).toContain("usePref<string>('live.histRange', '24h')");
  });
});

describe('页面契约单源 JSON:overview 页覆盖监控历史端点', () => {
  it('overview apiPrefixes 含 /internal/es/index/monitor-history', () => {
    expect(pagesJson).toContain('"/internal/es/index/monitor-history"');
  });
  it('端点不在 /clusters/ 下(避开 ADMIN 关键字提档)', () => {
    expect(pagesJson).not.toContain('"/internal/es/index/clusters/monitor');
  });
});
