# 发布流程（初版 · 滚动更新）

ESQueryStudio 只有一条发布线：**「初版（滚动更新）」**。版本号可以递增，但仓库始终只保留一个初版提交、一个标签和一个 Release；每次发布直接覆盖旧内容，不追加 release / tag / commit / deployment / image 历史。

## 发布前检查

1. `main` 在 CI 中全绿（后端、前端、typecheck、CodeQL）。
2. `CHANGELOG.md` 的「初版（滚动更新）」条目已更新。
3. 版本号在以下文件中一致：
   - `pom.xml` 的项目版本
   - `ui/package.json`
   - `CITATION.cff`
4. 本地通过 release profile：

   ```bash
   cd ui && npm ci && npm run build && cd ..
   mvn -P release -DskipTests -Dconsole.build.skip=true verify
   ```

5. 可复现检查：连续构建两次 `package`，比较 `platform`、`console`、`server` jar 的 SHA-256，必须一致。
6. 扩展 zip 从当前源码重新构建，`SHA256SUMS` 同步更新。

## 覆盖式推送

```bash
# 1. 把工作树压成唯一一个「初版」提交（保留完整工作树，不保留历史提交）
git checkout --orphan initial
git add -A
git commit -m "初版：ESQueryStudio <版本> — 为 Spring Boot 而生的 Elasticsearch 查询工作台（滚动更新）"
git branch -M main

# 2. SSH 免密强制覆盖 main
git push --force origin main

# 3. 单一标签指向同一个初版提交，强制覆盖
#    标签必须等于 v + 项目版本（例如当前 1.0.64 → v1.0.64），否则 Release workflow 会拒绝
git tag -f -a v1.0.64 -m "ESQueryStudio 初版（滚动更新）"
git push --force origin refs/tags/v1.0.64
```

`Release` workflow 校验标签与各项目版本一致（`$GITHUB_REF_NAME == v$VERSION`），构建 UI、Maven 产物、sources、Javadoc、SBOM，写入 `SHA256SUMS` 与 provenance attestation，并创建或更新唯一的 Release。

## Release 正文与资产

- 正文以 [`docs/release-body.md`](release-body.md) 为唯一事实源，名称固定为 `ESQueryStudio 查询工作台 · 初版（滚动更新）`。
- 每次发布用 API 直接覆盖同名 Release 的正文与资产；如果资产同名，先删除再上传。
- 发布后回读名称、正文、标签与资产 SHA，确认与本地构建一致。
- 不新增 tag、不新增 Release、不新增 deployment、不推送镜像。

## 构建产物

| 文件 | 用途 |
|---|---|
| `esquerystudio-server-<version>.jar` | 独立 server（boot jar） |
| `esquerystudio-platform-<version>.jar` | 宿主用平台内核 |
| `esquerystudio-console-<version>.jar` | 可嵌入 console + 引擎 |
| `*-sources.jar`、`*-javadoc.jar` | 库模块源码与 API 文档 |
| `esquerystudio-sbom.json` | CycloneDX SBOM |
| `esquerystudio-chrome-<version>.zip` | MV3 Chrome 扩展（前端直连查询工作台） |
| `SHA256SUMS` | 所有产物的校验和 |

## Maven Central

当前不发布到 Maven Central。需要时在 `release` profile 中补充 `distributionManagement`、签名密钥（`maven-gpg-plugin`）与 Central 发布插件；sources、Javadoc、SBOM 与可复现时间戳已经具备。

## 回滚

- 资产有问题、代码无问题：本地保留上一版资产，直接覆盖回上一版并更新 `SHA256SUMS`。
- 代码有问题：修复后重新执行覆盖式推送，不新增 patch 版本历史。
- 安全问题：按 [SECURITY.md](../SECURITY.md) 处理，修复后覆盖发布，并在用户可升级后再披露细节。
