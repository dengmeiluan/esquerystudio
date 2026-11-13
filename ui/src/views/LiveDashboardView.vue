<template>
  <!-- 全屏聚焦面统一件（headless 档）：自建全屏壳（fixed 铺满）退役，放大/还原钮仍在页头 actions，
 Esc 退出/焦点恢复/焦点管理由 FocusableSurface 统一承担 -->
  <FocusableSurface pane-id="ld.page" title="实时监控大屏" headless v-model:enabled="fullscreen">
    <div class="ld-page" data-flex-fill>
    <PageHeader :icon="MonitorSpeaker" title="实时监控大屏">
<template #subtitle>
        <!-- 795 件4：subtitle 精简一档——采样细节（后台常驻/切页降档）收进 title 悬浮，
 常驻态一句话（轮询档+阈值告警+运行态） -->
        <span :title="`后台常驻采样：切页降为 ${bgMs / 1000}s 不中断；挂墙模式恒定 5s`">{{ intervalMs / 1000 }}s 轮询 · 阈值告警 ·
            <b :class="running ? 'rn' : 'st'">{{ running ? '实时' : '已暂停' }}</b></span>
      </template>
      <template #actions>
<!-- 轮询频率下拉改用 AutoRefreshSelect 统一件（原 .ld-sel 退役；开关由右侧暂停/开始按钮承担，档位不含「关」） -->
        <AutoRefreshSelect v-model:ms="intervalMs" :sizes="[2000, 5000, 10000, 30000, 60000]" :label="fullscreen ? '轮询间隔：挂墙模式恒定 5s' : '轮询间隔'" :disabled="fullscreen" />
        <!-- 趋势窗长（对标阿里云时间控件多档体验）——六卡/对比卡折线展示点数，偏好落盘 -->
        <select v-model="windowPts" class="inp sm" aria-label="趋势窗长" title="趋势窗长：实时折线展示的采样点数">
          <option :value="60">近 60 点</option>
          <option :value="120">近 120 点</option>
          <option :value="240">近 240 点</option>
        </select>
        <button class="btn ghost sm" @click="toggle">
          <Pause v-if="running" :size="12" />
          <Play v-else :size="12" />
          {{ running ? '暂停' : '开始' }}
        </button>
        <button class="btn ghost sm" :aria-label="fullscreen ? '退出全屏' : '进入全屏'" @click="fullscreen = !fullscreen">
          <Maximize2 v-if="!fullscreen" :size="12" />
          <Minimize2 v-else :size="12" />
        </button>
      </template>
