<template>
  <FocusableSurface pane-id="rt.table" title="结果表" headless :enabled="focused" @update:enabled="focused = $event" :class="{ 'rt-fs-fill': fill }">
  <!-- 裁决「放大/查找直接集成在表格上」:FocusableSurface 合并为表格内建——
 放大钮内建在 rt-bar 工具簇末尾,消费方不再各自包 FS/接 focusPaneId(此前 4 视图各自接线的
 不一致根源);headless 模式 fs-body 链路靠 data-flex-fill 保高度,聚焦态整表铺满,
 工具行(查找/导出/行高/列选)随行可达。⚠本注释必须在 FS 内:根级注释=fragment 根,T39 卸载断裂 -->
  <div ref="rootEl" class="rt" :class="{ dense: rowH === 'compact', cozy: rowH === 'cozy', 'rt-nav-on': tblFocus, 'is-hscrolled': hScrolled, 'rt-fill': fill, 'rt-body-hidden': bodyHidden }" data-flex-fill tabindex="-1"
       role="region" aria-label="查询结果表格（Tab 聚焦后：↑↓ 行导航、Ctrl+F 查找、Enter 打开文档）"
       @keydown="onGridKeydown" @focus="tblFocus = true" @blur="tblFocus = false">
    <!-- 工具条 -->
    <!-- 容器结构随壳合并 TableShell（卡头语言单一出处），类名经 props 注入、
 内容经槽注入，DOM 与既有逐字节一致（守卫锚内核源码字面量，钮组不进壳） -->
    <TableShell bar-class="rt-bar" bar-r-class="rt-bar-r" @bar-contextmenu="openBarMenu">
      <template #bar-left>
        <!-- 内建视图档分段（QRT 607 对称件）——seg 寄居 bar-left 最前（RT 单壳
 无独立壳通道，恒可达，寄居位在消费方 bar-prepend 槽之前）；数据驱动出档：
 jsonHtml/treeData/cardHits 提供哪档出哪档，表格档恒在；aria-pressed 可达。
 缺省 viewSeg=false 不渲染（全站零增量；DQ/IH 既有自造 seg 消费面迁移=
 冻结面解锁后接线批执行） -->
        <div v-if="viewSegOn" class="seg rt-view-seg" role="group" aria-label="展示形式">
          <button type="button" :class="{ on: effView === 'table' }" :aria-pressed="effView === 'table'" @click="altView = 'table'">表格</button>
          <button v-if="jsonHtml != null" type="button" :class="{ on: effView === 'json' }" :aria-pressed="effView === 'json'" @click="altView = 'json'">JSON</button>
          <button v-if="treeData != null" type="button" :class="{ on: effView === 'tree' }" :aria-pressed="effView === 'tree'" @click="altView = 'tree'">Tree</button>
          <button v-if="cardHits != null" type="button" :class="{ on: effView === 'cards' }" :aria-pressed="effView === 'cards'" @click="altView = 'cards'">卡片</button>
        </div>
        <!-- bar-prepend 槽（bar-left 最前）——消费方把视图切换 seg/分页器寄居进
 表格自带工具行（「翻页、展示形式统一在表格头」裁决），卡外/卡上独立条退役。 -->
        <slot name="bar-prepend" />
        <!-- 内建分页（QRT :561 三参齐备形态平移）——page/pageSize/total
 三参齐备（pagerOn）才渲染内建 Pagination，翻页/改页大小只 emit 给宿主
 （update:page / update:pageSize），取数/切片归宿主（远端契约同 QRT 525）。
 ⚠互斥约定（消费侧批裁决执行）：宿主 bar-prepend 寄居 Pagination 档
 （DslQueryView/IndexHubView 现状）不传 page 系 props（三参不齐内建档不出），
 内建档不寄居——同一表格双分页器是回归事故，槽与内建共存由宿主自行二选一。 -->
        <!-- pagerDisabled 透传（QRT 525 同名 prop 对位——宿主执行中禁用分页器） -->
        <Pagination v-if="pagerOn" :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
          @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
        <!-- 工具行容器化（dbx 表格卡头语言）——命中数/操作钮/导出菜单收进与表格连体的卡头，
 不再是悬空的散排一行；导出菜单 = 标题+右注脚说明+紧凑 item，与触发钮视觉连接 -->
        <span class="rt-info mono">{{ hits.length }}/{{ fmtNum(total) }}<template v-if="totalGte">+</template><template v-if="took != null && took >= 0"> · <TookBadge :ms="took" /></template><template v-if="renderTruncated"> · 已渲染前 {{ renderHits.length }} 行（导出不受影响）</template><template v-if="totalGte">（命中数为下界）</template></span>
        <!-- P0-4：筛选态提示（暗状态可见性——有筛选时行数与清除入口常驻，QRT 同款）；
 组合档切换钮（AND=全部命中 / OR=任一列命中，就地翻转零跳转）
 同构段合并 TableFilteredHint 片段组件（QRT 同款单一出处，DOM 逐字节） -->
        <TableFilteredHint :active="activeFilterCount" :shown="filteredHits.length" :total="hits.length"
          :mode="filterModeLive" span-cls="rt-filtered mono" fmode-cls="rt-fmode mono" clear-cls="rt-filtered-clear"
          @toggle-mode="toggleFilterMode" @clear="clearAllFilters" />
        <!-- W3：searchable 内建搜索框（与既有钮同排；双绑驱动既有 quickFilter
 过滤链——命中数即滤后所见）；Esc 清词。缺省 false 不渲染（全站零增量）
 同构段合并 TableQSearch 片段组件（QRT 同款单一出处，DOM 逐字节） -->
        <!-- ·单框双效：@enter 桥接滚动下一命中行（620 稿 D2，TableQSearch 定向转 emit） -->
        <TableQSearch :on="searchable" q-cls="rt-qsearch" v-model:kw="searchableKw" @enter="bridgeNext" />
        <!-- refreshable 刷新钮内建 RT（撤销 「 为 QRT 专属」）——
 形制逐字对齐 QRT 546 同款钮：只 emit 'refresh' 意图，取数归宿主（提交链同事件名）。
 缺省 false 不渲染（全站零增量）
 同构段合并 TableRefreshBtn 片段组件（QRT 同款单一出处，DOM 逐字节） -->
        <TableRefreshBtn :on="refreshable" btn-cls="rt-tool-btn" @refresh="emit('refresh')" />
        <!-- P0-1：结果内查找（Ctrl+F，dbx Grid SearchBar 对位）——
 命中格琥珀底+当前命中落位；截断时仅覆盖已渲染前 N 行（≈ 提示，所见即所搜）
 ·单框双效（620 稿 D1~D5 裁决）：searchable 档 HitNav 挂载点退役——
 查找并入常驻快筛框（输入即过滤+行内 mark 点亮，词桥见脚本层）；非 searchable
 档原样保留（「表格必有查找」约定不回退，546 缺省零增量不破） -->
        <template v-if="searchOpen && !searchable">
          <HitNav v-model="searchKw" :count="searchMatches.length" :current="searchCur"
                  placeholder="结果内查找…" @next="searchNext" @prev="searchPrev" @keydown.esc.stop="closeSearch" />
          <span v-if="renderTruncated" class="rt-search-note mono" :title="`结果已截断渲染——查找仅覆盖已渲染的前 ${renderHits.length} 行`">≈ 前 {{ renderHits.length }} 行</span>
        </template>
      </template>
      <template #bar-right>
        <!-- 待提交轻量 chip（dbx 风格）——仅徽标数字，点开气泡才见操作。
 ·实报「这个不应该直接全部在表头」：placement 改 top-end 向上弹——
 弹层向下展开会盖住表格列头（bottom-end 形态） -->
        <n-popover v-if="pending.size" trigger="click" placement="top-end" :show="pendOpen" @update:show="pendOpen = $event">
          <template #trigger>
            <button class="pend-chip" :class="{ committing }" title="待提交更改——点开预览/提交/撤销">
              <Pencil :size="11" />
              <span class="pend-chip-n mono">{{ pendingCount }}</span>
              <ChevronDown :size="11" />
            </button>
          </template>
          <div class="pend-pop">
            <div class="pend-pop-hd"><Pencil :size="12" /> 待提交更改 <b class="pend-pop-n mono">{{ pendingCount }}</b><span class="pend-pop-id mono" :title="pendItems[0]?.id || ''">{{ pendItems[0]?.id || '' }}</span></div>
            <div v-if="committing" class="pend-pop-prog mono">{{ commitProgress }}</div>
            <template v-else>
              <div class="pend-pop-list">
                <!-- 方案 A：逐条变更明细（行 id × 字段：旧值→新值，单条撤销）——
 最多展示 3 条，超出折叠「… 共 N 处」；数据源 pending(Map<id,Map<field,{old,new}>>) -->
                <div v-for="it in pendItems" :key="it.id + ':' + it.field" class="pend-pop-item">
                  <span class="pend-pop-fld mono" :title="it.id + ' × ' + it.field">{{ it.field }}</span>
                  <span class="pend-pop-vals mono"><s>{{ jstr(it.oldVal) }}</s><span class="pend-pop-arr">→</span>{{ jstr(it.newVal) }}</span>
                  <button class="pend-pop-undo" title="撤销此格更改" @click="revertOne(it.id, it.field)">撤销</button>
                </div>
                <div v-if="pendingCount > pendItems.length" class="pend-pop-more">… 共 {{ pendingCount }} 处，双击下一单元格继续追加</div>
              </div>
              <div class="pend-pop-foot">
                <button class="btn sm ghost" @click="previewOpen = true; pendOpen = false"><Search :size="12" /> 预览</button>
                <button class="btn sm ghost" aria-label="复制 bulk NDJSON（审计/复现/重放）" title="复制 bulk NDJSON（审计/复现/重放）" @click="copyBulkNdjson"><ClipboardList :size="12" /></button>
                <span class="pend-pop-sp"></span>
                <button class="btn sm ghost" @click="revertAll()"><RotateCcw :size="12" /> 全部撤销</button>
                <button class="btn sm pri" :disabled="committing" @click="pendOpen = false; commitPending()"><Send :size="11" /> 提交全部</button>
              </div>
            </template>
          </div>
        </n-popover>
        <!-- 一键提交迷你钮（chip 旁直达，免去点开气泡的两击；
 表格聚焦时 Ctrl+S / Ctrl+Enter 同效） -->
        <button v-if="pending.size" class="pend-mini-commit" :disabled="committing"
                title="提交全部待提交更改（表格聚焦时 Ctrl+S / Ctrl+Enter 同效）"
                @click="commitPending()">
          <Send :size="11" /> 提交
        </button>
        <span class="rt-bar-div" role="separator" />
        <!-- 导出唯一入口——一键按默认格式直出（默认 CSV 可在右键菜单切换，记住为偏好）；
 格式清单从主界面彻底移除（用户裂开点：菜单不该常驻出现）。
 ⚠ aria-label 必须给：窄档（容器 ≤1180px）会把可见文字 .rt-exp-btn-t 隐藏只留图标，
 没有 aria-label 就成了**无名称按钮**（读屏只念「按钮」，键盘用户也无从得知这是导出）。 -->
        <button class="btn sm ghost rt-exp-btn" :aria-label="`导出为 ${expFmt.toUpperCase()}（${selected.size ? '选中 ' + selected.size + ' 行' : '当前页'}）`" :title="`导出${selected.size ? `选中 ${selected.size} 行` : '当前页'}为 ${expFmt.toUpperCase()}（右键单元格可切换默认格式）`" :disabled="!hits.length" @click="exportRows(expFmt)">
          <FileDown :size="13" />
          <span class="rt-exp-btn-t">导出</span>
        </button>
        <!-- 1148：表格快照 PNG 从工具行移入「视图 ⋯」——截图是低频分享动作，
 常驻在工具行上既占宽也在视觉上与「导出」抢注意力；同一 aria-label 保住测试与读屏。 -->
        <!-- 工具钮全部「图标+文字」自解释（dbx 工具栏语言，纯图标让人猜是散落感根源） -->
        <!-- 行高三档循环 + 列宽重置双钮合并「视图 ⋯」聚合钮（行高改显式三选带
 当前档 ✓，比连点循环可预期；列宽重置=低频破坏性弱操作，菜单底项+分隔线隔离） -->
        <span class="menu-wrap">
          <button aria-label="视图设置" class="btn sm ghost rt-tool-btn" :class="{ on: viewMenuOpen }"
            aria-haspopup="menu" :aria-expanded="viewMenuOpen" title="视图：行高、列宽"
            @click.stop="toggleViewMenu($event)">
            <SlidersHorizontal :size="13" /><span class="rt-tool-t">视图 ⋯</span>
          </button>
          <div v-if="viewMenuOpen" class="rt-menu" role="menu" aria-label="视图设置" :style="{ maxHeight: viewMenuMaxH + 'px' }">
            <div class="rt-m-t">行高（当前：{{ rowHLabel }}）</div>
            <button class="rt-mi" :class="{ on: rowH === 'compact' }" role="menuitemradio" :aria-checked="rowH === 'compact'"
              @click="setRowH('compact'); closeMenus()">紧凑</button>
            <button class="rt-mi" :class="{ on: rowH === 'standard' }" role="menuitemradio" :aria-checked="rowH === 'standard'"
              @click="setRowH('standard'); closeMenus()">标准</button>
            <button class="rt-mi" :class="{ on: rowH === 'cozy' }" role="menuitemradio" :aria-checked="rowH === 'cozy'"
              @click="setRowH('cozy'); closeMenus()">宽松</button>
            <div class="rt-m-sep" role="separator"></div>
            <button :aria-label="'重置全部列宽'" class="rt-mi" role="menuitem" title="重置全部列宽（拖拽过的列回原始宽）"
              :disabled="!Object.keys(colWidths).length" @click="resetColWidths(); closeMenus()">
              ⤺ 重置全部列宽
            </button>
            <!-- 1143：表格级视图开关归位——聚合行/转置/语义格式化作用于整张表，
 不属于「某一列」的列头菜单；与行高/列宽同属「视图」心智一处可达（QRT 同构）。 -->
            <div class="rt-m-sep" role="separator"></div>
            <button :aria-label="'表格快照 PNG'" class="rt-mi" role="menuitem" title="表格快照 PNG（当前页，含工具行与表头）"
              :disabled="!hits.length" @click="snapshotPng(); closeMenus()">
              <Camera :size="12" /> 快照 PNG（当前页）
            </button>
            <div class="rt-m-sep" role="separator"></div>
            <div class="rt-m-t">表格视图</div>
            <button class="rt-mi" role="menuitemcheckbox" :aria-checked="aggOn"
              :aria-label="aggOn ? '聚合行：开' : '聚合行：关'" title="底部聚合行（数值列 Σ/avg；勾选行时只算所见集）"
              @click="toggleAggRow(); closeMenus()">{{ aggOn ? '✓ ' : '' }}聚合行</button>
            <button class="rt-mi" role="menuitemcheckbox" :aria-checked="transpose" :aria-label="transpose ? '转置视图：开' : '转置视图：关'"
              title="转置视图（字段为行、文档为列）" @click="toggleTranspose(); closeMenus()">{{ transpose ? '✓ ' : '' }}转置视图</button>
            <button class="rt-mi" role="menuitemcheckbox" :aria-checked="semPref" :aria-label="semPref ? '语义格式化：开' : '语义格式化：关'"
              title="语义格式化（bytes/时长/百分比只改显示；复制与导出恒原始值）"
              @click="semPref = !semPref; closeMenus()">{{ semPref ? '✓ ' : '' }}语义格式化</button>
          </div>
        </span>
        <!-- 列选合并 ColPicker 共享件（与 QueryResultTable 同一实现）；
 types 透传（工蚁3 契约）——弹层字段名旁类型徽标与列头徽标同源 -->
        <ColPicker :cols="allCols" :selected="visibleCols" label="列选" :types="fieldTypes" @update:selected="visibleCols = $event" @locate="locateCol" />
        <!-- 列布局方案收纳（TablePresetMenu 单钮+弹层，铁律 C）——652 内核
 preset 三操作消费面；ColPicker 同款共享件，位次=列宽后（291 钮序锁兼容追加） -->
        <TablePresetMenu :presets="presets" :save="savePreset" :apply="applyPreset" :del="deletePreset" btn-cls="rt-tool-btn" />
        <!-- v3.0.1:消费方注入位——落在工具簇末尾,与导出/列宽同排 -->
        <slot name="bar-extra" />
        <!-- 内建放大/还原(表格自带,不再逐视图接线) -->
        <template v-if="focusable !== false">
          <span class="rt-bar-div" role="separator" />
          <button class="btn sm ghost rt-tool-btn" :aria-label="focused ? '还原结果表' : '放大结果表'"
            :title="focused ? '还原（Esc 也可退出）' : '放大结果表（整表铺满全屏，工具行随行可达）'"
            @click="focused = !focused">
            <Minimize2 v-if="focused" :size="13" />
            <Maximize2 v-else :size="13" />
          </button>
        </template>
        <template v-if="selected.size">
          <span class="rt-bar-div" role="separator" />
          <button class="btn sm ghost" @click="invertSel" title="反选当前视图行">反选</button>
        </template>
      </template>
    </TableShell>



    <!-- 表格 -->
    <!-- hideBody（缺省 false 零增量）——消费方实现 JSON/Tree/卡片视图时
 表格体隐藏、工具行（bar）常驻：视图切换 seg 寄居 bar-prepend，展示形式切换不再
 连工具行一起消失（查询工作台/索引工作台同一语言）。 -->
    <!-- 回顶锚点壳——.rt-backtop 此前锚 .rt 整卡底沿（absolute right/bottom），
 压住流内最后一行 .rt-status 右端控件（「转置/单行自动」checkbox，实报遮挡）；
 .rt-wrap 是滚动容器不能直接做定位壳（absolute 子级随滚动），外包本壳承接定位，
 回顶钮锚壳底=滚动视口底，状态栏留壳后流内不再被盖。类名/right/bottom 值零变
 （backTop258 行为锁零触、tableBarUnify541 rt-wrap 开标签字面零触） -->
    <div class="rt-wrap-shell">
    <!-- 守卫改用 !hideBody→!bodyHidden（hideBody ∪ 内建 viewSeg 非表格档；
 viewSeg=false 时两值恒等≡原契约零回归） -->
    <div v-show="!bodyHidden" ref="wrapEl" class="rt-wrap scroll-y" @scroll.passive="onWrapScroll">
      <table class="tbl rt-tbl zebra" v-if="!loading && !effTranspose" v-show="!quickEmpty">
        <thead>
          <tr>
            <th class="rt-chk">
              <input type="checkbox" :checked="allChecked" :indeterminate="selected.size > 0 && !allChecked" @change="toggleAll" aria-label="全选当前视图行" title="全选/取消全选（当前视图全部行）" />
            </th>
            <th class="rt-idx">#</th>
            <th v-for="c in visibleCols" :key="c" class="rt-th" :class="{ 'rt-col-frozen': isFrozenCol(c), 'rt-col-flash': flashCol === c,
              'rt-drop-before': colDragOver === c && colDragPlace === 'before' && colDragCol !== c,
              'rt-drop-after': colDragOver === c && colDragPlace === 'after' && colDragCol !== c }" :data-col="c" :style="frozenStyle(c)" :title="thTitle(c)"
              :aria-sort="chainCount > 0 && dispChain[0].f === c ? (dispChain[0].d === 'asc' ? 'ascending' : 'descending') : undefined" @click="sortBy(c, undefined, $event.shiftKey)"
              @dragover="onDragOver($event, c)" @drop="onDrop($event, c)"
              @contextmenu.prevent="openColMenu($event, c)"
              @keydown="onColMenuKey($event, c)"
              tabindex="0" @keydown.enter.prevent.stop="sortBy(c)" @keydown.space.prevent.stop="sortBy(c)">
              <!-- 1147：列头静息态只显示列名（表头第一行元素过多会互相挤掉列名）。
 排序箭头与类型徽标都改为「悬停/聚焦/已排序」才出现，且不参与宽度分配——
 列宽始终留给列名本身；类型全称仍在 th title 里。 -->
              <span class="rt-th-in">
                <span class="rt-th-name" :class="{ 'rt-drag-src': colDragCol === c }" draggable="true"
                  :title="isFrozenCol(c) ? '冻结列不可拖动（先取消冻结再移动）' : '拖动重排此列'"
                  @dragstart="onDragStart($event, c)" @dragend="onDragEnd">
                  <span class="rt-th-label">{{ c }}</span>
                  <span v-if="props.fieldTypes?.[c]" class="rt-th-type" :class="typeCls(props.fieldTypes[c])">{{ props.fieldTypes[c] }}</span>
                  <ArrowUpDown v-if="!chainHas(c)" :size="10" class="rt-th-sort-hint" />
                  <ArrowUp v-else-if="chainDir(c) === 'asc'" :size="11" class="rt-th-sort-on" />
                  <ArrowDown v-else :size="11" class="rt-th-sort-on" />
                  <sup v-if="chainHas(c) && chainCount > 1" class="rt-sort-ord">{{ chainOrd(c) + 1 }}</sup>
                </span>
              </span>
              <!-- P0-4：列头筛选漏斗（QRT 同款；激活实色高亮；stop 防触发排序）；
 激活并集口径 funnelOn（等值∪区间∪包含，QRT 552 同构收尾——
 此前只认等值勾选，区间/包含档生效漏斗不亮是暗状态可见性缺口） -->
              <button class="rt-funnel" :class="{ on: funnelOn(c) }" :aria-label="'筛选 ' + c + ' 列'" title="筛选此列"
                @click.stop="openFilter($event, c)" @keydown.stop>
