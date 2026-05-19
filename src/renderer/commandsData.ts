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
