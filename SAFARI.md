# Read Frog for macOS Safari

这个 fork 为 [Read Frog](https://github.com/mengxi-ream/read-frog) 增加 macOS Safari 支持，并每日跟随上游 `main`。支持 Apple Silicon 与 Intel Mac；目标为 macOS 14 或更新版本、Safari 18.4 或更新版本。iPhone / iPad 需要单独的签名和设备验证，本仓库当前交付 Mac 版本。

## 下载与安装

从 [Safari Releases](https://github.com/stellarjmr/read-frog/releases/latest) 下载 `Read-Frog-Safari-macOS.zip`，解压后把 `Read Frog Safari.app` 放进 `~/Applications`，打开应用并进入 Safari 设置 → 扩展，启用陪读蛙，并允许访问需要翻译的网站。安装后刷新已打开的网页。

GitHub 自动构建的应用使用 ad-hoc 签名，供本地测试使用，没有经过 Apple 公证。按 [Apple 的测试说明](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)，在 Safari 设置 → 高级打开网页开发功能，然后在开发者设置中启用 **Allow Unsigned Extensions / 允许未签名的扩展**。Safari 重启后可能需要重新启用这一选项。若 macOS 阻止打开下载的应用，可在系统设置 → 隐私与安全性中对该应用选择“仍要打开”。

需要正式分发时，可用 `Read-Frog-Safari-Xcode.zip` 里的项目自行签名，并通过 App Store 或 Developer ID 签名、公证分发，见 [Apple 分发说明](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)。本仓库没有上传 Apple 证书或私钥。

## 本机构建

安装完整 Xcode（仅 Command Line Tools 不够），接受 Xcode 的许可并完成首次启动。仓库的 `package.json` 固定 pnpm 和 Node 版本，pnpm 会安装对应运行时。

```bash
git clone https://github.com/stellarjmr/read-frog.git
cd read-frog
pnpm install --frozen-lockfile
pnpm safari:package
pnpm safari:install
```

`safari:package` 会构建网页扩展、生成 Xcode 项目、编译通用 Mac 应用、验证资源和签名，并输出：

- `.output/safari-artifacts/Read-Frog-Safari-macOS.zip`
- `.output/safari-artifacts/Read-Frog-Safari-Xcode.zip`
- `.output/safari-artifacts/SHA256SUMS`

脚本会自动寻找 `/Applications/Xcode.app` 或 `Xcode-beta.app`。也可以设置 `DEVELOPER_DIR`。已有 Apple 开发证书时，用 `security find-identity -v -p codesigning` 查看证书标识，然后：

```bash
export SAFARI_SIGN_IDENTITY='你的证书标识'
pnpm safari:package
pnpm safari:install
```

安装脚本将证书标识保存在本机，下次本地更新沿用该签名。开发签名不等同于 App Store 分发；是否需要允许未签名扩展取决于本机证书和 Safari 开发设置。

## 随上游更新

[Safari workflow](https://github.com/stellarjmr/read-frog/actions/workflows/safari.yml) 每天 **05:23 UTC** 及 `main` 推送时执行，也可以在 Actions 中手动运行。它合并上游 `main`，保留本 fork 的提交；格式、类型、测试和原生构建都通过后才推送合并结果并生成新的 Safari Release。没有新提交时不重复发布。

合并冲突、检查失败或并发修改会使流程失败，保留现有分支和上一版下载；不会强制覆盖 Safari 改动。可在失败的 Actions 日志中定位问题，修复后重新运行。普通 GitHub fork 的 “Sync fork → Discard changes” 会丢弃适配，请使用这里的工作流。

GitHub 可能在公开仓库长期无活动后停用定时工作流；如 Actions 提示停用，重新启用即可。上游发生较大改动时，自动合并不能替代兼容性维护。

已经在本机克隆并安装的用户，可手动更新：

```bash
bash safari/update.sh
```

需要本机也每天自动构建、安装 fork 已验证的更新时：

```bash
bash safari/auto-update.sh enable
```

启用脚本会在 `~/Library/Application Support/Read Frog Safari/source` 创建独立克隆，避免 macOS 阻止后台任务访问 `Documents`，也避免影响你的开发目录。保持 pnpm 和 Xcode 可用。自动更新只接受干净的 `main` 和快进更新，并要求该提交已有通过验证的 Safari Release；CI 尚未通过时保留已安装版本。构建成功才替换应用，不会丢弃本地修改，也不会退出 Safari。更新后重新打开 Safari 或刷新网页。设置和 API 密钥保留在原 Safari 扩展存储中。

日志：`~/Library/Application Support/Read Frog Safari/update.log`。关闭定时更新：

```bash
bash safari/auto-update.sh disable
```

直接下载安装包的用户可以从 Releases 下载新版替换同名应用。GitHub 下载版本不具备 App Store 自动更新能力。

## Safari 差异与验证

- 页面翻译、划词工具栏、翻译中心、设置和字幕继续使用上游代码与服务商配置。
- 后台使用 MV3 非持久事件页面，让现有音频播放实现可以使用 DOM Audio。
- Safari 不提供 `browser.identity`；Google Drive 登录入口隐藏，设置可通过导出 / 导入同步。官方服务账号和自定义 API 服务商沿用上游行为。
- Safari 没有 Chrome 的侧栏接口，侧栏入口改为打开或复用扩展标签页。上游侧栏当前仍为占位页面。
- 不调用 Safari 缺少的卸载回调和 Chrome 工具栏固定接口。
- 转换器可能提示 `type`、`persistent`、`world`；WebKit 支持这些字段，保留它们以正确运行模块后台与 MAIN world 内容脚本。转换器提示仍需结合实际 WebKit 运行验证。

本地检查：

```bash
pnpm fmt:check
pnpm lint
SKIP_FREE_API=true pnpm test
pnpm safari:package
bash safari/smoke.sh
```

遵循仓库 `AGENTS.md`，自动化测试跳过依赖真实翻译服务的 `free-api.test.ts`。首次启用或上游大版本更新后，应在 Safari 验证：弹出菜单和设置页、整页翻译及恢复、划词翻译、音频播放、字幕，以及重启 Safari 后设置是否保留。CI 的单元测试和应用构建不能代替 Safari 中的完整交互测试。

`safari/smoke.sh` 需要 macOS 15.4+ 和对应的 Xcode SDK。它使用系统 WebKit 加载真实的生产扩展，在独立扩展存储中验证设置初始化、设置页渲染、后台音频准备、页面注入、双语翻译和恢复原文。翻译服务使用本地 HTTP 测试接口，不需要 API 密钥，也不修改 Safari 里的用户设置；这不验证真实服务商的翻译质量或账号配置。日志和截图位于 `.output/safari-qa/`，GitHub 构建也会执行并保存这些证据。