<Filter :size="10" />
</button>
              <!-- v3.0.0：拖拽柄键盘可达——聚焦后 ←/→ 微调列宽（±32px/击），Enter=自适应 -->
              <span class="rt-rs" role="slider" tabindex="0" :aria-label="'调整 ' + c + ' 列宽（←/→ 微调，Enter 自适应）'" title="拖拽调整列宽；双击自适应内容" @click.stop @dblclick="fitCol(c)" @mousedown="startResize($event, c)"
                @keydown.left.prevent.stop="nudgeColWidth(c, -32)" @keydown.right.prevent.stop="nudgeColWidth(c, 32)" @keydown.enter.prevent.stop="fitCol(c)"></span>
            </th>
            <th class="rt-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <!-- 大结果集渲染保护——超 MAX_RENDER 只渲染前 N 行（万行 DOM 会拖死交互），
 排序/勾选/导出仍作用于全量；行尾内嵌提示引导用导出取全量。
 W7：template v-for 包行+行内展开行（key 移至 template，渲染结果不变） -->
          <template v-for="(hit, ri) in renderHits" :key="hit._id">
          <!-- tr class 改数组形态——第二位接 rowClass 契约（undefined 时零附加，渲染不变） -->
          <tr :class="[{ sel: selected.has(hit._id), 'rt-row-focus': tblFocus && !editing && ri === focusIdx }, rowCls(hit, ri)]">
            <td class="rt-chk">
              <!-- 勾选框可达名（屏幕阅读器/键盘用户可知语义；对照行内按钮均有 aria-label） -->
              <input type="checkbox" :checked="selected.has(hit._id)" :aria-label="'选中第 ' + (ri + 1) + ' 行（' + hit._id + '）'" @click="onChkClick($event, ri)" />
            </td>
            <td class="rt-idx mono">{{ ri + 1 }}</td>
            <td
              v-for="(c, ci) in visibleCols" :key="c"
              :style="frozenStyle(c)"
              class="rt-cell"
              :class="{
                'rt-col-frozen': isFrozenCol(c),
                pended: pendingCell(hit._id, c),
                'agg-sel': aggCells.has(cellKey(hit._id, c)),
                expanded: expandedCells.has(cellKey(hit._id, c)),
                'rt-region': regionKeys.has(ri + ':' + ci),
                'rt-region-anchor': !!touchAnchor && touchAnchor.ri === ri && touchAnchor.ci === ci,
                'num-col': numericCols.has(c),
                'ip-col': semPref && isIpCol(c),
                'rt-hit': isSearchHit(ri, ci),
                'rt-hit-cur': isSearchCur(ri, ci),
                ...semToneCls(displayVal(hit, c), c),
              }"
              :data-ri="ri"
              :data-col="c"
              :title="cellTitle(hit, c)"
              @dblclick="startEdit(hit, c)"
              @mousedown="onCellDown($event)"
              @mousedown.left="onRegionStart($event, ri, ci)"
              @pointerdown="onCellPointerDown($event, ri, ci)"
              @pointerup="onCellPointerUp"
              @pointercancel="onCellPointerUp"
              @click.ctrl.exact="toggleAggCell(hit, c)"
              @click.exact="onCellClick($event, hit, c)"
              @contextmenu.prevent="openCellMenu($event, hit, c, ri)"
              @keydown.enter.exact.prevent="onCellClick($event, hit, c)"
            >
              <template v-if="editing && editing.id === hit._id && editing.field === c">
                <input
                  ref="editInp"
                  class="rt-edit mono"
                  v-model="editing.value"
                  @compositionstart="imeComposing = true"
                  @compositionend="imeComposing = false"
                  @keydown.enter="onEditEnter"
                  @keydown.esc="editing = null"
                  @keydown.tab.prevent.stop="tabEdit($event.shiftKey)"
                  @blur="applyEdit"
                />
              </template>
              <template v-else>
                <!-- epoch 毫秒人性化显示（title/copy 保留原始值）；空值灰 ∅；单击复制 -->
                <span class="rt-val" :class="cellCls(displayVal(hit, c))" v-if="!cellText(displayVal(hit, c))"><span class="rt-null">∅</span></span>
                <!-- W-A：ES highlight 片段优先（normalizeResp 透传）——片段是 ES 直出 HTML，
 经 hlSafe 净化（只放行 em/mark 标签，其余转义为纯文本）后才进 v-html -->
                <span class="rt-val rt-hl" v-else-if="hlHtml(hit, c)" v-html="hlHtml(hit, c)"></span>
                <span class="rt-val" :class="cellCls(displayVal(hit, c))" v-else-if="epochText(displayVal(hit, c))">{{ epochText(displayVal(hit, c)) }}</span>
                <!-- W7：长 JSON 对象折叠预览 chip——首键短预览+{…}N 键；点击开既有单元格详情弹窗
 （不引入第二套展开态）；title 恒 raw 全串（铁律） -->
                <button v-else-if="objChip(displayVal(hit, c))" class="rt-json-chip" :title="cellTitle(hit, c)"
                        :aria-label="'查看 ' + c + ' 完整值（对象 ' + (objChip(displayVal(hit, c))?.n ?? 0) + ' 键）'"
                        @click.stop="cellDetail = { hit, col: c }">
                  <span class="rt-json-chip-p mono">{{ objChip(displayVal(hit, c))?.label }}</span>
                  <span class="rt-json-chip-n mono">{…}{{ objChip(displayVal(hit, c))?.n }} 键</span>
                </button>
                <span class="rt-val" :class="cellCls(displayVal(hit, c))" v-else>
                  <!-- P0-1：命中格文本切 mark（splitMark 纯函数，无 v-html）
 W7：非命中分支走 semText 语义显示（date 本地化/数值千分位；关闭回落原样）；
 命中分支同口径切分，保「所见即所搜」对齐 -->
                  <template v-if="isSearchHit(ri, ci)"><template v-for="(seg, si) in splitMark(semText(displayVal(hit, c), c), searchDeferred)" :key="si"><mark v-if="seg.m" class="rt-mark">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></template>
                  <template v-else>{{ semText(displayVal(hit, c), c) }}</template>
                </span>
                <span v-if="pendingCell(hit._id, c)" class="rt-old mono">{{ cellText(hit._source[c]) }}</span>
              </template>
            </td>
            <td class="rt-act">
              <!-- 1364：行尾此前平铺 7 个 22px 图标钮（查看/编辑/展开/复制 JSON/解释得分/
                   词频取证/删除），正对用户反复说的「太多功能平铺」。按项目右键约定收成
                   一级 2 个高频 +「更多 ⋯」：查看、展开留在行内（点开文档/就地看整行是最高频），
                   其余 5 个进菜单；动作本体、emit、守卫条件逐字不变。 -->
              <button aria-label="查看文档" class="btn sm ghost" title="查看文档" @click="emit('open-doc', hit)"><Eye :size="12" /></button>
              <!-- W7：行内展开详情钮（ChevronRight/Down）——free 多行展开，Esc 全收（E=焦点行同款） -->
              <button class="btn sm ghost rt-row-expand" :aria-label="expandedRows.has(rowKey(hit, ri)) ? '收起此行详情' : '展开此行详情'"
                :title="expandedRows.has(rowKey(hit, ri)) ? '收起此行详情（Esc 全部收起）' : '展开此行详情（焦点行按 E）'"
                @click="toggleRowExpand(rowKey(hit, ri))">
                <ChevronDown v-if="expandedRows.has(rowKey(hit, ri))" :size="12" />
                <ChevronRight v-else :size="12" />
              </button>
              <button class="btn sm ghost rt-row-more" aria-label="此行更多操作" title="此行更多操作（编辑 / 复制 JSON / 解释得分 / 词频取证 / 删除）"
                aria-haspopup="menu" @click.stop="openActMenu($event, hit, ri)"><MoreHorizontal :size="12" /></button>
              <!-- W7：消费方行级行动注入位——无注入零占位 -->
              <slot name="row-actions" :hit="hit" :ri="ri" />
            </td>
          </tr>
          <!-- W7：行内展开详情行——完整行嵌 JsonTree（防爆炸参数与详情弹窗同款 200/4000）；
 随壳合并 TableExpandRow（QRT 同构段单一出处），DOM 逐字节不变 -->
          <TableExpandRow :open="expandedRows.has(rowKey(hit, ri))" :colspan="visibleCols.length + 3"
            :label="rowKey(hit, ri)" :label-title="hit._id" :data="rowSource(hit)" @close="toggleRowExpand(rowKey(hit, ri))" />
          </template>
          <!-- 筛选后空集提示行（QRT 79 行同款文案同款逃生口）——
 此前筛选把行集清空后 tbody 直接空白，无提示无出路 -->
          <tr v-if="activeFilterCount && !filteredHits.length && !renderTruncated" class="rt-trunc-row">
            <td :colspan="visibleCols.length + 3">
              筛选条件无匹配行——点列头筛选图标可清除
            </td>
          </tr>
          <!-- 截断保护提示行（渲染尾）——排序/勾选/导出仍作用于全量；
 QRT 增量渲染平移——ref=sentinel 供滚动到底自动续渲（脚本
 truncSentinel watch）+「继续渲染下 2000 行」钮（按钮兜底/显式触发），行数口径
 随 renderHits.length 动态（续渲后 2000→4000→…不再失真） -->
          <tr v-if="renderTruncated" ref="truncSentinel" class="rt-trunc-row">
            <td :colspan="visibleCols.length + 3">
              已渲染前 {{ renderHits.length }} 行（共 {{ sortedHits.length }} 行命中排序与筛选）
              <button class="btn sm ghost" style="margin-left:var(--sp-2h)" @click="renderMore">继续渲染下 {{ MAX_RENDER }} 行</button>
              ——完整数据请用「导出」，或缩小查询 size
            </td>
          </tr>
        </tbody>
        <!-- 聚合 footer 行（列头菜单「聚合行」开关，默认关，es_tbl_agg:<dim> 记忆）——
 数值列 Σ/avg 复用 useColStats.statsOf 口径（过滤后行集，与列详情弹窗同一数字）；
 冻结列 sticky 经既有 rt-col-frozen 机制同步（frozenStyle 内联 left 一致）
 同构段合并 TableAggFoot 片段组件（QRT 同款单一出处；chk/act 占位
 cell 由组件 prefix==='rt' 分支承接，DOM 逐字节；样式同步更新组件全局单源） -->
        <TableAggFoot v-if="aggOn" prefix="rt" :cols="visibleCols" :foot="aggFoot" :spark="aggSpark"
          :dist="aggDist"
          :empty-pct="aggEmptyPct" :frozen-of="(c) => isFrozenCol(c)" :style-of="(c) => frozenStyle(c)"
          :sel-hint="aggSelHint" />
      </table>

      <!-- Transpose 转置视图： P1-3 多行版——解除 hits===1 限制，
 字段名做左固定列（sticky+min-width 铁律），前 N 条文档做横向列（档位记忆）；
 转置态只读镜像（无编辑/框选绑定） -->
      <table v-else-if="!loading" class="tbl rt-tbl rt-transposed">
        <thead>
          <tr>
            <th class="rt-t-field">字段</th>
            <th v-for="h in transposeHits" :key="h._id" class="mono rt-t-hid" :title="h._id">{{ trunc(h._id, 20) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="rt-t-key mono">_id</td><td v-for="h in transposeHits" :key="'i' + h._id" class="mono rt-t-val">{{ h._id }}</td></tr>
          <tr v-for="c in allCols" :key="c">
            <td class="rt-t-key mono" :title="c">{{ c }}</td>
            <td v-for="h in transposeHits" :key="c + h._id" class="mono rt-t-val">{{ cellText(getSourceVal(h, c)) }}</td>
          </tr>
        </tbody>
      </table>
      <!-- W-A：骨架/空态链参数化（QRT 同款形态）——行数/行高/高度/文案
 由 props 注入，缺省=既有现状（ 5 行 26px 60vh）。copywritingGuard294 锁
 text="无数据" 口径：默认值 emptyText:'无数据'（withDefaults），串在此注释互锚 -->
      <template v-if="loading">
        <div class="rt-loading" :style="{ maxHeight }">
          <SkeletonBox v-for="i in skeletonRows" :key="i" :height="skeletonH" round style="margin-bottom:var(--sp-1h)" />
        </div>
      </template>
      <EmptyState v-else-if="!hits.length" :icon="Inbox" :text="emptyText" :hint="emptyHint" />
      <!-- W-B：quickFilter 生效且过滤后 0 行并入空态链（QRT 同款；
 文案走既有 emptyText/emptyHint；上一行 rtLoadingSkeleton268 锁字面零触碰） -->
      <EmptyState v-else-if="quickActive && !quickHits.length" :icon="Inbox" :text="emptyText" :hint="emptyHint" />
    </div>
    <!-- 长列表回顶——滚过一屏出现悬浮钮，点击丝滑归位（2000 行渲染下
 滚到底再滚回是最频繁的痛点操作）；：随壳合并 TableBacktop，class 透传 DOM 不变；
 移入 rt-wrap-shell 定位壳（rt-wrap 之后兄弟），锚滚动视口底沿不再盖壳外状态栏 -->
    <TableBacktop v-if="showTop" class="rt-backtop" aria-label="回到顶部" title="回到顶部" @top="backToTop" />
    </div>

    <!-- 内建 alt 视图体（viewSeg 非表格档）——AltHitsViews 单源三档（565 共享件，
 勿再造壳=注执行），容器=border-top 分节+滚动区（QRT 607 同语言），maxHeight
 与骨架一口径无新高度链；卡片档网格容器（ih-cards 同构）+@open-doc 透传宿主。
 表格档（缺省/回落）恒不渲染（零增量） -->
    <div v-if="viewSegOn && effView !== 'table'" class="rt-alt-body scroll-y" :class="{ 'is-cards': effView === 'cards' }" :style="{ maxHeight }">
      <!-- 文档导航条（914 能力矩阵统一）：json/tree 档触达与表格/卡片同一 open-doc 链 -->
      <AltHitsViews v-if="effView === 'json'" view="json" :json-html="jsonHtml" :doc-count="props.hits.length" :doc-ids="props.hits.map(h => h._id)" @open-doc-at="i => { const h = props.hits[i]; if (h) emit('open-doc', h) }" />
      <AltHitsViews v-else-if="effView === 'tree'" view="tree" :tree-data="treeData" :doc-count="props.hits.length" :doc-ids="props.hits.map(h => h._id)" @open-doc-at="i => { const h = props.hits[i]; if (h) emit('open-doc', h) }" />
      <AltHitsViews v-else view="cards" :hits="cardHitsAdapted" @open-doc="emit('open-doc', $event)" />
    </div>

    <!-- 宿主自有备选视图体插槽（914 能力矩阵统一）：hideBody 时本表格体隐藏、
 宿主 alt 视图经此插槽随放大容器全屏显示（放大态四视图不再空白）——
 不受 bodyHidden 控制（显隐归宿主 v-show 自管） -->
    <slot />

    <!-- 状态栏：聚合 + 选中（bodyHidden=hideBody∪内建非表格档时与表格体一并隐藏——
 操作提示只对表格视图有意义） -->
    <div class="rt-status" v-show="!bodyHidden">
      <template v-if="aggStats">
        <span class="rt-stat">Σ {{ fmtNum(aggStats.sum) }}</span>
        <span class="rt-stat">avg {{ aggStats.avg?.toFixed(2) }}</span>
        <span class="rt-stat">min {{ fmtNum(aggStats.min) }}</span>
        <span class="rt-stat">max {{ fmtNum(aggStats.max) }}</span>
        <span class="rt-stat">count {{ fmtNum(aggStats.count) }}</span>
        <span class="rt-stat-hint">Ctrl+点击单元格加减</span>
      </template>
      <span v-else class="rt-stat-hint">{{ canWrite ? '双击编辑 · Shift+点击范围选 · Ctrl+点击数值聚合' : 'Shift+点击范围选 · Ctrl+点击数值聚合' }}</span>
      <!-- 行导航快捷键提示迁状态栏（实报「点击的时候表格表头布局变形了」——
 原在工具行 inline 占布局，表格获焦即插入把视图 seg/分页器挤换行；状态栏空间独立
 且只对表格视图有意义，形态/类名零触碰=可发现性语义与 rtRowNav 行为锁保留） -->
      <span v-if="tblFocus && hits.length" class="rt-kbd-hint mono" title="表格已获焦：↑↓ 切换行、Home/End 跳首末行、Enter 打开文档、Ctrl+C 复制行 JSON、Ctrl+F 结果内查找、Delete/Backspace 删除勾选行（有确认）、Esc 清勾选/清框选">↑↓ Home/End · Enter ⌫ · Ctrl+F</span>
      <div style="flex:1"></div>
      <label class="rt-transpose" title="转置视图：字段为行、文档为列">
        <input type="checkbox" :checked="transpose" @change="toggleTranspose" /> 转置
      </label>
      <!-- P1-3：转置行数档位（前 N 条文档做横向列） -->
      <select v-if="transpose" class="rt-t-n mono" :value="transposeN" title="转置显示的文档行数"
        @change="setTransposeN(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="n in transposeNs" :key="n" :value="n">{{ n }} 行</option>
      </select>
      <label class="rt-transpose" title="单条结果自动进入转置视图">
        <input type="checkbox" v-model="autoTranspose" /> 单行自动
      </label>
    </div>

    <!-- 选中浮动栏 -->
    <transition name="pop">
      <div v-if="selected.size" class="rt-float">
        <span class="rt-float-n">已选 <b>{{ selected.size }}</b> 条</span>
        <button class="btn sm" @click="copyIds"><Copy :size="12" /> 复制 _id</button>
        <button class="btn sm" @click="exportRows('json')"><FileDown :size="12" /> JSON</button>
        <button class="btn sm" @click="exportRows('csv')"><FileDown :size="12" /> CSV</button>
        <!-- 批量删除 rank3+ 可见（delete-by-id=CLUSTER 档） -->
        <button v-if="canOps" class="btn sm danger" @click="emit('batch-delete', [...selected])"><Trash2 :size="12" /> 删除</button>
        <button aria-label="清除已选中文档" class="btn sm ghost" @click="clearSel"><X :size="12" /></button>
      </div>
    </transition>

    <!-- 框选区域浮动栏（dbx 选区语言——框完即可复制矩阵，TSV 含表头行）；
 框选自动聚合直读（Σ/avg/数值占比） -->
    <!-- 1441：触屏两击框选的第一步——起点已设，等第二角。没有这条，平板用户
         长按后看不到任何变化，不知道自己在框选状态里 -->
    <transition name="pop">
      <div v-if="touchAnchor && !region" class="rt-float rt-float-anchor">
        <span class="rt-float-n">已设框选起点 · 点另一个单元格完成框选</span>
        <button aria-label="取消框选起点" class="btn sm ghost" @click="clearRegion"><X :size="12" /></button>
      </div>
    </transition>
    <transition name="pop">
      <div v-if="region && !regionAnchor" class="rt-float">
        <span class="rt-float-n">已框选 <b>{{ (region.ri2 - region.ri1 + 1) * (region.ci2 - region.ci1 + 1) }}</b> 格<span v-if="regionSummary">（数值 {{ regionSummary.numCount }}/{{ regionSummary.count }}）</span></span>
        <span v-if="regionSummary && regionSummary.numCount" class="rt-float-agg mono">Σ <b>{{ fmtNum(regionSummary.sum) }}</b> · avg <b>{{ regionSummary.avg ? regionSummary.avg.toFixed(2) : '' }}</b></span>
        <button class="btn sm" @click="copyRegionTsv('tsv')"><Copy :size="12" /> 复制 TSV</button>
        <button class="btn sm" @click="copyRegionTsv('json')"><Braces :size="12" /> 复制 JSON</button>
        <button aria-label="清除框选" class="btn sm ghost" @click="clearRegion"><X :size="12" /></button>
      </div>
    </transition>

    <!-- Pending 预览 -->
    <n-modal v-model:show="previewOpen" preset="card" title="待提交更改预览" style="width:640px;max-width:92vw" :bordered="false">
      <div class="pv-list">
        <div v-for="[id, fields] in pending" :key="id" class="pv-item">
          <div class="pv-id mono">{{ id }}</div>
          <div v-for="[field, ch] in fields" :key="field" class="pv-row" :class="{ 'pv-failed': lastFailed.has(cellKey(id, field)) }">
            <span class="pv-field mono">{{ field }}<span v-if="lastFailed.has(cellKey(id, field))" class="pv-fail-tag">上次失败</span></span>
            <span class="pv-old mono">{{ cellText(ch.oldVal) }}</span>
            <ArrowRight :size="12" style="color:var(--tx2);flex-shrink:0" />
            <span class="pv-new mono">{{ cellText(ch.newVal) }}</span>
            <button aria-label="撤销此项" class="btn sm ghost" title="撤销此项" @click="revertOne(id, field)"><X :size="11" /></button>
          </div>
        </div>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="previewOpen = false">关闭</button>
          <button class="btn pri" :disabled="committing" @click="previewOpen = false; commitPending()">提交 {{ pendingCount }} 项</button>
        </div>
      </template>
    </n-modal>

    <!-- P0-2：单元格详情弹层（dbx CellDetail 对位）——
 完整值嵌 JsonTree（tools 自带搜索/复制）；maxChildren/maxStrLen 防 MB 级值拖死弹层 -->
    <n-modal v-model:show="detailOpen" preset="card" title="单元格详情" style="width:680px;max-width:92vw" :bordered="false">
      <div class="rt-d-meta mono">{{ detailMeta }}</div>
      <JsonTree :data="detailData" tools :max-children="200" :max-str-len="4000" />
    </n-modal>

    <!-- P0-4：列筛选弹层；：壳合并共享件 ColFilterPopover
 （五处同构壳一处实现），useColFilters 逻辑零改动；
 mask 定位+fitPopupPos 碰撞自适应随组件 fit 内建（语义平移不变）；
 组合档切换钮（AND/OR 就地翻转，与提示行同钮）
 contains 档接入（QRT 552 对称件）——isContainsCol 守卫门控
 （非语义类型/ip 列无文本包含语义不出包含行），@set-contains 接线 useColFilters
 件③：组合档钮换内建 chip（件③ QRT 半边的 RT 对称件）——
 default 槽手搓钮退役，popover :filter-mode prop 内建 cfp-hd 头部 chip
 （cfp-fmode，aria/title 与 561 行为锚同语汇）；.rt-fmode 样式保留
 （TableFilteredHint 提示行第二注入位同消费，非孤儿） -->
    <ColFilterPopover
      v-if="filterPop"
      :col="filterPop.col" :x="filterPop.x" :y="filterPop.y" fit
      :vals="fvals.vals" :total="fvals.total" :has-more="fvals.hasMore" show-has-more bars
      :selected="colFilters[filterPop.col] ?? []" :norm-of="normVal" :label-of="filters.labelOf"
      search :kw="filterKw" @update:kw="filterKw = $event"
      :range="isRangeCol(filterPop.col)"
      :range-min="rangeFilters[filterPop.col]?.min ?? ''" :range-max="rangeFilters[filterPop.col]?.max ?? ''"
      :range-min-ph="rangePlaceholder(filterPop.col, 'min')" :range-max-ph="rangePlaceholder(filterPop.col, 'max')"
      :contains="isContainsCol(filterPop.col)" :contains-val="containsFilters[filterPop.col] ?? ''"
      :filter-mode="filterModeLive" @toggle-filter-mode="toggleFilterMode"
      @toggle="toggleFilterVal(filterPop.col, $event)" @clear="clearFilter(filterPop.col)"
      @set-range="(side, v) => filterPop && setRangeFilter(filterPop.col, side, v)"
      @set-contains="(v) => filterPop && setContainsFilter(filterPop.col, v)"
      @close="filterPop = null"
    />
    <!-- P2-3：列详情弹层（轻量统计版）；：弹窗形态与统计内核
 下沉共享件（ColDetailModal + useColStats），QRT 同步接入同一弹窗 -->
    <ColDetailModal v-model:show="colDetailOpen" :stats="colDetailStats" :label-of="filters.labelOf" />

    <!-- W3：rowDrawer 行详情侧拉平移 RT（QRT W-B 同款，行为逐字对齐）——
 整行键值对 + 逐格复制 + 页脚「复制整行 JSON」（copyRowJson 同一口径）；
 仅 rowDrawer prop 开启且右键「行详情」后可达，缺省整块零渲染（零增量） -->
    <n-drawer v-model:show="rdwOpen" :width="rdwW" placement="right">
      <n-drawer-content title="行详情" closable>
        <div v-if="rdwRow" class="rt-rdw-body">
          <div class="rt-rdw-meta mono">第 {{ rdwRow.ri + 1 }} 行 · {{ visibleCols.length }} 列</div>
          <div v-for="c in visibleCols" :key="c" class="rt-rdw-row">
            <span class="rt-rdw-k mono" :title="c">{{ c }}</span>
            <span class="rt-rdw-v mono" :title="rdwRow ? rtCellFullText(displayVal(rdwRow.hit, c)) : ''">{{ rdwRow ? cellText(displayVal(rdwRow.hit, c)) : '' }}</span>
            <button class="btn ghost xs" :aria-label="'复制 ' + c" title="复制该格全文" @click="copyDrawerCell(rdwRow.hit, c)"><Copy :size="11" /></button>
          </div>
        </div>
        <template #footer>
          <button v-if="rdwRow" class="btn sm" :aria-label="'复制行 JSON（第 ' + (rdwRow.ri + 1) + ' 行）'" @click="copyRowJson(rdwRow.hit)"><Braces :size="12" /> 复制整行 JSON</button>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 右键菜单迁移到共享 CellContextMenu（RT/QRT 复用同一组件） -->
    <CellContextMenu
      v-if="cellMenu"
      :x="cellMenu.x" :y="cellMenu.y" :title="cellMenu.col"
      :items="cellMenuItems"
      @close="closeCellMenu"
    />
    <!-- 列头右键=列管理菜单（与单元格菜单同一共享组件） -->
    <CellContextMenu
      v-if="colMenu"
      :x="colMenu.x" :y="colMenu.y" :title="colMenu.col"
      :items="colMenuItems"
      @close="colMenu = null"
    />
    <!-- 1163：工具行右键——「表格格式/表格操作那个表头」上的动作与列头/单元格同源，
         一级只放最常用几项，其余收进「更多…」二级。 -->
    <CellContextMenu
      v-if="barMenu"
      :x="barMenu.x" :y="barMenu.y" :title="'表格工具 · ' + visibleCols.length + '/' + allCols.length + ' 列'"
      :items="barMenuItems"
      @close="barMenu = null"
    />
    <!-- 1364：行尾「更多 ⋯」——把原来平铺的 5 个低频行操作收进一级一入口 -->
    <CellContextMenu
      v-if="actMenu"
      :x="actMenu.x" :y="actMenu.y" :title="'第 ' + (actMenu.ri + 1) + ' 行 · 更多操作'"
      :items="actMenuItems"
      @close="actMenu = null"
    />
    <!-- TableBacktop 迁往 rt-wrap-shell 定位壳内（原位锚 .rt 整卡底沿盖状态栏，修订） -->
    <!-- P2-8：文档对比弹窗——多选 2~3 篇右键直达，基准可换；传所属索引名芯片 -->
    <DocDiffModal v-model:show="docDiffShow" :hits="docDiffHits" :base-idx="docDiffBase" :index="index" @base="docDiffBase = $event" />
  </div>
  </FocusableSurface>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, type Ref } from 'vue';
import { normalizePrefEnum } from '../utils/prefEnum';
import { usePref } from '../composables/urlState';
import { NModal, NDrawer, NDrawerContent, NPopover } from 'naive-ui';
import {
  ArrowUp, ArrowDown, ArrowRight, ArrowUpDown, Eye, EyeOff, Pin, MoveHorizontal, Trash2, Copy, ClipboardList, FileDown, X, Pencil, SearchCheck, ScanSearch, Inbox, RotateCcw, ChevronDown, ChevronRight, Braces, Table, Send, FileText, Search, Filter, Camera, GitCompareArrows, Maximize2, Minimize2, SlidersHorizontal, MoreHorizontal } from 'lucide-vue-next';
import ColPicker from './ColPicker.vue';
/* 列布局方案共享件（652 preset 内核消费面，RT/QRT 单一出处） */
import TablePresetMenu from './TablePresetMenu.vue';
import FocusableSurface from './FocusableSurface.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import DocDiffModal from './DocDiffModal.vue';
import EmptyState from './EmptyState.vue';
import SkeletonBox from './SkeletonBox.vue';
import HitNav from './HitNav.vue';
import JsonTree from './JsonTree.vue';
import ColDetailModal from './ColDetailModal.vue';
import TookBadge from './TookBadge.vue';
import Pagination from './Pagination.vue';
import { createPressGuard } from '../utils/pressGuard';
import TableShell, { TableExpandRow, TableBacktop } from './TableShell.vue';
import { api } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useTablePrefs } from '../composables/useTablePrefs';
import { useRowNav } from '../composables/useRowNav';
import { useGridSearch, splitMark } from '../composables/useGridSearch';
/* W-A：TableShell 第二刀——渲染截断/聚合底行随壳合并共享 composable，
 typeCls/NUMERIC_TYPES_RE 语义档收 utils/typeTiers 单一出处（QRT 同源） */
import { useRenderMore, MAX_RENDER } from '../composables/useRenderMore';
import { useAggRow } from '../composables/useAggRow';
import { typeCls, NUMERIC_TYPES_RE, RANGE_DATE_RE, isNonSemanticType, rangePlaceholderTxt, isIpType } from '../utils/typeTiers';
/* 聚合行迷你走势（零依赖纯 SVG 组件复用，QRT 同源）——随 tfoot
 合并 TableAggFoot 片段组件（内核模板不再直用，import 同步更新） */
import TableAggFoot from './TableAggFoot.vue';
import AltHitsViews from './AltHitsViews.vue'; /* ：alt 三视图体共享件单源（内建视图档消费，勿再造壳） */
/* bar-left 同构段三件合并（筛选态提示/内建搜索/刷新钮——QRT 同款单一出处） */
import TableFilteredHint from './TableFilteredHint.vue';
import TableQSearch from './TableQSearch.vue';
import TableRefreshBtn from './TableRefreshBtn.vue';
import { useColFilters, useFilterMode, quickFilterRows } from '../composables/useColFilters';
import { useColStats } from '../composables/useColStats';
/* W-B：语义格式化共享件（bytes/duration/percent 三型，纯函数；QRT 同源） */
import { semFormat } from '../composables/useSemFormat';
import { useColFit, COL_W_MIN, COL_W_MAX, frozenStyleOf } from '../composables/useColFit';
/* 比较器合并 tableSort.compareVals 单源（numeric 双试+沉底+localeCompare 兜底；
 numeric() 科学计数/时长新档经此双内核生效） */
import { compareVals, sortableGuard, useSortChain } from '../composables/tableSort';
import { resolveSortField } from '../utils/sortField';
import { useColDrag } from '../composables/useColDrag';
import { registerTable, unregisterTable } from '../utils/tableRegistry';
import ColFilterPopover from './ColFilterPopover.vue';
import { exportStamp, fmtNum, trunc, copyText, downloadText, downloadBlob, csvCell, epochMsText } from '../utils/format';
import { buildXlsx } from '../utils/xlsxMini';
import { snapshotTableToPng } from '../utils/tableSnapshot';
import { buildDsl, buildExistsDsl } from '../utils/dslFromCell';
import { buildBulkNdjson } from '../utils/bulkNdjson';
import { summarize } from '../utils/summarize';
import { matrixText } from '../utils/copyMatrix';
/* XLSX 双 sheet 装配合并 exportSheets.buildExportSheets 单源（QRT 同源） */
import { buildExportSheets } from '../utils/exportSheets';
/* （立牌兑现）：highlight 净化合并 highlightSanitize.hlSafe 单源
 （本地同构定义退役；白名单 em|mark 超集由单源并档承载，RT 行为零变化）。
 ⚠下方 `import { hlSafe }` 行有 queryHighlightChain 源码锁（`import { hlSafe } from
 '../utils/highlightSanitize'` 字面）逐字保全； T2 装配单源 hlSegment
 另行一行引入（净化仍单源 hlSafe，本文件 hlHtml 已改一行委托 hlSegment——hlSafe
 在本文件不再直接调用，保留行系锁面要求）。 */
import { hlSafe } from '../utils/highlightSanitize';
/* T2：片段装配（join ' … ' + 净化 + 空档短路）合并 hlSegment 单源——
 QRT highlight opt-in（新增）同源调用 */
import { hlSegment } from '../utils/highlightSanitize';
import type { SearchHit } from '../types';



