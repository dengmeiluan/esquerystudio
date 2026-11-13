/* 相关性实验室清单单点化——六 lab（评分解释/排名侦探/X 光/命中矩阵/
 Boost 沙盒/火焰图）此前仅在 QueryHubView 本地定义；LabNav 互跳导航与 QueryHub
 popover 共用此单点。icon 为 lucide 组件引用（视图渲染用）。 */
import { SearchCheck, Gauge, ScanSearch, Grid3x3, SlidersHorizontal, Flame } from 'lucide-vue-next';

export const RELEVANCE_LABS: readonly { path: string; name: string; icon: any }[] = [
  { path: '/score-explain', name: '评分解释', icon: SearchCheck },
  { path: '/rank-debug', name: '排名侦探', icon: Gauge },
  { path: '/query-xray', name: '查询 X 光', icon: ScanSearch },
  { path: '/match-matrix', name: '命中矩阵', icon: Grid3x3 },
  { path: '/boost-tuner', name: 'Boost 沙盒', icon: SlidersHorizontal },
  { path: '/profile-flame', name: 'Profile 火焰图', icon: Flame },
];