</PageHeader>
    </div>

    <!-- 观测中断横幅——拉不到数据时明确告知，而不是静默展示陈旧快照 -->
    <div v-if="obsStale" class="ld-stale">
      <AlertTriangle :size="13" />
      观测中断：已 {{ fmtDur(nowTs - lastOkAt) }} 未获取到新数据（登录态过期或目标集群不可达），下方为最后快照，告警状态已冻结
      <span class="ld-stale-acts">
        <button class="btn ghost sm" @click="auth.logout()">重新登录</button>
        <button class="btn ghost sm" @click="retryObserve">重试</button>
      </span>
    </div>

    <!-- 指标卡墙退役（ih-meta 范式→MetaStrip 统一件）：单条 inline 元信息带；
 各段阈值越限语义由值色（tone）承担，全量文本走段级 :title 兜底 -->
    <MetaStrip class="ld-strip" :items="ldMeta" />

    <div class="ld-charts" data-st="1" :class="{ 'st-in': pageIn }">
      <!-- 标注与曲线分层——当前值放卡片头部，SVG 只画曲线；采样不足给占位不画空轴 -->
      <!-- P1a-2：五张折线卡合并 LiveChartCard 统一件（几何/点位走 sparkChart 单源，
 悬浮命中自持、展开态/遮罩/Esc 由视图承担） -->
      <!-- （622 -D1）：QPS 身份色仲裁改青轴——蓝=CPU 全屏唯一语义（对比卡/历史区
 PALETTE 不受影响，NODE_METRICS 同律）；CPU 卡保持 --dv-blue -->
      <LiveChartCard title="集群 QPS（搜索/秒）" :cur-text="qpsText" :cur-key="qpsText"
        cur-color="var(--dv-cyan)" :window="windowLabel"
        :series="winSlice(qpsSeries)" :ts="winSlice(sampleTs)" mode="abs" color="var(--dv-cyan)" gid="ldg-qps"
        :expanded="expandedCard === 'qps'" :wait-text="waitText"
        @expand="toggleExpand('qps')" />
      <LiveChartCard title="索引写入速率（doc/秒）" :cur-text="idxText" :cur-key="idxText"
        cur-color="var(--ok)" :window="windowLabel"
        :series="winSlice(indexRateSeries)" :ts="winSlice(sampleTs)" mode="abs" color="var(--ok)" gid="ldg-idx"
        :expanded="expandedCard === 'idx'" :wait-text="waitText"
        @expand="toggleExpand('idx')" />
      <LiveChartCard title="Heap 使用趋势" :cur-text="heapText" :cur-key="heapText"
        cur-color="var(--warn)" :cur-title="heapTitle"
        :threshold="METRIC_THRESHOLDS.heap.warn"
        :series="winSlice(heapSeries)" :ts="winSlice(sampleTs)" mode="pct" color="var(--warn)" gid="ldg-heap"
        :expanded="expandedCard === 'heap'" :wait-text="waitText"
        @expand="toggleExpand('heap')" />
      <!-- /：CPU/磁盘均值走势两卡（实报「很多东西没有实时走势图」）——数据节点均值序列
 （store.cpuSeries/diskSeries，切集群随快照隔离），百分比固定 0-100 刻度与阈值线同 Heap 卡 -->
      <LiveChartCard title="CPU 使用趋势" :cur-text="cpuText" :cur-key="cpuText"
        cur-color="var(--dv-blue)" :cur-title="cpuTitle"
        :threshold="METRIC_THRESHOLDS.cpu.warn"
        :series="winSlice(cpuSeries)" :ts="winSlice(sampleTs)" mode="pct" color="var(--dv-blue)" gid="ldg-cpu"
        :expanded="expandedCard === 'cpu'" :wait-text="waitText"
        @expand="toggleExpand('cpu')" />
      <LiveChartCard title="磁盘使用趋势" :cur-text="diskText" :cur-key="diskText"
        cur-color="var(--dv-purple)" :cur-title="diskTitle"
        :threshold="METRIC_THRESHOLDS.disk.warn"
        :series="winSlice(diskSeries)" :ts="winSlice(sampleTs)" mode="pct" color="var(--dv-purple)" gid="ldg-disk"
        :expanded="expandedCard === 'disk'" :wait-text="waitText"
        @expand="toggleExpand('disk')" />
      <!-- 第四卡「运行中任务」——单源读全局 jobTracker（常驻轮询，本页不新拉端点），
 形态对齐既有三卡（.ld-chart 容器 + 头部当前值）；跨页作业进度在大屏可见 -->
      <div class="ld-chart">
        <!-- 799 件1（用户五令+截图实锚 A2：任务卡数字旧形态=六卡排版不统一头名）：任务卡头升
 两行制 KPI 与 LiveChartCard 五卡同构——行① 标题+四类小字+走势 spark；行② 28px 大数。 -->
        <div class="ld-chart-tt">
          <span class="ld-chart-tt-top">运行中任务<em class="ld-chart-th">托管 / 迁移 / Reindex / 快照</em>
            <!-- ②任务卡走势：会话窗任务数 spark（<2 点不画=宁缺毋假；全局口径不随集群切换清位） -->
            <svg v-if="mon.jobCountSeries.length > 1" class="ld-job-spark" :viewBox="'0 0 72 18'" preserveAspectRatio="none" aria-hidden="true" role="img" :title="'本次会话运行任务数走势（最近 ' + mon.jobCountSeries.length + ' 点）'"><polyline :points="sparklinePoints(mon.jobCountSeries, 72, 18)" fill="none" stroke="var(--dv-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <b class="ld-chart-cur" :key="runningJobs.length" style="color:var(--dv-blue)" title="托管重建 / 跨集群迁移 / Reindex 任务 / 快照">{{ runningJobs.length }}</b>
        </div>
        <div v-if="runningJobs.length" class="ld-jobs">
          <div v-for="j in runningJobs.slice(0, 5)" :key="j.id" class="ld-job" :title="j.kindName + '「' + j.label + '」' + (j.pct >= 0 ? ' 进度 ' + j.pct + '%' : '')">
            <!-- 徽标改用 StatusPill（jobTone 本地字典收口 utils/esEnumZh 的 jobKindTone） -->
            <StatusPill :tone="jobKindTone(j.kindName)" :label="j.kindName" />
            <span class="ld-job-lb">{{ j.label }}</span>
            <b v-if="j.pct >= 0" class="ld-job-pct mono">{{ j.pct }}%</b>
          </div>
          <div v-if="runningJobs.length > 5" class="ld-job-more">等 {{ runningJobs.length }} 个运行中…</div>
        </div>
        <!-- 空态占位合并 EmptyState compact 统一件（文案逐字保留， 看守；
 无任务=全清语义，图标选 CheckCircle2） -->
        <EmptyState v-else compact :icon="CheckCircle2" text="暂无运行中任务" class="ld-jobs-empty" />
      </div>
    </div>

    <div class="ld-nodes" data-st="2" :class="{ 'st-in': pageIn }">
      <!-- 件1：对比面改 fixed 浮动面板——件3 令推翻（「节点对比
 怎么回事，怎么单独弹出了一个页面，投机倒把，重新设计跟页面一样的设计语言」）：
 fixed 浮层/拖动把柄/位置落盘/dialog 语义全退役，容器迁入本区页面流内联展开
 （800 监控明细单容器同构语言）；入口钮位置恒定只换开合语义。释放的版面让节点卡
 grid 加宽（minmax 220→240，794 件3）维持。 -->
      <div class="ld-nodes-hd">
        <div class="ld-nodes-tt sec-t">节点实时视图</div>
        <!-- 件1：区块头汇总（节点/master/水位告警一眼读出） -->
        <span class="ld-nodes-sum">{{ nodesSummary }}</span>
        <button ref="cmpEntryRef" type="button" class="ld-ncmp-entry" :aria-expanded="cmpPanelOpen"
          :title="cmpPanelOpen ? '收起节点对比' : '展开节点对比'" @click="toggleCmpPanel">
          <GitCompareArrows :size="12" />节点对比
        </button>
      </div>
      <!-- 件3：对比面内联容器（页面流 .ld-nodes 区内；panel 壳与节点卡/六卡同语言；
 头部行=题+恢复钮+seg 五档+✕；图区内容原样迁移——悬浮读出 mousemove/mouseleave
 保留=十字线语义不丢） -->
      <div v-if="cmpPanelOpen" class="ld-ncmp-panel" :class="{ 'ld-ncmp-full': expandedCard === 'cmp' }" aria-label="节点对比">
        <div class="ld-ncmp-hd">
          <span class="ld-ncmp-tt">节点对比</span>
          <!-- 896 #10 主节点专项视角：仅看 master（role 口径与区块头 nodesSummary 同源） -->
          <label class="ld-ncmp-master" title="只对比 master 角色节点（集群稳定性关键少数）">
            <input type="checkbox" v-model="cmpOnlyMaster" /> 仅 master
          </label>
          <button v-if="hiddenNodes.length" type="button" class="ld-ncmp-restore" title="恢复全部已隐藏节点" @click="hiddenNodes = []">已隐藏 {{ hiddenNodes.length }} ▸ 恢复</button>
          <span class="seg ld-seg" role="group" aria-label="节点对比指标">
            <span class="seg-thumb" :style="segPillStyle(CMP_METRICS.length, cmpMetricIdx)" aria-hidden="true" />
            <button v-for="m in CMP_METRICS" :key="m.k" type="button" :class="{ on: cmpMetric === m.k }"
              :aria-pressed="cmpMetric === m.k" @click="cmpMetric = m.k">{{ m.label }}</button>
          </span>
          <!-- 展开钮（能力与顶部卡/历史卡统一；全屏态面板 fixed 覆盖视口） -->
          <button type="button" class="ld-ncmp-expand" :aria-label="expandedCard === 'cmp' ? '还原' : '展开'" :title="expandedCard === 'cmp' ? '还原' : '展开'"
            @click="toggleExpand('cmp')">
            <Minimize2 v-if="expandedCard === 'cmp'" :size="12" />
            <Maximize2 v-else :size="12" />
          </button>
          <button type="button" class="ld-ncmp-close" aria-label="收起节点对比" title="收起（Esc）" @click="closeCmpPanel">✕</button>
        </div>
        <template v-if="cmpHasData">
          <!-- 悬浮命中域=绘图域本体（877 全量扫描定谳）：监听原挂 .ld-ncmp-panel（含头部行/
 X 轴/图例的整个面板），面板 padding+头部高度计入 y 原点=读出恒坠约 40px，面板全宽计入
 frac 分母=X 向右偏——即实站残差「对比卡 tooltip 垂直 ~50px 偏差」。下沉到 .ld-cmp-plot
 后命中域=量测域(currentTarget)=定位父级三者同体，与 Top 卡 .ld-top-plot 正例同构，
 useHoverEscape 的图区矩形巡检也随之同域 -->
          <div ref="cmpPlotEl" class="ld-cmp-plot" @mousemove="onCmpMove($event)" @mouseleave="onCmpLeave()">
            <!-- 绘图域内壳（896 让位统一）：left 36px 让出 Y 刻度列——svg 与全部 % 定位层
             （悬浮点/十字线/读出/末端点列）同域，曲线不再横穿刻度文字 -->
            <div class="ld-cmp-inner">
            <svg :viewBox="'0 0 720 ' + CMP_H" class="ld-ncmp-svg" preserveAspectRatio="none">
              <defs>
                <!-- 联动面积渐变（hover 节点唯一；stop 色随节点身份色，896 同 HistoryChart 档） -->
                <linearGradient id="cmpAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" :stop-color="cmpArea ? cmpArea.color : 'transparent'" stop-opacity="0.2" />
                  <stop offset="1" :stop-color="cmpArea ? cmpArea.color : 'transparent'" stop-opacity="0" />
                </linearGradient>
              </defs>
              <g v-if="cmpMode === 'pct'" class="ld-glines" aria-hidden="true">
                <line v-for="g in PCT_GRID" :key="'g' + g" x1="0" x2="720" :y1="CMP_H - CMP_H * (g / 100)" :y2="CMP_H - CMP_H * (g / 100)" vector-effect="non-scaling-stroke" />
              </g>
              <!-- 联动面积（hover 节点唯一渐变面积，画在折线之下）；平滑面积 path 与曲线单源贴合（仅热点联动时渲染，不在折线计数场景） -->
              <path v-if="cmpArea" class="ld-ncmp-area" :d="cmpArea.d" fill="url(#cmpAreaGrad)" />
              <!-- 折线平滑统一（Catmull-Rom 单源；pct/abs 档 sparkPts 同源）；
 abs 档传全体可见节点共享 max（cmpScaleMax）——各线横向可比且与 Y 顶刻度同域；
 联动高亮（HistoryChart hc-line 同语言）：图例 chip/读出行 hover→该节点线升亮、其余退灰；
 联动面积同走 catmullRomAreaPath 单源（面积上边缘=同一条平滑曲线，六卡/历史卡面积同语言）；
 对比卡曲线豁免过冲钳位（overshoot=true，896：多序列叠图丝滑优先——陡变段保持全张力
 圆弧不退化成直角；极值语义由图例峰值直读承担） -->
              <path v-for="s in cmpSeries" :key="s.name" :class="cmpHotActive ? (s.name === cmpHot ? 'is-hot' : 'is-dim') : ''" :d="catmullRomPath(sparkPts(s.data, CMP_W, CMP_H, cmpMetric === 'qps' || cmpMetric === 'idx' ? 'abs' : 'pct', cmpScaleMax), CMP_W, CMP_H, { overshoot: true })" fill="none" :stroke="s.color" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
              <line v-if="cmpWarn !== null" x1="0" :y1="CMP_H - CMP_H * (cmpWarn / 100)" x2="720" :y2="CMP_H - CMP_H * (cmpWarn / 100)" stroke="var(--err)" stroke-dasharray="4 2" vector-effect="non-scaling-stroke" />
            </svg>
            <span v-if="cmpWarn !== null" class="ld-thv" :style="{ top: (100 - cmpWarn) + '%' }" aria-hidden="true">{{ cmpWarn }}</span>
            <!-- 末端常驻采样点（每序列一颗 3px 实心点，右缘成列=「看得到点」；hover 节点呼吸点单独叠放） -->
            <span v-for="s in cmpSeries" v-show="s.data.length > 1" :key="'dot' + s.name" class="ld-ncmp-enddot"
              :style="{ top: cmpEndDotOf(s).top, background: s.color }" aria-hidden="true" />
            <!-- 末端呼吸点（联动 hot 节点；HTML 层定位防拉伸变形，历史卡 hc-pulse 同语言） -->
            <span v-if="cmpPulseDot" class="ld-ncmp-pulse" :style="{ left: cmpPulseDot.left, top: cmpPulseDot.top, background: cmpPulseDot.color }" aria-hidden="true" />
                <template v-if="cmpHit">
                  <span class="ld-xline" :style="{ left: cmpLeft(cmpHit.frac) }" aria-hidden="true" />
                  <span class="ld-yline" :style="{ top: (cmpHit.y || 0).toFixed(1) + 'px' }" aria-hidden="true" />
                  <!-- 悬浮贴线圆点（HistoryChart hoverDots 同语言）：每可见序列在十字线 x 处
                   的曲线上各钉一颗色点——滑动时「点在曲线上」可见，不再只有光秃秃的十字线 -->
                  <span v-for="s in cmpSeries" :key="'cd' + s.name" class="ld-ncmp-hoverdot"
                    :style="{ left: cmpLeft(cmpHit.frac), top: cmpDotTop(s), background: s.color }" aria-hidden="true" />
              <div class="ld-hv ld-hv-stack" :style="{ left: cmpLeft(cmpHit.frac), top: (cmpHit.y || 0).toFixed(1) + 'px', transform: cmpShift(cmpHit.frac) + ' translateY(-50%)' }" role="status">
                <span class="ld-hv-t">{{ cmpHit.t ? fmtTime(cmpHit.t) : '' }}</span>
                <span v-for="r in cmpRowsCapped.rows" :key="r.name" class="ld-ncmp-tip-r"
                  @mouseenter="cmpHot = r.name" @mouseleave="cmpHot = null">
                  <i :style="{ background: r.color }" /><b :title="r.name">{{ shortNode(r.name) }}</b><em>{{ r.v }}</em>
                  <button type="button" class="ld-ncmp-hide" :aria-label="'隐藏节点 ' + r.name + ' 的曲线'" title="隐藏该节点曲线（头部可一键恢复）" @click.stop="toggleNode(r.name)">×</button>
                </span>
                <span v-if="cmpRowsCapped.hidden" class="ld-ncmp-tip-r ld-ncmp-tip-more"
                  :title="'其余 ' + cmpRowsCapped.hidden + ' 节点：' + cmpRows.slice(CMP_TIP_CAP).map(r => r.name).join('、') + '（行尾 × 可隐藏节点减行）'">+{{ cmpRowsCapped.hidden }} 节点…</span>
              </div>
            </template>
            </div>
            <span class="ld-yt ld-yt-top" aria-hidden="true">{{ cmpYTop }}</span>
            <span v-for="g in (cmpMode === 'pct' ? PCT_GRID : [])" :key="'cyt' + g" class="ld-yt ld-yt-mid" :style="{ top: (100 - g) + '%' }" aria-hidden="true">{{ g }}</span>
            <span class="ld-yt ld-yt-bot" aria-hidden="true">0</span>
          </div>
          <div class="ld-xaxis" aria-hidden="true">
            <span class="ld-ta">{{ fmtTime(cmpTs[0]) }}</span>
            <span class="ld-ta">{{ fmtTime(cmpTs[Math.floor((cmpTs.length - 1) / 2)]) }}</span>
            <span class="ld-ta">{{ fmtTime(cmpTs[cmpTs.length - 1]) }}</span>
          </div>
        </template>
        <!-- 件1：图例 chips 行（hc-legend 同语言；点击显隐=off 划线，色号锚定不换色；
 常驻=有节点即显示，不随 cmpHasData 条件块） -->
        <div class="ld-cmp-legend">
          <button v-for="c in cmpChips" :key="c.name" type="button" class="ld-cmp-lg" :class="{ off: c.off }"
            :aria-pressed="!c.off" :title="(c.off ? '点击显示 ' : '点击隐藏 ') + c.name + ' 的曲线'" @click="toggleNode(c.name)"
            @mouseenter="cmpHot = c.name" @mouseleave="cmpHot = null"
            @focus="cmpHot = c.name" @blur="cmpHot = null">
            <i :style="{ background: c.color }" aria-hidden="true" />{{ shortNode(c.name) }}<em class="mono">{{ c.cur }}</em>
          </button>
        </div>
        <!-- 件1：svg-wait 因 chips 常驻隔断 v-else 链改显式 v-if -->
        <div v-if="!cmpHasData" class="ld-svg-wait">{{ waitText }}</div>
      </div>
      <!-- 件1：对比区块整迁出页面流（悬浮面板版在 ld-page 尾部 fixed 渲染） -->
      <div class="ld-nodes-grid">
        <!-- 裸 div 空态合并 EmptyState compact 统一件（grid 跨列落位由 .ld-nodes-empty 承担） -->
        <EmptyState v-if="!sortedNodes.length" class="ld-nodes-empty" compact :icon="MonitorSpeaker" text="暂无节点数据" />
        <!-- 节点卡可点下钻 /diag?node={name}（告警条 alertRoute 同语汇；role/tabindex/Enter=铁律 B 键盘可达） -->
        <div v-for="n in sortedNodes" :key="n.nodeId" class="ld-node" :class="nodeTone(n)" role="button" tabindex="0"
          :aria-label="`节点 ${n.name}，点击进入诊断`" title="点击进入诊断"
          @click="router.push({ path: '/diag', query: { node: n.name } })"
          @contextmenu.prevent="openLdRowMenu($event, 'node-card', n)"
          @keydown="onLdCardKey($event, 'node-card', n)" data-row-nav @keydown.self="rowArrowNav">
          <div class="ld-node-hd">
            <span class="ld-node-name">
              <!-- 节点健康色点改用 MetaStrip dot 形态单源（DiagView dgMeta 先例）——
 .ld-node-tone 私造圆点四档退役，色值经 nodeToneDot 直传组件 dot 位（8px 归 .ms-dot） -->
              <MetaStrip :items="[{ dot: nodeToneDot(n) }]" />
              <b>{{ n.name }}</b>
            </span>
            <span class="ld-node-role" :class="roleClass(n)">{{ roleLabel(n) }}</span>
          </div>
          <!-- 水位条 width 过渡改 transform: scaleX（合成层动画不走 layout；绑定值=百分比/100，origin left） -->
          <!-- 数值侧接 tone 分档（metricToneCls 走 METRIC_THRESHOLDS 单源，
 与 MetaStrip 均值/卡边框同值同色；条形保留指标身份色不冲突，ok 档不着色） -->
          <!-- 件1：条升主视觉 12px+85/90 阈值刻度双标+超档条色切 tone（ok=身份色
 走 --mc 变量；「离危险多远」一眼可读=对齐 802 底座语言） -->
          <div class="ld-node-row">
            <span>heap</span>
            <div class="ld-bar"><div class="ld-fill" :class="metricToneCls('heap', n.heapPct)" :style="{ transform: 'scaleX(' + n.heapPct / 100 + ')', '--mc': METRIC_COLOR.heap }"></div><i class="ld-bar-tick" aria-hidden="true"></i><i class="ld-bar-tick t90" aria-hidden="true"></i></div>
            <b :class="metricToneCls('heap', n.heapPct)">{{ n.heapPct }}%</b>
          </div>
          <div class="ld-node-row">
            <span>cpu</span>
            <div class="ld-bar"><div class="ld-fill" :class="metricToneCls('cpu', n.cpuPct)" :style="{ transform: 'scaleX(' + n.cpuPct / 100 + ')', '--mc': METRIC_COLOR.cpu }"></div><i class="ld-bar-tick" aria-hidden="true"></i><i class="ld-bar-tick t90" aria-hidden="true"></i></div>
            <b :class="metricToneCls('cpu', n.cpuPct)">{{ n.cpuPct }}%</b>
          </div>
          <div class="ld-node-row">
            <span>disk</span>
            <div class="ld-bar"><div class="ld-fill" :class="metricToneCls('disk', diskUsedPct(n))" :style="{ transform: 'scaleX(' + diskUsedPct(n) / 100 + ')', '--mc': METRIC_COLOR.disk }"></div><i class="ld-bar-tick" aria-hidden="true"></i><i class="ld-bar-tick t90" aria-hidden="true"></i></div>
            <b :class="metricToneCls('disk', diskUsedPct(n))">{{ diskUsedPct(n).toFixed(0) }}%</b>
          </div>
          <!-- 件1：tp（ 对标 Thread_pool Rows 即时值）+load（ load_average.1m）
 两行纯文字合一行 mono 收尾（上缘收尾分隔线=「有收尾」；缺省段诚实不渲染契约维持
 ——liveKpi596/liveLoad595 消费面文案 'tp'/'load'/'N/M'/'N.NN' 逐字保留） -->
          <div v-if="tpOf(n) || load1mOf(n)" class="ld-node-row ld-node-foot">
            <span v-if="tpOf(n)">tp <b>{{ tpOf(n) }}</b></span>
            <span v-if="tpOf(n) && load1mOf(n)" class="ld-node-foot-sep" aria-hidden="true">·</span>
            <span v-if="load1mOf(n)">load <b>{{ load1mOf(n) }}</b></span>
          </div>
          <!-- K3：卡内三行迷你 spark 退役（实报「节点卡信息过密」）——与上方
 节点对比图同数据（seg 可切 heap/cpu/disk/qps/idx 五档）+历史趋势「按节点查看」
 下钻重复，属页面元素零重复面；节点卡收为「名+角色+三水位+tp/load」六行档 -->
        </div>
      </div>
    </div>

    <!-- 告警状态机——一条状况一个条目，实时更新当前值/峰值/持续时长；恢复灰化留痕；禁止日志刷屏 -->
    <div v-if="activeAlerts.length || resolvedAlerts.length" class="ld-alerts" data-st="3" :class="{ 'st-in': pageIn }">
      <div class="ld-alerts-tt">
        <AlertTriangle :size="12" /> 实时告警
        <!-- 计数徽标改用 StatusPill（ld-al-badge 锚类保留在外层，pillSingleTrack 看守；
 原手写 .bd/.wn 文字色档随改用退役——色归 tone 单源） -->
        <StatusPill v-if="badCount" tone="r" class="ld-al-badge" :label="badCount + ' 严重'" />
        <StatusPill v-if="warnCount" tone="y" class="ld-al-badge" :label="warnCount + ' 警告'" />
        <!-- B3：空态灰字/胶囊随整行 v-if 退役（搁浅分隔条+死代码清除） -->
        <span class="ld-al-sp"></span>
        <button v-if="resolvedAlerts.length" class="ld-al-clear" @click="clearResolved">清除已恢复（{{ resolvedAlerts.length }}）</button>
      </div>
      <!-- 告警横条键盘可达（role/tabindex/Enter 触发——纯 click 绑定对键盘用户不可达） -->
      <div v-for="a in activeAlerts" :key="a.key" class="ld-alert" :class="a.severity" role="button" tabindex="0"
        :aria-label="`告警：${a.title}，点击定位到对应处置`" title="点击定位到对应处置"
        @click="alertRoute(a)" @contextmenu.prevent="openLdRowMenu($event, 'active-alert', a)"
        @keydown="onLdCardKey($event, 'active-alert', a)" data-row-nav @keydown.self="rowArrowNav">
        <span class="ld-alert-m">
          <b>{{ a.title }}</b>
          <span class="ld-alert-v">{{ fmtNum(a.num) }}{{ a.unit }}</span>
          <span v-if="a.peak > a.num" class="ld-alert-pk">峰值 {{ fmtNum(a.peak) }}{{ a.unit }}</span>
        </span>
        <span class="ld-alert-th">阈值 {{ a.threshold }}</span>
        <span class="ld-alert-t">持续 {{ fmtDur(nowTs - a.firstAt) }} · {{ fmtTime(a.firstAt) }} 起</span>
      </div>
      <div v-for="a in resolvedAlerts" :key="'r' + a.key" class="ld-alert resolved">
        <span class="ld-alert-m">
          {{ a.title }}
          <span class="ld-alert-pk">峰值 {{ fmtNum(a.peak) }}{{ a.unit }}</span>
        </span>
        <span class="ld-alert-t">持续 {{ fmtDur((a.resolvedAt || 0) - a.firstAt) }} · {{ fmtTime(a.resolvedAt || 0) }} 已恢复</span>
      </div>
    </div>
    <!-- B3：空态=轻量绿胶囊行（无 warn 头行无 border-bottom——搁浅分隔条退役；健康态语义保留=808 A2 锚） -->
    <div v-else class="ld-alerts ld-alerts-empty" data-st="3" :class="{ 'st-in': pageIn }"><span class="ld-ok-chip"><i aria-hidden="true" />无活动告警</span></div>

    <!-- 集群监控历史趋势：服务端每分钟采样（GET /monitor-metrics，只读——服务端定时任务=唯一写入方，
 环形保留）。范围/集群筛选全量下推；时间范围偏好落 usePref 跨会话记忆（mh2Range，与
 overview 页 monitor.range 各存各的现场）。五张图卡换 HistoryChart 统一件（渐变面积+折线+
 十字线 tooltip+图例 chips 切换+统计条全部内化）；「按节点查看」下钻：选定具体集群后可切
 scope=node，五张图变该集群内各节点序列叠加（records 的 connName 映射 nodeName 后复用
 buildSeries 单源，色板锚定节点排序位）。 -->
    <div class="ld-hist" data-st="4" :class="{ 'st-in': pageIn }">
      <div class="ld-hist-head">
        <!-- Z4（实报「协调性」）：两行分层——行①轻信息（标题/副题/环形用量条）
 +行②控件（分组/时间/集群/刷新/⋯）。原单行 flex-wrap 塞 11 子项，wrap 断点随内容
 漂移=「头部拥挤」实报根源；控件行恒 5+⋯ 与页头 actions 同语言（铁律 C 不变量）。 -->
        <div class="ld-hist-head-top">
          <span class="sec-t">历史趋势</span>
          <span class="ld-hist-sub">服务端每分钟采样 · {{ nodeMode ? '节点叠加' : (clusterFilter || '多集群叠加') }} · 环形保留</span>
          <span class="ld-hist-sp"></span>
          <!-- R6 环形治理用量条：审计+监控合计/30GB 上限，治理口径透明化（拉取失败静默隐藏） -->
          <span v-if="ring" class="ld-hist-ring" :title="'审计 ' + fmtGB(ring.auditBytes) + ' + 监控 ' + fmtGB(ring.monitorBytes) + ' / 上限 ' + fmtGB(ring.capBytes)">
            <span class="ld-hist-ring-bar"><i :style="{ width: ringPct + '%' }" /></span>
            <span class="mono">{{ fmtGB(ring.totalBytes) }} / {{ fmtGB(ring.capBytes) }}</span>
          </span>
        </div>
        <div class="ld-hist-head-ctl">
        <!-- 分组导航 seg（对标阿里云「分组: 概览 ▾」实测 9 项；我方收敛 8 组——
 不照搬「主节点指标」：节点下钻已含主节点，独立成组增量≈0）。
 短标签 + title 全称（900 窄档单行不折行的关键）；overview=pass-through。
 分组=用户导航过滤，与 onlyNodeMode/onlyClusterMode 的自动二态隐藏正交（626 辨析）。 -->
        <span class="seg ld-seg ld-hist-group" role="group" aria-label="指标分组">
          <span class="seg-thumb" :style="segPillStyle(HIST_GROUPS.length, histGroupIdx)" aria-hidden="true" />
          <button v-for="g in HIST_GROUPS" :key="g.key" type="button"
            :class="{ on: histGroup === g.key }" :aria-pressed="histGroup === g.key"
            :title="'分组：' + g.label" @click="histGroup = g.key">{{ g.short }}</button>
        </span>
        <span class="ld-hist-sp"></span>
        <select v-model="mh2Range" class="inp sm" aria-label="时间范围" title="时间范围">
          <option value="1h">最近 1 小时</option>
          <option value="6h">最近 6 小时</option>
          <option value="24h">最近 24 小时</option>
          <option value="3d">最近 3 天</option>
          <option value="7d">最近 7 天</option>
          <option value="14d">最近 14 天</option>
          <option value="custom">自定义</option>
        </select>
        <!-- 自定义时间档收官：起止 datetime-local（原生控件=键盘可达），rangeMs 单源解析 -->
        <template v-if="mh2Range === 'custom'">
          <input v-model="customFrom" type="datetime-local" class="inp sm" aria-label="自定义开始时间" title="自定义开始时间" />
          <input v-model="customTo" type="datetime-local" class="inp sm" aria-label="自定义结束时间" title="自定义结束时间" />
        </template>
        <select v-model="clusterFilter" class="inp sm" aria-label="筛选集群" title="筛选集群">
          <option value="">全部集群</option>
          <option v-for="c in histClusters" :key="c" :value="c">{{ c }}</option>
        </select>
        <button class="btn ghost sm" :disabled="histLoading" @click="loadHist"><RotateCw :size="12" /> 刷新</button>
        <!-- 低频控件收进 ⋯（铁律 C「工具行默认可见按钮 ≤5，其余收进 ⋯」）。
 明面＝分组 seg / 时间范围 / 筛选集群 / 刷新 / ⋯ ＝ 5。
 用原生 details：键盘可达（Enter/Space 开合）；面板四要素（bg1 底 + border +
 shadow + r-m）见样式段。⚠665 勘误：原文「无需 document 捕获级 Esc 接线（不入
 568/569 Esc 台账）」已证伪（664 复检 G'5）——details 原生语义无 Esc 关层，
 范式补收口见 onHistMoreEsc（Esc 台账 A 档同形态，状态档案随批勘误）。 -->
        <details ref="histMoreEl" class="ld-hist-more" @toggle="onHistMoreToggle">
          <summary ref="histMoreSumEl" class="ld-hist-more-sum" aria-label="更多选项"
            title="更多选项：聚合方式 / 自动刷新 / 按节点查看">⋯</summary>
          <div class="ld-hist-more-pop">
            <!-- 聚合方式：avg=桶均值（趋势口径）| max=桶内峰值（瞬时尖峰），随取数下推服务端 -->
            <div class="ld-hist-more-row">
              <span class="ld-hist-more-lb">聚合方式</span>
              <select v-model="mhAgg" class="inp sm" aria-label="聚合方式" title="聚合方式：均值看趋势，峰值看突刺">
                <option value="avg">均值</option>
                <option value="max">峰值</option>
              </select>
            </div>
            <!-- 聚合粒度（周期）档（对标阿里云每卡头「(周期:1分钟)」；626 裁决 D8
 周期半边，零 Java 改动）。落点在 ⋯ 浮层内——明面已用满 5 控件（铁律 C）。
 原始逐点受 50 小时安全窗约束：超限时 option 禁用 + title 说明并自动回落「自动」
 （原始查询 size 钳 3000 + asc，长窗会丢最新点）。 -->
            <div class="ld-hist-more-row">
              <span class="ld-hist-more-lb">聚合粒度</span>
              <select v-model="histPeriod" class="inp sm" aria-label="聚合粒度" :title="histPeriodTitle">
                <option value="auto">自动（按范围）</option>
                <option value="raw" :disabled="!histRawSafe" :title="histRawTitle">原始逐点</option>
                <option value="1m">1 分钟</option>
                <option value="5m">5 分钟</option>
                <option value="15m">15 分钟</option>
                <option value="30m">30 分钟</option>
                <option value="1h">1 小时</option>
              </select>
            </div>
            <!-- 自动刷新（对标阿里云基础监控自动刷新开关）：挂墙大屏历史自动推进，
 档位关/30s/1m/5m 偏好记忆 live.histAuto 默认关；页面隐藏/KeepAlive 失活自动停 -->
            <div class="ld-hist-more-row">
              <span class="ld-hist-more-lb">自动刷新</span>
              <select v-model="histAutoMs" class="inp sm" aria-label="自动刷新" title="自动刷新：关闭或按档位自动推进历史" @change="onHistAutoChange">
                <option :value="0">关闭</option>
                <option :value="30000">30 秒</option>
                <option :value="60000">1 分钟</option>
                <option :value="300000">5 分钟</option>
              </select>
            </div>
            <label class="ld-hist-node" :title="clusterFilter ? '叠加展示该集群内各节点的序列' : '需先选定具体集群才有节点序列'">
              <input type="checkbox" v-model="byNode" :disabled="!clusterFilter" /> 按节点查看
            </label>
          </div>
        </details>
        </div>
      </div>
      <!-- R7 服务端告警条：/monitor-alerts 活跃告警 chips（CRIT 红/WARN 黄/INFO 中性，title 带时间+阈值；
 头部同排已拥挤（治理条+双筛选+下钻+刷新），独立成行——chips 多条时随 flex-wrap 自然换行）。
 拉取失败静默缺席，不打扰图表 -->
      <!-- 件6：空告警整行不渲染（与实时告警区「无活动告警」胶囊重复=页面元素零重复；
 有 CRIT/WARN chips 时保留行） -->
      <div v-if="srvActive.length" class="ld-hist-alerts" role="status" aria-label="服务端告警">
        <span v-for="a in srvActive" :key="(a.connId || '') + '|' + a.metric" class="ld-hist-al"
          :class="a.level === 'CRIT' ? 'crit' : a.level === 'WARN' ? 'warn' : 'info'" :title="srvAlertTitle(a)">
          <b>{{ a.connName || a.connId || '未知集群' }}</b>
          <span class="mono">{{ a.metric }}={{ srvAlertVal(a.value) }}</span>
          <span v-if="a.message" class="ld-hist-al-msg">{{ a.message }}</span>
        </span>
      </div>
      <!-- ══ 版面动线（20261014：「筛选按钮距离监控图非常遥远」根治）：历史趋势图卡网格上移——
 筛选头/告警条之后紧接图卡（操作动线=选范围→看曲线零滚动），监控明细/节点最新水位
 下沉为次级区块（明细=收起态诊断工具，水位表=即时值快照，均非趋势主视图）。══ -->
      <div v-if="histErr" role="alert" class="err-bar">
        历史趋势加载失败：{{ histErr }}
        <button class="btn xs" @click="loadHist">重试</button>
      </div>
      <!-- 分组空态——「组 × 观察口径」交集为空时（如集群模式选「节点磁盘指标」，
 或节点下钻选「集群指标」）不渲染空白栅格，给出可行动说明。独立类名不与图卡级空态
 （ld-hist-clean / HistoryChart 内「暂无采样」）混淆。 -->
      <EmptyState v-if="!histCharts.length" class="ld-hist-empty" compact
        :icon="MonitorSpeaker" :text="histGroupEmpty" />
      <div class="ld-hist-grid">
        <div v-for="c in histCharts" :key="c.field" class="ld-hist-cell">
          <!-- 断档行为验证点：相邻桶 Δt 恒=桶距（intervalMsFor(mh2Range)），≤3×桶距恒连线；
 集群失联未采的时段桶为空值字段（buildSeries 已剔点），相邻留存点 Δt 超过
 3×桶距即断线——不画跨断档假线（gapMs 缺省=永不断，本区恒传）。
 拒绝图健康态一句话代替恒零空卡（出现非零自动浮出图卡） -->
          <template v-if="!(allClean && (c.field === 'writeRejected' || c.field === 'searchRejected'))">
            <HistoryChart :title="c.label" :unit="c.unit" :series="c.series" :forecast="c.forecast" :note="c.note" :threshold="c.threshold"
              :palette="HIST_COLORS" :gap-ms="mh2GapMs" :status-bands="statusBands"
              :events="chartEvents"
              :expanded="expandedCard === 'hist:' + c.field" @expand="toggleExpand('hist:' + c.field)" />
          </template>
          <div v-else class="ld-hist-clean">采样时段内无拒绝</div>
          <!-- 加载态：骨架蒙层盖图区（保留上轮数据防闪烁），沿用 SkeletonBox 统一件 -->
          <div v-if="histLoading" class="ld-hist-load" aria-hidden="true">
            <SkeletonBox height="150px" width="72%" round />
          </div>
        </div>
      </div>
      <!-- ══ ：监控明细单容器（用户六令实报 20261008 13:18「top写入索引为什么不跟下面的
 监控在一块，这严重违反了我想要的设计」）——根因=Top 索引/慢请求/告警历史三条独立
 CollapsePanel 收起条视觉分离；改法=三面板整合为一个壳（.ld-detail）+seg 三视图切换
 （铁律 C 形态枚举）；三旧 open 状态合一（detailOpen+detailTab）；视图内容原样迁入
 （Top 曲线双视图=794 件2/慢请求阈值行=634 权限语义/告警筛选导出=）；懒加载保持
 （开容器且切到该视图才拉取）；三表 .tbl zebra 改用形态（784）与计数源（782 治漂移）
 全保留。══ -->
      <div class="ld-detail">
        <div class="ld-detail-hd">
          <button type="button" class="ld-detail-toggle" :aria-expanded="detailOpen"
            :title="detailOpen ? '收起监控明细' : '展开监控明细'" @click="toggleDetail">
            <ChevronDown :size="12" class="ld-detail-chev" :class="{ open: detailOpen }" />监控明细
          </button>
          <!-- 件3：seg 收起态隐藏（「该 UI 样式非常丑陋」=收起条 seg 挤左侧两行；
 展开态才见三视图切换=收起条单行三件〔toggle/meta/⋯〕对称）。
 〔内勘正：按钮 v-if="!nodeMode" 误罩 v-for（Vue3 同元素 v-if 先于 v-for）——
 detailTabs computed 本就按 nodeMode 摘 Top，这层 v-if 只会把 nodeMode 用户打成
 空壳 seg（byNode 默认开后=默认可见；真机 probe S3 按钮=0 铁证）→删〕 -->
          <span v-if="detailOpen" class="seg ld-seg ld-detail-seg" role="group" aria-label="监控明细视图"> <!-- A1：补 ld-seg 作用域=等宽钮+居中+真滑块 -->
            <span class="seg-thumb" :style="segPillStyle(detailSegN, detailTabIdx)" aria-hidden="true" />
            <button v-for="t in detailTabs" :key="t.k" type="button" :class="{ on: detailTab === t.k }"
              :aria-pressed="detailTab === t.k" @click="switchDetail(t.k as any)">{{ t.label }}</button>
          </span>
          <span class="ld-detail-meta">
            <template v-if="detailTab === 'top' && !nodeMode">写入/查询 · {{ topRows.length }} 索引</template>
            <template v-else-if="detailTab === 'slow'">≥{{ slowThresholdMs }}ms · {{ slowRows.length }} 条</template>
            <template v-else-if="detailTab === 'alert'">
              <b class="crit">{{ alertCounts.crit }}</b> 严重 · <b class="warn">{{ alertCounts.warn }}</b> 警告 · <b>{{ alertCounts.info }}</b> 提示 · <b class="ok">{{ alertCounts.recovered }}</b> 恢复
            </template>
          </span>
          <!-- 件2：导出 ⋯ 收纳（三视图共用+按 detailTab 分发；Esc=window 捕获级 665 范式） -->
          <details ref="detailMoreEl" class="ld-detail-more" @toggle="onDetailMoreToggle">
            <summary ref="detailMoreSumEl" aria-label="更多操作" title="导出当前视图">⋯</summary>
            <div class="ld-detail-more-menu" role="menu">
              <button type="button" role="menuitem" :disabled="!detailCanExport" @click="copyDetail('tsv')">复制 TSV</button>
              <button type="button" role="menuitem" :disabled="!detailCanExport" @click="copyDetail('md')">复制 MD</button>
            </div>
          </details>
        </div>
        <div v-if="detailOpen" class="ld-detail-body">
          <!-- Top 索引视图（ 对标 Grafana Index 索引行；内容自 794 件2 原样迁入） -->
          <template v-if="detailTab === 'top' && !nodeMode">
            <div class="ld-detail-tools">
              <span class="seg ld-top-viewseg" role="group" aria-label="Top 索引视图">
                <button type="button" :class="{ on: topView === 'curve' }" :aria-pressed="topView === 'curve'" @click="topView = 'curve'">曲线</button>
                <button type="button" :class="{ on: topView === 'table' }" :aria-pressed="topView === 'table'" @click="topView = 'table'">表格</button>
              </span>
              <span class="ld-top-metric-sp"></span>
              <!-- 展开钮（能力与顶部卡/历史卡统一；曲线区包层 fixed 全屏） -->
              <button v-if="topView === 'curve'" type="button" class="ld-ncmp-expand" :aria-label="expandedCard === 'top' ? '还原' : '展开'" :title="expandedCard === 'top' ? '还原' : '展开'"
                @click="toggleExpand('top')">
                <Minimize2 v-if="expandedCard === 'top'" :size="12" />
                <Maximize2 v-else :size="12" />
              </button>
            </div>
            <!-- 指标切换 seg（写入/查询/延迟三支同源会话序列，895 对标阿里云 index bulk 写入 tps/index 查询 qps/索引端到端查询延迟三卡）+ Top N 宽度选择 -->
            <div v-if="topView === 'curve'" class="ld-top-wrap" :class="{ 'ld-top-full': expandedCard === 'top' }">
            <div class="ld-top-metric">
              <span class="seg ld-seg" role="group" aria-label="Top 曲线指标">
                <span class="seg-thumb" :style="segPillStyle(3, ['idx', 'qps', 'lat'].indexOf(topMetric))" aria-hidden="true" />
                <button type="button" :class="{ on: topMetric === 'idx' }" :aria-pressed="topMetric === 'idx'" @click="topMetric = 'idx'">写入速率</button>
                <button type="button" :class="{ on: topMetric === 'qps' }" :aria-pressed="topMetric === 'qps'" @click="topMetric = 'qps'">查询 QPS</button>
                <button type="button" :class="{ on: topMetric === 'lat' }" :aria-pressed="topMetric === 'lat'" @click="topMetric = 'lat'">查询延迟</button>
              </span>
              <span class="ld-top-metric-unit mono">{{ topMetric === 'idx' ? 'doc/秒' : topMetric === 'qps' ? '次/秒' : 'ms/次' }}</span>
              <span class="ld-top-metric-sp"></span>
              <label class="ld-top-limit" title="快照拉取宽度（服务端 limit 参数，上限 20）">
                Top <select v-model.number="topLimit" class="inp sm" aria-label="Top 索引数量">
                  <option :value="8">8</option>
                  <option :value="12">12</option>
                  <option :value="16">16</option>
                  <option :value="20">20</option>
                </select>
              </label>
            </div>
            <div v-if="topView === 'curve'" ref="topPlotEl" class="ld-cmp-plot ld-top-plot" @mousemove="onTopMove($event)" @mouseleave="onTopLeave()">
              <!-- 绘图域内壳（896 让位统一）：left 36px 让出 Y 刻度列 -->
              <div class="ld-cmp-inner">
              <template v-if="topHasData">
                <svg :viewBox="'0 0 720 ' + CMP_H" class="ld-ncmp-svg" preserveAspectRatio="none" aria-hidden="true">
                  <!-- 件1：横向网格线四档（全局 max 同坐标系底座） -->
                  <line v-for="gy in GRID_YS" :key="'grid' + gy" class="ld-grid" x1="0" :x2="720" :y1="(CMP_H * (1 - gy)).toFixed(1)" :y2="(CMP_H * (1 - gy)).toFixed(1)" />
                  <!-- 折线平滑统一（Catmull-Rom 单源） -->
                  <path v-for="s in topCurves" :key="s.key" :d="catmullRomPath(topPlotPts(s.data), CMP_W, CMP_H)" fill="none" :stroke="s.color" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
                </svg>
                <span v-for="(tv, i) in topYTicks" :key="'yt' + i" class="ld-yt" :style="{ top: ['2%', '25.5%', '50.5%', '75.5%'][i] }" aria-hidden="true">{{ tv }}</span>
                <span class="ld-yt ld-yt-bot" aria-hidden="true">0</span>
                <span v-for="(xt, i) in topXTs" :key="'xt' + i" class="ld-xt" :style="{ left: TOP_XT_POS[i] }" aria-hidden="true">{{ xt }}</span>
                <template v-if="topHit">
                  <span class="ld-xline" :style="{ left: topLeft(topHit.frac) }" aria-hidden="true" />
                  <span class="ld-yline" :style="{ top: (topHit.y || 0).toFixed(1) + 'px' }" aria-hidden="true" />
                  <div class="ld-hv ld-hv-stack ld-top-hv" :style="{ left: topLeft(topHit.frac), top: (topHit.y || 0).toFixed(1) + 'px', transform: topShift(topHit.frac) + ' translateY(-50%)' }" role="status">
                    <span class="ld-hv-t">{{ topHit.t ? fmtTime(topHit.t) : '' }}</span>
                    <span v-for="r in topReadRows" :key="r.key" class="ld-ncmp-tip-r">
                      <i :style="{ background: r.color }" /><b>{{ r.name }}</b><em>{{ r.v }}</em>
                    </span>
                  </div>
                </template>
                </template>
                <div v-else class="ld-svg-wait">采样中，打开面板起逐拍累积（实时曲线不回溯历史）…</div>
              </div>
            </div>
            <!-- 件1：常显图例（色点+索引名+当前值；曲线颜色↔索引映射不再仅 hover 可见） -->
            <div v-if="topView === 'curve' && topHasData" class="ld-top-legend" aria-label="Top 索引曲线图例">
              <span v-for="s in topCurves" :key="'lg' + s.key" class="ld-top-lg" :title="s.name + '（' + s.cluster + '）当前' + (topMetric === 'idx' ? '写入速率' : '查询 QPS')">
                <i :style="{ background: s.color }" /><b>{{ s.name }}</b><em>{{ fmtNum(s.cur) }}</em>
              </span>
            </div>
            <!-- 逐序列窗内统计表（阿里云 min/max/avg/current 同形态）：按当前指标当前值降序 -->
            <!-- 1194：行右键——这张表此前是屏上唯一没有右键的表（Top 表/慢请求/告警三张都有），
                 统计行看的是同一个索引，右键动作也应同一套（打开浏览器/去索引工作区/复制名）。 -->
            <table v-if="topView === 'curve' && topStatRows.length" class="tbl zebra ld-top-stats">
              <thead>
                <tr><th>索引</th><th>集群</th><th>最小</th><th>最大</th><th>均值</th><th>当前</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in topStatRows" :key="'st' + r.key" @contextmenu.prevent="openLdRowMenu($event, 'top', r)">
                  <td class="mono" :title="r.name">{{ r.name }}</td>
                  <td>{{ r.cluster }}</td>
                  <td class="mono num">{{ fmtNum(r.min) }}</td>
                  <td class="mono num">{{ fmtNum(r.max) }}</td>
                  <td class="mono num">{{ fmtNum(r.avg) }}</td>
                  <td class="mono num"><b>{{ fmtNum(r.cur) }}</b></td>
                </tr>
              </tbody>
            </table>
            </div>
            <table v-if="topView === 'table'" class="tbl zebra ld-hist-hist-t">
              <thead>
                <tr><th>集群</th><th>索引</th><th>查询 QPS</th><th>写入速率(doc/秒)</th><th>存储(MB)</th></tr>
              </thead>
              <tbody>
                <tr v-for="t in topRows" :key="t.cluster + '|' + t.index"
                  @contextmenu.prevent="openLdRowMenu($event, 'top', t)">
                  <td>{{ t.cluster }}</td>
                  <!-- 高频交互闭环：索引名可点=setTarget 到来源集群+深链数据浏览器 -->
                  <td class="mono"><a class="ld-top-link" role="link" tabindex="0" @click="gotoBrowser(t)" @keydown.enter.prevent="gotoBrowser(t)">{{ t.index }}</a></td>
                  <td class="mono">{{ t.qps }}</td>
                  <td class="mono">{{ t.idxRate }}</td>
                  <td class="mono">{{ t.storeMb }}</td>
                </tr>
                <tr v-if="!topRows.length"><td colspan="5" class="ld-hist-hist-empty">暂无索引速率快照（首轮采集基线建立后出数）</td></tr>
              </tbody>
            </table>
          </template>
          <!-- 慢请求视图（ 对标阿里云慢查询 tab；634 权限语义锚=无权限诚实说明不静默消失） -->
          <template v-else-if="detailTab === 'slow'">
            <template v-if="auth.canAuditAll(store.target)">
              <div class="ld-detail-tools">
                <div class="ld-slow-bar">
                  <input v-model.number="slowThresholdMs" class="inp sm ld-slow-inp" type="number" min="100" step="100"
                    aria-label="耗时阈值毫秒" title="耗时阈值（毫秒）" @change="loadSlow" />
                  <span class="ld-hist-sub">ms</span>
                  <button class="btn ghost sm" :disabled="slowLoading" @click="loadSlow"><RotateCw :size="12" :class="{ spinning: slowLoading }" /> 刷新</button> <!-- 件2：在途图标旋转=铁律 D 在途可感知（713 家族/IlmView 同款惯例） -->
                </div>
              </div>
              <div v-if="slowErr" role="alert" class="err-bar">慢请求加载失败：{{ slowErr }}</div>
              <table class="tbl zebra ld-hist-hist-t">
                <thead>
                  <tr><th>时间</th><th>用户</th><th>集群</th><th>方法</th><th>URI</th><th>耗时(ms)</th><th>HTTP</th></tr>
                </thead>
                <tbody>
                  <tr v-for="r in slowRows" :key="(r.timestamp || 0) + '|' + (r.uri || '') + '|' + (r.costMs || 0)"
                  @contextmenu.prevent="openLdRowMenu($event, 'slow', r)">
                    <td class="mono">{{ fmtTime(r.timestamp) }}</td>
                    <td>{{ r.username || '-' }}</td>
                    <td>{{ r.connName || r.connId || '-' }}</td>
                    <td>{{ r.method || '-' }}</td>
                    <td class="ld-hist-hist-msg">{{ r.uri || '-' }}</td>
                    <td class="mono" :class="slowCostTone(r.costMs)">{{ r.costMs ?? '-' }}</td> <!-- 件1：阈值语义链 tone（≥×2 err/≥×1.5 warn） -->
                    <td class="mono">{{ r.httpStatus || '-' }}</td>
                  </tr>
                  <tr v-if="!slowRows.length && !slowLoading"><td colspan="7" class="ld-hist-hist-empty">时间窗内无 ≥ 阈值的慢请求</td></tr>
                </tbody>
              </table>
            </template>
            <div v-else class="ld-stale" role="status">
              <AlertTriangle :size="13" />
              「慢请求」面板需 <b>审计全量权限</b>（rank3+）——当前账号无此权限；可在「安全中心」查看本账号已授予的页面范围。
            </div>
          </template>
          <!-- 告警历史视图（ 对标阿里云报警概览；计数源=alertHistRows 治 782 漂移语义保留） -->
          <template v-else-if="detailTab === 'alert'">
            <div class="ld-detail-tools">
              <select v-model="alertHistFilter" class="inp sm" aria-label="告警历史筛选">
                <option value="all">全部事件</option>
                <option value="alert">仅告警</option>
                <option value="recovered">仅恢复</option>
              </select>
            </div>
            <table class="tbl zebra ld-hist-hist-t">
              <thead>
                <tr><th>时间</th><th>集群</th><th>级别</th><th>指标</th><th>值</th><th>阈值</th><th>状态</th><th>文案</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in alertHistRows" :key="a.timestamp + '|' + (a.connId || '') + '|' + a.metric + '|' + (a.recovered ? 'r' : 'a')"
                  @contextmenu.prevent="openLdRowMenu($event, 'alert', a)">
                  <td class="mono">{{ fmtTime(a.timestamp) }}</td>
                  <td>{{ a.connName || a.connId || '未知集群' }}</td>
                  <td><StatusPill :tone="a.level === 'CRIT' ? 'r' : a.level === 'WARN' ? 'y' : 'n'" :label="a.level" /></td>
                  <td>{{ metricZh(a.metric) }}</td>
                  <td class="mono">{{ srvAlertVal(a.value) }}</td>
                  <td class="mono">{{ typeof a.threshold === 'number' ? a.threshold : '-' }}</td>
                  <td>{{ a.recovered ? '已恢复' : '告警' }}</td>
                  <td class="ld-hist-hist-msg">{{ a.message || '-' }}</td>
                </tr>
                <tr v-if="!alertHistRows.length"><td colspan="8" class="ld-hist-hist-empty">时间窗内无告警事件</td></tr>
              </tbody>
            </table>
          </template>
        </div>
      </div>
      <!-- R4 节点一览（仅节点下钻模式）：每节点最新水位的紧凑表——图卡看趋势，本表看「现在」 -->
      <!-- 1195：行右键——这张表是屏上最后一张没有右键的（1158 覆盖 Top/慢请求/告警，1194 补统计表）。
           节点名是后面所有动作的输入（贴进节点详情、发给同事定位），必须能一键拿走。 -->
      <div v-if="nodeMode && nodeRows.length" class="ld-hist-ntab" role="table" aria-label="节点最新水位">
        <div class="ld-hist-ntab-t sec-t">节点最新水位</div>
        <div class="ld-hist-ntab-r" role="row">
          <span role="columnheader">节点</span><span role="columnheader">Heap %</span>
          <span role="columnheader">CPU %</span><span role="columnheader">磁盘 %</span>
        </div>
        <div v-for="n in nodeRows" :key="n.nodeName || n.connId" class="ld-hist-ntab-r" role="row"
          @contextmenu.prevent="openLdRowMenu($event, 'node', n)">
          <span class="mono" role="cell" :title="n.nodeName || n.connId || ''">{{ shortNode(n.nodeName || n.connId || '') }}</span>
          <span class="mono" role="cell">{{ fmtN(n.heapUsedPct) }}</span>
          <span class="mono" role="cell">{{ fmtN(n.cpuPct) }}</span>
          <span class="mono" role="cell">{{ fmtN(n.diskUsedPct) }}</span>
        </div>
      </div>
    </div>

    <!-- 1158：监控屏三表（Top 索引 / 慢请求 / 告警历史）行右键——
         同一批「看一眼 / 拷一条 / 跳到该集群现场」的动作不再靠列内链接硬闯，
         复制类收进二级（与全站卡片菜单同一两级语言）。 -->
    <CellContextMenu v-if="ldMenu" :x="ldMenu.x" :y="ldMenu.y" :title="ldMenu.title"
      :items="ldMenuItems" @close="ldMenu = null" />
  </FocusableSurface>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { MonitorSpeaker, Pause, Play, Maximize2, Minimize2, AlertTriangle, CheckCircle2, RotateCw, GitCompareArrows, ChevronDown, Copy, Braces, ExternalLink } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import FocusableSurface from '../components/FocusableSurface.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import EmptyState from '../components/EmptyState.vue';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：运行任务/告警计数徽标统一件 */
