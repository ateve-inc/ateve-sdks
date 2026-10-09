---
name: ateve-sdk-maintenance
description: 维护 Ateve SDKs 仓库的 JavaScript、Python、Java SDK、共享 OpenAPI 契约、模型生成器、pnpm/uv/Turborepo 工作区、CI、打包与发布流程时使用。适用于本仓库的实现、修复、重构、依赖升级和维护审查；普通 SDK 使用咨询不触发此 skill。
---

# Ateve SDK 仓库维护

## 开始工作

1. 定位仓库根目录，读取 [AGENT.md](../../../AGENT.md)、[README.md](../../../README.md)，检查 Git 状态与任务涉及的 diff。保留已有改动，在当前分支完成已授权工作。
2. 以当前源码、测试、锁文件和 CI 为事实来源；本文的约束随实现变化一并更新。用户明确要求的行为变更优先于兼容基线，先确定影响再实现。
3. 按任务读取 [契约维护说明](../../../packages/contract/README.md)、[生成器说明](../../../tools/codegen/README.md)、[任务配置](../../../turbo.json) 或 [CI/发布工作流](../../../.github/workflows)。无需每次加载全部 SDK。

## 工作区与执行入口

| 路径                | 开发职责与任务名称                                           |
| ------------------- | ------------------------------------------------------------ |
| `packages/contract` | 私有契约、语言映射和共享样例；`@ateve/contract`              |
| `tools/codegen`     | 模型生成、工具链指纹、版本与产物检查；`@ateve/codegen`       |
| `packages/js`       | JS/TS 客户端；工作区名 `@ateve/js`，发布名 `ateve`           |
| `packages/python`   | 原生 uv 工作区成员 `ateve`；Hatchling 打包                   |
| `packages/java`     | Maven 项目 `ai.ateve:ateve-java`；私有任务入口 `@ateve/java` |

