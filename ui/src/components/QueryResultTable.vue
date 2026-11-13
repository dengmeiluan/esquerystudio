<template>
  <FocusableSurface pane-id="qrt.table" title="结果表" headless :class="{ 'qrt-fs-fill': fill }" :enabled="focused" @update:enabled="focused = $event">
  <!-- 裁决:放大合并表格内建(FS headless 包根),与 RT 同构——消费方不再各自包 FS。
 ⚠注释必须在 FS 内:根级注释=fragment 根,T39 卸载断裂 -->
  <div ref="rootEl" class="qrt" :class="{ 'is-hscrolled': hScrolled, 'qrt-fill': fill, 'qrt-body-hidden': bodyHidden }" data-flex-fill tabindex="-1" role="region" aria-label="查询结果表格（Tab 聚焦后：↑↓ 行导航、Ctrl+F 查找、Esc 退出）"
       @keydown="onQKeydown" @keydown.esc="onEscBlur" @keydown.ctrl.f.prevent="openSearch" @focus="tblFocus = true" @blur="tblFocus = false">
    <!-- 结果内查找（RT P0-1 同款合并，useGridSearch 共用件）——
 absolute 悬浮（kbd-hint 同区，prefsOn=false 的 SQL 通道同样可用）
 ·单框双效（620 稿 D1~D5 裁决）：searchable 档 HitNav 挂载点退役——
 查找并入常驻快筛框（词桥见脚本层）；非 searchable 档原样保留
 （「表格必有查找」约定不回退，546 缺省零增量不破） -->
    <template v-if="searchOpen && !searchable">
      <HitNav v-model="searchKw" :count="searchMatches.length" :current="searchCur" class="qrt-hn"
              placeholder="结果内查找…" @next="searchNext" @prev="searchPrev" @keydown.esc.stop="closeSearch" />
      <span v-if="renderTruncated" class="qrt-search-note mono" :title="`结果已截断渲染——查找仅覆盖已渲染的前 ${renderRows.length} 行`">≈ 前 {{ renderRows.length }} 行</span>
    </template>
    <!-- 键盘行导航接入（useRowNav 共享内核，48 批 ResultTable 范式）——
 容器获焦后 ↑↓/Home/End 移动高亮行，深结果集滚动跟随；输入框聚焦不接管。
 行导航快捷键提示（49 批口径——获焦才显示，未聚焦常显反成噪音）；
 absolute 悬浮不依赖 qrt-bar（prefsOn=false 的 SQL 通道同样有提示）。
 注意：55 批注释不得放 template 根级（.qrt 外）——根级注释会让单根组件
 编译成 fragment，happy-dom 叠挂测试触发卸载链断裂（T39）。 -->
    <span v-if="tblFocus && renderRows.length" class="qrt-kbd-hint mono" title="表格已获焦：↑↓ 切换行、Home/End 跳首末行、Ctrl+C 复制行 JSON、Ctrl+F 结果内查找、Esc 退出；滚动到底自动加载后续行">↑↓ Home/End · Ctrl+F</span>
    <!-- 偏好工具行（密度/列选）——记忆维度开启，或宿主显式开 tableBar（1141 内存态
 复用同一套工具：SQL 结果不再由宿主手写导出/列选）。容器结构随壳合并 TableShell
 （卡头语言单一出处），类名经 props 注入、内容经槽注入，DOM 与既有逐字节一致 -->
    <TableShell v-if="barOn" bar-class="qrt-bar" bar-r-class="qrt-bar-r" @bar-contextmenu="openBarMenu">
      <template #bar-left>
        <!-- 内建视图档分段（bar-left 最前——「展示形式统一在表格头」内核化合并，
 DQ/IH 寄居 seg 同位序；数据驱动出档：jsonHtml/treeData/cardHits 提供哪档出哪档，
 表格档恒在；aria-pressed 可达。缺省 viewSeg=false 不渲染（全站零增量） -->
        <div v-if="viewSegOn" class="seg qrt-view-seg" role="group" aria-label="展示形式">
          <button type="button" :class="{ on: effView === 'table' }" :aria-pressed="effView === 'table'" @click="altView = 'table'">表格</button>
          <button v-if="altJsonAvailable" type="button" :class="{ on: effView === 'json' }" :aria-pressed="effView === 'json'" @click="altView = 'json'">JSON</button>
          <button v-if="altTreeAvailable" type="button" :class="{ on: effView === 'tree' }" :aria-pressed="effView === 'tree'" @click="altView = 'tree'">Tree</button>
          <button v-if="altCardAvailable" type="button" :class="{ on: effView === 'cards' }" :aria-pressed="effView === 'cards'" @click="altView = 'cards'">卡片</button>
        </div>
        <!-- bar-prepend 槽（bar-left 最前段，RT 541 同款平移）——QRT 宿主视图
 （SystemView/LuceneQueryView）的视图切换 seg/分页器寄居入口（「翻页、展示形式
 统一在表格头」裁决）。UI 寄居 prefsOn（storageKey）门控的 qrt-bar，接线宿主
 须同传 storageKey（ searchable/refreshable 同口径）。 -->
        <slot name="bar-prepend" />
        <!-- T3②：迁头档内建分页（RT :25 bar-left 同款形态）——pagerInHead=true
 且三参齐备时寄居工具行（翻页/改页大小只 emit，取数归宿主）；底部 qrt-pgr 独立行
 随 pagerOn 互斥退役。缺省 false 不渲染（525 既有链零增量） -->
        <Pagination v-if="pagerHeadOn" :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
          @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
        <!-- 计数条补 took（RT rt-info 同款「 · TookBadge」内嵌形态，缺省不渲染） -->
        <span v-if="props.total != null" class="qrt-coln mono">{{ sortedRows.length }}/{{ props.total }}{{ props.totalGte ? '+' : '' }}<template v-if="props.took != null && props.took >= 0"> · <TookBadge :ms="props.took" /></template></span>
        <span v-if="showColCount" class="qrt-coln mono">{{ visibleCols.length }}/{{ columns.length }} 列</span>
        <!-- 筛选态提示（暗状态可见性——有筛选时行数与清除入口常驻）；
 组合档切换钮（AND=全部命中 / OR=任一列命中，就地翻转零跳转）
 同构段合并 TableFilteredHint 片段组件（RT 同款单一出处，DOM 逐字节） -->
        <TableFilteredHint :active="activeFilterCount" :shown="filteredRows.length" :total="rawRows.length"
          :mode="filterModeLive" span-cls="qrt-filtered mono" fmode-cls="qrt-fmode mono" clear-cls="qrt-filtered-clear"
          @toggle-mode="toggleFilterMode" @clear="clearAllFilters" />
        <!-- W3：searchable 内建搜索框（与既有钮同排；双绑驱动既有 quickFilter
 过滤链——计数条行数即滤后所见）；Esc 清词。缺省 false 不渲染（全站零增量）
 同构段合并 TableQSearch 片段组件（RT 同款单一出处，DOM 逐字节）
 ·单框双效：@enter 桥接滚动下一命中行（620 稿 D2） -->
        <TableQSearch :on="searchable" q-cls="qrt-qsearch" v-model:kw="searchableKw" @enter="bridgeNext" />
        <!-- W3：refreshable 刷新钮——只 emit 'refresh' 意图（对齐 RT 既有事件名；
 525 分页同构：取数归宿主）。缺省 false 不渲染
 同构段合并 TableRefreshBtn 片段组件（RT 同款单一出处，DOM 逐字节） -->
        <TableRefreshBtn :on="refreshable" btn-cls="qrt-tool-btn" @refresh="emit('refresh')" />
      </template>
      <template #bar-right>
        <!-- 导出格式五连平铺合并「导出 ▾」聚合钮（铁律 C：同类枚举合一，常驻可见 ≤5）——
 五格式 aria/title/实现函数逐字保留（525/560 锁面同步更新不破），只动入口不动引擎；
 空结果整组禁用（非 v-if 消失） -->
        <span class="menu-wrap">
          <!-- 1345：aria-label 必须说清「导出什么、什么范围」。此前只有「导出」两个字，
               读屏用户与窄档（标签被 .qrt-tool-t 隐藏、只剩图标）都无从判断。
               同内核的 ResultTable 一直是「导出为 X（当前页/选中 N 行）」的口径，此处对齐；
               范围口径取实现真相：导出的是**当前视图**（筛选+排序后所见）。
               文案保留「导出」前缀——多处既有锁面按这个名字定位这个钮。 -->
          <button :aria-label="`导出当前视图（${sortedRows.length} 行，CSV/XLSX/JSON/PNG/Markdown）`" class="btn sm ghost qrt-tool-btn" :class="{ on: expMenuOpen }"
            aria-haspopup="menu" :aria-expanded="expMenuOpen" :title="`导出当前视图（筛选/排序所见即所得，共 ${sortedRows.length} 行）—— CSV / XLSX / JSON / PNG / Markdown`"
            @click.stop="expMenuOpen = !expMenuOpen">
            <FileDown :size="13" /><span class="qrt-tool-t">导出 ▾</span>
          </button>
          <div v-if="expMenuOpen" class="qrt-menu" role="menu" aria-label="导出当前视图">
            <button :aria-label="'导出当前视图 CSV'" class="qrt-mi" role="menuitem"
              title="导出当前视图 CSV（筛选/排序所见即所得）" :disabled="!rawRows.length" @click="exportCsv(); closeMenus()">
              <span class="qrt-mi-f">CSV</span> 通用表格
            </button>
            <!-- XLSX 档（xlsxMini 手写零依赖，data+meta 双 sheet） -->
            <button :aria-label="'导出当前视图 XLSX'" class="qrt-mi" role="menuitem"
              title="导出当前视图 XLSX（含 meta 页）" :disabled="!rawRows.length" @click="exportXlsx(); closeMenus()">
              <span class="qrt-mi-f">XLSX</span> Excel · 含 meta 页
            </button>
            <!-- JSON 第五导出钮——QRT 矩阵 JSON 即正解（与「复制整表 JSON」同口径） -->
            <button :aria-label="'导出当前视图 JSON'" class="qrt-mi" role="menuitem"
              title="导出当前视图 JSON（矩阵，与复制整表 JSON 同口径）" :disabled="isEmpty" @click="exportJson(); closeMenus()">
              <span class="qrt-mi-f">JSON</span> JSON · 矩阵
            </button>
            <!-- PNG 快照档（tableSnapshot 2x 像素，html-to-image 动态 import） -->
            <button :aria-label="'导出表格快照 PNG'" class="qrt-mi" role="menuitem"
              title="导出表格快照 PNG（所见即所得截图）" :disabled="isEmpty" @click="exportPng(); closeMenus()">
              <span class="qrt-mi-f">PNG</span> PNG · 表格快照
            </button>
            <!-- Markdown 档（RT 同格式——表格直贴文档/聊天） -->
            <button :aria-label="'导出当前视图 Markdown'" class="qrt-mi" role="menuitem"
              title="导出当前视图 Markdown 表格" :disabled="!rawRows.length" @click="exportMd(); closeMenus()">
              <span class="qrt-mi-f">MD</span> Markdown · 表格
            </button>
            <!-- 1141：NDJSON 档（rows 型行对象语义——SQL/日志类通道宿主不再手写导出；
 表头=可见列，逐行一 JSON 对象） -->
            <button v-if="exportNdjson" :aria-label="'导出当前视图 NDJSON'" class="qrt-mi" role="menuitem"
              title="导出当前视图 NDJSON（每行一个对象，键=可见列）" :disabled="!rawRows.length" @click="exportNdjsonFile(); closeMenus()">
              <span class="qrt-mi-f">NDJSON</span> 每行一对象
            </button>
          </div>
        </span>
        <!-- 行高三档循环 + 列宽重置双钮合并「视图 ⋯」聚合钮（行高改显式三选带
 当前档 ✓，比连点循环可预期；列宽重置=低频破坏性弱操作，菜单底项+分隔线隔离） -->
        <span class="menu-wrap">
          <button aria-label="视图设置" class="btn sm ghost qrt-tool-btn" :class="{ on: viewMenuOpen }"
            aria-haspopup="menu" :aria-expanded="viewMenuOpen" title="视图：行高、列宽"
            @click.stop="viewMenuOpen = !viewMenuOpen">
            <SlidersHorizontal :size="13" /><span class="qrt-tool-t">视图 ⋯</span>
          </button>
          <div v-if="viewMenuOpen" class="qrt-menu" role="menu" aria-label="视图设置">
            <div class="qrt-m-t">行高（当前：{{ rowHLabel }}）</div>
            <button class="qrt-mi" :class="{ on: rowH === 'compact' }" role="menuitemradio" :aria-checked="rowH === 'compact'"
              @click="setRowH('compact'); closeMenus()">紧凑</button>
            <button class="qrt-mi" :class="{ on: rowH === 'standard' }" role="menuitemradio" :aria-checked="rowH === 'standard'"
              @click="setRowH('standard'); closeMenus()">标准</button>
            <button class="qrt-mi" :class="{ on: rowH === 'cozy' }" role="menuitemradio" :aria-checked="rowH === 'cozy'"
              @click="setRowH('cozy'); closeMenus()">宽松</button>
            <div class="qrt-m-sep" role="separator"></div>
            <button :aria-label="'重置全部列宽'" class="qrt-mi" role="menuitem" title="重置全部列宽（拖拽过的列回原始宽）"
              :disabled="!Object.keys(colWidths).length" @click="resetColWidths(); closeMenus()">
              ⤺ 重置全部列宽
            </button>
            <!-- 1143：表格级视图开关归位——聚合行/转置/语义格式化作用于整张表，
                 不属于「某一列」的列头菜单；与行高/列宽同属「视图」心智一处可达。 -->
            <div class="qrt-m-sep" role="separator"></div>
            <div class="qrt-m-t">表格视图</div>
            <button class="qrt-mi" role="menuitemcheckbox" :aria-checked="aggOn"
              :aria-label="aggOn ? '聚合行：开' : '聚合行：关'"
              title="底部聚合行（数值列 Σ/avg；勾选行时只算所见集）"
              @click="toggleAggRow(); closeMenus()">
              {{ aggOn ? '✓ ' : '' }}聚合行
            </button>
            <button v-if="!isHits" class="qrt-mi" role="menuitemcheckbox" :aria-checked="transposeOn"
              :aria-label="transposeOn ? '转置视图：开' : '转置视图：关'"
              title="转置视图（列名做行、前 N 行做列）"
              @click="toggleTranspose(); closeMenus()">
              {{ transposeOn ? '✓ ' : '' }}转置视图
            </button>
            <button class="qrt-mi" role="menuitemcheckbox" :aria-checked="semPref"
              :aria-label="semPref ? '语义格式化：开' : '语义格式化：关'"
              title="语义格式化（bytes/时长/百分比只改显示；复制与导出恒原始值）"
              @click="semPref = !semPref; closeMenus()">
              {{ semPref ? '✓ ' : '' }}语义格式化
            </button>
          </div>
        </span>
        <!-- 列选合并 ColPicker 共享件（与 ResultTable 同一实现）；
 types 透传（工蚁3 契约）——弹层字段名旁类型徽标与列头徽标同源 -->
        <ColPicker :cols="columns" :selected="visibleCols" label="列选" :types="cpTypes" @update:selected="visibleCols = $event" @locate="locateCol" />
        <!-- 列布局方案收纳（TablePresetMenu 单钮+弹层，铁律 C）——652 内核
 preset 三操作消费面；ColPicker 同款共享件，位次=列宽后（291 钮序锁兼容追加）；
 寄居 prefsOn 主壳（storageKey 通道），SQL 独立壳分支不出钮（652 维度关闭=零落盘） -->
        <TablePresetMenu :presets="presets" :save="savePreset" :apply="applyPreset" :del="deletePreset" btn-cls="qrt-tool-btn" />
        <!-- v3.0.1:消费方注入位——与 RT 同排 -->
        <slot name="bar-extra" />
        <!-- 内建放大/还原(表格自带) -->
        <template v-if="focusable !== false">
          <span class="rt-bar-div" role="separator" />
          <button class="btn sm ghost qrt-tool-btn" :aria-label="focused ? '还原结果表' : '放大结果表'"
            :title="focused ? '还原（Esc 也可退出）' : '放大结果表（整表铺满全屏）'"
            @click="focused = !focused">
            <Minimize2 v-if="focused" :size="13" />
            <Maximize2 v-else :size="13" />
          </button>
        </template>
      </template>
    </TableShell>
    <!-- T3①：bar-prepend 槽脱 prefsOn 门控的独立壳分支——无 storageKey 通道
 （SQL/rows 型等）槽内容仍寄居同一 qrt-bar 形态工具行（「翻页、展示形式统一在表格头」
 收尾），迁头档分页器（pagerHeadOn）在此同样可达；工具行其余内容（计数条/筛选提示/
 搜索/刷新/导出钮簇）维持 prefsOn 门控不变，故本分支只承载槽与迁头分页器。有槽或
 迁头档才渲染（缺省零增量）；v-if/v-else-if 与主壳互斥，槽内容只渲染一次 -->
    <TableShell v-else-if="hasPrepend || pagerHeadOn || viewSegOn" bar-class="qrt-bar" bar-r-class="qrt-bar-r">
      <template #bar-left>
        <!-- 内建视图档分段（独立壳分支同挂载——无 storageKey 通道 seg 同样可达，
 pagerInHead 同口径；注释详见 prefsOn 主壳分支） -->
        <div v-if="viewSegOn" class="seg qrt-view-seg" role="group" aria-label="展示形式">
          <button type="button" :class="{ on: effView === 'table' }" :aria-pressed="effView === 'table'" @click="altView = 'table'">表格</button>
          <button v-if="altJsonAvailable" type="button" :class="{ on: effView === 'json' }" :aria-pressed="effView === 'json'" @click="altView = 'json'">JSON</button>
          <button v-if="altTreeAvailable" type="button" :class="{ on: effView === 'tree' }" :aria-pressed="effView === 'tree'" @click="altView = 'tree'">Tree</button>
          <button v-if="altCardAvailable" type="button" :class="{ on: effView === 'cards' }" :aria-pressed="effView === 'cards'" @click="altView = 'cards'">卡片</button>
        </div>
        <slot name="bar-prepend" />
        <Pagination v-if="pagerHeadOn" :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
          @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
      </template>
    </TableShell>
    <!-- 非工具行通道（未开 tableBar 且无 storageKey）:悬浮放大钮,查找条打开时让位其左 -->
    <button v-if="focusable !== false && !barOn" class="btn sm ghost qrt-fs-btn" :class="{ open: searchOpen }"
      :aria-label="focused ? '还原结果表' : '放大结果表'"
      :title="focused ? '还原（Esc 也可退出）' : '放大结果表（整表铺满全屏）'"
      @click="focused = !focused">
      <Minimize2 v-if="focused" :size="13" />
      <Maximize2 v-else :size="13" />
    </button>
    <!-- 1143：无工具行通道的视图开关出口——聚合行/转置/语义格式化已从列头菜单归位到
         「视图」心智；这些通道（Diag/内存态表等）没有 qrt-bar，此处给同一组开关，
         否则归位即等于能力消失。 -->
    <span v-if="!barOn" class="menu-wrap qrt-fs-view">
      <button class="btn sm ghost qrt-fs-btn" :class="{ on: fsViewOpen, open: fsViewOpen }"
        aria-label="视图设置" aria-haspopup="menu" :aria-expanded="fsViewOpen"
        title="表格视图：聚合行 / 转置 / 语义格式化"
        @click.stop="fsViewOpen = !fsViewOpen">
        <Table :size="13" />
      </button>
      <div v-if="fsViewOpen" class="qrt-menu" role="menu" aria-label="视图设置" @click.stop>
        <div class="qrt-m-t">表格视图</div>
        <button class="qrt-mi" role="menuitemcheckbox" :aria-checked="aggOn"
          :aria-label="aggOn ? '聚合行：开' : '聚合行：关'"
          title="底部聚合行（数值列 Σ/avg；勾选行时只算所见集）"
          @click="toggleAggRow(); fsViewOpen = false">
          {{ aggOn ? '✓ ' : '' }}聚合行
        </button>
        <button v-if="!isHits" class="qrt-mi" role="menuitemcheckbox" :aria-checked="transposeOn"
          :aria-label="transposeOn ? '转置视图：开' : '转置视图：关'"
          title="转置视图（列名做行、前 N 行做列）"
          @click="toggleTranspose(); fsViewOpen = false">
          {{ transposeOn ? '✓ ' : '' }}转置视图
        </button>
        <button class="qrt-mi" role="menuitemcheckbox" :aria-checked="semPref"
          :aria-label="semPref ? '语义格式化：开' : '语义格式化：关'"
          title="语义格式化（bytes/时长/百分比只改显示；复制与导出恒原始值）"
          @click="semPref = !semPref; fsViewOpen = false">
          {{ semPref ? '✓ ' : '' }}语义格式化
        </button>
      </div>
    </span>
    <!-- rows 型转置态提示行（仅转置激活时渲染，默认关=各通道零增量；
 行数档位 select + 退出钮——转置表无列头菜单入口，退出必须在此可达） -->
    <div v-if="transposeOn && !bodyHidden" class="qrt-tr-bar" :class="{ 'after-bar': barOn }">
      <span class="qrt-coln mono">转置视图 · 前 {{ transposeCount }} 行做列</span>
      <select class="qrt-t-n mono" :value="transposeN" aria-label="转置显示的行数" title="转置显示的行数"
        @change="setTransposeN(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="n in transposeNs" :key="n" :value="n">{{ n }} 行</option>
      </select>
      <button class="qrt-tr-off" aria-label="退出转置视图" title="退出转置视图" @click="toggleTranspose">✕ 退出转置</button>
    </div>
    <!-- 内建 alt 视图体（viewSeg 非表格档）——AltHitsViews 单源三档（565 共享件），
 容器=border-top 分节+滚动区（ih-alt-body 同语言），maxHeight 与 qrt-wrap 一口径无新
 高度链；卡片档网格容器（ih-cards 同构）+@open-doc 透传宿主。表格档（缺省/回落）恒
 不渲染（零增量） -->
    <div v-if="viewSegOn && effView !== 'table'" class="qrt-alt-body scroll-y" :class="{ 'is-cards': effView === 'cards' }" :style="{ maxHeight, minHeight }">
      <!-- 1356：rows 派生档也要带上文档导航（此前只传 tree-data，导航条读不到条数
           显示「0 命中」，_id 下拉也空着） -->
      <AltHitsViews v-if="effView === 'json'" view="json" :json-html="altDocsDerived ? undefined : effJsonHtml"
        :per-doc="altDocsDerived" :doc-html="altDocJsonHtml"
        :doc-count="effDocs?.length || 0" :doc-ids="effDocIds"
        :doc-index="altDocsDerived ? altDocIdx : undefined" @update:doc-index="altDocIdx = $event"
        @open-doc-at="openAltDocAt" ref="altJsonBox" />
      <AltHitsViews v-else-if="effView === 'tree'" view="tree" :tree-data="altDocsDerived ? undefined : effTreeData"
        :per-doc="altDocsDerived" :doc-data="altDocTreeData"
        :doc-count="effDocs?.length || 0" :doc-ids="effDocIds"
        :doc-index="altDocsDerived ? altDocIdx : undefined" @update:doc-index="altDocIdx = $event"
        @open-doc-at="openAltDocAt" ref="altTreeBox" />
      <AltHitsViews v-else view="cards" :hits="cardHitsAdapted" @open-doc="openAltCardDoc" />
    </div>
    <!-- loading 骨架态（消费方执行中传 :loading——四态互斥 G1-B1 同款，骨架优先于空态）；
 hideBody（RT 541 同款平移）——三分支链各加缺省恒真的 !hideBody 守卫，
 缺省路径 DOM 逐字节不变（硬契约）；hideBody=true 时表格体区块整体移除 -->
    <div v-if="!barOn && hiddenColCount > 0 && !bodyHidden" class="qrt-col-hint" role="status" data-test="qrt-col-hint">
      <span class="mono">已隐藏 {{ hiddenColCount }} 列</span>
      <button type="button" class="btn xs ghost" @click="resetVisibleCols">恢复全部列</button>
    </div>
    <!-- 1127：无工具行通道（未开 tableBar 且无 storageKey）没有偏好工具行——本地筛选必须有
 可见态与清除入口，否则勾选后行数变少却无任何「已筛选/如何清除」提示 -->
    <div v-if="!barOn && activeFilterCount && !bodyHidden" class="qrt-filter-bar" role="status">
      <TableFilteredHint :active="activeFilterCount" :shown="filteredRows.length" :total="rawRows.length"
        :mode="filterModeLive" span-cls="qrt-filtered mono" fmode-cls="qrt-fmode mono" clear-cls="qrt-filtered-clear"
        @toggle-mode="toggleFilterMode" @clear="clearAllFilters" />
    </div>
    <!-- 回顶锚点壳（RT rt-wrap-shell 同款平移）——qrt-backtop 此前锚 .qrt 整卡
 底沿，压住卡底流内 qrt-pgr 分页行右端 Pagination（同病同修）；loading/empty/wrap
 三分支随壳包入保 v-else-if 相邻。QRT 根非 flex 布局，壳只承接定位（最小形态） -->
    <div class="qrt-wrap-shell">
    <template v-if="loading && !bodyHidden">
      <div class="qrt-loading" :style="{ maxHeight, minHeight }">
        <!-- 骨架行数/行高参数化（RT 同款形态对齐）——缺省 3 行 30px=
 现状（缺省路径 DOM 逐字节不变） -->
        <SkeletonBox v-for="i in skeletonRows" :key="i" :height="skeletonH" round />
      </div>
    </template>
    <EmptyState v-else-if="isEmpty && !bodyHidden" :icon="Inbox" :text="emptyText" :hint="emptyHint" />
    <div v-else v-show="!bodyHidden" ref="wrapRef" class="qrt-wrap" :class="{ 'has-pgr': pagerOn }" :style="{ maxHeight, minHeight }" @scroll.passive="onWrapScroll">
      <!-- rows 型转置视图（RT 同款语言）——列名做首列（sticky），排序后前 N 行
 做横向列；只读镜像（排序/漏斗/行展开在转置态不渲染，退出即回主表） -->
      <table v-if="transposeOn" class="qrt-tbl qrt-transposed">
        <thead>
          <tr>
            <th class="qrt-t-field">字段</th>
            <th v-for="(r, ti) in transposeRows" :key="ti" class="mono qrt-t-hid" :title="'第 ' + (ti + 1) + ' 行'">r{{ ti + 1 }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, ci) in shownCols" :key="c">
            <td class="qrt-t-key mono" :title="c">{{ c }}</td>
            <td v-for="(r, ti) in transposeRows" :key="ci + ':' + ti" class="qrt-t-val mono">{{ r[ci] == null ? '∅' : cellText(r[ci]) }}</td>
          </tr>
        </tbody>
      </table>
      <table v-else class="qrt-tbl" :class="{ dense: rowH === 'compact', cozy: rowH === 'cozy' }" :style="tableWidthStyle">
        <thead>
          <tr>
            <!-- W-B：selectable 行多选通道——表头全选（口径=当前视图全量）；
 缺省 false 不渲染（零增量） -->
            <th v-if="selectable" class="qrt-sel-col">
              <input type="checkbox" :checked="allSel" :aria-label="allSelHint" :title="allSelHint" @click.stop @change="toggleAllSel" />
            </th>
            <!-- 冻结序号列（对齐 RT dbx 冻结窗格）——宽表横向滚动时行身份不滚走 -->
            <th class="qrt-idx">#</th>
            <th
              v-for="(c, i) in shownCols"
              :key="c"
              :data-col="c"
              :class="{ sortable, on: chainHas(c), 'qrt-col-frozen': isFrozenCol(c), 'qrt-col-flash': flashCol === c, 'qrt-drop-before': barOn && qDragOver === c && qDragPlace === 'before' && qDragCol !== c, 'qrt-drop-after': barOn && qDragOver === c && qDragPlace === 'after' && qDragCol !== c }"
              :style="barOn ? frozenStyle(c) : colStyle(c)"
              :title="thTitle(c)"
              :aria-sort="sortable && chainCount > 0 && dispChain[0].f === c ? (dispChain[0].d === 'asc' ? 'ascending' : 'descending') : undefined"
              :tabindex="sortable ? 0 : undefined"
              @keydown.enter.prevent.stop="onSort(i)"
              @keydown.space.prevent.stop="onSort(i)"
              @keydown="onColMenuKey($event, c)"
              @dragover="qOnDragOver($event, c)" @drop="qOnDrop($event, c)"
              @click="onSort(i, $event.shiftKey)"
              @contextmenu.prevent="openColMenu($event, c)"
            >
              <span class="qrt-th-name" :class="{ 'qrt-drag-src': qDragCol === c }" draggable="true"
                :title="isFrozenCol(c) ? '冻结列不可拖动（先取消冻结再移动）' : '拖动重排此列'"
                @dragstart="qOnDragStart($event, c)" @dragend="qOnDragEnd">{{ c }}</span>
              <!-- 类型语义：单行内联弱化显示（旧双层列头占 13px 高，宽表首行显脏）；
 无类型列仍留 .qrt-th-sub 空位契约（qrtThTypes 锁面），视觉零占宽 -->
              <span v-if="hasTypes" class="qrt-th-sub"><span v-if="effType(c)" class="qrt-th-type" :class="typeCls(effType(c))">{{ effType(c) }}</span></span>
              <span v-if="sortable" class="qrt-sort-i">{{ sortInd(i) }}</span><sup v-if="sortable && chainHas(c) && chainCount > 1" class="qrt-sort-ord">{{ chainOrd(c) + 1 }}</sup>
              <!-- 列头筛选漏斗（激活实色高亮；keydown.stop 防冒泡触发排序）；常驻按钮但视觉只在
 悬停/聚焦/生效时出现——宽表 8 列不再挂 8 个灰漏斗 -->
              <button class="qrt-funnel" :class="{ on: funnelOn(c) }" :aria-label="'筛选 ' + c + ' 列'" title="筛选此列"
                @click.stop="openFilter($event, c)" @keydown.stop>