import { useLiveMonitorStore, type LiveAlert } from '../stores/liveMonitor';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
/* 第四卡单源——全局作业跟踪器（App.vue 登录就绪后常驻轮询），本页只读不拉新端点 */
import { useJobTrackerStore } from '../stores/jobTracker';
import { fmtTime, fmtDur, fmtWindow, fmtNum, copyText } from '../utils/format';
import { removeStoredRaw } from '../utils/safeJson';
import { matrixText } from '../utils/copyMatrix';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { METRIC_THRESHOLDS, metricTone } from '../utils/metricThresholds';
/* 天罗W6：节点角色分档收口 utils/esEnumZh（data=蓝/master=紫单一出处，DiagView 节点表同源）；
 行为等价迁移：模板绑定的 roleLabel/roleClass 与 sortedNodes 的 isDataNode 语义不变。
 作业种类 pill 档 jobKindTone 同源收口（原 :187 jobTone 本地字典退役） */
import { isDataNode, nodeRoleLabel, nodeRoleClass, jobKindTone } from '../utils/esEnumZh';
/* 历史趋势分区：读侧端点 + 采样行→叠加折线纯函数 + 错误文案单源 + 时间范围偏好持久化；
 图卡渲染归 HistoryChart 统一件（本视图只管取数/筛选/下钻状态与序列构建） */
import HistoryChart from '../components/HistoryChart.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import { api, type MonitorMetricsRecord, type MonitorAlertDoc } from '../api';
import { buildSeries, capRows, diskForecast, intervalFor, fixedIntervalMs, rawPeriodSafe, redBands, latestByNode, activeAlerts as deriveActiveAlerts, type MonitorSeriesField, type NamedSeries } from '../utils/monitorSeries';
/* 分组导航单源（对标阿里云「分组」实测 9 项；我方收敛 8 组）。
 映射外挂于 utils（不写进 HIST_CHARTS 条目）→ 不触碰 monitorHistoryTrend 对条目字面的逐字锁。 */
import { HIST_GROUPS, inHistGroup, histGroupLabel, type HistGroupKey } from '../utils/histGroups';
import { catmullRomPath, catmullRomAreaPath, sparkPts, movingAverage, CMP_W, CMP_H, PCT_GRID, type Pt, sparklinePoints } from '../utils/sparkChart'; /* P1a-1 单源下沉； K2 增 PCT_GRID（对比卡 pct 网格）/SPARK_H 随迷你 spark 退役移出 */
import LiveChartCard from '../components/LiveChartCard.vue'; /* P1a-2：实时走势主卡统一件 */

/* 几何常量（LD_H/SPARK_H/CMP_W/CMP_H/PCT_GRID）与点位纯函数已下沉
 utils/sparkChart.ts 单源（P1a-1）；此处经 import 引入，模板与悬浮换算照常使用。 */
/* 走势卡悬浮命中纯函数（十字线/圆点/读出钉在曲线上，点位公式与 sparklinePoints(Pct) 同源） */
import { sparkHoverAt, lineYAtFrac, type SparkHoverHit } from '../utils/sparkHover';
import { useHoverEscape } from '../composables/useHoverEscape';
import { friendlyEsError } from '../utils/esError';
import { rowArrowNav } from '../utils/rowNav';
import { usePref } from '../composables/urlState';
import { normalizePrefEnum } from '../utils/prefEnum';
import { useAutoRefresh } from '../composables/useAutoRefresh';

/* 采样器/趋势/告警状态机全部住进全局 store（切页不中断），组件只管展示与启动 */
const mon = useLiveMonitorStore();
const router = useRouter();
/* 运行中任务单源读取（jobs 为响应式数组，jobTracker 常驻轮询自动刷新本卡） */
const tracker = useJobTrackerStore();
const runningJobs = computed(() => tracker.jobs.filter(j => j.status === 'RUNNING'));
/* ②任务卡走势：运行任务数入 store 会话窗序列（快照续采；任务为全局口径
 ——jobTracker 不分集群，切目标集群不清位，与 qps/heap 按集群隔离序列相反） */
watch(() => runningJobs.value.length, n => mon.pushJobCount(n), { immediate: true });
/* kindName → pill 档： utils/esEnumZh 的 jobKindTone（Reindex 写类 y /
 快照中性 n / 托管重建·迁移信息蓝 b），本地字典退役——import 别名供模板零改动消费 */

/* 告警条目按语义 key 路由到对应处置页（诊断→定位桥，此前告警纯展示无法点） */
function alertRoute(a: LiveAlert) {
  if (a.key.startsWith('heap:') || a.key.startsWith('cpu:') || a.key.startsWith('disk:')) {
    const node = a.key.slice(a.key.indexOf(':') + 1);
    router.push({ path: '/diag', query: { node } });
  } else if (a.key === 'unassigned') {
    router.push('/topology');
  } else if (a.key === 'pending') {
    router.push('/tasks');
  } else {
    router.push('/diag');
  }
}
const {
  intervalMs, windowPts, running, health, nodes, pendingTasks,
  qpsSeries, indexRateSeries, heapSeries, cpuSeries, diskSeries, nodeSeries, sampleTs, windowMs, nowTs, lastOkAt, obsStale,
  avgHeap, avgCpu, avgDisk, unassignedShards, uaAbnormal, uaSub, curQps, curIdx,
  activeAlerts, resolvedAlerts, badCount, warnCount,
} = storeToRefs(mon);
const fullscreen = ref(false);

/* （622 -P4 挂墙，独立稿 goal684-wall-mode.html；令「全部干全部批准」）：
 全屏态=挂墙模式。轮询恒定 5s（W2 推荐）——进墙存档锁 5s、出墙还原进墙前档位
 （usePref 落盘值进出等值还原，铁律 B 零状态重置）；选择器禁用不禁藏在模板接线。
 其余四件（隐元信息带/告警折叠/当前值升 --fs-num-l/时间锚升满轴）全走 .ld-wall CSS
 级联零 DOM 增删（ 同律）；高度链（.ld-chart-full/--vh-offset）零触碰（稿约红线）。 */
const wallPrevMs = ref<number | null>(null);
watch(fullscreen, on => {
  if (on) {
    wallPrevMs.value = intervalMs.value;
    if (intervalMs.value !== 5000) intervalMs.value = 5000;
  } else if (wallPrevMs.value != null) {
    intervalMs.value = wallPrevMs.value;
    wallPrevMs.value = null;
  }
});

/* G\'3（646 重盘差距面）：实时数值「无数据」回落「—」——差分首轮（QPS/写入，
 序列空待第二针才出数）与无节点时刻（Heap/CPU/磁盘均值）此前显「0.0」/「0.0%」，
 无数据与零值不可分辨。序列/数据空回落 em dash；有数据保持原 toFixed 形态零变化。
 cur-key 同步走 text（「—」态稳定不触发数值动画重放）；pct 三卡 title 无数据不渲染。 */
const qpsText = computed(() => qpsSeries.value.length ? curQps.value.toFixed(1) : '—');
const idxText = computed(() => indexRateSeries.value.length ? curIdx.value.toFixed(1) : '—');
const heapText = computed(() => heapSeries.value.length ? avgHeap.value.toFixed(1) + '%' : '—');
const cpuText = computed(() => cpuSeries.value.length ? avgCpu.value.toFixed(1) + '%' : '—');
const diskText = computed(() => diskSeries.value.length ? avgDisk.value.toFixed(1) + '%' : '—');
/* Z3（不重复性）：采样等待文案单源——旧形态同字面量在五卡 prop+对比卡共写 6 份 */
const waitText = computed(() => '采样中，约 ' + (intervalMs.value / 1000 * 2) + 's 后出图…');
const heapTitle = computed(() => heapSeries.value.length ? '数据节点均值 ' + avgHeap.value.toFixed(1) + '% · 阈值告警见虚线' : undefined);
const cpuTitle = computed(() => cpuSeries.value.length ? '数据节点均值 ' + avgCpu.value.toFixed(1) + '% · 阈值告警见虚线' : undefined);
const diskTitle = computed(() => diskSeries.value.length ? '数据节点均值 ' + avgDisk.value.toFixed(1) + '% · 阈值告警见虚线' : undefined);

const diskUsedPct = mon.diskUsedPct;
const toggle = mon.toggle;
const clearResolved = mon.clearResolved;

/* 观测中断横幅「重试」：接 store 既有采样函数立即补一针（setFocus(false→true) 触发 tick），
 不新造轮询逻辑；「重新登录」走既有登出流（清 token 弹登录遮罩） */
const auth = useAuthStore();
const store = useAppStore();
/* 纯连接模型：节点聚合行无连接标识，后端要求先指定已授权集群——前端补默认首个可见集群 */
const pureConnModel = computed(() => {
  const gp = auth.grantedPages;
  return Array.isArray(gp) && gp.length > 0 && gp.every(g => g.startsWith('conn:'));
});
function retryObserve() { mon.setFocus(false); mon.setFocus(true); }

/* A：节点角色区分——data 排前、master-only/ingest 弱化；角色徽标分色。
 天罗W6：判定与分档函数迁 utils/esEnumZh（行为等价，此处只留别名绑定供模板零改动消费） */
const roleLabel = nodeRoleLabel;
const roleClass = nodeRoleClass;
const sortedNodes = computed(() => [...nodes.value].sort((a, b) => Number(isDataNode(b)) - Number(isDataNode(a))));
/* 件1：区块头汇总（节点/master/水位告警一眼读出；空串=空态不占位） */
const nodesSummary = computed(() => {
  const ns = sortedNodes.value;
  if (!ns.length) return '';
  const masters = ns.filter(n => (n.roles || []).includes('master')).length;
  const alarming = ns.filter(n => nodeTone(n) !== 'ok').length;
  const parts = [ns.length + ' 节点'];
  if (masters) parts.push(masters + ' master');
  if (alarming) parts.push(alarming + ' 水位告警');
  return parts.join(' · ');
});
/* 指标身份色：节点卡水位条与对比卡折线共用同一色，健康度另由边框/角标表达（不抢指标身份）；
 K3：NODE_METRICS 表随卡内迷你 spark 退役（对比卡指标档=cmpSeries 直接读
 nodeSeries，色板走 CMP_PALETTE 排序位锚定） */