const props = withDefaults(defineProps<{
  hits: SearchHit[];
  total: number;
  index: string;
  storageKey?: string;
  /** 显示「解释得分 / 词频取证」相关性调试入口（查询通道有 DSL 时开） */
  showRelevance?: boolean;
  /** 查询耗时 ms——并入工具行计数展示，省掉表格上方单独一条命中行 */
  took?: number | null;
  /** 字段类型映射（列名→ES 类型）——列头下方灰字类型徽标（dbx 学习） */
  fieldTypes?: Record<string, string>;
  /** P1-7：命中数为下界（ES track_total_hits 截断 relation=gte）——计数后加 + 标注 */
  totalGte?: boolean;
  /** 内置 loading 骨架（QRT 四态互斥同款——骨架优先于空态/表格）；
 宿主不再各自手搓骨架（IndexHub 外部骨架合并） */
  loading?: boolean;
  /** 内建放大（FocusableSurface）开关——默认开，嵌入式窄容器可关 */
  focusable?: boolean;
  /** W-D 契约：行级条件色档——返回值追加到每个数据行 tr class（空格拼接，
 与既有 sel/焦点类并存）；undefined/null/空串跳过。row=当前渲染 hit，index=渲染行序。
 缺省零增量 */
  rowClass?: (row: any, index: number) => string | undefined;
  /** 宿主在 bar-extra 槽里加了图标钮时，把等价的菜单项传进来——
      工具行右键是「表格操作那个表头」的完整入口，图标钮必须在那里也有可读的一条，
      否则窄档里清一色无文字图标，用户只能靠试。缺省空数组 = 既有行为零变化 */
  barMenuExtra?: CcmItem[];
  /** W-D 契约：导出加工——exportName=下载文件名主段（缺省维持 index- 现状）；
 exportCell=导出/复制矩阵单元格值加工（仅 exportRows 矩阵分支/matrixText 管道消费，
 不改表格显示；JSON 文档导出恒 raw）。两者缺省均零增量 */
  exportName?: string;
  exportCell?: (value: unknown, col: { key: string }, row: any) => unknown;
  /* W-B：语义渲染扩展开关（bytes/duration/percent，共享件 useSemFormat）——
 命中显示格式化 text（title/复制/导出恒 raw）；与既有 es_tbl_sem pref 层叠加不互斥；
 缺省不传=全链零变化 */
  semOn?: boolean;
  /* ═══ W-B：内核三件补齐（QRT 同款平移，全缺省零增量）═══
 quickFilter=跨可见列 contains 过滤（与既有列筛选 AND 叠加；生效且 0 行并入空态链）；
 selectable=selection-change 事件通道（勾选态仍归既有 selected，仅补 emit）；
 exportRowFilter=导出行级过滤（矩阵三格式 CSV/MD/XLSX 收口；JSON 文档导出恒 raw） */
  quickFilter?: string;
  selectable?: boolean;
  exportRowFilter?: (row: unknown) => boolean;
  /* W3：searchable 内建搜索框 opt-in（quickFilter 的 UI 面；QRT 同款平移）——
 true 时工具行（bar-left，与既有钮同排）内建搜索输入框，双绑驱动既有 quickFilter 过滤链
 （内部 ref 合成：输入非空以输入为准，空输入回落外部 quickFilter 播种值，prop 契约不破）；
 Esc 清词；缺省 false=无输入框（全站零增量）。
 refreshable 同款 opt-in（撤销 「refreshable 不加（ 为 QRT 专属）」
 ，对齐 QRT opt-in 形态）——true 时工具行刷新钮（形制逐字对齐 QRT 546 同款），
 点击只 emit 'refresh'（事件通道与提交链发射点既有，取数归宿主）；缺省 false 零增量 */
  searchable?: boolean;
  refreshable?: boolean;
  /* 行内编辑直达开关：true 时操作列增「编辑文档」钮（emit 'edit-doc'，宿主 openDoc(hit, true)
   直入编辑态）；缺省 false=无编辑链的宿主零增量、不渲染死钮 */
  editable?: boolean;
  /* W3：rowDrawer 行详情侧拉平移 RT（QRT 同款）——开启时单元格右键菜单增
 「行详情」项，侧拉抽屉展示整行键值对+逐格复制+「复制整行 JSON」；缺省 false 零增量 */
  rowDrawer?: boolean;
  /* W3：semRawCols 显式非语义类型抑制守卫（QRT 同款）——命中列名跳过 semFormat
 「按值推断」链（≥1000 判 ms / 0..1 判 percent 误伤面），显式 fieldTypes 标注不受影响；
 缺省 undefined 全链零增量 */
  semRawCols?: string[];
  /* W3：filterMode 跨列筛选组合档——'AND'（缺省）既有行为逐字节不变，
 'OR'=任一筛选列命中即保留（跨列并集档）；prop 播种运行档，弹层/提示行切换钮就地翻转 */
  filterMode?: 'AND' | 'OR';
  /* remoteSort 远端排序契约（dbx 对标，分页同构——只 emit 意图、
 排序/取数归宿主）。缺省 false=客户端排序逐字节不变；true 时表头排序入口（点击/键盘/
 右键直选）不改本地行序，只 emit 'sort-change'（载荷 {f,d:'asc'|'desc'}，null=取消排序）；
 多键链是本地排序特性，远端档塌缩为单键三态（升→降→取消） */
  remoteSort?: boolean;
  /* ═══ W3：syncSort 宿主权威排序态回填（约定遗留：remote 档表头箭头回显通道）═══
 remote 档箭头此前只随内部意图态 remoteSortCur（用户点击三态循环），宿主无从回填/重置——
 切索引清了 docsSort 内核箭头仍停旧态。接线后：有值→回填 remoteSortCur（箭头/aria-sort
 同步该态，此后用户点击仍走既有三态循环只 emit 意图）；null=清态（箭头清+循环基点清）。
 d 按约定契约收 1|-1，内核归一 'asc'|'desc'（535 公共契约）。缺省 undefined=未接线零增量
 （不读不写 remoteSortCur，remote 未接线档箭头恒 hint/aria-sort 恒无）；本地（客户端）档
 不消费本 prop——箭头权威仍是 sortSpec。与「remote 档挂载不读排序落盘」
 正交兼容：回填只走 prop 不触 LS。 */
  syncSort?: { f: string; d: 1 | -1 } | null;
  /** W-A：空态骨架链参数化（QRT 同款形态对齐）——骨架行数/行高/容器
 maxHeight/空态文案缺省维持现状，各调用点不传=行为零变化 */
  skeletonRows?: number;
  skeletonH?: string;
  maxHeight?: string;
  emptyText?: string;
  emptyHint?: string;
  /* 表格体隐藏（工具行常驻）——JSON/Tree/卡片视图消费方置 true */
  hideBody?: boolean;
  /* ═══ ：内建分页（QRT 三参齐备形态平移）═══
 page/pageSize 可选参 + 既有 total 三参齐备（pagerOn computed）才在工具行 bar-left 渲染
 内建 Pagination；缺省不传=恒 false 无分页器（全站零增量）。与 #bar-prepend 寄居
 Pagination 的宿主档互斥（宿主二选一，约定见模板注与 spec）。
 远端契约：翻页/改页大小只 emit（update:page / update:pageSize），取数归宿主。 */
  page?: number;
  pageSize?: number;
  /* 分页器禁用（宿主执行中传 running/busy）——QRT 525 同名 prop 逐字对位；
 透传内建 Pagination :disabled（缺省 false 零增量） */
  pagerDisabled?: boolean;
  /* ═══ ：内建视图档 opt-in（QRT 607 对称件，缺省全站零增量）═══
 viewSeg=true → 工具行 bar-left 最前内建 表格/JSON/Tree/卡片 分段（RT 单壳无独立壳
 通道，恒可达）；非表格档表格体隐藏（hideBody 语义内化进 bodyHidden——工具行常驻、
 不破）、内建 alt 体区渲染 AltHitsViews（565 共享件单源，DQ/IH 自造 seg+
 hideBody 退役由消费面迁移批执行—— 冻结面解锁后接线）。
 viewPrefKey 提供时档位 usePref 落盘（跨会话记忆，esquerystudio.pref.* 命名空间）；缺省仅
 内存态——KeepAlive 下组件实例常驻，状态不重置。
 alt 三档数据源=数据驱动出档（提供哪档出哪档，表格档恒在）：jsonHtml=高亮 pretty HTML
 （宿主 markHtmlAll/highlightDslJson 链产出，DQ/IH 同构）；treeData=行集
 （{_id,..._source}，JsonTree tools 档）；cardHits=卡片行集（@open-doc 透传宿主开文档，
 RT open-doc 通道既有）。 */
  viewSeg?: boolean;
  viewPrefKey?: string;
  /* 1439：fill=父容器定高、表体内部滚动（QRT 同款契约，查询工作台结果区用）。
 此前 RT 只能按内容高——结果区要么写死 min-height 505px 把表顶出视口，
 要么让整页滚动、首屏只剩一两行表。 */
  fill?: boolean;
  jsonHtml?: string;
  treeData?: unknown;
  cardHits?: SearchHit[];
}>(), {
  focusable: true,
  skeletonRows: 5,
  skeletonH: '26px',
  maxHeight: '60vh',
  emptyText: '无数据',
  emptyHint: '调整查询条件或切换索引后重查',
  /* W3：rowDrawer 侧拉缺省关；filterMode 组合档缺省 'AND'（既有行为逐字节不变）；
 remoteSort 远端排序缺省关（客户端排序逐字节不变） */
  rowDrawer: false,
  hideBody: false,
  /* refreshable 缺省关（对齐 QRT opt-in 形态，全站零增量） */
  refreshable: false,
  filterMode: 'AND',
  remoteSort: false,
  /* syncSort 缺省 undefined=未接线零增量 */
  syncSort: undefined,
  /* pagerDisabled 缺省 false（QRT 525 同名 prop 对位） */
  pagerDisabled: false,
  /* 内建视图档缺省关（全站零增量） */
  viewSeg: false,
  /* fill 缺省关=表格按内容高（既有宿主逐字节不变）；true 时由父容器定高、
 表体在 rt-wrap 内滚动（QRT 788 同款 fill 契约，查询工作台结果区需要它） */
  fill: false,
});

/* 内建聚焦面状态(FS headless 双向绑定) */
const focused = ref(false);
/* 右簇聚合菜单（视图 ⋯）状态——Esc/点外关闭 */
const viewMenuOpen = ref(false);
/* 1375：菜单可用高度按**触发器到视口底**算（真机实测固定 max-height 不解决：
   296px 菜单在 420px 上限内照样溢出 28px，末项「语义格式化」被裁掉点不到）。
   留 12px 呼吸 + 内部滚动兜底，任何视口高度都不会把最后一项顶出屏幕。 */
const viewMenuMaxH = ref(420);
function toggleViewMenu(e: MouseEvent) {
  const next = !viewMenuOpen.value;
  viewMenuOpen.value = next;
  if (!next) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  viewMenuMaxH.value = Math.max(160, Math.floor(window.innerHeight - r.bottom - 20));
}
function closeMenus() { viewMenuOpen.value = false; }
function onDocMenusClick(e: Event) {
  if (!(e.target as HTMLElement | null)?.closest('.menu-wrap')) closeMenus();
}
function onDocMenusEsc(e: KeyboardEvent) { if (e.key === 'Escape') closeMenus(); }
document.addEventListener('click', onDocMenusClick);
document.addEventListener('keydown', onDocMenusEsc);
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocMenusClick);
  document.removeEventListener('keydown', onDocMenusEsc);
});
/* ═══ ：内建视图档状态机（QRT 607 对称件）═══
 altView=用户档位（viewPrefKey 提供时 usePref 落盘跨会话记忆，缺省仅内存态——KeepAlive
 下组件实例常驻，状态不重置）；effView=数据驱动生效档——持久化/手选档位的数据源缺席时
 诚实回落表格（偏好保留不回写，数据重回即恢复）；bodyHidden=宿主 hideBody ∪ 内建非表格
 档（547 hideBody 语义内化，561 退聚焦 watch 源随之升级——viewSeg=false 时 bodyHidden≡
 hideBody 行为等值零回归） */
const viewSegOn = computed(() => props.viewSeg === true);
const ALT_VIEW_KEYS = ['table', 'json', 'tree', 'cards'] as const;
const altViewPref = props.viewPrefKey
  ? usePref<string>(props.viewPrefKey, 'table')
  : ref<string>('table');
const altView = computed<'table' | 'json' | 'tree' | 'cards'>({
  get: () => normalizePrefEnum(altViewPref.value, ALT_VIEW_KEYS, 'table'),
  set: v => { altViewPref.value = v; },
});
const effView = computed<'table' | 'json' | 'tree' | 'cards'>(() => {
  const v = altView.value;
  if (v === 'json' && props.jsonHtml == null) return 'table';
  if (v === 'tree' && props.treeData == null) return 'table';
  if (v === 'cards' && props.cardHits == null) return 'table';
  return v;
});
/* hideBody ∪ 内建非表格档——内建档切换共用同一隐藏判定（工具行常驻=不破） */
const bodyHidden = computed(() => props.hideBody === true || (viewSegOn.value && effView.value !== 'table'));
/* 卡片档 AltHitsViews SearchHit 契约桥——本地 Hit._score 可选，补缺省 null（结构补全非类型断言） */
const cardHitsAdapted = computed(() => props.cardHits?.map(h => ({ ...h, _score: h._score ?? null })));

/* 非表格视图自动退出聚焦——Tree/JSON/卡片内容是宿主里 RT 的兄弟节点，
 聚焦面（fs-active fixed 不透明覆盖层）之下不可见，放大态切视图只剩 rt-bar 全屏白
 （实报）。与 Esc 退出同语义（「聚焦态可切视图」修订：聚焦态仅表格）；
 只在 false→true 流转且聚焦中触发（immediate 缺省不触发，初始 hideBody=true 挂载零影响）。
 watch 源升 bodyHidden（hideBody ∪ 内建非表格档）——内建档切换同样自动退
 聚焦（QRT 607 同款）；viewSeg=false 时源≡hideBody 行为等值零回归 */
watch(bodyHidden, h => { if (h && focused.value) focused.value = false; });
const emit = defineEmits<{
  (e: 'open-doc', hit: SearchHit): void;
  (e: 'edit-doc', hit: SearchHit): void;
  (e: 'delete-doc', hit: SearchHit): void;
  (e: 'batch-delete', ids: string[]): void;
  (e: 'refresh'): void;
  (e: 'explain-hit', hit: SearchHit): void;
  (e: 'xray-hit', hit: SearchHit): void;
  /* W7：以单元格值过滤并重查——事件只发不路由，重查/跳转由消费端（DqlQueryView 等）接线 */
  (e: 'filter-hit', p: { field: string; value: any; op: 'term' | 'match'; not?: boolean }): void;
  /* W-B：selectable 行多选通道（rows=选中 hit 原始对象数组，sortedHits 序） */
  (e: 'selection-change', rows: unknown[]): void;
  /* remoteSort 远端排序意图（只 emit 不取数；null=取消排序回宿主原始序；
 载荷方向 'asc'|'desc' 与 QRT 同一公共契约——RT SortKey 本形态即字符串直发） */
  (e: 'sort-change', s: { f: string; d: 'asc' | 'desc' } | null): void;
  /* 内建分页意图（Pagination 透传，翻页/改页大小取数归宿主——QRT 525 同款公共契约） */
  (e: 'update:page', p: number): void;
  (e: 'update:pageSize', s: number): void;
}>();

const store = useAppStore();
/* ═══ ：内建分页渲染判定与换算（QRT :561-564 三参齐备形态逐字平移）═══
 page/pageSize/total 三参齐备才出内建分页器（可选参缺省=恒 false 零增量）；totalPages 由
 total/pageSize 换算（QRT 同式）。 */
const pagerOn = computed(() => props.page != null && props.pageSize != null && props.total != null);
const pagerPage = computed(() => props.page ?? 1);
const pagerSize = computed(() => props.pageSize ?? 20);
const pagerTotalPages = computed(() => Math.max(1, Math.ceil((props.total ?? 0) / Math.max(1, pagerSize.value))));
/* 权限门禁——就地编辑需 OPERATOR+(update-document 普通写档)；
 语义升格：删文档/批删（delete-by-id 共享写端点）连接模型按写键放行、
 静态模型按 canWriteOn 回落档位—— canOps 改走 canEndpoint（canWrite 不变） */
const auth = useAuthStore();
/* ·实报打通：canWrite 镜像后端连接授权写门语义（conn:{target}:w:* 在场
 即按连接授权裁决，跳过全局角色门）——此前只看全局角色，被授予连接写档的同事双击编辑
 静默无效（后端会放行，前端不让进=「权限给了却无法操作」）。：ops(删文档)
 同源升级 canWriteOn；改走 canEndpoint（delete-by-id 归属页精确写键裁决）。 */
const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/update-partial', store.target));
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-by-id', store.target));

/* ═══ 列 ═══
 P1-5：dot-path 嵌套列展平——顶层 plain object 字段展开一层子字段为
 「a.b」列（dbx Mongo 文档网格同手法；此前嵌套对象只能看 JSON 截断串）。
 列集=顶层键（原序）+ 子键列（排后），子列经 ColPicker 勾选才显示；取值统一走
 getSourceVal（dot-path 感知）。 */
