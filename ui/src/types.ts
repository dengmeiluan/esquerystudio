/** 全局共享类型 */
export interface IndexCat {
  index: string;
  health: string;
  status: string;
  'docs.count': string;
  'store.size': string;
  pri: string;
  rep: string;
  'creation.date.string'?: string;
  [k: string]: any;
}

export interface SearchHit {
  _id: string;
  _index: string;
  _score: number | null;
  _source: Record<string, any>;
  /** ES highlight 结果（字段→片段数组，片段内含 pre/post_tags 包裹的 <em> 等标签）；
 渲染侧必须净化（只放行 em/mark，其余转义），见 ResultTable.hlSafe */
  highlight?: Record<string, string[]>;
}

export interface SearchResp {
  total: number;
  /** total 是否为下界（track_total_hits 截断，relation=gte）——展示时标「≥」避免误判 */
  totalGte?: boolean;
  hits: SearchHit[];
  aggregations?: Record<string, any>;
  took?: number;
  /** P1-7：分片统计（failed/timed_out>0=部分失败，结果可能不完整，UI 出黄条） */
  shards?: { total?: number; failed?: number; timed_out?: number } | null;
}