const METRIC_COLOR: Record<'heap' | 'cpu' | 'disk', string> = {
  heap: 'var(--warn)',
  cpu: 'var(--dv-blue)',
  disk: 'var(--dv-purple)',
};
const nodeSeriesFor = (name: string, metric: 'heap' | 'cpu' | 'disk' | 'qps' | 'idx') => nodeSeries.value[name]?.[metric] || [];
/* 节点 Load_1m 实时化——brief 已带 load_average 对象，此前从未消费；缺省节点返回 null（整行不渲染，诚实缺省） */
const load1mOf = (n: any): string | null => {
  const la = n?.load;
  const v = la && typeof la === 'object' ? Number(la['1m']) : Number(la);
  return Number.isFinite(v) ? v.toFixed(2) : null;
};
/* 对标 Thread_pool Rows：查询线程池即时值（active/queue，写入拒绝前兆）；缺省 null 不渲染 */
const tpOf = (n: any): string | null => {
  const a = Number(n?.tpSearchActive), q = Number(n?.tpSearchQueue);
  return Number.isFinite(a) && Number.isFinite(q) ? `${a}/${q}` : null;
};
/* 指标健康度 → 值色档（MetaStrip tone：阈值表三档直映，原 'good' 类名档随本地 meta 带退役） */
function metricToneCls(metric: 'heap' | 'cpu' | 'disk', value: number): 'ok' | 'warn' | 'err' {
  const t = metricTone(metric, value);
  /* metricTone 的 'bad' 档在本页语义即 err(最差档) */
  return t === 'bad' ? 'err' : t;
}
/* 指标带（MetaStrip 统一件）：原整条 :title 全文拆到各段 tip，逐段兜底 */
const hHealthTone = computed<'ok' | 'warn' | 'err' | undefined>(() => {
  if (!health.value) return undefined;
  return health.value.status === 'green' ? 'ok' : health.value.status === 'yellow' ? 'warn' : 'err';
});
const ldMeta = computed<MetaStripItem[]>(() => [
  {
    label: `集群健康（节点 ${health.value?.number_of_nodes || 0} · 数据 ${health.value?.number_of_data_nodes || 0}）`,
    value: health.value?.status || '—', tone: hHealthTone.value,
    tip: `集群健康 ${health.value?.status || '—'} · 节点 ${health.value?.number_of_nodes || 0} · 数据 ${health.value?.number_of_data_nodes || 0}`,
  },
  {
    label: `未分配（${uaSub.value}）`, value: unassignedShards.value,
    tone: uaAbnormal.value ? (health.value?.status === 'red' ? 'err' : 'warn') : undefined,
    tip: `未分配分片 ${unassignedShards.value}（${uaSub.value}）`,
  },
  {
    label: `活跃分片（${(health.value?.active_shards_percent_as_number || 0).toFixed(1)}% 已激活）`,
    value: health.value?.active_shards || 0,
    tip: `活跃分片 ${health.value?.active_shards || 0}（${(health.value?.active_shards_percent_as_number || 0).toFixed(1)}% 已激活）`,
  },
  /* 对标阿里云集群级「索引数量」：health 接口无此值，取同页历史拉取的最新 cluster 采样
 （服务端每分钟口径=阿里云 1min 同档，零新请求）；node 下钻/无采样时 chip 不渲染 */
  ...(lastClusterIndices.value !== null ? [{
    label: `索引数量（最近采样）`, value: lastClusterIndices.value,
    tip: `索引数量 ${lastClusterIndices.value}（服务端每分钟采样口径）`,
  }] : []),
  /* 对标阿里云集群级「快照状态」：失败>0 err 档；无采样不渲染 */
  ...(lastClusterSnapshot.value ? [{
    label: `快照（共 ${lastClusterSnapshot.value.total}）`, value: lastClusterSnapshot.value.failed,
    tone: lastClusterSnapshot.value.failed > 0 ? 'err' as const : 'ok' as const,
    tip: `快照失败 ${lastClusterSnapshot.value.failed} / 共 ${lastClusterSnapshot.value.total}（服务端每分钟采样口径）`,
  }] : []),
  {
    label: '待处理任务（master 队列）', value: pendingTasks.value,
    tone: pendingTasks.value > 20 ? 'err' : pendingTasks.value > 5 ? 'warn' : undefined,
    tip: `待处理任务 ${pendingTasks.value}（master 队列，>5 警告 >20 严重）`,
  },
  {
    label: '均值 CPU（数据节点均值）', value: avgCpu.value.toFixed(1), unit: '%',
    tone: metricToneCls('cpu', avgCpu.value),
    tip: `均值 CPU ${avgCpu.value.toFixed(1)}%（数据节点均值）`,
  },
  {
    label: `写入拒绝（${rejectedSub.value}）`, value: totalRejected.value,
    tone: totalRejected.value > 0 ? 'err' : undefined,
    tip: `写入拒绝 ${totalRejected.value}（${rejectedSub.value}）`,
  },
]);
/* 节点健康度：三指标取最差档（bad > warn > ok），统一走 metricTone 阈值表 */
function nodeTone(n: any): 'ok' | 'warn' | 'bad' {
  const tones = [metricTone('heap', n.heapPct), metricTone('cpu', n.cpuPct), metricTone('disk', diskUsedPct(n))];
  if (tones.includes('bad')) return 'bad';
  if (tones.includes('warn')) return 'warn';
  return 'ok';
}
/* 节点健康色值映射（MetaStrip dot 位直传——组件 dot 吃 CSS 色值不吃档名，
 ok/warn/bad → --ok/--warn/--err 同 token 等值迁移，.ld-node-tone 三档色规则随之退役） */
function nodeToneDot(n: any): string {
  const t = nodeTone(n);
  return t === 'ok' ? 'var(--ok)' : t === 'warn' ? 'var(--warn)' : 'var(--err)';
}

/* 写入拒绝率统计 */
const totalRejected = computed(() => {
  return nodes.value.reduce((sum, n) => {
    const search = n.searchRejected ?? n.threadPool?.search?.rejected ?? 0;
    const bulk = n.bulkRejected ?? n.threadPool?.bulk?.rejected ?? n.threadPool?.write?.rejected ?? 0;
    return sum + search + bulk;
  }, 0);
});
const rejectedSub = computed(() => {
  if (totalRejected.value === 0) return '目标 0';
  const byNode = nodes.value.map(n => ({
    name: n.name,
    count: (n.searchRejected ?? n.threadPool?.search?.rejected ?? 0) +
           (n.bulkRejected ?? n.threadPool?.bulk?.rejected ?? n.threadPool?.write?.rejected ?? 0)
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
  return byNode.length ? `${byNode[0].name} ${byNode[0].count}` : '多节点';
});


/* 背景档实际间隔（取较慢者）——副标题把降频事实告知用户，不做隐形行为 */
const bgMs = computed(() => Math.max(intervalMs.value, 15000));
/* 趋势窗口跨度标注：用首末采样时刻真实跨度（跳过降频档后估算会失真）。
 * 走 fmtWindow 而非 fmtDur——这里描述的是「图覆盖多大窗口」的档位标签而非耗时；
 * fmtDur 会渲染出「近 1m0s」这种带冗余次级单位的不自然形态。空串时标注整体不渲染。 */
/* 趋势窗长截尾单源——六卡/对比卡/悬浮与窗标注全部经此切片（窗长=live.windowPts 偏好） */
const winSlice = (arr: number[]) => (arr.length > windowPts.value ? arr.slice(arr.length - windowPts.value) : arr);
const winWindowMs = computed(() => {
  const ts = winSlice(sampleTs.value);
  return ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
});
const windowLabel = computed(() => fmtWindow(winWindowMs.value));
/* 单卡放大全屏——双态同钮（Maximize2↔Minimize2）+Esc window 捕获级+遮罩；
 卡原地 fixed 全屏（SVG viewBox 自适应放大，零内容重复渲染）；Esc 关闭还焦由按钮 title 语义承担 */
/* （节点筛选——图例 chip 点选隐藏/恢复（Grafana 图例语汇），折线与悬浮行同步过滤 */
const hiddenNodes = ref<string[]>([]);
/* ══ 件3：节点对比归流内联容器状态机 ══
 令推翻 794 悬浮形态（「怎么单独弹出了一个页面，投机倒把，重新设计跟页面一样的
 设计语言」）＝fixed 浮层/拖动把柄/位置落盘（ld.cmpPos）/dialog 语义全退役，容器迁入
 .ld-nodes 区页面流（800 监控明细单容器同构语言）；开合态 usePref 落盘保留（铁律 B）；
 Esc=window 捕获级+焦点回入口钮语义保留（铁律 D1#5）。 */
const cmpPanelOpen = usePref<boolean>('ld.cmpOpen', false);
const cmpEntryRef = ref<HTMLElement | null>(null);
function toggleCmpPanel() { cmpPanelOpen.value ? closeCmpPanel() : (cmpPanelOpen.value = true); }
function closeCmpPanel() {
  cmpPanelOpen.value = false;
  cmpHit.value = null;
  cmpEntryRef.value?.focus();
}
function onCmpEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && cmpPanelOpen.value) { e.stopPropagation(); closeCmpPanel(); }
}
onMounted(() => window.addEventListener('keydown', onCmpEsc, true));
onBeforeUnmount(() => window.removeEventListener('keydown', onCmpEsc, true));
function toggleNode(name: string) {
  const i = hiddenNodes.value.indexOf(name);
  if (i >= 0) hiddenNodes.value.splice(i, 1);
  else hiddenNodes.value.push(name);
}
/* 展开键放宽为字符串（896 能力统一）：顶部卡五档 + 历史卡 'hist:<field>' +
 节点对比 'cmp' + Top 曲线 'top'——同一状态机/遮罩/Esc 链路 */
const expandedCard = ref<string | null>(null);
function toggleExpand(key: string) {
  expandedCard.value = expandedCard.value === key ? null : key;
}
function onExpandEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && expandedCard.value) {
    e.stopPropagation();
    expandedCard.value = null;
  }
}
watch(expandedCard, (v) => {
  if (v) { window.addEventListener('keydown', onExpandEsc, true); document.body.classList.add('ld-chart-mask'); }
  else { window.removeEventListener('keydown', onExpandEsc, true); document.body.classList.remove('ld-chart-mask'); }
});
onBeforeUnmount(() => { window.removeEventListener('keydown', onExpandEsc, true); document.body.classList.remove('ld-chart-mask'); });

/* ═══ G'5：⋯浮层（.ld-hist-more）Esc 收口——铁律 D1#5「开弹层→Esc→焦点回触发器」 ═══
 * 664 复检缺口（details 原生语义无 Esc 关层（628「无需 Esc 接线」注释证伪勘误）。
 * 范式落专属收口：开层（toggle）挂 window 捕获级 keydown，Esc 关层+焦点回 summary；
 * 关层摘卸+处理体防御性摘卸双保险（程序化 open 变更的 toggle 派发个别环境缺失时仍不泄漏）；
 * 卸载摘卸对称。浮层内无文本输入（3 select+1 checkbox），566 两段的「清词段」不适用=
 * 单段关层；select 原生下拉展开态 Esc 由浏览器 UI 消费（keydown 不达页面）零误关。 */
const histMoreEl = ref<HTMLDetailsElement | null>(null);
const histMoreSumEl = ref<HTMLElement | null>(null);
function onHistMoreToggle() {
  if (histMoreEl.value?.open) window.addEventListener('keydown', onHistMoreEsc, true);
  else window.removeEventListener('keydown', onHistMoreEsc, true);
}
function onHistMoreEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !histMoreEl.value?.open) return;
  e.stopPropagation();
  histMoreEl.value.open = false;
  histMoreSumEl.value?.focus();
  window.removeEventListener('keydown', onHistMoreEsc, true);
}
onBeforeUnmount(() => window.removeEventListener('keydown', onHistMoreEsc, true));

/* ═══ ：节点对比叠加图（各节点序列叠加，悬浮=各节点该时刻值行） ═══
 * 色板 HistoryChart PALETTE 同源五色锚定节点排序位（>5 节点循环）；点位换算复用
 * sparkHoverAt 单源（pct 刻度，基准=第一条有效序列，序列长度不足该时刻的节点行不列）。 */
const CMP_METRICS = [
  { k: 'heap', label: 'Heap', mode: 'pct', warn: METRIC_THRESHOLDS.heap.warn },
  { k: 'cpu', label: 'CPU', mode: 'pct', warn: METRIC_THRESHOLDS.cpu.warn },
  { k: 'disk', label: '磁盘', mode: 'pct', warn: METRIC_THRESHOLDS.disk.warn },
  /* QPS/写入两档=个体吞吐负载（nodeSeries per-node 差分序列，abs 峰值地板刻度无阈值线） */
  { k: 'qps', label: 'QPS', mode: 'abs', warn: null },
  { k: 'idx', label: '写入', mode: 'abs', warn: null },
] as const;
type CmpMetric = typeof CMP_METRICS[number]['k'];
const CMP_PALETTE = ['var(--dv-blue)', 'var(--ok)', 'var(--wn)', 'var(--err)', 'var(--ac)'];
const cmpMetric = ref<CmpMetric>('heap');
/* seg 滑动指示器（622 ）——激活项索引与等分几何（等宽钮下 pill 左=idx·1/n）。
 left/width 全用百分比 → 容器宽度变化零 JS 干预，过渡由 .seg-thumb 的 left/width transition 承担。 */
const cmpMetricIdx = computed(() => Math.max(0, CMP_METRICS.findIndex(m => m.k === cmpMetric.value)));
function segPillStyle(count: number, activeIdx: number) {
  const n = Math.max(1, count);
  return { left: `${(activeIdx * 100 / n)}%`, width: `${(100 / n)}%` };
}
/* 件1：色号锚定排序位（对齐 hc colorOf 语义——隐藏不换色；chips 行与曲线同色） */
function cmpColorOf(name: string): string {
  const i = sortedNodes.value.findIndex(n => String(n.name || n.nodeId) === name);
  return CMP_PALETTE[(i < 0 ? 0 : i) % CMP_PALETTE.length];
}
/* 896 #10 主节点专项视角：对比面板可切「仅 master」——三主节点集群混看 data/master
 时 master 水位（堆/磁盘）才是集群稳定性的关键少数；role 口径与 nodesSummary 同源 */
const cmpOnlyMaster = ref(false);
const cmpScopeNodes = computed(() => cmpOnlyMaster.value
  ? sortedNodes.value.filter(n => (n.roles || []).includes('master'))
  : sortedNodes.value);
const cmpSeries = computed(() => cmpScopeNodes.value
  .filter(n => !hiddenNodes.value.includes(String(n.name || n.nodeId)))
  .map((n: any) => ({
    name: String(n.name || n.nodeId),
    color: cmpColorOf(String(n.name || n.nodeId)),
    /*  绘制前 5 点（≈25s）滑动平均：GC 锯齿毛刺磨平、悬崖退化为一拍缓坡——
     观感与分钟级历史卡一致，曲线仍准实时推进（滞后≤一个窗口） */
    data: winSlice(movingAverage(nodeSeriesFor(n.name, cmpMetric.value))),
  })));
/* 件1：图例 chips 行（全节点常驻——色点+名+当前值+点击显隐=hc-chip 同语言；
 「为什么仍然是这个效果」根治=对比曲线值不再只藏悬浮读出） */
const cmpChips = computed(() => cmpScopeNodes.value.map((n: any) => {
  const name = String(n.name || n.nodeId);
  const data = winSlice(nodeSeriesFor(name, cmpMetric.value));
  const last = data.length ? data[data.length - 1] : null;
  const pct = cmpMode.value === 'pct';
  return {
    name,
    color: cmpColorOf(name),
    off: hiddenNodes.value.includes(name),
    cur: last == null ? '—' : (pct ? Math.round(last) + '%' : Number(last).toFixed(1)),
  };
}));
const cmpHasData = computed(() => cmpSeries.value.some(s => s.data.length > 1));
/* 联动高亮（质感分层，HistoryChart hotName 同语言）：图例 chip/悬浮读出行 hover 或键盘
 focus → 该节点曲线升亮、其余退灰；hot 只命中可见序列（隐藏节点 chip 悬停不全场退灰） */
const cmpHot = ref<string | null>(null);
const cmpHotActive = computed(() => !!cmpHot.value && cmpSeries.value.some(s => s.name === cmpHot.value));
/* 联动面积+末端呼吸点（历史卡同款三件套）：hover 节点时该序列
 画唯一渐变面积（catmullRomAreaPath 平滑面积=上边缘与折线同一曲线+底边闭合，
 六卡 ld-area/历史卡 hc-area 单源同语言——旧 polygon 直边与平滑曲线不贴合，
 波动处面积边穿出缩进即「不丝滑」体感）并挂末端呼吸点，其余序列退灰——多序列图一眼聚焦单节点 */
const cmpArea = computed(() => {
  const s = cmpSeries.value.find(x => x.name === cmpHot.value);
  if (!s || s.data.length < 2) return null;
  const pts = sparkPts(s.data, CMP_W, CMP_H, cmpMode.value, cmpScaleMax.value);
  /*  Heap=GC 锯齿 gauge 指标 → 阶梯形态（step-after，台阶=采样格点、悬崖=真实回收，
   杂乱毛刺变整齐台阶节奏，Datadog/Grafana 惯例）；CPU/磁盘连续指标保持平滑 */
  return { d: catmullRomAreaPath(pts, CMP_W, CMP_H), color: s.color };
});
const cmpPulseDot = computed(() => {
  const s = cmpSeries.value.find(x => x.name === cmpHot.value);
  if (!s || s.data.length < 2) return null;
  const pts = sparkPts(s.data, CMP_W, CMP_H, cmpMode.value, cmpScaleMax.value);
  const p = pts[pts.length - 1];
  return { left: (p.x / CMP_W * 100).toFixed(2) + '%', top: (p.y / CMP_H * 100).toFixed(2) + '%', color: s.color };
});
/* 悬浮贴线圆点的 y：该序列在十字线 frac 处的插值高度（lineYAtFrac 单源，主卡同款） */
function cmpDotTop(s: { data: number[] }): string {
  const y = lineYAtFrac(s.data, cmpHit.value ? cmpHit.value.frac : 0, CMP_H, cmpMode.value);
  return (y / CMP_H * 100).toFixed(2) + '%';
}
/* 末端常驻采样点位置（每序列末锚点；x 恒右缘，y=该序列当前值——「看得到点」） */
function cmpEndDotOf(s: { data: number[] }): { top: string } {
  const pts = sparkPts(s.data, CMP_W, CMP_H, cmpMode.value, cmpScaleMax.value);
  if (!pts.length) return { top: '50%' };
  return { top: (pts[pts.length - 1].y / CMP_H * 100).toFixed(2) + '%' };
}
const cmpHit = ref<SparkHoverHit | null>(null);
const cmpMode = computed<'pct' | 'abs'>(() => CMP_METRICS.find(m => m.k === cmpMetric.value)?.mode ?? 'pct');
const cmpWarn = computed<number | null>(() => CMP_METRICS.find(m => m.k === cmpMetric.value)?.warn ?? null);
function onCmpMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null;
  /* frac 分母=绘图域内壳（36px 让位后与 wrap 差一列），用 wrap 宽会把命中整体压小 */
  const inner = el?.querySelector('.ld-cmp-inner');
  const rect = (inner ?? el)?.getBoundingClientRect();
  const wrap = el?.getBoundingClientRect();
  const frac = rect && rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const base = cmpSeries.value.find(s => s.data.length > 1);
  /* 件1：Y 向跟手（指针 y 相对图区钳位） */
  const y = wrap ? Math.min(Math.max(e.clientY - wrap.top, 14), wrap.height - 14) : 0;
  /* ts 与 data 同窗右对齐（LiveChartCard tsWin 同语义）：data 是 winSlice 截尾窗，
 直接传全量 sampleTs 会让读出头部时刻取到窗前采样点——十字线在窗内、时刻停在窗外
 （线上反馈「悬浮点不跟鼠标点」根因）；按数据长度右对齐切片保同域 */
  const tsWin = base ? sampleTs.value.slice(Math.max(0, sampleTs.value.length - base.data.length)) : [];
  const hit = base ? sparkHoverAt(base.data, tsWin, frac, CMP_W, CMP_H, cmpMode.value) : null;
  cmpHit.value = hit ? { ...hit, y: y ?? 0 } : null;
}
function onCmpLeave() { cmpHit.value = null; }
/* 悬浮残留兜底（mouseleave 丢失场景）——鼠标坐标出图区即清。 */
const cmpPlotEl = ref<HTMLElement | null>(null);
const topPlotEl = ref<HTMLElement | null>(null);
useHoverEscape(
  () => cmpHit.value != null,
  (e) => {
    const el = cmpPlotEl.value;
    if (!el) return true;
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  },
  onCmpLeave,
);
/* 读出行：各节点在该时刻的值——pct 档整数化带 %（对齐节点卡形态），abs 档 toFixed(1) 裸值；
 序列短于该时刻的行不列 */
const cmpRows = computed(() => {
  const hit = cmpHit.value;
  if (!hit) return [];
  const pct = cmpMode.value === 'pct';
  return cmpSeries.value
    .filter(s => s.data.length > hit.i)
    .map(s => ({ name: s.name, color: s.color, v: pct ? Math.round(s.data[hit.i]) + '%' : s.data[hit.i].toFixed(1) }));
});
const cmpLeft = (frac: number) => (frac * 100).toFixed(2) + '%';
const cmpShift = (frac: number) => frac > 0.72 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)';
/* ①：读出层超长防护——>8 行截前 8 行+尾行「+K 节点」聚合（title 兜底全列名；
 行尾 × 可隐藏节点减行+头部恢复，两通道互补〔图例退役后唯一隐藏通道〕） */
/* cap 8→24（实报「+1 节点…看不完整」——9 节点集群必然截断；823 跟手小卡片+260px 滚动兜底下不再爆行；+N 尾行通道保留兜底极端规模） */
const CMP_TIP_CAP = 24;
const cmpRowsCapped = computed(() => capRows(cmpRows.value, CMP_TIP_CAP));
/* K2：对比卡轴系——X 轴 3 锚取窗切片（与主卡 tsWin 同口径）；
 Y 顶刻度 pct=固定 100 / abs=全序列窗峰值（与 sparklinePoints 的 max(...data,1) 地板刻度同域） */
const cmpTs = computed(() => winSlice(sampleTs.value));
/* abs 档全体可见节点共享 max（对比曲线归一与 Y 顶刻度单源同读——各线横向可比，
 按刻度读峰高不再失真）；pct 档固定 0-100 刻度天然共享，sparkPts 不消费该值 */
const cmpScaleMax = computed(() => {
  let mx = 1;
  for (const s of cmpSeries.value) for (const v of s.data) if (v > mx) mx = v;
  return mx;
});
const cmpYTop = computed(() => {
  if (cmpMode.value === 'pct') return '100';
  let mx = cmpScaleMax.value;
  return mx >= 100 ? String(Math.round(mx)) : mx.toFixed(1);
});

// 采样器常驻 store：首次挂载启动，卸载不停——再回来趋势连续（ 核心修复）
// 在大屏期间升到前台全速档，离开后降回背景档（仍在采）
onMounted(() => { mon.start(); mon.setFocus(true); });
onBeforeUnmount(() => { mon.setFocus(false); });

/* ═══ 集群监控历史趋势（服务端每分钟采样 · 多集群叠加 · 环形保留） ═══
 * 只读分区：服务端定时任务=唯一写入方，本区只拉 /monitor-metrics。scope 双态：
 * cluster=多集群叠加；「按节点查看」（需先选定具体集群）切 scope=node 下钻到节点序列。
 * 范围与集群筛选全量下推；加载失败经 friendlyEsError 进 err-bar（role=alert）；
 * 加载态骨架蒙层保留上轮数据防闪烁。 */
const hist = ref<MonitorMetricsRecord[]>([]);
/* 最新 cluster 采样里的索引数量（D2；按 timestamp 取最新、非 node 采样，node 下钻态/空数据=null） */
const lastClusterIndices = computed<number | null>(() => {
  let best: number | null = null, bestTs = -1;
  for (const r of hist.value as any[]) {
    const ts = Number(r?.timestamp || 0);
    if (r?.scope !== 'node' && Number.isFinite(Number(r?.indices)) && ts >= bestTs) {
      bestTs = ts; best = Number(r.indices);
    }
  }
  return best;
});
/* 对标阿里云集群级「快照状态」卡：timestamp 最新采样的 slm 快照失败数（ 管道既有键） */
const lastClusterSnapshot = computed<{ failed: number; total: number } | null>(() => {
  let best: { failed: number; total: number } | null = null, bestTs = -1;
  for (const r of hist.value as any[]) {
    const tsN = Number(r?.timestamp || 0);
    if (r?.scope !== 'node' && Number.isFinite(Number(r?.snapshotFailed)) && tsN >= bestTs) {
      bestTs = tsN; best = { failed: Number(r.snapshotFailed), total: Number(r.snapshotsTotal || 0) };
    }
  }
  return best;
});
const histLoading = ref(false);
const histErr = ref('');
/* R6 环形治理用量（审计+监控合计/上限）：拉取失败静默隐藏，不打扰图表 */
const ring = ref<{ totalBytes: number; capBytes: number; auditBytes: number; monitorBytes: number } | null>(null);
/* R7 服务端告警（GET /monitor-alerts 原始流）：活跃集由 activeAlerts 单源推导
 （同 connId|metric 取最新、滤 recovered:true 恢复事件），拉取失败静默=空集显示「无活动告警」。
 别名 deriveActiveAlerts——本视图 storeToRefs 已解构同名 activeAlerts（实时告警状态机） */
const srvAlerts = ref<MonitorAlertDoc[]>([]);
const srvActive = computed(() => deriveActiveAlerts(srvAlerts.value));
/* chips 值位：数值取整/一位小数，缺省（首轮告警可无 value）落 '-' 占位 */
function srvAlertVal(v: number | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : '-';
}
/* 悬停原生提示：时间（fmtTime 单源）+ 全量文案 + 阈值（在案才显） */
function srvAlertTitle(a: MonitorAlertDoc): string {
  const th = typeof a.threshold === 'number' ? ` · 阈值 ${a.threshold}` : '';
  return `${fmtTime(a.timestamp)} · ${a.connName || a.connId || '未知集群'} ${a.metric}=${srvAlertVal(a.value)}${th}${a.message ? ' · ' + a.message : ''}`;
}
/* 告警历史（对标阿里云报警概览）：时间窗内告警+恢复事件全量表，默认收起；
 指标中文化映射（新 metric 未入表回落原文，绝不空白） */