const allCols = computed(() => {
  const top: string[] = [], sub: string[] = [];
  const seenTop = new Set<string>(), seenSub = new Set<string>();
  props.hits.forEach(h => {
    const src = h._source || {};
    for (const k of Object.keys(src)) {
      if (!seenTop.has(k)) { seenTop.add(k); top.push(k); }
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const sk of Object.keys(v)) {
          const p = k + '.' + sk;
          if (!seenSub.has(p)) { seenSub.add(p); sub.push(p); }
        }
      }
    }
  });
  return [...top, ...sub];
});
/** dot-path 感知取值：'a.b' 沿路径取嵌套值，普通列等价 _source[col]（229+ 批各取值点统一走此函数） */
function getSourceVal(h: SearchHit, col: string): any {
  const src = h._source;
  if (!col.includes('.')) return src?.[col];
  let cur: any = src;
  for (const seg of col.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

/* ═══ W-D 契约 ═══ */
/* 行级条件色档：返回值追加到数据行 tr class（空格拼接）；undefined/null/空串跳过 */
function rowCls(row: any, ri: number): string | undefined {
  const c = props.rowClass?.(row, ri);
  return c || undefined;
}
/* exportCell 管道收口（缺省恒等=现状零变化；仅导出/复制矩阵管道消费，显示不受影响） */
function xCell(v: unknown, key: string, row: any): unknown {
  return props.exportCell ? props.exportCell(v, { key }, row) : v;
}
/* 导出矩阵分支的单元格值：先过 exportCell，对象仍 JSON 串化（与既有 csv/md/xlsx 口径一致） */
function xExpCell(r: SearchHit, c: string): any {
  const v = xCell(getSourceVal(r, c), c, r);
  return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
}

/* 多选状态必须声明在 immediate watch 之前（回调首轮同步执行，后置声明会 TDZ 报错） */
const selected = ref<Set<string>>(new Set());
/* auto-fit 测量根（组件根节点，供右键「此列适应内容」遍历单元格） */
const rootEl = ref<HTMLElement | null>(null);
/* 表格交互：长值单元格展开态——单击含「…」的截断单元格切到全宽多行显示
 （与 copyCell 冲突消解：展开态下再点 = 复制全文；再次点击收起） */
const expandedCells = ref<Set<string>>(new Set());
function toggleExpand(hit: SearchHit, c: string) {
  const k = cellKey(hit._id, c);
  const n = new Set(expandedCells.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  expandedCells.value = n;
}
/* ═══ W7：行内展开详情行（dbx 行展开对位）═══
 rowKey=_id（ri 兜底，空 _id 行不串行）；free 多行展开；
 Esc=全部收起（裁决：全收而非逐个——逐个收起需记录收起序、状态面更大，全收一键回干净表，
 单行精确收走行钮/菜单/E）；Enter 语义保持既有「打开文档弹窗」不变（任务裁决记录）；
 详情嵌 JsonTree，防爆参数与单元格详情弹窗同款 max-children=200/max-str-len=4000 */
const expandedRows = ref<Set<string>>(new Set());
function rowKey(h: SearchHit, ri: number): string { return h._id || ('ri:' + ri); }
function toggleRowExpand(k: string) {
  const n = new Set(expandedRows.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  expandedRows.value = n;
}
function rowSource(h: SearchHit): Record<string, any> { return { _id: h._id, ...(h._source ?? {}) }; }
let lastChkIdx = -1;

/* ═══ 偏好记忆（列选/密度/列宽）—— 迁移到 useTablePrefs，
 与 QueryResultTable 共用同一实现（复用闭环）；列选重置时同步清勾选与 shift 锚 ═══ */
const dimension = computed(() => props.storageKey || props.index || null);
const {
  on: prefsOn, visibleCols, colWidths, colStyle, startResize, resetColWidth, resetColWidths,
  transpose, toggleTranspose,
  transposeN, setTransposeN, transposeNs,
  freezeN, setFreezeN, freezeFirst, toggleFreezeFirst,
  rowH, setRowH, rowHLabel, cycleRowH,
  presets, savePreset, applyPreset, deletePreset, /* ：消费面接线（652 内核三操作+名册） */
} = useTablePrefs(dimension, allCols, {
  onColsReset: () => { selected.value.clear(); lastChkIdx = -1; },
});
/* P1-3：转置渲染行集（前 N 条文档做横向列；N 档位记忆） */
const transposeHits = computed(() => sortedHits.value.slice(0, transposeN.value));
/* P1-3：单条结果自动进入转置视图（dbx/DBeaver 单行自动 Record 对位） */
const autoTranspose = usePref('rt.autotranspose', false) as Ref<boolean>;
const effTranspose = computed(() => transpose.value || (autoTranspose.value && props.hits.length === 1));
/* P1-6：列拖拽重排（draggable 绑列头 name；冻结列禁拖/目标位钳 1） */
const { dragging: colDragging, dragCol: colDragCol, overCol: colDragOver, overPlace: colDragPlace,
  onDragStart, onDragOver, onDrop, onDragEnd, isClickSuppressed } = useColDrag({
  cols: visibleCols,
  frozenFirst: () => freezeFirst.value,
});
/* /：冻结首业务列——宽表横向滚动时行身份不丢（标识列 98px 后 sticky） */
/* ═══ P2-4：前缀多列冻结（「冻结到此列」）═══
 sticky left 动态 = 标识列 98px + 前缀列宽累加；铁律：冻结列强制 min-width 锁死
 （未拖过宽的冻结列默认 180px），保证 left 与实际渲染宽度精确一致不遮字。
 装配合并 useColFit.frozenStyleOf 单源（QRT 同源；基数 98=标识列
 勾选 46+序号 52 以常参注入，非冻结档 undefined 回落 colStyle 既有兜底）。 */
const isFrozenCol = (c: string) => {
  const idx = visibleCols.value.indexOf(c);
  return idx > -1 && idx < freezeN.value;
};
function frozenStyle(col: string): Record<string, string> | undefined {
  return frozenStyleOf(visibleCols.value, colWidths.value, col, freezeN.value, 98, true) ?? colStyle(col);
}

/* exportOpen 随 ▾ 菜单移除——格式切换收进单元格右键菜单（隐藏且可发现） */
const pendOpen = ref(false);

/* 1151：列头 tooltip 单源——首行「类型 · 列名」承载字段类型（窄列不再为徽标让宽），
 第二行是排序/列管理用法。类型未知时只留列名 + 用法。 */
function thTitle(c: string): string {
  const t = props.fieldTypes?.[c];
  const head = t ? `${t} · ${c}` : c;
  return `${head}\n点击排序：升序 → 降序 → 取消（回原始序）；Shift+点击：追加/翻转次键；拖列名可重排；右键：列管理`;
}

/* ═══ 排序（按索引/存储键维度记忆——重查不丢、切索引重读，
 与列选/列宽/密度同口径；排序列被列选关掉则清空排序，「所见即所序」。
 多列排序——Shift+点列头=追加/翻转次键（链长 ≤3），普通点击仍单键三态；
 存储:es_tbl_sort:<dim>:m 存 JSON 链，同时维护旧 :f/:d（链首）向后兼容旧版本读侧。
 状态机合并 composables/tableSort.useSortChain 单源（大件）——
 三态循环/次键链/直选/远端意图/回填/落盘全机单一出处，此处只留守卫薄壳与行序应用点 ═══ */
const chain = useSortChain({
  lsBase: () => 'es_tbl_sort:' + (props.storageKey || props.index),
  isRemote: () => props.remoteSort,
  syncWired: () => props.syncSort !== undefined,
  emitIntent: (s) => emit('sort-change', s),
});
const sortSpec = chain.sortSpec;
/* 模板辅助：链内方向/序号（aria-sort 仅链首——HTML aria-sort 单值语义）。
 起读「显示链」dispChain：本地档=sortSpec 原语义；remote+syncSort 接线档=
 remoteSortCur 单键镜像；remote 未接线档维持恒空=箭头恒 hint/aria-sort 恒无（零增量）。
 行序/落盘仍只认 sortSpec（remote 档恒空，538 口径不变）——显示与数据分轨。 */
const dispChain = chain.dispChain;
const chainCount = chain.chainCount;
const chainHas = chain.chainHas;
const chainDir = chain.chainDir;
const chainOrd = chain.chainOrd;
/* 回填 watch：有值=回填显示镜像（方向 1|-1 归一 'asc'|'desc' 在机内）；null=清态（箭头+循环
 基点同清，此后点击 asc 重启）；undefined=未接线不生效零增量。回填只动显示态镜像，
 sortSpec/行序/落盘零触碰（538 口径不变）。immediate：宿主携态挂载（记忆恢复）首渲即回显。 */
watch(() => props.syncSort, (s) => {
  if (s === undefined || !props.remoteSort) return;
  chain.applySync(s);
}, { immediate: true });
/* 件②：显式非语义列排序抑制（tableSort.sortableGuard 单源出口接线，件②
 QRT 半边的 RT 对称件）——binary 等 18 型+_source 列点击排序语义 VOID，入口短路不落态；
 _id/_index/_score/_seq_no 排序有语义豁免（semanticGuard 口径）。RT 类型源=显式
 fieldTypes（无采样推断链），无类型列不抑制——零增量缺省与 QRT effType 缺省口径自洽。 */
const sortGuard = sortableGuard((c) => props.fieldTypes?.[c]);
/* 1376：远端档可排性预检——宿主在 sort-change 里用同一 resolveSortField 裁决
 （text 无 .keyword 子域→不下发 sort 并提示），但内核若先把箭头推到新态再等宿主拒绝，
 就留下「箭头亮了、数据没动」的暗状态。这里用同一单源提前裁决：拦下即不落态不 emit。
 本地档不接（行序就在内存里，任何字段都能排，多这一层只会误伤）。 */
function remoteSortBlocked(c: string): boolean {
  if (!props.remoteSort) return false;
  const r = resolveSortField(c, props.fieldTypes);
  if (r.ok) return false;
  store.notify('warning', r.reason || '该列不支持排序');
  return true;
}
/* 薄壳守卫后委托状态机（单源）：remote 档机内只 emit 意图（多键链是本地特性，
 塌缩单键）；directDir 供右键「升序/降序」直选（ dbx 语义）。 */
function sortBy(c: string, directDir?: 'asc' | 'desc', shift = false) {
  /* P1-6：列拖拽 drop 后紧随的 click 不当排序处理（dbx 教训：300ms 双保险） */
  if (isClickSuppressed()) return;
  /* 件②：显式非语义列短路（本地/remote 双档同守——不落 sortSpec/不落盘/
 不 emit 远端意图；右键 directDir 直选同经此入口一并受守） */
  if (!sortGuard(c)) return;
  if (remoteSortBlocked(c)) return;
  chain.sortBy(c, directDir, shift);
}
/* 切索引/换存储键：重读该维度的排序记忆；横向滚动位归零（见下方 wrapEl 声明处的 watch；
 W7：行内展开态一并清（_id 跨维度可能撞键）。：remote 档重读同样跳过（恒空） */
watch(() => props.storageKey || props.index, () => {
  chain.reload();
  expandedRows.value = new Set();
});
/* 排序列被列选关掉/该索引无此列：从链中剔除该键（单键时=清空），避免「排序仍在生效但箭头不可见」的暗状态。
 immediate——挂载时持久化链与列选本就不一致（跨会话残留）也要立刻剔除 */
watch(visibleCols, (vc) => { chain.pruneTo(vc); }, { immediate: true });
/* ═══ P0-4：列值筛选（useColFilters 下沉共享）——「RT 待合并」欠账补齐。
 管线=先筛后排序（筛选基数小排序才便宜）；筛选变化连带清框选（ri:ci 坐标键随行集错位；
 RT 的展开/聚合是 id::field 稳定键不受影响）；暗状态守卫（隐藏列自动清）内置 ═══ */
const filters = useColFilters({
  rows: () => props.hits,
  getVal: (h: SearchHit, col: string) => getSourceVal(h, col),
  labelOf: (v) => v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v),
  cols: () => visibleCols.value,
});
/* ═══ ：解构补齐 rangeOn/containsOn/setContainsFilter（漏斗激活并集+contains 档，
 QRT 552:904 对称件收尾——此前 RT 漏斗只认等值勾选，区间/包含生效不亮是暗状态缺口）═══ */
const { colFilters, rangeFilters, containsFilters, activeFilterCount, normVal, toggleFilterVal, setRangeFilter, rangeOn, containsOn, setContainsFilter, clearFilter, clearAllFilters, filterRows } = filters;
/* 漏斗激活高亮并集口径——等值勾选 ∪ 区间 ∪ 包含（任一生效即点亮；QRT 552 同构） */
function funnelOn(c: string): boolean {
  return !!(colFilters.value[c]?.length || rangeOn(rangeFilters.value[c]) || containsOn(c));
}
/* 包含档入口守卫——非语义类型（binary/geo_point/nested/object…）与 ip 列
 无文本包含语义，弹层不出包含行；无显式类型列不抑制（QRT 552 'name' 口径自洽）
 T1：抑制判据同步更新 typeTiers.isIpType 单源 */
function isContainsCol(c: string): boolean {
  const t = props.fieldTypes?.[c];
  if (!t) return true;
  return !isNonSemanticType(t) && !isIpType(t);
}
/* ═══ W3：filterMode 跨列筛选组合档 ═══
 prop 播种运行档（缺省 'AND'）；筛选弹层/提示行切换钮就地翻转；prop 变化跟随播种。
 管线在 useColFilters.filterRows（mode 参数收口，缺省 'AND' 逐字节不变）。
 三件套合并 useColFilters.useFilterMode 单源（QRT 同款接线）。 */
const { filterModeLive, toggleFilterMode } = useFilterMode(props);
const filteredHits = computed(() => filterRows(props.hits, filterModeLive.value));
/* 框选是 ri:ci 坐标键——筛选变化行集错位，必须连带清 */
watch(colFilters, () => { region.value = null; }, { deep: true });
const filterPop = ref<{ col: string; x: number; y: number } | null>(null);
const filterKw = ref('');
const fvals = computed(() => filters.filterVals(filterPop.value?.col ?? '', filterKw.value));
/* mini-bar 归一/碰撞定位/开层聚焦随壳合并 ColFilterPopover，此处只留开层状态 */
function openFilter(e: MouseEvent, col: string) {
  openFilterAt(col, e.clientX, e.clientY);
}
function openFilterAt(col: string, x: number, y: number) {
  filterKw.value = '';
  filterPop.value = { col, x, y };
}

/* 数值列自动右对齐（dbx 语言——数字列右对齐+tabular-nums，可读性）。
 采样前 50 行，列内 number 值占比 ≥60% 判定为数值列 */
const numericCols = computed(() => {
  const s = new Set<string>();
  const sample = sortedHits.value.slice(0, 50);
  for (const c of visibleCols.value) {
    /* 显式非语义类型更早短路（binary/nested 等压过采样兜底） */
    const t = props.fieldTypes?.[c];
    if (t && isNonSemanticType(t)) continue;
    let num = 0, total = 0;
    for (const h of sample) {
      const v = h._source?.[c];
      if (v === null || v === undefined || v === '') continue;
      total++;
      if (typeof v === 'number') num++;
    }
    if (total > 0 && num / total >= 0.6) s.add(c);
  }
  return s;
});
/* 区间筛选列判定——fieldTypes 数值/日期型优先（类型徽标同源正则），
 无映射回落 numericCols 采样口径（ 60% 数值占比）；纯文本/keyword 列不出区间输入。
 W-A：数值族正则改引 typeTiers.NUMERIC_TYPES_RE（原 RANGE_NUM_RE 同值退役）。
 显式非语义类型更早短路（binary/geo_point 等永无区间语义；显式优先序不动）。
 RANGE_DATE_RE 字面合并 typeTiers 单源（本函数本体 545 源码锁逐字钉死，
 只改判据引用不改形） */
function isRangeCol(c: string): boolean {
  const t = props.fieldTypes?.[c];
  if (t && isNonSemanticType(t)) return false;
  if (t) return NUMERIC_TYPES_RE.test(t) || RANGE_DATE_RE.test(t);
  return numericCols.value.has(c);
}
/* 占位文案单源合并 typeTiers.rangePlaceholderTxt（原双份逐字退役，行为等值） */
function rangePlaceholder(col: string, side: 'min' | 'max'): string {
  return rangePlaceholderTxt(props.fieldTypes?.[col], side);
}
/* ═══ W-B：quickFilter 跨可见列 contains 过滤（QRT 同款平移）═══
 与既有列筛选 AND 叠加（filterRows 之后追加，不改 useColFilters 管线）；
 匹配口径=可见列原始值文本（getSourceVal，null 视作 '-' 与 QRT fullText 同语言）小写包含；
 不传/空白=恒等回落（quickHits 即 filteredHits 同引用，零增量）；
 生效且 0 行 → 空态链补充分支（文案走既有 emptyText/emptyHint，rtLoadingSkeleton268
 锁的 <EmptyState v-else-if="!hits.length"> 字面零触碰）。
 W3：取词收口改走 quickFilterEff——非 searchable 档恒等于 props.quickFilter
 （既有通道逐字节回落）；searchable 档内建输入框非空以输入为准、空输入回落外部播种值。 */
const searchableKw = ref('');
const quickFilterEff = computed<string | undefined>(() => {
  if (!props.searchable) return props.quickFilter;
  const k = searchableKw.value.trim();
  return k || props.quickFilter;
});
const quickActive = computed(() => !!(quickFilterEff.value && quickFilterEff.value.trim().length > 0));
function rtCellFullText(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
/* 过滤装配合并 useColFilters.quickFilterRows 单源（QRT 同款接线）——
 匹配口径=getSourceVal + rtCellFullText（QRT 是 qColVal + fullText），getVal/fullOf
 参数化保两内核行为差；空白词恒等回落（同引用）在单源内保真 */
const quickHits = computed<SearchHit[]>(() =>
  quickFilterRows(filteredHits.value, quickFilterEff.value, visibleCols.value, (h, c) => getSourceVal(h, c), rtCellFullText));
const quickEmpty = computed(() => quickActive.value && !quickHits.value.length);

const sortedHits = computed(() => {
  /* P0-4：排序基座从 props.hits 改 filteredHits——先筛后排序，
 「已筛选 N 列 · M/K 行」与排序/导出行序同管线（所见即所序+所筛）。
 W-B：基座再接 quickFilter（quickHits ⊆ filteredHits，AND 叠加语义；
 不传 quickFilter 时两者同引用，行为零变化） */
  if (!sortSpec.value.length) return quickHits.value;
  const spec = sortSpec.value;
  return [...quickHits.value].sort((a, b) => {
    for (const { f, d } of spec) {
      const va = a._source[f], vb = b._source[f];
      /* 比较器合并 tableSort.compareVals 单源（此前内联 numeric 双试同口径平移）——
 千分位/单位之外新档科学计数（1e6）/时长（ms|s）按值；沉底档（null/undefined/''）
 方向无关恒沉底（对齐旧 va==null 恒 return 1 语义），非空档乘方向 */
      const blank = va == null || va === '' || vb == null || vb === '';
      const r = compareVals(va, vb);
      if (r !== 0) return blank ? r : r * (d === 'asc' ? 1 : -1);
    }
    return 0;
  });
});

/* ═══ ：大结果集渲染保护（G 组评估落地）═══
 评估结论：虚拟滚动工程量大且与就地编辑/框选/勾选交互冲突；采用「渲染截断+导出引导」——
 超 MAX_RENDER 只渲染前 N 行（万行 DOM 拖死滚动/勾选/编辑交互），排序/勾选/导出仍作用于
 全量（exportRows 走 sortedHits/currentExportRows），行尾内嵌提示引导导出取全量。
 W-A：内核逻辑随壳合并 useRenderMore（QRT 同构段单一出处）——MAX_RENDER/
 renderLimit/watch 重置/截断判定/renderMore/IntersectionObserver 哨兵（rootMargin 80px）
 全在 composable；此处只接线（sortedHits 行源 + rootEl IO 根惰性 getter），行集重命名
 renderHits 保 M1「键盘导航钳位」既有引用面，模板截断行/文案/按钮保位不动
 （rtRenderMore525 锚同步更新内核接线+composable）。 */
const { rows: renderHits, truncated: renderTruncated, renderMore, truncSentinel } =
  useRenderMore(() => sortedHits.value, () => rootEl.value);

/* ═══ 多选（全选/shift范围/反选/Esc）——selected/lastChkIdx 声明已前移至列 watch 之前 ═══ */
/* W-B：selection-change 事件通道（QRT selectable 同款平移）——勾选态单一
 事实源仍是既有 selected: Set<_id>，selectable 开启时任何勾选变化 emit 原始 hit 数组
 （sortedHits 序，与导出/复制行序同源）；缺省 false 事件静默（零增量）。
 watch 统一接线：onChkClick/toggleAll/invertSel/clearSel/clearSelected 全部走
 Set 重建赋值，一处 watch 全覆盖，不逐函数插入。 */
const emitSelection = () => {
  if (!props.selectable) return;
  emit('selection-change', sortedHits.value.filter(h => selected.value.has(h._id)));
};
watch(selected, () => emitSelection());
/* 全选/反选口径收口——QRT 同族 allSel/toggleAllSel 约定语义「当前视图全部行」
 （其全选钮 aria-label 明写）的 RT 对称件。旧口径=props.hits 全量：筛选/quickFilter 态点
 全选会把不可见行勾进 selected，批量删除/复制 _id/口径徽标按全量 N 而导出/复制选中行走
 currentExportRows 可见交集 K——同份勾选四条链两种口径。收口到 sortedHits（当前视图：
 列筛选∩quickFilter∩排序同管线）后无筛选零变化（sortedHits≡hits 同引用链），勾选动作
 与全部消费链自动一致。 */
const allChecked = computed(() => sortedHits.value.length > 0 && sortedHits.value.every(h => selected.value.has(h._id)));

function onChkClick(e: MouseEvent, ri: number) {
  const hit = sortedHits.value[ri];
  if (e.shiftKey && lastChkIdx >= 0) {
    const [a, b] = [Math.min(lastChkIdx, ri), Math.max(lastChkIdx, ri)];
    const target = !selected.value.has(hit._id);
    for (let i = a; i <= b; i++) {
      const id = sortedHits.value[i]._id;
      if (target) selected.value.add(id); else selected.value.delete(id);
    }
  } else {
    if (selected.value.has(hit._id)) selected.value.delete(hit._id);
    else selected.value.add(hit._id);
  }
  lastChkIdx = ri;
  selected.value = new Set(selected.value);
}
function toggleAll() {
  if (allChecked.value) selected.value = new Set();
  else selected.value = new Set(sortedHits.value.map(h => h._id));
}
function invertSel() {
  const next = new Set<string>();
  sortedHits.value.forEach(h => { if (!selected.value.has(h._id)) next.add(h._id); });
  selected.value = next;
}
function clearSel() { selected.value = new Set(); region.value = null; touchAnchor.value = null; cancelTouchTimer(); } /* ：Esc 连带清框选区；1441 触屏起点同清 */
/* Delete/Backspace=批量删除勾选行——仍走父组件 askBatchDel 确认链（防呆闭环），
 编辑中（editing）不接管（防把输入框内容删格外的语义）；
 rank3+ 才放行（delete-by-id=CLUSTER 档，VIEWER 按 Del 不再触发 403） */
function onDeleteKey() {
  if (editing.value || !selected.value.size || !canOps.value) return;
  emit('batch-delete', [...selected.value]);
}

async function copyIds() {
  /* 按真实结果通知——复制被浏览器拦截时不再假报「已复制」 */
  const ok = await copyText([...selected.value].join('\n'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${selected.value.size} 个 _id` : '复制失败：浏览器拦截了剪贴板');
}
/* 默认导出格式（usePref 记忆；切换入口在单元格右键菜单——主界面零菜单）。
 2.1.4：存量非法值不再原样进按钮文案（会显示「导出为 BOGUS」却按 CSV 落盘）——读取侧归一。 */
const EXPORT_FMT_KEYS = ['json', 'csv', 'md', 'xlsx', 'ndjson'] as const;
const expFmtPref = usePref<string>('rt.export.fmt', 'csv');
const expFmt = computed<typeof EXPORT_FMT_KEYS[number]>({
  get: () => normalizePrefEnum(expFmtPref.value, EXPORT_FMT_KEYS, 'csv'),
  set: v => { expFmtPref.value = v; },
});
/* P2 引入、合并 useTablePrefs（RT/QRT 同内核同循环序） */
function exportRows(fmt: 'json' | 'csv' | 'md' | 'xlsx' | 'ndjson') {
  /* 有勾选只导选中；无勾选导当前页全部（免去「先全选再导」的绕路）。
 行序取 sortedHits（与表格所见一致）——此前用 props.hits 原始序，
 排序后导出的文件行序与界面不符（28 批在 SQL 通道修过同款，RT 漏网）。
 行集逻辑抽 currentExportRows，与 getExportRows expose 共用。
 新增 Markdown 表格格式（dbx 五格式对齐——文档/聊天里直贴）。 */
  const rows0 = currentExportRows();
  /* W-B：exportRowFilter 行级过滤——矩阵三格式（CSV/MD/XLSX）同一行源收口
 （exportCell 只加工格、此只筛行）；JSON 文档导出恒 raw（与 exportCell「JSON 文档语义
 不加工」同裁决）。缺省 undefined=全量导出现状不变 */
  const rows = fmt !== 'json' && props.exportRowFilter
    ? rows0.filter(r => props.exportRowFilter!(r))
    : rows0;
  /* XLSX 分支（xlsxMini 手写零依赖——数据 sheet + meta sheet 记录来源）
 双 sheet 装配合并 exportSheets.buildExportSheets 单源（QRT 同款装配；
 差异字段「索引/范围」以 meta0 前置行参数化，导出时间/行数在单源内追加） */
  if (fmt === 'xlsx') {
    const cols = visibleCols.value;
    const [sheet, meta] = buildExportSheets(
      [['索引', props.index], ['范围', selected.value.size ? `选中 ${selected.value.size} 行` : '当前页']],
      { head: ['_id', ...cols], rows: rows.map(r => [r._id, ...cols.map(c => xExpCell(r, c))]) },
    );
    const bytes = buildXlsx([sheet, meta]);
    /* exportName 契约——主段缺省维持 props.index 现状 */
    downloadBlob(`${props.exportName || props.index}-${selected.value.size ? 'selected' : 'page'}-${exportStamp()}.xlsx`,
      new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    store.notify('success', `已导出 ${rows.length} 条（XLSX，含 meta 页）`);
    return;
  }
  let content: string, mime: string, ext: string;
  if (fmt === 'json') {
    content = JSON.stringify(rows.map(r => ({ _id: r._id, ...r._source })), null, 2);
    mime = 'application/json'; ext = 'json';
  } else if (fmt === 'ndjson') {
    /* 1169：NDJSON 与 QRT 同档（此前只有 QRT 有，索引工作区导不了）——
       每行一个完整文档对象（_id + _source），供 jq / _bulk / 逐行流处理直接吃。
       与 JSON 档同语义（整文档、不经 exportCell），只是行间不用逗号且无外层数组。 */
    content = rows.map(r => JSON.stringify({ _id: r._id, ...r._source })).join(String.fromCharCode(10));
    mime = 'application/x-ndjson'; ext = 'ndjson';
  } else if (fmt === 'md') {
    /* M3：csv/md 列集从 allCols 改 visibleCols——矩阵语义所见即所得，
 与剪贴板复制组（visibleCols）同口径（此前「文件含隐藏列、剪贴板不含」自相矛盾）；
 json 分支保持 _id+全 _source 文档语义（程序处理用整文档，与矩阵导出有意分工）。
 私造 esc 管道退役合并 copyMatrix.matrixText('md') 单源（QRT 同款）——
 '_id' 以首列注入，值管道仍走 xExpCell（exportCell 加工+对象串化），转义口径
 （| 与换行折空格）在 copyMatrix 铁律内统一（新增 \r 同折，CSV/Excel 直贴防破行） */
    const cols = visibleCols.value;
    content = matrixText({
      rows,
      cols: ['_id', ...cols],
      getVal: (r, c) => (c === '_id' ? r._id : xExpCell(r, c)),
    }, 'md');
    mime = 'text/markdown'; ext = 'md';
  } else {
    const cols = visibleCols.value;
    content = ['_id,' + cols.map(csvCell).join(',')]
      .concat(rows.map(r => csvCell(r._id) + ',' + cols.map(c => csvCell(xExpCell(r, c))).join(',')))
      .join('\n');
    mime = 'text/csv'; ext = 'csv';
  }
  /* w78：CSV 前置 UTF-8 BOM（防 Excel 打开中文乱码），JSON 不带——前导 BOM 破坏 JSON.parse */
  downloadText(`${props.exportName || props.index}-${selected.value.size ? 'selected' : 'page'}-${exportStamp()}.${ext}`, content, mime,
    fmt === 'csv' ? { bom: true } : undefined);
  store.notify('success', `已导出 ${rows.length} 条（${ext.toUpperCase()}）`);
}

/* ═══ ：命令面板表格域命令（window 'table-cmd' 广播）═══
 仅当前可见实例响应——offsetParent 检查区分同页双表与 KeepAlive 后台缓存页
 （T30：DOM 仍在树上，不可见实例必须静默丢弃防误响应）。 */
function onTableCmd(e: Event) {
  const detail = (e as CustomEvent<{ cmd?: string; col?: string; markHandled?: () => void }>)?.detail;
  const cmd = detail?.cmd;
  if (!cmd) return;
  const root = rootEl.value;
  const op = root && (root as HTMLElement).offsetParent;
  /* 真实浏览器：display:none 链下 offsetParent=null；happy-dom：未实现为 undefined。
 两者都视为「不可见」静默丢弃，只有真实可见实例响应。
 M3：可见实例响应前标记 handled——命令面板据此在无可见表格时显式提示 */
  if (!root || op === null || op === undefined) return;
  detail.markHandled?.();
  if (cmd === 'dense') cycleRowH();
  else if (cmd === 'reset-widths') resetColWidths();
  else if (cmd === 'export') exportRows('csv');
  else if (cmd === 'locate-col' && detail.col) locateCol(detail.col);
}
window.addEventListener('table-cmd', onTableCmd);
onBeforeUnmount(() => window.removeEventListener('table-cmd', onTableCmd));

/* ═══ ：Ctrl+F 稳定接管（实报「不稳定展示/弹浏览器原生查找」）═══
 此前 Ctrl+F 只在表格根获焦时生效——焦点在页面任意处时落到浏览器原生查找。
 现在 document 捕获级接管：本表可见 + 非输入态 + 未被其他表处理 → 打开表内查找。
 输入态（INPUT/TEXTAREA/SELECT/富文本/Monaco）让路；多表同屏由 defaultPrevented 仲裁。 */
function onDocFind(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  if (e.key.toLowerCase() !== 'f') return;
  if (e.defaultPrevented) return; /* 别的可见表已接管 */
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor'))) return;
  const root = rootEl.value;
  if (!root || root.offsetParent === null) return; /* 本表不可见（切走/KeepAlive 隐藏） */
  e.preventDefault();
  e.stopPropagation();
  void openSearch();
}
document.addEventListener('keydown', onDocFind, true);
onBeforeUnmount(() => document.removeEventListener('keydown', onDocFind, true));

/* ═══ 单元格显示 ═══ */
function displayVal(hit: SearchHit, field: string) {
  const p = pending.value.get(hit._id)?.get(field);
  return p ? p.newVal : getSourceVal(hit, field);
}
function cellText(v: any): string {
  if (v == null) return '';
  /* 60→160——与 QRT MAX_CELL 同口径（此前同是 RT 的两个工作台
 截断观感不一致；超长仍可单击展开/「查看完整值」） */
  if (typeof v === 'object') return trunc(JSON.stringify(v), 160);
  return trunc(v, 160);
}
function cellTitle(hit: SearchHit, c: string): string {
  const v = getSourceVal(hit, c);
  return typeof v === 'string' ? v : JSON.stringify(v);
}
/* 表格交互：epoch 毫秒人性化显示——13 位数字落在 2008~2049 年区间才转换
 （19 位雪花 ID / 订单号不会误伤）；title/copy 始终保留原始值 */
function epochText(v: any): string | null {
  return epochMsText(v);
}
/* 表格交互：截断值单击=展开/收起全宽多行
 v3.0.0：Enter 键盘路径同入口——e 兼容 MouseEvent|KeyboardEvent（函数体不读指针字段）。
 ·裁决：单击自动复制退役——「单击就复制不对，我本来想复制值进去，
 那不就还要复制一次吗」：自动复制在「复制外部值→双击编辑→粘贴进单元格」流中覆盖
 剪贴板（双击的 click 先于 dblclick，粘贴得到旧值）。复制保留显式路径：右键菜单
 「复制值/复制 JSON」、Ctrl+C 行复制、列头复制整列、hover 行内钮。 */
function onCellClick(e: MouseEvent | KeyboardEvent, hit: SearchHit, c: string) {
  if (suppressClick) return; /* ：框选拖出后的那次 click 不当单击处理 */
  if (editing.value) return; /* 编辑态直通：input 内选区/粘贴回归原生语义 */
  /* 拖选守卫：格内文本拖选松手的 click 不当作单击（不展开）；键盘事件不经守卫 */
  if (e instanceof MouseEvent && cellGuard.moved(e)) return;
  const v = displayVal(hit, c);
  const text = cellText(v);
  const k = cellKey(hit._id, c);
  if (text.endsWith('…') || expandedCells.value.has(k)) {
    toggleExpand(hit, c);
  }
}
async function copyCell(hit: SearchHit, c: string) {
  const v = displayVal(hit, c);
  if (v == null || v === '') return;
  const ok = await copyText(typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${c}` : '复制失败');
}
function cellCls(v: any): string {
  if (v == null) return 'j-null';
  if (typeof v === 'boolean') return 'j-bool';
  if (typeof v === 'number') return 'j-num';
  return '';
}
/* ═══ W7：长 JSON 单元格折叠预览（plain object）——首键短预览+{…}N 键 chip 形态，
 点击开既有单元格详情弹窗（detailOpen 通道，不引入第二套展开态）；
 数组/空对象不折叠（回落既有截断串）；title 恒 raw 全串（cellTitle 铁律不涉）═══ */
function objChip(v: any): { label: string; n: number } | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (!keys.length) return null;
  const f = v[keys[0]];
  const fs = f == null ? '' : typeof f === 'object' ? JSON.stringify(f) : String(f);
  return { label: keys[0] + ': ' + trunc(fs, 24), n: keys.length };
}

/* ═══ W-A：ES highlight 片段净化与渲染 ═══
 片段是文档内容直出的 HTML（存储型注入面：<img onerror> 即进 DOM）。
 （立牌兑现）：净化函数合并 utils/highlightSanitize.hlSafe 单源
 （本地同构定义退役，行为零变化——整段转义后只放行高亮标签 <em>/<mark>（可带 class
 属性）；pre_tags 若配了其他标签（<b> 等）保持转义纯文本，失败闭合（fail-closed）。 */
/** 该行该列的 highlight 片段（已净化，空串=无片段回落普通渲染）
 * T2：装配（join ' … ' + hlSafe 净化 + 空档短路）合并
 * highlightSanitize.hlSegment 单源一行委托（QRT highlight opt-in 同源；行为零变化，
 * 函数名/v-html 出口有 queryHighlightChain 源码锁保全） */
function hlHtml(hit: SearchHit, c: string): string {
  return hlSegment(hit.highlight?.[c]);
}
/* P2-1：ES 类型 → 语义色类—— W-A 抽 utils/typeTiers 单一出处
 （QRT 同源），本文件 import 引入；样式 .rt-th-type.rt-ty-* 留本文件 scoped */

/* ═══ W7：语义格式化显示层（usePref 全局键 es_tbl_sem，默认开）═══
 只动「显示」：复制/导出/cellTitle 恒 raw 原文（铁律不涉）；关闭即回落既有渲染。
 ① date 类型字段（fieldTypes 判；epoch 毫秒走既有 epochText 通道）ISO 串 → 本地
 「YYYY-MM-DD HH:mm:ss」；② 数值列（numericCols 采样口径）fmtNum 千分位
 （右对齐经既有 num-col 类）；③ ip 列等宽（ip-col 类，字段类型或列名兜底判）。
 W-B：内部 ref 更名 semPref 让位同名 prop semOn（语义渲染扩展开关，
 见 semText/semToneCls；pref 层与 prop 层叠加不互斥） */
const semPref = usePref('es_tbl_sem', true) as Ref<boolean>;
/* T1：IP_TYPE_RE 本地字面退役改引 typeTiers.isIpType（单源，行为零变化） */
const IP_NAME_RE = /(^|_)(ip|ipv4|ipv6)$/i;
function isIpCol(c: string): boolean {
  const t = props.fieldTypes?.[c];
  if (t) return isIpType(t);
  return IP_NAME_RE.test(c);
}
function isDateCol(c: string): boolean {
  const t = props.fieldTypes?.[c];
  return !!t && RANGE_DATE_RE.test(t);
}
const P2 = (x: number) => String(x).padStart(2, '0');
function localDateTime(d: Date): string {
  return `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())} ${P2(d.getHours())}:${P2(d.getMinutes())}:${P2(d.getSeconds())}`;
}
/* 显示层文本：semOn 扩展（ W-B：bytes/duration/percent 命中显示 useSemFormat
 格式化 text，title/复制/导出恒 raw）→ semPref 开→date 本地化/数值千分位，否则回落 cellText（恒截断 160 防撑爆）
 semRawCols 命中列 noInfer 抑制「按值推断」（显式 fieldTypes 标注不受影响）
 显式非语义类型（binary/dense_vector/histogram… 16 型族）同效抑制——
 守卫并上 if 条件位（semFormat 调用字面 534 源码锁钉死改旁不改锚；行为等价于 noInfer
 并上 isNonSemanticType：非语义型永不在 useSemFormat 显式标注白名单内；QRT displayText 同款） */
const semRawSet = computed(() => new Set(props.semRawCols ?? []));
function semText(v: any, c: string): string {
  if (props.semOn && !isNonSemanticType(props.fieldTypes?.[c])) {
    const f = semFormat(v, props.fieldTypes?.[c] ?? '', { noInfer: semRawSet.value.has(c) });
    if (f) return f.text;
  }
  if (!semPref.value) return cellText(v);
  if (isDateCol(c) && typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return localDateTime(d);
  }
  if (typeof v === 'number' && numericCols.value.has(c)) return fmtNum(v);
  return cellText(v);
}
/* W-B：semOn 命中分档类（percent 三档 tone → rt-sem-g/y/r；bytes/duration 无档）——
 未命中/未开 prop 返回空对象（零增量；类名新空间不触既有锚）。
 semRawCols 命中列 noInfer 抑制按值推断（percent 误判档随之失效）。
 显式非语义类型同守卫（557 semText 对称；tone 分档随推断一起沉默） */
function semToneCls(v: any, c: string): Record<string, boolean> {
  if (!props.semOn || v === null || v === undefined || isNonSemanticType(props.fieldTypes?.[c])) return {};
  const f = semFormat(v, props.fieldTypes?.[c] ?? '', { noInfer: semRawSet.value.has(c) });
  return f?.tone ? { ['rt-sem-' + f.tone]: true } : {};
}

/* ═══ P0-1：结果内查找（Ctrl+F）═══
 搜索范围钉死 renderHits×visibleCols（所见即所搜，截断时 HitNav 旁 ≈ 提示）；
 匹配口径=显示文本（epoch 人性化后的所见即所搜）；命中格琥珀底+mark 切分，
 当前命中 scrollIntoView 落位（dbx Grid SearchBar 交互：Enter 下一个/Shift+Enter 上一个）。 */
const {
  kw: searchKw, open: searchOpen, deferred: searchDeferred,
  matches: searchMatches, matchSet: searchMatchSet,
  current: searchCur, next: searchNext, prev: searchPrev,
} = useGridSearch({
  rows: () => renderHits.value.length,
  cols: () => visibleCols.value.length,
  getText: (ri, ci) => {
    const h = renderHits.value[ri]; const c = visibleCols.value[ci];
    /* W7：匹配口径对齐显示层——epoch 人性化优先，其余走 semText（date 本地化/数值千分位） */
    return h && c ? (epochText(displayVal(h, c)) ?? semText(displayVal(h, c), c)) : '';
  },
  /* 件④：date 列第三遍归一接线（件④ QRT 半边的 RT 对称件，
 useGridSearch 可选 colType 消费）——date 列且 kw/格文本都呈日期形态时分隔符归一
 （/ . 与 - 互认）；fieldTypes 与列头徽标同一读取口径，非 date 列零行为变化 */
  colType: (ci) => props.fieldTypes?.[visibleCols.value[ci] ?? ''],
});
function isSearchHit(ri: number, ci: number) { return searchMatchSet.value.has(ri + ':' + ci); }
function isSearchCur(ri: number, ci: number) {
  const m = searchMatches.value[searchCur.value - 1];
  return !!m && m.ri === ri && m.ci === ci;
}
let prevHitCurEl: HTMLElement | null = null;
watch(searchCur, async () => {
  await nextTick();
  prevHitCurEl?.classList.remove('hit-cur');
  prevHitCurEl = null;
  const m = searchMatches.value[searchCur.value - 1];
  if (!m) return;
  const el = [...(rootEl.value?.querySelectorAll(`tbody td[data-ri="${m.ri}"]`) ?? [])]
    .find(td => (td as HTMLElement).dataset.col === visibleCols.value[m.ci]) as HTMLElement | undefined;
  if (!el) return;
  el.classList.add('hit-cur');
  prevHitCurEl = el;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
async function openSearch() {
  /* ·单框双效（D4）：searchable 档=聚焦常驻快筛框（独立查找条已并入）；
 非 searchable 档走 229 原路（表格必有查找约定不回退） */
  if (props.searchable) {
    (rootEl.value?.querySelector('.rt-qsearch-inp') as HTMLInputElement | null)?.focus();
    return;
  }
  searchOpen.value = true;
  await nextTick();
  (rootEl.value?.querySelector('.hn-inp') as HTMLInputElement | null)?.focus();
}
function closeSearch() {
  searchOpen.value = false;
  searchKw.value = '';
  /* 立即清生效词（不等 150ms 防抖）——否则关闭后命中高亮还残留一轮防抖周期 */
  searchDeferred.value = '';
  /* 焦点还给表格根：关闭后 ↑↓/再次 Ctrl+F 立即可用（键盘闭环） */
  rootEl.value?.focus();
  prevHitCurEl?.classList.remove('hit-cur');
  prevHitCurEl = null;
}
/* ═══ ·单框双效（620 稿 D1~D5 裁决）：searchable 档查找并入快筛框 ═══
 词桥：快筛词驱动 useGridSearch（150ms 防抖出 matchSet/mark）——同一词一条口径，
 输入即过滤（quickFilterEff 既有链，全量 hits）+行内 mark 点亮（哪段命中可见）；
 清词即时清生效词（不等防抖，closeSearch 语义等值平移）；非 searchable 档框不在场
 本桥空转（HitNav 自持输入不受扰）。
 Enter 桥接（D2）：过滤后所见行皆命中行，行级滚动到下一命中行（回绕；宽表横向
 滚动场景的行级定位；hit-cur 落位语义留给非 searchable 档 HitNav）。 */
watch(searchableKw, (v) => {
  searchKw.value = v;
  if (!v.trim()) searchDeferred.value = '';
});
const bridgeRi = ref(-1);
function bridgeNext() {
  const n = renderHits.value.length;
  if (!n) return;
  bridgeRi.value = (bridgeRi.value + 1) % n;
  const el = rootEl.value?.querySelector(`tbody td[data-ri="${bridgeRi.value}"]`) as HTMLElement | null;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
}
/* Ctrl+F 打开；搜索开着时 Esc 先关搜索（不落到 clearSel）。收口唯一 keydown 入口：
 处理完自身语义后转交行导航内核（Vue 模板同元素不允许重复 @keydown 属性）。
 Delete/Backspace 与 Esc 的原语义在 onGridKeydown 尾部分派 */
function onGridKeydown(e: KeyboardEvent) {
  /* P2-9：Ctrl+Z 撤销待提交——编辑框内不接管（Monaco/输入框文本撤销优先） */
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    const t = e.target as HTMLElement | null;
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
    if (pending.value.size) {
      e.preventDefault();
      undoLastPending();
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    void openSearch();
    return;
  }
  if (e.key === 'Escape' && searchOpen.value) {
    closeSearch();
    return;
  }
  /* W7：Esc=收起全部行内展开（裁决：全收）；无展开才落清勾选/框选。
 输入态让路——searchable 内建搜索框（TableQSearch）接线后「过滤→
 全选→Esc 清词」动线下 Esc 冒泡到此被 clearSel 静默清空勾选=状态重置违例（铁律 B
 「状态不重置」）；输入框 Esc 归还自持语义（搜索框清词/行内编辑归还浏览器），
 非输入态网格 Esc 语义不变（清勾选/框选/收展开原样） */
  if (e.key === 'Escape') {
    const t0 = e.target as HTMLElement | null;
    if (t0 && (t0.tagName === 'INPUT' || t0.tagName === 'TEXTAREA' || t0.tagName === 'SELECT' || t0.isContentEditable)) return;
    if (expandedRows.value.size) { expandedRows.value = new Set(); return; }
    clearSel(); return;
  }
  /* 键盘闭环守卫：输入焦点（查找框 HitNav/行内编辑/勾选列筛选等）下，编辑键与导航键
 归还浏览器——此前查找框里 Backspace 冒泡到这里被拦截成「删除勾选行」
 （preventDefault 吃掉退格 + canOps 时误触批量删除确认链），
 ↑↓/Home/End/Ctrl+C/F2 同样被网格语义截胡，输入框键盘闭环断裂 */
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
  /* 菜单键/Shift+F10：焦点行打开单元格菜单（与 QRT 对齐）——此前单元格右键
     只有鼠标入口，键盘用户无法触达复制/DSL/行操作分组 */
  if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
    const ri = focusIdx.value >= 0 ? focusIdx.value : (renderHits.value.length ? 0 : -1);
    const h = ri >= 0 ? renderHits.value[ri] : undefined;
    const col = visibleCols.value[0];
    if (h && col) {
      e.preventDefault();
      const trs = [...(rootEl.value?.querySelectorAll('tbody tr') ?? [])]
        .filter(el => !el.classList.contains('rt-expand')) as HTMLElement[];
      const tr = trs[ri];
      const td = tr?.querySelector('td[data-col]') as HTMLElement | null;
      const r = (td ?? tr)?.getBoundingClientRect();
      openCellMenuAt(r ? r.left + 8 : 0, r ? r.top + 8 : 0, h, col, ri);
      return;
    }
  }
  /* 待提交一键提交（键盘路径）——表格聚焦且有 pending 时 Ctrl+S / Ctrl+Enter
 直提 commitPending（此前提交必须鼠标两击：点 chip 开气泡→点「提交全部」）。
 输入态让路守卫照抄上方既有短路（历史坑：查找框 Backspace 被网格语义截胡）——
 行内编辑框的 Enter 提交单格、查找框回车跳命中，均先于此分支 return 不被接管；
 Ctrl+S 无 pending 时也吞掉（防浏览器保存页面对话框弹出）。本分支必须在 onRowNavKey
 之前 return：useRowNav 的 Enter 不查 ctrlKey，Ctrl+Enter 否则会误触发「打开文档」 */
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === 's' || e.key === 'Enter')) {
    e.preventDefault();
    if (pending.value.size) void commitPending();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDeleteKey(); return; }
  /* F2=编辑焦点行首列（Excel F2 惯例）——此前键盘无路径进入行内编辑，
 只能双击；编辑态中 F2 不接管（落到 onRowNavKey 被 guard 拦下） */
  if (e.key === 'F2' && !editing.value && focusIdx.value >= 0) {
    const h = renderHits.value[focusIdx.value];
    const col = visibleCols.value[0];
    if (h && col) { e.preventDefault(); void startEdit(h, col); return; }
  }
  /* W7：E=展开/收起焦点行内嵌详情（Enter 保持既有「打开文档弹窗」语义不变，任务裁决记录） */
  if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey && focusIdx.value >= 0) {
    const h = renderHits.value[focusIdx.value];
    if (h) { e.preventDefault(); toggleRowExpand(rowKey(h, focusIdx.value)); return; }
  }
  onRowNavKey(e);
}

/* ═══ P0-2：单元格详情弹层 ═══
 完整值嵌 JsonTree（tools 自带搜索定位/复制全文）；对象用原值、标量包列名键统一成树；
 maxChildren=200/maxStrLen=4000 防 MB 级值拖死弹层（全文复制走 JsonTree 工具条不受伤） */
const cellDetail = ref<{ hit: SearchHit; col: string } | null>(null);
const detailOpen = computed({
  get: () => !!cellDetail.value,
  set: (v: boolean) => { if (!v) cellDetail.value = null; },
});
const detailData = computed(() => {
  const d = cellDetail.value;
  if (!d) return null;
  const raw = displayVal(d.hit, d.col);
  return raw != null && typeof raw === 'object' ? raw : { [d.col]: raw };
});
const detailMeta = computed(() => {
  const d = cellDetail.value;
  if (!d) return '';
  const raw = displayVal(d.hit, d.col);
  const kind = raw == null ? 'null'
    : Array.isArray(raw) ? `数组（${raw.length} 项）`
    : typeof raw === 'object' ? `对象（${Object.keys(raw).length} 键）`
    : typeof raw === 'string' ? `字符串（${raw.length} 字符）`
    : typeof raw;
  const t = props.fieldTypes?.[d.col];
  return `${d.col} · _id ${d.hit._id}${t ? ' · ' + t : ''} · ${kind}`;
});

/* ═══ W3：rowDrawer 行详情侧拉平移 RT（QRT W-B 同款，行为逐字对齐）═══
 入口=单元格右键菜单「行详情」项（props.rowDrawer 门控，缺省 false 无项零增量）；
 面板=整行 visibleCols 键值对 + 逐格复制 + 页脚「复制整行 JSON」（copyRowJson 同一口径）；
 行身份存 hit 引用（_id 稳定，重排序不位移），ri 只供「第 N 行」文案。 */
const rdwRow = ref<{ hit: SearchHit; ri: number } | null>(null);
const rdwOpen = computed({
  get: () => !!rdwRow.value,
  set: (v: boolean) => { if (!v) rdwRow.value = null; },
});
/* QRT rdwW 同款视口钳制：窄视口按 94% 收口，上限 520 */
const rdwW = Math.min(520, Math.round(window.innerWidth * 0.94));
/* 逐格复制（与右键「复制值」同一口径：对象 JSON 串化、null 空串） */
async function copyDrawerCell(hit: SearchHit, c: string) {
  const v = displayVal(hit, c);
  const ok = await copyText(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? '已复制' : '复制失败');
}

/* ═══ Pending Changes ═══ */
interface CellChange { oldVal: any; newVal: any }
const pending = ref<Map<string, Map<string, CellChange>>>(new Map());
const pendingCount = computed(() => {
  let n = 0;
  pending.value.forEach(f => (n += f.size));
  return n;
});
/* 方案 A：变更明细前 3 条（行 id × 字段 旧值→新值，单条撤销）——
 超出折叠计数（「… 共 N 处」）；jstr 统一对象序列化展示 */
const pendItems = computed(() => {
  const out: Array<{ id: string; field: string; oldVal: any; newVal: any }> = [];
  pending.value.forEach((fields, id) => {
    fields.forEach((ch, field) => {
      if (out.length < 3) out.push({ id, field, oldVal: ch.oldVal, newVal: ch.newVal });
    });
  });
  return out;
});
function jstr(v: any): string {
  return typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
}
/* 单条撤销复用既有 revertOne（版，含 lastFailed 清理，见 applyEdit 后） */
function pendingCell(id: string, field: string) {
  return pending.value.get(id)?.has(field);
}

/* 长列表回顶——滚过 600px 出现，点击平滑归顶 */
const wrapEl = ref<HTMLElement | null>(null);
const showTop = ref(false);
/* 横向滚动态可视化——冻结列(sticky+不透明背景)会把滚入其下方的普通列
 开头盖住（冻结窗格语义），此前无任何视觉反馈，用户以为「渲染遮挡缺字」。
 scrollLeft>0 时给冻结缘加投影，明示「下方有内容」。 */
const hScrolled = ref(false);
function onWrapScroll() {
  const el = wrapEl.value;
  if (el) { showTop.value = el.scrollTop > 600; hScrolled.value = el.scrollLeft > 0; }
}
/* 切索引/换存储键时横向滚动位归零——新维度回列首，防止上一维度
 的 scrollLeft 残留让新结果集一打开就是「列首被冻结层盖住」的假遮挡态 */
watch(() => props.storageKey || props.index, () => {
  const el = wrapEl.value;
  if (el) { el.scrollLeft = 0; hScrolled.value = false; }
});
function backToTop() {
  const el = wrapEl.value;
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  showTop.value = false;
}
/* 键盘行导航（Xmigrate 范式合并）——表格获焦后 ↑↓/Home/End 移动高亮行；
 内核合并 useRowNav 共享 composable（QueryResultTable 同步接入，逻辑零变化）；
 输入框聚焦时（行内编辑/搜索）不接管（guard）；排序/翻页导致行集变化时自动钳位。
 Enter=打开焦点行文档、Ctrl+C=复制焦点行 JSON（Xmigrate 同语义，
 复制列集=visibleCols 所见即所得）。 */
/* M1：行集钳位 renderHits——此前行集=sortedHits 全量、渲染只 2000 行，
 ↓ 走过 2000 行后高亮挂在不存在的 DOM 上（高亮消失）、Enter/Ctrl+C 却仍对不可见行生效；
 现「所见即所导航」：截断时键盘导航只作用于已渲染的前 N 行（55 批滚动跟随欠账一并收口） */
const { focusIdx, tblFocus, onRowNavKey } = useRowNav(
  computed(() => renderHits.value.length),
  {
    guard: () => !editing.value,
    onEnter: (i) => { const h = renderHits.value[i]; if (h) emit('open-doc', h); },
    onCopy: (i) => { const h = renderHits.value[i]; if (h) copyRowJson(h); },
  },
);
/* M1：滚动跟随（QRT 62 批同款合并）——↑↓ 走出视口自动 nearest 跟随，
 不打断当前视野；编辑输入框聚焦时不抢滚（focusIdx 推进被 guard 拦截） */
watch(focusIdx, (i) => {
  if (i < 0 || !tblFocus.value) return;
  const tr = rootEl.value?.querySelector('tbody tr:nth-child(' + (i + 1) + ')') as HTMLElement | null;
  tr?.scrollIntoView?.({ block: 'nearest' });
});

/* 行复制组装合并为函数——键盘 Ctrl+C（与 hover 行内钮共用同一口径
 （列集=visibleCols 所见即所得） */
function copyRowJson(h: SearchHit) {
  const row: Record<string, any> = { _id: h._id };
  for (const c of visibleCols.value) row[c] = h._source?.[c] ?? null;
  copyText(JSON.stringify(row, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制行 JSON' : '复制失败'));
}

const editing = ref<{ id: string; field: string; value: string } | null>(null);
const editInp = ref<HTMLInputElement[]>();
async function startEdit(hit: SearchHit, field: string) {
  /* OPERATOR+ 才能就地编辑(update-document=普通写档)——
 VIEWER 双击静默不进编辑态(提示文案已按角色切换,不会误以为坏掉)。
 连接级写授权由 canWriteOn 镜像后端写门语义(见 canWrite 定义) */
  if (!canWrite.value) return;
  const cur = displayVal(hit, field);
  editing.value = {
    id: hit._id, field,
    value: typeof cur === 'object' ? JSON.stringify(cur) : String(cur ?? ''),
  };
  await nextTick();
  editInp.value?.[0]?.focus();
}

/* 编辑态 Tab=提交当前并打开同行下一可编辑字段（Shift+Tab=上一字段；
 行尾跨到下一行首列，行首反向跨到上一行末列，表边界停住不回卷）——dbx/Excel 内联编辑标配。
 数据丢失根治：旧实现指望 blur 提交，但 blur 触发时 editing 已被换成下一格
 状态——applyEdit 读到的是新格未变的值直接早退，旧格已敲的修改被静默丢弃；现改为
 Tab 键内先同步 applyEdit 提交当前格（此刻 editing 仍是旧格），再 setTimeout(0) 开下一格。 */
function tabEdit(back: boolean) {
  const e = editing.value; if (!e) return;
  applyEdit();
  const cols = visibleCols.value;
  const rows = renderHits.value;
  let ci = cols.indexOf(e.field);
  const ri = rows.findIndex(h => h._id === e.id);
  if (ci < 0) ci = 0;
  if (ri < 0) return;
  let nextCol = cols[ci + (back ? -1 : 1)];
  let nextHit = rows[ri];
  if (!nextCol) {
    nextHit = rows[ri + (back ? -1 : 1)];
    if (!nextHit) return;
    nextCol = back ? cols[cols.length - 1] : cols[0];
  }
  setTimeout(() => startEdit(nextHit, nextCol), 0);
}
/* M6：中文输入法组字守卫——组字中的 Enter 是候选确认不是提交
 （此前组字确认会误触发 applyEdit 把拼音串存进 pending；dbx 在 IME 上修过三轮：
 v0.5.62/v0.5.64/v0.6.6，同类坑）。Esc 提交路径无需守卫（Esc 本就是取消语义） */
const imeComposing = ref(false);
function onEditEnter() { if (imeComposing.value) return; applyEdit(); }
function applyEdit() {
  if (!canWrite.value) return;
  const e = editing.value;
  if (!e) return;
  editing.value = null;
  const hit = props.hits.find(h => h._id === e.id);
  if (!hit) return;
  const oldVal = hit._source[e.field];
  let newVal: any = e.value;
  // 类型感知转换
  if (typeof oldVal === 'number') { const n = Number(e.value); if (!isNaN(n)) newVal = n; }
  else if (typeof oldVal === 'boolean') newVal = e.value === 'true';
  else if (typeof oldVal === 'object' && oldVal !== null) {
    try { newVal = JSON.parse(e.value); } catch { store.notify('warning', 'JSON 解析失败，按字符串保存'); }
  }
  if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
    /* ·实报「二次编辑没变化」：显示与编辑初值基准是 displayVal
 （pending 在场读 pending.newVal），本短路的比对基准却是 _source 原值——
 pending 在场时把值改回原值（最自然的「改回去」）被静默吞掉且 pending 残留，
 格子纹丝不动，编辑路径到达不了撤销。短路分支区分两态：pending 在场=撤销
 语义，接 revertOne（撤销钮同款单格 API）徽标减数+显示回原值；不在场=真
 无操作短路维持。undoStack 残留条目由 undoLastPending 在场检查自动跳过。 */
    if (pending.value.get(e.id)?.has(e.field)) {
      revertOne(e.id, e.field);
      store.notify('success', `已撤销 ${e.field} 修改，恢复原值`);
    }
    return;
  }
  if (!pending.value.has(e.id)) pending.value.set(e.id, new Map());
  pending.value.get(e.id)!.set(e.field, { oldVal, newVal });
  pending.value = new Map(pending.value);
  /* P2-9：应用序推栈（Ctrl+Z 撤销链） */
  undoStack.value.push({ id: e.id, field: e.field });
}
function revertOne(id: string, field: string) {
  const f = pending.value.get(id);
  if (!f) return;
  f.delete(field);
  lastFailed.value.delete(cellKey(id, field));
  if (!f.size) pending.value.delete(id);
  pending.value = new Map(pending.value);
}
function revertAll() { pending.value = new Map(); lastFailed.value.clear(); undoStack.value = []; }

/* ═══ P2-7：待提交变更导出 bulk NDJSON（审计/复现/重放）═══ */
function copyBulkNdjson() {
  const changes = [...pending.value.entries()].map(([id, fields]) => ({
    id,
    fields: Object.fromEntries([...fields.entries()].map(([f, ch]) => [f, ch.newVal])),
  }));
  if (!changes.length) return;
  const ndjson = buildBulkNdjson(props.index, changes);
  copyText(ndjson).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制 ${changes.length} 条的 bulk NDJSON（_bulk 请求体）` : '复制失败'));
}

/* ═══ ：表格快照 PNG（渲染根整体截取；html-to-image 动态 import 独立 chunk）═══ */
const snapshotting = ref(false);
async function snapshotPng() {
  if (snapshotting.value || !rootEl.value) return;
  snapshotting.value = true;
  const ok = await snapshotTableToPng(rootEl.value, `${props.index}-snapshot-${exportStamp()}.png`);
  snapshotting.value = false;
  store.notify(ok ? 'success' : 'error', ok ? '表格快照已下载（PNG）' : '快照生成失败');
}

/* ═══ P2-9：编辑待提交 Ctrl+Z 栈式撤销（dbx Mod+Z 对位）═══
 栈存「应用序」的 id::field——撤销时从栈尾找最近一个仍在 pending 的项回退
 （已提交成功/已手动撤销的项跳过不回退）；Ctrl+Z 在编辑框内不接管（文本撤销优先） */
const undoStack = ref<Array<{ id: string; field: string }>>([]);
function undoLastPending() {
  while (undoStack.value.length) {
    const top = undoStack.value[undoStack.value.length - 1];
    if (pending.value.get(top.id)?.has(top.field)) {
      revertOne(top.id, top.field);
      undoStack.value.pop();
      store.notify('success', `已撤销 ${top.id} 的 ${top.field} 更改`);
      return;
    }
    undoStack.value.pop();
  }
}

const previewOpen = ref(false);
const committing = ref(false);
const commitProgress = ref('');
/* 上次提交失败的项（id::field）——气泡里红标，重试前心里有数；撤销/成功即清 */
const lastFailed = ref<Set<string>>(new Set());
async function commitPending() {
  if (!canWrite.value) { store.notify('warning', '当前身份无文档写权限'); return; }
  committing.value = true;
  const entries = [...pending.value.entries()];
  /* 失败原因透传——只报 id 不知道为什么失败（mapping 冲突/类型错是高频原因），
 收集「id + 服务端原因摘要」，通知带前 3 条完整明细 */
  const failures: string[] = [];
  const failureTips: string[] = [];
  let done = 0;
  const digest = (m: string) => m.replace(/\s+/g, ' ').trim().slice(0, 80);
  for (const [id, fields] of entries) {
    const doc: Record<string, any> = {};
    fields.forEach((ch, f) => (doc[f] = ch.newVal));
    try {
      await api.updatePartial(props.index, id, JSON.stringify(doc));
      pending.value.delete(id); // 成功即移除，失败项保留待重试
      fields.forEach((_, f) => lastFailed.value.delete(cellKey(id, f)));
    } catch (err: any) {
      const reason = digest(String(err?.message ?? err));
      failures.push(id);
      failureTips.push(`${id}: ${reason || '未知错误'}`);
      fields.forEach((_, f) => lastFailed.value.add(cellKey(id, f)));
    }
    done++;
    commitProgress.value = `${done}/${entries.length}`;
  }
  committing.value = false;
  pending.value = new Map(pending.value);
  if (failures.length) {
    const detail = failureTips.slice(0, 3).join('；');
    store.notify('error', `失败 ${failures.length} 条（已保留待重试）— ${detail}${failures.length > 3 ? ' …' : ''}`);
  }
  else { store.notify('success', '已提交全部更改'); emit('refresh'); }
}

/* ═══ ：拖拽框选单元格区域（dbx 灵魂操作）——左键从格内拖出矩形，
 松开完成选区；浮动条一键复制 TSV/清除。纯点击（无位移）不启动，单击复制/双击编辑不受影响。 ═══ */
const regionAnchor = ref<{ ri: number; ci: number } | null>(null);
const region = ref<{ ri1: number; ri2: number; ci1: number; ci2: number } | null>(null);
let suppressClick = false;
/* 格内拖选守卫：mousedown 锚定→click 位移超阈不当作单击（与框选 suppressClick 互补——
 框选管跨格矩阵拖选，这里管格内字符级拖选） */
const cellGuard = createPressGuard();
function onCellDown(e: MouseEvent) { cellGuard.down(e); }
const regionKeys = computed(() => {
  const s = new Set<string>();
  const r = region.value;
  if (r) for (let ri = r.ri1; ri <= r.ri2; ri++) for (let ci = r.ci1; ci <= r.ci2; ci++) s.add(ri + ':' + ci);
  return s;
});
function onRegionStart(e: MouseEvent, ri: number, ci: number) {
  if (editing.value || e.ctrlKey || e.metaKey) return;
  /* 1441：触屏 tap 会在 pointer 之后补发合成 mousedown——那条路径会把触屏两击
     刚建好的矩形清空。同一手势内的合成 mousedown 距 pointerdown 只有几毫秒，
     用时间窗短路；触屏设备接鼠标时（pointerType=mouse）不受影响。
     与 QRT 同款（1408 那边先落，RT 这侧此前完全没有触屏框选）。 */
  if (lastPointerWasTouch && Date.now() - touchStamp < 700) return;
  regionAnchor.value = { ri, ci };
  region.value = null;
  window.addEventListener('mousemove', onRegionMove);
  window.addEventListener('mouseup', onRegionEnd, { once: true });
}

/* ═══ 1441：触屏两击框选（QRT 1408 同款下沉——此前 RT 只能鼠标拖选，平板用户框不出来）═══
 长按（500ms）第一格设起点，再点另一格成矩形；起点格虚线标记 + 浮动条引导。
 只在没有 hover 的设备上生效（pointerType=touch），鼠标语义零变化。 */
const touchAnchor = ref<{ ri: number; ci: number } | null>(null);
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let lastPointerWasTouch = false;
let touchStamp = 0;
function cancelTouchTimer() {
  if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
}
function onCellPointerDown(e: PointerEvent, ri: number, ci: number) {
  if (e.pointerType !== 'touch') return;
  lastPointerWasTouch = true;
  touchStamp = Date.now();
  cancelTouchTimer();
  if (touchAnchor.value) {
    const a = touchAnchor.value;
    region.value = {
      ri1: Math.min(a.ri, ri), ri2: Math.max(a.ri, ri),
      ci1: Math.min(a.ci, ci), ci2: Math.max(a.ci, ci),
    };
    touchAnchor.value = null;
    return;
  }
  touchTimer = setTimeout(() => { touchAnchor.value = { ri, ci }; touchTimer = null; }, 500);
}
/* 只有「没按满 500ms」才取消——按满后的抬手不该抹掉刚设的起点 */
function onCellPointerUp() { if (touchTimer) cancelTouchTimer(); }
function onRegionMove(e: MouseEvent) {
  const a = regionAnchor.value;
  if (!a) return;
  const td = (e.target as HTMLElement | null)?.closest?.('td.rt-cell') as HTMLElement | null;
  if (!td?.dataset.ri || !td.dataset.col) return;
  const ri = Number(td.dataset.ri);
  const ci = visibleCols.value.indexOf(td.dataset.col);
  if (isNaN(ri) || ci < 0) return;
  region.value = { ri1: Math.min(a.ri, ri), ri2: Math.max(a.ri, ri), ci1: Math.min(a.ci, ci), ci2: Math.max(a.ci, ci) };
}
function onRegionEnd() {
  window.removeEventListener('mousemove', onRegionMove);
  regionAnchor.value = null;
  if (region.value) {
    /* 拖出过矩形：抑制紧随的 click（避免误触发单击复制），微任务后复位 */
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
  }
}
function clearRegion() { region.value = null; touchAnchor.value = null; cancelTouchTimer(); }
async function copyRegionTsv(ext: 'tsv' | 'json') {
  const r = region.value;
  if (!r) return;
  const cols = visibleCols.value.slice(r.ci1, r.ci2 + 1);
  const rows: SearchHit[] = [];
  for (let ri = r.ri1; ri <= r.ri2; ri++) { const h = sortedHits.value[ri]; if (h) rows.push(h); }
  /* 文本组装下沉 copyMatrix（与勾选行复制同源内核；通知文案不变） */
  const text = matrixText({
    rows,
    cols,
    /* 复制矩阵过 exportCell 管道（jsonRow 文档语义恒 raw） */
    getVal: (h, c) => xCell(getSourceVal(h, c), c, h),
    jsonRow: (h) => { const o: Record<string, any> = { _id: h._id }; for (const c of cols) o[c] = getSourceVal(h, c) ?? null; return o; },
  }, ext);
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok
    ? ext === 'json' ? `已复制选区 ${rows.length}×${cols.length}（JSON）` : `已复制选区 ${rows.length} 行 × ${cols.length} 列（TSV）`
    : '复制失败');
}

/* ═══ 聚合选择（Ctrl+点击数值单元格） ═══ */
const aggCells = ref<Set<string>>(new Set());
const cellKey = (id: string, field: string) => id + '::' + field;
function toggleAggCell(hit: SearchHit, field: string) {
  const k = cellKey(hit._id, field);
  if (aggCells.value.has(k)) aggCells.value.delete(k);
  else aggCells.value.add(k);
  aggCells.value = new Set(aggCells.value);
}
const aggStats = computed(() => {
  /* 统计合并 utils/summarize（单趟 reduce 求 min/max）——此前
 Math.min(...nums)/Math.max(...nums) 的展开参数在万级聚合集会 RangeError；
 全非数值时仍返回 null（状态栏显示操作提示分支） */
  const vals: number[] = [];
  aggCells.value.forEach(k => {
    const [id, field] = k.split('::');
    const hit = props.hits.find(h => h._id === id);
    const v = hit ? getSourceVal(hit, field) : undefined;
    if (typeof v === 'number') vals.push(v);
  });
  const s = summarize(vals);
  return s.numCount ? s : null;
});

/* 框选区域自动聚合（dbx 选区底栏语言）——框完即显 Σ/avg/数值占比，
 无需先 Ctrl+点击。与 aggCells（Ctrl+点散选）并存，计算层同走 summarize */
const regionSummary = computed(() => {
  const r = region.value;
  if (!r) return null;
  const vals: unknown[] = [];
  for (let ri = r.ri1; ri <= r.ri2; ri++) {
    const h = sortedHits.value[ri];
    if (!h) continue;
    for (let ci = r.ci1; ci <= r.ci2; ci++) {
      const c = visibleCols.value[ci];
      if (c !== undefined) vals.push(h._source?.[c]);
    }
  }
  return summarize(vals);
});

/* ═══ Transpose（开关偏好按维度记忆，经 useTablePrefs） ═══ */

/* 换索引/换数据时清理状态 */
watch(() => props.index, () => {
  pending.value = new Map();
  aggCells.value = new Set();
  selected.value = new Set();
  expandedRows.value = new Set();
});

/* 精确清理勾选：父组件删除成功后调用——传 ids 则只剔除已删文档、保留其余跨页勾选，
 不传则清空全部。避免「删除成功后勾选残留幽灵 id」导致后续批量操作误伤 */
function clearSelected(ids?: string[]) {
  if (!ids || !ids.length) { selected.value = new Set(); return; }
  const next = new Set(selected.value);
  ids.forEach(i => next.delete(i));
  selected.value = next;
}
/* 导出行集统一出口——排序序（sortedHits）+ 勾选过滤（有勾选只导选中），
 内部 exportRows 与外部消费方（DslQueryView 导出本页）共用同一语义，防两入口割裂 */
function currentExportRows(): SearchHit[] {
  return selected.value.size
    ? sortedHits.value.filter(h => selected.value.has(h._id))
    : sortedHits.value;
}
/* P1-4：待提交编辑暴露——自动刷新 guard 据此挂起（编辑挂起时不重放查询） */
function hasPending(): boolean { return pending.value.size > 0; }
defineExpose({ clearSel, revertAll, clearSelected, getExportRows: currentExportRows, hasPending, captureLayout, applyLayout });

/* ═══ P2-8：文档对比 ═══
 勾选 2~3 行 → 右键「文档对比」直达弹窗；行集走 currentExportRows（勾选+排序序），
 基准默认第一篇，弹窗内 chips 换基准纯前端重算。 */
const docDiffShow = ref(false);
const docDiffHits = ref<SearchHit[]>([]);
const docDiffBase = ref(0);
function openDocDiff() {
  const hits = currentExportRows().slice(0, 3);
  if (hits.length < 2) { store.notify('warning', '请先勾选 2~3 行再对比'); return; }
  docDiffHits.value = hits;
  docDiffBase.value = 0;
  docDiffShow.value = true;
}

/* ═══ P2-11：布局一体快照 ═══
 「保存的搜索」的布局半边——排序链+列筛选（运行态）与列选/列宽/冻结/转置/密度/行高
 （偏好态）整体进出。偏好 ref 写入即被 useTablePrefs 落盘，恢复即持久；
 applyLayout 对脏数据逐项防御（坏形状跳过不炸），返回是否至少恢复了一项。 */
function captureLayout() {
  return {
    sort: sortSpec.value.map(s => ({ ...s })),
    filters: JSON.parse(JSON.stringify(colFilters.value)),
    cols: [...visibleCols.value],
    widths: JSON.parse(JSON.stringify(colWidths.value)),
    freeze: freezeN.value,
    transpose: transpose.value ? transposeN.value : 0,
    rowH: rowH.value,
  };
}
function applyLayout(l: any): boolean {
  if (!l || typeof l !== 'object') return false;
  let touched = false;
  if (Array.isArray(l.sort)) {
    const ks = l.sort.filter((s: any) => s && typeof s.f === 'string' && (s.d === 'asc' || s.d === 'desc')).slice(0, 3);
    sortSpec.value = ks; chain.persist(); touched = true;
  }
  if (l.filters && typeof l.filters === 'object' && !Array.isArray(l.filters)) {
    colFilters.value = JSON.parse(JSON.stringify(l.filters)); touched = true;
  }
  if (Array.isArray(l.cols) && l.cols.length && l.cols.every((c: any) => typeof c === 'string')) {
    visibleCols.value = [...l.cols]; touched = true;
  }
  if (l.widths && typeof l.widths === 'object' && !Array.isArray(l.widths)) {
    colWidths.value = { ...l.widths }; touched = true;
  }
  if (typeof l.freeze === 'number' && l.freeze >= 0 && l.freeze < 20) {
    setFreezeN(l.freeze); touched = true;
  }
  if (typeof l.transpose === 'number') {
    if (l.transpose > 0) { if (!transpose.value) toggleTranspose(); setTransposeN(l.transpose); }
    else if (transpose.value) toggleTranspose();
    touched = true;
  }
  /* dense 布尔退役——rowH 缺席的旧保存布局把 dense=true 映射为
 compact 档（向后兼容），新布局一律直接带 rowH */
  if (l.rowH === 'compact' || l.rowH === 'standard' || l.rowH === 'cozy') { setRowH(l.rowH); touched = true; }
  else if (typeof l.dense === 'boolean') {
    const nxt: 'compact' | 'standard' = l.dense ? 'compact' : 'standard';
    if (rowH.value !== nxt) { setRowH(nxt); touched = true; }
  }
  return touched;
}

/* ═══ ：单元格右键菜单（dbx 风格）——复制值/复制 _id/复制整行 JSON/按此列排序。
 teleport 自绘菜单（n-dropdown 懒渲染在 happy-dom 不可测，自绘 div 可挂载断言）；
 菜单打开时监听一次全局 click/esc 关闭；列排序复用 sortBy 三态循环。 ═══ */
const cellMenu = ref<{ x: number; y: number; hit: SearchHit; col: string; ri: number } | null>(null);
function openCellMenu(e: MouseEvent, hit: SearchHit, col: string, ri: number) {
  cellMenu.value = { x: e.clientX, y: e.clientY, hit, col, ri };
}
function openCellMenuAt(x: number, y: number, hit: SearchHit, col: string, ri: number) {
  cellMenu.value = { x, y, hit, col, ri };
}
/* 列头右键=列管理菜单（不用先瞄单元格；复用同一 CellContextMenu 实例） */
const colMenu = ref<{ x: number; y: number; col: string } | null>(null);

/* ═══ 1163：工具行右键菜单（与列头/单元格同一两级语言）═══
 一级 = 导出当前页 / 行高切换 / 快照；其余（重置列宽、全列适应、聚合行、转置、语义格式化）
 收进「更多…」二级。不复用 colMenuItems（那是「某一列」的语境）。 */
const barMenu = ref<{ x: number; y: number } | null>(null);
/* 1364：行尾「更多…」菜单。行内只留「查看」「展开」两个高频动作，其余 5 个低频动作
   （编辑 / 复制行 JSON / 解释得分 / 词频取证 / 删除）收进这里；守卫条件与 emit 逐字沿用。 */
const actMenu = ref<{ x: number; y: number; hit: SearchHit; ri: number } | null>(null);
function openActMenu(e: MouseEvent, hit: SearchHit, ri: number) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  actMenu.value = { x: Math.min(r.right - 8, window.innerWidth - 8), y: r.bottom + 4, hit, ri };
}
const actMenuItems = computed<CcmItem[]>(() => {
  const m = actMenu.value;
  if (!m) return [];
  const hit = m.hit;
  return [
    ...(props.editable && canWrite.value
      ? [{ key: 'act-edit', label: '编辑文档', icon: Pencil, run: () => emit('edit-doc', hit) }]
      : []),
    { key: 'act-copy', label: '复制行 JSON', icon: Copy, run: () => copyRowJson(hit) },
    ...(props.showRelevance
      ? [
          { key: 'act-explain', label: '解释这条命中得分', icon: SearchCheck, run: () => emit('explain-hit', hit) },
          { key: 'act-xray', label: '词频取证', icon: ScanSearch, run: () => emit('xray-hit', hit) },
        ]
      : []),
    ...(canOps.value
      ? [{ key: 'act-del', label: '删除文档', icon: Trash2, danger: true, sep: true, run: () => emit('delete-doc', hit) }]
      : []),
  ];
});
function openBarMenu(e: { clientX: number; clientY: number }) {
  barMenu.value = { x: e.clientX, y: e.clientY };
}
const barMenuItems = computed<CcmItem[]>(() => {
  if (!barMenu.value) return [];
  const hasRows = props.hits.length > 0;
  return [
    { key: 'bar-export', label: `导出当前页（${expFmt.value.toUpperCase()}）`, icon: FileDown, run: () => { if (hasRows) exportRows(expFmt.value); } },
    { key: 'bar-rowh', label: `行高：${rowHLabel.value}（点击切换）`, icon: MoveHorizontal, run: () => cycleRowH() },
    { key: 'bar-snapshot', label: '快照 PNG（当前页）', icon: Camera, run: () => { if (hasRows) snapshotPng(); } },
    {
      key: 'bar-more', label: '更多…', icon: ChevronDown, sep: true, children: <CcmItem[]>[
        { key: 'bar-reset-w', label: '重置全部列宽', icon: MoveHorizontal, run: () => resetColWidths() },
        { key: 'bar-fit-all', label: '全部列适应内容', icon: MoveHorizontal, run: () => fitAll() },
        { key: 'bar-agg', label: aggOn ? '✓ 聚合行' : '聚合行', icon: Table, run: () => toggleAggRow() },
        { key: 'bar-transpose', label: transpose ? '✓ 转置视图' : '转置视图', icon: RotateCcw, run: () => toggleTranspose() },
        { key: 'bar-sem', label: semPref ? '✓ 语义格式化' : '语义格式化', icon: Braces, run: () => { semPref.value = !semPref.value; } },
        /* 宿主注入的菜单项（bar-extra 槽里那些图标钮的等价菜单入口）。
           工具行右键是「表格操作那个表头」的完整入口，宿主往工具行加的钮
           必须同时在这里可达——否则窄档收起图标后就只剩一枚无文字按钮。 */
        ...(props.barMenuExtra || []),
      ],
    },
  ];
});
/* ═══ P2-3：列详情卡（dbx 列详情对位，轻量统计版）═══
 统计内核下沉 useColStats、弹窗下沉 ColDetailModal 共享件（QRT 同步接入）；
 口径=当前筛选后的行集（所见即所析）；labelOf 与筛选弹层同一函数 */
const colDetail = ref<string | null>(null);
const colDetailOpen = computed({
  get: () => !!colDetail.value,
  set: (v: boolean) => { if (!v) colDetail.value = null; },
});
/* 统计行基（dbx 行选聚合对位）——选中行集在场=「选中∩过滤后」，
 无选中=过滤后全量（缺省零增量）。useColStats 无缓存（statsOf 每次现算 rows()），
 行基动态切换全链 Σ/avg/count/med/spark/dist/空值率自动跟随；列详情弹窗同源同基=
 与聚合行同一数字（「所见即所析」口径的行选延伸） */
const aggBaseRows = computed<any[]>(() => selected.value.size
  ? filteredHits.value.filter(h => selected.value.has(h._id))
  : filteredHits.value);
const colStats = useColStats({
  rows: () => aggBaseRows.value,
  getVal: (h, c) => getSourceVal(h, c),
  labelOf: filters.labelOf,
  fieldType: (c) => props.fieldTypes?.[c] ?? '',
});
const colDetailStats = computed(() => (colDetail.value ? colStats.statsOf(colDetail.value) : null));

/* ═══ ：聚合 footer 行（列头菜单「聚合行」开关）═══
 开关落盘 es_tbl_agg:<dim>（useTablePrefs 键体系旁）；数值列 Σ/avg 复用
 useColStats.statsOf 口径（rows=过滤后行集，与列详情弹窗同一数字，所见即所析）。
 W-A：readAggPref/aggOn/toggleAggRow/aggFoot 随壳合并 useAggRow
 （QRT 同构段单一出处；唯一差列源 visibleCols → 参数 renderCols），
 模板 tfoot（含 chk/act 占位 cell）保位不动（healthTablesGraft 挂载级行为锁零改锚）。
 AggNum 补 count 档（statsOf().count 非空值计数，同一 statsOf 调用
 零增量取字段）——tfoot「Σ … · avg …」前缀之后 append（wave535 contains 前缀锁兼容） */
/* T1：count 装配基座——538 源码锁 toContain 逐字节锚定 return 行（552 不得改动）。
 median 档在 useAggRow 装配层由 wrapper 并入（QRT 同构） */
function numericOfCount(c: string) {
  const t = props.fieldTypes?.[c];
  if (t && isNonSemanticType(t)) return null;
  const s = colStats.statsOf(c);
  return s.numeric ? { ...s.numeric, count: s.count } : null;
}
const { aggOn, toggleAggRow, aggFoot, aggSpark, aggDist } = useAggRow(
  dimension,
  () => visibleCols.value,
  /* median 并入（statsOf 复算一次取 median——基座 538 源码锁逐字节钉死不可动；
 复算纯读无副作用，aggOn 非默认档才有开销；QRT/RT 同构） */
  (c) => { const n = numericOfCount(c); return n ? { ...n, median: colStats.statsOf(c).median ?? undefined } : null; },
  /* 迷你走势数据源（useColStats.seriesOf 同硬口径；显式非语义类型同守卫不出） */
  (c) => { const t = props.fieldTypes?.[c]; if (t && isNonSemanticType(t)) return null; return colStats.seriesOf(c); },
  /* 件①：值分布数据源接线（件① QRT 半边的 RT 对称件）——useColStats.dist
 直连（utils/distBins 单源，与列详情弹窗分布段同语汇）；守卫列（binary 等 18 型+_source）
 useColStats 层天然 null 不出，数值点 <2 列 null */
  (c) => colStats.statsOf(c).dist,
);
/* tfoot 空值率档数据源（aggFoot 在场=数值列口径）。：取整口径
 下沉 useColStats.emptyPctOf 单源（QRT/RT 双份内联退役换调用，QRT 同构）；空值率不塞
 538 源码锁钉死的 numericOfCount 装配层，仍从 statsOf 另取 */
const aggEmptyPct = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  if (!aggOn.value) return out;
  for (const c of visibleCols.value) {
    if (!aggFoot.value?.[c]) continue;
    out[c] = colStats.emptyPctOf(c);
  }
  return out;
});
/* tfoot 口径徽标——「选中 N 行」；交集小于选中数（部分选中行被列筛掉/
 行集收缩）时「选中 K/N 行」（K=参与聚合的交集行数），诚实反映口径不静默回退；
 无选中 null=零渲染 */
const aggSelHint = computed<string | null>(() => {
  if (!selected.value.size) return null;
  const k = aggBaseRows.value.length;
  return k === selected.value.size ? `选中 ${k} 行` : `选中 ${k}/${selected.value.size} 行`;
});
function openColMenu(e: MouseEvent, col: string) {
  colMenu.value = { x: e.clientX, y: e.clientY, col };
}
/* 列头键盘菜单（键盘可达闭环）——ContextMenu 键 / Shift+F10 打开列管理，
 坐标取列头矩形（无鼠标坐标）。enter/space 排序快捷键在本函数里直接放行 */
function onColMenuKey(e: KeyboardEvent, col: string) {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  colMenu.value = { x: r.left + 8, y: r.bottom + 4, col };
}
const colMenuItems = computed(() => {
  const m = colMenu.value; if (!m) return [];
  /* 与 QRT 同一分层语言：一级「列详情」+ 排序与筛选 / 复制 / 列与视图 三组，
     二级项 label 逐字保留（能力零删除）。 */
  const sortChildren = [
    { key: 'sort-asc', label: '升序排序', icon: ArrowUp, run: () => sortBy(m.col, 'asc') },
    { key: 'sort-desc', label: '降序排序', icon: ArrowDown, run: () => sortBy(m.col, 'desc') },
    { key: 'filter-col', label: '筛选此列', icon: Filter, sep: true, run: () => { openFilterAt(m.col, m.x, m.y); } },
  ];
  const copyChildren = [
    { key: 'copy-col-name', label: '复制列名', icon: Copy, run: async () => {
      const ok = await copyText(m.col);
      store.notify(ok ? 'success' : 'error', ok ? '已复制列名' : '复制失败');
    } },
    /* 复制表头（TSV）——空行集走 matrixText 只出表头行（「表头行必含」口径） */
    { key: 'copy-head-tsv', label: '复制表头（TSV）', icon: ClipboardList, run: async () => {
      const ok = await copyText(matrixText({ rows: [], cols: visibleCols.value, getVal: () => null }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制表头 ${visibleCols.value.length} 列（TSV）` : '复制失败');
    } },
    /* 复制整列值——行集=过滤后（所见即所复），TSV 含表头行 */
    { key: 'copy-col-vals', label: '复制整列值', icon: Copy, run: async () => {
      const rows = filteredHits.value;
      const ok = await copyText(matrixText({ rows, cols: [m.col], getVal: (h, c) => xCell(getSourceVal(h, c), c, h) }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${m.col} 整列 ${rows.length} 行` : '复制失败');
    } },
    /* 复制整表 JSON——行集=sortedHits，列=visibleCols 所见即所复，值=raw */
    { key: 'copy-table-json', label: '复制整表 JSON', icon: Braces, run: async () => {
      const rows = sortedHits.value;
      const ok = await copyText(matrixText({ rows, cols: visibleCols.value, getVal: (h, c) => getSourceVal(h, c) }, 'json'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（JSON）` : '复制失败');
    } },
  ];
  const viewChildren = [
    { key: 'hide-col', label: '隐藏此列', icon: EyeOff, run: () => {
      if (visibleCols.value.length <= 1) { store.notify('error', '至少保留一列'); return; }
      visibleCols.value = visibleCols.value.filter(c => c !== m.col);
    } },
    { key: 'pin-col', label: '此列置首', icon: Pin, run: () => {
      visibleCols.value = [m.col, ...visibleCols.value.filter(c => c !== m.col)];
    } },
    /* 冻结窗格（前缀多列）——「冻结到此列」保持列序 0..idx，「取消冻结」整组解除 */
    isFrozenCol(m.col)
      ? { key: 'unfreeze-col', label: freezeN.value > 1 ? `取消冻结（前 ${freezeN.value} 列）` : '取消冻结', icon: Pin, run: () => setFreezeN(0) }
      : { key: 'freeze-col', label: '冻结到此列', icon: Pin, run: () => {
          const idx = visibleCols.value.indexOf(m.col);
          setFreezeN(idx + 1);
          store.notify('success', `已冻结前 ${idx + 1} 列（横向滚动时保持可见）`);
        } },
    { key: 'fit-col', label: '此列适应内容', icon: MoveHorizontal, run: () => fitCol(m.col) },
    { key: 'fit-all', label: '全列适应内容', icon: MoveHorizontal, run: () => fitAll() },
    ...(prefsOn.value ? [{ key: 'reset-order', label: '重置列序', icon: RotateCcw, sep: true, run: () => {
      const cur = new Set(visibleCols.value);
      visibleCols.value = allCols.value.filter(c => cur.has(c));
    } }] : []),
  ];
  return [
    { key: 'col-detail', label: '列详情', icon: Search, run: () => { colDetail.value = m.col; } },
    { key: 'sort-group', label: '排序与筛选…', icon: Filter, sep: true, children: sortChildren },
    { key: 'copy-group', label: '复制…', icon: Copy, children: copyChildren },
    { key: 'view-group', label: '列与视图…', icon: MoveHorizontal, sep: true, children: viewChildren },
  ];
});
/* fit 逻辑提取复用（单列/全列共用）；：内核下沉 useColFit
 （与 QRT 同一实现；RT 前置标识列=勾选+序号 2 列，测量含列头名 口径） */
