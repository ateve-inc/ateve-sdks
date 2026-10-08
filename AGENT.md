# 提交规范

本仓库的所有 Git 提交必须遵守 Conventional Commits。

## 格式

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer]
```

- 标题使用英文，描述采用祈使语气，简明说明实际改动，不以句号结尾；建议控制在 72 个字符以内。
- `feat` 用于新增功能，`fix` 用于修复缺陷。
- 其他类型包括 `refactor`、`docs`、`test`、`build`、`ci`、`chore`、`perf` 和 `revert`，按实际改动选择。
- scope 可选；推荐使用 `repo`、`contract`、`codegen`、`js`、`python`、`java` 或 `ci`。
- 正文与标题之间保留空行，说明改动原因、关键行为与验证结果。
- 破坏兼容性的改动必须使用 `!` 或 `BREAKING CHANGE:` footer，并说明影响和迁移方式；仅调整内部目录或开发工具且公共 SDK 保持兼容时，不标记为破坏性变更。

## 示例

```text
refactor(repo): migrate SDKs to a contract-driven monorepo
fix(python): preserve explicit null values in response models
docs(repo): document workspace setup
feat(js)!: change the search response interface

BREAKING CHANGE: Describe the public API change and migration steps.
```

## 提交前

- 检查 diff 和暂存区，只提交当前任务相关的改动。
- 修改模型契约或生成器时，运行 `pnpm generate` 并一并提交生成结果。
- 按改动范围执行必要检查；代码重构使用 `pnpm check`，仅文档改动无需重复完整测试。
- 执行 `git diff --cached --check`，避免提交空白错误。
- 不提交环境目录、构建产物、缓存或凭据；不跳过提交钩子。