const ALERT_METRIC_ZH: Record<string, string> = {
  heap: 'Heap 占用', disk: '磁盘水位', health: '集群健康', rejected: '线程池拒绝',
  gcYoung: 'Young GC', nodesMissing: '失联节点', slm: '快照失败',
};
function metricZh(m: string): string { return ALERT_METRIC_ZH[m] || m; }
/* ══ ：监控明细单容器状态（用户六令实报「top写入索引要跟下面的监控在一块」）——
 三旧独立面板 open 状态（topOpen/slowOpen/alertHistOpen）合一：detailOpen（容器开合）+
 detailTab（三视图切换）；懒加载语义保持=开容器且切到该视图才拉取（Top 曲线累积随轮询
 推进同 794 接线）。告警历史数据随 loadHist 同窗拉取（零专属拉取）无需懒加载。 */
type DetailTab = 'top' | 'slow' | 'alert';
const detailOpen = ref(false);
const detailTab = ref<DetailTab>('top');
const detailTabs = computed(() => {
  const t: Array<{ k: DetailTab; label: string }> = [];
  if (!nodeMode.value) t.push({ k: 'top', label: 'Top 索引' });
  if (auth.canAuditAll(store.target)) t.push({ k: 'slow', label: '慢请求' });
  t.push({ k: 'alert', label: '告警历史' });
  return t;
});
const detailSegN = computed(() => detailTabs.value.length);
const detailTabIdx = computed(() => Math.max(0, detailTabs.value.findIndex(t => t.k === detailTab.value)));
const detailShows = (t: DetailTab) => detailOpen.value && detailTab.value === t;
function toggleDetail() { detailOpen.value = !detailOpen.value; }
function switchDetail(k: DetailTab) {
  detailTab.value = k;
  if (detailTab.value === 'top' && nodeMode.value) detailTab.value = 'alert'; /* Top 在节点模式不渲染=回落告警视图 */
}
function ensureDetailLoad() {
  if (detailTab.value === 'top' && !nodeMode.value && !topRows.value.length) void loadTop();
  else if (detailTab.value === 'slow' && !slowRows.value.length) void loadSlow();
}
/* 懒加载唯一触发源=这对 watch：toggle/switch 函数体不得再直调 ensureDetailLoad
 （同 tick 双入口双发，loadTop/loadSlow 每交互各拉两拍） */
watch(detailOpen, on => { if (on) void ensureDetailLoad(); });
watch(detailTab, () => { if (detailOpen.value) void ensureDetailLoad(); });
const alertHistFilter = ref<'all' | 'alert' | 'recovered'>('all');
const alertHistRows = computed(() => srvAlerts.value
  .filter(a => alertHistFilter.value === 'all'
    || (alertHistFilter.value === 'recovered') === !!a.recovered));
/* Top 索引快照（对标阿里云 Index 索引行）：选定单集群=该集群 Top；全部集群=逐集群拉取合并（上限 10）
 件2（实报「top 写入索引为什么不是一样是曲线显示」）：快照→时序多折线——
 前端会话累积 per-index 写入速率序列（jobCountSeries 同款范式，零后端改动；窗长随
 趋势窗长档钳制，打开面板起逐拍推进不回溯历史=实时监控诚实语义）；曲线/表格双视图 seg
 （曲线默认）；悬浮读出=十字线+行（色点+索引名+该时刻 doc/s，与节点对比同语汇），
 行内索引名可点下钻（ 闭环保留）。 */
const topRows = ref<any[]>([]);
const topView = usePref<'curve' | 'table'>('ld.topView', 'curve');
/* 896：三指标会话序列（写入 idxRate + 查询 qps + 查询延迟 lat 同源累积，快照同源）——
 topMetric 切换曲线读哪支，统计表随指标换算（对标阿里云 index bulk 写入 tps/index 查询 qps/
 索引端到端查询延迟三卡）；topLimit=快照拉取宽度参数化（服务端 limit 钳 1..20） */
const topMetric = usePref<'idx' | 'qps' | 'lat'>('ld.topMetric', 'idx');
const topLimit = usePref<number>('ld.topLimit', 8);
const topIndexSeries = ref<Record<string, { idx: number[]; qps: number[]; lat: number[] }>>({});
const topTsArr = ref<number[]>([]);
/* 当前曲线集=最新快照 Top N（按当前指标排序，与统计表同序）映射到会话累积序列；色按排序位锚定 */
const topCurves = computed(() => {
  const metric = topMetric.value;
  return topRows.value
    .slice()
    .sort((a: any, b: any) => (Number(b?.[metric]) || 0) - (Number(a?.[metric]) || 0))
    .slice(0, topLimit.value)
    .map((t: any, i: number) => {
      const k = t.cluster + '|' + t.index;
      const rec = topIndexSeries.value[k] || { idx: [], qps: [], lat: [] };
      const data = metric === 'idx' ? rec.idx : metric === 'qps' ? rec.qps : rec.lat;
      return { key: k, name: t.index, cluster: t.cluster, connId: t.connId, cur: Number(t[metric]) || 0, color: CMP_PALETTE[i % CMP_PALETTE.length], data };
    });
});
/* 逐序列窗内统计（阿里云 min/max/avg/current 表同形态）：按当前指标值降序 */
const topStatRows = computed(() => topCurves.value
  .filter(s => s.data.length)
  .map(s => {
    const vals = s.data;
    const sum = vals.reduce((a, b) => a + b, 0);
    /* 1194：带出 index/connId——统计行与 Top 表看的是同一个索引，右键菜单整段复用
       （openLdRowMenu 'top' 分支读 row.index / row.connId），缺了这两个键菜单会复制空名。 */
    return {
      key: s.key, name: s.name, index: s.name, cluster: s.cluster, connId: s.connId,
      min: Math.min(...vals), max: Math.max(...vals), avg: sum / vals.length, cur: s.cur,
    };
  })
  .sort((a, b) => b.cur - a.cur));
const topHasData = computed(() => topCurves.value.some(s => s.data.length > 1));
/* 悬浮读出（sparkHoverAt 同源，abs 档） */
const topHit = ref<SparkHoverHit | null>(null);
function onTopMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null;
  /* frac 分母=绘图域内壳（36px 让位后与 wrap 差一列），用 wrap 宽会把命中整体压小 */
  const inner = el?.querySelector('.ld-cmp-inner');
  const rect = (inner ?? el)?.getBoundingClientRect();
  const frac = rect && rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const base = topCurves.value.find(s => s.data.length > 1);
  /* 件1：Y 向跟手（指针 y 相对图区钳位） */
  const y = rect ? Math.min(Math.max(e.clientY - rect.top, 14), rect.height - 14) : 0;
  const topRes = base ? sparkHoverAt(base.data, topTsArr.value, frac, CMP_W, CMP_H, 'abs') : null;
  topHit.value = topRes ? { ...topRes, y: y ?? 0 } : null;
}
function onTopLeave() { topHit.value = null; }
useHoverEscape(
  () => topHit.value != null,
  (e) => {
    const el = topPlotEl.value;
    if (!el) return true;
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  },
  onTopLeave,
);
const topReadRows = computed(() => {
  const hit = topHit.value;
  if (!hit) return [];
  return topCurves.value
    .filter(s => s.data.length > hit.i)
    .map(s => ({ ...s, v: Math.round(s.data[hit.i]) }));
});
const topLeft = (frac: number) => (frac * 100).toFixed(2) + '%';
const topShift = (frac: number) => frac > 0.72 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)';
/* ══ 件1：Top 曲线图表底座（截图实报「不符合」=白板图根治；对标 Grafana time series）══
 网格线四档+Y 中间刻度（全局 max 同坐标系——多折线各按自身 max 归一是 794 既有形态，
 底座刻度要有意义必须全局 scaleMax，sparklinePoints 可选参零破坏既有消费面）+X 时间三锚。 */
const GRID_YS = [0.25, 0.5, 0.75, 1] as const;
const topScaleMax = computed(() => {
  let mx = 0;
  for (const s of topCurves.value) for (const v of s.data) if (v > mx) mx = v;
  return mx;
});
/* 返回 Pt[]（Top viewBox 同 720×CMP_H；topScaleMax 全局归一保留）供 catmullRomPath 消费 */
function topPlotPts(data: number[]): Pt[] {
  const mx = topScaleMax.value || Math.max(...data, 1);
  const n = data.length;
  return data.map((v, i) => ({ x: (CMP_W * i) / Math.max(n - 1, 1), y: CMP_H - (v / mx) * CMP_H }));
}
const topYTicks = computed(() => {
  const mx = topScaleMax.value;
  return [mx, Math.round(mx * 0.75), Math.round(mx * 0.5), Math.round(mx * 0.25)].map(v => fmtNum(v));
});
const TOP_XT_POS = ['4%', '50%', '96%'] as const;
const topXTs = computed(() => {
  const a = topTsArr.value;
  if (a.length < 2) return [] as string[];
  return [fmtTime(a[0]), fmtTime(a[Math.floor((a.length - 1) / 2)]), fmtTime(a[a.length - 1])];
});
/* ══ 件2：导出 ⋯ 收纳（铁律 C：低频动作收菜单；三视图共用一个 details+按 detailTab 分发）══ */
const detailMoreEl = ref<HTMLDetailsElement | null>(null);
const detailMoreSumEl = ref<HTMLElement | null>(null);
function onDetailMoreToggle() {
  if (detailMoreEl.value?.open) window.addEventListener('keydown', onDetailMoreEsc, true);
  else window.removeEventListener('keydown', onDetailMoreEsc, true);
}
/* Esc 收口对齐同页 .ld-hist-more 形态：截断传播（全屏态下防事件落进 document 捕获级
 退全屏监听=一次 Esc 关两层）+焦点回触发钮；卸载摘卸对称防开着层时卸载泄漏 */
function onDetailMoreEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !detailMoreEl.value?.open) return;
  e.stopPropagation();
  detailMoreEl.value.open = false;
  detailMoreSumEl.value?.focus();
  window.removeEventListener('keydown', onDetailMoreEsc, true);
}
onBeforeUnmount(() => window.removeEventListener('keydown', onDetailMoreEsc, true));
function copyDetail(fmt: 'tsv' | 'md') {
  if (detailMoreEl.value?.open) detailMoreEl.value.open = false;
  if (detailTab.value === 'top') copyTop(fmt);
  else if (detailTab.value === 'slow') copySlow(fmt);
  else copyAlertHist(fmt);
}
const detailCanExport = computed(() => {
  if (detailTab.value === 'top') return !nodeMode.value && topRows.value.length > 0;
  if (detailTab.value === 'slow') return slowRows.value.length > 0;
  return alertHistRows.value.length > 0;
});
/* Z1：toggleTop/toggleSlow 函数随 CollapsePanel v-model:open 合并退役——
 首开懒加载语义保留（watch open 起手拉取，与旧 toggle 内 if 分支等价） */
/* ═══ 1158：监控屏三表行右键（Top 索引 / 慢请求 / 告警历史）═══
 一级 = 该行最常用的一步（慢请求=复制 URI；告警=复制文案；Top=在数据浏览器打开）；
 复制整行 JSON 与其余项收进「复制…」二级（与全站卡片菜单同一两级语言）。
 只读视图：不提供任何写动作，避免监控屏变成误操作面。 */
type LdMenuKind = 'top' | 'slow' | 'alert' | 'node' | 'node-card' | 'active-alert';
const ldMenu = ref<{ x: number; y: number; title: string; kind: LdMenuKind; row: any } | null>(null);
function openLdRowMenu(e: MouseEvent, kind: LdMenuKind, row: any) {
  const title = kind === 'top' ? `索引 · ${row.index}`
    : kind === 'slow' ? `慢请求 · ${row.uri || '-'}`
    : kind === 'node' ? `节点 · ${row.nodeName || row.connId || '-'}`
    : kind === 'node-card' ? `节点 · ${row.name || row.nodeId || '-'}`
    : kind === 'active-alert' ? `告警 · ${row.title || row.key || '-'}`
    : `告警 · ${metricZh(row.metric)}`;
  ldMenu.value = { x: e.clientX, y: e.clientY, title, kind, row };
}
/* 节点卡/活动告警的键盘入口：Enter/Space 走原主操作，菜单键/Shift+F10 开菜单 */
function onLdCardKey(e: KeyboardEvent, kind: 'node-card' | 'active-alert', row: any) {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    ldMenu.value = { x: r.left + 12, y: r.bottom, kind, title: kind === 'node-card' ? `节点 · ${row.name || row.nodeId || '-'}` : `告警 · ${row.title || row.key || '-'}`, row };
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (kind === 'node-card') router.push({ path: '/diag', query: { node: row.name } });
    else alertRoute(row);
  }
}
const ldMenuItems = computed<CcmItem[]>(() => {
  const m = ldMenu.value; if (!m) return [];
  const row = m.row;
  const json = JSON.stringify(row, null, 2);
  const copy = async (text: string, ok: string) => {
    const done = await copyText(text);
    store.notify(done ? 'success' : 'error', done ? ok : '复制失败');
  };
  const copyGroup: CcmItem = {
    key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
      { key: 'copy-json', label: '复制整行 JSON', icon: Braces, run: () => void copy(json, '已复制整行 JSON') },
      { key: 'copy-tsv', label: '复制为 TSV（可直接贴表格）', icon: Copy, run: () => {
        const vals = Object.values(row).map(v => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)));
        void copy(vals.join('	'), '已复制该行（TSV）');
      } },
    ],
  };
  if (m.kind === 'top') {
    return [
      { key: 'open-browser', label: '在数据浏览器打开该索引', icon: ExternalLink, run: () => gotoBrowser(row) },
      { key: 'browse-index', label: '在索引工作区查看', icon: Braces, run: () => {
        if (row.connId && !auth.canSeeConn(row.connId)) { store.notify('warning', '暂无该连接的访问权限'); return; }
        if (row.connId && row.connId !== store.target) store.setTarget(row.connId, row.clusterName ?? row.cluster ?? row.connId);
        store.pick(row.index);
        router.push('/indices');
      } },
      { key: 'copy-index', label: '复制索引名', icon: Copy, sep: true, run: () => void copy(String(row.index ?? ''), '已复制索引名：' + row.index) },
      copyGroup,
    ];
  }
  if (m.kind === 'slow') {
    return [
      { key: 'copy-uri', label: '复制 URI', icon: Copy, run: () => void copy(String(row.uri ?? ''), '已复制 URI') },
      { key: 'copy-curl', label: '复制为 cURL', icon: ExternalLink, run: () => {
        const conn = row.connName || row.connId || '当前集群';
        const curl = `curl -X${String(row.method || 'GET').toUpperCase()} '<${conn}>${row.uri || '/'}' -H 'Content-Type: application/json'`;
        void copy(curl, '已复制 cURL');
      } },
      copyGroup,
    ];
  }
  if (m.kind === 'node') {
    /* 1195：节点水位行。一级只留「最常用的一步」——复制节点名（下游所有排查都从它开始：
       贴进节点详情 URL、发给同事、填进告警规则）；水位三项与整行 JSON 收进二级「复制…」。
       监控面只读：动作只有 copy 一类。 */
    const node = String(row.nodeName || row.connId || '');
    return [
      { key: 'copy-node', label: '复制节点名', icon: Copy, run: () => void copy(node, '已复制节点名：' + node) },
      { key: 'copy-levels', label: '复制水位（Heap / CPU / 磁盘）', icon: Copy, run: () => {
        /* 与表格同口径：后端 heapUsedPct/cpuPct/diskUsedPct 已是 0–100 的百分数
           （jvm.mem.heap_used_percent / os.cpu.percent 直取），不要再乘 100。 */
        void copy(`${node}  heap=${fmtN(row.heapUsedPct)}  cpu=${fmtN(row.cpuPct)}  disk=${fmtN(row.diskUsedPct)}`, '已复制该节点水位');
      } },
      copyGroup,
    ];
  }
  if (m.kind === 'node-card') {
    return [
      { key: 'node-card-open', label: '打开节点诊断', icon: ExternalLink, run: () => { void router.push({ path: '/diag', query: { node: row.name } }); } },
      {
        key: 'node-card-copy', label: '复制…', icon: Copy, children: [
          { key: 'node-card-name', label: '复制节点名', icon: Copy, run: () => void copy(String(row.name ?? ''), '已复制节点名') },
          { key: 'node-card-id', label: '复制节点 ID', icon: Copy, run: () => void copy(String(row.nodeId ?? ''), '已复制节点 ID') },
          { key: 'node-card-role', label: '复制角色', icon: Copy, run: () => void copy(roleLabel(row), '已复制角色') },
        ],
      },
    ];
  }
  if (m.kind === 'active-alert') {
    return [
      { key: 'alert-go', label: '定位到处置', icon: ExternalLink, run: () => alertRoute(row) },
      {
        key: 'alert-copy', label: '复制…', icon: Copy, children: [
          { key: 'alert-copy-title', label: '复制告警标题', icon: Copy, run: () => void copy(String(row.title ?? ''), '已复制告警标题') },
          { key: 'alert-copy-key', label: '复制告警键', icon: Copy, run: () => void copy(String(row.key ?? ''), '已复制告警键') },
          { key: 'alert-copy-threshold', label: '复制阈值', icon: Copy, run: () => void copy(String(row.threshold ?? ''), '已复制阈值') },
        ],
      },
    ];
  }
  return [
    { key: 'copy-msg', label: '复制告警文案', icon: Copy, run: () => void copy(String(row.message ?? ''), '已复制告警文案') },
    { key: 'copy-metric', label: `复制指标名（${metricZh(row.metric)}）`, icon: Braces, sep: true, run: () => void copy(String(row.metric ?? ''), '已复制指标名') },
    copyGroup,
  ];
});