const { fitCol, fitAll } = useColFit({
  rootEl: () => rootEl.value,
  cols: () => visibleCols.value,
  nameSel: '.rt-th-name',
  cellOffset: 2,
  setWidth: (col, w) => { colWidths.value = { ...colWidths.value, [col]: w }; },
});
/* v3.0.0：拖拽柄键盘微调列宽（role=slider 的 ←/→，与拖拽/双击同一写入口）；
 钳位引用 useColFit 共享常量——与双击自适应同源，不再互相反缩 */
function nudgeColWidth(col: string, delta: number) {
  const cur = colWidths.value[col] ?? 160;
  colWidths.value = { ...colWidths.value, [col]: Math.min(COL_W_MAX, Math.max(COL_W_MIN, cur + delta)) };
}
function closeCellMenu() { cellMenu.value = null; }
/* 复制为 DSL（term/match/ids 按类型路由，规则见 utils/dslFromCell）。
 值口径与 copyCell 一致取 displayVal（pending 未提交值优先）。
 扩 exists：字段存在性检索（空值排查语义），不依赖格值 */
function menuCopyDsl(kind: 'auto' | 'ids' | 'exists') {
  const m = cellMenu.value; if (!m) return;
  closeCellMenu();
  if (kind === 'exists') {
    const q = buildExistsDsl(m.col);
    if (!q) { store.notify('warning', '该列不适用 exists 查询'); return; }
    copyText(JSON.stringify(q, null, 2)).then(ok =>
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${m.col} 的 exists 查询` : '复制失败'));
    return;
  }
  const field = kind === 'ids' ? '_id' : m.col;
  const values = kind === 'ids' ? [m.hit._id] : [displayVal(m.hit, m.col)];
  const q = buildDsl(field, values, props.fieldTypes?.[m.col]);
  if (!q) { store.notify('warning', '空值不生成查询'); return; }
  copyText(JSON.stringify(q, null, 2)).then(ok =>
    store.notify(ok ? 'success' : 'error', ok ? `已复制 ${field} 的查询 DSL` : '复制失败'));
}
/* 勾选行同列值 → terms/ids 查询。行集=currentExportRows（勾选+排序序），
 值取 _source 原始值（与 copySelRows 口径一致），null/空串剔除 */
function menuCopySelTerms() {
  const m = cellMenu.value; if (!m) return;
  closeCellMenu();
  const rows = currentExportRows();
  const values = rows.map(r => (m.col === '_id' ? r._id : r._source?.[m.col]));
  const q = buildDsl(m.col, values, props.fieldTypes?.[m.col]);
  if (!q) { store.notify('warning', '勾选行该列无有效值'); return; }
  copyText(JSON.stringify(q, null, 2)).then(ok =>
    store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行 ${m.col} 的 terms 查询` : '复制失败'));
}
/* 全局点击/Esc 关闭（菜单挂 body，事件不冒泡到组件作用域） */
function onGlobalClose(e: Event) {
  /* 只认 Esc 关闭；此前任意 keydown 都关——菜单键打开右键菜单会被同一拍立刻关掉 */
  if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
  if (cellMenu.value) closeCellMenu();
}
window.addEventListener('click', onGlobalClose);
window.addEventListener('keydown', onGlobalClose);
onBeforeUnmount(() => {
  window.removeEventListener('click', onGlobalClose);
  window.removeEventListener('keydown', onGlobalClose);
});

