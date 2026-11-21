/* 命令面板拼音别名表 + 查表。
 *
 * 历史缺陷：导航项 title 是 '前往：'+name（「前往：」是给用户看的外观，区分导航与动作），
 * 而 ALIAS_MAP 的键是裸名；消费点若直接 ALIAS_MAP[title] 查表，导航类全死。
 * 故查表前对导航类（title 以 '前往：' 开头）去前缀，动作类 title 无前缀照旧。
 *
 * ⚠ 前缀里的冒号是全角 '：'(U+FF1A)，startsWith/slice 必须用全角——写成半角 ':' 会静默永不命中
 * （无编译错误，拼音搜索对全部导航项静默失效）。cmdAlias.spec.ts 的全/半角看守盯的就是这一条。
 *
 * 把表与查表从 CmdPalette.vue 抽出来，既是为单测可遍历、可配反向变异（纯函数好做突变证明），
 * 也使查表判据只有一处定义（见 dateRisk 范式：数据 + 纯函数独立成模块）。 */

/* 中文别名表（拼音首字母 + 英文关键词），直接匹配标题关键词，
 * 不引入完整拼音库（体积），只盖高频业务词。
 * 键 = 命令的裸标识：导航类用导航裸名（与 router.ts 的 name 一致），动作类用其 title 字面量。
 * 改键名须保证它恰为某个真实构造出的 title（导航裸名或动作 title），否则精确查表永不命中。 */
export const ALIAS_MAP: Record<string, string> = {
  '查看操作审计': 'sj audit shenji',
  '概览': 'gl overview',
  '查询工作台': 'dsl cx query',
  'Mapping': 'mp mapping ys yingshe',
  '数据浏览器': 'llq browser',
  'REST 直连': 'rest',
  '诊断': 'zd diag',
  '跨集群迁移': 'qy migrate',
  '系统索引': 'xtsy system',
  '任务': 'rw task',
  '分词验证': 'fc analyze',
  '别名管控': 'bmt alias',
  '拓扑': 'tp topology',
  '索引模板': 'mb template',
  '快照': 'kz snapshot',
  '打开搜索沙盒': 'sssh sandbox',
  '热Setting': 'settings hot',
  'ILM': 'ilm',
  '集群设置': 'jqsz cluster-settings',
  '任务树': 'rws tasktree',
  'Reindex预估': 'rp reindex preview',
  '一键集群体检': 'yjjqtj health check',
  '打开 DSL 模板画廊': 'dmb template gallery',
  '索引一键优化向导': 'yjyh optimizer',
  '重看欢迎引导': 'ckyd wizard',
  '立即体检（后台）': 'ljtj health now',
  '刷新索引列表': 'sxsy refresh',
  '主题：深色': 'zt dark',
  '主题：浅色': 'zt light',
  '主题：跟随系统': 'zt auto',
  '刷新索引 (_refresh)': 'sxsy refresh',
  '刷盘索引 (_flush)': 'sp flush',
  '清缓存 (_cache/clear)': 'qhc cache clear',
  '强制合并段 (_forcemerge?max=1)': 'qzhb forcemerge',
  '重试失败分片 (_cluster/reroute?retry_failed)': 'zsslfp retry',
  '复制当前索引名': 'fzsym copy',
  '恢复集群分片分配（persistent）': 'hfjqfpfp reroute',
  '快照当前进度': 'kzjd snapshot progress',
  '新建索引': 'xjsy create index',
  '新建文档（当前索引）': 'xjwd create doc new document',
};

/* 导航类 title 的前缀（全角冒号 U+FF1A）。导出常量，查表与单测共用以保证不漂移。 */
export const NAV_TITLE_PREFIX = '前往：';

/**
 * 按 title 查拼音别名：导航类去 '前往：' 前缀后查表，动作类直接查表。
 * 查不到返回 ''（调用方拼进搜索 haystack 时即等于无别名贡献）。
 */
export function aliasForTitle(title: string): string {
  const key = title.startsWith(NAV_TITLE_PREFIX) ? title.slice(NAV_TITLE_PREFIX.length) : title;
  return ALIAS_MAP[key] || '';
}
