export interface CommandEntry {
  id: string;
  command: string;
  description: string;
}

export interface CommandCategory {
  id: string;
  name: string;
  icon: string;
  commands: CommandEntry[];
}

export interface ToolGroup {
  id: string;
  name: string;
  categories: CommandCategory[];
}

export const REASONIX_CATEGORIES: CommandCategory[] = [
  {
    id: 'rx-startup',
    name: '启动 / 编码',
    icon: '🚀',
    commands: [
      { id: 'rx-code', command: 'reasonix code', description: '代码编辑聊天（当前目录）' },
      { id: 'rx-code-dir', command: 'reasonix code "<dir>"', description: '代码编辑聊天（指定项目目录）' },
      { id: 'rx-code-new', command: 'reasonix code --new', description: '强制创建新会话' },
      { id: 'rx-code-resume', command: 'reasonix code -r', description: '恢复指定会话' },
      { id: 'rx-code-model', command: 'reasonix code --model deepseek-v4-pro', description: '指定模型启动' },
      { id: 'rx-code-budget', command: 'reasonix code --budget 1', description: '会话预算上限 $1' },
      { id: 'rx-code-nosession', command: 'reasonix code --no-session', description: '不持久化会话' },
      { id: 'rx-chat', command: 'reasonix chat', description: '交互式聊天 TUI' },
      { id: 'rx-chat-continue', command: 'reasonix chat -c', description: '继续最近聊天会话' },
      { id: 'rx-chat-session', command: 'reasonix chat --session "<name>"', description: '指定会话名称' },
      { id: 'rx-chat-preset', command: 'reasonix chat --preset pro', description: 'Pro 模型预设' },
      { id: 'rx-chat-model', command: 'reasonix chat --model deepseek-v4-pro', description: '指定模型聊天' },
      { id: 'rx-chat-new', command: 'reasonix chat --new', description: '强制创建新聊天会话' },
      { id: 'rx-run', command: 'reasonix run "<task>"', description: '非交互单次运行任务' },
      { id: 'rx-run-model', command: 'reasonix run --model deepseek-v4-flash "<task>"', description: '指定模型单次运行' },
    ],
  },
  {
    id: 'rx-sessions',
    name: '会话管理',
    icon: '📋',
    commands: [
      { id: 'rx-sessions-list', command: 'reasonix sessions', description: '列出所有保存的会话' },
      { id: 'rx-sessions-check', command: 'reasonix sessions "<name>"', description: '按名称检查会话详情' },
      { id: 'rx-sessions-verbose', command: 'reasonix sessions -v', description: '显示完整会话元数据' },
      { id: 'rx-sessions-continue', command: 'reasonix -c', description: '恢复最近使用的会话' },
      { id: 'rx-prune', command: 'reasonix prune-sessions', description: '删除空闲 ≥90 天会话' },
      { id: 'rx-prune-days', command: 'reasonix prune-sessions --days 30', description: '删除空闲 ≥30 天会话' },
      { id: 'rx-prune-dryrun', command: 'reasonix prune-sessions --dry-run', description: '预览将要删除的会话' },
    ],
  },
  {
    id: 'rx-mcp',
    name: 'MCP 管理',
    icon: '🔌',
    commands: [
      { id: 'rx-mcp-list', command: 'reasonix mcp list', description: '浏览 MCP 注册表' },
      { id: 'rx-mcp-search', command: 'reasonix mcp search "<query>"', description: '搜索 MCP 服务器' },
      { id: 'rx-mcp-install', command: 'reasonix mcp install "<name>"', description: '安装 MCP 服务器' },
      { id: 'rx-mcp-browse', command: 'reasonix mcp browse', description: '交互式市场浏览器' },
      { id: 'rx-mcp-inspect', command: 'reasonix mcp inspect "<spec>"', description: '检查 MCP 服务器详情' },
    ],
  },
  {
    id: 'rx-tools',
    name: '工具 / 诊断',
    icon: '🔧',
    commands: [
      { id: 'rx-setup', command: 'reasonix setup', description: '交互式配置向导' },
      { id: 'rx-doctor', command: 'reasonix doctor', description: '一键健康检查' },
      { id: 'rx-doctor-json', command: 'reasonix doctor --json', description: '健康检查（JSON 输出）' },
      { id: 'rx-stats', command: 'reasonix stats', description: '使用情况仪表板' },
      { id: 'rx-commit', command: 'reasonix commit', description: '从暂存差异起草提交消息' },
      { id: 'rx-commit-yes', command: 'reasonix commit -y', description: '起草提交消息（跳过确认）' },
      { id: 'rx-update', command: 'reasonix update', description: '检查并安装新版本' },
      { id: 'rx-update-dryrun', command: 'reasonix update --dry-run', description: '预览更新（不安装）' },
      { id: 'rx-version', command: 'reasonix version', description: '打印 Reasonix 版本' },
      { id: 'rx-index', command: 'reasonix index', description: '构建本地语义搜索索引' },
      { id: 'rx-index-rebuild', command: 'reasonix index --rebuild', description: '从头重建索引' },
    ],
  },
  {
    id: 'rx-transcripts',
    name: '转录 / 调试',
    icon: '📝',
    commands: [
      { id: 'rx-events', command: 'reasonix events "<name>"', description: '美化打印内核事件日志' },
      { id: 'rx-events-tail', command: 'reasonix events --tail 20 "<name>"', description: '最后 20 个事件' },
      { id: 'rx-events-type', command: 'reasonix events --type "<type>" "<name>"', description: '按事件类型过滤' },
      { id: 'rx-events-json', command: 'reasonix events --json "<name>"', description: '事件日志（JSON 输出）' },
      { id: 'rx-replay', command: 'reasonix replay "<transcript>"', description: '交互式浏览转录稿 TUI' },
      { id: 'rx-replay-print', command: 'reasonix replay --print "<transcript>"', description: '打印转录稿到标准输出' },
      { id: 'rx-diff', command: 'reasonix diff "<a>" "<b>"', description: '分栏 TUI 比较两个转录稿' },
      { id: 'rx-diff-md', command: 'reasonix diff --md diff.md "<a>" "<b>"', description: '转录差异导出 Markdown' },
      { id: 'rx-diff-print', command: 'reasonix diff --print "<a>" "<b>"', description: '打印转录差异表格' },
    ],
  },
];