<Filter :size="10" />
</button>
              <!-- 1136：列宽拖拽对所有宿主可用（无 storageKey 走内存态、不落盘）——
 DBX 式数据网格的首行基础能力，SQL 结果表此前完全没有 -->
              <span
                class="qrt-rs" role="slider" tabindex="0" :aria-label="'调整 ' + c + ' 列宽（←/→ 微调，Enter 自适应）'" title="拖拽调整列宽；双击自适应内容（重置走「列宽」钮）"
                @click.stop @dblclick="fitCol(c)" @mousedown="beginColResize($event, c)"
                @keydown.left.prevent.stop="nudgeColWidth(c, -32)" @keydown.right.prevent.stop="nudgeColWidth(c, 32)" @keydown.enter.prevent.stop="fitCol(c)"
              ></span>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- 筛选后空集提示（防「空得诡异」——数据明明有、全被筛没了） -->
          <tr v-if="!filteredRows.length" class="qrt-nomatch">
            <td :colspan="selSpan">
              筛选条件无匹配行
              <!-- 就地一键清除（此前只引导找列头图标，多两跳） -->
              <button class="btn sm ghost" style="margin-left:var(--sp-2h)" @click="clearAllFilters">清除全部筛选</button>
            </td>
          </tr>
          <!-- W7：template v-for 包行+行内展开行（key 移至 template，渲染结果不变） -->
          <template v-for="(row, ri) in renderRows" :key="ri">
          <!-- tr class 改数组形态——第二位接 rowClass 契约（undefined 时零附加，渲染不变）；
 W-B：第三位 selectable 选中类（缺省 undefined 零附加，与 rowClass 并存） -->
          <tr :class="[{ 'qrt-row-focus': tblFocus && ri === focusIdx }, rowCls(row, ri), selectable && isSelRow(ri) ? 'qrt-sel' : undefined]">
            <td v-if="selectable" class="qrt-sel-col">
              <input type="checkbox" :checked="isSelRow(ri)" :aria-label="'选中第 ' + (ri + 1) + ' 行'" @click.stop @change="toggleSelRow(ri)" />
            </td>
            <td class="qrt-idx mono">{{ ri + 1 }}</td>
            <td
              v-for="(cell, ci) in row" :key="ci"
              :data-ri="ri" :data-col="shownCols[ci]"
              class="qrt-cell" :class="{ expanded: cellMeta[ri]?.[ci]?.expanded, 'qrt-col-frozen': isFrozenCol(shownCols[ci]), 'qrt-hit': isSearchHit(ri, ci), 'rt-hit-cur': isSearchCur(ri, ci), 'num-col': cellMeta[ri]?.[ci]?.numeric, 'ip-col': cellMeta[ri]?.[ci]?.ip, 'qrt-agg-sel': isAggCell(ri, ci), 'qrt-region': isRegionCell(ri, ci), 'qrt-region-anchor': !!touchAnchor && touchAnchor.ri === ri && touchAnchor.ci === ci, ...(cellMeta[ri]?.[ci]?.tone || {}) }" :title="cell === null || cell === undefined ? '' : (cellMeta[ri]?.[ci]?.full || '')"
              @mousedown="onCellDown($event); onRegionStart($event, ri, ci)"
              @pointerdown="onCellPointerDown($event, ri, ci)"
              @pointerup="onCellPointerUp"
              @pointercancel="onCellPointerUp"
              @click="onCellClick($event, cell, ri, ci)"
              @keydown.enter.exact.prevent="onCellClick($event, cell, ri, ci)"
              @contextmenu.prevent="openCellMenu($event, ri, ci)"
            >
              <!-- 空值与 ResultTable 统一为灰 ∅（原 '-'）；值照旧展示，单击复制全文。
 epoch 毫秒人性化（title/复制保留原始值），与 ResultTable 同口径。
 #cell-<key> 作用域槽首位接管（传 row/value/col）——无槽走既有语义渲染链，
 行尾悬浮钮/跳转芯片/行级行动注入位不受槽影响 -->
              <template v-if="hasCellSlot(shownCols[ci])"><slot :name="cellSlotName(shownCols[ci])" :row="row" :value="cell" :col="shownCols[ci]"></slot></template>
              <span v-else-if="cell === null || cell === undefined" class="qrt-null">∅</span>
              <!-- T2：ES highlight 片段优先（opt-in highlight prop；RT rt-hl 链同源
 下沉）——hlSegment 净化（em/mark 放行，其余转义 fail-closed）后 v-html；
 缺省 false 本分支恒不渲染（零行为变） -->
              <span v-else-if="qHlHtml(ri, ci)" class="qrt-hl" v-html="qHlHtml(ri, ci)"></span>
              <template v-else-if="isSearchHit(ri, ci)"><template v-for="(seg, si) in splitMark(cellMeta[ri]?.[ci]?.text ?? '', searchDeferred)" :key="si"><mark v-if="seg.m" class="qrt-mark">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></template>
              <!-- W7：长 JSON 对象折叠预览 chip——点击开既有单元格详情弹窗；title 恒 raw 全串 -->
              <button v-else-if="cellMeta[ri]?.[ci]?.chip" class="rt-json-chip" :title="cellMeta[ri]?.[ci]?.full"
                      :aria-label="'查看完整值（对象 ' + (cellMeta[ri]?.[ci]?.chip?.n ?? 0) + ' 键）'"
                      @click.stop="cellDetail = { ri, ci }">
                <span class="rt-json-chip-p">{{ cellMeta[ri]?.[ci]?.chip?.label }}</span>
                <span class="rt-json-chip-n">{…}{{ cellMeta[ri]?.[ci]?.chip?.n }} 键</span>
              </button>
              <template v-else>{{ cellMeta[ri]?.[ci]?.text }}</template>
              <!-- hover 行内快捷钮（dbx 悬浮行内钮）——浮在行尾格右缘，移出行消失。
                   最后一列由宿主 #cell- 动作槽接管时停用：内建钮是 absolute 右缘，
                   会压在宿主动作钮上（BrowserView「操作」列实测 expand 被「更多」盖住）。 -->
              <button v-if="ci === row.length - 1 && !lastColHasCellSlot" class="qrt-row-copy" :aria-label="'复制行 JSON（第 ' + (ri + 1) + ' 行）'" title="复制行 JSON" @click.stop="copyRowJson(ri)"><Copy :size="11" /></button>
              <!-- W7：行内展开详情钮（行尾 hover，与复制钮同语言） -->
              <button v-if="ci === row.length - 1 && !lastColHasCellSlot" class="qrt-row-expand" :aria-label="expandedRows.has(qRowKey(ri)) ? '收起此行详情' : '展开此行详情'"
                :title="expandedRows.has(qRowKey(ri)) ? '收起此行详情（Esc 全部收起）' : '展开此行详情（焦点行按 E）'"
                @click.stop="toggleRowExpand(qRowKey(ri))">
                <ChevronDown v-if="expandedRows.has(qRowKey(ri))" :size="11" />
                <ChevronRight v-else :size="11" />
              </button>
              <!-- _index 格跳转芯片（AliasesView/SnapshotsView 同语义）——
 单击复制语义不变，芯片专职跳转索引工作区 -->
              <button v-if="shownCols[ci] === '_index' && typeof cell === 'string' && cell" class="qrt-idx-go" :aria-label="'打开索引工作区：' + cell" title="打开索引工作区" @click.stop="gotoIndex(cell)"><ExternalLink :size="11" /></button>
              <!-- W7：消费方行级行动注入位（行尾，hover 复制钮旁）——无注入零占位 -->
              <slot v-if="ci === row.length - 1" name="row-actions" :row="row" :ri="ri" />
            </td>
          </tr>
          <!-- W7：行内展开详情行——整行嵌 JsonTree（防爆参数与详情弹窗同款 200/4000）；
 随壳合并 TableExpandRow（RT 同构段单一出处），DOM 逐字节不变 -->
          <TableExpandRow :open="expandedRows.has(qRowKey(ri))" :colspan="selSpan"
            :label="qRowKey(ri)" :data="qRowObj(ri)" @close="toggleRowExpand(qRowKey(ri))" />
          </template>
          <!-- M4：截断保护提示行（与 RT 同文案语义——导出不受影响） -->
          <tr v-if="renderTruncated" ref="truncSentinel" class="qrt-trunc-row">
<td :colspan="selSpan">
            已渲染前 {{ renderRows.length }} 行（共 {{ sortedRows.length }} 行命中排序与筛选）
            <button class="btn sm ghost" style="margin-left:var(--sp-2h)" @click="renderMore">继续渲染下 {{ MAX_RENDER }} 行</button>
            ——完整数据请用「导出」
          </td>
</tr>
        </tbody>
        <!-- 聚合 footer 行（RT 同款；列头菜单「聚合行」开关，es_tbl_agg:<dim> 记忆
 仅 prefsOn 落盘，SQL 通道内存态零增量）——数值列 Σ/avg 复用 useColStats.statsOf 口径；
 冻结列 sticky 经既有 qrt-col-frozen 机制同步（frozenStyle 内联 left 一致）
 同构段合并 TableAggFoot 片段组件（RT 同款单一出处；列源/冻结判定/
 内联 style 经 props 收口，DOM 逐字节；样式同步更新组件全局单源）
 件①：:dist="aggDist" 接线（ TableAggFoot dist 可选 prop 消费——
 此前 QRT 调用点未传缺省零渲染，启用；数据面 useAggRow 第 5 参 statsOf(c).dist） -->
        <TableAggFoot v-if="aggOn" prefix="qrt" :cols="shownCols" :foot="aggFoot" :spark="aggSpark"
          :dist="aggDist"
          :empty-pct="aggEmptyPct" :frozen-of="(c) => isFrozenCol(c)"
          :style-of="(c) => (barOn ? frozenStyle(c) : undefined)" :sel-hint="aggSelHint" />
      </table>
    </div>
    <!-- 长列表回顶（RT 同款）——根级独立 v-if，不混入 loading/empty/wrap 渲染链；
 随壳合并 TableBacktop（双表同款单一出处），class 透传 DOM 不变；
 移入 qrt-wrap-shell 定位壳（分支链之后兄弟），锚滚动视口底沿不再盖壳外分页行 -->
    <TableBacktop v-if="showTop && !bodyHidden" class="rt-backtop qrt-backtop" aria-label="回到顶部" title="回到顶部" @top="backToTop" />
    </div>

    <!-- 1366：页脚状态栏（RT 同款）——此前 QRT 只有分页行，缺 RT 的「选区聚合 + 操作提示」。
 放在表格卡内、分页行之前；分页行在场时由分页行接管卡底圆角（.has-pgr 既有规则）。 -->
    <div v-if="!bodyHidden && !loading && !isEmpty" class="qrt-status">
      <!-- 框选矩阵动作条（RT 同语义内核化）——拖选若干格后在此给出口：
 格数 + Σ/avg（有数值时）+ 复制 TSV/JSON + 清除。与行多选并存（两种选择语言各管各的）。 -->
      <template v-if="region">
        <span class="qrt-stat-seg">
          <span class="qrt-stat-hint qrt-sel-badge">已框选 <b>{{ regionCellCount }}</b> 格<span v-if="regionSummary">（数值 {{ regionSummary.numCount }}/{{ regionSummary.count }}）</span></span>
          <span v-if="regionSummary && regionSummary.numCount" class="qrt-stat mono">Σ {{ fmtNum(regionSummary.sum) }} · avg {{ regionSummary.avg != null ? regionSummary.avg.toFixed(2) : '—' }}</span>
          <button class="qrt-stat-x" data-test="qrt-copy-region-tsv" title="复制框选区域为 TSV（不含表头；空值空串）" @click="copyRegionMatrix('tsv')">复制 TSV</button>
          <button class="qrt-stat-x" data-test="qrt-copy-region-json" title="复制框选区域为 JSON 二维数组" @click="copyRegionMatrix('json')">复制 JSON</button>
          <button class="qrt-stat-x" data-test="qrt-clear-region" aria-label="清除框选" title="清除框选（Esc 亦可）" @click="clearRegion">清除</button>
        </span>
      </template>
      <!-- 行选中动作条（RT「选中浮动栏」同语义的内核版）——勾选后此处给出出口；
 此前 QRT 只有勾选框+右键菜单里的复制项，没有可见动作面（SQL/Lucene 都缺），
 勾了不知道能干什么。选行与 Ctrl+点格聚合可并存，两段同时显示、互不顶掉。 -->
      <template v-if="selectable && selSet.size">
        <span class="qrt-stat-seg">
          <span class="qrt-stat-hint qrt-sel-badge">已选 <b>{{ selSet.size }}</b> 行</span>
          <button class="qrt-stat-x" data-test="qrt-copy-sel-tsv" title="复制选中行为 TSV（首行列名，可直接贴进表格软件）" @click="copySelMatrix('tsv')">复制 TSV</button>
          <button class="qrt-stat-x" data-test="qrt-copy-sel-json" title="复制选中行为 JSON 数组（键=可见列）" @click="copySelMatrix('json')">复制 JSON</button>
          <button class="qrt-stat-x" data-test="qrt-invert-sel" title="反选：当前视图里已选的取消、没选的选上" @click="invertSelRows">反选</button>
          <button class="qrt-stat-x" data-test="qrt-clear-sel" aria-label="清除已选行" title="清除已选行" @click="clearSelRows">清除</button>
        </span>
      </template>
      <template v-if="aggCellStats && aggCellStats.numCount">
        <span class="qrt-stat-seg" :title="`已选 ${aggCellStats.picked} 格 · Σ ${fmtNum(aggCellStats.sum)} · avg ${aggCellStats.avg != null ? fmtNum(aggCellStats.avg) : '—'} · min ${fmtNum(aggCellStats.min)} · max ${fmtNum(aggCellStats.max)} · count ${fmtNum(aggCellStats.count)}（再点一次取消）`">
          <span class="qrt-stat mono">Σ {{ fmtNum(aggCellStats.sum) }}</span>
          <span class="qrt-stat mono">avg {{ aggCellStats.avg != null ? fmtNum(aggCellStats.avg) : '—' }}</span>
          <!-- 1413：min/max/count 收进 tooltip——三段并存时（框选+选行+聚合）这三项会把
               「清除」挤出可视区（实测 803 > 760）。Σ/avg 是主信息，其余悬停可读且导出不受影响。 -->
          <span class="qrt-stat-hint">已选 {{ aggCellStats.picked }} 格</span>
          <button class="qrt-stat-x" aria-label="清除单元格聚合选择" title="清除选择（Esc 亦可）" @click="clearAggCells">清除</button>
        </span>
      </template>
      <span v-else-if="aggCellStats" class="qrt-stat-hint">已选 {{ aggCellStats.picked }} 格（都不是数值，无数可算）· 再点一次取消</span>
      <span v-else-if="!(selectable && selSet.size)" class="qrt-stat-hint">{{ touchAnchor ? '已设框选起点 · 点另一个单元格完成框选（再点起点取消）' : region ? '拖动已框选矩阵 · 点「复制 TSV」贴进表格软件 · Esc 清除选区' : 'Ctrl+点击数值单元格可求和聚合 · 更可拖选一片单元格 · 右键单元格可复制/筛选用法' }}</span>
      <!-- 1413：弹性占位退成 margin-left:auto（在 .qrt-kbd-hint 上）——
 换成可换行布局后，flex:1 的空 div 会独占一整行、把内容推到两行。
 没有快捷键提示时，用占位把行尾留空（保持既有观感）。 -->
      <div v-if="!tblFocus" class="qrt-status-fill" aria-hidden="true"></div>
      <span v-if="tblFocus" class="qrt-kbd-hint mono">↑↓ 行 · Ctrl+F 查找 · Esc 退出</span>
    </div>

    <!-- 内建分页行（tfoot 后表格底部常驻）——共享 Pagination 组件；翻页/改页大小
 只 emit（update:page / update:pageSize），取数归宿主（远端分页契约）。骨架/空态不渲染，
 has-pgr 联动收 wrap 底圆角（分页行接管表格卡底缘）；
 hideBody 时分页行常驻（工具行同款——展示形式切换不收分页） -->
    <div v-if="pagerOn && ((!loading && !isEmpty) || bodyHidden)" class="qrt-pgr">
      <Pagination :page="pagerPage" :total-pages="pagerTotalPages" :page-size="pagerSize" :disabled="pagerDisabled"
        @update:page="emit('update:page', $event)" @update:page-size="emit('update:pageSize', $event)" />
    </div>

    <!-- 单元格右键菜单（共享 CellContextMenu，与 RT 同款交互） -->
    <CellContextMenu
      v-if="cellMenu"
      :x="cellMenu.x" :y="cellMenu.y" :title="cellMenu.ci != null && shownCols[cellMenu.ci] ? `按「${shownCols[cellMenu.ci]}」` : ''"
      :items="cellMenuItems"
      @close="closeCellMenu"
    />
    <!-- 列头右键=列管理菜单（与 RT 同款） -->
    <CellContextMenu
      v-if="colMenu"
      :x="colMenu.x" :y="colMenu.y" :title="colMenu.col"
      :items="colMenuItems"
      @close="colMenu = null"
    />
    <!-- 1163：工具行右键（QRT 同款）——SQL 结果表的「表格操作那个表头」同样可右键，
         一级只放最高频几项，其余收进「更多…」二级。 -->
    <CellContextMenu
      v-if="barMenu"
      :x="barMenu.x" :y="barMenu.y" :title="'表格工具 · ' + visibleCols.length + '/' + columns.length + ' 列'"
      :items="barMenuItems"
      @close="barMenu = null"
    />
    <!-- 单元格详情弹层（RT 302 行同款形态） -->
    <n-modal v-model:show="detailOpen" preset="card" title="单元格详情" style="width:680px;max-width:92vw" :bordered="false">
      <div class="qrt-d-meta mono">{{ detailMeta }}</div>
      <JsonTree :data="detailData" tools :max-children="200" :max-str-len="4000" />
    </n-modal>

    <!-- 列详情弹层（RT P2-3 同款形态合并共享件，统计走共享 useColStats） -->
    <ColDetailModal v-model:show="colDetailOpen" :stats="colDetailStats" :label-of="filterLabel" />

    <!-- W-B：rowDrawer 行详情侧拉（对标 dbx 行钻取；ReconcileReportDrawer
 n-drawer 范式）——整行键值对 + 逐格复制 + 页脚「复制整行 JSON」（copyRowJson 同一口径）；
 仅 rowDrawer prop 开启且右键「行详情」后可达，缺省整块零渲染（零增量） -->
    <n-drawer v-model:show="rdwOpen" :width="rdwW" placement="right">
      <n-drawer-content title="行详情" closable>
        <div v-if="rdwRow" class="qrt-rdw-body">
          <div class="qrt-rdw-meta mono">第 {{ rdwRow.ri + 1 }} 行 · {{ rdwCols.length }} 列</div>
          <div v-for="(c, i) in rdwCols" :key="c" class="qrt-rdw-row">
            <span class="qrt-rdw-k mono" :title="c">{{ c }}</span>
            <span class="qrt-rdw-v mono" :title="fullText(rdwCells?.[i])">{{ cellText(rdwCells?.[i]) }}</span>
            <button class="btn ghost xs" :aria-label="'复制 ' + c" title="复制该格全文" @click="copyDrawerCell(i)"><Copy :size="11" /></button>
          </div>
        </div>
        <template #footer>
          <button v-if="rdwRow" class="btn sm" :aria-label="'复制行 JSON（第 ' + (rdwRow.ri + 1) + ' 行）'" @click="copyDrawerRowJson()"><Braces :size="12" /> 复制整行 JSON</button>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 列筛选弹层（去重值勾选）；：壳合并共享件 ColFilterPopover
 （五处同构壳 qfp/rfp/bw-fp/pl-afp/afp 一处实现），useColFilters 逻辑零改动；
 fitPopupPos 碰撞自适应+开层聚焦随组件 fit 内建（语义平移不变）；
 default 注入位放组合档切换钮（AND/OR 就地翻转，与提示行同钮）
 contains 静态渲染收 isContainsCol 守卫（此前 binary/geo_point/nested/
 object/ip 列照出包含行——base64 串无文本包含语义）
 件③：组合档钮改走 ColFilterPopover 内建 chip（ filterMode 可选
 prop 消费）——默认槽手搓钮退役（aria/title 同语汇同步更新组件单源，filterModeToggle561
 行为锚同串保真），提示行 TableFilteredHint 同档切换面不动 -->
    <ColFilterPopover
      v-if="filterPop"
      :col="filterPop.col" :x="filterPop.x" :y="filterPop.y" fit
      :vals="fvals.vals" :total="fvals.total" :has-more="fvals.hasMore" show-has-more bars
      :selected="colFilters[filterPop.col] ?? []" :norm-of="normVal" :label-of="filterLabel"
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
    <!-- TableBacktop 迁往 qrt-wrap-shell 定位壳内（原位锚 .qrt 整卡底沿盖 qrt-pgr 分页行，修订） -->
  </div>
  </FocusableSurface>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount, useSlots, type Ref } from 'vue';
import { normalizePrefEnum } from '../utils/prefEnum';
import { useRouter } from 'vue-router';
import { RotateCcw, Inbox, Copy, Braces, ArrowDown, ArrowUp, EyeOff, Pin, MoveHorizontal, Filter, ExternalLink, Search, FileDown, Table, ClipboardList, Maximize2, Minimize2, ChevronDown, ChevronRight, FileText, SlidersHorizontal } from 'lucide-vue-next';
import FocusableSurface from './FocusableSurface.vue';
import EmptyState from './EmptyState.vue';
import SkeletonBox from './SkeletonBox.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import JsonTree from './JsonTree.vue';
import AltHitsViews from './AltHitsViews.vue'; /* ：alt 三视图体共享件单源（内建视图档消费，勿再造壳） */
import { createPressGuard } from '../utils/pressGuard';
import { highlightJson } from '../utils/jsonc';
import { buildDsl, buildExistsDsl } from '../utils/dslFromCell'; /* 1204：与 RT 共用同一 DSL 生成内核 */
import ColDetailModal from './ColDetailModal.vue';
import { NModal, NDrawer, NDrawerContent } from 'naive-ui';
import ColPicker from './ColPicker.vue';
/* 列布局方案共享件（652 preset 内核消费面，RT/QRT 单一出处） */
import TablePresetMenu from './TablePresetMenu.vue';
import Pagination from './Pagination.vue';
import TookBadge from './TookBadge.vue';
import TableShell, { TableExpandRow, TableBacktop } from './TableShell.vue';
import { buildXlsx } from '../utils/xlsxMini';
import { snapshotTableToPng } from '../utils/tableSnapshot';
import { useTablePrefs } from '../composables/useTablePrefs';
import { usePref } from '../composables/urlState';
import { useRowNav } from '../composables/useRowNav';
/* W-A：TableShell 第二刀——渲染截断/聚合底行随壳合并共享 composable，
 typeCls 语义色档收 utils/typeTiers 单一出处（RT 同源） */
import { useRenderMore, MAX_RENDER } from '../composables/useRenderMore';
import { useAggRow } from '../composables/useAggRow';
/* T1：IP 型判据同步更新 typeTiers 单源（isIpType；本地 IP_TYPE_RE 字面退役） */
import { typeCls, isNonSemanticType, RANGE_DATE_RE, isRangeType, rangePlaceholderTxt, isIpType } from '../utils/typeTiers';
/* 聚合行迷你走势（零依赖纯 SVG 组件复用）——随 tfoot 合并
 TableAggFoot 片段组件（内核模板不再直用，import 同步更新） */
import TableAggFoot from './TableAggFoot.vue';
/* bar-left 同构段三件合并（筛选态提示/内建搜索/刷新钮——RT 同款单一出处） */
import TableFilteredHint from './TableFilteredHint.vue';
import TableQSearch from './TableQSearch.vue';
import TableRefreshBtn from './TableRefreshBtn.vue';
import { useColFilters, useFilterMode, quickFilterRows } from '../composables/useColFilters';
import { useColStats } from '../composables/useColStats';
/* W-B：语义格式化共享件（bytes/duration/percent 三型，纯函数） */
import { semFormat } from '../composables/useSemFormat';
import { useColFit, COL_W_MIN, COL_W_MAX, frozenStyleOf } from '../composables/useColFit';
/* 比较器合并 tableSort.compareVals 单源（parseFloat 双试退役——千分位/单位/
 科学计数字符串按值纠错；numeric() 科学计数/时长新档经此双内核生效）
 件②：sortableGuard 随接线引入（显式非语义列排序抑制单源） */
import { compareVals, sortableGuard, useSortChain } from '../composables/tableSort';
import { resolveSortField } from '../utils/sortField';
import { useColDrag } from '../composables/useColDrag';
import HitNav from './HitNav.vue';
import { useGridSearch, splitMark } from '../composables/useGridSearch';
import { registerTable, unregisterTable } from '../utils/tableRegistry';
import { useAppStore } from '../stores/app';
import { exportStamp, copyText, epochMsText, fmtNum, csvCell, downloadText, downloadBlob } from '../utils/format';
import { summarize } from '../utils/summarize';
import { matrixText } from '../utils/copyMatrix';
/* XLSX 双 sheet 装配合并 exportSheets.buildExportSheets 单源（RT 同源） */
import { buildExportSheets } from '../utils/exportSheets';
/* T2：highlight 片段装配合并 highlightSanitize.hlSegment 单源（RT hlHtml 同源） */
import { hlSegment } from '../utils/highlightSanitize';
import ColFilterPopover from './ColFilterPopover.vue';