function gotoBrowser(t: any) {
  /* 963：下钻换集群必须走 store.setTarget——裸 setTargetId 只改数据面，SideNav 授权过滤/页面门/
   router key 仍停在旧目标（切过去落在未授权页=403 死路）；setTarget 一并刷新目标名/清旧索引现场。
   切目标前再验一次连接授权：top 行可能残留旧授权期的数据。 */
  if (t.connId && !auth.canSeeConn(t.connId)) {
    store.notify('warning', '暂无该连接的访问权限');
    return;
  }
  if (t.connId && t.connId !== store.target) store.setTarget(t.connId, t.clusterName ?? t.cluster ?? t.connId);
  router.push({ path: '/browser', query: { idx: t.index } });
}
let topSeq = 0;
async function loadTop() {
  if (nodeMode.value) { topRows.value = []; return; }
  const seq = ++topSeq; // 世代计数：窗/筛选/明细档重入使旧拍作废（含会话累积段，旧拍不得推序列）
  const targets = clusterFilter.value ? [clusterFilter.value] : clusterList.value.slice(0, 10);
  try {
    const perCluster = clusterFilter.value ? topLimit.value : 3; /* ：合并视图每集群 Top 3 压缩同源重复（多档案同物理集群），选定单集群按 Top N 宽度拉全 */
    const rs = await Promise.all(targets.map(c => api.monitorTopIndexes(c, topLimit.value).catch(() => ({ records: [] }))));
    if (seq !== topSeq) return; // 旧拍回包丢弃：topRows 与序列累积整段跳过（新拍自会写入）
    topRows.value = rs.flatMap((r, i) => (r?.records || []).slice(0, perCluster).map((x: any) => ({ ...x, cluster: targets[i] })));
    /* 合并视图按索引名去重（.kibana_1 等同名系统索引跨集群重复是主要噪声；
 保留首个=速率最高的集群；选定单集群视图不受影响） */
    if (!clusterFilter.value) {
      const seen = new Set<string>();
      topRows.value = topRows.value.filter(t => (seen.has(t.index) ? false : (seen.add(t.index), true)));
    }
    /* 件2 会话累积：本拍所有在榜索引推序列（掉榜索引保留已积序列=曲线连续不断头）；
     写入/查询/延迟三支同源累积（topMetric 只决定读哪支） */
    const now = Date.now();
    topTsArr.value.push(now);
    for (const t of topRows.value) {
      const k = t.cluster + '|' + t.index;
      const rec = topIndexSeries.value[k] || (topIndexSeries.value[k] = { idx: [], qps: [], lat: [] });
      rec.idx.push(Number(t.idxRate) || 0);
      rec.qps.push(Number(t.qps) || 0);
      /*  延迟缺失（该拍无查询增量）= 保持上一拍读数（延迟语义：无流量时延住在原地，
       落 0 会制造「延迟归零」假尖谷） */
      rec.lat.push(t.latencyMs == null ? (rec.lat.length ? rec.lat[rec.lat.length - 1]! : 0) : Number(t.latencyMs));
    }
    const cap = Number(windowPts.value) || 60;
    if (topTsArr.value.length > cap) topTsArr.value.splice(0, topTsArr.value.length - cap);
    for (const rec of Object.values(topIndexSeries.value)) {
      if (rec.idx.length > cap) rec.idx.splice(0, rec.idx.length - cap);
      if (rec.qps.length > cap) rec.qps.splice(0, rec.qps.length - cap);
      if (rec.lat.length > cap) rec.lat.splice(0, rec.lat.length - cap);
    }
  } catch { if (seq === topSeq) topRows.value = []; }
}
/* Top 索引导出：TSV（表格粘贴）/MD（群聊工单直贴）双形态，matrixText 单源 */
async function copyTop(fmt: 'tsv' | 'md') {
  const cols = ['集群', '索引', '查询 QPS', '写入速率(doc/秒)', '存储(MB)'];
  const rows = topRows.value.map(t => [t.cluster, t.index, t.qps, t.idxRate, t.storeMb]);
  const ok = await copyText(matrixText({ rows, cols, getVal: (row: any[], c: string) => String(row[cols.indexOf(c)] ?? '') }, fmt));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 条 Top 索引（${fmt.toUpperCase()}）` : '复制失败');
}
/* 导出对称补全：告警历史/慢请求与 Top 索引同款 matrixText 单源 */
async function copyAlertHist(fmt: 'tsv' | 'md') {
  const cols = ['时间', '集群', '级别', '指标', '值', '阈值', '状态', '文案'];
  const rows = alertHistRows.value.map(a => [fmtTime(a.timestamp), a.connName || a.connId || '未知集群', a.level, metricZh(a.metric), srvAlertVal(a.value), typeof a.threshold === 'number' ? a.threshold : '-', a.recovered ? '已恢复' : '告警', a.message || '-']);
  const ok = await copyText(matrixText({ rows, cols, getVal: (row: any[], c: string) => String(row[cols.indexOf(c)] ?? '') }, fmt));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 条告警历史（${fmt.toUpperCase()}）` : '复制失败');
}
async function copySlow(fmt: 'tsv' | 'md') {
  const cols = ['时间', '用户', '集群', '方法', 'URI', '耗时(ms)', 'HTTP'];
  const rows = slowRows.value.map(r => [fmtTime(r.timestamp), r.username || '-', r.connName || r.connId || '-', r.method || '-', r.uri || '-', r.costMs ?? '-', r.httpStatus ?? '-']);
  const ok = await copyText(matrixText({ rows, cols, getVal: (row: any[], c: string) => String(row[cols.indexOf(c)] ?? '') }, fmt));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 条慢请求（${fmt.toUpperCase()}）` : '复制失败');
}
/* 等级分布计数（对标阿里云报警概览等级分布）：恢复行单列，其余按级别归桶 */
const alertCounts = computed(() => {
  let crit = 0, warn = 0, info = 0, recovered = 0;
  for (const a of srvAlerts.value) {
    if (a.recovered) { recovered++; continue; }
    if (a.level === 'CRIT') crit++; else if (a.level === 'WARN') warn++; else info++;
  }
  return { crit, warn, info, recovered };
});
/* 慢请求面板（对标阿里云慢查询日志 tab）：数据源=操作审计流水（已带耗时列，零新管道），
 minCostMs+时间窗下推服务端；仅 rank3+ 可见（全量审计权限同源） */
const slowThresholdMs = usePref<number>('live.slowMs', 1000);
const slowRows = ref<any[]>([]);
const slowLoading = ref(false);
const slowErr = ref('');
/* 件1：慢请求耗时 tone 档（阈值语义链单源——≥阈值×2 err 红=重灾；≥阈值×1.5 warn 黄=趋热；
 恰阈值=默认档不着色。「有多慢」一眼可读=节点卡水位 tone 同语言） */
function slowCostTone(costMs: number | null | undefined): '' | 'ld-cost-warn' | 'ld-cost-err' {
  const v = Number(costMs);
  const thr = Number.isFinite(Number(slowThresholdMs.value)) ? Number(slowThresholdMs.value) : 1000;
  if (!Number.isFinite(v) || v < thr) return '';
  if (v >= thr * 2) return 'ld-cost-err';
  if (v >= thr * 1.5) return 'ld-cost-warn';
  return '';
}
let slowSeq = 0;
async function loadSlow() {
  if (!auth.canAuditAll(store.target)) return;
  const seq = ++slowSeq; // 世代计数：窗/阈值重入使旧拍作废
  slowLoading.value = true;
  try {
    const fromMs = rangeMs.value.from;
    const r = await api.auth.opsAudit(undefined, undefined, 100, 0, undefined, undefined, undefined,
      Number.isFinite(Number(slowThresholdMs.value)) ? Number(slowThresholdMs.value) : 1000, fromMs, rangeMs.value.to);
    if (seq !== slowSeq) return; // 旧拍慢请求回包丢弃
    const thr = Number.isFinite(Number(slowThresholdMs.value)) ? Number(slowThresholdMs.value) : 1000;
    slowRows.value = (r?.records || []).filter((x: any) => (x.costMs ?? 0) >= thr);
    slowErr.value = '';
  } catch (e: any) {
    if (seq !== slowSeq) return; // 旧拍失败不得覆盖新拍错误位
    slowErr.value = friendlyEsError(String(e?.message ?? e));
  }
  finally { if (seq === slowSeq) slowLoading.value = false; } // 过期回包不熄新拍在途 spinner
}
/* 历史自动刷新（对标阿里云自动刷新开关）：复用 useAutoRefresh 全生命周期
 （页面隐藏/KeepAlive 失活自动停续），tick guard=加载中互斥；偏好记忆 live.histAuto 默认关 */
const histAutoMs = usePref<number>('live.histAuto', 0);
/* 1125：轮询同样过身份门——宿主换 token 的窗口里 tick 会带旧 target 拉监控曲线；
   本拍不放行就跳过，下一拍身份到位自然恢复（轮询不需要挂起重试）。 */
const liveReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('live', store.target));
const { setOn: histAutoSetOn } = useAutoRefresh(() => {
  if (!liveReady()) return;
  void loadHist(); if (detailShows('slow')) void loadSlow();
}, {
  ms: () => Number(histAutoMs.value) || 0,
  guard: () => !histLoading.value,
});
function onHistAutoChange() { histAutoSetOn(Number(histAutoMs.value) > 0); }
if (Number(histAutoMs.value) > 0) histAutoSetOn(true);
/* 2.1.4：存量非法档归一（同视图档硬化的原则）——坏值不再原样送 API/空白下拉 */
const MH_RANGE_KEYS = ['1h', '6h', '24h', '3d', '7d', '14d', 'custom'] as const;
const mh2RangePref = usePref<string>('live.histRange', '24h');
const mh2Range = computed<typeof MH_RANGE_KEYS[number]>({
  get: () => normalizePrefEnum(mh2RangePref.value, MH_RANGE_KEYS, '24h'),
  set: v => { mh2RangePref.value = v; },
});
/* 自定义时间档：起止 datetime-local（毫秒解析）；rangeMs 单源——曲线/告警/慢请求三消费点同窗，
 custom 档非法/缺省端点回落 now，非 custom 档维持 MH_RANGE_MS 固定窗 */
const customFrom = ref('');
const customTo = ref('');
const rangeMs = computed(() => {
  if (mh2Range.value === 'custom') {
    const f = Date.parse(customFrom.value);
    if (Number.isFinite(f)) {
      const t = Date.parse(customTo.value);
      return { from: f, to: Number.isFinite(t) ? t : Date.now() };
    }
  }
  return { from: Date.now() - (MH_RANGE_MS[mh2Range.value] ?? MH_RANGE_MS['24h']), to: Date.now() };
});
/* 聚合方式（avg 缺省|max）：随取数下推服务端子聚合，桶记录字段名不变前端零改动；
 max 桶捕捉瞬时尖峰（heap 突刺等），对标阿里云每卡聚合切换（我们收敛为区头全局一档） */
const mhAggPref = usePref<string>('live.histAgg', 'avg');
const mhAgg = computed<'avg' | 'max'>({
  get: () => normalizePrefEnum(mhAggPref.value, ['avg', 'max'] as const, 'avg'),
  set: v => { mhAggPref.value = v; },
});
/* 分组导航偏好（对标阿里云「分组: 概览」；默认 overview=pass-through）。
 铁律 B：切集群/切观察口径/切时间范围**均不得改写本偏好**——故它不进下方重查 watch，
 全程只在用户点 seg 时被赋值（spec 反锁：源码不得出现第二次 `histGroup.value =`）。 */
const histGroup = usePref<HistGroupKey>('live.histGroup', 'overview');
/* 分组 seg 的滑动指示器激活索引（等宽钮下与 segPillStyle 等分几何配套） */
/* 入场编排触发位（挂载后下一帧翻真，保证初态先渲染再起过渡；622 ） */
const pageIn = ref(false);
const histGroupIdx = computed(() => Math.max(0, HIST_GROUPS.findIndex(g => g.key === histGroup.value)));
const clusterFilter = ref('');
/* （观察口径=集群维度——历史趋势筛选跟随顶部集群切换器（target→conns 实名，
 纪律实名下推禁 connId）；用户可手动切「全部集群」做跨集群对比，仅同 target 内不回弹，
 切换器再换集群时重新跟随。实时区本就按 target 隔离（快照键），历史区同口径后全页一致。 */
const connNameOfTarget = computed(() => store.conns.find(c => c.id === store.target)?.name || '');
watch(connNameOfTarget, (name) => { if (name) clusterFilter.value = name; }, { immediate: true });
/* 件4：按节点默认开启（「按节点藏太深，按节点应该是默认效果」）——usePref 落盘
 老用户已显式关过则尊重偏好；新会话/新用户默认 true=选中集群即节点叠加 */
const byNode = usePref<boolean>('live.byNode', true);
/* nodeMode 单源：byNode 开且集群已选定才真下钻——清空集群即回集群视图（checkbox 联动回弹） */
const nodeMode = computed(() => byNode.value && !!clusterFilter.value);
/* 批内勘正：nodeMode 立真后 detailTab stale 'top'=seg 摘 Top+body 无分支命中双空壳
 （HEAD 潜伏，byNode 默认开=默认可见）——immediate 规范到告警历史，与 switchDetail 回落语义同源 */
watch(nodeMode, (nm) => { if (nm && detailTab.value === 'top') detailTab.value = 'alert'; }, { immediate: true });
/* 件2：Top 索引随自动刷新推进（治旧注释宣称与实况不符——原只在范围/首开触发）；
 watch 置于 clusterFilter/nodeMode 声明后（getter 立即求值撞后置声明 TDZ 的教训）；
 每拍快照落 topRows 同时累积 per-index 序列（窗长钳制 windowPts） */
watch(() => sampleTs.value.length, () => { if (detailShows('top') && !nodeMode.value) void loadTop(); });
watch([windowPts, () => clusterFilter.value, () => nodeMode.value, topLimit], () => {
  /* 清场即世代推进：在途集群拍 Top 回包已越过发起时的节点态早退，seq 不推进则回包
   照写 topRows 并重推刚清空的会话序列（旧拍穿透清场） */
  if (nodeMode.value) { topSeq++; topIndexSeries.value = {}; topTsArr.value = []; }
  if (detailShows('top')) void loadTop();
});
const MH_RANGE_MS: Record<string, number> = { '1h': 3.6e6, '6h': 2.16e7, '24h': 8.64e7, '3d': 2.592e8, '7d': 6.048e8, '14d': 1.2096e9 };
/* 降采样档位单源：范围档→interval（1h→1m…7d→30m，未知回落 5m）随取数下推——
 服务端走 ES date_histogram 降采样桶（timestamp 升序/桶距恒定/空桶也在但字段缺省），
 大范围不再逐点拉爆 size 上限；断档阈值=3 倍桶距（下方 :gap-ms 接线同源） */
/* 周期档（对标阿里云每卡头「(周期:1分钟)」；626 裁决 D8「周期」半边，零 Java 改动）。
 覆盖既有隐式推导 mh2Interval＝聚合粒度的显式出口；偏好落 usePref（跨会话记忆）。
 档位：自动（按范围）| 原始逐点 | 1m | 5m | 15m | 30m | 1h。
 ⚠不提供 30 秒档：采集默认 60s、下限 30s（ClusterMetricsCollector.java / ESQueryStudioElasticsearchProperties.java），
 30 秒桶在默认配置下产半空桶（一行有值一行缺省）——不是降采样，是「给读者一个不存在的刻度」。 */
const histPeriod = usePref<string>('live.histPeriod', 'auto');
const MH_PERIODS = ['1m', '5m', '15m', '30m', '1h'];
/* 原始逐点 span 守卫：原始查询（不传 interval）在服务端钳 size=3000 + 时间升序，窗口越宽越先取满
 前 3000 行 → 图右端最新点被挡在窗外。3000×60s ≈ 50h（MH_RAW_SPAN_MS 单源）→ 超限不安全，
 自动回落「自动」并写回偏好（select 随之上显；option 同步禁用 + title 说明原因）。 */
const histRawSafe = computed(() => rawPeriodSafe(rangeMs.value.to - rangeMs.value.from));
watch(histRawSafe, ok => { if (!ok && histPeriod.value === 'raw') histPeriod.value = 'auto'; }, { immediate: true });
/* 周期档 → 取数 interval：auto（及未知档容错）= intervalFor(range) 现行为零变更；
 raw = undefined（api.q() 对 undefined 自动跳参＝controller 原始查询路径）；
 1m/5m/15m/30m/1h = 显式 date_histogram 桶宽字符串。 */
const mh2Interval = computed<string | undefined>(() => {
  const p = histPeriod.value;
  if (p === 'raw') return histRawSafe.value ? undefined : intervalFor(mh2Range.value);
  if (MH_PERIODS.includes(p)) return p;
  return intervalFor(mh2Range.value); /* auto（及未知档）= 现行为 */
});
/* ：断档阈值跟「生效 interval」而非时间范围——选比范围默认更粗的周期
 （如 24h 范围选 1h 桶）时，实际取数用 1h 桶、gap 若仍按范围（5m）推导会让 HistoryChart
 误判相邻 1h 点为断档、走势退化为孤点。原始逐点档（interval=undefined）回采集默认 60s。 */
const mh2GapMs = computed(() => (mh2Interval.value ? fixedIntervalMs(mh2Interval.value) : 60_000) * 3);
const histPeriodTitle = '聚合粒度（周期）：自动＝按时间范围推导桶宽；原始逐点＝不降采样（受 50 小时安全窗约束）；其余＝固定桶宽';
const histRawTitle = computed(() => histRawSafe.value
  ? '原始逐点：不传 interval，逐条原始采样（当前时间跨度在 50 小时安全窗内）'
  : '原始逐点：当前时间跨度超过 50 小时安全窗（原始查询 size 钳 3000 会丢最新点），已自动回落「自动」');
const HIST_COLORS = ['var(--dv-blue)', 'var(--ok)', 'var(--wn)', 'var(--err)', 'var(--ac)'];
const HIST_CHARTS: { field: MonitorSeriesField; label: string; unit: string; onlyNodeMode?: boolean; onlyClusterMode?: boolean; threshold?: number }[] = [
  /* onlyClusterMode=集群 doc 专属指标，节点下钻时无意义（node doc 无此字段）→ 整卡隐藏，
 不再挂「暂无采样」假空态（真机走查发现） */
  { field: 'qps', label: 'QPS', unit: '/s', onlyClusterMode: true },
  { field: 'indexRate', label: '写入速率', unit: 'doc/s', onlyClusterMode: true },
  { field: 'heapUsedPct', label: 'Heap %', unit: '%', threshold: 80 },
  { field: 'cpuPct', label: 'CPU %', unit: '%', threshold: 75 },
  { field: 'diskUsedPct', label: '磁盘 %', unit: '%', threshold: 80 },
  /* R3：线程池拒绝增量（次/分）——正常恒 0，出现非零=写入/搜索队列被打满（提前于 RED 的前兆信号） */
  { field: 'writeRejected', label: '写入拒绝（次/分）', unit: '', onlyClusterMode: true },
  { field: 'searchRejected', label: '搜索拒绝（次/分）', unit: '', onlyClusterMode: true },
  /* R8：GC 频次差分（次/分）——node doc 专属字段，集群态不聚合：标 onlyNodeMode 仅节点下钻渲染 */
  { field: 'gcYoungPerMin', label: 'Young GC（次/分）', unit: '', onlyNodeMode: true, threshold: 10 },
  /* R9：慢查询代理指标（ms/次）——查询耗时突增常先于容量问题，与实时大屏数值互补 */
  { field: 'searchLatencyMs', label: '查询耗时', unit: 'ms', onlyClusterMode: true },
  { field: 'indexingLatencyMs', label: '索引耗时', unit: 'ms', onlyClusterMode: true },
  /* 节点深耕（对标阿里云基础监控节点级指标）：线程池即时值=队列打满前兆；
 磁盘带宽/IOPS=fs.io_stats 差分（首轮/回退缺省）；Load_1m=os 负载——均 onlyNodeMode */
  { field: 'tpSearchActive', label: '查询线程池活跃（个）', unit: '', onlyNodeMode: true },
  { field: 'tpSearchQueue', label: '查询线程池排队（个）', unit: '', onlyNodeMode: true },
  { field: 'diskReadKbS', label: '磁盘带宽·读', unit: 'KiB/s', onlyNodeMode: true },
  { field: 'diskWriteKbS', label: '磁盘带宽·写', unit: 'KiB/s', onlyNodeMode: true },
  { field: 'diskReadIops', label: '磁盘 IOPS·读（次/秒）', unit: '', onlyNodeMode: true },
  { field: 'diskWriteIops', label: '磁盘 IOPS·写（次/秒）', unit: '', onlyNodeMode: true },
  { field: 'load1m', label: 'Load_1m', unit: '', onlyNodeMode: true },
  /* 内部传输吞吐（transport rx/tx 差分）：节点间通信量（非 HTTP 流量），
 跨节点复制/分片迁移打满内网时此卡可见尖峰 */
  { field: 'netRxKbS', label: '内部传输·收（KiB/s）', unit: 'KiB/s', onlyNodeMode: true },
  { field: 'netTxKbS', label: '内部传输·发（KiB/s）', unit: 'KiB/s', onlyNodeMode: true },
  /* 对标阿里云集群级指标卡：分片总数/主分片数（health 字段，平缓量但容量规划要看得见） */
  { field: 'shards', label: '分片总数', unit: '', onlyClusterMode: true },
  { field: 'primaryShards', label: '主分片数', unit: '', onlyClusterMode: true },
  /* 对标阿里云集群级「索引数量」：cluster doc 既有键（AGG_METRIC_FIELDS 同在），此前未画卡 */
  { field: 'indices', label: '索引数量', unit: '', onlyClusterMode: true },
  /* 可搜索文档总数（_cluster/stats docs.count，Wave B；对标阿里云索引指标组） */
  { field: 'docsTotal', label: '可搜索文档总数', unit: '', onlyClusterMode: true },
  /* 对标阿里云线程池 Rows（写入侧）+被标记删除文档：force_merge 需求判定信号（docsDeleted 持续走高=该 merge 了） */
  { field: 'tpWriteActive', label: '写入线程池活跃', unit: '', onlyNodeMode: true },
  { field: 'tpWriteQueue', label: '写入线程池排队', unit: '', onlyNodeMode: true },
  /* 对标阿里云 Force Merge 线程池三件（Wave B）：merge 风暴/拒绝前兆观测 */
  { field: 'tpForceMergeActive', label: 'Force Merge 运行', unit: '', onlyNodeMode: true },
  { field: 'tpForceMergeQueue', label: 'Force Merge 排队', unit: '', onlyNodeMode: true },
  { field: 'tpForceMergeRejected', label: 'Force Merge 拒绝', unit: '', onlyNodeMode: true },
  { field: 'docsDeleted', label: '被标记删除文档', unit: '', onlyNodeMode: true },
  /* 对标阿里云 IOUtil(%) 与「节点 Young/Old GC 耗时(ms)」：差分测点三卡 */
  { field: 'ioUtilPct', label: 'IOUtil', unit: '%', onlyNodeMode: true },
  { field: 'gcYoungTimeMs', label: 'Young GC 耗时', unit: 'ms', onlyNodeMode: true },
  { field: 'gcOldTimeMs', label: 'Old GC 耗时', unit: 'ms', onlyNodeMode: true },
  /* Old GC 频次（gcOldPerMin 字段既有未画卡；G1 旧代采集器≈FullGC 口径，对标阿里云 FullGc 次数） */
  { field: 'gcOldPerMin', label: 'Old GC 频次', unit: '', onlyNodeMode: true },
  /* 对标阿里云 JVM 组「Old 区使用」锯齿形态：堆字节量 MB 直读 GC 回收幅度 */
  { field: 'heapUsedMb', label: 'Heap 使用（MB）', unit: 'MB', onlyNodeMode: true },
  /* 对标阿里云 JVM 组「fielddata 内存使用」：查询抖动经典根因观测 */
  { field: 'fielddataMb', label: 'fielddata 内存', unit: 'MB', onlyNodeMode: true },
  /* Wave B：OS 侧内存%（区别 JVM heap）/ ES 业务进程 CPU%（区别 OS 总 CPU）/ 剩余可用存储 */
  { field: 'osMemUsedPct', label: '内存使用率（OS）', unit: '%', onlyNodeMode: true },
  { field: 'esCpuPct', label: 'CPU 使用率（ES 业务）', unit: '%', onlyNodeMode: true },
  { field: 'fsAvailMb', label: '剩余可用存储', unit: 'MB', onlyNodeMode: true },
];

let histSeq = 0;
async function loadHist() {
  const seq = ++histSeq; // 世代计数：时间窗/集群筛选/节点模式/聚合档任一重入都使旧拍全链作废
  /* R7 服务端告警并行拉取：时间窗与曲线取数同域（ 事件标记与图卡时间轴对齐），
 先发不 await（不阻塞曲线取数），独立失败静默（空集=「无活动告警」） */
  const histFromMs = rangeMs.value.from;
  void api.monitorAlerts(100, histFromMs, rangeMs.value.to)
    .then(res => {
      if (seq !== histSeq) return; // 旧拍告警标记不得覆盖新窗
      /* 连接隔离已在后端 /monitor-alerts 行级完成；聚合行无 connId，前端不得再按目标猜测 */
      srvAlerts.value = res?.records || [];
    })
    .catch(() => {});
  histLoading.value = true; histErr.value = '';
  try {
    const nodeFallback = nodeMode.value && pureConnModel.value
      ? (clusterList.value[0]
        || store.conns.find(c => auth.canSeeConn(c.id))?.name
        || (auth.canSeeConn('host') ? connNameOfTarget.value : ''))
      : '';
    const res = await api.monitorMetrics({
      scope: nodeMode.value ? 'node' : 'cluster',
      /* 修复：下拉值=集群实名，传 connName 下推（原误传 connId 恒空）；
         纯连接节点模式无筛选时默认首个可见集群（后端禁止无标识节点聚合） */
      connName: clusterFilter.value || nodeFallback || undefined,
      fromMs: histFromMs,
      toMs: rangeMs.value.to, /* ：custom 档终点下推（固定档=now 与现状等价） */
      size: 3000,
      interval: mh2Interval.value, /* 降采样桶记录；空桶字段缺省由 buildSeries 剔点天然消化 */
      agg: mhAgg.value, /* 聚合方式下推（avg|max） */
    });
    if (seq !== histSeq) return; // 旧拍曲线回包丢弃
    /* 连接隔离由后端 /monitor-metrics 行级完成：聚合行只有 connName/nodeName，
       前端再按 connId 猜会把所有连接模型用户的行误删。 */
    let records: MonitorMetricsRecord[] = res?.records || [];
    if (nodeMode.value) {
      /* 节点下钻：connName 映射 nodeName 后复用 buildSeries 单源（序列名=节点名，
 HistoryChart 图例/调色板随之按节点锚定） */
      records = records.map(r => ({ ...r, connName: r.nodeName || r.connName || r.connId }));
    } else {
      clusterList.value = clustersOf(records);
    }
    hist.value = records;
  } catch (e: any) {
    if (seq !== histSeq) return; // 旧拍失败不得覆盖新窗错误位
    histErr.value = friendlyEsError(String(e?.message ?? e));
  } finally {
    if (seq === histSeq) histLoading.value = false; // 过期回包不熄新拍在途 spinner
  }
  if (seq !== histSeq) return; // 旧拍不再拉治理条（新拍自会拉）
  /* R6 治理条独立拉取（失败静默隐藏，不影响曲线） */
  try {
    ring.value = await api.ringUsage();
  } catch { ring.value = null; }
}

function fmtGB(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(2) + 'GB';
}
const ringPct = computed(() => {
  const r = ring.value;
  if (!r || r.capBytes <= 0) return 0;
  return Math.min(100, Math.round(r.totalBytes / r.capBytes * 1000) / 10);
});

/* R2 断链 RED 色带：断链轮采集器落 status=red doc（无指标字段=折线自然断档），
 redBands 把连续 red 采样合成时段带传给图卡——「集群红了」与「没采到」视觉分家 */
const statusBands = computed(() => redBands(hist.value).map(b => {
  const cause = hist.value.find(r => r.status === 'red' && r.error
    && r.timestamp >= b.from && r.timestamp <= b.to);
  return { ...b, label: cause?.error ? '集群失联：' + cause.error : '集群失联时段' };
}));

/* 告警事件标记：服务端告警（未恢复的 CRIT/WARN）落图卡事件轴——
 超限瞬间的菱形标记与曲线/色带同时间域，悬停 title 可读事件文案 */
const chartEvents = computed(() => srvAlerts.value
  .filter(a => !a.recovered && (a.level === 'CRIT' || a.level === 'WARN'))
  .map(a => ({
    t: a.timestamp,
    label: `${a.connName || a.connId || '集群'} ${a.metric}${a.value != null ? '=' + a.value : ''} ${a.message || ''}`.replace(/\s+/g, ' ').trim(),
    level: a.level,
  })));

/* R4 节点一览行集（仅节点下钻模式有值；latestByNode 单源=每节点最新一条） */
const nodeRows = computed(() => latestByNode(hist.value));
/* 质感：长节点 ID（未设 node.name 的集群）截短展示，title 悬停看全量 */
function shortNode(name: string): string {
  return name && name.length > 18 ? name.slice(0, 10) + '…' + name.slice(-6) : name;
}
function fmtN(v: number | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '-';
}

/* 集群清单（筛选下拉单源）：只在集群态负载刷新——节点态 records 的 connName 已是节点名，
 不能反把下拉污染成节点列表 */
function clustersOf(records: MonitorMetricsRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const n = r.connName || r.connId;
    if (n) set.add(n);
  }
  return [...set].sort();
}
const clusterList = ref<string[]>([]);
/* 下拉选项并入 target 实名兜底——clusterList 由历史拉取异步回填，晚于跟随 watch 时
 options 会瞬时缺当前集群（select 显示回落''）；兜底后选项恒含当前观察口径集群 */
const histClusters = computed<string[]>(() => {
  const set = new Set(clusterList.value);
  /* 当前目标也必须是授权连接：深链/旧 localStorage 目标不得把未授权集群名带进下拉 */
  if (connNameOfTarget.value && auth.canSeeConn(store.target || 'host')) set.add(connNameOfTarget.value);
  return [...set];
});

/* 五张图卡：series=剔点后 NamedSeries 单源；Heap 传阈值（METRIC_THRESHOLDS 单源），
 阈值虚线/统计条/图例/tooltip 全由 HistoryChart 内化 */
const histCharts = computed(() => HIST_CHARTS
  /* R8：onlyNodeMode 项（GC 差分）仅节点下钻渲染，集群态过滤掉（服务端无该聚合口径）；
 拒绝图卡的 allClean 健康态一句话逻辑不受影响（过滤在先、健康态判定在后，各自独立） */
  .filter(m => (!m.onlyNodeMode || nodeMode.value) && (!m.onlyClusterMode || !nodeMode.value))
  /* 分组导航过滤（用户主动）——**必须追加在 scope 过滤之后**：
 先按数据可用性自动二态隐藏（scope=cluster/node），再按用户所选组收窄。
 overview 走 inHistGroup 恒真 = pass-through → 默认档渲染结果与引入分组前逐字相同。 */
  .filter(m => inHistGroup(m.field, histGroup.value))
  .map(m => {
    const series = buildSeries(hist.value, m.field) as NamedSeries[];
    /* R5 磁盘图卡专属：最小二乘外推预测段+「预计 X 天达 85%」提示（节点态不外推——单节点样本短） */
    const forecast = m.field === 'diskUsedPct' && !nodeMode.value
      ? diskForecast(series, 85, 30 * 86400e3)
      : undefined;
    const soonest = forecast
      ?.filter(f => f.days != null)
      .sort((x, y) => x.days! - y.days!)[0];
    const note = soonest
      ? (soonest.days! < 0.05
        ? `${soonest.name} 磁盘已达 85%，请尽快扩容`
        : `${soonest.name} 预计 ${soonest.days!.toFixed(1)} 天后磁盘达 85%`)
      : undefined;
    return {
      field: m.field,
      label: m.label,
      unit: m.unit,
      series,
      forecast,
      note,
      threshold: m.threshold,
      /* 拒绝图健康态：全程零拒绝时不出空图，只留一句话（出现非零自动浮出图卡） */
      hidden: (m.field === 'writeRejected' || m.field === 'searchRejected') && allClean.value,
    };
  }));
const allClean = computed(() => !hist.value.some(r => (r.writeRejected ?? 0) > 0 || (r.searchRejected ?? 0) > 0));

/* 分组空态文案——「所选组 × 当前观察口径」交集为空时给出可行动说明
 （例：集群模式下选「节点磁盘指标」，或节点下钻选「集群指标」）。 */
const histGroupEmpty = computed(() =>
  `${histGroupLabel(histGroup.value)}分组在「${nodeMode.value ? '按节点查看' : '集群'}」口径下暂无指标卡——`
  + '可切回「概览」分组，或调整上方的时间范围 / 观察口径');

/* 范围/集群/下钻变化即重查；清空集群回弹 checkbox（byNode 同 tick 批量，nodeMode 触发一次重查）；
 首挂载拉一针（与实时采样器互不干扰） */
watch(clusterFilter, v => { if (!v) byNode.value = false; });
watch([mh2Range, clusterFilter, nodeMode, mhAgg, customFrom, customTo], () => { void loadHist(); if (detailShows('slow')) void loadSlow(); if (detailShows('top')) void loadTop(); });
/* 周期档切换即重查——独立 watch（不动上方被 monitorHistoryTrend 逐字锁的数组字面）。
 histGroup 仍**不入**重查依赖：分组是用户导航过滤（切集群/范围/档位均不得重置。 */
watch(histPeriod, () => { void loadHist(); if (detailShows('slow')) void loadSlow(); if (detailShows('top')) void loadTop(); });
/* 1125：首载监控曲线同门（挂起待身份落地补跑） */
const liveBoot = useGatedBootRead('live', () => loadHist());
onMounted(() => {
  liveBoot.run();
  /* 命令面板「实时大屏·全屏切换」的一次性载荷：读后即清（刷新不再重复进入挂墙态）。 */
  if (sessionStorage.getItem('esquerystudio.live.fullscreen') === '1') {
    fullscreen.value = true;
    removeStoredRaw(sessionStorage, 'esquerystudio.live.fullscreen');
  }
  /* 入场编排——next rAF 翻真，令 [data-st] 初态先落一帧再起过渡 */
  requestAnimationFrame(() => { pageIn.value = true; });
});
</script>

<style scoped>
.ld-page { padding: var(--sp-2) var(--sp-3); --stagger: 85ms; max-width: 1760px; margin: 0 auto; width: 100%; } /* 795 件4：stagger 拉档；797 件3：超宽屏内容锚（1920+/2560 不拉爆=Grafana 大屏锚，居中协调） */
/* 797 件3：挂墙态豁免（fs-active 恒满屏=684 挂墙约定不破） */
.fs-active .ld-page { max-width: none; }
/* 全屏态壳由 FocusableSurface（fs-active）统一承担；本体吃满聚焦面并自带滚动 */
.ld-page[data-flex-fill] { flex: 1 1 auto; min-height: 0; overflow: auto; }
/* Z3（一致性）：.ld-hd/.ld-hd-l/.ld-hd-ic/.ld-hd-tt/.ld-hd-sub/.ld-hd-r 六条旧页头
 死规则整删——页头已迁 PageHeader 组件（.ph 系列），模板零引用零 spec 锁（
 .page-head 死规则族 G267/G268 同族第二例；PageHeader 合并漏删温床=页头类名域） */
/* 副标题已迁 PageHeader（.ph-sub），状态色选择器同步接线（slot 内容带本组件 scope） */
.ph-sub b.rn { color: var(--ok); }
.ph-sub b.st { color: var(--err); }
/* 轮询频率下拉改用 AutoRefreshSelect 统一件，.ld-sel 残留删除 */
.ld-stale { display: flex; gap: var(--sp-2); align-items: center; padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-3); font-size: var(--fs-sm); color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-s); }
.ld-stale-acts { margin-left: auto; display: inline-flex; gap: var(--sp-2); flex-shrink: 0; }

/* 指标卡墙退役后的 inline 元信息带（MetaStrip 统一件；本视图只承担落位间距） */
/* 件5：页头 actions 单行化（「UI 太丑啦」竖排三行根治——.ph-r wrap+shrink:0
 在标题长的本页换行竖排；本页 scope :deep nowrap 覆写，全站其他页 wrap 行为不受扰） */
.ld-page :deep(.ph-r) { flex-wrap: nowrap; }
.ld-page :deep(.ph-r .inp.sm) { min-width: 0; }
.ld-strip { margin-bottom: var(--sp-3); }

/* （622 -P4 挂墙，goal684-wall-mode.html 五件套）：全屏态=挂墙模式，
 墙作用域=FocusableSurface 根 fs-active（MetaStrip/卡墙/告警/历史区是 fs-body 下兄弟节点，
 不在 .ld-page 内——ld-wall 私类方案实测失配废弃）；四件 CSS 级联零 DOM 增删
 （ v-show 恒在 DOM 同律——探针判据走 computed display；.ld-* 元素类与
 data-v 双限定=规则只及本页元素，他页 fs-active 不串） */
.fs-active .ld-strip { display: none; } /* ①元信息带隐藏：阈值细节非墙播语义，健康态由卡 tone 与告警头承担 */
.fs-active .ld-alert { display: none; } /* ②告警折叠：头行严重/警告计数徽标=墙播摘要，条目出墙复原 */
.fs-active :deep(.ld-chart-cur) { font-size: var(--fs-num-l); } /* ③当前值升 28px 区块大数（W4= 放大态同档同语言） */
.fs-active :deep(.ld-ta) { font-size: var(--fs-xs); } /* ⑤时间锚升满轴：fs-2xs 注脚→fs-xs 轴刻度（W5）； K1 锚移图下独立行，bottom/opacity 两值随定位退役 */

/* 卡墙入列默认 2x2；/ 实时走势扩展后六卡（QPS/写入/Heap/CPU/磁盘/任务），
 1600+ 大屏换 3 列两行平衡（原四列档每卡偏窄，走势可读性优先）；1100/900 断点既有档保留 */
.ld-charts { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-4); } /* 795 件4：区块间距升档，卡间 gap 维持 sp-3（疏密对比） */
@media (min-width: 1600px) {
  .ld-charts { grid-template-columns: repeat(3, 1fr); }
}
/* 运行中任务清单行（pill + 标签 + 进度；标签截断防长索引名撑爆卡） */
.ld-jobs { display: flex; flex-direction: column; gap: var(--sp-1); min-height: 64px; justify-content: center; }
.ld-job-spark { margin-left: var(--sp-2); width: 72px; height: 18px; flex-shrink: 0; align-self: center; } /* ②任务卡走势 spark（abs 档，头行右缘） */
.ld-ncmp-tip-more { color: var(--tx2); font-size: var(--fs-xs); } /* ①读出截断尾行（聚合行弱化） */
/* 空态合并 EmptyState compact——原 .ld-svg-wait 占位形态归组件，本类只承担落位 */
.ld-jobs-empty { min-height: 64px; justify-content: center; padding-top: var(--sp-3); padding-bottom: var(--sp-3); }
.ld-job { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); min-width: 0; }
.ld-job-lb { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); }
.ld-job-pct { color: var(--tx2); font-variant-numeric: tabular-nums; }
.ld-job-more { font-size: var(--fs-2xs); color: var(--tx2); }
/* 797 件1（令大厂级统一卡壳）：556 分节壳退役口径随令升级——任务卡与 LiveChartCard
 五线卡同步升 panel 壳（同语言全站统一）；类名锚保留（ 锁同源） */
.ld-chart { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); padding: var(--sp-3); }
/* 遮罩：--mask 主题跟随 token（theme.css:130）；inset 四向写法规避 componentUnifySweep 的 fixed+inset:0 自建全屏壳正则（遮罩非壳） */
body.ld-chart-mask::after { content: ''; position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: var(--mask); z-index: var(--z-drawer-mask); }
/* 799 件1：任务卡头两行制 KPI 与 LiveChartCard 同构（行① 标题+小字+spark/行② 28px 大数） */
.ld-chart-tt { margin-bottom: var(--sp-2); }
.ld-chart-tt-top { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--muted); }
.ld-chart-tt-top .ld-job-spark { margin-left: auto; }
.ld-chart-cur { display: block; font-family: var(--mono); font-size: var(--fs-num-l); font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.25; margin: var(--sp-0) 0 var(--sp-1); }
.ld-chart-th { font-size: var(--fs-2xs); font-style: normal; color: var(--muted); }
/* 节点对比叠加卡——多折线（节点色锚排序位）+阈值虚线+站内 .seg 指标分段+多行值读出；
 容器按 border-top 分节（不加壳框） */
/* ══ 件1：悬浮面板壳（弹层四要素：bg1+边框+阴影+r-m=铁律 C）══
 fixed 真悬浮（页面流零占位）；默认右上 84px 档（pos.x=-1 未拖过时）；宽 640 自适应钳制。
 旧 .ld-ncmp 流内主规则随区块迁出页面流整删（794 死规则守卫域）。 */
/* 件3：fixed 浮层退役（令推翻 794 悬浮形态）——迁 .ld-nodes 区页面流内联
 容器：panel 壳与节点卡/六卡同语言（--panel 底+r-m），shadow/宽度钳制随浮层语义退役 */
.ld-ncmp-panel { margin-bottom: var(--sp-2); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); padding: var(--sp-2) var(--sp-3) var(--sp-3); }
/* 全屏展开态（LiveChartCard ld-chart-full 同语言）：面板 fixed 覆盖视口，图域随宽自适应 */
.ld-ncmp-panel.ld-ncmp-full { position: fixed; inset: 4vh 4vw; z-index: var(--z-ctx); margin-bottom: 0; box-shadow: var(--shadow-m); }
/* 展开钮（ld-expand 同语言） */
.ld-ncmp-expand { background: transparent; border: none; color: var(--muted); cursor: pointer; padding: var(--sp-0); display: inline-flex; align-items: center; transition: transform var(--dur-fast) var(--ease-out); }
.ld-ncmp-expand:hover { color: var(--tx0); }
.ld-ncmp-expand:active { transform: scale(.92); }
.ld-ncmp-panel .ld-ncmp-svg { height: 150px; }
/* 件1：图例 chips 行（hc-chip 同语言：色点+名+当前值 mono；off=划线灰化，色号不换） */
.ld-cmp-legend { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-2); margin-top: var(--sp-2); }
.ld-cmp-lg { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx1); background: transparent; border: 1px solid var(--border); border-radius: var(--r-s); padding: var(--sp-0) var(--sp-2); cursor: pointer; line-height: 16px; max-width: 260px; }
.ld-cmp-lg:hover { border-color: var(--muted); color: var(--tx0); }
.ld-cmp-lg i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ld-cmp-lg em { font-style: normal; color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }
.ld-cmp-lg.off { opacity: .45; text-decoration: line-through; }
.ld-cmp-lg.off em { text-decoration: line-through; }
.ld-ncmp-close { border: none; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-sm); line-height: 1; padding: 2px var(--sp-1); margin-left: var(--sp-1); border-radius: var(--r-xs); }
.ld-ncmp-close:hover { color: var(--tx0); background: var(--bg2); }
/* 入口钮（节点区头部，弹层触点软底语言） */
.ld-nodes-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.ld-nodes-hd .ld-nodes-tt { margin-bottom: 0; }
/* 件1：区块头汇总（mono 弱化不抢题） */
.ld-nodes-sum { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--muted); margin-right: auto; }
.ld-ncmp-entry { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--ac-hi); background: var(--ac-soft); border: 1px solid var(--ac-line); border-radius: 99px; padding: 2px var(--sp-2); cursor: pointer; transition: color .12s ease-out; }
.ld-ncmp-entry:hover { color: var(--ac); }
/* ══ ：监控明细单容器（三面板合一壳=用户六令实锚「在一块」）══ */
.ld-detail { margin-bottom: var(--sp-4); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); }
.ld-detail-hd { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); }
/* 件4：seg 防折行（theme .seg flex-wrap:wrap 全局锁在本容器被挤=两排不对称；
 scope nowrap+按钮不折不缩+meta 弹性让位） */
.ld-detail-hd .ld-detail-seg { flex-wrap: nowrap; flex-shrink: 0; }
.ld-detail-hd .ld-detail-seg button { white-space: nowrap; min-width: 0; } /* A1b：min-width:0 解除 flex auto 下限=ld-seg flex:1 1 0 真等分（内容宽下限是等宽杀手） */
.ld-detail-toggle { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); font-weight: 600; /* 件2：容器标题升 sec-t 档 */ color: var(--tx0); background: transparent; border: none; cursor: pointer; padding: 0; }
.ld-detail-chev { transition: transform .12s ease-out; }
.ld-detail-chev.open { transform: rotate(180deg); }
.ld-detail-meta { margin-left: auto; font-size: var(--fs-2xs); color: var(--tx2); font-variant-numeric: tabular-nums;  min-width: 0;; white-space: nowrap; } /* A2 */
.ld-detail-meta .crit { color: var(--err); } .ld-detail-meta .warn { color: var(--warn); } .ld-detail-meta .ok { color: var(--ok); }
.ld-detail-body { padding: var(--sp-2) var(--sp-3) var(--sp-3); border-top: 1px solid var(--border); }
.ld-detail-tools { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
/* ══ 件2：导出 ⋯ 收纳（三视图共用 details 弹层；Esc=window 捕获级，弹层四要素 bg+border+shadow+r）══ */
.ld-detail-more { position: relative; margin-left: var(--sp-1); }
.ld-detail-more > summary { list-style: none; display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border: 1px solid var(--border); border-radius: var(--r-s); color: var(--tx2); font-size: var(--fs-sm); font-weight: 650; cursor: pointer; user-select: none; }
.ld-detail-more > summary::-webkit-details-marker { display: none; }
.ld-detail-more[open] > summary { color: var(--ac); border-color: var(--ac); }
.ld-detail-more-menu { position: absolute; right: 0; top: calc(100% + var(--sp-1)); z-index: 30; min-width: 132px; padding: var(--sp-1); background: var(--bg2, var(--panel)); border: 1px solid var(--border); border-radius: var(--r-m); box-shadow: var(--shadow-pop); }
.ld-detail-more-menu button { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--tx0); font-size: var(--fs-xs); padding: 6px 10px; border-radius: var(--r-s); cursor: pointer; }
.ld-detail-more-menu button:not(:disabled):hover { background: var(--hl-soft, rgba(127, 127, 127, .12)); }
.ld-detail-more-menu button:disabled { opacity: .45; cursor: not-allowed; }
/* ══ 件1：Top 曲线图表底座（网格线/Y 中间刻度/X 时间锚/常显图例——截图「白板图」根治）══ */
.ld-grid { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 4; vector-effect: non-scaling-stroke; opacity: .75; }
.ld-xt { position: absolute; bottom: 2px; transform: translateX(-50%); font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); pointer-events: none; }
.ld-top-legend { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-4); margin: var(--sp-1) 2px var(--sp-2); }
/* 指标切换行（写入/查询/延迟 seg + 单位标注 + Top N 宽度）：曲线区上方一行 */
.ld-top-metric { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-1) 2px; }
.ld-top-metric-unit { font-size: var(--fs-2xs); color: var(--tx2); }
.ld-top-metric-sp { flex: 1 1 auto; }
.ld-top-limit { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); }
.ld-top-limit .inp { width: auto; min-width: 0; padding: 1px var(--sp-1); }
/* 逐序列窗内统计表（阿里云 min/max/avg/current 同形态）：紧凑行距，数值右对齐 */
.ld-top-stats { margin: var(--sp-1) 2px var(--sp-2); font-size: var(--fs-2xs); }
.ld-top-stats th, .ld-top-stats td { padding: var(--sp-0) var(--sp-1); white-space: nowrap; }
.ld-top-stats td:first-child { max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.ld-top-stats .num { text-align: right; font-variant-numeric: tabular-nums; }
/* 件1：Top 图例升胶囊 chip 族（与 ld-cmp-lg/hc-chip 同语言——border+r-s+圆点 50%+hover；
 802 旧代裸列表〔方色点/min-width 178〕退役；dot/name/cur 三件结构保留=802 A4 锁兼容）。
 批内勘正：旧代 em 残留规则退役（单规则=cmp 同字面 tx0/600/tabular）+非点击 span 摘
 cursor:pointer 假示能（pointer 属可点击的 cmp-lg 按钮） */
.ld-top-lg { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx1); background: transparent; border: 1px solid var(--border); border-radius: var(--r-s); padding: var(--sp-0) var(--sp-2); line-height: 16px; max-width: 260px; }
.ld-top-lg:hover { border-color: var(--muted); color: var(--tx0); }
.ld-top-lg i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ld-top-lg b { font-weight: 500; color: var(--tx0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
.ld-top-lg em { font-style: normal; color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }
/* ══ 件4：服务端告警状态胶囊（「无活动告警」灰字升格；绿点+边框容器）══ */
.ld-ok-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 99px; padding: 3px 10px; font-size: var(--fs-2xs); color: var(--tx2); background: var(--panel); }
.ld-ok-chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok, #34d399); box-shadow: 0 0 5px rgba(52, 211, 153, .5); }
/* ══ 件2：Top 索引曲线视图（曲线/表格双 seg+读出层复用 ld-hv-stack 语汇）══ */
.ld-top-viewseg { margin-left: var(--sp-2); }
.ld-top-plot { margin: var(--sp-1) 0 var(--sp-2); }
/* Top 曲线区全屏展开态（能力与顶部卡/历史卡/对比卡统一）：包层 fixed 覆盖视口，绘图域吃满 */
.ld-top-wrap.ld-top-full { position: fixed; inset: 4vh 4vw; z-index: var(--z-ctx); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); box-shadow: var(--shadow-m); padding: var(--sp-3); overflow: auto; }
.ld-top-wrap.ld-top-full .ld-top-plot { height: calc(100vh - 24vh - 180px); }
.ld-top-hv { min-width: 150px; }
.ld-ncmp-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
/* 主节点专项视角 toggle（896 #10）：checkbox 紧贴标题，fs-2xs 不抢 seg 主操作 */
.ld-ncmp-master { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); cursor: pointer; white-space: nowrap; }
.ld-ncmp-master:hover { color: var(--tx0); }
.ld-ncmp-tt { font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); } /* 件3：容器头升档=与监控明细孪生容器同语言（muted 卡级色退役） */
.ld-ncmp-hd .seg { margin-left: auto; }
.ld-ncmp-svg { width: 100%; height: 120px; display: block; }
/* 联动高亮（HistoryChart .hc-line 同语言）：hot 节点线升亮（1.5→2.25px）、其余退灰——
 stroke-width/opacity 走合成层过渡不触发布局；不加面积元素（path 计数 591/615 锁面） */
.ld-ncmp-svg path { transition: stroke-width .12s ease-out, opacity .12s ease-out; }
.ld-ncmp-svg path.is-dim { opacity: .15; }
.ld-ncmp-svg path.is-hot { stroke-width: 2.25; }
/* 联动面积+末端呼吸点（896 补齐历史卡三件套；polygon 不触 path 计数锁 591/615） */
.ld-ncmp-area { pointer-events: none; }
/* 悬浮贴线圆点（每可见序列一颗；HistoryChart hc-dot 同语言，色点描边隔离曲线） */
.ld-ncmp-hoverdot { position: absolute; width: 8px; height: 8px; border-radius: 50%; transform: translate(-50%, -50%); border: 1.5px solid var(--bg); pointer-events: none; }
/* 末端常驻采样点：点心钉图区右缘外 4px（面板 padding 内），与曲线终点分离不叠压 */
.ld-ncmp-enddot { position: absolute; right: -4px; width: 5px; height: 5px; border-radius: 50%; transform: translate(50%, -50%); pointer-events: none; box-shadow: 0 0 0 1.5px var(--bg1); }
.ld-ncmp-pulse { position: absolute; width: 6px; height: 6px; border-radius: 50%; transform: translate(-50%, -50%); animation: ld-ncmp-pulse 2.4s ease-out infinite; pointer-events: none; }
@keyframes ld-ncmp-pulse { 0% { transform: translate(-50%, -50%) scale(1); opacity: .85; } 75% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; } 100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ld-ncmp-pulse { animation: none; } }
/* K2：图例退役后的头部恢复钮（软底+品牌描边，fv-tab.act 同语言）——
 （图例 chip 点选随常驻图例退役，隐藏/恢复唯一通道=读出行尾 ×+本钮 */
.ld-ncmp-restore { font-size: var(--fs-2xs); color: var(--ac-hi); background: var(--ac-soft); border: 1px solid var(--ac-line); border-radius: 99px; padding: 1px var(--sp-2); cursor: pointer; }
.ld-ncmp-restore:hover { color: var(--ac); }
/* 图区包裹层：轴刻度/十字线/读出的定位上下文（与图同宽） */
.ld-cmp-plot { position: relative; height: 150px; }
/* 绘图域内壳（896 让位统一）：left 36px 让出 Y 刻度列——svg 与全部 % 定位层同域；
 plot 显式高度承托 absolute 内壳（svg 脱文档流后防塌陷溢出压下方内容） */
.ld-cmp-inner { position: absolute; inset: 0 0 0 36px; }
.ld-cmp-inner .ld-ncmp-svg { height: 100%; }
.ld-glines line { stroke: var(--line); stroke-width: 1; }
/* 轴系（LiveChartCard 781 同语言：Y 左缘双刻度 tx1 提亮+阈值右缘贴行+X 图下独立行 3 锚） */
.ld-yt { position: absolute; left: 0; width: 32px; text-align: right; font-size: var(--fs-2xs); color: var(--tx1); font-family: var(--mono); line-height: 1.2; pointer-events: none; } /* 右对齐贴绘图域左缘（36px 让位列内，LiveChartCard .ld-yt 同语言） */
.ld-yt-top { top: 0; }
.ld-yt-bot { bottom: 0; }
/* 中档刻度贴 pct 网格线（对比卡；主卡 .ld-yt-mid 同语言，历史卡 .hc-yt 同语言） */
.ld-yt-mid { transform: translateY(-50%); }
.ld-thv { position: absolute; right: 0; transform: translateY(-50%); font-size: var(--fs-2xs); color: var(--err); font-family: var(--mono); pointer-events: none; background: var(--bg1); padding: 0 var(--sp-0); }
.ld-xaxis { display: flex; justify-content: space-between; margin-top: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.ld-ta { pointer-events: none; }
/* （读出层纵排堆叠（9 节点横排爆行修复）； K2 行尾 × 隐藏钮。
 件3：.ld-hv 补弹层四要素（bg1 底+border+shadow-m+r-s+padding=hc-tip 同语言）
 ——781 年代起读出容器无壳裸奔（实报「不应该是悬浮小卡片吗」根治） */
/* C1：十字线规则补位（族3/4 .ld-xline 781 年代起无规则=悬浮十字线不可见 bug；对齐族1/2 1px tx2@.45） */
.ld-xline { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--tx2); opacity: .45; pointer-events: none; }
/* 横向十字线（对比卡/Top 卡；HistoryChart .hc-yline 同语言）——双线交点=指针位置 */
.ld-yline { position: absolute; left: 0; right: 0; height: 1px; background: var(--tx2); opacity: .45; pointer-events: none; }
.ld-hv { position: absolute; z-index: 3; /* C2：壳对齐 hc-tip（bg2+fs-2xs） */ background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-s); box-shadow: var(--shadow-m); padding: var(--sp-1) var(--sp-2); pointer-events: none;; font-size: var(--fs-2xs); }
.ld-hv-stack { flex-direction: column; align-items: stretch; gap: var(--sp-0); min-width: 150px; max-height: 260px; overflow-y: auto; } /* ：全量显示滚动兜底（>24 行极端集群） */
.ld-ncmp-tip-r { display: flex; align-items: center; gap: var(--sp-1); white-space: nowrap; }
.ld-ncmp-tip-r i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.ld-ncmp-tip-r em { font-style: normal; font-family: var(--mono); color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; margin-left: auto; padding-left: var(--sp-2h); } /* C3：值档对齐 hc-tip（tx0/600） */
.ld-hv-t { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--tx2); margin-bottom: var(--sp-0); } /* C3：时间行样式（781 年代起无样式） */
.ld-ncmp-hide { border: none; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-sm); line-height: 1; padding: 0 var(--sp-0); pointer-events: auto; }
.ld-ncmp-hide:hover { color: var(--err); }

.ld-nodes { margin-bottom: var(--sp-4); } /* 795 件4：区块间距升档（疏密对比=区块间疏+卡间维持密） */
/* W-F：弱分节标题挂全局 .sec-t，本地排版本地声明退役（口径 B）；
 .ld-chart-tt/.ld-alerts-tt 带当前值/徽标属组件私有形态豁免 */
.ld-nodes-tt { margin-bottom: var(--sp-2); }
/* 件3（794）：对比块迁出页面流后版面释放——节点卡 minmax 220→240 加宽一档（1600 档更大气） */
.ld-nodes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2); }
/* 空态合并 EmptyState compact 统一件，本类只留 grid 跨列落位（视觉归组件） */
.ld-nodes-empty { grid-column: 1 / -1; }
.ld-node { padding: var(--sp-2) var(--sp-3); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); } /* 件1：r-xs→r-m+横向内距升档=六卡 panel 同语言 */
/* 节点卡可点下钻（/diag?node=，告警条 alertRoute 同语汇）——hover 微亮+键盘焦点环；不改语义边框 tone */
.ld-node { cursor: pointer; transition: background .12s ease-out, border-color .12s ease-out; }
.ld-node:hover { background: var(--bg2); border-color: var(--ac); } /* 件1：hover 品牌青强调=可点下钻暗示（797 件4 hover 家族） */
.ld-node.warn { border-color: var(--warn); }
.ld-node.bad { border-color: var(--err); }
.ld-node-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-2); font-size: var(--fs-xs); }
.ld-node-name { display: inline-flex; align-items: center; gap: var(--sp-1h); min-width: 0; }
.ld-node-name b { font-weight: 650; } /* 795 件3：节点名加粗档 */
/* .ld-node-tone 四条私造圆点规则随 MetaStrip dot 形态单源退役
 （bw-hdot 四胞之一；色值映射迁 nodeToneDot 单点，8px 圆点归组件 .ms-dot 单源） */
/* 9px 裸值清零（低于 --fs-2xs 自守卫下限），三处归档 */
.ld-node-role { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--muted); padding: 1px 5px; border-radius: var(--r-xs); line-height: 15px; }
.ld-node-role.data { color: var(--dv-blue); background: color-mix(in srgb, var(--dv-blue) 14%, transparent); }
.ld-node-role.master { color: var(--dv-purple); background: color-mix(in srgb, var(--dv-purple) 14%, transparent); }
/* K3：.ld-node-sparks/.ld-spark-row/.ld-spark-lb/.ld-spark/.ld-spark-wait 五条
 随卡内迷你 spark 退役整删（模板 0 引用；与节点对比图/历史下钻重复） */
.ld-node-row { display: flex; gap: var(--sp-2); align-items: center; margin-bottom: 3px; font-size: var(--fs-xs); }
.ld-node-row > span:first-child { width: 30px; color: var(--muted); }
.ld-node-row > b { width: 40px; text-align: right; font-family: var(--mono); }
/* 数值 tone 两档（既有语义色 token；阈值判定全走 metricTone 单源，
 disk bad=90 与 heap/cpu 统一口径——ES watermark 85 红线的旧分叉不再引入） */
.ld-node-row > b.warn { color: var(--warn); }
.ld-node-row > b.err { color: var(--err); }
/* load 行（绝对值非百分比，无水位条；b 推右对齐其他行值位） */
.ld-node-row-plain > b { margin-left: auto; }
/* 件1：tp+load 合一行收尾（上缘分隔线收口；.ld-node-row 30px 标签列在此档释放） */
.ld-node-foot { margin: 6px 0 0; padding-top: 5px; border-top: 1px solid var(--border-soft); font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); }
.ld-node-foot > span:first-child { width: auto; }
.ld-node-foot b { color: var(--tx0); font-weight: 600; }
.ld-node-foot-sep { color: var(--muted); }
.ld-bar { flex: 1; height: 12px; background: var(--panel-2); border-radius: var(--r-xs); overflow: hidden; position: relative; } /* 件1：8→12px 卡内主视觉+刻度定位上下文 */
/* width 过渡改 transform: scaleX（合成层动画不走 layout，百分比/100 由模板绑定；origin left 等效左起填充）。
 件1：填充色走 --mc 身份色变量（ok 档），warn/err 档切语义色=条与数值同色同档（metricTone 单源） */
.ld-bar > div { width: 100%; height: 100%; transform-origin: left; transition: transform 0.3s; background: var(--mc); }
.ld-bar > div.warn { background: var(--warn); }
.ld-bar > div.err { background: var(--err); }
/* 件1：85/90 阈值刻度双标（track 上 1px 竖线，「离危险多远」一眼可读；90 档染 err） */
.ld-bar-tick { position: absolute; top: 1px; bottom: 1px; width: 1px; left: 85%; background: var(--tx2); opacity: .45; }
.ld-bar-tick.t90 { left: 90%; background: var(--err); opacity: .55; }

/* .ld-alerts 告警盒外框退役（v 刀④局部）——border/radius/panel 壳退役，
 容器与类名保留（.ld-alerts-tt 头条 527 W-F 豁免形态原样保留不动；条目行分隔由
 .ld-alert border-bottom 自持） */
/* .ld-alerts-tt 头条本体漏面补刀（535 W6 只退了 .ld-alerts 外框）——panel-2 底块
 退役转 fs-head 行首横排档（v 约定「分界归 fs-head border-bottom」：分界线保留，退的是底色；
 PainlessLab .pl-editor-hd 同款），warn 语义字色与条栏布局原样保留 */
/* B3：空态轻量行（无 warn 头行无分隔线——搁浅分隔条退役） */
.ld-alerts-empty { display: flex; align-items: center; padding: 0 var(--sp-3); }
/* B2：告警区容器间距（535 退役外框后间距无处安放=与历史区交界 0px 焊死） */
.ld-alerts { margin-bottom: var(--sp-4); }
/* 件1：区块标题升 sec-t 约定档（12px·600）=四区同档；warn 语义色保留 */
.ld-alerts-tt { padding: var(--sp-2) var(--sp-3); font-size: var(--fs-sm); font-weight: 600; border-bottom: 1px solid var(--border); display: flex; gap: var(--sp-2); align-items: center; color: var(--warn); }
/* 告警计数徽标改用 StatusPill——落位锚类保留（pillSingleTrack MERGED 看守），
 原 .bd/.wn 文字色档随改用退役（色归 tone 单源）。 Z3：空规则壳删除
 （类名仍在模板作锚；pillSingleTrack 断言=禁自带尺寸/色值，规则缺席恒过） */
/* 件1：.ld-al-ok 灰字规则随空态胶囊化退役（ld-ok-chip 单源消费） */
.ld-al-sp { flex: 1; }
.ld-al-clear { padding: var(--sp-0) var(--sp-2); font-size: var(--fs-2xs); border: 1px solid var(--border); border-radius: var(--r-xs); background: transparent; color: var(--muted); cursor: pointer; }
.ld-al-clear:hover { color: var(--fg); border-color: var(--muted); }
/* 件1：告警行 chip 卡化——level tint 底+1px level 边+r-s 圆角+chip 间距
 （border-bottom 分隔退役），与 782 服务端告警 chips（.ld-hist-al）同语言；
 左缘 4px 色条保留（795 件2「一眼分档」档维持）。 */
.ld-alert { padding: var(--sp-1h) var(--sp-3); font-size: var(--fs-xs); border: 1px solid var(--border); border-radius: var(--r-s); margin-bottom: var(--sp-1); display: flex; gap: var(--sp-3); align-items: center; transition: filter .12s ease-out, background .12s ease-out; }
/* 797 件4（交互美感）：可点元素 hover 过渡档统一 0.12s ease-out——告警行（role=button 可点定位）
 hover 微亮=六卡/节点卡同语言；tint 行 hover=brightness 微亮（底色保持语义档不被 bg2 盖掉） */
.ld-alert:hover { background: var(--bg2); }
.ld-alert.warn:hover, .ld-alert.bad:hover { background: transparent; filter: brightness(1.14); }
.ld-alert.warn { border: 1px solid var(--warn-line); border-left: 4px solid var(--warn); background: var(--warn-soft); }
.ld-alert.bad { border: 1px solid var(--err-line); border-left: 4px solid var(--err); background: var(--err-soft); }
.ld-alert.resolved { border: 1px solid var(--border); border-left: 4px solid var(--border); color: var(--muted); opacity: 0.75; }
.ld-alert-m { display: inline-flex; gap: var(--sp-2); align-items: baseline; }
.ld-alert-v { font-family: var(--mono); font-weight: 600; font-size: var(--fs-sm); } /* ：700→600 */
.ld-alert.warn .ld-alert-v { color: var(--warn); }
.ld-alert.bad .ld-alert-v { color: var(--err); }
.ld-alert-pk { font-size: var(--fs-2xs); color: var(--muted); font-family: var(--mono); }
.ld-alert-th { font-size: var(--fs-2xs); color: var(--muted); }
.ld-alert-t { margin-left: auto; color: var(--muted); font-family: var(--mono); font-size: var(--fs-2xs); white-space: nowrap; }

/* 归一断点：1100 charts 3→2，900 再收（1） */
@media (max-width: 1100px) {
  .ld-charts { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .ld-charts { grid-template-columns: 1fr; }
}

/* ═══ 集群监控历史趋势（分界归 border-top，spacing 全走 --sp-* token；
 图卡本体归 HistoryChart 统一件，此处只承担筛选行/栅格落位/加载蒙层） ═══ */
.ld-hist { margin-bottom: var(--sp-4); }
/* Z4（协调性）：头部两行分层——原单行 flex-wrap 11 子项 wrap 断点随内容漂移
 （「头部拥挤」实报根源）；行①轻信息（标题/副题/环形用量）+行②控件（恒 5+⋯ 与页头 actions
 同语言）。select.inp 局部修订规则保留（选择器仍为 .ld-hist-head 后代=monitorHistoryTrend 锁面） */
.ld-hist-head { padding: var(--sp-2) var(--sp-3); border-top: 1px solid var(--border); }
.ld-hist-head-top { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
.ld-hist-head-ctl { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-1h); }
/* 分组导航 seg（对标阿里云「分组」）。紧凑修饰只走本 scope——不动 theme.css 的
 .seg 基类（responsiveGuard239 逐字锁 `.seg { display: inline-flex; flex-wrap: wrap;`）；
 短标签 8 档（概览/集群/索引/资源/网络/磁盘/JVM/线程池）在 900 展开侧栏（可用宽 ≈630px）
 仍单行不折；全称走 button title 兜底（信息不丢）。 */
.ld-hist-group { flex: 0 0 auto; }
.ld-hist-group button { padding: var(--sp-1) var(--sp-2h); font-size: var(--fs-xs); }
/* seg 滑动指示器（622 /）——增量修饰，不动 theme.css 的 .seg 基类
 （responsiveGuard239 锁 .seg{display:inline-flex;flex-wrap:wrap}）；等宽钮 + 单枚 pill 绝对定位，
 left/width 走 --dur-fast/--ease-out 真滑动，激活钮 .on 自持背景退役由 pill 接管。 */
.ld-seg { position: relative; gap: 0; }
.ld-seg button { position: relative; z-index: 1; flex: 1 1 0; padding-left: var(--sp-1); padding-right: var(--sp-1); text-align: center; }
/* （622 ）：seg 按钮按下反馈——transform-only（--dur-fast 微交互档） */
.ld-seg button { transition: transform var(--dur-fast) var(--ease-out); }
.ld-seg button:active { transform: scale(.96); }
.ld-seg button.on { background: transparent; box-shadow: none; }
.ld-seg .seg-thumb {
  position: absolute; top: var(--sp-0); bottom: var(--sp-0); z-index: 0;
  background: var(--bg3); border-radius: var(--r-s); box-shadow: 0 1px 3px rgba(0, 0, 0, .3);
  transition: left var(--dur-fast) var(--ease-out), width var(--dur-fast) var(--ease-out);
}
/* ⋯ 溢出收纳（铁律 C「工具行默认可见按钮 ≤5，其余收进 ⋯」）。
 原生 details——键盘可达且**无需 document 捕获级 Esc 接线**（不入 568/569 Esc 台账）。 */
.ld-hist-more { position: relative; flex: 0 0 auto; }
.ld-hist-more-sum {
  list-style: none; display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: 1px solid var(--line); border-radius: var(--r-s);
  background: var(--bg1); color: var(--tx2); font-size: var(--fs-md); line-height: 1;
}
.ld-hist-more-sum::-webkit-details-marker { display: none; }
.ld-hist-more-sum:hover { color: var(--tx0); border-color: var(--ac-line); }
.ld-hist-more[open] .ld-hist-more-sum { color: var(--tx0); border-color: var(--ac-line); }
/* 浮层四要素约定（铁律 C 弹层）：bg1 底 + 边框 + 阴影 + r-m——禁透明壳导致「选项平铺叠在图表上」。
 z 走主题令牌（themeZGuard524）；min-width 不带 max- 前缀语义故不受 239 锚① 锁。 */
.ld-hist-more-pop {
  position: absolute; right: 0; top: calc(100% + var(--sp-1)); z-index: var(--z-popover);
  display: flex; flex-direction: column; gap: var(--sp-2h);
  min-width: 210px; padding: var(--sp-2h) var(--sp-3);
  background: var(--bg1); border: 1px solid var(--line-strong);
  border-radius: var(--r-m); box-shadow: var(--shadow-pop);
}
.ld-hist-more-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); }
.ld-hist-more-lb { flex-shrink: 0; }
/* 分组空态——独立类，不与图卡级空态（.ld-hist-clean / HistoryChart 内「暂无采样」）混用 */
.ld-hist-empty { padding: var(--sp-5) var(--sp-3); }
/* 入场编排（622 按区分组）+ 数值 roll（。只动 transform/opacity；
 降级靠 theme.css 全局兜底（*{transition-duration:.01ms!important}），视图内不新增媒体查询。 */
[data-st] { opacity: 0; transform: translate3d(0, 8px, 0); }
[data-st].st-in { opacity: 1; transform: none; transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out); }
[data-st="1"].st-in { transition-delay: 0ms; }
[data-st="2"].st-in { transition-delay: var(--stagger); }
[data-st="3"].st-in { transition-delay: calc(var(--stagger) * 2); }
[data-st="4"].st-in { transition-delay: calc(var(--stagger) * 3); }
@keyframes ld-roll { from { opacity: 0; transform: translate3d(0, 7px, 0); } }
.ld-charts .ld-chart-cur { animation: ld-roll var(--dur-base) var(--ease-out); }
/* 布局质感修复：全局 .inp width:100% 让头部四个下拉各占满一行竖排（挤压版面），
 此处约束为内容宽回一行工具栏形态 */
.ld-hist-head select.inp { width: auto; flex: 0 0 auto; min-width: 110px; }
/* R7 服务端告警条：头部下 chips 行（CRIT 红/WARN 黄/INFO 中性——色走语义 token+soft 底随主题；
 多条随 flex-wrap 换行；全无=小灰字。类名避 badge/pill/chip 词根——pillSingleTrack 徽标单轨看守域外） */
.ld-hist-alerts { display: flex; flex-wrap: wrap; gap: var(--sp-1); align-items: center; padding: 0 var(--sp-3) var(--sp-2); }
.ld-hist-al { display: inline-flex; align-items: center; gap: var(--sp-1); max-width: 100%; padding: var(--sp-0) var(--sp-2); font-size: var(--fs-2xs); border: 1px solid var(--border); border-radius: var(--r-s); color: var(--tx2); background: transparent; } /* 2px→var(--sp-0) 精确等值合并 */
.ld-hist-al b { font-weight: 600; }
.ld-hist-al.crit { border-color: var(--err-line); color: var(--err); background: var(--err-soft); }
.ld-hist-al.warn { border-color: var(--warn-line); color: var(--wn); background: var(--warn-soft); }
.ld-hist-al-msg { opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 告警历史表（默认收起；展开后随 flex 自然占位）。
 Z1：外壳布局随 CollapsePanel 合并退役（组件 .cp 承担 flex column/gap；
 本类保留作 DOM 锚与样式钩——表/空态/等级分布子规则照旧在此） */
/* 三表改用全站 .tbl（挂 tbl zebra 类，782 稿决议表「下批候选」）——
 基底（width/border-collapse/表体 fs-sm）与表头语言（fs-xs 600/sticky/bg2）、hover
 高亮、斑马纹全部由 theme.css .tbl 族承载；本域 scoped 只留差异化语言=紧凑密度
 （th/td 3px，监控页高密度不漂移）+nowrap 语义（msg 列回开）。782 Z3 的 12px→fs-sm
 token 化语言随改用移交 .tbl 承载（逐值同源）。 */
.ld-hist-hist-t th, .ld-hist-hist-t td { text-align: left; padding: 3px var(--sp-2); border-bottom: 1px solid var(--line); white-space: nowrap; }
.ld-hist-hist-t .ld-hist-hist-msg { white-space: normal; }
/* .ld-hist-hist-t .crit/.warn/.info 三条级别色规则随级别列改用 StatusPill 退役
 （CRIT→r/WARN→y/INFO→n tone 单源；chips 行 .ld-hist-al.crit 族不受影响） */
.ld-hist-hist-empty { color: var(--tx2); }
.ld-hist-ntab-t { padding: var(--sp-1) 0 0; }
.ld-top-link { cursor: pointer; }
.ld-top-link:hover { text-decoration: underline; color: var(--ac-line); }
.ld-hist-hist-c { display: inline-flex; align-items: center; gap: var(--sp-0); font-size: var(--fs-2xs); color: var(--tx2); }
.ld-hist-hist-c .crit { color: var(--err); }
.ld-hist-hist-c .warn { color: var(--wn); }
.ld-hist-hist-c .ok { color: var(--ok); }
/* Z1：慢请求阈值行合并（原 438 行内联 style+input 内联宽退役） */
/* 件1：耗时 tone 两档色+600 字重（mono 语义值升格） */
.ld-cost-warn { color: var(--wn); font-weight: 600; }
.ld-cost-err { color: var(--err); font-weight: 600; }
/* 件2：慢请求刷新钮在途旋转（IlmView 同款；scoped keyframes 本视图自持） */
.spinning { animation: ld-spin 1s linear infinite; }
@keyframes ld-spin { to { transform: rotate(360deg); } }
.ld-slow-bar { display: flex; gap: var(--sp-1); align-items: center; }
.ld-slow-inp { width: 110px; flex: 0 0 auto; }
.ld-hist-sub { font-size: var(--fs-xs); color: var(--muted); }
.ld-hist-sp { flex: 1; }
/* R6 环形治理用量条：60px 细条+mono 文字（审计+监控合计/上限，title 含分族明细） */
.ld-hist-ring { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); font-family: var(--mono); white-space: nowrap; }
.ld-hist-ring-bar { width: 60px; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden; display: inline-block; }
.ld-hist-ring-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--ok), var(--wn)); border-radius: 3px; }
/* 「按节点查看」下钻开关：未选定集群置灰（无具体集群就没有节点序列） */
.ld-hist-node { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; user-select: none; }
.ld-hist-node:has(input:disabled) { opacity: .5; cursor: not-allowed; }
.ld-hist-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-4); } /* B1：与六卡同档；下距=与下沉明细容器的分节呼吸（重排后 grid→detail 相邻） */
/* R4 节点一览紧凑表：四列网格行（节点名 mono，水位数值右对齐表列） */
.ld-hist-ntab { border: 1px solid var(--border); border-radius: var(--r-s); overflow: hidden; }
.ld-hist-ntab-r { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-xs); }
.ld-hist-ntab-r[role='row']:first-child { background: var(--bg2); color: var(--tx2); font-size: var(--fs-2xs); }
.ld-hist-ntab-r + .ld-hist-ntab-r { border-top: 1px solid var(--border); }
/* 数值列共轴（877 对称对齐扫描）：列头与数值同右轴——原列头贴列左缘/数值贴列右缘，
 1fr 拉宽列后头值隔半列空白（用户圈图实报）；节点名首列保持左对齐 */
.ld-hist-ntab-r [role='cell']:not(:first-child), .ld-hist-ntab-r [role='columnheader']:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
.ld-hist-ntab-r .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 797 件1（令大厂级统一卡壳）：历史五图分节式 border-top 退役→panel 壳
 （与六卡 .ld-chart/节点卡/CollapsePanel 同语言=全站卡壳统一协调）；
 797 件2：奇数张末张 span 2 满行收底（2+2+1 孤儿半行宽=不对称治） */
.ld-hist-cell { position: relative; background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-m); padding: var(--sp-3); min-width: 0; }
.ld-hist-grid .ld-hist-cell:last-child:nth-child(odd) { grid-column: span 2; }
/* 加载蒙层：保留上轮数据防闪烁，骨架条居中（沿用 SkeletonBox 统一件） */
.ld-hist-load { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--bg) 62%, transparent); }
/* 拒绝图健康态一句话（代替恒零空卡） */
.ld-hist-clean { display: flex; align-items: center; justify-content: center; height: 120px; font-size: var(--fs-sm); color: var(--tx2); }
@media (max-width: 900px) {
  .ld-hist-grid { grid-template-columns: 1fr; }
}
</style>
