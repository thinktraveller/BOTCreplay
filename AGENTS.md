<!-- --- project-initializer (managed) START --- -->
# 项目协作规范

## 一、目录约定（强制）

- 所有测试、验证与验收脚本必须放在项目根目录的 `_verify/` 下，且不纳入任何 Git 仓库
- 所有项目 agent 文档必须放在 `project-docs/` 下：
  - `goal.md`：目标文档
  - `project-plan.md`：构建计划书
  - `buildlog.md`：构建/修复日志
  - `teach.md`：项目讲解笔记
- 其它项目文件（各类分析、验收报告、调研资料等）必须放在 `project-docs/docs/` 下
- 各类参考文件（外部项目源码、示例、素材、调研资料等）必须放在项目根目录的 `reference-projects/` 下，且不纳入任何 Git 仓库
- 项目源代码与配置放在项目根目录或其业务子目录中，不得写入 `project-docs/`、`_verify/` 或 `reference-projects/`

## 二、仓库布局

- **主仓库**（项目根目录）：只追踪源代码、配置、`.gitignore` 与 `AGENTS.md`；通过 `.gitignore` 排除 `project-docs/`、`_verify/` 与 `reference-projects/`
- **project-docs 仓库**（`project-docs/`）：独立 Git 仓库，负责所有文档（含 `docs/` 子目录）

## 三、提交约定（强制）

每完成一次任务，必须产生 **2 个 Git 提交**：

1. **主项目仓库提交**：只包含本任务涉及的源码/配置，不包含 `project-docs/`、`_verify/` 与 `reference-projects/`
2. **project-docs 独立仓库提交**：包含本任务产生的全部文档

```powershell
# 1) 主仓库
git status --short
git add <本任务涉及的文件路径>
git commit -m "<type>: <描述>"

# 2) project-docs 仓库
git -C project-docs status --short
git -C project-docs add <本次涉及的文档路径>
git -C project-docs commit -m "docs: <描述>"
```

- 两个仓库均**禁止**使用 `git add .` 或 `git add -A`，必须显式列出路径
- 禁止把 `_verify/`、`reference-projects/` 下的文件、`.env`、密钥文件提交到任何仓库
- 任务未完成两次提交，不得宣告完成
<!-- --- project-initializer (managed) END --- -->