/* 轻量只读通用结果表：统一「表格化展示」共性，不承担编辑/聚合/行内展开等通道特定能力。
 hit 型（ES 文档命中）自动抽 _id/_index/_score + _source 扁平字段为列；
 rows 型（SQL cols+二维 rows）直接直渲；二者二选一，内部按 hits 是否传入自动判定。
 传 storageKey（如 'lucene:<index>' / 'pit:<index>'）启用列选/密度/列宽
 三件套按维度记忆（useTablePrefs，与 ResultTable 同键空间口径）；不传则保持轻量无状态。 */
interface Hit {
  _id: string;
  _index: string;
  _score?: number | null;
  _source: Record<string, any>;
  /* T2：ES highlight 片段（normalizeResp 透传形态，types.SearchHit 同款）——
 highlight prop 开启时经 hlSegment 净化渲染；不传=无片段回落普通渲染 */
  highlight?: Record<string, string[]>;
}

interface Props {
  /* hit 型：ES 文档命中，自动抽 _index/_id/_score + _source 扁平字段为列 */
  hits?: Hit[];
  /* 命中总数+下界标注（hit 型可选；传了才在工具行显示，对齐 RT 计数条） */
  total?: number;
  totalGte?: boolean;
  /* 1406：宿主声明「还有未加载行」（游标未取完 / 远端分页还有下一页）——
 让全选/反选的工具提示按「仅已加载」口径说话。缺省 undefined = 未声明（零增量）。 */
  moreRows?: boolean;
  /* rows 型：SQL 的 cols + 二维 rows */
  cols?: string[];
  rows?: (string | number | boolean | null)[][];
  /* 通用 */
  maxHeight?: string;   // 默认 '420px'，超限滚动
  /* 1354：可选**下限**。maxHeight 只封顶不收底——结果只有 1~2 行时表体跟着塌到 52px，
     用户看到「表格特别窄、下面一大片空白」。传了才生效（默认 undefined = 零行为变化，
     RT/索引页不受影响）。SQL 控制台用它把表体撑到视口剩余高度。 */
  minHeight?: string;
  emptyText?: string;   // 默认 '无数据'
  /* 空态下一步指引（EmptyState 三件套 hint）——不传不渲染，保持零增量 */
  emptyHint?: string;
  sortable?: boolean;   // 是否支持点击表头排序（SQL 通道需要，hit 型可 false）
  /* 1126：结果值下钻——开启时单元格菜单出现「加入查询条件并重查」，
  只 emit 意图，改写/执行归宿主（与 RT filter-hit 同一动线）。
  1439：hits 型结果（Lucene）也可用——宿主传 prop 才出现，未接宿主零增量。 */
  useAsCondition?: boolean;
  /* 1439：下钻文案里的目标语言（'SQL' / 'Lucene'），只影响菜单文案 */
  condTarget?: string;
  /* 1439：是否同时给「按此列排序并重查」两项（只有 SQL 宿主接线 sort-by） */
  condSort?: boolean;
  /* remoteSort 远端排序契约（dbx 对标，分页同构——只 emit 意图、
 排序/取数归宿主）。缺省 false=客户端排序逐字节不变；true 时表头排序入口（点击/键盘/
 右键直选）不改本地行序，只 emit 'sort-change'（载荷 {f,d:'asc'|'desc'}，null=取消排序）；
 多键链是本地排序特性，远端档塌缩为单键三态（升→降→取消） */
  remoteSort?: boolean;
  /* 记忆维度键（如 'lucene:idx-a'）；不传 = 不启用记忆（SQL 通道 特例） */
  storageKey?: string;
  /* 默认可见列全集——列选无记忆时的缺省集（缺省=前 8 列启发式）。
 列数多于 8 的表（如审计表）传全列，避免尾列（详情/集群）默认被藏 */
  defaultCols?: string[];
  /* 1334：只记列宽/密度，不记列选——列集每次查询都可能变的表（SQL）用它。
      为何需要：把上一次查询的列集当成「用户选中的列」，会把本次新出现的列静默藏掉。
      为何不干脆不传 storageKey：列宽/密度跟列集无关，丢掉纯属损失。 */
  skipColsMemory?: boolean;
  /* 执行中骨架态——消费方 running/busy 时传 true，渲染骨架行优先于空态 */
  loading?: boolean;
  /* 字段类型映射（列名→ES 类型）——有值时列头启用双层结构（RT 同款
 下行类型徽标）；不传保持单层零增量（SQL 通道）。数据源 useIndexFieldTypes */
  fieldTypes?: Record<string, string>;
  /* 内建放大（FocusableSurface）开关——默认开 */
  focusable?: boolean;
  /* 内建分页（可选）——page/pageSize（+既有 total）三者齐备才渲染 tfoot 后
 分页行（共享 Pagination 组件）；翻页/改页大小只 emit 不取数，远端分页语义归宿主
 （内核不切片）。任一缺省即不渲染，既有消费方零破坏 */
  page?: number;
  pageSize?: number;
  /* 分页器禁用（宿主执行中传 running/busy） */
  pagerDisabled?: boolean;
  /* 查询耗时 ms——计数条 TookBadge 对齐 RT 计数条口径；缺省不渲染 */
  took?: number | null;
  /* W-D 契约：行级条件色档——返回值追加到每个数据行 tr class（空格拼接，
 与既有选中/焦点类并存）；undefined/null/空串跳过。row=当前渲染行单元（hit 型=hit、
 rows 型=矩阵行），index=渲染行序。缺省零增量 */
  rowClass?: (row: any, index: number) => string | undefined;
  /* 1439b：宿主行级操作组并入单元格右键菜单（父分组+二级动作）——账号/角色等
     领域动作不必另造菜单壳；返回 null 零增量。回调行同 rowClass 口径。 */
  rowActionGroup?: (row: any, index: number) => CcmItem | null;
  /* G149：列头中文语义 tip（列名→中文语义）——可选通道缺省零增量；
 悬浮两段拼接（中文语义+内建排序/列管理提示，thTitle 单源），列名显示与
 导出 CSV/TSV 表头同源口径不动（717 G60/736 G133 双语同款落法） */
  colTips?: Record<string, string>;
  /* W-D 契约：导出加工——exportName=下载文件名主段（缺省维持 table-export- 现状）；
 exportCell=导出/复制矩阵单元格值加工（仅 csvBlock/matrixText 管道消费，不改表格显示）。
 两者缺省均零增量 */
  exportName?: string;
  exportCell?: (value: unknown, col: { key: string }, row: any) => unknown;
  /* 1141：导出▾ 增「NDJSON · 每行一对象」档（rows 型逐行对象、列=可见列、
 走 csvBlock 同源加工）。缺省 false 零增量；SQL 等行对象语义通道接线，
  宿主不再各自手写导出。 */
  exportNdjson?: boolean;
  /* 1141：导出完成提示追加事实注脚（如「cursor 未取完，仅导出已加载行」）——
  SQL 等通道的诚实提示收口进内核同一出口，宿主不再复写导出实现。缺省空串零增量 */
  exportNote?: string;
  /* 1141：工具行「N/M 列」计数开关——宿主已有行/列 MetaStrip 时传 false 防重复。
 缺省 true（既有工具行 DOM 逐字节不变） */
  showColCount?: boolean;
  /* ═══ W-B：表格内核扩展四件（全部缺省零增量）═══
 quickFilter=跨可见列 contains 过滤（与既有列筛选 AND 叠加；生效且 0 行走既有空态链）；
 selectable=行多选通道（首列勾选/表头全选/tr 挂 qrt-sel/emit selection-change）；
 semOn=语义渲染扩展（bytes/duration/percent，共享件 useSemFormat；显示加工、
 title/复制/导出恒 raw）；exportRowFilter=导出三管道行级过滤（exportCell 只管格，此只管行） */
  quickFilter?: string;
  selectable?: boolean;
  semOn?: boolean;
  exportRowFilter?: (row: unknown) => boolean;
  /* W-B：rowDrawer 行详情侧拉（对标 dbx 行钻取）——开启时单元格右键菜单增
 「行详情」项，侧拉抽屉展示整行键值对+逐格复制+「复制整行 JSON」；缺省 false 零增量 */
  rowDrawer?: boolean;
  /* ═══ W3：semRawCols 显式非语义类型抑制守卫（531/533 两次主项）═══
 命中列名跳过 semFormat「按值推断」链（裸数字 ≥1000 判 ms / 0..1 判 percent 的误伤面），
 显式 fieldTypes 语义标注（bytes/duration/percent）不受影响；缺省 undefined 全链零增量 */
  semRawCols?: string[];
  /* W3：filterMode 跨列筛选组合档——'AND'（缺省）既有行为逐字节不变，
 'OR'=任一筛选列命中即保留（跨列并集档）；prop 播种运行档，弹层/提示行切换钮就地翻转 */
  filterMode?: 'AND' | 'OR';
  /* ═══ W3：searchable/refreshable 工具行内建 opt-in（quickFilter/refresh 的 UI 面）═══
 searchable=true → 工具行（bar-left，与既有钮同排）内建搜索输入框，双绑驱动既有
 quickFilter 过滤链（quickFilter 是单向 prop——内部 ref 合成：输入非空以输入为准，
 空输入回落外部 quickFilter 播种值，既有 prop 契约不破）；Esc 清词；placeholder 中文；
 缺省 false=无输入框（全站零增量，「无输入 UI、全站 0 接线」悬空能力落地入口）。
 refreshable=true → 工具行刷新钮，点击只 emit 'refresh' 意图（事件名对齐 RT 既有
 refresh；525 分页同构：只上报意图、取数归宿主）；缺省 false 零增量。
 ⚠ 工具行渲染门控 1141 起为 barOn（storageKey 记忆 或 tableBar 内存态工具行）；
 无 storageKey 且未开 tableBar 的通道传本组 prop 不出 UI（工具行不在场）。 */
  searchable?: boolean;
  refreshable?: boolean;
  /* 1141：内存态工具行（无 storageKey 的 SQL 等通道复用同一套表格工具）——
 导出▾/视图⋯/列选/计数/搜索/刷新/放大 全部走内核共享件，能力与查询工作台/
 索引工作台表格一致；列选/列宽/冻结为内存态（每次执行重挂载回全列，语义同 1137），
 行高仍是全局阅读偏好。预设/排序记忆/列选落盘依旧只走 storageKey（维度关闭=零落盘）。
 缺省 false → 全站零增量（既有无 storageKey 通道不受影响）。 */
  tableBar?: boolean;
  /* hideBody 表格体隐藏（RT 541 同款平移）——消费方实现 JSON/Tree/卡片视图时
 表格体区块（loading/empty/wrap/转置主体分支）与转置态提示行隐藏、工具行与分页行常驻：
 视图切换 seg 寄居 bar-prepend 槽，展示形式切换不再连工具行一起消失。缺省 false 零增量 */
  hideBody?: boolean;
  /* 1401 填满档（opt-in）：宿主面板有确定高度时，表体吸收剩余高度——
 工具行/状态栏/分页行保持自然高，.qrt-wrap 成为唯一伸缩区；配合宿主把 FocusableSurface
 链接成高链（data-flex-fill 透传）。行少时不再塌成一条、面板下方不留空白。
 缺省 false → 现有各宿主逐字节不变。 */
  fill?: boolean;
  /* ═══ ：syncSort 宿主权威排序态回填（RT 同款平移）═══
 remote 档箭头此前只随内部意图态 remoteSortCur（用户点击三态循环），宿主无从回填/重置。
 接线后：有值→回填 remoteSortCur（箭头/aria-sort 同步该态，此后用户点击仍走既有三态
 循环只 emit 意图）；null=清态（箭头清+循环基点清）。d 按契约收 1|-1。缺省 undefined=
 未接线零增量（不读不写 remoteSortCur）；本地（客户端）档不消费本 prop——箭头权威仍是
 sortSpec。与「remote 档挂载不读排序落盘」正交兼容：回填只走 prop 不触 LS。 */
  syncSort?: { f: string; d: 1 | -1 } | null;
  /* 骨架行数/行高参数化（RT 同款形态对齐）——缺省 3 行 30px=现状，
 缺省路径 DOM 逐字节不变 */
  skeletonRows?: number;
  skeletonH?: string;
  /* ═══ T2：ES highlight 片段渲染 opt-in（RT W-A 链同源下沉）═══
 true 且 hit 型行带 hit.highlight[col] 片段时，片段经 highlightSanitize.hlSegment
 （join ' … ' + 净化，em/mark 放行、其余转义 fail-closed）v-html 渲染（.qrt-hl），
 优先于普通文本渲染链（空值之后、命中切 mark 之前，与 RT rt-hl 同位序）；
 缺省 false 零行为变（rows 型恒短路——矩阵无 highlight 概念）。 */
  highlight?: boolean;
  /* ═══ T3②：分页器迁工具行 opt-in（「翻页统一在表格头」收尾，RT :25 同款）═══
 true 且 page/pageSize/total 三参齐备时：内建 Pagination 寄居工具行 bar-left，
 底部 qrt-pgr 独立分页行退役（互斥合并在 pagerOn 判定，行 v-if 字面不动）。
 ⚠ 与 546 searchable/refreshable 同口径的注意点不适用本 prop：迁头分页器在
 prefsOn 主壳与独立壳分支双挂载（v-if 互斥渲染），无 storageKey 通道同样可达。 */
  pagerInHead?: boolean;
  /* ═══ ：内建视图档 opt-in（dbx 差距 #2 合并——「展示形式统一在表格头」内核化）═══
 viewSeg=true → 工具行 bar-left 最前内建 表格/JSON/Tree/卡片 分段（prefsOn 主壳与独立壳
 双通道可达）；非表格档表格体隐藏（hideBody 语义内化进 bodyHidden——工具行常驻、不破）、内建 alt 体区渲染 AltHitsViews（565 共享件单源，DQ/IH 自造 seg+hideBody
 联动的两份重复实现自此可退役合并）。缺省 false 全站零增量。
 viewPrefKey 提供时档位 usePref 落盘（跨会话记忆，esquerystudio.pref.* 命名空间）；缺省仅
 内存态（KeepAlive 下组件实例常驻=状态不重置）。
 alt 三档数据源=数据驱动出档（提供哪档出哪档，表格档恒在）：jsonHtml=高亮 pretty HTML
 （宿主 markHtmlAll/highlightJson 链产出，DQ/IH 同构）；treeData=行集（{_id,..._source}，
 JsonTree tools 档）；cardHits=卡片行集（@open-doc 透传宿主开文档，DQ openDoc 同构）。 */
  viewSeg?: boolean;
  viewPrefKey?: string;
  jsonHtml?: string;
  treeData?: unknown;
  cardHits?: Hit[];
}

/* 内建聚焦面状态(FS headless 双向绑定) */
const focused = ref(false);
/* 右簇聚合菜单（导出 ▾ / 视图 ⋯）状态——Esc/点外关闭，互斥开 */
const expMenuOpen = ref(false);
const viewMenuOpen = ref(false);
/* 1143：无工具行通道的独立视图菜单开合（聚合行/转置/语义格式化归位后的出口） */
const fsViewOpen = ref(false);
function closeMenus() { expMenuOpen.value = false; viewMenuOpen.value = false; }
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
const props = withDefaults(defineProps<Props>(), {
  focusable: true,
  hits: undefined,
  cols: undefined,
  rows: undefined,
  maxHeight: '420px',
  minHeight: undefined,
  emptyText: '无数据',
  emptyHint: undefined,
  sortable: false,
  remoteSort: false,
  storageKey: undefined,
  loading: false,
  fieldTypes: undefined,
  page: undefined,
  pageSize: undefined,
  pagerDisabled: false,
  took: undefined,
  rowClass: undefined,
  colTips: undefined,
  exportName: undefined,
  exportCell: undefined,
  exportNdjson: false,
  exportNote: '',
  showColCount: true,
  quickFilter: undefined,
  selectable: false,
  semOn: undefined,
  exportRowFilter: undefined,
  rowDrawer: false,
  semRawCols: undefined,
  filterMode: 'AND',
  /* W3：内建 UI opt-in 缺省关（全站零增量）；
 hideBody 缺省 false（RT 541 同款平移） */
  searchable: false,
  refreshable: false,
  /* 1141：内存态工具行缺省关（JS 侧 props 表补位，模板 default 见 props 声明） */
  tableBar: false,
  hideBody: false,
  fill: false,
  condTarget: 'SQL',
  condSort: true,
  /* syncSort 缺省 undefined=未接线零增量；骨架缺省 3 行 30px=现状 */
  syncSort: undefined,
  skeletonRows: 3,
  skeletonH: '30px',
  /* highlight/pagerInHead 缺省关（全站零增量，消费侧接线下批） */
  highlight: false,
  pagerInHead: false,
  /* 内建视图档缺省关（全站零增量，首消费面 SearchTemplates 接线） */
  viewSeg: false,
  viewPrefKey: undefined,
  jsonHtml: undefined,
  treeData: undefined,
  cardHits: undefined,
});

/* ═══ ：内建视图档状态机（dbx 差距 #2 合并——「展示形式统一在表格头」内核化）═══
 altView=用户档位（viewPrefKey 提供时 usePref 落盘跨会话记忆，缺省仅内存态——KeepAlive
 下组件实例常驻，状态不重置）；effView=数据驱动生效档——持久化/手选档位的数据源缺席时
 诚实回落表格（偏好保留不回写，数据重回即恢复）；bodyHidden=宿主 hideBody ∪ 内建非表格
 档（547 hideBody 语义内化，561 退聚焦 watch 源随之升级——viewSeg=false 时 bodyHidden≡
 hideBody 单独流转行为等值）。⚠声明必须在 props 之后（usePref/computed 依赖 props） */
const viewSegOn = computed(() => props.viewSeg === true);
/* 1187：rows 型内核（SQL/日志等 cols×rows 通道）自出 JSON 档。
   此前 jsonHtml 只能由宿主传入（DQ/IH 的 markHtmlAll 链），于是同一种结果表在 SQL 控制台
   只有表格档、在查询工作台却有 表格/JSON/Tree/卡片 —— 这是「三个入口能力不一致」的真实成因之一。
   行对象语义与导出/复制同口径（键=可见列），逐行一个对象；行数设上限防超大结果集卡死。 */
const ROW_JSON_MAX = 500;
const derivedJsonHtml = computed<string | undefined>(() => {
  const cols = props.cols ?? [];
  const all = props.rows ?? [];
  if (!cols.length || !all.length) return undefined;
  const rows = all.slice(0, ROW_JSON_MAX).map(r => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
  const payload = all.length > ROW_JSON_MAX
    ? { note: `仅显示前 ${ROW_JSON_MAX} 行（共 ${all.length} 行）`, rows }
    : rows;
  return highlightJson(JSON.stringify(payload, null, 2));
});
const effJsonHtml = computed(() => props.jsonHtml ?? derivedJsonHtml.value);
/* 1439：工具栏按钮只问「这档有没有数据」，不要为了出按钮而提前把 200×23 行
   拼成 JSON 高亮 HTML（首屏一次 ~40-60ms）。真正的内容等切到该档再算（computed 懒求值）。 */
const rowsDerivable = computed(() => !!(props.cols?.length && props.rows?.length));
const altJsonAvailable = computed(() => props.jsonHtml != null || rowsDerivable.value);
const altTreeAvailable = computed(() => props.treeData != null || rowsDerivable.value);
const altCardAvailable = computed(() => props.cardHits != null || (!props.treeData && rowsDerivable.value));
/* 1356：rows 通道也要有 Tree / 卡片两档——此前只有 hits 型宿主（DQ/IH）会传
   treeData/cardHits，SQL 桌面的 rows 结果永远只有「表格 / JSON」两档，用户看到的是
   「同一张表，换个页面就少两种看法」。这里在**内核内**由 cols+rows 派生（任何 rows 宿主
   自动获得，不用每页各写一份）：文档 = {_id: 行号, ...列名: 值}。
   行号用 1 起（与表格 # 列一致），列名缺失时退回 c{j}（空列名/表达式列的兜底）。 */
const derivedRowDocs = computed<Record<string, unknown>[] | undefined>(() => {
  const cs = props.cols;
  const rs = props.rows;
  if (!cs?.length || !rs?.length) return undefined;
  const keys = cs.map((c, j) => (c && String(c).trim() ? String(c) : 'c' + j));
  return rs.map((r, i) => {
    const o: Record<string, unknown> = { _id: String(i + 1) };
    keys.forEach((k, j) => { o[k] = r?.[j] ?? null; });
    return o;
  });
});
const effTreeData = computed(() => props.treeData ?? derivedRowDocs.value);
/* 卡片档要 {_id, _source}：_source 就是这一行本身（不含 _id 冗余） */
const derivedCardHits = computed<Hit[] | undefined>(() => {
  const docs = derivedRowDocs.value;
  if (!props.treeData && docs) return docs.map(d => {
    const src: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) if (k !== '_id') src[k] = v;
    return { _id: String(d._id), _source: src } as unknown as Hit;
  });
  return undefined;
});
const effCardHits = computed(() => props.cardHits ?? derivedCardHits.value);
/* 文档导航条的数据源：hits 型用宿主 hits，rows 型用派生行（两者都只在有数据时非空） */
const effDocs = computed<Array<{ _id?: unknown }> | undefined>(() => props.hits?.length ? props.hits : derivedRowDocs.value);
const effDocIds = computed<string[] | undefined>(() => effDocs.value?.map((d, i) => String(d?._id ?? i + 1)));
/* 1439：alt 视图的「打开文档」在 rows 通道也要有落点——此前 emit 出去没人接
   （SQL 宿主未监听），与查询树/索引工作区同位置的开文档动作点了没反应。
   rows 派生文档没有 ES _id：按**原始行**开 QRT 的「行详情」侧拉（rowDrawer 开启时）；
   宿主自带 hits/treeData/cardHits/jsonHtml 时仍是宿主数据，意图原样透传。 */
const altDocsDerived = computed(() => !props.hits?.length && props.treeData == null && props.cardHits == null && props.jsonHtml == null);
/* rows 派生档的单文档渲染：JSON/Tree 一次只铺当前文档。此前 100 行×百列会把
   全部文档一次 JSON 高亮/建树，切一次档主线程阻塞数秒（产线实报「切数据格式特别卡」）；
   导航游标受控（v-model:doc-index），游标变了只重算那一份。 */
const altDocIdx = ref(0);
watch(() => effDocs.value, () => { altDocIdx.value = 0; });
const altDocJsonHtml = computed(() => {
  if (!altDocsDerived.value) return undefined;
  const d = effDocs.value?.[altDocIdx.value];
  return d ? highlightJson(JSON.stringify(d, null, 2)) : '';
});
const altDocTreeData = computed(() => {
  if (!altDocsDerived.value) return undefined;
  const d = effDocs.value?.[altDocIdx.value];
  return d ? [d] : [];
});
function openAltDocAt(i: number) {
  if (altDocsDerived.value && props.rowDrawer) { rdwRow.value = { ri: i, raw: true }; return; }
  const d = effDocs.value?.[i];
  if (d) emit('open-doc', d as unknown as Hit);
}
function openAltCardDoc(hit: Hit) {
  if (altDocsDerived.value && props.rowDrawer) {
    const i = Number(hit?._id);
    if (Number.isFinite(i) && i > 0) { rdwRow.value = { ri: i - 1, raw: true }; return; }
  }
  emit('open-doc', hit);
}
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
  if (v === 'json' && !altJsonAvailable.value) return 'table';
  if (v === 'tree' && !altTreeAvailable.value) return 'table';
  if (v === 'cards' && !altCardAvailable.value) return 'table';
  return v;
});
const bodyHidden = computed(() => props.hideBody === true || (viewSegOn.value && effView.value !== 'table'));
/* alt 档滚动位归零：滚动容器是宿主 .qrt-alt-body.scroll-y，组件根（pre/树体）自身不滚——
 切档、新一轮结果、单文档游标切换都把容器归零，避免 JSON 从中段开始（DQ/IH 同判据） */
const altJsonBox = ref<{ preEl: HTMLElement | null } | null>(null);
const altTreeBox = ref<{ treeEl: HTMLElement | null } | null>(null);
watch([effView, () => props.hits, altDocIdx], () => {
  nextTick(() => {
    const el = (effView.value === 'json' ? altJsonBox.value?.preEl : effView.value === 'tree' ? altTreeBox.value?.treeEl : null)?.parentElement;
    if (el) el.scrollTop = 0;
  });
});
/* 卡片档 AltHitsViews SearchHit 契约桥——本地 Hit._score 可选，补缺省 null（结构补全非类型断言） */
const cardHitsAdapted = computed(() => effCardHits.value?.map(h => ({ ...h, _score: h._score ?? null })));

/* hideBody→true 自动退出聚焦（RT rtFix552 对称件平移）——宿主切走
 表格视图（JSON/Tree 档）时聚焦面不能悬在隐藏表体上。只在 false→true 流转且聚焦中触发
 （immediate 缺省不触发，初始 hideBody=true 挂载零影响）。⚠声明必须在 props 之后
 （watch getter 注册即收集依赖，前置会 TDZ ReferenceError——W6 实报同款课）。
 watch 源升 bodyHidden（hideBody ∪ 内建非表格档）——内建档切换同样自动退
 聚焦，561 语义对 alt 档全覆盖 */
watch(bodyHidden, h => { if (h && focused.value) focused.value = false; });

/* 内建分页事件——只上报意图，取数/切片由宿主接线（LuceneQueryView 远端分页先例）；
 W-B：selection-change=selectable 行多选通道（rows=选中行原始行对象数组） */
const emit = defineEmits<{
  (e: 'update:page', p: number): void;
  (e: 'update:pageSize', s: number): void;
  (e: 'selection-change', rows: unknown[]): void;
  /* remoteSort 远端排序意图（只 emit 不取数；null=取消排序回宿主原始序；
 载荷方向归一 'asc'|'desc'——与 RT 同一公共契约，内核内 SortKey 形态差异在 emit 收口转换） */
  (e: 'sort-change', s: { f: string; d: 'asc' | 'desc' } | null): void;
  /* W3：refreshable 刷新意图（对齐 RT 既有事件名；取数归宿主） */
  (e: 'refresh'): void;
  /* 内建卡片档开文档意图透传（AltHitsViews @open-doc 桥，弹窗/取数归宿主） */
  (e: 'open-doc', hit: Hit): void;
  /* 1126：结果值下钻意图（rows 型）——field/value/type 原样给宿主，SQL 改写归宿主 */
  (e: 'use-as-condition', p: { field: string; value: unknown; type?: string; not?: boolean }): void;
  /* 1132：结果区按列排序并改 SQL 重查（与本地表头排序区分） */
  (e: 'sort-by', p: { field: string; dir: 'asc' | 'desc' }): void;
}>();

/* _source 扁平字段与固定元列重名时跳过，避免与首列 _id/_index/_score 撞列 */
const META = ['_id', '_index', '_score'];

const store = useAppStore();
/* _index 格跳转芯片——router 在无路由测试环境为 undefined，gotoIndex 内护栏 */
const router = useRouter();