export const CODEX_CATEGORIES: CommandCategory[] = [
  {
    id: 'codex-startup',
    name: '启动 / 编码',
    icon: '🚀',
    commands: [
      { id: 'codex-interactive', command: 'codex', description: '进交互模式' },
      { id: 'codex-prompt', command: 'codex "<prompt>"', description: '带初始提示进交互' },
      { id: 'codex-exec', command: 'codex exec "<task>"', description: '非交互单次执行' },
      { id: 'codex-exec-ephemeral', command: 'codex exec --ephemeral "<task>"', description: '单次执行（不保存会话）' },
      { id: 'codex-exec-cd', command: 'codex exec -C "<dir>" "<task>"', description: '指定工作目录执行' },
      { id: 'codex-model', command: 'codex --model o3 "<prompt>"', description: '指定模型启动' },
      { id: 'codex-oss', command: 'codex --oss', description: '使用开源提供商' },
      { id: 'codex-local', command: 'codex --oss --local-provider ollama', description: '本地模型（Ollama）' },
      { id: 'codex-search', command: 'codex --search "<prompt>"', description: '启用联网搜索' },
      { id: 'codex-image', command: 'codex -i "<image.png>" "<prompt>"', description: '带图片进入' },
    ],
  },
  {
    id: 'codex-sessions',
    name: '会话管理',
    icon: '📋',
    commands: [
      { id: 'codex-resume', command: 'codex resume', description: '选择并恢复会话' },
      { id: 'codex-resume-last', command: 'codex resume --last', description: '恢复最近会话' },
      { id: 'codex-resume-all', command: 'codex resume --all', description: '显示所有会话（不限 CWD）' },
      { id: 'codex-resume-ni', command: 'codex resume --include-non-interactive', description: '含非交互会话' },
      { id: 'codex-fork', command: 'codex fork', description: '分叉上一个交互会话' },
      { id: 'codex-fork-last', command: 'codex fork --last', description: '分叉最近会话' },
      { id: 'codex-ephemeral', command: 'codex --ephemeral', description: '不保存会话文件' },
    ],
  },
  {
    id: 'codex-sandbox',
    name: '沙盒 / 权限',
    icon: '🛡️',
    commands: [
      { id: 'codex-sb-readonly', command: 'codex -s read-only', description: '只读沙盒' },
      { id: 'codex-sb-workspace', command: 'codex -s workspace-write', description: '工作区可写沙盒' },
      { id: 'codex-sb-danger', command: 'codex -s danger-full-access', description: '完全访问沙盒（危险）' },
      { id: 'codex-approval-untrusted', command: 'codex -a untrusted', description: '仅信任已知命令' },
      { id: 'codex-approval-request', command: 'codex -a on-request', description: '模型决定何时请求批准' },
      { id: 'codex-approval-never', command: 'codex -a never', description: '永不请求批准（自动执行）' },
      { id: 'codex-sandbox-win', command: 'codex sandbox windows', description: 'Windows 受限令牌' },
    ],
  },
  {
    id: 'codex-config',
    name: '配置 / 管理',
    icon: '🔧',
    commands: [
      { id: 'codex-login', command: 'codex login', description: '登录 Codex' },
      { id: 'codex-logout', command: 'codex logout', description: '退出登录' },
      { id: 'codex-update', command: 'codex update', description: '更新到最新版本' },
      { id: 'codex-config', command: 'codex -c model="o3"', description: '覆盖配置项' },
      { id: 'codex-profile', command: 'codex -p "<profile>"', description: '使用配置预设' },
      { id: 'codex-mcp-list', command: 'codex mcp list', description: '列出 MCP 服务器' },
      { id: 'codex-mcp-add', command: 'codex mcp add', description: '添加 MCP 服务器' },
      { id: 'codex-plugin', command: 'codex plugin marketplace', description: '管理插件市场' },
      { id: 'codex-completion', command: 'codex completion', description: '生成 Shell 补全脚本' },
    ],
  },
  {
    id: 'codex-advanced',
    name: '高级 / 其他',
    icon: '⚙️',
    commands: [
      { id: 'codex-apply', command: 'codex apply', description: '应用最近 diff 到工作树' },
      { id: 'codex-review', command: 'codex review', description: '对当前仓库代码审查' },
      { id: 'codex-exec-review', command: 'codex exec review', description: '非交互代码审查' },
      { id: 'codex-cloud', command: 'codex cloud', description: '浏览云端任务' },
      { id: 'codex-debug-models', command: 'codex debug models', description: '查看模型目录 JSON' },
      { id: 'codex-debug-prompt', command: 'codex debug prompt-input', description: '查看 prompt 输入 JSON' },
      { id: 'codex-features', command: 'codex features', description: '查看 feature flags' },
      { id: 'codex-mcp-server', command: 'codex mcp-server', description: '作为 MCP server 启动' },
      { id: 'codex-app', command: 'codex app', description: '启动桌面应用' },
    ],
  },
];