根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm check
```

- 开发工具需要 Node 24+、pnpm、uv/Python、Maven/JDK；确切版本读取根清单与 CI。使用系统已安装工具，缺少环境时报告具体缺项。
- pnpm 与根 `uv.lock` 分别锁定 JS 和 Python 开发依赖；主动升级时更新对应锁文件，普通安装保持冻结。Python 环境位于根 `.venv`。
- 根 `pnpm lint`、`typecheck`、`test`、`build` 经过工具链指纹入口。局部 JS/Java/生成器检查可用 `pnpm --filter @ateve/js test` 等；Python 原生检查从 `packages/python` 运行 `uv run --locked pytest`、`uv run --locked mypy`。
- JS `lint` 使用 oxlint 检查源码、测试及构建配置，正确性规则报错且拒绝警告；`typecheck` 独立使用 `tsc --noEmit`。Python 使用 Ruff/mypy，Java 使用 Maven `validate`/`test-compile`，工具脚本 lint 为 Node 语法检查。
- 根 `pnpm format` 写入 oxfmt 格式，`pnpm format:check` 只读检查；两者也注册为不缓存的 Turbo 根任务，`pnpm check` 通过 Turbo 先执行格式检查，CI 复用此入口。oxfmt 不负责 Python/Java 源码格式化。
- 格式化排除生成模型和 `.generated-models.json`；通过契约/生成器管理这些文件，不为通过格式检查而手改生成输出。维护排除规则时同步核对生成清单。
- SDK 继续支持各自原生构建，已发布 SDK 的安装和调用不依赖 Node、Turbo 或契约包。

## 修改契约与生成模型

1. API 字段名称、协议类型、说明和约束只修改 `packages/contract/openapi.json`。它是从现有 SDK 提取的兼容基线；对齐最新服务端协议属于独立任务。
2. 在 `components.schemas` 定义命名对象/枚举，嵌套对象使用本地 `$ref`；对象标明 `x-sdk-kind`。`bindings.json` 只记录语言行为差异，不复制协议字段定义。
3. 如需特殊校验或转换，修改生成器模板钩子/手写辅助代码。生成器只支持明确声明的结构；遇到新结构先扩展实现和测试，禁止静默退化为宽泛类型。
4. 运行 `pnpm generate`，审查三个语言的 diff、导出和 `.generated-models.json`；删除模型时同时核对旧文件清理。提交契约、必要钩子和生成结果。
5. 运行 `pnpm generate:check` 与相关模型测试；完成代码变更后运行 `pnpm check`。增删字段、模型或生成逻辑时，覆盖确定性、传播、未知结构报错、漂移与旧文件清理。

生成入口为 JS `src/types.ts`、Python `src/ateve/models.py`/`_model_exports.py`、Java `src/main/java/ai/ateve/models/*.java`。禁止手改生成文件。HTTP 客户端、异常、JS 序列化/响应解析与语言专属配置保持手写。

生成器先在自己的 `generated/` 中生成候选文件，SDK 任务只同步本包输出。检查在内存中比较内容、缺失、多余文件及清单，不写源码、不使用缓存；测试和构建消费已提交模型。

## 保持语言行为

修改模型或客户端时，核对语言各自的公共接口和原有断言，不用统一三语言行为的方式修复测试：

- TS 保留类型名称、camelCase、可选字段与显式 `null` 的差别；日期为 ISO 字符串。缺失图片列表归一为 `[]`，未知响应字段省略。
- Python 保留导入路径、`datetime`、Pydantic 配置、既有非严格转换及严格字段校验。请求冻结且拒绝额外字段，响应保留未知字段；缺失图片列表为 `[]`。
- Java 保留 `ai.ateve.models`、Builder/访问方法、构建快照、集合不可变性、整数宽度及 `Instant` 毫秒序列化；缺失图片列表为 `null`，未知响应字段忽略。
- 使用契约共享 JSON 样例，各 SDK 独立断言缺失、显式 `null`、未知字段、日期/时区与校验边界；保留 Java 原有样例值。
- 涉及请求路径时验证单次 HTTP 请求、无自动重试、超时、取消、并发限制、响应大小限制和错误元数据。注入的 HTTP 客户端所有权按原实现处理。

## 维护工具链与缓存

- `tools/codegen` 使用 TypeScript ESM，通过 Node 原生类型剥离直接运行：显式 `.ts` 导入、`import type`、可擦除语法；运行时不负责类型检查，另跑 `tsc --noEmit`。
- Python 由 Turbo 原生发现根 uv 工作区，保留 `experimentalPythonWorkspaces`、`experimentalTaskCommand` 对应配置。Python 不增加 `package.json` 包装；Java 继续使用 Maven 任务入口。
- 原生任务的 `command` 在成员目录执行。Python 构建使用已同步的锁定 Hatchling：`uv build --no-build-isolation --package ateve --out-dir dist`；产物保留在成员 `dist`，锁一致性由根检查负责。
- 升级 Turbo 或采用实验能力时，先查看已安装版本的 `node_modules/turbo/docs/README.md` 与相关文档，再核对实际任务图和执行目录。修改清单、锁文件、配置、CI 和说明保持一致。
- 缓存键纳入契约、映射、模板/钩子、锁文件及实际工具链信息；扩展 `inputs` 时保留需要的 `$TURBO_DEFAULT$` 和跨包输入。输出只包含候选模型、生成文件和包构建产物。
- `.venv`、缓存目录、测试报告和带检出路径的 Maven 元数据不缓存；测试、生成漂移检查、发布及签名不缓存。保留 `agentGuidance: false`，防止验证自动改写仓库指导文件。
- 改动任务图或缓存策略后，在临时干净检出中验证缓存恢复、契约变更导致失效及检查后源码无漂移；不要删除当前工作区文件来模拟恢复。

## 验证与交付

- 修改前记录相关原有检查结果；已有失败单独说明，不通过削弱断言掩盖。仅文档改动做结构、引用和 diff 检查，无需重复全套 SDK 测试。
- 代码改动运行 `pnpm check`：格式、统一版本、uv 锁、契约/生成一致性、静态检查、测试、构建。按涉及行为补充有效回归验证。
- 改动构建、打包或公共导出时，根构建后运行 `node tools/codegen/src/check-artifacts.ts`，检查 npm 包、Python wheel/sdist、Java JAR，并从产物执行本地调用示例。
- 结构、依赖或开发流程变更，从临时干净检出执行冻结安装、`pnpm bootstrap`、`pnpm check`，核对 CI 当前 Python/JDK 矩阵及 Node 约束。
- 提交前审查生成 diff 和暂存范围，执行 `git diff --cached --check`，遵守 [Conventional Commits 规范](../../../AGENT.md)，不提交环境、产物或凭据。
- 交付说明实际改动、验证结果和仍存在的限制；区分预期源码改动与检查产生的额外变动。

## 发布任务

- 保持 npm/PyPI 的 `ateve` 与 Maven 的 `ai.ateve:ateve-java` 身份。统一 SDK 清单、客户端版本常量、契约版本及 `v*` 标签；具体校验范围读取 `tools/codegen/src/versions.ts`。
- 发布准备运行版本、生成、完整检查及产物验证；标签验证使用现有工作流中的 `GITHUB_REF_TYPE`/`GITHUB_REF_NAME`，避免另建不同规则。
- JS 用 `pnpm pack` 应用 `publishConfig.name`，确认包内名称为 `ateve`，再按工作流发布 tarball；直接从工作区清单发布可能使用 `@ateve/js` 名称。
- Python 保留 Hatchling 与 PyPI OIDC，npm 保留 OIDC/provenance，Java 保留 Maven Central 签名配置。修改流程时复用现有身份和 secrets 引用，不输出凭据。
- 仅在用户已授权相应动作时发布、创建/推送标签或推送提交；普通维护任务完成本地验证和请求的提交即可。