const isHits = computed(() => props.hits != null);

/* 内建分页渲染判定——page/pageSize/total 三参齐备才出分页行（可选 prop 缺省零破坏）。
 T3②：pagerInHead 开启时底部独立分页行退役（互斥合并在本判定——qrt-pgr 行
 v-if 字面有 rtFix552 源码锁逐字钉死，锚不动改判定）；迁头档判定见 pagerHeadOn */
const pagerOn = computed(() => props.pagerInHead !== true && props.page != null && props.pageSize != null && props.total != null);
/* T3②：迁头档判定——pagerInHead=true 且三参齐备，内建 Pagination 寄居工具行
 bar-left（RT :25 同款；prefsOn 主壳与独立壳分支双挂载，v-if 互斥渲染，无 storageKey 通道同样可达） */
const pagerHeadOn = computed(() => props.pagerInHead === true && props.page != null && props.pageSize != null && props.total != null);
const pagerPage = computed(() => props.page ?? 1);
const pagerSize = computed(() => props.pageSize ?? 20);
const pagerTotalPages = computed(() => Math.max(1, Math.ceil((props.total ?? 0) / Math.max(1, pagerSize.value))));

/* 有任一类型映射才启用双层列头（SQL 通道/未接线消费方保持单层）。
 Lead 裁决扩权（解除 「无映射整体单层零增量」承诺——SQL 通道白得徽标
 是收益）：显式映射 ∪ 按值采样推断非空即启用；hit 型 inferredTypes 恒空零增量 */
const hasTypes = computed(() =>
  (!!props.fieldTypes && Object.keys(props.fieldTypes).length > 0)
  || Object.keys(inferredTypes.value).length > 0);

/* ═══ W-D：契约四件套（rowClass / exportName+exportCell / 按值语义档 / #cell-<key> 槽）═══ */
/* ── 按值语义档：rows 型且列未提供显式类型时的采样推断——前 20 行内
 ISO 日期形态占比 ≥50% 判 'date'、数值形态（允许千分位/百分比后缀）占比 ≥50% 判 'double'。
 与显式 fieldTypes 按列合并、显式优先；只作语义行为档（数值右对齐/千分位、date 本地化、
 区间筛选、列统计口径），双层列头徽标仍以显式 fieldTypes 为准（171/口径不动）。
 消费端 SqlBridge brColTypes 胶水退役后由本档兜底。 ── */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUM_SHAPE_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const inferredTypes = computed<Record<string, string>>(() => {
  if (isHits.value) return {};
  const cols = props.cols ?? [];
  const sample = (props.rows ?? []).slice(0, 20);
  const out: Record<string, string> = {};
  cols.forEach((c, ci) => {
    let date = 0, num = 0, total = 0;
    for (const r of sample) {
      const v = r[ci];
      if (v === null || v === undefined || v === '') continue;
      total++;
      if (typeof v === 'number') num++;
      else if (typeof v === 'string') {
        if (ISO_DATE_RE.test(v)) date++;
        else if (NUM_SHAPE_RE.test(v)) num++;
      }
    }
    if (total > 0 && date / total >= 0.5) out[c] = 'date';
    else if (total > 0 && num / total >= 0.5) out[c] = 'double';
  });
  return out;
});
/* 类型读取收口：显式 fieldTypes 优先，缺列回落采样档（语义行为统一走此函数） */
function effType(col: string): string | undefined {
  return props.fieldTypes?.[col] ?? inferredTypes.value[col];
}
/* ColPicker 列选弹层类型徽标透传（工蚁3 契约 prop `types`）——
 显式 fieldTypes ∪ 按值采样推断（显式优先），与列头徽标 effType 同一读取口径；
 空对象=弹层无徽标（零增量向后兼容） */
const cpTypes = computed<Record<string, string>>(() => ({ ...inferredTypes.value, ...props.fieldTypes }));
/* ── 行级条件色档：返回值追加到数据行 tr class（空格拼接）；undefined/null/空串跳过 ── */
function rowCls(row: any, ri: number): string | undefined {
  const c = props.rowClass?.(row, ri);
  return c || undefined;
}
/* ── 导出加工：exportCell 管道收口（缺省恒等=现状零变化；仅矩阵管道消费，显示不受影响）── */
function xCell(v: unknown, key: string, row: any): unknown {
  return props.exportCell ? props.exportCell(v, { key }, row) : v;
}
/* ── 富单元格作用域槽 #cell-<key>（只落机制）：命中即完全接管该格内容渲染，
 无槽走既有语义渲染链；行尾悬浮钮/跳转芯片/row-actions 不受影响 ── */
const slots = useSlots();
const cellSlotName = (col: string) => 'cell-' + col;
function hasCellSlot(col: string | undefined): boolean {
  return !!col && !!slots[cellSlotName(col)];
}
/* 最后一列由宿主动作槽接管（BrowserView「操作」列）：内建行尾复制/展开钮退役，
   否则 absolute 右缘按钮压在宿主动作钮上造成遮挡与「点了没反应」。 */
const lastColHasCellSlot = computed(() => hasCellSlot(shownCols.value[shownCols.value.length - 1]));
/* T3①：bar-prepend 槽在场判定——槽脱 prefsOn 门控（无 storageKey 通道仍可
 寄居视图切换 seg/分页器，「翻页、展示形式统一在表格头」收尾），独立壳分支渲染条件之一；
 无槽且无迁头档时该分支不渲染（缺省零增量） */
const hasPrepend = !!slots['bar-prepend'];

/* W-B：quickFilter 生效且过滤后 0 行 → 并入空态链（EmptyState 文案/hint
 仍走既有 emptyText/emptyHint props，字面零改）；不传 quickFilter 时此路恒 false=现状 */
const isEmpty = computed(() => {
  if (isHits.value ? !props.hits!.length : !props.rows!.length) return true;
  return quickActive.value && quickRows.value.length === 0;
});

/* 列：hit 型 = 固定前缀（有则显示）+ _source 键并集（按首次出现顺序）；rows 型 = cols 直出 */
const columns = computed<string[]>(() => {
  if (!isHits.value) return props.cols ?? [];
  const src = props.hits ?? [];
  const keys: string[] = [];
  for (const h of src) {
    for (const k of Object.keys(h._source ?? {})) {
      if (!META.includes(k) && !keys.includes(k)) keys.push(k);
    }
  }
  const prefix: string[] = ['_id'];
  if (src.some(h => h._index != null && h._index !== '')) prefix.push('_index');
  if (src.some(h => h._score != null)) prefix.push('_score');
  return [...prefix, ...keys];
});

/* ═══ 偏好记忆（列选/密度/列宽）——storageKey 缺省即整体关闭 ═══ */
const dimension = computed(() => props.storageKey || null);
/* 1141：工具行门控——记忆维度开启 或 宿主显式开内存态工具行（tableBar）。
 两者都关=既有零增量形态（SQL 等通道原样虚拟，工具行不出）。
 落盘面仍只认 storageKey：内存态下列选/列宽/冻结/预设/排序记忆全部不落盘。 */
const barOn = computed(() => !!props.storageKey || props.tableBar);
const {
  on: prefsOn, rowH, setRowH, rowHLabel, cycleRowH,
  visibleCols, colWidths,
  colStyle, startResize, resetColWidths,
  /* rows 型转置（RT 同款内核）——useTablePrefs 自带记忆（es_tbl_transpose:*），
 无 storageKey（SQL 通道）自动退化为内存态、不落盘 */
  transpose, toggleTranspose,
  transposeN, setTransposeN, transposeNs,
  freezeN, setFreezeN, freezeFirst, toggleFreezeFirst,
  presets, savePreset, applyPreset, deletePreset, /* ：消费面接线（652 内核三操作+名册） */
} = useTablePrefs(dimension, columns, {
  /* 宿主可传 defaultCols 作默认可见列全集（如审计表新增「集群」列后
 不被前 8 列启发式藏掉尾列）；缺省维持前 8 列启发式，既有表零感知 */
  defaultVisibleCols: () => (props.defaultCols?.length ? [...props.defaultCols] : undefined),
  skipColsMemory: !!props.skipColsMemory,
});
/* rows 型转置态（hit 型不提供——RT 转置语义即「字段为行、文档为列」的镜像，
 rows 型对位为「列名为行、前 N 行为列」）；转置渲染行集=排序后前 N 行 */
const transposeOn = computed(() => !isHits.value && transpose.value);
const transposeRows = computed<any[][]>(() => sortedRows.value.slice(0, transposeN.value));
const transposeCount = computed(() => Math.min(transposeN.value, sortedRows.value.length));
/* 渲染列 = 记忆启用时取 visibleCols 子集，关闭时全列（现状行为不变） */
/* 1137：无 storageKey 的内存态也走 visibleCols（默认全列）——SQL 结果可隐藏/拖排/置首，
   但每次重挂载回到全列且不落盘；有 storageKey 仍按记忆列集。 */
const shownCols = computed<string[]>(() => (visibleCols.value.length ? visibleCols.value : columns.value));
const hiddenColCount = computed(() => Math.max(0, columns.value.length - shownCols.value.length));
function resetVisibleCols() { visibleCols.value = [...columns.value]; }
/* P2-4：前缀多列冻结（RT 同款；基数 52px=序号列）。
 装配合并 useColFit.frozenStyleOf 单源（RT 同源；基数 52 以常参注入、
 1141：门控从 prefsOn 放宽到 barOn——内存态工具行（SQL 等）也能用冻结，
 冻结列数仍在内存里（不落盘：useTablePrefs 维度关闭时 setFreezeN 只改 ref）。 */
const isFrozenCol = (c: string) => barOn.value && visibleCols.value.indexOf(c) > -1 && visibleCols.value.indexOf(c) < freezeN.value;
function frozenStyle(col: string): Record<string, string> | undefined {
  return frozenStyleOf(visibleCols.value, colWidths.value, col, freezeN.value, 52, barOn.value) ?? colStyle(col);
}

/* 原始行矩阵（未排序）：hit 型按列取元字段/source 字段，缺值落 null；rows 型切片直出 */
const rawRows = computed<any[][]>(() => {
  if (!isHits.value) return (props.rows ?? []).map(r => r.slice());
  return (props.hits ?? []).map(h =>
    columns.value.map(col => {
      switch (col) {
        case '_id': return h._id ?? null;
        case '_index': return h._index ?? null;
        case '_score': return h._score ?? null;
        default: return (h._source ?? {})[col] ?? null;
      }
    })
  );
});

/* 单元格格式化：空值 '-'，对象/数组 JSON.stringify，其余 String */
function fullText(v: any): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* 展示态截断 + title 全文（对象长 JSON 不撑爆表格） */
const MAX_CELL = 160;
function cellText(v: any): string {
  const s = fullText(v);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) + '…' : s;
}

/* 排序状态机（合并 composables/tableSort.useSortChain 单源——大件，
 原 1|-1 数字机退役归一字符串机；:m 落盘 M2 写侧本就归一字符串=零格式漂移）。
 同键翻转换键升序起步（ M2 两表同向）/排序键用列名（28 批）/Shift 次键链 ≤3（/
 右键直选/远端意图镜像（535）/syncSort 回填（552）/维度落盘（storageKey 维度，无
 storageKey 不读不写零增量）全机单一出处；此处只留守卫薄壳、行序应用点与展开态清理钩子
 （坐标键随行序变化一并清，rows 型无稳定 _id）。 */