export const CC_CATEGORIES: CommandCategory[] = [
  {
    id: 'startup',
    name: '启动 / 管理',
    icon: '🚀',
    commands: [
      { id: 'cc-interactive', command: 'claude', description: '进交互模式' },
      { id: 'cc-query', command: 'claude "query"', description: '带初始问题进入' },
      { id: 'cc-pipe', command: 'claude -p "query"', description: '单次提问后退出' },
      { id: 'cc-continue', command: 'claude -c', description: '继续最近一次对话' },
      { id: 'cc-restore', command: 'claude -r "<session>"', description: '按 ID/名称恢复会话' },
      { id: 'cc-update', command: 'claude update', description: '更新版本' },
      { id: 'cc-install', command: 'claude install [version]', description: '安装/重装指定版本' },
      { id: 'cc-auth-login', command: 'claude auth login', description: '登录' },
      { id: 'cc-auth-logout', command: 'claude auth logout', description: '退出登录' },
      { id: 'cc-auth-status', command: 'claude auth status', description: '看登录状态' },
      { id: 'cc-agents', command: 'claude agents', description: '看后台会话' },
      { id: 'cc-attach', command: 'claude attach <id>', description: '附加到后台会话' },
      { id: 'cc-logs', command: 'claude logs <id>', description: '看后台输出' },
      { id: 'cc-respawn', command: 'claude respawn <id>', description: '重启停止的后台会话' },
      { id: 'cc-rm', command: 'claude rm <id>', description: '从列表移除后台会话' },
      { id: 'cc-mcp', command: 'claude mcp', description: '管 MCP 服务器' },
      { id: 'cc-plugin', command: 'claude plugin', description: '管插件' },
      { id: 'cc-purge', command: 'claude project purge [path]', description: '清理项目本地数据' },
      { id: 'cc-remote', command: 'claude remote-control', description: '开远程控制' },
      { id: 'cc-auto-mode', command: 'claude auto-mode defaults', description: '看自动模式默认规则' },
    ],
  },
  {
    id: 'slash',
    name: '会话命令',
    icon: '/',
    commands: [
      { id: 'slash-help', command: '/help', description: '看帮助' },
      { id: 'slash-config', command: '/config', description: '改设置' },
      { id: 'slash-theme', command: '/theme', description: '切主题' },
      { id: 'slash-model', command: '/model', description: '切模型' },
      { id: 'slash-effort', command: '/effort', description: '调推理强度' },
      { id: 'slash-permissions', command: '/permissions', description: '管权限规则' },
      { id: 'slash-mcp', command: '/mcp', description: '管 MCP 连接' },
      { id: 'slash-agents', command: '/agents', description: '管子代理' },
      { id: 'slash-init', command: '/init', description: '初始化 CLAUDE.md' },
      { id: 'slash-memory', command: '/memory', description: '编辑记忆文件' },
      { id: 'slash-plan', command: '/plan', description: '进入计划模式' },
      { id: 'slash-compact', command: '/compact', description: '压缩上下文' },
      { id: 'slash-context', command: '/context', description: '看上下文占用' },
      { id: 'slash-resume', command: '/resume', description: '恢复旧会话' },
      { id: 'slash-clear', command: '/clear', description: '开新对话' },
      { id: 'slash-branch', command: '/branch', description: '分叉当前会话' },
      { id: 'slash-background', command: '/background', description: '转后台跑' },
      { id: 'slash-batch', command: '/batch', description: '并行拆大任务' },
      { id: 'slash-diff', command: '/diff', description: '看改动差异' },
      { id: 'slash-review', command: '/review', description: '审查 PR' },
      { id: 'slash-security', command: '/security-review', description: '查安全问题' },
      { id: 'slash-rewind', command: '/rewind', description: '回滚到检查点' },
      { id: 'slash-doctor', command: '/doctor', description: '自检安装' },
      { id: 'slash-debug', command: '/debug', description: '开调试日志' },
      { id: 'slash-feedback', command: '/feedback', description: '提交反馈' },
      { id: 'slash-status', command: '/status', description: '看版本、模型、连接' },
      { id: 'slash-usage', command: '/usage', description: '看用量' },
      { id: 'slash-rename', command: '/rename', description: '重命名会话' },
      { id: 'slash-copy', command: '/copy', description: '复制上一条回复' },
      { id: 'slash-export', command: '/export', description: '导出对话' },
      { id: 'slash-tasks', command: '/tasks', description: '看后台任务' },
      { id: 'slash-teleport', command: '/teleport', description: '接入网页会话' },
      { id: 'slash-remote', command: '/remote-control', description: '把当前会话开放给远控' },
      { id: 'slash-goal', command: '/goal', description: '设定持续目标' },
      { id: 'slash-desktop', command: '/desktop', description: '切到桌面版' },
      { id: 'slash-add-dir', command: '/add-dir', description: '加工作目录' },
      { id: 'slash-color', command: '/color', description: '改提示栏颜色' },
      { id: 'slash-exit', command: '/exit', description: '退出' },
    ],
  },
];

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'cc', name: 'Claude Code', categories: CC_CATEGORIES },
  { id: 'reasonix', name: 'Reasonix', categories: REASONIX_CATEGORIES },
  { id: 'codex', name: 'Codex', categories: CODEX_CATEGORIES },
];