/* ═══ P0-3：跳转到列（dbx GoToColumn 对位）═══
 tableRegistry 注册（命令面板合成「跳转到列 X」命令的候选源+定向调用）；
 隐藏列先自动显示再跳（dbx 同款）；目标列头闪烁 1.4s 自动熄灭；
 冻结列天然可见只闪不滚（scrollIntoView 对 sticky inline 方向 no-op，行为正确无需特判） */
const flashCol = ref('');
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function locateCol(col: string) {
  if (!visibleCols.value.includes(col)) visibleCols.value = [...visibleCols.value, col];
  flashCol.value = col;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashCol.value = ''; }, 1400);
  void nextTick(() => {
    /* 列名可含任意字符（. 等），不走属性选择器避免转义坑——dataset 遍历稳 */
    const th = [...(rootEl.value?.querySelectorAll('thead th.rt-th') ?? [])]
      .find(th => (th as HTMLElement).dataset.col === col) as HTMLElement | undefined;
    if (typeof th?.scrollIntoView === 'function') th.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
const tableRegId = registerTable({
  cols: () => visibleCols.value,
  locate: locateCol,
  visible: () => {
    const r = rootEl.value;
    const op = r && (r as HTMLElement).offsetParent;
    return !!r && op !== null && op !== undefined;
  },
});
onBeforeUnmount(() => unregisterTable(tableRegId));
/* 菜单项交给共享 CellContextMenu 渲染（RT/QRT 复用） */
const cellMenuItems = computed(() => {
  const m = cellMenu.value; if (!m) return [];
  /* 1142：按操作心智收成二级分组（与 QRT 同语言）——一级只留最高频两项 + 分组父行。
 二级 label 逐字保留（能力零删除）；锁面按「父行 + 二级项」同步更新。 */
  const copyChildren = [
    { key: 'copy-val', label: '复制值', icon: Copy, run: () => void copyCell(m.hit, m.col) },
    { key: 'copy-col-name', label: '复制列名', icon: Copy, run: async () => {
      const ok = await copyText(m.col);
      store.notify(ok ? 'success' : 'error', ok ? '已复制列名' : '复制失败');
    } },
    { key: 'copy-id', label: '复制 _id', icon: Copy, run: async () => {
      const ok = await copyText(m.hit._id);
      store.notify(ok ? 'success' : 'error', ok ? '已复制 _id' : '复制失败');
    } },
    { key: 'copy-row', label: '复制整行 JSON', icon: Braces, run: () => {
      const row: Record<string, any> = { _id: m.hit._id };
      for (const c of allCols.value) row[c] = m.hit._source?.[c] ?? null;
      copyText(JSON.stringify(row, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制整行 JSON' : '复制失败'));
    } },
    { key: 'copy-table-tsv', label: '复制整表（当前页）为 TSV', icon: ClipboardList, run: () => void copySelRows('tsv') },
    /* 复制为 DSL 组（dbx 复制 extractor 的 ES 语义对位） */
    ...(m.col === '_id'
      ? [{ key: 'dsl-ids', label: '复制为 ids 查询', icon: Braces, run: () => menuCopyDsl('ids') }]
      : (props.fieldTypes?.[m.col] === 'text'
        ? [{ key: 'dsl-match', label: '复制为 match 查询（text 字段）', icon: Braces, run: () => menuCopyDsl('auto') }]
        : [{ key: 'dsl-term', label: '复制为 term 查询', icon: Braces, run: () => menuCopyDsl('auto') }])),
    ...(m.col !== '_id'
      ? [{ key: 'dsl-exists', label: '复制为 exists 查询（字段存在）', icon: Braces, run: () => menuCopyDsl('exists') }]
      : []),
    /* 勾选行复制组（与导出三格式语义对齐，走剪贴板免下载） */
    ...(selected.value.size ? [
      { key: 'copy-sel-tsv', label: `复制 ${selected.value.size} 行为 TSV`, icon: ClipboardList, sep: true, run: () => void copySelRows('tsv') },
      { key: 'copy-sel-md', label: `复制 ${selected.value.size} 行为 Markdown`, icon: ClipboardList, run: () => void copySelRows('md') },
      { key: 'copy-sel-json', label: `复制 ${selected.value.size} 行为 JSON`, icon: ClipboardList, run: () => void copySelRows('json') },
      { key: 'copy-sel-terms', label: `复制 ${selected.value.size} 行为 terms 查询（${m.col}）`, icon: Braces, run: () => menuCopySelTerms() },
      ...(selected.value.size >= 2 && selected.value.size <= 3
        ? [{ key: 'doc-diff', label: `文档对比（${selected.value.size} 篇）`, icon: GitCompareArrows, run: () => openDocDiff() }]
        : []),
    ] : []),
  ];
  const rowChildren = [
    { key: 'detail-cell', label: '查看完整值', icon: Search, run: () => { cellDetail.value = { hit: m.hit, col: m.col }; } },
    { key: 'expand-row', label: expandedRows.value.has(rowKey(m.hit, m.ri)) ? '收起此行' : '展开此行', icon: ChevronDown, run: () => { toggleRowExpand(rowKey(m.hit, m.ri)); } },
    ...(props.rowDrawer ? [{ key: 'row-drawer', label: '行详情', icon: Search, run: () => { rdwRow.value = { hit: m.hit, ri: m.ri }; } }] : []),
  ];
  const queryChildren = [
    /* 排序两项直选（dbx 语言——升/降分开，免去循环三态猜测） */
    { key: 'sort-asc', label: '升序排序', icon: ArrowUp, run: () => sortBy(m.col, 'asc') },
    { key: 'sort-desc', label: '降序排序', icon: ArrowDown, run: () => sortBy(m.col, 'desc') },
    { key: 'filter-col', label: '筛选此列', icon: Filter, run: () => { openFilterAt(m.col, m.x, m.y); } },
    /* W7：以此值过滤并重查——只 emit 'filter-hit' */
    ...(displayVal(m.hit, m.col) != null
      ? [
          { key: 'filter-hit', label: '以此值过滤并重查', icon: Filter, run: () => {
              emit('filter-hit', {
                field: m.col,
                value: displayVal(m.hit, m.col),
                op: props.fieldTypes?.[m.col] === 'text' ? 'match' : 'term',
              });
            } },
          /* 1439：排除是排障最常用的反向动作，此前只能手改 DSL 加 must_not */
          { key: 'filter-hit-not', label: '排除此值并重查', icon: Filter, run: () => {
              emit('filter-hit', {
                field: m.col,
                value: displayVal(m.hit, m.col),
                op: props.fieldTypes?.[m.col] === 'text' ? 'match' : 'term',
                not: true,
              });
            } },
        ]
      : []),
  ];
  const exportChildren: CcmItem[] = [
    { key: 'export-view', label: `导出当前视图（${expFmt.value.toUpperCase()}）`, icon: FileDown, run: () => exportRows(expFmt.value) },
    /* 1377：按格式直接导出（QRT 右键 export-csv/json/md/ndjson/xlsx 同语义）——
      此前 RT 只能「按当前默认格式导出」，要换格式必须先改默认值再导一次（两步+副作用）。 */
    ...([
      ['csv', 'CSV', Table],
      ['xlsx', 'XLSX', Table],
      ['json', 'JSON', Braces],
      ['md', 'Markdown', FileText],
      ['ndjson', 'NDJSON', ClipboardList],
    ] as const).map(([fmt, label, icon]) => ({
      key: 'export-' + fmt, label: `导出为 ${label}`, icon, run: () => exportRows(fmt),
    })),
  ];
  const colOpsChildren: CcmItem[] = [
    { key: 'hide-col', label: '隐藏此列', icon: EyeOff, run: () => {
      if (visibleCols.value.length <= 1) { store.notify('error', '至少保留一列'); return; }
      visibleCols.value = visibleCols.value.filter(c => c !== m.col);
    } },
    { key: 'pin-col', label: '此列置首', icon: Pin, run: () => {
      visibleCols.value = [m.col, ...visibleCols.value.filter(c => c !== m.col)];
    } },
    { key: 'fit-col', label: '此列适应内容', icon: MoveHorizontal, run: () => fitCol(m.col) },
    { key: 'fit-all', label: '全列适应内容', icon: MoveHorizontal, run: () => fitAll() },
  ];
  /* 1385：默认导出格式切换——低频（改的是工具行那颗钮将来按什么格式导出），
     单独一层，不和「现在就导出」混在一起看。 */
  const fmtChildren: CcmItem[] = [
    { key: 'fmt-csv', label: `导出格式：CSV${expFmt.value === 'csv' ? ' ✓' : ''}`, icon: Table, run: () => setExpFmt('csv') },
    { key: 'fmt-xlsx', label: `导出格式：XLSX${expFmt.value === 'xlsx' ? ' ✓' : ''}`, icon: Table, run: () => setExpFmt('xlsx') },
    { key: 'fmt-json', label: `导出格式：JSON${expFmt.value === 'json' ? ' ✓' : ''}`, icon: Braces, run: () => setExpFmt('json') },
    { key: 'fmt-md', label: `导出格式：Markdown${expFmt.value === 'md' ? ' ✓' : ''}`, icon: FileText, run: () => setExpFmt('md') },
    { key: 'fmt-ndjson', label: `导出格式：NDJSON${expFmt.value === 'ndjson' ? ' ✓' : ''}`, icon: ClipboardList, run: () => setExpFmt('ndjson') },
  ];
  return [
    { key: 'copy-val', label: '复制值', icon: Copy, run: copyChildren[0].run },
    { key: 'detail-cell', label: '查看完整值', icon: Search, run: rowChildren[0].run },
    { key: 'copy-group', label: '复制…', icon: ClipboardList, sep: true, children: copyChildren.filter(c => c.key !== 'copy-val') },
    ...(rowChildren.length > 1 ? [{ key: 'row-group', label: '行操作…', icon: ChevronDown, children: rowChildren.filter(c => c.key !== 'detail-cell') }] : []),
    { key: 'query-group', label: '筛选与排序…', icon: Filter, sep: true, children: queryChildren },
    /* 1385：此前这一组 15 项平铺（实测 467px 高，800 高屏只剩 8px 余量，
       再矮一点就溢出视口）。按语义拆成三个二级分组：现在就导出 / 列操作 /
       改默认导出格式（低频，与「现在导出」不混）。 */
    { key: 'export-group', label: '导出…', icon: FileDown, sep: true, children: exportChildren },
    { key: 'col-group', label: '列操作…', icon: MoveHorizontal, children: colOpsChildren },
    { key: 'default-fmt-group', label: '默认导出格式…', icon: Table, children: fmtChildren },
  ];
});

/* 切换默认导出格式（不触发导出——导出钮一键直出） */
function setExpFmt(fmt: 'json' | 'csv' | 'md' | 'xlsx' | 'ndjson') {
  expFmt.value = fmt;
  store.notify('success', `默认导出格式已切换为 ${fmt.toUpperCase()}，「⬇ 导出」即按此格式下载`);
}

/* 勾选行复制——TSV=表格直贴（Excel/飞书），MD=文档/聊天，JSON=数组。
 格式化下沉共享 copyMatrix（与框选复制同源内核；行为/通知文案不变——
 json 分支保持 _id+全 _source 文档语义， M3：矩阵=visibleCols、文档=全量，有意分工） */
async function copySelRows(fmt: 'tsv' | 'md' | 'json') {
  const rows = currentExportRows();
  const text = matrixText({
    rows,
    cols: visibleCols.value,
    /* 复制矩阵过 exportCell 管道（jsonRow 文档语义恒 raw） */
    getVal: (r, c) => xCell(getSourceVal(r, c), c, r),
    jsonRow: (r) => ({ _id: r._id, ...r._source }),
  }, fmt);
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（${fmt.toUpperCase()}）` : '复制失败');
}
</script>

<style scoped>
.rt { position: relative; display: flex; flex-direction: column; min-height: 0; height: 100%; }
/* 内建聚焦面高度链——.fs 作为新根承接消费容器高度（聚焦态 fixed 定位不吃 height） */
.fs { display: flex; flex-direction: column; }
.fs:not(.fs-active) { height: 100%; }
/* 工具行容器化（dbx 表格卡头）——与表格连成一张卡：卡头带底边框无下圆角，
 rt-wrap 去顶边框圆角，视觉一体不再是悬空散排 */
/* 工蚁1：显式单行纪律——勾选态反选钮（bar-right 尾部）使右簇变宽后，收缩
 压力曾全落在左簇文本 item（rt-info min-content=单字宽）→ 文本折行把工具行撑成两行、
 右簇溢出「反选」孤立悬挂。nowrap 约定+左簇文本项 ellipsis 吸收（rt-info）+防折
 （rt-filtered）；右簇 flex+shrink:0 纪律住 TableShell 全局 style（内核 scoped 因
 scopeId 不传播永不命中壳内部元素——原 .rt-bar-r 内核规则即此死规则，迁出，
 字面新家见 TableShell， 形态锚同步更新）。缺省态 DOM 逐字节不变。 */
.rt-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-bottom: 0; border-radius: var(--r-m) var(--r-m) 0 0; flex-wrap: nowrap; }
/* 1146：窄档工具行换行而非裁切——1024 下左簇（视图档+顶满+分页）与右簇（导出/视图/
 列选/布局/放大）合计仍超一行，此前 overflow 直接切掉右侧钮（「快照」只露半个）。
 DBX 的做法是窄档分两行：先保全部钮可达，再谈单行。宽档（>1280）仍单行零变化。 */
/* 1150：1100 档之前先掉一档文字——1148 这类「非窄屏但也不宽」的窗口此前不掉标签，
 右簇 392px 把整行顶到 934px（可视 862px），右侧钮直接被切掉=用户说的「按钮文案遮挡」。
 1280 起就只留图标（title/aria-label 语义不丢），省约 130px；1100 以下再换行。
 ⚠ColPicker/TablePresetMenu 的标签在子组件模板里，scoped 编译出的 `.cp-label[data-v]`
 永远打不中（子组件元素不带本组件 scopeId）——必须走 :deep() 把属性前移到 .rt-bar 上，
 否则「窄档只留图标」对这两个钮从未生效（实测 1148 下「列选/布局」仍是整词）。
 ⚠1174：断点从 1280 提到 1380——1280 是按旧右簇宽度定的，右簇后来多了视图档/原始 IO/
 布局/表格操作提示等钮，实测标签态溢出起点已经前移到 1370（1370 溢出 5px、1290 溢出 85px，
 「查看原始 IO / 表格操作提示 / 放大结果表」被整块裁掉）。1281–1370 这段「既不折标签
 也不换行」的死区，正是用户反复说的「按钮文案被遮挡」。 */
@media (max-width: 1380px) {
  .rt-exp-btn-t, .rt-tool-t { display: none; }
  .rt-bar :deep(.cp-label), .rt-bar :deep(.tpm-label) { display: none; }
}
/* 1188：同一张表在三个入口的**可用宽度不同**——查询工作台是分栏，工具行比窗口窄
  几百像素；按视口断点裁标签就必然有死区。实测该入口：1440 溢出 10px、1280 溢出 41px
  （右簇越过右缘 40px = 末尾钮被切），而 1380/1250 两个视口断点都没触发。
  改为**容器查询**：以工具行自身宽度为准（.rt-bar 是容器），表多宽就裁多少。
  阈值取实测：标签态需要 ≈1180，图标态需要 ≈830。 */
/* ⚠容器查询的容器不能是它自己——查询容器只对**后代**生效。
   1188 第一版把 container-type 挂在 .rt-bar 上，结果 @container 永远不匹配（实测 flex-wrap 恒 nowrap）。
   容器挂在根壳 .rt 上，工具行是它的后代，且壳宽 = 表格可用宽 = 我们要的口径。 */
.rt { container-type: inline-size; container-name: rtbar; }
/* 2.1.4 重测（生产 2.1.3 逐宽实测）：工具行内容在「图标态」需 1170px、「标签态」需 1298px。
   旧阈值 1180/1060 是按 1053px 的旧右簇定的，右簇后来加了视图/布局/更多等钮——留下两段
   死区：容器 1061–1169（图标态仍溢出 1–100px，1440 视口实测「更多」切 13px、「放大」整个出卡）
   与 1191–1297（标签态溢出 8–108px）。阈值改为 1310（标签态实测 1298+余量）与 1170
   （图标态实测 1170），两段死区一并关闭：>1310 单行带标签，1171–1310 单行图标，
   ≤1170 两行全可达。 */
@container rtbar (max-width: 1310px) {
  .rt-exp-btn-t, .rt-tool-t { display: none; }
  .rt-bar :deep(.cp-label), .rt-bar :deep(.tpm-label) { display: none; }
}
@container rtbar (max-width: 1170px) {
  .rt-bar { flex-wrap: wrap; row-gap: var(--sp-1); }
}
/* 1164：换行阈值从 1100 提到 1180——实测（probe163）溢出起点是 1181px：
  1180 起 scrollWidth 就超过 clientWidth，1160 溢出 21px、1120 溢出 61px，
  而旧的 1100 断点在这段区间根本不触发 → 右簇末尾钮被直接切掉、rt-info 被压成 0 宽
  （实测 1120 下命中数整块消失）。换行是「宁可两行也要全可达」，阈值必须≥溢出起点。
  1174：再提到 1250——只留图标之后溢出起点是 1240（1240 溢出 6px、1200 溢出 46px），
  原 1180 仍留一段图标态溢出死区。 */
@media (max-width: 1250px) {
  .rt-bar { flex-wrap: wrap; row-gap: var(--sp-1); }
  /* 右簇换行/贴右规则不在此处——.rt-bar-r 是 TableShell 模板元素，本组件 scoped
     打不中（1164 实测写了也不生效）。规则住 TableShell 全局 style。 */
}
/* 554 工蚁1：左簇收缩缓冲——极限窄档优先牺牲计数文本完整性（省略号），保按钮全可达 */
/* 1166：但「命中数」本身是这条带子的主信息（刚需读数），不能是第一个牺牲品。
 实测 1440 宽档：容器 64.8px / 内容 65px —— 差 0.2px 就把徽标最后一段吃掉，
 高倍截图里显示成 `1/1 · 1…`（`text-overflow` 是继承属性，省略号渗进 <b> 内部）。
 改为不可收缩：让位顺序交给快滤框（placeholder 是空态装饰），计数恒完整。 */
.rt-info { font-size: var(--fs-sm); color: var(--tx2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
/* 渲染截断提示行（弱化灰字，不抢数据视觉） */
.rt-trunc-row td { text-align: center; color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-2); background: var(--bg1); }
/* 工蚁1：.rt-bar-r 规则迁出—— TableShell 合并后此规则因 scopeId 不
 传播而从未命中（死规则），生效面住壳全局 style（单源，QRT 同址），勿搬回内核 */
/* 分组分隔线（dbx 工具栏：操作按语义分组，组间竖线） */
.rt-bar-div { width: 1px; height: 14px; background: var(--line); margin: 0 3px; flex-shrink: 0; }
/* 内建视图档（QRT 607 对称件）——seg 寄居 bar-left（.seg 站内单源不重造皮，
 只加 nowrap 防换行）；alt 体区=border-top 分节+滚动区（QRT 607 同语言），卡片档网格
 容器（ih-cards 同构） */
.rt-view-seg { flex-wrap: nowrap; }
.rt-alt-body { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); }
.rt-alt-body.is-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2h); align-content: start; }
/* 导出唯一入口「⬇ 导出」——格式切换在右键菜单，主界面零菜单 */
.rt-exp-btn { display: inline-flex; align-items: center; gap: var(--sp-1); }
.rt-exp-btn-t { font-size: var(--fs-sm); }
/* 图标+文字工具钮统一间距 */
.rt-tool-btn { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); }
.rt-col-n { font-size: var(--fs-2xs); color: var(--tx2); font-variant-numeric: tabular-nums; }

/* rt-pending 独立条已并入 rt-bar（；降级为轻量 chip+气泡（用户反馈：警告条喧宾夺主） */
.pend-chip { display: inline-flex; align-items: center; gap: var(--sp-1); padding: var(--sp-0) var(--sp-2); border-radius: 99px; font-size: var(--fs-xs); color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); cursor: pointer; }
.pend-chip:hover { border-color: var(--warn); }
.pend-chip.committing { color: var(--tx2); background: var(--bg2); border-color: var(--line); cursor: default; }
.pend-chip-n { font-weight: 650; }
/* 一键提交迷你钮（chip 旁，同 warn 色系收窄形态） */
.pend-mini-commit { display: inline-flex; align-items: center; gap: 3px; padding: var(--sp-0) var(--sp-2); border-radius: 99px; font-size: var(--fs-xs); font-weight: 600; color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); cursor: pointer; }
.pend-mini-commit:hover { border-color: var(--warn); }
.pend-mini-commit:disabled { opacity: .55; cursor: not-allowed; }
/* 方案 A：竖排文字动作列表退役→「变更明细卡+主次动作行」(设计稿 A 帧)：
 头部计数徽标+首条 docId；明细逐条「字段 旧值(s 删除线)→新值+单条撤销」；底部动作行
 预览/NDJSON icon/全部撤销/提交全部(pri 实底唯一主钮)。宽 360px。 */
.pend-pop { width: 360px; max-width: 94vw; }
.pend-pop-hd { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); font-weight: 650; color: var(--tx1); padding: var(--sp-1) var(--sp-1h) var(--sp-2); border-bottom: 1px solid var(--line); }
.pend-pop-n { color: var(--ac-hi); background: var(--ac-soft); border-radius: 99px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
.pend-pop-id { margin-left: auto; font-size: var(--fs-xs); color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.pend-pop-prog { font-size: var(--fs-sm); color: var(--tx2); padding: var(--sp-1) var(--sp-1h); }
.pend-pop-list { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-1) var(--sp-1h); }
.pend-pop-item {
  display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg1); font-size: var(--fs-xs);
}
.pend-pop-fld { color: var(--tx0); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }
.pend-pop-vals { display: inline-flex; align-items: center; gap: var(--sp-1); color: var(--ac-hi); min-width: 0; overflow: hidden; }
.pend-pop-vals s { color: var(--err); opacity: .75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
.pend-pop-arr { color: var(--tx2); }
.pend-pop-undo { margin-left: auto; border: 0; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-xs); font-family: inherit; padding: 0 var(--sp-1); }
.pend-pop-undo:hover { color: var(--err); }
.pend-pop-more { font-size: var(--fs-xs); color: var(--tx2); padding: 0 var(--sp-2); }
.pend-pop-foot { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-1) var(--sp-1h) var(--sp-1h); border-top: 1px solid var(--line); background: var(--bg2); }
.pend-pop-sp { flex: 1; }
.pend-pop-act:disabled { opacity: .55; cursor: not-allowed; }
/* rt-export-pop/rt-exp-split/rt-exp-caret 等随 ▾ 菜单移除删除——格式切换收进右键菜单 */
/* .rt-ctx* 死样式删除（ CellContextMenu 合并后模板零引用，删前已 grep 全仓确认） */

.rt-loading { overflow: auto; padding: var(--sp-2h); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m); background: var(--bg1); }
/* 内置加载骨架（QRT qrt-loading 同语言） */
.rt-backtop {
  position: absolute; right: 18px; bottom: 16px; z-index: 6;
  display: inline-flex; align-items: center; gap: 3px;
  padding: var(--sp-1) var(--sp-2h); border-radius: 999px;
  background: var(--bg1); border: 1px solid var(--line-strong); color: var(--tx1);
  font-size: var(--fs-xs); cursor: pointer; box-shadow: var(--shadow-pop); transition: all var(--tr);
}
.rt-backtop:hover { color: var(--ac-hi); border-color: var(--ac-line); }
/* 回顶定位壳（滚动视口外的 absolute 锚）——rt-wrap 自身是滚动容器，
 absolute 子级会随内容滚走，定位壳必须套在外面；min-height:0 接替 rt-wrap
 在 .rt（flex column）里的收缩职责。
 ·实报④：flex:1→flex:0 1 auto——分页 10/页 只渲染 10 行时壳强制
 吃满结果区，表格下方大片空白（横滚条与提示行飘在容器底沿）。改「贴合内容+上限收缩」：
 数据少壳高=内容高（状态栏/横滚条贴到最后一行下面），数据多被 flex-shrink 压回可用
 空间、rt-wrap 内部滚动不变；回顶 absolute 锚与 thead 吸顶零触。高度红线自证：
 壳高由内容（行数×行高）决定，内容不因壳高变化=无正反馈回路。QRT 根非 flex 不适用。 */
/* 1355：shell 必须**伸展**吃掉列向剩余高度。此前 flex:0 1 auto 只按内容高站住，
   `.rt` 里 bar 41 + shell 72 + status 31 = 144，剩下 239px 全空着——DSL 工作台
   1 行结果实测表格可视高只有 72px（表体 383px 被压进滚动区），正是用户说的
   「默认可视表格特别窄，下面还有那么多空间」。空态/卡片视图同样受益（区域不变形）。 */
/* 1355：壳给**下限**而不是吃满。562 实报的教训是 flex:1 吃满结果区会让「数据少时
   表格下方一大片空白、横滚条飘在容器底沿」；但纯粹的 flex:0 1 auto（贴合内容）
   在 1 行结果时把可视表体压到 72px（实测 DSL 工作台：.rt 383px 里只有 72px 是表格）。
   两者调和 = 贴合内容 + 240px 地板（≈7 行）：少数据时表格仍有可读区域，
   多数据时按 flex-shrink 收回到可用空间，滚动仍在 .rt-wrap 内。 */
/* 1365：壳回 `flex:1 1 auto` —— 562 当时改 `0 1 auto` 是因为「数据少时下方一大片空白」，
   但 1359b 给表体加了行线底纹后那块空白已是网格延续（DBeaver/dbx 同款），不再是死白；
   而 `flex-grow:0` 的代价是 .rt 里 96px 完全没有子元素占用（实测 383px 容器只有 240px 被用），
   正是用户反复说的「默认可视表格特别窄，下面还有那么多空间」。240px 地板保留：
   极小窗口下仍保证可读行数。 */
.rt-wrap-shell { position: relative; flex: 1 1 auto; min-height: 240px; display: flex; }
/* 非表格档：表体壳不得再占 240px 弹性高（否则 JSON/Tree/卡片被推到下方，中间整块空白） */
.rt.rt-body-hidden .rt-wrap-shell { display: none; }
.rt.rt-body-hidden { flex: 0 0 auto; height: auto; }
/* 1365：底部圆角交给状态栏（它是同一张卡的页脚），表体自身不圆底。 */
.rt-wrap { flex: 1; min-width: 0; overflow: auto; border: 1px solid var(--line); border-top: 0; border-radius: 0; background: var(--bg1); }
/* v3.0.1:列数少的宽索引在宽屏下表格不满容器(右侧死空间观感)——min-width 兜底拉满 */
.rt-tbl { min-width: 100%; }
/* 1359b：行少时表格下方那块空白用**表体底纹**延伸进容器（不改 DOM：填充行会被
   行计数/斑马纹/行导航当成数据行，实测撞了 rtLocateFilter230 / rtQrtSearchMerge621）。 */
/* 1365：底纹行距必须跟**真实行高**走，不能写死 32px——实测三档行高是
   21.5 / 25.5 / 41.5px（compact/standard/cozy），写死 32px 时每个空行都和上一行
   错位 6~10px，越往下越歪，观感就是「表格下面又起了一张歪表格」。
   改由 --rt-row-h 驱动，三档各自覆盖（值取自真机量测）。 */
.rt-wrap { --rt-row-h: 25.5px; background-image: linear-gradient(var(--line) 1px, transparent 1px); background-size: 100% var(--rt-row-h); background-repeat: repeat; background-position: 0 0; }
.rt.dense .rt-wrap { --rt-row-h: 21.5px; }
.rt.cozy .rt-wrap { --rt-row-h: 41.5px; }
/* 1439：fill 档高度链（QRT 788 同款契约）——父容器给高时整表撑满、表体在 rt-wrap 内滚。
   240px 地板在 fill 档让位：那时高度来自父容器分配，地板会把父容器重新顶破。
   ⚠ 本条必须排在上面的 `.rt-wrap {` 之后：1355/1365 的 ruleBody 用 indexOf 取**第一条**，
   写在前面会把锚点抢到这里。 */
.fs.rt-fs-fill { flex: 1 1 auto; min-height: 0; }
.rt.rt-fill { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.rt.rt-fill > .rt-wrap-shell { flex: 1 1 auto; min-height: 0; }
.rt.rt-fill > .rt-wrap-shell > .rt-wrap{ min-height: 0; }
/* 表体外的固定行（工具条/状态栏/分页）不参与压缩，剩余高度全给表体 */
.rt.rt-fill > .rt-bar, .rt.rt-fill > .rt-status, .rt.rt-fill > .rt-res-bar { flex: 0 0 auto; }
/* 1392：底纹只服务空白区——QRT 同款（那边实测同一条分隔线在 2px/4px 间交替：
   表头 25px 与行高 25.5px 差 0.5px，底纹每条都比真实 border 矮半像素落线）。
   RT 的斑马纹来自 .tbl.zebra（半透明罩），行仍会透出底纹，所以把行底落成不透明。 */
.rt-tbl tbody tr { background: var(--bg1); }
.rt-tbl tbody tr:nth-child(even) { background: linear-gradient(var(--tbl-zebra), var(--tbl-zebra)), var(--bg1); }
.rt.dense .rt-tbl tbody tr:nth-child(even) { background: var(--bg1); }
/* 1146：表头单行后收紧上下内衬（QRT 1136 同款 --sp-1）——旧 .tbl th 默认 var(--sp-2)
 是双层列头时代的衬距，单行后同样的值会让列头虚高 6px。 */
.rt-tbl th { position: sticky; top: 0; z-index: 2; background: var(--tbl-th); padding-top: var(--sp-1); padding-bottom: var(--sp-1); }
/* 勾选/序号列：窄列居中对齐 + 垂直居中，不再和正文列抢宽度/顶对齐错位 */
.rt-chk { width: 34px; text-align: center; padding-left: var(--sp-2); padding-right: var(--sp-1); vertical-align: middle; }
.rt-idx { width: 40px; color: var(--tx2); font-size: var(--fs-xs); text-align: right; padding-left: var(--sp-0); vertical-align: middle; }
/* 1168：容器查询锚必须挂在 th 的内层 flex 元素上——实测 th（table-cell）带
 container-type 也不命中（阈值放到 5000px 都不生效），.rt-th-in 一挂即中。
 只做查询锚，不改表格几何（列宽 70/60、行高 26 前后逐项不变）。 */
.rt-th { cursor: pointer; position: relative; }
.rt-rs { position: absolute; right: 0; top: 0; bottom: 0; width: 5px; cursor: col-resize; user-select: none; }
.rt-rs:hover { background: var(--ac-soft); }
body.col-resizing, body.col-resizing * { cursor: col-resize !important; user-select: none !important; }
/* 1147：列头静息态只有列名——类型徽标与未排序 ⇅ 悬停/聚焦才出现，
 已排序箭头常亮（那是状态，不是噪音）。这样窄列里列名不会被邻居元素挤掉。 */
.rt-th-in { display: flex; align-items: center; min-width: 0; line-height: 1.25; container-type: inline-size; }
.rt-th-name { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; flex: 1 1 auto; }
/* 列名占满可用宽度并按字符截断（窄列不再与类型徽章互相挤爆）；
 右内衬留出常驻筛选漏斗（right:8px，约 12px 宽），列名文字永不压在漏斗下面 */
/* 静息留白须 ≥ 漏斗槽宽：漏斗锚 right:8px 宽约 12px（压在 th 右缘、脱离文档流）。
   此前 14px 只剩 4px 间隙——长列名一贴边就与漏斗视觉粘连（实测长字段名档 gapToFilter=4）。
   22px = 8 + 12 + 2 呼吸。悬停档另加排序箭头（right:24px），见下条 34px。 */
.rt-th-label { min-width: 0; flex: 1 1 auto; padding-right: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 1151：静息不占位，悬停才浮出——`opacity:0` 只改可见性，元素仍参与 flex 宽度分配：
 110px 的 status 列里，看不见的类型徽标吃掉 42px、⇅ 再吃 10px，列名只剩 30px
 （实测文字需 34px）→ 这正是「表头元素平铺互相挤占」的最后一处。
 静息 display:none 把宽度全留给列名；需要时再出现，且绝不压在列名文字上：
 · 类型徽标彻底不浮出——列头 tooltip 首行就是「类型 · 列名」，信息不丢且零遮挡
 （浮出档实测带底色的徽标会把 status 盖成 sta）；
 · ⇅ 悬停时出现在漏斗左侧固定槽位（right:24px），同时列名让出 34px 沟槽，
   文字改用省略号截断而不是被盖住。已排序箭头是状态，仍常驻占位。 */
.rt-th-type { display: none; }
.rt-th-sort-hint { display: none; position: absolute; right: 24px; top: 50%; transform: translateY(-50%); }
.rt-th:hover .rt-th-sort-hint, .rt-th:focus-visible .rt-th-sort-hint, .rt-th:focus-within .rt-th-sort-hint { display: block; }
.rt-th:hover .rt-th-label, .rt-th:focus-visible .rt-th-label, .rt-th:focus-within .rt-th-label { padding-right: 34px; }
/* 1168：窄列悬停时列名让不出 34px —— 60px 列的内容盒只有 40px，让完只剩 6px，
 实测 `title` 被压成 `t…`（高倍截图确认），比静息态更糟：用户悬停想看名字，名字反而没了。
 优先保列名：窄列（≤96px）悬停不加大沟槽，只留常驻的 14px 给漏斗。
 1189 修订：⇅ 也不再浮出（原「叠在文字尾部之上——短暂遮挡可接受」实测量到
 文字右缘 376 vs ⇅ 左缘 371 已经压在一起；鼠标停在表头就一直挡，没有「短暂」可言）。 */
@container (max-width: 96px) {
  .rt-th:hover .rt-th-label, .rt-th:focus-visible .rt-th-label, .rt-th:focus-within .rt-th-label { padding-right: 14px; }
  /* 1189：窄列悬停时**不出 ⇅ 提示**（1168 曾允许它叠在列名尾部之上——实测 60px 列里
     列名文字右缘 376 与 ⇅ 左缘 371 已经压在一起，正是用户说的「按钮文案遮挡」）。
     排序方向本来就有两处非遮挡的表达：aria-sort（读屏）+ 列头 title（悬浮查看）；
     已排序时箭头是常驻状态，不受此规则影响。 */
  .rt-th:hover .rt-th-sort-hint, .rt-th:focus-visible .rt-th-sort-hint, .rt-th:focus-within .rt-th-sort-hint { display: none; }
}
.rt-th-sort-on { flex: none; color: var(--ac-hi); }
.rt-th-sub { display: block; min-height: 13px; font-size: var(--fs-2xs); }
/* 列头类型徽标（dbx 学习：列名下灰字类型，keyword/text/long…）——
 1147 起静息态隐藏、悬停才出现（规则在上面 .rt-th-type 那一行），此处只留语义色。
 类型徽标蓝色语义（dbx 类型=信息蓝，区别于灰注释） */
.rt-th-type { font-weight: 400; color: var(--info); }
/* P2-1：类型语义着色简化版（五类——数值蓝/日期琥珀/布尔绿/文本中性/keyword 青；
 dbx 有 9 类方案管理，简化为内置一套不做管理面） */
.rt-th-type.rt-ty-num { color: var(--info); }
.rt-th-type.rt-ty-date { color: var(--warn); }
.rt-th-type.rt-ty-bool { color: var(--ok); }
.rt-th-type.rt-ty-text { color: var(--tx1); }
.rt-th-type.rt-ty-kw { color: var(--ac-hi); }
/* 多列排序优先级角标（dbx 语言——链内第 n 键显示 1/2/3）；：9px 裸值归 --fs-2xs */
.rt-sort-ord { font-size: var(--fs-2xs); color: var(--ac-hi); font-weight: 650; margin-left: 1px; }
/* 操作列横排 nowrap——竖排时 showRelevance/canOps 的按钮数量差异会把行高
 撑到 2~3 倍（实报「同一索引，索引工作区与查询工作台行高不一致」：查询工作台
 show-relevance 开启多两个取证钮，竖排溢出撑行）。横排高度恒为单钮高，行高
 完全由行高档位（compact/standard/cozy）决定，与任意 props 组合无关。 */
/* 1365：操作列宽度=内容宽（`width:1px` 让 table-layout:auto 按 max-content 分配，
   多余宽度全部回流给数据列）。此前无约束，实测 1440 宽下吃走 500px、按钮只用 120px，
   380px 空转把 title/status 压到 287px —— 用户反复说的「表格被挤窄」。 */
.rt-act { width: 1px; white-space: nowrap; position: relative; }
.rt-act .btn { vertical-align: middle; }
.rt-cell { max-width: 320px; min-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: copy; } /* ：260→320 与 QRT 同口径 */
.rt-cell.expanded { white-space: normal; word-break: break-all; max-width: 520px; }
.rt-val { display: inline; }
.rt tbody tr { transition: background .12s; }
.rt tbody tr:hover { background: var(--bg-hover, var(--bg2)); }
/* 键盘行导航高亮（Xmigrate .xm-row-focus 同款视觉——ac-soft 底+左缘 ac-hi 条） */
.rt tbody tr.rt-row-focus > td { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi); }
.rt-kbd-hint { font-size: var(--fs-xs); color: var(--tx2); background: var(--bg0); border: 1px solid var(--line); border-radius: var(--r-xs); padding: 1px var(--sp-1h); margin-left: var(--sp-3); letter-spacing: .5px; flex-shrink: 0; }
.rt-null { color: var(--tx2); opacity: .55; user-select: none; }
.rt.dense .rt-tbl :deep(td), .rt.dense .rt-tbl :deep(th) { padding-top: 3px; padding-bottom: 3px; }
/* 紧凑档关斑马纹（QRT 同惯例——行距过密时条纹反成噪音） */
.rt.dense .rt-tbl tbody tr:nth-child(even) { background: transparent; }
/* P2：行高三档——cozy 宽松档 */
.rt.cozy .rt-tbl :deep(td), .rt.cozy .rt-tbl :deep(th) { padding-top: var(--sp-3); padding-bottom: var(--sp-3); }
.rt-cell.pended { background: var(--warn-soft); box-shadow: inset 2px 0 0 var(--warn); }
/* 拖拽框选区域高亮（dbx 选区语言——蓝 soft 底+品牌描边） */
.rt-cell.rt-region { background: var(--info-soft); box-shadow: inset 0 0 0 1px var(--info-line); }
/* 1441：触屏两击框选的起点——虚线描边告诉用户「这一角已定，再点对角」（QRT 同款） */
.rt-cell.rt-region-anchor { outline: 2px dashed var(--info-line); outline-offset: -2px; }
/* P2-2：十字准星简化版——行 hover 带已有，格 hover 加信息色光环（行列交叉感） */
.rt-cell.rt-cell:hover { box-shadow: inset 0 0 0 1px var(--info-line); }
.rt-cell.agg-sel { background: var(--ac-soft); }
.rt-val { font-family: var(--mono); font-size: var(--fs-sm); }
.rt-old { display: block; font-size: var(--fs-xs); color: var(--tx2); text-decoration: line-through; }
.rt-edit { width: 100%; padding: var(--sp-0) var(--sp-1h); font-size: var(--fs-sm); background: var(--bg0); border: 1px solid var(--ac-line); border-radius: var(--r-xs); color: var(--tx0); outline: none; }
tr.sel td { background: var(--ac-soft); }

/* P0-1：结果内查找——命中格琥珀底、当前命中焦点环（.hit-cur 运行时挂摘）、
 文本级 mark 切分高亮；截断 ≈ 提示弱化灰字 */
.rt-cell.rt-hit { background: var(--warn-soft); }
.rt-cell.rt-hit-cur { box-shadow: inset 0 0 0 2px var(--warn); }
/* v3.0.0 纠错：num-col 样式补齐——的「数值列自动右对齐」computed+挂类俱在，
 但 .num-col 类样式从未定义（三链断在最后一环），数字列一直左对齐 */
.rt-cell.num-col { text-align: right; font-variant-numeric: tabular-nums; }
.rt-val mark.rt-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
/* W-A：ES highlight 片段（hlSafe 净化后仅存 em/mark）——与 rt-mark/MarkText 同视觉语言 */
.rt-hl em, .rt-hl mark { font-style: normal; background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
.rt-search-note { font-size: var(--fs-2xs); color: var(--tx2); }
/* P0-2：单元格详情弹层元信息行 */
.rt-d-meta { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-2); }
/* ═══ W3：rowDrawer 行详情侧拉内容排版（QRT qrt-rdw 同款语言；仅 prop 开启后可达）═══ */
.rt-rdw-meta { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.rt-rdw-row { display: flex; align-items: flex-start; gap: var(--sp-2); padding: 5px var(--sp-0); border-bottom: 1px dashed var(--line); font-size: var(--fs-xs); }
.rt-rdw-k { flex-shrink: 0; min-width: 110px; max-width: 40%; color: var(--ac-hi); overflow-wrap: anywhere; font-family: var(--mono); }
.rt-rdw-v { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; font-family: var(--mono); }
/* rt-cd 系列详情样式随弹窗迁入共享件 ColDetailModal（类名不变） */
/* P0-4：列头漏斗（QRT qrt-funnel 同语言）+筛选态提示+筛选弹层 */
.rt-funnel { position: absolute; right: 8px; top: 3px; display: inline-flex; align-items: center; padding: 1px; background: none; border: 0; color: var(--tx2); opacity: 0; cursor: pointer; }
/* 1403：漏斗从「常驻 45% 灰」改为悬停/键盘聚焦才出现（与 QRT 同口径）——
 每列表头同时挂排序箭头+类型徽标+漏斗+拖拽柄是用户说的「第一行太多元素平铺」；
 漏斗是低频动作，静息态不该占视觉。筛选生效(.on)仍常驻高亮（否则不知道列被筛了）。 */
th:hover > .rt-funnel, th:focus-within > .rt-funnel { opacity: .85; }
.rt-funnel:hover { opacity: .9; color: var(--info); }
.rt-funnel.on { opacity: 1; color: var(--info); }
/* 1407：触屏没有 hover——悬停才出现的筛选漏斗/未排序 ⇅ 在触屏上等于不存在。
   与 QRT `@media (hover: none)` 同口径：常驻弱提示（筛选生效仍是实色）。 */
@media (hover: none) {
  .rt-funnel { opacity: .55; }
  .rt-th-sort-hint { display: block; opacity: .5; }
}
/* 554 工蚁1：nowrap 约定迁 TableFilteredHint 单源（bar-left 筛选态提示随 561 合并片段组件；
 弹层槽第二注入位的 .rt-fmode 规则留内核——两注入位共用类名、片段组件持同款复制） */
/* W3：searchable 内建搜索框样式随 561 合并 TableQSearch 全局单源（迁出勿搬回） */
/* W3：筛选组合档切换钮（提示行/筛选弹层共用，AND/OR 就地翻转） */
.rt-fmode { border: 1px solid var(--line); background: transparent; color: var(--info); cursor: pointer; font-size: var(--fs-2xs); border-radius: 3px; padding: 0 var(--sp-1); line-height: 1.4; }
.rt-fmode:hover { border-color: var(--info); }
/* 筛选弹层壳样式（.rfp-* 全家）随壳合并共享件 ColFilterPopover（cfp-*），
 z 字面量 1200/1201 同步收口 var(--z-ctx)/calc(var(--z-ctx)+1) */
/* 聚合 footer 行（tfoot）样式系随 561 合并 TableAggFoot 全局单源（原 scoped
 规则打不中片段元素，迁出勿搬回；冻结 sticky/hScrolled 投影同迁） */
/* P0-3：跳转到列——目标列头闪烁（1400ms 自动熄灭） */
.rt-th.rt-col-flash { animation: rt-col-flash-kf 1.4s ease-out; }
@keyframes rt-col-flash-kf { 0%, 60% { background: var(--info-soft); box-shadow: inset 0 0 0 2px var(--info); } 100% { background: transparent; } }
/* P1-6：列拖拽——拖动源半透明、落点插入指示条（before 左缘/after 右缘） */
.rt-th-name[draggable="true"] { cursor: grab; }
.rt-th-name.rt-drag-src { opacity: .4; }
.rt-th.rt-drop-before { box-shadow: inset 3px 0 0 var(--info); }
.rt-th.rt-drop-after { box-shadow: inset -3px 0 0 var(--info); }
/* P1-3：多行转置——字段名列左固定（sticky left 必配 min-width 铁律）、值列 pre-wrap */
.rt-transposed .rt-t-field, .rt-transposed .rt-t-key { position: sticky; left: 0; z-index: 1; background: var(--bg2); box-shadow: inset -1px 0 0 var(--line); text-align: left; }
.rt-transposed .rt-t-field { min-width: 140px; }
.rt-transposed .rt-t-key { min-width: 120px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-transposed .rt-t-val { white-space: pre-wrap; word-break: break-word; max-width: 320px; vertical-align: top; }
.rt-t-n { height: 22px; font-size: var(--fs-xs); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx1); }

/* ═══ ：冻结标识列（chk+序号 sticky 左缘，dbx/Excel 冻结窗格）——
 宽表横向滚动时行身份（勾选/序号）不滚走。border-collapse 下 sticky 自带边框会丢，
 右分隔线用 box-shadow 画；背景必须不透明，且 hover/选中/焦点行三态同步。
 修复：min-width 锁死列宽——table-layout:auto 会把 width 建议值压缩
 （idx 列实际渲染 ~40px），而 sticky left:46px 是硬编码，冻结层右缘(46+52=98px)
 越过数据列真实起点(86px)，不透明背景遮住首列左侧 1-2 个字符（dm.→m.、com.→om.）。
 min-width 是 auto 布局的硬约束，保证实际列宽 ≥ 冻结定位常量。 ═══ */
.rt-tbl th.rt-chk, .rt-tbl th.rt-idx, .rt-tbl td.rt-chk, .rt-tbl td.rt-idx { box-sizing: border-box; position: sticky; z-index: 1; box-shadow: inset -1px 0 0 var(--line); }
/* 横向滚动态（is-hscrolled）——冻结缘向右投梯度阴影，明示普通列正被盖在冻结层下
 （冻结窗格语义的视觉反馈；此前被盖内容无任何提示，用户以为渲染缺字）。
 阴影用深灰蓝 rgba(15,23,42,.16) 而非纯黑 .38：纯黑高不透明度在浅色主题下糊成一团，
 深灰蓝两套主题都可感知且不脏。 */
.rt.is-hscrolled .rt-tbl th.rt-chk, .rt.is-hscrolled .rt-tbl td.rt-chk,
.rt.is-hscrolled .rt-tbl th.rt-idx, .rt.is-hscrolled .rt-tbl td.rt-idx { box-shadow: inset -1px 0 0 var(--line-strong), 8px 0 10px -6px rgba(15, 23, 42, .16); }
.rt.is-hscrolled .rt-tbl th.rt-col-frozen, .rt.is-hscrolled .rt-tbl td.rt-col-frozen { box-shadow: inset -1px 0 0 var(--line-strong), 8px 0 10px -6px rgba(15, 23, 42, .16); }
.rt-tbl th.rt-chk, .rt-tbl td.rt-chk { left: 0; width: 46px; min-width: 46px; }
.rt-tbl th.rt-idx, .rt-tbl td.rt-idx { left: 46px; width: 52px; min-width: 52px; }
/* 表头 chk/idx 是 top+left 双轴 sticky，层级须压过普通 sticky 表头（z-index 2） */
.rt-tbl th.rt-chk, .rt-tbl th.rt-idx { z-index: 4; }
.rt-tbl td.rt-chk, .rt-tbl td.rt-idx { background: var(--bg2); }
/* ═══ /：冻结首业务列（freezeFirst）═══
 sticky left=98px（勾选 46+序号 52 标识列已锁宽，前缀精确）；
 底色不透明三态同步：常态 bg1 / 行 hover bg2 / 行选中·焦点 ac-soft；
 th 双轴 top+left，z-index 3 与标识列表头同级。 ═══ */
/* P2-4 升级：left 由 frozenStyle 内联按前缀宽度动态计算（多列冻结），
 CSS 只保留 sticky 定位模式/层级/右缘分隔线 */
.rt-tbl th.rt-col-frozen, .rt-tbl td.rt-col-frozen {
  position: sticky; z-index: 3;
  box-shadow: inset -1px 0 0 var(--line-strong);
}
.rt-tbl th.rt-col-frozen { z-index: 4; background: var(--bg2); }
.rt-tbl td.rt-col-frozen { background: var(--bg1); }
.rt-tbl tbody tr:hover td.rt-col-frozen { background: var(--bg2); }
.rt-tbl tr.sel td.rt-col-frozen, .rt-tbl tbody tr.rt-row-focus td.rt-col-frozen { background: var(--ac-soft); }
.rt tbody tr:hover td.rt-chk, .rt tbody tr:hover td.rt-idx { background: var(--bg-hover, var(--bg2)); }
.rt tbody tr.sel td.rt-chk, .rt tbody tr.sel td.rt-idx,
.rt tbody tr.rt-row-focus td.rt-chk, .rt tbody tr.rt-row-focus td.rt-idx { background: var(--ac-soft); }
/* hover 行内快捷钮（dbx 悬浮行内钮）——复制行 JSON 常驻会挤占操作列，
 hover 才现身，移出行消失 */
/* 1365：hover 复制钮退役——它与「更多 ⋯」菜单里的「复制行 JSON」是同一动作，
   两处并存违反「同一动作不重复」约定；且它 absolute 到单元格右缘，实测与「更多⋯」
   钮重叠（1372–1402 vs 1365–1395）。QRT 没有操作列、无此重叠，故其悬浮钮保留。 */

/* ═══ W7：行内展开详情行——随壳合并 TableExpandRow，
 .rt-expand 系样式迁 TableShell.vue 单一出处（此前与本文件逐字重复的双份定义）═══ */
/* W7：操作列展开钮（常驻小钮，与查看文档钮同排） */
.rt-row-expand { display: inline-flex; align-items: center; justify-content: center; }
/* ═══ W7：长 JSON 折叠预览 chip（点击开单元格详情弹窗）═══ */
.rt-json-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; overflow: hidden; padding: 1px var(--sp-2); border: 1px solid var(--line); border-radius: 99px; background: var(--bg2); color: var(--tx1); font-size: var(--fs-xs); cursor: zoom-in; }
.rt-json-chip:hover { border-color: var(--ac-line); color: var(--ac-hi); }
.rt-json-chip-p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-json-chip-n { color: var(--tx2); flex-shrink: 0; }
/* W7：ip 列等宽（.rt-val 本就 mono，类语义显式化+防后续视觉回归漂移） */
.rt-cell.ip-col .rt-val { font-family: var(--mono); }
/* ═══ W-B：semOn 语义分档色（pill 五档语言）——仅 semOn prop 开且命中 percent 分档上类，缺省零类零增量 ═══ */
.rt-cell.rt-sem-g, .rt-cell.rt-sem-g .rt-val { color: var(--ok); }
.rt-cell.rt-sem-y, .rt-cell.rt-sem-y .rt-val { color: var(--warn); }
.rt-cell.rt-sem-r, .rt-cell.rt-sem-r .rt-val { color: var(--err); }
.rt-cell.rt-sem-b, .rt-cell.rt-sem-b .rt-val { color: var(--info); }
.rt-cell.rt-sem-n, .rt-cell.rt-sem-n .rt-val { color: var(--tx2); }

/* 1365：状态栏从「独立圆角卡」改为**表卡页脚**——此前它是带 --sp-2 上外边距的独立
   卡片，与表体之间一道缝、下面再一截空白，用户圈着这一整行问「怎么变成双重表格」。
   现在紧贴表体下沿、只留底部圆角、左右与表体同宽同边框，视觉上是一张表的页脚。
   与表体之间的双线用 `border-top: 0` 消除（负 margin 会引入裸 px，且会与表体的
   滚动区叠 1px 内容）。rtFix552 的定位语义不变：它仍是 rt-wrap-shell 之后的流内尾行。
   rtFix552 的定位语义不变：它仍是 rt-wrap-shell 之后的流内尾行（回顶钮不盖它）。 */
.rt-status {
  display: flex; align-items: center; gap: 14px; padding: var(--sp-1h) var(--sp-2h); margin-top: 0;
  background: var(--bg1); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m);
  font-size: var(--fs-xs); color: var(--tx1);
}
.rt-stat { font-family: var(--mono); }
.rt-stat-hint { color: var(--tx2); }
/* 1185：状态栏窄宽度纪律——标签永不折字，先让提示文本让位。
 实测 1024 宽：「单行自动」被相邻提示挤成「单行自 / 动」两行（label 是 flex，
 中文可逐字换行）。勾选钮是可操作项、提示是可省略说明，优先级应当反过来：
 标签 nowrap 恒完整，提示类（.rt-stat-hint / .rt-kbd-hint）收缩 + 省略号。 */
.rt-transpose { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); cursor: pointer; white-space: nowrap; flex: none; }
.rt-status .rt-stat-hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 浮动栏从「悬浮胶囊」改为「卡尾状态栏」（dbx 状态栏语言）——
 不再悬浮遮挡数据行；与卡头/表格连体（贴表格底部，上圆角 0 下圆角随卡） */
.rt-float {
  position: static; transform: none; margin-top: -1px;
  display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2h);
  background: var(--bg2); border: 1px solid var(--line); border-top: 0;
  border-radius: 0 0 var(--r-m) var(--r-m); white-space: nowrap;
}
.rt-float-n { font-size: var(--fs-sm); color: var(--tx1); padding: 0 var(--sp-1); }
.rt-float-n b { color: var(--ac-hi); }
/* 框选聚合直读（Σ/avg 与格数并列，dbx 选区底栏语言） */
.rt-float-agg { font-size: var(--fs-sm); color: var(--tx1); }
.rt-float-agg b { color: var(--ac-hi); }

.pv-list { display: flex; flex-direction: column; gap: var(--sp-3); max-height: 400px; overflow-y: auto; }
.pv-item { border: 1px solid var(--line); border-radius: var(--r-m); padding: var(--sp-2) var(--sp-2h); }
.pv-id { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-1h); }
.pv-row { display: flex; align-items: center; gap: var(--sp-2); padding: 3px 0; font-size: var(--fs-sm); }
.pv-field { color: var(--ac-hi); min-width: 120px; }
.pv-old { color: var(--err); text-decoration: line-through; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-new { color: var(--ok); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 上次提交失败项红标（mapping 冲突/类型错重试前心里有数） */
.pv-row.pv-failed { background: var(--err-soft); border-radius: var(--r-s); }
.pv-fail-tag { margin-left: var(--sp-1h); font-size: var(--fs-2xs); color: var(--err); border: 1px solid var(--err); border-radius: 99px; padding: 0 5px; }

/* 视图 ⋯ 聚合菜单——浮层四要素齐备（bg1 底/强边线/阴影/圆角） */
.menu-wrap { position: relative; }
.rt-tool-btn.on { border-color: var(--ac-line); color: var(--ac-hi); }
/* 1375：菜单必须**永远够得着**——真机实测（1440×900，视图 ⋯ 展开）菜单底沿超出视口
   28px 且 overflow:visible，最后一项「语义格式化」被裁掉、点不到。
   触发器在工具行靠下时（本表就在结果区顶部、视口下缘附近）必然复现。
   修法：封高 + 内部滚动，并用 dvh 跟随可视高度变化。 */
.rt-menu { position: absolute; top: calc(100% + var(--sp-1)); right: 0; z-index: 60; background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); padding: var(--sp-1h); min-width: 210px; max-height: min(70dvh, 420px); overflow-y: auto; overscroll-behavior: contain; }
.rt-mi { display: flex; align-items: center; width: 100%; padding: var(--sp-1h) var(--sp-2h); border: 0; background: transparent; border-radius: var(--r-s); color: var(--tx1); font-size: var(--fs-xs); cursor: pointer; text-align: left; white-space: nowrap; }
.rt-mi:hover:not(:disabled) { background: var(--bg2); color: var(--tx0); }
.rt-mi:disabled { color: var(--tx2); opacity: .55; cursor: default; }
.rt-mi.on { color: var(--ac-hi); }
.rt-m-t { padding: var(--sp-1) var(--sp-2h) 0; font-size: var(--fs-2xs); color: var(--tx2); letter-spacing: .05em; }
.rt-m-sep { height: 1px; background: var(--line); margin: var(--sp-1) var(--sp-2); }
</style>