const chain = useSortChain({
  lsBase: () => (props.storageKey ? 'es_tbl_sort:' + props.storageKey : null),
  isRemote: () => props.remoteSort,
  syncWired: () => props.syncSort !== undefined,
  emitIntent: (s) => emit('sort-change', s),
  onLocalChange: () => { expandedCells.value = new Set(); expandedRows.value = new Set(); },
  notify: (m) => store.notify('warning', m),
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
/* 回填 watch：有值=回填镜像（1|-1 归一在机内）；null=清态（箭头+循环基点同清，此后点击
 asc 重启）；undefined=未接线不生效零增量。回填只动显示态镜像，sortSpec/行序/落盘零触碰
 （538 口径不变）。immediate：宿主携态挂载（记忆恢复）首渲即回显。 */
watch(() => props.syncSort, (s) => {
  if (s === undefined || !props.remoteSort) return;
  chain.applySync(s);
}, { immediate: true });
/* 件②：显式非语义列排序抑制（ tableSort.sortableGuard 单源出口接线，
 531 遗留件③消费面收口）——binary 等 18 型+_source 列点击排序语义 VOID，入口短路不落态；
 _id/_index/_score/_seq_no 排序有语义豁免（semanticGuard 口径）。effType 同 useColStats
 fieldType 先例（显式 fieldTypes ∪ 按值采样推断，无类型列不抑制——零增量缺省）。 */
const sortGuard = sortableGuard((c) => effType(c));
/* 1376：远端档可排性预检（RT 同款单源）——宿主在 sort-change 里用 resolveSortField
 裁决，内核若先推箭头再被宿主拒绝，就留下「箭头亮了、数据没动」的暗状态。
 effType 会把采样类型也算进来，这里只认显式 mapping（宿主下发 sort 的裁决依据）。 */
function remoteSortBlocked(c: string): boolean {
  if (!props.remoteSort) return false;
  const r = resolveSortField(c, props.fieldTypes);
  if (r.ok) return false;
  store.notify('warning', r.reason || '该列不支持排序');
  return true;
}
function onSort(i: number, shift = false) {
  if (!props.sortable) return;
  if (qDragClickSuppressed()) return; /* ：拖完 300ms 内的误触排序点击抑制（RT 同款双保险） */
  const name = shownCols.value[i];
  if (!name) return;
  /* 件②：显式非语义列短路（本地/remote 双档同守——不落 sortSpec/不落盘/
 不 emit 远端意图；sortKey/indicator 零触碰） */
  if (!sortGuard(name)) return;
  if (remoteSortBlocked(name)) return;
  /* remote 档机内只 emit 意图不改本地序（多键链是本地特性，塌缩单键）；
 本地档变更经 onLocalChange 钩子清展开态（W7：坐标键随行序变化一并清，rows 型无稳定 _id） */
  chain.sortBy(name, undefined, shift);
}
/* 列头右键排序直选（dbx 语义——升/降分开，免循环猜测）。
 直选与表头点击共用同一收口；：方向 1|-1 归一后委托状态机
 （等值单键 no-op/远端直发意图/展开态清理全在机内） */
function directSort(col: string, ci: number, dir: 1 | -1) {
  if (!props.sortable) return;
  if (remoteSortBlocked(col)) return;
  chain.sortBy(col, dir === 1 ? 'asc' : 'desc');
}
/* G149：列头 th 悬浮 title 单源——colTips 有该列中文语义时两段拼接
 （中文语义+换行+内建排序/列管理提示），无 tip=纯内建提示（缺省零增量） */
function thTitle(c: string): string {
  /* 1192：本地排序的**作用域**必须说清。表头点击走 chain.sortBy（纯前端），
     只排「已加载的这几行」；分页/游标通道（SQL、Lucene…）看到的结果可能远多于这些行，
     旧文案只说「点击排序」等于承诺了全量序。SQL 侧早有「仅作用于已加载 N 行」的诚实标注，
     这里把同一口径下沉到内核：只有确实存在未加载行时才加这句（已全量加载不加，避免噪音）。 */
  const loaded = props.hits?.length ?? 0;
  /* 1402：远端档的排序是服务端全量序（Lucene 已接线），不能再挂「仅排已加载 N 行」的
 前缀——那句话会让用户以为跨页顺序不会变。本地档才成立。 */
  const partial = props.sortable && !props.useAsCondition && !props.remoteSort
    && Number(props.total ?? 0) > loaded;
  const scopeNote = partial ? '（仅排序已加载的 ' + loaded + ' 行，全部结果请改查询侧排序）' : '';
  const base = props.sortable
    ? props.useAsCondition
      ? '点击本地排序：升序 → 降序 → 取消（不改 SQL）；Shift+点击：追加/翻转次键；右键：列管理 / 按此列升序或降序并重查（改 SQL）；拖列名可重排'
      : props.remoteSort
      /* 1402：远端档必须说清「换页也跟着排」——否则用户会以为只是排眼前这几行 */
      ? '点击排序：升序 → 降序 → 取消（按服务端排序重查，跨页一致）；右键：列管理 / 按此列升序或降序并重查；拖列名可重排'
      /* 基础串逐字保留（1134 以字面量锁「DSL 命中/普通只读表提示零变化」），
         作用域说明只作**后缀**追加——不破坏既有契约，也不改宽表默认文案。 */
      : '点击排序：升序 → 降序 → 取消（回原始序）；Shift+点击：追加/翻转次键；拖列名可重排；右键：列管理' + scopeNote
    : '右键：列管理；拖列名可重排';
  const tip = props.colTips?.[c];
  const type = effType(c);
  const head = type ? type + ' · ' + c : c;
  return [tip, head, base].filter(Boolean).join('\n');
}
function sortInd(i: number): string {
  /* 未排序列常驻 ⇅ 弱提示（对齐 RT dbx 语言），激活显示实色单箭头；
 链内列箭头+多键序号角标 */
  const c = shownCols.value[i];
  if (!chainHas(c)) return '⇅';
  return chainDir(c) === 'desc' ? '↓' : '↑';
}
/* ═══ ：列头筛选漏斗（dbx 每列筛选——去重值勾选过滤，纯前端当前结果集，
 与 ES 查询互补；多列 AND 组合；不持久化，切维度/隐藏列自动清）。
 P0-4：实现下沉共享 useColFilters（RT 同款接入补齐 「RT 待合并」欠账），
 QRT 行为零变化（qrtColFilter.spec 回归锁）；增强=每值计数/值内搜索/基数降级 200 ═══ */
/* 列拖拽重排（RT P1-6 同款合并，useColDrag 本就 RT/QRT 共用）——
 1141：barOn 门控（内存态工具行同样可拖；落点写 visibleCols，
 有 storageKey 才由 useTablePrefs watch 落盘，内存态不落盘） */
const { dragCol: qDragCol, overCol: qDragOver, overPlace: qDragPlace,
  onDragStart: qOnDragStart, onDragOver: qOnDragOver, onDrop: qOnDrop, onDragEnd: qOnDragEnd,
  isClickSuppressed: qDragClickSuppressed } = useColDrag({
  cols: visibleCols,
  frozenFirst: () => barOn.value && freezeFirst.value,
});
/* 列取值收口——rawRows 二维行按列名取坐标（筛选/列详情统计/整表复制三处共用） */
function qColVal(row: any[], col: string): any {
  const i = columns.value.indexOf(col);
  return i >= 0 ? row[i] : undefined;
}
const filters = useColFilters({
  rows: () => rawRows.value,
  getVal: (row, col) => qColVal(row, col),
  labelOf: (v) => v === null || v === undefined ? '∅' : fullText(v),
  cols: () => shownCols.value,
  onAutoClear: () => { expandedCells.value = new Set(); },
});
const { colFilters, rangeFilters, containsFilters, normVal, activeFilterCount, toggleFilterVal, setRangeFilter, rangeOn, containsOn, setContainsFilter, clearFilter, clearAllFilters } = filters;
const filterLabel = filters.labelOf;
/* 漏斗激活高亮并集口径——等值勾选 ∪ 区间 ∪ 包含（任一生效即点亮） */
function funnelOn(c: string): boolean {
  return !!(colFilters.value[c]?.length || rangeOn(rangeFilters.value[c]) || containsOn(c));
}
/* 筛选变化连带清展开态（坐标键防错位；合并前由三处各自清，等价收口为一处） */
watch(colFilters, () => { expandedCells.value = new Set(); expandedRows.value = new Set(); }, { deep: true });
const filterPop = ref<{ col: string; x: number; y: number } | null>(null);
/* 值内搜索词（弹层打开即从空开始；关闭随 filterPop 一并复位）。
 值分布/mini-bar 归一/碰撞定位随壳合并 ColFilterPopover，此处只留开层状态 */
const filterKw = ref('');
const fvals = computed(() => filters.filterVals(filterPop.value?.col ?? '', filterKw.value));
function openFilter(e: MouseEvent, col: string) {
  filterKw.value = '';
  filterPop.value = { col, x: e.clientX, y: e.clientY };
}

/* ═══ W3：filterMode 跨列筛选组合档 ═══
 prop 播种运行档（缺省 'AND'）；筛选弹层/提示行切换钮就地翻转；prop 变化跟随播种。
 管线在 useColFilters.filterRows（mode 参数收口，缺省 'AND' 逐字节不变）。
 三件套合并 useColFilters.useFilterMode 单源（RT 同款接线）。 */
const { filterModeLive, toggleFilterMode } = useFilterMode(props);
/* 过滤管线：多列 AND（缺省）；OR 档=任一筛选列命中即保留；每列空选集=该列不过滤（composable 内置） */
const filteredRows = computed(() => filters.filterRows(rawRows.value, filterModeLive.value));

/* ═══ W-B：quickFilter 跨可见列 contains 过滤 ═══
 与既有列筛选 AND 叠加（filterRows 之后追加，不改 useColFilters 管线）；
 匹配口径=可见列显示全文（fullText）小写包含；不传/空白=恒等回落（零增量）。
 生效且 0 行 → isEmpty 并入空态链（EmptyState 文案零改，hint 走既有 emptyHint）；
 生效且有行 → 列筛选 0 行仍走既有 qrt-nomatch 行（两链互不侵占）。
 W3：取词收口改走 quickFilterEff——非 searchable 档恒等于 props.quickFilter
 （既有通道逐字节回落）；searchable 档内建输入框非空以输入为准、空输入回落外部播种值。 */
const searchableKw = ref('');
const quickFilterEff = computed<string | undefined>(() => {
  if (!props.searchable) return props.quickFilter;
  const k = searchableKw.value.trim();
  return k || props.quickFilter;
});
const quickActive = computed(() => !!(quickFilterEff.value && quickFilterEff.value.trim().length > 0));
/* 过滤装配合并 useColFilters.quickFilterRows 单源（RT 同款接线）——
 匹配口径=qColVal + fullText（RT 是 getSourceVal + rtCellFullText），getVal/fullOf
 参数化保两内核行为差；空白词恒等回落（同引用）在单源内保真 */
const quickRows = computed(() =>
  quickFilterRows(filteredRows.value, quickFilterEff.value, shownCols.value, (row, c) => qColVal(row, c), fullText));

const sortedRows = computed(() => {
  if (!props.sortable || !sortSpec.value.length) return quickRows.value;
  const spec = sortSpec.value.map(k => ({ i: columns.value.indexOf(k.f), mul: k.d === 'asc' ? 1 : -1 }));
  if (spec.some(s => s.i < 0)) return quickRows.value;
  return quickRows.value.slice().sort((a, b) => {
    for (const { i, mul } of spec) {
      const av = a[i]; const bv = b[i];
      /* parseFloat 双试退役合并 tableSort.compareVals 单源——千分位
 （'1,300' 此前 parseFloat 截断为 1）/单位/科学计数/时长（ms|s）按值纠错；
 沉底档（null/undefined/''）方向无关恒沉底（对齐 RT :1094-1096 既有语义），非空档乘方向 */
      const blank = av == null || av === '' || bv == null || bv === '';
      const r = compareVals(av, bv);
      if (r !== 0) return blank ? r : r * mul;
    }
    return 0;
  });
});

/* ═══ M4：渲染截断保护（RT 同款补齐——此前 QRT 无护栏，
 消费方传大结果集即万行 DOM 拖死交互）。渲染/键盘导航/右键取行走 renderRows（所见即所操作）；
 导出（getCsvBlock/getSortedRows）仍走全量 sortedRows，与 RT「导出不受截断影响」同口径 ═══
 W-A：内核逻辑随壳合并 useRenderMore（RT 同构段单一出处）——MAX_RENDER/
 renderLimit/watch 重置/截断判定/renderMore/IntersectionObserver 哨兵（rootMargin 80px）
 全在 composable；此处只接线（sortedRows 行源 + rootEl IO 根惰性 getter，规避声明序 TDZ），
 模板截断行/文案/按钮保位不动（autoRenderMore446/qrtRenderMore303 锚同步更新内核接线+composable）。 */
const { rows: renderRowsRaw, truncated: renderTruncated, renderMore, truncSentinel } =
  useRenderMore(() => sortedRows.value, () => rootEl.value);
/* P0：列选清单（visibleCols 持久化）与 rows 列数解耦时，tbody td 按 row 全量
 渲染会多出「无表头列」——产线实报 Diag 节点表末两列无列名（diag:nodes 清单 8 列 vs
 ND_COLS 10 列，多出的 td 列名查 undefined → semFormat percent/判秒误推断出 0%/120.1s）。
 修正：截齐改「按 shownCols 投影」——row 下标空间=columns（qColVal 同源），
 按数量 slice 在隐藏列交错（非后缀）时会切错位+值串列（88 批排序列隐藏自愈挂载态实证）。
 恒等态（shownCols≡columns）返回原数组直通：行对象引用匹配（rawIdxMap/rawIdxOf）零损耗；
 行索引不变=rowClass/展开/键盘导航零影响；导出走 sortedRows 全量不受投影影响。 */
const renderRows = computed<any[][]>(() => {
  const cols = columns.value;
  const shown = shownCols.value;
  if (shown.length === cols.length && shown.every((c, i) => c === cols[i])) return renderRowsRaw.value;
  const idxs = shown.map(c => cols.indexOf(c));
  return renderRowsRaw.value.map(r => idxs.map(ix => (ix >= 0 ? r[ix] : undefined)));
});

/* ═══ 1366：Ctrl/Cmd+点击单元格 = 数值聚合（RT 同款能力对齐）═══
 SQL 结果表此前只有表尾「聚合行」开关（整列聚合），缺 RT 的**手挑单元格**聚合：
 运营在 SQL 结果里常要「这几格加起来是多少」（多笔金额、几个分片计数），
 而 QRT 没有任何散选通道。键用渲染坐标 ri:ci（排序/筛选会重排，渲染坐标即所见坐标）。 */
const aggCells = ref<Set<string>>(new Set());
const aggCellKey = (ri: number, ci: number) => ri + ':' + ci;
const isAggCell = (ri: number, ci: number) => aggCells.value.has(aggCellKey(ri, ci));
function toggleAggCell(ri: number, ci: number) {
  const k = aggCellKey(ri, ci);
  if (aggCells.value.has(k)) aggCells.value.delete(k);
  else aggCells.value.add(k);
  aggCells.value = new Set(aggCells.value);
}
const aggCellStats = computed(() => {
  if (!aggCells.value.size) return null;
  const vals: number[] = [];
  for (const k of aggCells.value) {
    const [ri, ci] = k.split(':').map(Number);
    const v = renderRows.value[ri!]?.[ci!];
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  }
  return { picked: aggCells.value.size, ...summarize(vals) };
});
function clearAggCells() { aggCells.value = new Set(); }
/* 行/列集合变化后悬空的格子要清掉（否则页脚还在报已消失单元格的和） */
watch([() => renderRows.value.length, () => shownCols.value.length], () => clearAggCells());


/* ═══ W-B：行多选通道（selectable）═══
 身份=原始行集索引（渲染行对象与 rawRows 元素同引用：filteredRows/sortedRows 均保引用，
 排序只动副本数组序）；emit('selection-change') 上报原始行对象（hit 型=hit、rows 型=矩阵行）；
 表头全选口径=当前视图全量（sortedRows）；与 rowClass/分页（pagerDisabled 契约不变）并存；
 缺省 selectable=false → 无勾选列 DOM、无事件（零增量）。 */
const selSet = ref<Set<number>>(new Set());
const rawIdxMap = computed(() => {
  const m = new Map<any, number>();
  rawRows.value.forEach((r, i) => m.set(r, i));
  return m;
});
function rawIdxOf(ri: number): number | undefined {
  /* 渲染投影层（renderRows）与行源（renderRowsRaw）按 ri 一一对应，选中身份
 取行源原引用——列选隐藏（投影拷贝行）下勾选通道不再依赖渲染行引用 */
  const row = renderRowsRaw.value[ri];
  return row ? rawIdxMap.value.get(row) : undefined;
}
function isSelRow(ri: number): boolean {
  const i = rawIdxOf(ri);
  return i != null && selSet.value.has(i);
}
function emitSelection() {
  const out: unknown[] = [];
  for (const i of [...selSet.value].sort((a, b) => a - b)) {
    const v = isHits.value ? props.hits?.[i] : (props.rows ?? [])[i];
    if (v !== undefined) out.push(v);
  }
  emit('selection-change', out);
}
function toggleSelRow(ri: number) {
  const i = rawIdxOf(ri);
  if (i == null) return;
  const n = new Set(selSet.value);
  if (n.has(i)) n.delete(i); else n.add(i);
  selSet.value = n;
  emitSelection();
}
const allSel = computed(() => {
  if (!props.selectable || !sortedRows.value.length) return false;
  return sortedRows.value.every(row => {
    const i = rawIdxMap.value.get(row);
    return i != null && selSet.value.has(i);
  });
});
/* 1406：全选口径必须说清「已加载」——游标/远端分页下总数可能远大于本次加载行，
 一个「全选」让用户以为选中了全部命中，随后导出/复制就少了数据。RT 早有同款诚实标注。
 moreRows 由宿主显式声明「还有未加载行」（SQL 游标 / 远端分页）；缺省时退回 total 比较，
 两个来源任一成立即按「仅已加载」口径说话。 */
const partialScope = computed(() => props.moreRows === true
  || Number(props.total ?? 0) > (props.rows?.length ?? props.hits?.length ?? 0));
const allSelHint = computed(() => {
  if (!partialScope.value) return '全选/取消全选（当前视图全部行）';
  const n = sortedRows.value.length;
  const total = Number(props.total ?? 0);
  return total > n
    ? `全选/取消全选（仅当前已加载的 ${n} 行；共 ${total} 条，未加载的不在其中）`
    : `全选/取消全选（仅当前已加载的 ${n} 行；结果未取完，未加载的不在其中）`;
});
function toggleAllSel() {
  if (allSel.value) { selSet.value = new Set(); }
  else {
    const n = new Set<number>();
    for (const row of sortedRows.value) { const i = rawIdxMap.value.get(row); if (i != null) n.add(i); }
    selSet.value = n;
  }
  emitSelection();
}
function clearSelRows() {
  selSet.value = new Set();
  emitSelection();
}
/* 反选（RT invertSel 同口径）——口径=当前视图（sortedRows），视图外的行不动：
 用户看到的“全选”就是这一屏，反选也必须只对这一屏成立。 */
function invertSelRows() {
  const view = new Set<number>();
  for (const row of sortedRows.value) { const i = rawIdxMap.value.get(row); if (i != null) view.add(i); }
  const n = new Set<number>();
  for (const i of view) if (!selSet.value.has(i)) n.add(i);
  for (const i of selSet.value) if (!view.has(i)) n.add(i);
  selSet.value = n;
  emitSelection();
}
/* 行集重建（props.rows/hits 换数据）→ 原始索引身份失效，残留勾选会错挂新行——清空；
 仅 selectable 启用且有残留时行动（缺省通道零触碰） */
watch(rawRows, () => {
  if (!props.selectable || !selSet.value.size) return;
  selSet.value = new Set();
  emitSelection();
});
/* selectable 时首列勾选列占位——nomatch/截断/展开行 colspan 联动 +1（缺省值同现状） */
const selSpan = computed(() => shownCols.value.length + 1 + (props.selectable ? 1 : 0));

/* 单元格单击复制全文（对象/数组 JSON），对齐 ResultTable copyCell 口径 */
/* 长值单元格展开——截断值（…结尾）单击=展开/收起全宽多行，
 非截断值单击=复制，与 ResultTable 的冲突消解口径一致。排序点击会清空展开态（坐标键防错位） */
const expandedCells = ref<Set<string>>(new Set());
/* ═══ W7：行内展开详情行（RT 镜像）═══
 rowKey：hit 型用 _id（跨排序稳定）、rows 型/缺 _id 回落 'r'+ri（坐标键，随排序清零）；
 free 多行展开；Esc=全部收起（与 RT 同裁决）；E=焦点行展开（Enter 语义既有不变）。
 声明必须在本文件 immediate watch 之前：挂载期持久化排序与列选不一致时首跑即写
 expandedRows——声明在后会 TDZ ReferenceError（W6 实报打挂 queryTablePrefs） */
const expandedRows = ref<Set<string>>(new Set());
/* 1136：首次拖拽前把当前各列实测宽一次性固化，并让表格按内容宽展开（横向滚动），
   拖动一列不再被 width:100% 重新分配吃掉位移（DBX 式列宽语义）。 */
const tableWidthStyle = computed(() => (
  Object.keys(colWidths.value).length ? { width: 'max-content', minWidth: '100%' } : undefined
));
function beginColResize(e: MouseEvent, col: string) {
  if (!Object.keys(colWidths.value).length) {
    const ths = wrapRef.value ? [...wrapRef.value.querySelectorAll<HTMLElement>('th[data-col]')] : [];
    const measured: Record<string, number> = {};
    for (const th of ths) {
      const name = th.dataset.col;
      const w = th.getBoundingClientRect().width;
      if (name && w > 0) measured[name] = Math.round(w);
    }
    if (Object.keys(measured).length) colWidths.value = measured;
  }
  startResize(e, col);
}

/* 切换记忆维度（storageKey 变化=换索引/换通道）时清展开态——坐标键随行集错位，
 残留展开态会错误命中新结果集同坐标单元格；：同点重读该维度的排序记忆 */
watch(dimension, () => { expandedCells.value = new Set(); expandedRows.value = new Set(); colFilters.value = {}; filterPop.value = null; chain.reload(); });
/* 排序列被列选隐藏则清空排序（所见即所序 T22；27 批 RT 同款，QRT 漏网补齐）。
 immediate：挂载时持久化的排序与列选本就不一致（跨会话残留组合）也要立刻清。
 清排序会改变行序，展开态同点清零（坐标键防错位）。
 链内任一键被隐藏→从链剔除该键（单键=清空），persistSort 同步 :m/:f/:d。
 P0-4：筛选的隐藏列自动清已下沉 useColFilters（cols+onAutoClear 内置守卫）。 */
watch(shownCols, (cols) => { chain.pruneTo(cols); }, { immediate: true });
const cellKey = (ri: number, ci: number) => ri + ':' + ci;
function isExpanded(ri: number, ci: number) { return expandedCells.value.has(cellKey(ri, ci)); }
function toggleExpand(ri: number, ci: number) {
  const k = cellKey(ri, ci);
  const n = new Set(expandedCells.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  expandedCells.value = n;
}
/* W7：行内展开详情行——rowKey/toggle（声明前置见 expandedCells 上方注释） */
function qRowKey(ri: number): string { return rowId(ri) ?? ('r' + ri); }
function toggleRowExpand(k: string) {
  const n = new Set(expandedRows.value);
  if (n.has(k)) n.delete(k); else n.add(k);
  expandedRows.value = n;
}
function qRowObj(ri: number): Record<string, any> {
  const row = renderRows.value[ri] ?? [];
  const o: Record<string, any> = {};
  shownCols.value.forEach((c, i) => { o[c] = row[i] ?? null; });
  return o;
}
/* W7：长 JSON 对象折叠预览（与 RT 同款；数组/空对象不折叠） */
function objChip(v: any): { label: string; n: number } | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (!keys.length) return null;
  const f = v[keys[0]];
  const fs = f == null ? '' : typeof f === 'object' ? JSON.stringify(f) : String(f);
  return { label: keys[0] + ': ' + (fs.length > 24 ? fs.slice(0, 24) + '…' : fs), n: keys.length };
}
function onCellClick(e: MouseEvent | KeyboardEvent, cell: any, ri: number, ci: number) {
  if (cell === null || cell === undefined) return;
  /* 拖选守卫：格内文本拖选松手的 click 不当作单击（展开不抢）；
 1405：框选矩阵松手后的 click 同样不当作单击（否则拖完顺手触发展开） */
  if (e instanceof MouseEvent && (cellGuard.moved(e) || regionSuppressClick)) return;
  /* 1366：Ctrl/Cmd+点击 = 数值聚合（RT 同款「Ctrl+点击单元格加减」）。
     必须在展开之前拦：聚合是显式修饰键动作，不该顺带改视图。 */
  if ((e.ctrlKey || e.metaKey) && typeof cell === 'number') {
    e.preventDefault();
    toggleAggCell(ri, ci);
    return;
  }
  /* 1374：单击自动复制退役——与 RT 同一裁决（原话「单击就复制不对，我本来想复制值进去，
     那不就还要复制一次吗」）：双击的 click 先于 dblclick，自动复制会在「复制外部值→
     双击编辑→粘贴」流里覆盖剪贴板。复制保留显式路径：右键「复制值」、Ctrl+C 复制行、
     行尾悬浮钮、列头「复制整列值」、行详情抽屉「复制整行 JSON」。 */
  if (cellText(cell).length > MAX_CELL || isExpanded(ri, ci)) toggleExpand(ri, ci);
}
const cellGuard = createPressGuard();
function onCellDown(e: MouseEvent) { cellGuard.down(e); }

/* ═══ 1405：拖拽框选矩阵（RT「dbx 灵魂操作」同语义下沉）═══
 左键在格内按下 → 跨格拖动出矩形 → 松开选区；纯点击（无位移）不启动，单击展开/
 Ctrl+点聚合不受影响。选区坐标=渲染坐标（排序/筛选后即所见坐标），
 行集或列集变化即清（坐标键会错挂到新数据上）。 */
const regionAnchor = ref<{ ri: number; ci: number } | null>(null);
const region = ref<{ ri1: number; ri2: number; ci1: number; ci2: number } | null>(null);
let regionSuppressClick = false;
/* 选区身份键：与 expandedCells/cellKey 同格式，供单元格高亮判定 */
const regionKeys = computed(() => {
  const s = new Set<string>();
  const r = region.value;
  if (r) for (let ri = r.ri1; ri <= r.ri2; ri++) for (let ci = r.ci1; ci <= r.ci2; ci++) s.add(cellKey(ri, ci));
  return s;
});
const regionCellCount = computed(() => {
  const r = region.value;
  return r ? (r.ri2 - r.ri1 + 1) * (r.ci2 - r.ci1 + 1) : 0;
});
function isRegionCell(ri: number, ci: number): boolean { return regionKeys.value.has(cellKey(ri, ci)); }
function onRegionStart(e: MouseEvent, ri: number, ci: number) {
  /* 左键才起框选；Ctrl/Cmd 留给数值聚合；右键走菜单 */
  if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
  /* 1408：触屏 tap 会在 pointer 之后补发合成 mousedown——那条路径会把触屏两击刚
 建好的矩形清空（region=null）。同一手势内的合成 mousedown 距 pointerdown 只有几毫秒，
 用时间窗短路；触屏设备接鼠标时（pointerType=mouse）不受影响。 */
  if (lastPointerWasTouch && Date.now() - touchStamp < 700) return;
  regionAnchor.value = { ri, ci };
  region.value = null;
  window.addEventListener('mousemove', onRegionMove);
  window.addEventListener('mouseup', onRegionEnd, { once: true });
}
/* 触屏手势标记：pointerdown(touch) 置 true 并保持到本次手势的合成鼠标事件走完。
 用时间窗兜底（同一手势内合成 mousedown 紧跟 pointerup，远小于 700ms）。 */
let lastPointerWasTouch = false;
let touchStamp = 0;
/* 1408：触屏没有「按下-拖动」语义（拖动=滚动页面），框选必须换一条路——
 长按（500ms）第一格设起点，再点另一格成矩形。只在没有 hover 的设备启用，
 鼠标用户的单击/双击语义零变化。 */
const touchAnchor = ref<{ ri: number; ci: number } | null>(null);
let touchTimer: ReturnType<typeof setTimeout> | null = null;
function cancelTouchTimer() {
  if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
}
function onCellPointerDown(e: PointerEvent, ri: number, ci: number) {
  if (e.pointerType !== 'touch') return;
  lastPointerWasTouch = true;
  touchStamp = Date.now();
  cancelTouchTimer();
  /* 已有起点：这一下就是第二个角 */
  if (touchAnchor.value) {
    const a = touchAnchor.value;
    region.value = {
      ri1: Math.min(a.ri, ri), ri2: Math.max(a.ri, ri),
      ci1: Math.min(a.ci, ci), ci2: Math.max(a.ci, ci),
    };
    touchAnchor.value = null;
    return;
  }
  touchTimer = setTimeout(() => {
    touchAnchor.value = { ri, ci };
    touchTimer = null;
  }, 500);
}
/* 只有「没按满 500ms」才取消——按满后的抬手不该把刚设好的起点抹掉
 （真实触屏 tap 也是 pointerdown→pointerup 紧邻，若抬手即取消就永远设不上） */
function onCellPointerUp() {
  if (touchTimer) cancelTouchTimer();
}
function onRegionMove(e: MouseEvent) {
  const a = regionAnchor.value;
  if (!a) return;
  const td = (e.target as HTMLElement | null)?.closest?.('td.qrt-cell') as HTMLElement | null;
  if (!td?.dataset.ri || !td.dataset.col) return;
  const ri = Number(td.dataset.ri);
  const ci = shownCols.value.indexOf(td.dataset.col);
  if (isNaN(ri) || ci < 0) return;
  /* 只有真的换过格（或跨了列）才成立选区——同一格内拖选文字不该弹动作条 */
  if (ri === a.ri && ci === a.ci) { region.value = null; return; }
  region.value = { ri1: Math.min(a.ri, ri), ri2: Math.max(a.ri, ri), ci1: Math.min(a.ci, ci), ci2: Math.max(a.ci, ci) };
}
function onRegionEnd() {
  window.removeEventListener('mousemove', onRegionMove);
  regionAnchor.value = null;
  if (region.value) {
    /* 拖出过矩形：抑制紧随的 click（否则会顺带触发展开/复制） */
    regionSuppressClick = true;
    setTimeout(() => { regionSuppressClick = false; }, 0);
  }
}
function clearRegion() { region.value = null; touchAnchor.value = null; cancelTouchTimer(); }
/* 选区数值摘要（框完即显 Σ/avg，dbx 选区底栏语言）——纯展示，不改数据 */
const regionSummary = computed(() => {
  const r = region.value;
  if (!r) return null;
  const vals: unknown[] = [];
  for (let ri = r.ri1; ri <= r.ri2; ri++) {
    const row = renderRows.value[ri];
    if (!row) continue;
    for (let ci = r.ci1; ci <= r.ci2; ci++) vals.push(row[ci]);
  }
  const nums = vals.filter((v): v is number => typeof v === 'number' && isFinite(v));
  if (!nums.length) return { numCount: 0, count: vals.length, sum: 0, avg: null as number | null };
  const sum = nums.reduce((a, b) => a + b, 0);
  return { numCount: nums.length, count: vals.length, sum, avg: sum / nums.length };
});
async function copyRegionMatrix(fmt: 'tsv' | 'json') {
  const r = region.value;
  if (!r) return;
  const cols = shownCols.value.slice(r.ci1, r.ci2 + 1);
  const rows: any[][] = [];
  for (let ri = r.ri1; ri <= r.ri2; ri++) {
    const row = renderRows.value[ri];
    if (row) rows.push(cols.map((c) => { const ci = shownCols.value.indexOf(c); return row[ci] ?? null; }));
  }
  if (!rows.length) return;
  /* 选区复制是「矩阵片段」：不带表头（用户框的就是这几格），与整表/选中行复制区分开 */
  const text = fmt === 'tsv'
    ? rows.map(r => r.map(v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n')
    : JSON.stringify(rows, null, 2);
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? `已复制选区 ${rows.length} 行 × ${cols.length} 列（${fmt.toUpperCase()}）` : '复制失败');
}
/* 行集/列集变化→选区失效（渲染坐标会错挂新数据） */
watch([() => renderRows.value.length, () => shownCols.value.length], () => { region.value = null; });

/* 大整数（|v|>=1e4 的整数）千分位显示——title/复制仍为原始值；
 epoch 毫秒优先（其自身已是人性化形态），小数与短数字不加工 */
/* P2-1：ES 类型 → 语义色类—— W-A 抽 utils/typeTiers 单一出处
 （RT 同源），本文件 import 引入；样式 .qrt-th-type.rt-ty-* 留本文件 scoped */
/* v3.0.0 场景语义分档：数值列右对齐（有类型映射走类型判定，比 RT 采样法准且零开销）。
 类型读取改走 effType——显式 fieldTypes 优先，缺列回落按值采样档。
 ⚠NUMERIC_TYPES_RE 字面声明保留本文件（semanticTiers500 源码锁 `const NUMERIC_TYPES_RE
 = /^…$/` 字面），与 typeTiers 导出逐字同值；RT 已改引 typeTiers */
const NUMERIC_TYPES_RE = /^(long|integer|short|byte|double|float|half_float|scaled_float|unsigned_long)$/;
function isNumericCol(col: string): boolean {
  const t = effType(col);
  /* 显式非语义类型更早短路（binary/nested 等压过一切；既有白名单序不动） */
  if (t && isNonSemanticType(t)) return false;
  return !!t && NUMERIC_TYPES_RE.test(t);
}
/* 区间筛选列判定（RT 同款）——数值/日期型（hasTypes 才有显式类型信息）；
 缺显式类型时回落按值采样档（rows 型 SQL 通道语义档兜底）
 RANGE_DATE_RE 字面与判据合并 typeTiers 单源（isRangeType 委托；行为等值） */
function isRangeCol(col: string): boolean {
  const t = effType(col);
  /* 显式非语义类型更早短路（binary/geo_point 等永无区间语义） */
  if (t && isNonSemanticType(t)) return false;
  return isRangeType(t);
}
/* ═══ W7：语义格式化显示层（RT 同款；usePref 全局键 es_tbl_sem，默认开）═══
 只动「显示」：title/复制/导出恒 raw 原文（铁律不涉）；关闭即回落既有渲染 */
/* W7：语义格式化显示层（RT 同款；usePref 全局键 es_tbl_sem，默认开）——
 W-B：内部 ref 更名 semPref 让位同名 prop semOn（语义渲染扩展开关，
 见 displayText/semToneCls；pref 层与 prop 层叠加不互斥）。
 只动「显示」：title/复制/导出恒 raw 原文（铁律不涉）；关闭即回落既有渲染 */
const semPref = usePref('es_tbl_sem', true) as Ref<boolean>;
/* T1：IP_TYPE_RE 本地字面退役改引 typeTiers.isIpType（单源，行为零变化） */
const IP_NAME_RE = /(^|_)(ip|ipv4|ipv6)$/i;
function isIpCol(c: string): boolean {
  const t = effType(c);
  if (t) return isIpType(t);
  return IP_NAME_RE.test(c);
}
/* 包含档入口守卫——非语义类型（binary/geo_point/nested/object…）与 ip 列
 无文本包含语义（base64 串「包含」无意义），弹层不出包含行；无显式类型列不抑制
 （552:292 'name' 口径自洽；RT 新接 contains 行同守卫同口径）
 T1：抑制判据同步更新 typeTiers.isIpType 单源 */
function isContainsCol(c: string): boolean {
  const t = effType(c);
  if (!t) return true;
  return !isNonSemanticType(t) && !isIpType(t);
}
function isDateCol(c: string): boolean {
  const t = effType(c);
  return !!t && RANGE_DATE_RE.test(t);
}
const P2 = (x: number) => String(x).padStart(2, '0');
function localDateTime(d: Date): string {
  return `${d.getFullYear()}-${P2(d.getMonth() + 1)}-${P2(d.getDate())} ${P2(d.getHours())}:${P2(d.getMinutes())}:${P2(d.getSeconds())}`;
}
/* 占位文案单源合并 typeTiers.rangePlaceholderTxt（原双份逐字退役，行为等值） */
function rangePlaceholder(col: string, side: 'min' | 'max'): string {
  return rangePlaceholderTxt(effType(col), side);
}
/* ═══ T2：ES highlight 片段渲染（opt-in highlight prop；RT hlHtml 同源）═══
 hit 型行经 rawIdxOf 找回原始 hit（排序/列选投影后身份保引用），取 hit.highlight[col]
 片段 → hlSegment（join ' … ' + 净化，空档短路）；缺省 highlight=false 或 rows 型恒 ''
 （分支不渲染，零行为变）。净化出口仍单源 hlSafe（em/mark 放行，其余转义 fail-closed）。 */
function qHlHtml(ri: number, ci: number): string {
  if (!props.highlight || !isHits.value) return '';
  const i = rawIdxOf(ri);
  const hit = i != null ? (props.hits ?? [])[i] : undefined;
  return hlSegment(hit?.highlight?.[shownCols.value[ci] ?? '']);
}
function displayText(cell: any, ri: number, ci: number): string {
  const ep = epochMsText(cell);
  if (ep) return ep;
  if (isExpanded(ri, ci)) return fullText(cell);
  /* W7：语义格式化（semOn 开）——date 类型 ISO 串本地化、数值类型列千分位；
 大整数 ≥1e4 千分位为既有行为（不受开关影响），保持 54 批口径 */
  const col = shownCols.value[ci] ?? '';
  /* W-B：semOn prop 语义渲染扩展（bytes/duration/percent，useSemFormat）——
 命中即显示格式化 text（title/复制/导出恒 raw）；优先于 pref 层千分位链
 （epoch/date 已在上游拦截，两链无重叠）。
 semRawCols 命中列 noInfer 抑制「按值推断」（显式 fieldTypes 标注不受影响）。
 显式非语义类型（binary/dense_vector/histogram… 16 型族）同效抑制——
 守卫并上 if 条件位（semFormat 调用字面 534 源码锁钉死改旁不改锚；行为等价于 noInfer
 并上 isNonSemanticType：非语义型永不在 useSemFormat 显式标注白名单内） */
  /* 1439：semOn 也必须受「语义格式化」开关约束——此前只关 pref 层，percent/bytes/
     duration 仍由 semOn 格式化，用户点「语义格式化」后 93.2%/500000.0s 原样保留，
     与查询树/索引工作区的同款开关表现不一致（实报）。关掉开关=整层回落 raw。 */
  if (props.semOn && semPref.value && !isNonSemanticType(effType(col))) {
    const f = semFormat(cell, effType(col) ?? '', { noInfer: semRawSet.value.has(col) });
    if (f) return f.text;
  }
  if (semPref.value) {
    if (typeof cell === 'string' && isDateCol(col)) {
      const d = new Date(cell);
      if (!isNaN(d.getTime())) return localDateTime(d);
    }
    if (typeof cell === 'number' && isNumericCol(col)) return fmtNum(cell);
  }
  if (typeof cell === 'number' && Number.isInteger(cell) && Math.abs(cell) >= 1e4) return fmtNum(cell);
  return cellText(cell);
}
/* W-B：semOn 命中分档类（percent 三档 tone → qrt-sem-g/y/r；bytes/duration 无档）——
 未命中/未开 prop 返回空对象（零增量；类名新空间不触既有锚）。
 semRawCols 命中列 noInfer 抑制按值推断（percent 误判档随之失效）。
 显式非语义类型同守卫（557 displayText 对称；tone 分档随推断一起沉默） */
function semToneCls(cell: any, ci: number): Record<string, boolean> {
  const col = shownCols.value[ci] ?? '';
  if (!props.semOn || !semPref.value || cell === null || cell === undefined || isNonSemanticType(effType(col))) return {};
  const f = semFormat(cell, effType(col) ?? '', { noInfer: semRawSet.value.has(col) });
  return f?.tone ? { ['qrt-sem-' + f.tone]: true } : {};
}

/* semRawCols 命中集（Set 化防每格 Array.includes；缺省 undefined 恒空集零增量） */
const semRawSet = computed(() => new Set(props.semRawCols ?? []));

/* 单元格展示元数据缓存：点击/选中只改焦点与选择态，不应重跑每格的
 Intl/JSON/对象探测（100 行 × 百列宽表每次点击主线程卡数秒的根因）。
 依赖行/列/展开/语义档；这些变化才失效，普通点击直接读缓存。 */
const cellMeta = computed(() => {
  const cols = shownCols.value;
  const numericCols = cols.map(c => isNumericCol(c));
  const ipCols = cols.map(c => semPref.value && isIpCol(c));
  return renderRows.value.map((row, ri) => row.map((cell, ci) => {
    const full = fullText(cell);
    return {
      full,
      text: displayText(cell, ri, ci),
      chip: objChip(cell),
      tone: semToneCls(cell, ci),
      expanded: isExpanded(ri, ci),
      numeric: !!numericCols[ci],
      ip: !!ipCols[ci],
    };
  }));
});

/* 单元格右键菜单（与 RT 同一 dbx 风格；复制值/复制行 JSON/按此列排序，
 列头名从 shownCols 取，与表格所见一致） */
const cellMenu = ref<{ x: number; y: number; ri: number; ci: number } | null>(null);
/* auto-fit 测量根（与 RT 同款） */
const rootEl = ref<HTMLElement | null>(null);
/* fit 内核下沉 useColFit（RT 同款合并，单列/全列适应内容同一实现）——
 测量含列头名（口径）、前 200 行、钳位 60~320；QRT 前置固定列=序号 1 列 */
const { fitCol, fitAll } = useColFit({
  rootEl: () => rootEl.value,
  cols: () => shownCols.value,
  nameSel: '.qrt-th-name',
  cellOffset: 1,
  setWidth: (col, w) => { colWidths.value = { ...colWidths.value, [col]: w }; },
});
function openCellMenu(e: MouseEvent, ri: number, ci: number) {
  cellMenu.value = { x: e.clientX, y: e.clientY, ri, ci };
}
function openCellMenuAt(x: number, y: number, ri: number, ci: number) {
  cellMenu.value = { x, y, ri, ci };
}
function closeCellMenu() { cellMenu.value = null; }
/* 列头右键=列管理菜单（与 RT 同款；仅记忆启用时暴露列管理项） */
const colMenu = ref<{ x: number; y: number; col: string } | null>(null);

/* ═══ 1163：工具行右键菜单（RT 同款两级）═══
 一级 = 导出 ▾ / 行高切换 / 列选；其余（重置列宽、全列适应、聚合行、转置、语义格式化）
 收进「更多…」二级。 */
const barMenu = ref<{ x: number; y: number } | null>(null);
function openBarMenu(e: { clientX: number; clientY: number }) {
  barMenu.value = { x: e.clientX, y: e.clientY };
}
const barMenuItems = computed<CcmItem[]>(() => {
  if (!barMenu.value) return [];
  return [
    { key: 'bar-export', label: '导出…（CSV/XLSX/JSON/PNG/MD）', icon: FileDown, run: () => { if (rawRows.value.length) expMenuOpen.value = true; } },
    { key: 'bar-rowh', label: `行高：${rowHLabel.value}（点击切换）`, icon: MoveHorizontal, run: () => cycleRowH() },
    {
      key: 'bar-more', label: '更多…', icon: ChevronDown, sep: true, children: <CcmItem[]>[
        { key: 'bar-reset-w', label: '重置全部列宽', icon: MoveHorizontal, run: () => resetColWidths() },
        { key: 'bar-fit-all', label: '全部列适应内容', icon: MoveHorizontal, run: () => fitAll() },
        { key: 'bar-agg', label: aggOn.value ? '✓ 聚合行' : '聚合行', icon: Table, run: () => toggleAggRow() },
        { key: 'bar-transpose', label: transposeOn.value ? '✓ 转置视图' : '转置视图', icon: RotateCcw, run: () => toggleTranspose() },
        { key: 'bar-sem', label: semPref.value ? '✓ 语义格式化' : '语义格式化', icon: Braces, run: () => { semPref.value = !semPref.value; } },
      ],
    },
  ];
});
function openColMenu(e: MouseEvent, col: string) {
  colMenu.value = { x: e.clientX, y: e.clientY, col };
}
/* 列头键盘菜单（键盘可达闭环）——ContextMenu 键 / Shift+F10 打开列管理；
 enter/space 排序快捷键在本函数里直接放行 */
function onColMenuKey(e: KeyboardEvent, col: string) {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  colMenu.value = { x: r.left + 8, y: r.bottom + 4, col };
}
const colMenuItems = computed(() => {
  const m = colMenu.value; if (!m) return [];
  const ci = shownCols.value.indexOf(m.col);
  /* 列头右键同款两层结构（与单元格菜单同一语言）：一级只留「列详情」+ 三个分组父行，
     17 项平铺收成三组（排序与筛选 / 复制 / 列与视图）；二级项 label 逐字保留。 */
  const sortChildren = [
    ...(props.sortable && ci >= 0 ? [
      { key: 'sort-asc', label: '升序排序', icon: ArrowUp, run: () => directSort(m.col, ci, 1) },
      { key: 'sort-desc', label: '降序排序', icon: ArrowDown, run: () => directSort(m.col, ci, -1) },
    ] : []),
    /* 1134：列头菜单也暴露查询级排序（与本地排序分组区分）
       1439：只有接线了 sort-by 的宿主（condSort）才给，文案跟随 condTarget */
    ...(props.useAsCondition && props.condSort && ci >= 0 ? [
      { key: 'sql-sort-asc', label: `按此列升序并重查（改 ${props.condTarget}）`, icon: ArrowUp, sep: true, run: () => emit('sort-by', { field: m.col, dir: 'asc' }) },
      { key: 'sql-sort-desc', label: `按此列降序并重查（改 ${props.condTarget}）`, icon: ArrowDown, run: () => emit('sort-by', { field: m.col, dir: 'desc' }) },
    ] : []),
    { key: 'filter-col', label: '筛选此列', icon: Filter, sep: true, run: () => {
      filterPop.value = { col: m.col, x: m.x, y: m.y };
    } },
  ];
  const copyChildren = [
    { key: 'copy-col-name', label: '复制列名', icon: Copy, run: async () => {
      const ok = await copyText(m.col);
      store.notify(ok ? 'success' : 'error', ok ? '已复制列名' : '复制失败');
    } },
    /* 复制表头（TSV）——空行集走 matrixText 只出表头行（「表头行必含」口径） */
    { key: 'copy-head-tsv', label: '复制表头（TSV）', icon: ClipboardList, run: async () => {
      const ok = await copyText(matrixText({ rows: [], cols: shownCols.value, getVal: () => null }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制表头 ${shownCols.value.length} 列（TSV）` : '复制失败');
    } },
    /* 复制整列值——行集=过滤后（所见即所复），TSV 含表头行 */
    { key: 'copy-col-vals', label: '复制整列值', icon: Copy, run: async () => {
      const rows = filteredRows.value;
      const ok = await copyText(matrixText({ rows, cols: [m.col], getVal: (row, c) => xCell(qColVal(row, c), c, row) }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${m.col} 整列 ${rows.length} 行` : '复制失败');
    } },
    { key: 'copy-table-json', label: '复制整表 JSON', icon: Braces, run: () => copyTableJson() },
  ];
  const viewChildren = [
    { key: 'hide-col', label: '隐藏此列', icon: EyeOff, run: () => {
      if (visibleCols.value.length <= 1) { store.notify('error', '至少保留一列'); return; }
      visibleCols.value = visibleCols.value.filter(c => c !== m.col);
      /* 隐藏列上的本地筛选一并清掉，避免不可见列继续收窄行集 */
      clearFilter(m.col);
      if (filterPop.value?.col === m.col) filterPop.value = null;
    } },
    { key: 'pin-col', label: '此列置首', icon: Pin, run: () => {
      visibleCols.value = [m.col, ...visibleCols.value.filter(c => c !== m.col)];
    } },
    /* 冻结窗格（前缀多列）——门控随 barOn（内存态工具行也可冻结，冻结数存 ref 不落盘） */
    ...(barOn.value && isFrozenCol(m.col)
      ? [{ key: 'unfreeze-col', label: freezeN.value > 1 ? `取消冻结（前 ${freezeN.value} 列）` : '取消冻结', icon: Pin, run: () => setFreezeN(0) }]
      : barOn.value
        ? [{ key: 'freeze-col', label: '冻结到此列', icon: Pin, run: () => {
            const idx = shownCols.value.indexOf(m.col);
            setFreezeN(idx + 1);
            store.notify('success', `已冻结前 ${idx + 1} 列（横向滚动时保持可见）`);
          } }]
        : []),
    { key: 'fit-col', label: '此列适应内容', icon: MoveHorizontal, run: () => fitCol(m.col) },
    { key: 'fit-all', label: '全列适应内容', icon: MoveHorizontal, run: () => fitAll() },
    /* 聚合行 / 转置 / 语义格式化是「整张表」的视图开关，已归位工具行「视图 ⋯」
       （1143）；列头菜单只留作用于「这一列」的动作，两类语义不再混在一处。 */
    { key: 'reset-order', label: '重置列序', icon: RotateCcw, sep: true, run: () => {
      const cur = new Set(shownCols.value);
      visibleCols.value = columns.value.filter(c => cur.has(c));
    } },
  ];
  return [
    /* 列详情恒居首（本列最直接的读操作） */
    { key: 'col-detail', label: '列详情', icon: Search, run: () => { colDetail.value = m.col; } },
    ...(sortChildren.length ? [{ key: 'sort-group', label: '排序与筛选…', icon: Filter, sep: true, children: sortChildren }] : []),
    { key: 'copy-group', label: '复制…', icon: Copy, children: copyChildren },
    { key: 'view-group', label: '列与视图…', icon: MoveHorizontal, sep: true, children: viewChildren },
  ];
});
/* 单元格详情弹层状态（RT 同款：对象原值/标量包列名键统一成树；
 maxChildren=200/maxStrLen=4000 防 MB 级值拖死弹层） */
const cellDetail = ref<{ ri: number; ci: number } | null>(null);
const detailOpen = computed({
  get: () => !!cellDetail.value,
  set: (v: boolean) => { if (!v) cellDetail.value = null; },
});
const detailData = computed(() => {
  const d = cellDetail.value;
  if (!d) return null;
  const raw = renderRows.value[d.ri]?.[d.ci];
  const col = shownCols.value[d.ci];
  return raw != null && typeof raw === 'object' ? raw : { [col ?? 'value']: raw };
});
const detailMeta = computed(() => {
  const d = cellDetail.value;
  if (!d) return '';
  const raw = renderRows.value[d.ri]?.[d.ci];
  const col = shownCols.value[d.ci] ?? '';
  const kind = raw == null ? 'null'
    : Array.isArray(raw) ? `数组（${raw.length} 项）`
    : typeof raw === 'object' ? `对象（${Object.keys(raw).length} 键）`
    : typeof raw === 'string' ? `字符串（${raw.length} 字符）`
    : typeof raw;
  const t = effType(col);
  return `${col}（第 ${d.ri + 1} 行）${t ? ' · ' + t : ''} · ${kind}`;
});

/* ═══ W-B：rowDrawer 行详情侧拉（对标 dbx 行钻取）═══
 入口=单元格右键菜单「行详情」项（props.rowDrawer 门控，缺省 false 无项零增量）；
 面板=整行 shownCols 键值对 + 逐格复制 + 「复制整行 JSON」（copyRowJson 同一口径）；
 关闭即清空行位（坐标键随行集变化会错位，不留悬挂引用）。 */
/* raw：alt 视图（JSON/Tree/卡片）里 rows 派生出来的“文档”按**原始行**定位——
   它们的数据源是 props.rows，不经过排序/筛选投影，用 renderRows 下标会错行。 */
const rdwRow = ref<{ ri: number; raw?: boolean } | null>(null);
const rdwOpen = computed({
  get: () => !!rdwRow.value,
  set: (v: boolean) => { if (!v) rdwRow.value = null; },
});
/* 侧拉列/值源：表格右键通道=所见列与排序后行；alt 视图通道=原始列与原始行 */
const rdwCols = computed<string[]>(() => rdwRow.value?.raw ? (props.cols ?? []) : shownCols.value);
const rdwCells = computed<any[] | undefined>(() => {
  const r = rdwRow.value;
  if (!r) return undefined;
  return r.raw ? (props.rows ?? [])[r.ri] : renderRows.value[r.ri];
});
/* ReconcileReportDrawer 同款视口钳制：窄视口按 94% 收口，上限 520 */
const rdwW = Math.min(520, Math.round(window.innerWidth * 0.94));
/* 逐格复制（与右键「复制值」同一口径：对象 JSON 串化、null 空串） */
async function copyDrawerCell(ci: number) {
  const v = rdwCells.value?.[ci];
  const ok = await copyText(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? '已复制' : '复制失败');
}
async function copyDrawerRowJson() {
  const r = rdwRow.value; if (!r) return;
  const obj: Record<string, any> = {};
  rdwCols.value.forEach((c, ci) => { obj[c] = rdwCells.value?.[ci] ?? null; });
  const ok = await copyText(JSON.stringify(obj, null, 2));
  store.notify(ok ? 'success' : 'error', ok ? '已复制行 JSON' : '复制失败');
}

/* ═══ ：列详情（RT P2-3 对齐合并）═══
 统计走共享 useColStats、弹窗复用 ColDetailModal；口径=筛选后行集（所见即所析）。
 数值口径：fieldTypes 优先（NUMERIC_TYPES_RE 数值型 → 数字字符串也计入 Σ/avg/min/max），
 无类型映射回落采样（列内 number 值占比 ≥60%，RT numericCols 同口径） */
const colDetail = ref<string | null>(null);
const colDetailOpen = computed({
  get: () => !!colDetail.value,
  set: (v: boolean) => { if (!v) colDetail.value = null; },
});
/* 统计行基（RT 对称件，dbx 行选聚合对位）——选中行集在场=「选中∩过滤后」，
 无选中=过滤后全量（缺省零增量）。selSet 键=rawRows 索引，filteredRows 与 rawRows
 保引用经 rawIdxMap 判定；useColStats 无缓存，行基动态切换全链自动跟随，
 列详情弹窗同源同基=与聚合行同一数字 */
const aggBaseRows = computed<any[]>(() => selSet.value.size
  ? filteredRows.value.filter(r => { const i = rawIdxMap.value.get(r); return i != null && selSet.value.has(i); })
  : filteredRows.value);
const colStats = useColStats({
  rows: () => aggBaseRows.value,
  getVal: (row, c) => qColVal(row, c),
  labelOf: (v) => v === null || v === undefined ? '∅' : fullText(v),
  fieldType: (c) => effType(c) ?? '',
  isNumeric: (c) => {
    const t = props.fieldTypes?.[c];
    /* 显式非语义类型更早短路（白名单语义不变——非语义族永不命中 NUMERIC_TYPES_RE） */
    if (t && isNonSemanticType(t)) return false;
    if (t) return NUMERIC_TYPES_RE.test(t);
    let num = 0, total = 0;
    for (const row of filteredRows.value.slice(0, 50)) {
      const v = qColVal(row, c);
      if (v === null || v === undefined || v === '') continue;
      total++;
      if (typeof v === 'number') num++;
    }
    return total > 0 && num / total >= 0.6;
  },
});
const colDetailStats = computed(() => (colDetail.value ? colStats.statsOf(colDetail.value) : null));

/* ═══ ：聚合 footer 行（列头菜单「聚合行」开关，RT 同款）═══
 数值列 Σ/avg 复用 useColStats.statsOf 口径（rows=过滤后行集，与列详情弹窗同一数字）；
 落盘 es_tbl_agg:<dim> 沿用 useTablePrefs 读写范式；无 storageKey（SQL 通道）仅内存态、
 不写 LS=零增量。 W-A：readAggPref/aggOn/toggleAggRow/aggFoot 随壳合并
 useAggRow（RT 同构段单一出处；唯一差列源 shownCols vs visibleCols → 参数 renderCols），
 模板 tfoot 保位不动（diagTableAgg/healthTablesGraft 挂载级行为锁零改锚）。
 AggNum 补 count 档（statsOf().count 非空值计数，同一 statsOf 调用
 零增量取字段）——tfoot「Σ … · avg …」前缀之后 append（wave535 contains 前缀锁兼容） */
/* T1：count 装配基座——538 源码锁 toContain 逐字节锚定 return 行（552 不得改动）。
 median 档在 useAggRow 装配层由 wrapper 并入（RT 同构） */
function numericOfCount(c: string) {
  const t = effType(c);
  if (t && isNonSemanticType(t)) return null;
  const s = colStats.statsOf(c);
  return s.numeric ? { ...s.numeric, count: s.count } : null;
}
const { aggOn, toggleAggRow, aggFoot, aggSpark, aggDist } = useAggRow(
  dimension,
  () => shownCols.value,
  /* median 并入（statsOf 复算一次取 median——基座 538 源码锁逐字节钉死不可动；
 复算纯读无副作用，aggOn 非默认档才有开销；QRT/RT 同构） */
  (c) => { const n = numericOfCount(c); return n ? { ...n, median: colStats.statsOf(c).median ?? undefined } : null; },
  /* 迷你走势数据源（useColStats.seriesOf 同硬口径；显式非语义类型同守卫不出） */
  (c) => { const t = effType(c); if (t && isNonSemanticType(t)) return null; return colStats.seriesOf(c); },
  /* 件①：值分布数据源接线（ useAggRow 第 5 参消费）——useColStats.dist
 直连（utils/distBins 单源，与列详情弹窗分布段同语汇）；二道守卫内建：typeTierSuppressed
 抑制列（binary 等 18 型+_source）dist 恒 null、数值点 <2 列 null——aggDist 装配层天然不出 */
  (c) => colStats.statsOf(c).dist,
);
/* tfoot 空值率档数据源（aggFoot 在场=数值列口径）。：取整口径
 下沉 useColStats.emptyPctOf 单源（QRT/RT 双份内联退役换调用）；空值率不塞 538 源码锁
 钉死的 numericOfCount 装配层，仍从 statsOf 另取 */
const aggEmptyPct = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  if (!aggOn.value) return out;
  for (const c of shownCols.value) {
    if (!aggFoot.value?.[c]) continue;
    out[c] = colStats.emptyPctOf(c);
  }
  return out;
});
/* tfoot 口径徽标（RT 同构）——「选中 N 行」/「选中 K/N 行」；
 无选中 null=零渲染 */
const aggSelHint = computed<string | null>(() => {
  if (!selSet.value.size) return null;
  const k = aggBaseRows.value.length;
  return k === selSet.value.size ? `选中 ${k} 行` : `选中 ${k}/${selSet.value.size} 行`;
});

/* 行 _id 取值（hit 型 columns 含 _id 前缀列）；跳数据浏览器深链（doc+idx 双参） */
function rowId(ri: number): string | null {
  if (!isHits.value) return null;
  const idx = shownCols.value.indexOf('_id');
  const v = idx >= 0 ? renderRows.value[ri]?.[idx] : null;
  return typeof v === 'string' && v ? v : null;
}
function openInBrowser(ri: number) {
  const q: Record<string, string> = { doc: rowId(ri)! };
  const idxCi = shownCols.value.indexOf('_index');
  const idxV = idxCi >= 0 ? renderRows.value[ri]?.[idxCi] : null;
  if (typeof idxV === 'string' && idxV) q.idx = idxV;
  router.push({ path: '/browser', query: q });
}

/* 菜单项（1142：按操作心智收成三组二级菜单）——
 一级只留高频两项 + 分组父行 + 分隔：复制/查看（当前格）、行操作、筛选与排序、列/导出。
 此前 14+ 项平铺（与表格首行同样过挤）；二级项 label 逐字保留（能力零删除），
 既有锁面按一级父行 + 二级动作项同步更新。 */
const cellMenuItems = computed(() => {
  const m = cellMenu.value; if (!m) return [];
  const col = shownCols.value[m.ci];
  /* W-B：按此值筛选可用性——仅 rows 型 sortable 数据表（hits 型隐藏）；
 标量值（含 null，面板有 ∅ 选项）才给项，对象值无勾选语义 */
  const mv = renderRows.value[m.ri]?.[m.ci];
  const canFilterByVal = !isHits.value && props.sortable && col != null
    && (mv === null || (mv !== undefined && typeof mv !== 'object'));
  const copyChildren = [
    { key: 'copy-val', label: '复制值', icon: Copy, run: async () => {
      const v = renderRows.value[m.ri]?.[m.ci];
      const ok = await copyText(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
      store.notify(ok ? 'success' : 'error', ok ? '已复制' : '复制失败');
    } },
    { key: 'copy-col-name', label: '复制列名', icon: Copy, run: async () => {
      const ok = await copyText(col);
      store.notify(ok ? 'success' : 'error', ok ? '已复制列名' : '复制失败');
    } },
    /* 1205：复制 _id——RT（索引工作区）一直有，QRT 只有 hits 型（Lucene 命中表）拿得到 _id，
       SQL 结果集没有 _id 列（rowId 返回 null），所以这一项只在 hits 型出现。
       复制主键去 DevTools / 数据浏览器 / 告警工单是最常见的一步，不该只在索引工作区有。 */
    ...(rowId(m.ri)
      ? [{ key: 'copy-id', label: '复制 _id', icon: Copy, run: async () => {
          const ok = await copyText(rowId(m.ri)!);
          store.notify(ok ? 'success' : 'error', ok ? '已复制 _id' : '复制失败');
        } }]
      : []),
    { key: 'copy-row', label: '复制行 JSON', icon: Braces, run: () => {
      const row = renderRows.value[m.ri] || [];
      const obj: Record<string, any> = {};
      shownCols.value.forEach((c, i) => { obj[c] = row[i] ?? null; });
      copyText(JSON.stringify(obj, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制行 JSON' : '复制失败'));
    } },
    { key: 'copy-table-tsv', label: '复制整表（当前页）为 TSV', icon: ClipboardList, run: async () => {
      const rows = sortedRows.value;
      const ok = await copyText(matrixText({ rows, cols: shownCols.value, getVal: (row, c) => xCell(qColVal(row, c), c, row) }, 'tsv'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（TSV）` : '复制失败');
    } },
    /* 1204：复制为查询 DSL——索引工作区（RT）早就有这一组（dbx 19 种 extractor 的 ES 语义对位），
       SQL / Lucene 结果表却只有「复制值」。同一内核 `dslFromCell` 直出，不另造。
       只对**合法列名**开放：SQL 结果列常是表达式别名（COUNT(*) / DATE_TRUNC(...)），
       拿它去拼 `{term:{"COUNT(*)":v}}` 会生成 ES 不认的字段（与同菜单 use-as-cond 同一道闸）。
       值取 renderRows 的原始值（不是渲染串），日期列给 epoch 毫秒 ES 原生接受。 */
    ...(!isHits.value && col && /^[A-Za-z_][\w.]*$/.test(col)
      ? (() => {
          const v = renderRows.value[m.ri]?.[m.ci];
          const hasVal = v !== undefined && v !== null && v !== '';
          const q = hasVal ? buildDsl(col, [v], cpTypes.value[col]) : null;
          const ex = col === '_id' ? null : buildExistsDsl(col);
          const out: CcmItem[] = [];
          if (q) {
            const op = Object.keys(q)[0]!;
            out.push({
              key: 'dsl-copy', label: `复制为 ${op} 查询`, icon: Braces,
              run: async () => {
                const ok = await copyText(JSON.stringify(q, null, 2));
                store.notify(ok ? 'success' : 'error', ok ? `已复制 ${col} 的 ${op} 查询 DSL` : '复制失败');
              },
            });
          }
          if (ex) {
            out.push({
              key: 'dsl-exists', label: '复制为 exists 查询（字段存在）', icon: Braces,
              run: async () => {
                const ok = await copyText(JSON.stringify(ex, null, 2));
                store.notify(ok ? 'success' : 'error', ok ? `已复制 ${col} 的 exists 查询` : '复制失败');
              },
            });
          }
          return out;
        })()
      : []),
    /* 1169：勾选行之后只能「复制整表」——RT 那边早就有「复制 N 行为 TSV/MD/JSON」，
      在 SQL 结果表勾了 20 行还是只能整页复制。这里补齐同一组（同一 matrixText 内核，
      选中集按 rawRows 身份取行，与表尾「选中 N 行」徽标同源）。 */
    ...(props.selectable && selSet.value.size
      ? [
          { key: 'copy-sel-tsv', label: `复制选中 ${selSet.value.size} 行为 TSV`, icon: ClipboardList, sep: true, run: () => copySelMatrix('tsv') },
          { key: 'copy-sel-md', label: `复制选中 ${selSet.value.size} 行为 Markdown`, icon: FileText, run: () => copySelMatrix('md') },
          { key: 'copy-sel-json', label: `复制选中 ${selSet.value.size} 行为 JSON`, icon: Braces, run: () => copySelMatrix('json') },
          /* 1205：勾选行 + 当前列 → terms/ids 查询（RT 的 copy-sel-terms 同款）。
             多行取值一次成一条 `{terms:{col:[…]}}`，是把「结果里这几条」搬回查询侧的最短路径。
             仍只对合法列名开放（表达式别名会拼出非法字段），空值由 buildDsl 自身剔除。 */
          ...(col && /^[A-Za-z_][\w.]*$/.test(col)
            ? [{ key: 'copy-sel-terms', label: `复制选中 ${selSet.value.size} 行为查询（${col}）`, icon: Braces, run: async () => {
                /* selSet 键=rawRows 索引，列位取 columns（排序/筛选只重排渲染序，不动 raw 身份） */
                const ci = columns.value.indexOf(col!);
                const vals = [...selSet.value]
                  .map(ri => rawRows.value[ri]?.[ci])
                  .filter(v => v !== null && v !== undefined && v !== '');
                const q = buildDsl(col!, vals, cpTypes.value[col!]);
                if (!q) {
                  /* 1431：对象/数组列无法按值匹配（ES 不会把对象索引成字符串）——
                     说清是哪一种「生成不了」，不要一律报「无值」 */
                  const hasObj = vals.some(v => v !== null && typeof v === 'object');
                  store.notify('warning', hasObj
                    ? `「${col}」是对象/数组列，无法按值生成查询；请改用其子字段`
                    : '选中的行在该列无值，未生成查询');
                  return;
                }
                const ok = await copyText(JSON.stringify(q, null, 2));
                store.notify(ok ? 'success' : 'error', ok ? `已复制 ${vals.length} 个值的查询 DSL` : '复制失败');
              } }]
            : []),
        ]
      : []),
  ];
  const rowChildren = [
    /* 单元格详情（RT P0-2 同款合并）——完整值弹层不再只能看截断串 */
    { key: 'detail-cell', label: '查看完整值', icon: Search, run: () => { cellDetail.value = { ri: m.ri, ci: m.ci }; } },
    /* W7：行内展开详情（与行尾钮/E 键同态：expandedRows；RT 镜像） */
    { key: 'expand-row', label: expandedRows.value.has(qRowKey(m.ri)) ? '收起此行' : '展开此行', icon: ChevronDown, run: () => { toggleRowExpand(qRowKey(m.ri)); } },
    /* W-B：行详情侧拉入口（props.rowDrawer 门控，缺省 false 无项零增量） */
    ...(props.rowDrawer ? [{ key: 'row-drawer', label: '行详情', icon: Search, run: () => { rdwRow.value = { ri: m.ri }; } }] : []),
    /* 在数据浏览器打开此文档（有 _id 时）——行→文档链路，深链 ?idx=&doc= */
    ...(rowId(m.ri)
      ? [{ key: 'open-browser', label: '在数据浏览器打开此文档', icon: Search, run: () => openInBrowser(m.ri) }]
      : []),
  ];
  const queryChildren = [
    { key: 'sort', label: `按「${col}」排序`, icon: ArrowDown, run: () => onSort(m.ci) },
    /* 筛选此列直达（弹层落点=菜单坐标；筛选内存态不依赖 prefsOn） */
    ...(col != null ? [{ key: 'filter-col', label: '筛选此列', icon: Filter, run: () => {
      filterKw.value = '';
      filterPop.value = { col, x: m.x, y: m.y };
    } }] : []),
    /* W-B：按此值筛选——复用既有 ColFilterPopover 开层 + 勾选链 */
    ...(canFilterByVal ? [
      { key: 'filter-by-val', label: '仅筛选当前结果（不改查询）', icon: Filter, run: () => {
        const v = renderRows.value[m.ri]?.[m.ci];
        if (v === undefined) return;
        toggleFilterVal(col, v);
        filterPop.value = { col, x: m.x, y: m.y };
      } },
    ] : []),
    /* 1126：结果值下钻到查询（SQL 宿主改写 WHERE 并重查；RT 的 filter-hit 同动线）。
       只对合法列名开放，null 值由宿主生成 IS NULL。
       1439：hits 型（Lucene）同开——宿主传 useAsCondition 才出现，文案语言由 condTarget 给。 */
    ...(props.useAsCondition && col && /^[A-Za-z_][\w.]*$/.test(col)
      ? [{ key: 'use-as-cond', label: `加入查询条件并重查（改 ${props.condTarget}）`, icon: Filter, run: () => {
          const v = renderRows.value[m.ri]?.[m.ci];
          emit('use-as-condition', { field: col, value: v === undefined ? null : v, type: props.fieldTypes?.[col] });
        } },
        /* 1439：排除（<> / IS NOT NULL；空值行保留，与 ES must_not 同语义） */
        { key: 'use-as-cond-not', label: `排除此值并重查（改 ${props.condTarget}）`, icon: Filter, run: () => {
          const v = renderRows.value[m.ri]?.[m.ci];
          emit('use-as-condition', { field: col, value: v === undefined ? null : v, type: props.fieldTypes?.[col], not: true });
        } },
        /* 1132：查询级排序——与本地排序明确分开（只有接线了 sort-by 的宿主才给） */
        ...(props.condSort
          ? [{ key: 'sort-asc', label: `按此列升序并重查（改 ${props.condTarget}）`, icon: ArrowUp, run: () => emit('sort-by', { field: col, dir: 'asc' }) },
             { key: 'sort-desc', label: `按此列降序并重查（改 ${props.condTarget}）`, icon: ArrowDown, run: () => emit('sort-by', { field: col, dir: 'desc' }) }]
          : []),
        ]
      : []),
  ];
  /* 1385：与 RT 同构拆组——此前这里最多 9 项（4 列操作 + 5 导出）平铺在一张二级里，
     「现在就导出」和「列操作」两种意图混着靠滚动找。拆成「导出…」与「列操作…」两个分组，
     与 ResultTable 的分组名/语义完全一致（跨内核同一右键语言）。 */
  const exportChildren = [
    { key: 'export-csv', label: '导出当前视图（CSV）', icon: FileDown, sep: false, run: () => exportCsv() },
    { key: 'export-xlsx', label: '导出当前视图（XLSX）', icon: Table, run: () => exportXlsx() },
    { key: 'export-json', label: '导出当前视图（JSON）', icon: Braces, run: () => exportJson() },
    { key: 'export-md', label: '导出当前视图（Markdown）', icon: FileText, run: () => exportMd() },
    ...(props.exportNdjson ? [{ key: 'export-ndjson', label: '导出当前视图（NDJSON）', icon: ClipboardList, run: () => exportNdjsonFile() }] : []),
  ];
  const colOpsChildren = [
    ...(barOn.value ? [
      { key: 'hide-col', label: '隐藏此列', icon: EyeOff, run: () => {
        if (visibleCols.value.length <= 1) { store.notify('error', '至少保留一列'); return; }
        visibleCols.value = visibleCols.value.filter(c => c !== col);
      } },
      { key: 'pin-col', label: '此列置首', icon: Pin, run: () => {
        visibleCols.value = [col, ...visibleCols.value.filter(c => c !== col)];
      } },
      { key: 'fit-col', label: '此列适应内容', icon: MoveHorizontal, run: () => fitCol(col) },
      { key: 'fit-all', label: '全列适应内容', icon: MoveHorizontal, run: () => fitAll() },
    ] : []),
  ];
  /* 1169：RT 的单元格右键五档导出，QRT 此前只有 CSV 一条——同一张表在索引工作台
     能就地从单元格导出 XLSX/JSON/MD/NDJSON，在 SQL 结果表得另开工具行菜单。
     标签写成「导出当前视图（X）」而非「X 格式」：QRT 没有 RT 那个默认格式偏好
     （工具行是五档直选），写成格式会让人以为点一下只改设置不下载。 */
  const colChildren = [...colOpsChildren, ...exportChildren];
  /* 无记忆维度（SQL 等通道）时列管理项整组不出——只剩导出，分组名跟着换。 */
  const colGroup = { key: 'col-group', label: '列操作…', icon: MoveHorizontal, children: colOpsChildren };
  const hostRowGroup = props.rowActionGroup?.(renderRows.value[m.ri], m.ri) ?? null;
  return [
    /* 一级：当前格最高频两件事（复制值/完整值）——单击一步到位，不逼两级 */
    { key: 'copy-val', label: '复制值', icon: Copy, run: copyChildren[0].run },
    { key: 'detail-cell', label: '查看完整值', icon: Search, run: rowChildren[0].run },
    /* 分组父行（二级）：复制组 / 行操作组 / 查询组 / 列与导出组 */
    { key: 'copy-group', label: '复制…', icon: ClipboardList, sep: true, children: copyChildren.filter(c => c.key !== 'copy-val') },
    ...(rowChildren.length > 1 ? [{ key: 'row-group', label: '行操作…', icon: ChevronDown, children: rowChildren.filter(c => c.key !== 'detail-cell') }] : []),
    { key: 'query-group', label: '筛选与排序…', icon: Filter, sep: true, children: queryChildren },
    { key: 'export-group', label: '导出…', icon: FileDown, sep: true, children: exportChildren },
    ...(colOpsChildren.length ? [colGroup] : []),
    ...(hostRowGroup ? [{ ...hostRowGroup, sep: true }] : []),
  ];
});
/* 删除 menuCopyVal/menuCopyRowJson/menuSortCol——独立函数版菜单实现，
 合并 cellMenuItems computed 后即成死代码（无模板/逻辑引用），双路径易误导后人 */
/* 单元格单击复制全文（对象/数组 JSON），对齐 ResultTable copyCell 口径 */
async function copyCell(v: any) {
  if (v === null || v === undefined || v === '') return;
  const ok = await copyText(typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? '已复制单元格' : '复制失败');
}

/* v3.0.0：拖拽柄键盘微调列宽（role=slider 的 ←/→，与拖拽/双击同一写入口）；
 钳位引用 useColFit 共享常量——与双击自适应同源，不再互相反缩 */
function nudgeColWidth(col: string, delta: number) {
  const cur = colWidths.value[col] ?? 160;
  colWidths.value = { ...colWidths.value, [col]: Math.min(COL_W_MAX, Math.max(COL_W_MIN, cur + delta)) };
}

/* ═══ ：键盘行导航（useRowNav 共享内核）═══
 420px 滚动区 + 深结果集场景，↑↓ 走出视口时自动滚动跟随（block:'nearest' 不打断当前视野） */
/* Ctrl+C=复制焦点行 JSON（列=shownCols 所见即所得，与右键复制行 JSON 同款） */
const { focusIdx, tblFocus, onRowNavKey } = useRowNav(computed(() => renderRows.value.length), {
  onCopy: (i) => copyRowJson(i),
});
/* W7：E=展开/收起焦点行内嵌详情（输入态让路；Enter 语义保持既有不变）；
 其余键转交行导航内核（同元素不重复挂 @keydown 的收口范式与 RT onGridKeydown 一致） */
function onQKeydown(e: KeyboardEvent) {
  /* 菜单键/Shift+F10：焦点行打开单元格菜单（含宿主 rowActionGroup）——
     此前单元格右键只有鼠标入口，键盘用户无法触达复制/行操作分组 */
  if ((e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) && focusIdx.value >= 0) {
    e.preventDefault();
    const trs = [...(rootEl.value?.querySelectorAll('tbody tr') ?? [])]
      .filter(el => !el.classList.contains('rt-expand')) as HTMLElement[];
    const tr = trs[focusIdx.value];
    const td = tr?.querySelector('td[data-col]') as HTMLElement | null;
    const r = (td ?? tr)?.getBoundingClientRect();
    openCellMenuAt(r ? r.left + 8 : 0, r ? r.top + 8 : 0, focusIdx.value, 0);
    return;
  }
  if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey && focusIdx.value >= 0) {
    const t = e.target as HTMLElement | null;
    const isInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (!isInput) { e.preventDefault(); toggleRowExpand(qRowKey(focusIdx.value)); return; }
  }
  /* P2：pagerOn 键盘翻页——PageUp/PageDown 逐页、Ctrl+Home/Ctrl+End 首末页跳页，
 只 emit update:page 意图（取数归宿主远端分页契约）；输入态让路，裸 Home/End 仍归行导航 */
  if (pagerOn.value) {
    const t = e.target as HTMLElement | null;
    const isInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (!isInput) {
      const jump = e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'Home' || e.key === 'End')
        ? (e.key === 'Home' ? 1 : pagerTotalPages.value)
        : e.key === 'PageUp' ? Math.max(1, pagerPage.value - 1)
        : e.key === 'PageDown' ? Math.min(pagerTotalPages.value, pagerPage.value + 1)
        : null;
      if (jump !== null) {
        e.preventDefault();
        if (jump !== pagerPage.value) emit('update:page', jump);
        return;
      }
    }
  }
  onRowNavKey(e);
}
/* 行复制组装合并为函数——键盘 Ctrl+C（与 hover 行内钮共用同一口径
 （列=shownCols 所见即所得）； M4：行集钳位 renderRows（所见即所操作） */
function copyRowJson(ri: number) {
  const row = renderRows.value[ri]; if (!row) return;
  const obj: Record<string, any> = {};
  shownCols.value.forEach((c, ci) => { obj[c] = row[ci] ?? null; });
  void copyText(JSON.stringify(obj, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制行 JSON' : '复制失败'));
}
/* 复制整表 JSON 动作函数化（列头菜单 copy-table-json 与 bar-prepend 宿主
 快捷钮同一收口；行集=sortedRows 全量、列=shownCols、值=raw——原语义零变化） */
async function copyTableJson() {
  const rows = sortedRows.value;
  const ok = await copyText(matrixText({ rows, cols: shownCols.value, getVal: (row, c) => qColVal(row, c) }, 'json'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（JSON）` : '复制失败');
}
/* _index 格芯片跳转（AliasesView goHub 同范式）——带 idx query 直达索引工作区 */
function gotoIndex(v: any) {
  if (typeof v !== 'string' || !v) return;
  router?.push({ path: '/indices', query: { idx: v } });
}
/* ═══ ：结果内查找（Ctrl+F）——RT 同款合并 ═══
 搜索范围钉死 renderRows×shownCols（所见即所搜）；匹配口径=displayText（epoch/大数
 人性化后所见即所搜）；命中格琥珀底+mark 切分，当前命中落位。 */
const {
  kw: searchKw, open: searchOpen, deferred: searchDeferred,
  matches: searchMatches, matchSet: searchMatchSet,
  current: searchCur, next: searchNext, prev: searchPrev,
} = useGridSearch({
  rows: () => renderRows.value.length,
  cols: () => shownCols.value.length,
  getText: (ri, ci) => {
    const row = renderRows.value[ri];
    return row ? displayText(row[ci], ri, ci) : '';
  },
  /* 件④：date 列第三遍归一接线（ useGridSearch 可选 colType 消费）——
 date 列且 kw/格文本都呈日期形态时分隔符归一（/ . 与 - 互认）；effType 与列头徽标/
 统计面同一读取口径，非 date 列零行为变化 */
  colType: (ci) => effType(shownCols.value[ci] ?? ''),
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
    .find(td => (td as HTMLElement).dataset.col === shownCols.value[m.ci]) as HTMLElement | undefined;
  if (!el) return;
  el.classList.add('hit-cur');
  prevHitCurEl = el;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
async function openSearch() {
  /* ·单框双效（D4）：searchable 档=聚焦常驻快筛框（独立查找条已并入）；
 非 searchable 档走 269 原路（表格必有查找约定不回退） */
  if (props.searchable) {
    (rootEl.value?.querySelector('.qrt-qsearch-inp') as HTMLInputElement | null)?.focus();
    return;
  }
  searchOpen.value = true;
  await nextTick();
  (rootEl.value?.querySelector('.hn-inp') as HTMLInputElement | null)?.focus();
}
function closeSearch() {
  searchKw.value = '';
  searchOpen.value = false;
  searchDeferred.value = '';
  prevHitCurEl?.classList.remove('hit-cur');
  prevHitCurEl = null;
  /* 焦点还给表格根：关闭后 ↑↓/再次 Ctrl+F 立即可用（键盘闭环） */
  rootEl.value?.focus();
}
/* ═══ ·单框双效（620 稿 D1~D5 裁决）：searchable 档查找并入快筛框 ═══
 词桥：快筛词驱动 useGridSearch（150ms 防抖出 matchSet/mark）——同一词一条口径，
 输入即过滤（quickFilterEff 既有链）+行内 mark 点亮；清词即时清生效词（不等防抖，
 closeSearch 语义等值平移）；非 searchable 档框不在场本桥空转。
 Enter 桥接（D2）：过滤后所见行皆命中行，行级滚动到下一命中行（回绕）。 */
watch(searchableKw, (v) => {
  searchKw.value = v;
  if (!v.trim()) searchDeferred.value = '';
});
const bridgeRi = ref(-1);
function bridgeNext() {
  const n = renderRows.value.length;
  if (!n) return;
  bridgeRi.value = (bridgeRi.value + 1) % n;
  const el = rootEl.value?.querySelector(`tbody td[data-ri="${bridgeRi.value}"]`) as HTMLElement | null;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
}

/* ═══ ：Ctrl+F 稳定接管（与 RT 同构）——document 捕获级，不再依赖表格预聚焦；
 输入态（INPUT/TEXTAREA/SELECT/富文本/Monaco）让路；多表同屏由 defaultPrevented 仲裁；
 本表不可见（切走/KeepAlive 隐藏）时不接管。 */
function onDocFind(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
  if (e.key.toLowerCase() !== 'f') return;
  if (e.defaultPrevented) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor'))) return;
  const root = rootEl.value;
  if (!root || root.offsetParent === null) return;
  e.preventDefault();
  e.stopPropagation();
  void openSearch();
}
document.addEventListener('keydown', onDocFind, true);
onBeforeUnmount(() => document.removeEventListener('keydown', onDocFind, true));

/* 长列表回顶——滚过 600px 出现，点击平滑归顶（与 RT 同语义） */
const showTop = ref(false);
/* 横向滚动态可视化（RT 同款）——冻结列(sticky+不透明背景)会把滚入其下方的
 普通列开头盖住（冻结窗格语义），scrollLeft>0 时冻结缘投影明示「下方有内容」。 */
const hScrolled = ref(false);
function onWrapScroll() {
  const el = wrapRef.value;
  if (el) { showTop.value = el.scrollTop > 600; hScrolled.value = el.scrollLeft > 0; }
}
/* 换存储键（换数据集维度）横向滚动位归零——防上一维度残留的假遮挡态 */
watch(dimension, () => { hScrolled.value = false; });
function backToTop() {
  const el = wrapRef.value;
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  showTop.value = false;
}
/* Esc=退出导航态（失焦；高亮经 watch(tblFocus) 联动清零）——对齐「Esc 退出键盘操作态」惯例 */
function onEscBlur(e: KeyboardEvent) {
  /* 搜索开着时 Esc 先关查找（RT 同语义），再落失焦 */
  if (searchOpen.value) { closeSearch(); return; }
  /* W7：有行内展开先全收（与 RT 同裁决：全收），再落失焦 */
  if (expandedRows.value.size) { expandedRows.value = new Set(); return; }
  /* 1366：聚合散选先清（与 RT「Esc 清框选」同裁决），再落失焦 */
  if (aggCells.value.size) { clearAggCells(); return; }
  /* 1405：框选矩阵次之（先清散选，再清更“外”的选区）；1408 触屏起点同清 */
  if (region.value || touchAnchor.value) { clearRegion(); return; }
  (e.currentTarget as HTMLElement | null)?.blur();
}
const wrapRef = ref<HTMLElement>();

/* 换存储键时横向滚动位归零（新维度回列首，防上一维度残留的假遮挡态） */
watch(dimension, () => { const el = wrapRef.value; if (el) el.scrollLeft = 0; });
watch(focusIdx, (i) => {
  if (i < 0 || !tblFocus.value) return;
  const tr = wrapRef.value?.querySelector('tbody tr:nth-child(' + (i + 1) + ')') as HTMLElement | null;
  tr?.scrollIntoView?.({ block: 'nearest' });
});

/* 供 SQL 通道 CSV 导出跟随当前排序行序（所见即所得），不把排序状态外溢成受控 props。
 getCsvBlock 给 hit 型消费方（Lucene/PIT）——列头=可见列名，行=排序后
 矩阵按可见列对齐（列选隐藏的列不导出，所见即所得），列对齐逻辑留在列推导处。
 抽 csvBlock 内部函数，命令面板导出（table-cmd）共用同一口径。
 矩阵成型后统一过 exportCell 加工管道（缺省恒等=现状零变化；
 head/rows 字面量保持 76 批 getCsvBlock 契约原样，加工只追加不重排）。 */
function csvBlock() {
  const idxs = shownCols.value.map(c => columns.value.indexOf(c));
  /* W-B：exportRowFilter 行级过滤（CSV/MD/XLSX 三管道同走本收口；
 exportCell 只加工格、此只筛行；缺省 undefined=全量导出现状不变） */
  const srcRows = props.exportRowFilter ? sortedRows.value.filter(r => props.exportRowFilter!(r)) : sortedRows.value;
  const blk = {
    head: shownCols.value.slice(),
    rows: srcRows.map(r => idxs.map(i => (i >= 0 ? r[i] ?? null : null))),
  };
  if (!props.exportCell) return blk;
  return { head: blk.head, rows: blk.rows.map(r => r.map((v, j) => xCell(v, blk.head[j], r))) };
}
defineExpose({
  getSortedRows: () => sortedRows.value,
  getCsvBlock: csvBlock,
  /* 1139：宿主结果工具行可切换行高（SQL 无偏好工具行时仍可达；全局阅读偏好键） */
  cycleRowH,
  /* 复制整表 JSON 动作透出（SystemView bar-prepend 快捷钮消费——宿主
 「复制结果 JSON」退役换内核同函数，裁决见 SystemView） */
  copyTableJson,
});

/* ═══ ：命令面板表格域命令（window 'table-cmd' 广播）═══
 仅当前可见实例响应——offsetParent 检查区分同页双表（IndexHub 的 RT/QRT 按可见性）
 与 KeepAlive 后台缓存页（T30：DOM 仍在树上，不可见实例必须静默丢弃防误响应）。
 无表格页面无实例响应，命令面板 sub 已注明作用域。
 dense/重置列宽与工具行按钮同口径（仅记忆启用时），导出不受限。 */
/* P0-3：跳转到列（RT 同款）——注册表+隐藏列先显示+列头闪烁 1.4s */
const flashCol = ref('');
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function locateCol(col: string) {
  if (!shownCols.value.includes(col)) visibleCols.value = [...visibleCols.value, col];
  flashCol.value = col;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashCol.value = ''; }, 1400);
  void nextTick(() => {
    const th = [...(rootEl.value?.querySelectorAll('thead th[data-col]') ?? [])]
      .find(th => (th as HTMLElement).dataset.col === col) as HTMLElement | undefined;
    if (typeof th?.scrollIntoView === 'function') th.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
const tableRegId = registerTable({
  cols: () => shownCols.value,
  locate: locateCol,
  visible: () => {
    const r = rootEl.value;
    const op = r && (r as HTMLElement).offsetParent;
    return !!r && op !== null && op !== undefined;
  },
});
onBeforeUnmount(() => unregisterTable(tableRegId));

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
  if (cmd === 'dense') { if (barOn.value) cycleRowH(); } /* ：dense 命令复用为行高三档循环 */
  else if (cmd === 'reset-widths') { if (barOn.value) resetColWidths(); }
  else if (cmd === 'locate-col' && detail.col) locateCol(detail.col);
  else if (cmd === 'export') exportCsv();
}

/* 导出合并为函数（table-cmd 与工具条「导出」钮共用）——RT 五件套对齐 */
/* 选中行矩阵复制（RT copySelRows 同内核）：选中集按 rawRows 身份取行，
 列取 shownCols（所见即所得），值过 exportCell 管道——与「复制整表」同口径，
 只是行范围换成勾选。 */
async function copySelMatrix(fmt: 'tsv' | 'md' | 'json') {
  /* selSet 键=rawRows 索引；hits 型 rawRows 也是展开后的矩阵（_id/_score/_source 列），
 不能拿 props.hits（对象）当矩阵行取 qColVal——那会复制出一整行空格（1400 实测）。 */
  const rows = [...selSet.value].sort((a, b) => a - b).map(i => rawRows.value[i]).filter(r => r !== undefined);
  if (!rows.length) { store.notify('warning', '没有选中的行'); return; }
  const text = matrixText({
    rows, cols: shownCols.value,
    getVal: (row, c) => xCell(qColVal(row, c), c, row),
  }, fmt);
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（${fmt.toUpperCase()}）` : '复制失败');
}
function exportCsv() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  const csv = [blk.head.map(csvCell).join(',')]
    .concat(blk.rows.map(r => r.map(v => csvCell(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)).join(',')))
    .join('\n');
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.csv`, csv, 'text/csv', { bom: true });
  store.notify('success', `已导出 ${blk.rows.length} 行（CSV）${props.exportNote}`);
}

/* ═══ ：导出五格式对齐 RT（CSV 既有，补 MD/XLSX/PNG）═══
 行集/列集统一走 csvBlock()（可见列+排序后全量，所见即所得），与 CSV 同一口径；
 MD 转义/ XLSX data+meta 双 sheet / PNG 2x 快照均从 RT 同款实现平移，只读定位不搬内联编辑 */
function exportMd() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  /* RT md 分支同款转义：null=空串（区别于字面 '-'），对象 JSON.stringify，竖线/换行转义 */
  const esc = (v: any) => String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v)
    .replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const content = [
    '| ' + blk.head.join(' | ') + ' |',
    '| ' + blk.head.map(() => '---').join(' | ') + ' |',
    ...blk.rows.map(r => '| ' + r.map(esc).join(' | ') + ' |'),
  ].join('\n');
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.md`, content, 'text/markdown');
  store.notify('success', `已导出 ${blk.rows.length} 行（Markdown）${props.exportNote}`);
}

function exportXlsx() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  /* 双 sheet 装配合并 exportSheets.buildExportSheets 单源（RT 同款装配；
 QRT 无「索引/范围」差异字段，meta0 空档） */
  const [sheet, meta] = buildExportSheets(
    [],
    { head: blk.head, rows: blk.rows.map(r => r.map(v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))) },
  );
  const bytes = buildXlsx([sheet, meta]);
  downloadBlob(`${props.exportName || 'table-export'}-${exportStamp()}.xlsx`,
    new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  store.notify('success', `已导出 ${blk.rows.length} 行（XLSX，含 meta 页）${props.exportNote}`);
}

/* JSON 第五导出（RT 五格式+快照对位收尾）——矩阵语义（行集=sortedRows 全量、
 列=shownCols，matrixText(...,'json') 2 空格缩进，与 copy-table-json 同口径）；与 RT
 exportRows('json') 的 _id+_source 文档语义有意分工（rows 型无 _source，矩阵 JSON 即正解，
 exportCell/exportRowFilter 不涉——同 copy-table-json 既有裁决） */
function exportJson() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const rows = sortedRows.value;
  const content = matrixText({ rows, cols: shownCols.value, getVal: (row, c) => qColVal(row, c) }, 'json');
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.json`, content, 'application/json');
  store.notify('success', `已导出 ${rows.length} 行（JSON）${props.exportNote}`);
}

/* 1141：NDJSON 档——每行一对象（键=可见列），与 CSV 同源 csvBlock（排序后全量、
 可见列、exportCell/exportRowFilter 同口径）。空值写 null（对象语义不落 '∅' 展示态）。
 SQL 等行对象通道由此收口，宿主不再手写「列名还原行对象」导出。 */
function exportNdjsonFile() {
  if (isEmpty.value) { store.notify('warning', '当前表格无数据可导出'); return; }
  const blk = csvBlock();
  const lines = blk.rows.map(r => {
    const o: Record<string, unknown> = {};
    blk.head.forEach((c, i) => { o[c] = r[i] ?? null; });
    return JSON.stringify(o);
  });
  downloadText(`${props.exportName || 'table-export'}-${exportStamp()}.ndjson`, lines.join('\n'), 'application/x-ndjson');
  store.notify('success', `已导出 ${lines.length} 行（NDJSON）${props.exportNote}`);
}

async function exportPng() {
  if (!rootEl.value) return;
  const ok = await snapshotTableToPng(rootEl.value, `table-snapshot-${exportStamp()}.png`);
  store.notify(ok ? 'success' : 'error', ok ? '已导出表格快照 PNG' : '快照导出失败');
}
window.addEventListener('table-cmd', onTableCmd);
onBeforeUnmount(() => window.removeEventListener('table-cmd', onTableCmd));
</script>

<style scoped>
/* 1127：无偏好工具行通道的本地筛选提示条（SQL 等）——可见、可清除、不挤压表格高度链 */
.qrt-filter-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2);
  padding: 3px var(--sp-3); background: var(--bg2); border-bottom: 1px solid var(--line); }
/* 1137：内存态隐藏列后的恢复入口（无偏好工具行的 SQL 通道） */
.qrt-col-hint { display: flex; align-items: center; gap: var(--sp-2); padding: 3px var(--sp-3);
  background: var(--bg2); border-bottom: 1px solid var(--line); font-size: var(--fs-2xs); color: var(--tx2); }
.qrt { position: relative; outline: none; }
/* 1401 填满档（opt-in）：自身在宿主面板里吃满剩余高度，表体成为唯一伸缩区。
 三档分工：FS 根吸收面板余高 → .qrt 吸收 FS body 余高 → .qrt-wrap 吸收工具行/状态栏/分页行
 之外的高度。行少时表卡仍占满，不在面板下方留空白。 */
.fs.qrt-fs-fill { flex: 1 1 auto; min-height: 0; }
.qrt.qrt-fill { display: flex; flex-direction: column; min-height: 0; }
.qrt.qrt-fill > .qrt-wrap-shell { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.qrt.qrt-body-hidden .qrt-wrap-shell { display: none; }
.qrt.qrt-fill > .qrt-wrap-shell > .qrt-wrap { flex: 1 1 auto; min-height: 0; }
/* 内建聚焦面高度链 + 聚焦态滚动区吃满（内联 maxHeight 需 !important 接管） */
.fs { display: flex; flex-direction: column; }
.fs-active .qrt-wrap { max-height: none !important; height: 100%; }
.fs-active .qrt-loading { max-height: none !important; }
/* 非 prefsOn 通道悬浮放大钮（查找条打开时右移让位） */
.qrt-fs-btn { position: absolute; top: 2px; right: 6px; z-index: 3; padding: 0 7px; }
.qrt-fs-btn.open { right: 320px; }
.qrt-hn { position: absolute; top: 2px; right: 6px; z-index: 3; }
.qrt-search-note { position: absolute; top: 6px; right: 8px; z-index: 3; font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg0); padding: 1px var(--sp-1h); border-radius: var(--r-xs); border: 1px solid var(--line); }
.qrt-cell.qrt-hit { background: var(--warn-soft); }
/* v3.0.0 纠错：当前命中格样式补齐——模板挂 rt-hit-cur 类但 scoped 样式缺失（类样式在
 ResultTable 的 scoped 里，跨组件不生效），当前命中与普通命中视觉完全同款 */
.qrt-cell.rt-hit-cur { box-shadow: inset 0 0 0 2px var(--warn); }
/* v3.0.0 场景语义分档：数值列右对齐（对齐 RT num-col，tabular-nums 千分位对齐可比） */
.qrt-cell.num-col { text-align: right; font-variant-numeric: tabular-nums; }
mark.qrt-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
/* T2：ES highlight 片段（hlSegment 净化后仅存 em/mark）——与 mark.qrt-mark/
 RT .rt-hl em/mark 同视觉语言（琥珀底强调），形态逐字对齐 RT :2435 */
.qrt-hl em, .qrt-hl mark { font-style: normal; background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
.qrt-d-meta { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.qrt-kbd-hint {
  position: absolute; top: 2px; right: 6px; z-index: 2; pointer-events: none;
  font-size: var(--fs-xs); color: var(--tx2); background: var(--bg0);
  border: 1px solid var(--line); border-radius: var(--r-xs); padding: 1px var(--sp-1h); letter-spacing: .5px;
}
.qrt-tbl tbody tr.qrt-row-focus > td { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi); }
/* 与 RT 同款工具行容器化（dbx 表格卡头语言，设计统一） */
/* 工蚁1：显式单行纪律（RT :2331 同步同款——勾选/筛选态右簇变宽时收缩压力
 不得压左簇文本折行；右簇 flex+shrink:0 纪律住 TableShell 全局 style，原 .qrt-bar-r
 内核规则系 527 合并后 scopeId 不传播的死规则，迁出勿搬回）。缺省态 DOM 零变 */
.qrt-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-bottom: 0; border-radius: var(--r-m) var(--r-m) 0 0; flex-wrap: nowrap; }
/* rows 型转置态提示行（与 qrt-bar 同卡头语言；接在其后时去顶圆角/顶边框） */
.qrt-tr-bar { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-bottom: 0; border-radius: var(--r-m) var(--r-m) 0 0; }
.qrt-tr-bar.after-bar { border-radius: 0; border-top: 0; }
.qrt-t-n { width: auto; padding: var(--sp-0) var(--sp-1h); font-size: var(--fs-xs); }
.qrt-tr-off { border: 0; background: transparent; color: var(--tx2); cursor: pointer; font-size: var(--fs-xs); margin-left: auto; padding: 0 var(--sp-0); }
.qrt-tr-off:hover { color: var(--err); }
/* 内建分页行（表格卡底缘）——has-pgr 联动收 wrap 底圆角，分页行接管圆角 */
.qrt-pgr { display: flex; justify-content: flex-end; align-items: center; padding: 5px var(--sp-2h); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m); background: var(--bg1); }
.qrt-wrap.has-pgr { border-radius: 0; }
/* ═══ ：内建视图档（seg 防换行+alt 体 border-top 分节——ih-view-seg/ih-alt-body
 同语言；alt 容器高度走 maxHeight prop 与 qrt-wrap 一口径，无新高度链；卡片网格=ih-cards
 同构 minmax 240px 档）═══ */
.qrt-view-seg { flex-wrap: nowrap; }
.qrt-alt-body { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); }
.qrt-alt-body.is-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2h); align-content: start; }
/* rows 型转置视图（RT rt-transposed 同款语言）——首列 sticky+右分隔线（不透明底） */
.qrt-transposed .qrt-t-field, .qrt-transposed .qrt-t-key { position: sticky; left: 0; z-index: 1; background: var(--bg2); box-shadow: inset -1px 0 0 var(--line); text-align: left; }
.qrt-transposed .qrt-t-field { min-width: 140px; }
.qrt-transposed .qrt-t-key { min-width: 120px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qrt-transposed .qrt-t-val { white-space: pre-wrap; word-break: break-word; max-width: 320px; vertical-align: top; }
/* 对齐 RT rt-info 主信息字号；554 工蚁1：左簇收缩缓冲（ellipsis 吸收，RT rt-info 同款） */
.qrt-coln { font-size: var(--fs-sm); color: var(--tx2); font-variant-numeric: tabular-nums; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 554 工蚁1：.qrt-bar-r 规则迁出（死规则，生效面=TableShell 壳级全局 style 单源），勿搬回内核 */
.qrt-tool-btn { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); }
/* 1150：窄档先掉文字标签再换行（RT 同档同因）——1148 这类窗口右簇「导出 ▾/视图 ⋯/列选/
 布局」整词并排把工具行顶出行宽，右侧钮直接被切掉。:deep 是必须的：ColPicker /
 TablePresetMenu 的标签在子组件模板里，scoped 属性打不中（见 RT 同名块注释）。 */
@media (max-width: 1280px) {
  .qrt-bar :deep(.cp-label), .qrt-bar :deep(.tpm-label) { display: none; }
  /* 1154：导出 ▾ / 视图 ⋯ 的文案同样让位（此前只有列选/布局掉文字，这两颗仍是整词，
     1148 窗口下把右簇顶宽、末尾钮贴边）。字符串保留在 .qrt-tool-t 里，读屏与测试锚不变。 */
  .qrt-bar .qrt-tool-t { display: none; }
}
@media (max-width: 1100px) {
  .qrt-bar { flex-wrap: wrap; row-gap: var(--sp-1); }
  .qrt-bar-r { flex-wrap: wrap; }
}
/* 回顶定位壳（RT rt-wrap-shell 同病同修）——qrt-backtop 的 absolute 锚点
 从整卡 .qrt 下移到滚动视口壳，qrt-pgr 分页行留壳后流内不再被盖；QRT 根非 flex 布局，
 壳只承接定位（最小形态，RT 的 flex 规格不照搬） */
.qrt-wrap-shell { position: relative; }
.qrt-backtop {
  position: absolute; right: 18px; bottom: 16px; z-index: 6;
  display: inline-flex; align-items: center; gap: 3px;
  padding: var(--sp-1) var(--sp-2h); border-radius: 999px;
  background: var(--bg1); border: 1px solid var(--line-strong); color: var(--tx1);
  font-size: var(--fs-xs); cursor: pointer; box-shadow: var(--shadow-pop); transition: all var(--tr);
}
.qrt-backtop:hover { color: var(--ac-hi); border-color: var(--ac-line); }
.qrt-wrap {
  overflow: auto; border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m); background: var(--bg1);
  /* 1439：表格是独立滚动区，paint containment 把上方编辑器每次按键的重绘隔离在表格之外
     （200×23 实测逐键 37ms → 24ms）；弹层/回顶钮都在壳外，不会被子树裁切影响。 */
  contain: paint;
}
.qrt-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
/* 1359b：行少时下方空白用表体底纹延伸（不改 DOM：填充行会被行计数/斑马纹
   当成数据行，实测撞了 rtLocateFilter230 / rtQrtSearchMerge621） */
/* 1365：底纹行距必须跟真实行高走，不能写死 32px——实测三档 21.5 / 25.5 / 41.5px，
   写死 32px 时每个空行都比数据行歪，越往下越明显（读成「下面又起了一张歪表格」）。
   档位类挂在 table 上，用 :has() 从容器下探（Chromium 105+ 起原生支持）。 */
.qrt-wrap { --qrt-row-h: 25.5px; background-image: linear-gradient(var(--line) 1px, transparent 1px); background-size: 100% var(--qrt-row-h); background-repeat: repeat; background-position: 0 0; }
.qrt-wrap:has(.qrt-tbl.dense) { --qrt-row-h: 21.5px; }
.qrt-wrap:has(.qrt-tbl.cozy) { --qrt-row-h: 41.5px; }
/* 1392：底纹**只服务空白区**。数据行此前是透明的，底纹就从行里透出来，与真实
   border-bottom 叠在一起——实测同一条分隔线在 2px/4px 之间交替（表头 25px 与行高
   25.5px 差 0.5px，每条底纹都比边框矮半像素落线），读起来就是「表格中间多了一条条纹」。
   行改成不透明底色，底纹只剩最后一行之下可见（1359b 想要的「同一张网格」效果不减）。
   偶行不能直接用 --hl-soft（半透明罩，底纹照样透出）——叠在同色底上才是实色。 */
.qrt-tbl tbody tr { background: var(--bg1); }
.qrt-tbl tbody tr:nth-child(even) { background: linear-gradient(var(--hl-soft), var(--hl-soft)), var(--bg1); }
/* hover 对齐 RT 行语言（bg2+左侧 3px 品牌强调条） */
.qrt-tbl tbody tr:hover { background: var(--bg2); box-shadow: inset 3px 0 0 var(--ac-hi); }
/* 斑马纹密度态——紧凑密度行距过密时条纹反成噪音（dbx 紧凑场景无条纹），舒适态保留 */
.qrt-tbl.dense tbody tr:nth-child(even) { background: transparent; }
.qrt-tbl th, .qrt-tbl td { padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line); text-align: left; }
/* 1224：列头左右内距必须与全局 `.tbl th` 同档（`var(--sp-2h)`=10px，adaptive556 已锁该标准）。
   此前 QRT 的 th 与 td 共用一条规则 → 列头左右只有 8px，与 RT 的 10px 差 2px；
   两表并排时同一级列头看起来疏密不同。**只覆盖 th，不动 td**——表格体的 8px 是另一处既定密度，
   改它会牵动所有 QRT 宿主的行宽。 */
.qrt-tbl th { padding-left: var(--sp-2h); padding-right: var(--sp-2h); }
.qrt-tbl.dense th, .qrt-tbl.dense td { padding-top: var(--sp-0); padding-bottom: var(--sp-0); }
/* 行高宽松档（RT 同款 12px，两表一致） */
.qrt-tbl.cozy th, .qrt-tbl.cozy td { padding-top: var(--sp-3); padding-bottom: var(--sp-3); }
.qrt-tbl th {
  background: var(--bg2);
  position: sticky;
  top: 0;
  z-index: 2;
  /* 字重/表头线对齐全局 .tbl 与 RT（600+line-strong，dbx 表头层次语言）
 表头底色/文字色对齐 RT（bg2+tx2）——两表视觉语言完全一致 */
  font-weight: 600;
  border-bottom-color: var(--line-strong);
  color: var(--tx2);
  white-space: nowrap;
  user-select: none;
}
.qrt-tbl th.sortable { cursor: pointer; }
.qrt-tbl th.sortable:hover { color: var(--ac-hi); }
.qrt-tbl th.on { color: var(--ac-hi); }
/* 1136：列名是首行唯一常驻元素；长名截断、完整名与类型走 title。
   ⚠ 静息档右侧留白必须 ≥ 图标槽宽：排序 ⇅ 锚在 right:25px、漏斗锚在 right:6px 宽 16px，
   两个图标都脱离文档流压在 th 右缘。此前静息只留 14px，列名一旦宽到 th-14 就压到 ⇅ 上
   （实测 102px 的 issuer_name 列：文字右界比 ⇅ 左界多 11px，悬停更明显）。改 32px
   = ⇅ 锚点 25px + 图标宽 11px 再留 4px 呼吸；悬停档（--sp-6=32px）保持等值，不再跳变。 */
/* 1332：列名盒子必须止步于 th 的内容盒——`inline-block` + `max-width:220px` 时，
 它按**内容宽**排版且不受 th 约束：60px 列里 `region`（66px）盒子直接越过 th 右缘，
 overflow:hidden 再裁也只是裁自己的盒子，越界那截照样压住 ⇅/漏斗（真机拖到最小实测：
 score 列文字右缘越过 ⇅ 左缘 15px、越过漏斗 2px）。改 block + max-width:100%，
 盒子 = th 内容盒，省略号落在图标左侧。
 右内衬同时按可用宽度收敛（min(32px, 30%)，下限 12px）：60px 列若仍留 32px，列名只剩
 8px 连一个字都放不下；宽列 32px 不变（保 ⇅ 25px+图标 11px 的沟槽）。
 ⚠30% 在极窄内容盒下会低于漏斗槽宽（56px 列内容盒 36px → 30%=10.8px，实测仍压 1px），
 所以再压一个 12px 地板——漏斗 left = th 右缘 − 22px，12px 内衬正好落在槽内不重叠。 */
/* 1373：沟槽必须盖住**最靠左的图标**。实测两个 absolute 图标：
   漏斗 right:6px 宽 16px（占右 22px）、排序 ⇅ right:25px 宽 10px（占右 35px）。
   因此静息沟槽 = 35px；原比例制 min(32px, max(12px, 30%)) 在窄列只给 18.6px，
   真机实测 score/region/status 文字压图标 13px、region 整词溢出。比例在窄列必然算不准。 */
.qrt-th-name { display: block; max-width: 100%; padding-right: 35px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
/* 1151：悬停时同样是 35px（⇅ 与漏斗都在，等值不跳变） */
.qrt-tbl th:hover .qrt-th-name, .qrt-tbl th:focus-visible .qrt-th-name, .qrt-tbl th:focus-within .qrt-th-name { padding-right: 35px; }
/* 1373：窄列优先保列名（RT 1189 同裁决）——列宽被拖到 < 100px 时，35px 沟槽会把列名挤到
   几乎无字可显（60px 内容盒只剩 17px）。用 min-width 把 th 撑到能同时放下「几个字 + 图标」，
   而不是牺牲其中一个：icon 不重叠、列名也还在。表格整体仍可横向滚动。 */
.qrt-tbl th:has(.qrt-th-name) { min-width: 96px; }
/* 排序/筛选图标脱离文档流：不再把 8 列每列撑宽 20px；悬停/聚焦才出现，激活常亮 */
.qrt-sort-i { position: absolute; right: 25px; top: 50%; transform: translateY(-50%); font-size: var(--fs-2xs); opacity: 0; transition: opacity var(--tr); }
.qrt-tbl th:hover .qrt-sort-i, .qrt-tbl th:focus-visible .qrt-sort-i { opacity: .5; }
.qrt-tbl th.on .qrt-sort-i { opacity: 1; }
/* 多列排序优先级角标（与 RT 同款）；：9px 裸值归 --fs-2xs */
.qrt-sort-ord { font-size: var(--fs-2xs); color: var(--ac-hi); font-weight: 650; margin-left: 1px; }
/* 1136：类型不再占列头第二行/首行宽度——完整类型进 title/列详情；DOM 保留给既有契约锁。
   1147：静息态完全隐藏（与 RT 同款）——窄列里列名 + 类型 + 箭头三样并排会互相挤爆，
   悬停/聚焦才出类型，列宽始终留给列名。 */
.qrt-th-sub { display: none; }
/* 1151：类型徽标不再浮出（RT 同口径）——浮层带底色会把窄列里的列名盖成「sta」，
 而 opacity:0 又仍占 flex 宽度。类型改由列头 tooltip 首行「类型 · 列名」承载（零遮挡），
 这里只留语义色规则给 DOM 契约锁。 */
.qrt-th-type { display: none; }
/* P2-1：类型语义着色（RT 同款五类简化版） */
.qrt-th-type.rt-ty-num { color: var(--info); }
.qrt-th-type.rt-ty-date { color: var(--warn); }
.qrt-th-type.rt-ty-bool { color: var(--ok); }
.qrt-th-type.rt-ty-text { color: var(--tx1); }
.qrt-th-type.rt-ty-kw { color: var(--ac-hi); }
/* 列头筛选漏斗（激活实色 info 蓝；1136 起绝对定位，悬停/聚焦/生效才可见） */
.qrt-funnel {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; margin: 0; padding: 0;
  border: 0; border-radius: 3px; background: transparent;
  color: var(--tx2); opacity: 0; cursor: pointer;
  transition: opacity var(--tr);
}
.qrt-tbl th:hover .qrt-funnel, .qrt-tbl th:focus-within .qrt-funnel, .qrt-funnel:focus-visible { opacity: .8; }
.qrt-funnel:hover { opacity: 1; color: var(--ac-hi); }
.qrt-funnel.on { opacity: 1; color: var(--info); }
/* 触屏无 hover：常驻弱提示，否则筛选入口不可发现 */
@media (hover: none) {
  .qrt-funnel, .qrt-sort-i { opacity: .55; }
}
/* 554 工蚁1：nowrap 约定迁 TableFilteredHint 单源（bar-left 筛选态提示随 561 合并片段组件；
 弹层槽第二注入位的 .qrt-fmode 规则留内核——两注入位共用类名、片段组件持同款复制） */
.qrt-fmode { border: 1px solid var(--line); background: transparent; color: var(--info); cursor: pointer; font-size: var(--fs-2xs); border-radius: 3px; padding: 0 var(--sp-1); line-height: 1.4; }
.qrt-fmode:hover { border-color: var(--info); }
.qrt-nomatch td { text-align: center; color: var(--tx2); padding: 14px var(--sp-2); font-size: var(--fs-sm); }
/* M4：渲染截断提示行（RT 同语言——弱化灰字） */
.qrt-trunc-row td { text-align: center; color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-2); background: var(--bg1); }
/* P0-3：跳转到列——目标列头闪烁（RT 同款，1400ms 自动熄灭） */
th/* ：列拖拽三态（RT 1824-1826 同款视觉语言） */
.qrt-th-name.qrt-drag-src { opacity: .4; }
th.qrt-drop-before { box-shadow: inset 3px 0 0 var(--info); }
th.qrt-drop-after { box-shadow: inset -3px 0 0 var(--info); }
.qrt-col-flash { animation: qrt-col-flash-kf 1.4s ease-out; }
@keyframes qrt-col-flash-kf { 0%, 60% { background: var(--info-soft); box-shadow: inset 0 0 0 2px var(--info); } 100% { background: transparent; } }
/* 筛选弹层壳样式（.qfp-* 全家）随壳合并共享件 ColFilterPopover（cfp-*），
 z 字面量 1200/1201 同步收口 var(--z-ctx)/calc(var(--z-ctx)+1) */
/* 聚合 footer 行（tfoot）样式系随 561 合并 TableAggFoot 全局单源（原 scoped
 规则打不中片段元素，迁出勿搬回；dense/cozy/冻结 sticky/hScrolled 投影同迁） */
.qrt-rs { position: absolute; right: 0; top: 0; bottom: 0; width: 5px; cursor: col-resize; user-select: none; }
.qrt-rs:hover { background: var(--ac-soft); }
.qrt-cell {
  position: relative;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  vertical-align: top;
  cursor: copy;
}
/* hover 行内快捷钮（dbx 悬浮行内钮）——复制行 JSON 浮在行尾格右缘，
 不占常驻空间；不透明底防与数据文字重叠难读；移出行消失 */
/* 1148：末列（行级动作注入位）不换行——注入钮此前被挤到第二行，把整行撑高一倍
（截图里「复制行信息」掉到「更多」下面）。行尾钮一律并排：
末列里的块级 flex 容器（如 .bw-acts）改行内 flex，注入钮与之同行。 */
.qrt-tbl tbody tr > td:last-child { white-space: nowrap; }
.qrt-tbl tbody tr > td:last-child > * { display: inline-flex; vertical-align: middle; align-items: center; }
.qrt-row-copy {
  position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer;
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.qrt-tbl tbody tr:hover .qrt-row-copy { opacity: 1; pointer-events: auto; }
.qrt-row-copy:hover { color: var(--ac-hi); border-color: var(--ac-line); }
/* 1366：Ctrl+点击聚合的选中格——与 RT 的 .agg-sel 同语言（软底 + 左缘强调条） */
.qrt-tbl td.qrt-agg-sel { background: var(--ac-soft); box-shadow: inset 2px 0 0 var(--ac-hi); }
/* 1405：拖拽框选矩阵——与 RT .rt-region 同一视觉语言（软底+内描边），
 与散选聚合（.qrt-agg-sel 左缘强调条）区分：一个是矩阵，一个是点选集合 */
.qrt-tbl td.qrt-region { background: var(--info-soft); box-shadow: inset 0 0 0 1px var(--info-line); }
/* 1408：触屏两击框选的起点——虚线描边告诉用户「这一角已定，再点对角」 */
.qrt-tbl td.qrt-region-anchor { outline: 2px dashed var(--info-line); outline-offset: -2px; }
/* 框选时单元格文字不可被浏览器文本选择抢走（拖选语义是矩阵，不是复制文本） */
.qrt-tbl tbody td.qrt-cell { user-select: none; }
/* 1366：页脚状态栏（RT .rt-status 同款页脚语言）——贴死表体下沿、只留底部圆角；
   分页行在场时由 .has-pgr 接管卡底（既有规则），此处让位 */
.qrt-status {
  display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-1h) var(--sp-2h);
  background: var(--bg1); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r-m) var(--r-m);
  font-size: var(--fs-xs); color: var(--tx1);
  /* 1413：三段（框选 / 行选中 / 格聚合）可能同时在场——实测 1440 宽下「清除」被挤出
     可视区（scrollWidth 803 > clientWidth 760）。两条一起做：①聚合段的 min/max/count
     收进 tooltip（省约 200px）；②容器允许换行、但**段内绝不拆**——空间不够时整段下沉
     而不是把行尾按钮裁掉。实测三段并存为两行（32px → 约 56px），按钮全部可点。 */
  flex-wrap: wrap; row-gap: var(--sp-1);
}
.qrt-wrap.has-pgr + .qrt-status { border-radius: 0; }
/* 1413：动作段成簇——段内永不拆行，容器可换行。三段并存时整段下沉，按钮不会被裁掉。 */
.qrt-stat-seg { display: inline-flex; align-items: center; gap: var(--sp-3); min-width: 0; white-space: nowrap; }
/* 1413：动作钮不可被压缩/裁切；段内提示是唯一可收缩项（省略号），空间不够时先丢字不丢钮 */
.qrt-stat-seg > .qrt-stat-x { flex: none; }
.qrt-stat-seg > .qrt-stat-hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.qrt-status > .qrt-kbd-hint { margin-left: auto; }
/* 行尾留空：零内容、可收缩，不单独占一行（换行布局下 flex:1 的空块会撑出第二行） */
.qrt-status-fill { flex: 1 1 0; min-width: 0; height: 0; }
.qrt-status .qrt-stat { font-family: var(--mono); }
.qrt-status .qrt-stat-hint { color: var(--tx2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qrt-sel-badge { color: var(--tx1); }
.qrt-sel-badge b { color: var(--ac-hi); }
.qrt-stat-x {
  flex: none; padding: 1px var(--sp-2); font-size: var(--fs-xs); cursor: pointer;
  background: var(--bg2); color: var(--tx1); border: 1px solid var(--line); border-radius: var(--r-xs);
}
.qrt-stat-x:hover { border-color: var(--ac-line); color: var(--ac-hi); }
/* _index 格跳转芯片——行内常驻小图标（悬浮不消失，与行复制钮同语言） */
.qrt-idx-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.qrt-idx-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
.qrt-cell.expanded {
  white-space: normal;
  word-break: break-all;
  max-width: 520px;
}
.qrt-null { color: var(--tx2); opacity: .55; user-select: none; }
/* ═══ W7：行内展开详情行——随壳合并 TableExpandRow，
 .rt-expand 系样式迁 TableShell.vue 单一出处（此前与本文件逐字重复的双份定义）═══ */
/* ═══ W7：长 JSON 折叠预览 chip（点击开单元格详情弹窗；RT 同款类名复用视觉语言）═══ */
.rt-json-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; overflow: hidden; padding: 1px var(--sp-2); border: 1px solid var(--line); border-radius: 99px; background: var(--bg2); color: var(--tx1); font-size: var(--fs-xs); cursor: zoom-in; font-family: var(--mono); }
.rt-json-chip:hover { border-color: var(--ac-line); color: var(--ac-hi); }
.rt-json-chip-p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt-json-chip-n { color: var(--tx2); flex-shrink: 0; }
/* W7：ip 列等宽（.qrt-cell 本就 mono，类语义显式化+防视觉回归漂移） */
.qrt-cell.ip-col { font-family: var(--mono); }
/* ═══ W-B：semOn 语义分档色（全站 pill 五档语言：g=ok/y=warn/r=err/b=info/n=次级文字）——
 仅 semOn prop 开且 semFormat 命中 percent 分档时上类，缺省零类零增量 ═══ */
.qrt-cell.qrt-sem-g { color: var(--ok); }
.qrt-cell.qrt-sem-y { color: var(--warn); }
.qrt-cell.qrt-sem-r { color: var(--err); }
.qrt-cell.qrt-sem-b { color: var(--info); }
.qrt-cell.qrt-sem-n { color: var(--tx2); }
/* W-B：selectable 勾选列（首列窄列，视觉语言对齐序号列）——缺省不渲染 */
.qrt-sel-col { width: 34px; min-width: 34px; text-align: center; }
.qrt-sel-col input { vertical-align: middle; cursor: pointer; }
.qrt-tbl tbody tr.qrt-sel > td { background: var(--ac-soft); }
/* ═══ W-B：rowDrawer 行详情侧拉内容排版（n-drawer 载体；仅 prop 开启后可达）═══ */
.qrt-rdw-meta { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h) var(--sp-2); margin-bottom: var(--sp-2); background: var(--bg2); border-radius: var(--r-s); }
.qrt-rdw-row { display: flex; align-items: flex-start; gap: var(--sp-2); padding: 5px var(--sp-0); border-bottom: 1px dashed var(--line); font-size: var(--fs-xs); }
.qrt-rdw-k { flex-shrink: 0; min-width: 110px; max-width: 40%; color: var(--ac-hi); overflow-wrap: anywhere; font-family: var(--mono); }
.qrt-rdw-v { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; font-family: var(--mono); }
/* W7：行尾展开钮（hover 显隐，与 qrt-row-copy 同语言，右移让位复制钮） */
.qrt-row-expand {
  position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer;
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.qrt-tbl tbody tr:hover .qrt-row-expand { opacity: 1; pointer-events: auto; }
.qrt-row-expand:hover { color: var(--ac-hi); border-color: var(--ac-line); }
/* ═══ ：冻结序号列（对齐 RT dbx/Excel 冻结窗格）——宽表横向滚动时行身份（序号）不滚走。
 border-collapse 下 sticky 自带边框会丢，右分隔线用 box-shadow 画；背景必须不透明。
 RT 铁律：sticky left 常量必须配 min-width 锁死——table-layout:auto 会把 width 建议值
 压缩（实际渲染宽 < 定位常量），不透明冻结层会遮住首列左侧字符；52px 同 RT 序号列。 ═══ */
.qrt-tbl th.qrt-idx, .qrt-tbl td.qrt-idx {
  box-sizing: border-box; position: sticky; left: 0; width: 52px; min-width: 52px;
  z-index: 2; box-shadow: inset -1px 0 0 var(--line);
  color: var(--tx2); text-align: right; padding-left: var(--sp-0); vertical-align: middle;
}
/* 表头序号是 top+left 双轴 sticky，层级须压过普通 sticky 表头（z-index 1） */
.qrt-tbl th.qrt-idx { z-index: 4; }
.qrt-tbl td.qrt-idx { background: var(--bg2); }
.qrt-tbl tbody tr:hover td.qrt-idx { background: var(--bg-hover, var(--bg2)); }
/* ═══ /：冻结首业务列（freezeFirst）═══
 sticky left=52px（序号列已锁宽，前缀精确）；底色不透明三态同步；
 th 双轴 top+left z-index 3 与序号列表头同级。 ═══ */
/* P2-4：left 由 frozenStyle 内联按前缀宽度动态计算（多列冻结） */
.qrt-tbl th.qrt-col-frozen, .qrt-tbl td.qrt-col-frozen {
  position: sticky; z-index: 3;
  box-shadow: inset -1px 0 0 var(--line-strong);
}
.qrt-tbl th.qrt-col-frozen { background: var(--bg2); z-index: 4; }
.qrt-tbl td.qrt-col-frozen { background: var(--bg1); }
/* 横向滚动态（is-hscrolled）冻结缘投影——RT 同款，明示普通列被盖在冻结层下 */
.qrt.is-hscrolled .qrt-tbl th.qrt-idx, .qrt.is-hscrolled .qrt-tbl td.qrt-idx,
.qrt.is-hscrolled .qrt-tbl th.qrt-col-frozen, .qrt.is-hscrolled .qrt-tbl td.qrt-col-frozen { box-shadow: inset -1px 0 0 var(--line-strong), 8px 0 10px -6px rgba(0, 0, 0, .38); }
.qrt-tbl tbody tr:hover td.qrt-col-frozen { background: var(--bg2); }
.qrt-tbl tbody tr.qrt-row-focus td.qrt-col-frozen { background: var(--ac-soft); }
.qrt-tbl tbody tr.qrt-row-focus > td.qrt-idx { background: var(--ac-soft); }

/* 右簇聚合菜单（导出 ▾ / 视图 ⋯）——浮层四要素齐备（bg1 底/强边线/阴影/圆角） */
.menu-wrap { position: relative; }
.qrt-tool-btn.on { border-color: var(--ac-line); color: var(--ac-hi); }
/* 1375：与 RT 同修——封高 + 内部滚动，避免工具行靠下时末项被裁掉点不到 */
.qrt-menu { position: absolute; top: calc(100% + var(--sp-1)); right: 0; z-index: 60; background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); padding: var(--sp-1h); min-width: 230px; max-height: min(70dvh, 420px); overflow-y: auto; overscroll-behavior: contain; }
.qrt-mi { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-1h) var(--sp-2h); border: 0; background: transparent; border-radius: var(--r-s); color: var(--tx1); font-size: var(--fs-xs); cursor: pointer; text-align: left; white-space: nowrap; }
.qrt-mi:hover:not(:disabled) { background: var(--bg2); color: var(--tx0); }
.qrt-mi:disabled { color: var(--tx2); opacity: .55; cursor: default; }
.qrt-mi.on { color: var(--ac-hi); }
.qrt-mi-f { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--ac-hi); width: var(--sp-5); flex-shrink: 0; }
.qrt-m-t { padding: var(--sp-1) var(--sp-2h) 0; font-size: var(--fs-2xs); color: var(--tx2); letter-spacing: .05em; }
.qrt-m-sep { height: 1px; background: var(--line); margin: var(--sp-1) var(--sp-2); }
</style>
