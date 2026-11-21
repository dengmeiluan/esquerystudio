# 上架 Chrome Web Store — 操作手册

本文是 ESQueryStudio Chrome 扩展的商店提交清单。所有可自动化的准备（打包、商店文案、
截图、隐私政策、校验）已经完成；最后的上传与提交必须使用**你自己的 Google 账号**在
Chrome Web Store Developer Dashboard 完成。

商店链接前缀：<https://chrome.google.com/webstore/devconsole>

> 注意：Chrome 扩展上架的是 **Chrome Web Store**，不是 Google Play（后者只分发 Android APK/AAB）。

## 0. 前置条件（只需一次）

1. 准备一个 Google 账号，并开启 **两步验证**（Chrome Web Store 强制要求）。
2. 注册 Chrome Web Store 开发者账号，支付 **一次性 5 美元** 注册费：
   <https://chrome.google.com/webstore/devconsole>
3. 验证联系邮箱，接受开发者分发协议。
4. 若面向欧盟用户，按 DSA 要求填写 **Trader / Non-trader** 身份声明；个人开发者通常选
   Non-trader，代价是该条目不会在欧盟展示。

## 1. 生成上传包

在仓库根目录执行：

```bash
bash extensions/chrome/package-for-store.sh
```

产物：`dist/esquerystudio-extension-1.0.0.zip`（manifest.json 位于 zip 根目录）。
脚本会校验 zip 完整性并打印根文件列表。

同时可跑扩展守卫与商店就绪门禁：

```bash
node scripts/verify-extension.mjs
node scripts/check-store-package.mjs
```

后者校验 manifest 45/132 字符上限、运行时可选 host 权限、图标与截图尺寸、文案长度和 zip 产物。

## 2. 创建商店条目并上传

1. 打开 <https://chrome.google.com/webstore/devconsole> → **New item**。
2. 上传 `dist/esquerystudio-extension-1.0.0.zip`。
3. 首次上传后，Dashboard 会分配 **Item ID**；记下来，后续更新使用同一 Item。
4. 若上传报错，检查：zip 根目录必须有 `manifest.json`；不要把 `dist/` 父目录或
   `README.md` 打进去；版本号必须大于上一次上传的版本。

## 3. 填写 Store listing

逐项复制 [`store-listing.md`](store-listing.md) 中的字段：

- **Name**：`ESQueryStudio — Elasticsearch Query Workbench`（45 字符，已达上限）
- **Summary**（manifest 描述）：128 字符，已在 `manifest.json` 中
- **Detailed description**：英文 1310 字符（≤1320）
- **Category**：Developer Tools
- **Language**：主语言选 Chinese (Simplified)（控制台 UI 为中文）；再加 English 本地化
- **Homepage**：https://github.com/dengmeiluan/esquerystudio
- **Support URL**：https://github.com/dengmeiluan/esquerystudio/issues
- **Privacy policy URL**：
  https://gist.github.com/dengmeiluan/5de4486616c4f313b8e473b26adf69b7

> 该公开 gist 已创建并验证匿名可读，可直接提交。仓库内的 `docs/privacy-policy.md` 是长期维护源；
> 推送到 `main` 后可以把商店 URL 换成仓库文件地址。更换前用无痕窗口确认新 URL 可匿名访问。

### 图形素材

| 用途 | 文件 |
|---|---|
| Store icon 128×128 | `extensions/chrome/icons/icon128.png` |
| 截图 1–5（1280×800） | `extensions/chrome/store/screenshots/01..05-*.png` |
| Small promo tile 440×280（可选） | `extensions/chrome/store/promo/small-tile-440x280.png` |
| Marquee 1400×560（可选） | `extensions/chrome/store/promo/marquee-1400x560.png` |

## 4. Privacy practices（隐私问卷）

按 [`store-listing.md`](store-listing.md) 的「Permission justifications」和
「Data usage declaration」填写：

- 单一用途：`Provide a browser-based Elasticsearch query and operations workbench that
  connects directly to a user-configured cluster.`
- `storage`：保存连接档案、草稿、历史、收藏与本地偏好。
- `contextMenus`：右键用选中文本预填查询。
- `alarms`：Chrome 运行时按间隔做本地监控采样。
- 可选 host 授权（`http://*/*`、`https://*/*`）：Elasticsearch 可能部署在任意主机/端口/
  反向代理，无法预先枚举域名；扩展只在用户点「连接」时请求其填写地址的**精确 origin**，
  拒绝授权则不发起请求，不读取其他网站。
- 数据收集：**不收集、不传输、不出售、不共享**；无分析/广告/崩溃上报 SDK。
- 远程代码：**No**；所有脚本随包分发。
- 商店可能会要求填写「为什么需要宽泛主机权限」，直接使用上面的说明。

## 5. 提交审核

1. Distribution → **Public**，选择可分发地区（默认全部）。
2. 确认没有未填写的红色必填项。
3. 点击 **Submit for review**。
4. 审核周期通常几天到两周。被拒时按邮件里的政策条款修改后重新提交，不要重复创建新条目。

## 6. 审核通过后

- 商店条目会自动公开，用户可通过搜索或链接安装。
- 更新版本时：修改 `extensions/chrome/manifest.json` 与 `ui/package.json` 的版本号（两者必须
  一致，`verify-extension.mjs` 会校验）→ 重新打包 → 在同一 Item 上传 → 提交审核。
- 建议在 GitHub Release 里同时附上同一个 zip，方便无法访问商店的用户侧载。

## 7. 常见拒审原因与对应处理

| 原因 | 处理 |
|---|---|
| 宽泛主机权限未说明 | 使用第 4 节的权限理由；强调只在用户配置的 ES 地址上请求。 |
| 缺少隐私政策 | 已提供 `docs/privacy-policy.md`，确保 URL 公网可访问。 |
| 远程代码 | 本扩展无远程代码；不要引入 CDN、`eval` 或动态 `import()`。 |
| 单一用途不清 | 使用第 4 节的 single purpose 描述。 |
| 截图/描述与功能不符 | 截图来自当前源码构建；描述里的功能与 52 页面控制台一致。 |
| 版本号未递增 | 每次上传必须递增 `version`。 |

## 8. 我（助手）无法代做的部分

以下动作必须由账号持有人完成，属于 Google 账号与支付行为：

- 注册开发者账号并支付 5 美元；
- 登录 Dashboard、上传 zip；
- 接受分发协议、填写 DSA/Trader 声明；
- 点击 Submit for review。

除此之外的打包、文案、截图、隐私政策、校验均已在本仓库就绪。
