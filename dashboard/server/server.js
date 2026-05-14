import express from 'express';
import svgCaptcha from 'svg-captcha';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.CAPTCHA_PORT || 3001;

// 配置文件路径
const CONFIG_PATH = process.env.TARGETS_CONFIG_PATH || '/app/data/ssl_targets.json';

// 确保数据目录存在
const DATA_DIR = path.dirname(CONFIG_PATH);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 存储验证码的Map，key为sessionId，value为验证码文本
const captchaStore = new Map();

// 清理过期验证码（10分钟后自动删除）
const CAPTCHA_EXPIRE_TIME = 10 * 60 * 1000;

function cleanExpiredCaptchas() {
  const now = Date.now();
  for (const [sessionId, data] of captchaStore.entries()) {
    if (now - data.createTime > CAPTCHA_EXPIRE_TIME) {
      captchaStore.delete(sessionId);
    }
  }
}

// 每分钟清理一次过期验证码
setInterval(cleanExpiredCaptchas, 60 * 1000);

// CORS配置
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// 配置 multer 用于文件上传
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 限制5MB
});

// ==================== 验证码 API ====================

// 生成验证码
app.get('/api/captcha', (req, res) => {
  const sessionId = req.query.sessionId || generateSessionId();
  
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0o1iIl',
    noise: 3,
    color: true,
    background: '#f5f5f5',
    width: 120,
    height: 40,
    fontSize: 42
  });

  // 存储验证码
  captchaStore.set(sessionId, {
    text: captcha.text.toLowerCase(),
    createTime: Date.now()
  });

  res.json({
    sessionId,
    captcha: captcha.data
  });
});

// 验证验证码
app.post('/api/captcha/verify', (req, res) => {
  const { sessionId, captcha } = req.body;
  
  if (!sessionId || !captcha) {
    return res.json({ success: false, message: '缺少参数' });
  }

  const stored = captchaStore.get(sessionId);
  
  if (!stored) {
    return res.json({ success: false, message: '验证码已过期' });
  }

  if (Date.now() - stored.createTime > CAPTCHA_EXPIRE_TIME) {
    captchaStore.delete(sessionId);
    return res.json({ success: false, message: '验证码已过期' });
  }

  if (captcha.toLowerCase() === stored.text) {
    captchaStore.delete(sessionId);
    return res.json({ success: true, message: '验证成功' });
  }

  return res.json({ success: false, message: '验证码错误' });
});

// 读取用户配置（支持管理员和只读用户）
function readUsersConfig() {
  // 从环境变量读取管理员
  const adminUser = process.env.DASHBOARD_ADMIN_USER;
  const adminPass = process.env.DASHBOARD_ADMIN_PASSWORD;
  
  // 从环境变量读取只读用户
  const readonlyUser = process.env.DASHBOARD_READONLY_USER;
  const readonlyPass = process.env.DASHBOARD_READONLY_PASSWORD;
  
  const users = [];
  
  if (adminUser && adminPass) {
    users.push({ username: adminUser, password: adminPass, role: 'admin' });
  }
  
  if (readonlyUser && readonlyPass) {
    users.push({ username: readonlyUser, password: readonlyPass, role: 'readonly' });
  }
  
  // 如果没有配置环境变量，从配置文件读取
  if (users.length === 0) {
    try {
      const config = readConfig();
      if (config.admin) {
        users.push({ username: config.admin.username, password: config.admin.password, role: 'admin' });
      }
    } catch (error) {
      console.error('Error reading admin config:', error);
    }
  }
  
  return users;
}

// ==================== 登录验证 API ====================

// 验证登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.json({ success: false, message: '缺少用户名或密码' });
  }

  const users = readUsersConfig();
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    return res.json({ 
      success: true, 
      message: '登录成功',
      user: { username: user.username, role: user.role }
    });
  }

  return res.json({ success: false, message: '用户名或密码错误' });
});

// 获取用户配置（不包含密码）
app.get('/api/auth/config', (req, res) => {
  const users = readUsersConfig();
  res.json({ 
    success: true, 
    data: { 
      users: users.map(u => ({ username: u.username, role: u.role })),
      hasReadonly: users.some(u => u.role === 'readonly')
    }
  });
});

// 更新管理员密码（仅支持配置文件中的管理员）
app.put('/api/auth/password', (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  
  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.json({ success: false, message: '缺少参数' });
  }

  if (newPassword !== confirmPassword) {
    return res.json({ success: false, message: '两次输入的密码不一致' });
  }

  if (newPassword.length < 6) {
    return res.json({ success: false, message: '新密码长度不能少于6位' });
  }

  // 如果使用环境变量配置，则不允许通过API修改密码
  if (process.env.DASHBOARD_ADMIN_USER && process.env.DASHBOARD_ADMIN_PASSWORD) {
    return res.json({ success: false, message: '管理员使用环境变量配置，请修改环境变量后重启服务' });
  }

  try {
    const config = readConfig();
    if (!config.admin) {
      return res.json({ success: false, message: '未找到管理员配置' });
    }
    
    if (oldPassword !== config.admin.password) {
      return res.json({ success: false, message: '原密码错误' });
    }
    
    config.admin.password = newPassword;
    
    if (writeConfig(config)) {
      return res.json({ success: true, message: '密码修改成功' });
    } else {
      return res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    console.error('Error updating password:', error);
    return res.status(500).json({ success: false, message: '修改密码失败' });
  }
});

// ==================== 目标管理 API ====================

// 读取配置文件
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      // 如果配置文件不存在，返回默认配置
      return {
        version: "1.0",
        description: "SSL证书监控统一配置文件",
        targets: [],
        settings: {
          default_check_interval: 180,
          default_timeout: 30,
          alert_days_warning: 30,
          alert_days_critical: 7,
          skip_verify_patterns: ["*.local", "localhost", "127.0.0.1", "0.0.0.0"]
        }
      };
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading config:', error);
    return { targets: [], settings: {} };
  }
}

// 写入配置文件
function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    
    // 自动同步到 prometheus_targets.json (所有启用的目标)
    syncPrometheusTargets(config);
    
    // 自动同步到 agent_targets.json (只同步分配了 agent_id 的目标)
    syncAgentTargets(config);
    
    return true;
  } catch (error) {
    console.error('Error writing config:', error);
    return false;
  }
}

// 同步目标到 Prometheus targets 文件
function syncPrometheusTargets(config) {
  try {
    const prometheusTargets = config.targets
      .filter(t => t.enabled)
      .map(t => ({
        targets: [t.url],
        labels: {
          service_name: t.service_name,
          owner: t.owner,
          env: t.env
        }
      }));

    const prometheusTargetsPath = '/app/data/prometheus_targets.json';
    fs.writeFileSync(prometheusTargetsPath, JSON.stringify(prometheusTargets, null, 2), 'utf-8');
    console.log(`Synced ${prometheusTargets.length} targets to prometheus_targets.json`);
  } catch (error) {
    console.error('Error syncing to prometheus_targets.json:', error);
  }
}

// 同步目标到 Agent targets 文件
function syncAgentTargets(config) {
  try {
    const agentTargetsPath = '/app/data/agent_targets.json';
    
    // 读取现有的 agent_targets.json
    let agentConfig = { targets: [] };
    try {
      if (fs.existsSync(agentTargetsPath)) {
        agentConfig = JSON.parse(fs.readFileSync(agentTargetsPath, 'utf-8'));
      }
    } catch (e) {
      console.log('Creating new agent_targets.json');
    }
    
    // 将 ssl_targets.json 中有 agent_id 的目标同步到 agent_targets.json
    const newAgentTargets = config.targets
      .filter(t => t.enabled && t.agent_id)  // 只同步分配了 agent_id 的目标
      .map(t => ({
        id: t.id,
        url: t.url,
        service_name: t.service_name,
        owner: t.owner,
        owner_email: t.owner_email,
        env: t.env,
        agent_id: t.agent_id,
        timeout: t.timeout || 10,
        check_interval: t.check_interval || 180,
        enabled: t.enabled,
        created_at: t.created_at || new Date().toISOString()
      }));
    
    // 合并：保留 agent_targets.json 中没有 agent_id 的目标（如内网直接添加的），添加新的
    const existingWithoutAgent = agentConfig.targets.filter(t => !t.agent_id);
    agentConfig.targets = [...existingWithoutAgent, ...newAgentTargets];
    
    fs.writeFileSync(agentTargetsPath, JSON.stringify(agentConfig, null, 2), 'utf-8');
    console.log(`Synced ${newAgentTargets.length} targets to agent_targets.json`);
  } catch (error) {
    console.error('Error syncing to agent_targets.json:', error);
  }
}

// 获取所有目标
app.get('/api/targets', (req, res) => {
  try {
    const config = readConfig();
    res.json({
      status: 'success',
      targets: config.targets || [],
      settings: config.settings || {}
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: '读取配置失败' });
  }
});

// 添加新目标
app.post('/api/targets', (req, res) => {
  try {
    const { url, service_name, owner, owner_email, env, enabled = true, check_interval, timeout, agent_id } = req.body;
    
    if (!url) {
      return res.status(400).json({ status: 'error', error: 'URL不能为空' });
    }

    if (!service_name) {
      return res.status(400).json({ status: 'error', error: '服务名称不能为空' });
    }

    if (!owner) {
      return res.status(400).json({ status: 'error', error: '负责人不能为空' });
    }

    if (!owner_email) {
      return res.status(400).json({ status: 'error', error: '负责人邮箱不能为空' });
    }

    if (!env) {
      return res.status(400).json({ status: 'error', error: '环境不能为空' });
    }

    // 验证URL格式
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ status: 'error', error: 'URL必须以 http:// 或 https:// 开头' });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(owner_email)) {
      return res.status(400).json({ status: 'error', error: '请输入正确的邮箱格式' });
    }

    const config = readConfig();
    
    // 检查URL是否已存在
    const exists = config.targets.some(t => t.url === url);
    if (exists) {
      return res.status(400).json({ status: 'error', error: '该URL已存在' });
    }

    // 生成新ID
    const maxId = config.targets.reduce((max, t) => Math.max(max, parseInt(t.id || 0)), 0);

    const newTarget = {
      id: String(maxId + 1),
      url,
      service_name,
      owner,
      owner_email,
      env,
      enabled,
      agent_id: agent_id || undefined,
      check_interval: check_interval || config.settings.default_check_interval || 180,
      timeout: timeout || config.settings.default_timeout || 30
    };

    config.targets.push(newTarget);

    if (writeConfig(config)) {
      res.json({ status: 'success', message: '目标添加成功', target: newTarget });
    } else {
      res.status(500).json({ status: 'error', error: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', error: '添加目标失败' });
  }
});

// 更新目标
app.put('/api/targets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const config = readConfig();
    const targetIndex = config.targets.findIndex(t => t.id === id);
    
    if (targetIndex === -1) {
      return res.status(404).json({ status: 'error', error: '目标不存在' });
    }

    // 验证必填字段
    if (!updates.url) {
      return res.status(400).json({ status: 'error', error: 'URL不能为空' });
    }

    if (!updates.service_name) {
      return res.status(400).json({ status: 'error', error: '服务名称不能为空' });
    }

    if (!updates.owner) {
      return res.status(400).json({ status: 'error', error: '负责人不能为空' });
    }

    if (!updates.owner_email) {
      return res.status(400).json({ status: 'error', error: '负责人邮箱不能为空' });
    }

    if (!updates.env) {
      return res.status(400).json({ status: 'error', error: '环境不能为空' });
    }

    // 验证URL格式
    if (!updates.url.startsWith('http://') && !updates.url.startsWith('https://')) {
      return res.status(400).json({ status: 'error', error: 'URL必须以 http:// 或 https:// 开头' });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(updates.owner_email)) {
      return res.status(400).json({ status: 'error', error: '请输入正确的邮箱格式' });
    }

    // 检查URL是否被其他目标使用
    const urlExists = config.targets.some(t => t.url === updates.url && t.id !== id);
    if (urlExists) {
      return res.status(400).json({ status: 'error', error: '该URL已被其他目标使用' });
    }

    // 更新目标
    config.targets[targetIndex] = {
      ...config.targets[targetIndex],
      ...updates,
      id // 确保ID不变
    };

    if (writeConfig(config)) {
      res.json({ status: 'success', message: '目标更新成功', target: config.targets[targetIndex] });
    } else {
      res.status(500).json({ status: 'error', error: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', error: '更新目标失败' });
  }
});

// 删除目标
app.delete('/api/targets/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const config = readConfig();
    const targetIndex = config.targets.findIndex(t => t.id === id);
    
    if (targetIndex === -1) {
      return res.status(404).json({ status: 'error', error: '目标不存在' });
    }

    config.targets.splice(targetIndex, 1);

    if (writeConfig(config)) {
      res.json({ status: 'success', message: '目标删除成功' });
    } else {
      res.status(500).json({ status: 'error', error: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', error: '删除目标失败' });
  }
});

// 批量启用/禁用目标
app.patch('/api/targets/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    const config = readConfig();
    const target = config.targets.find(t => t.id === id);
    
    if (!target) {
      return res.status(404).json({ success: false, message: '目标不存在' });
    }

    target.enabled = enabled;

    if (writeConfig(config)) {
      res.json({ success: true, message: `目标已${enabled ? '启用' : '禁用'}`, data: target });
    } else {
      res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

// 重新加载配置（通知相关服务重新读取配置）
app.post('/api/targets/reload', (req, res) => {
  try {
    // 验证配置格式
    const config = readConfig();
    
    // 手动触发同步到 prometheus_targets.json
    syncPrometheusTargets(config);

    res.json({ 
      success: true, 
      message: '配置已重新加载',
      stats: {
        total: config.targets.length,
        enabled: config.targets.filter(t => t.enabled).length,
        disabled: config.targets.filter(t => !t.enabled).length
      }
    });
  } catch (error) {
    console.error('Reload error:', error);
    res.status(500).json({ success: false, message: '重新加载配置失败' });
  }
});

// CSV解析函数
function parseCSV(csvContent) {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, idx) => {
        row[header.trim()] = values[idx] ? values[idx].trim() : '';
      });
      rows.push(row);
    }
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// 解析 Excel 文件
function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (data.length < 2) {
    return [];
  }

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const rows = [];

  // 字段名映射（支持多种命名）
  const fieldMap = {
    'url': ['url', '网址', '地址'],
    'service_name': ['service_name', 'service', '服务名', '服务名称', '服务'],
    'owner': ['owner', '负责人', '负责人', 'owner_name'],
    'owner_email': ['owner_email', 'email', '邮箱', '邮件', 'owneremail'],
    'env': ['env', '环境', '环境变量', 'environment'],
    'enabled': ['enabled', '启用', '状态', '启用状态'],
    'check_interval': ['check_interval', 'interval', '检查间隔', '检查周期'],
    'timeout': ['timeout', '超时', '超时时间'],
    'agent_id': ['agent_id', 'agent', 'agentid', 'agent_id']
  };

  function findHeaderIndex(possibleNames) {
    for (const name of possibleNames) {
      const idx = headers.findIndex(h => h === name || h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const headerIndices = {
    url: findHeaderIndex(fieldMap['url']),
    service_name: findHeaderIndex(fieldMap['service_name']),
    owner: findHeaderIndex(fieldMap['owner']),
    owner_email: findHeaderIndex(fieldMap['owner_email']),
    env: findHeaderIndex(fieldMap['env']),
    enabled: findHeaderIndex(fieldMap['enabled']),
    check_interval: findHeaderIndex(fieldMap['check_interval']),
    timeout: findHeaderIndex(fieldMap['timeout']),
    agent_id: findHeaderIndex(fieldMap['agent_id'])
  };

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0 || row.every(cell => !cell)) continue;

    const target = {};
    for (const [field, idx] of Object.entries(headerIndices)) {
      if (idx !== -1 && idx < row.length) {
        target[field] = String(row[idx] || '').trim();
      }
    }
    if (Object.keys(target).length > 0) {
      rows.push(target);
    }
  }

  return rows;
}

// 下载导入模板
app.get('/api/targets/template', (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const config = readConfig();
    
    if (format === 'xlsx') {
      // 生成 Excel 模板
      const templateData = [
        {
          'URL': 'https://example.com',
          '服务名称': '示例服务',
          '负责人': '张三',
          '负责人邮箱': 'zhangsan@example.com',
          '环境': 'production',
          'Agent ID': '可选，从在线Agent列表复制',
          '启用状态': 'true',
          '检查间隔(秒)': '180',
          '超时时间(秒)': '30'
        }
      ];
      
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '导入模板');
      
      // 设置列宽
      worksheet['!cols'] = [
        { wch: 50 }, // URL
        { wch: 20 }, // 服务名称
        { wch: 15 }, // 负责人
        { wch: 30 }, // 负责人邮箱
        { wch: 15 }, // 环境
        { wch: 35 }, // Agent ID
        { wch: 12 }, // 启用状态
        { wch: 18 }, // 检查间隔
        { wch: 18 }  // 超时时间
      ];
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=ssl_targets_import_template.xlsx');
      res.send(buffer);
    } else {
      // 生成 CSV 模板
      const csvHeaders = 'URL,服务名称,负责人,负责人邮箱,环境,Agent ID,启用状态,检查间隔(秒),超时时间(秒)\n';
      const csvExample = 'https://example.com,示例服务,张三,zhangsan@example.com,production,,true,180,30\n';
      const csvContent = csvHeaders + csvExample;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=ssl_targets_import_template.csv');
      res.send(Buffer.from('\uFEFF' + csvContent, 'utf-8')); // 添加 BOM 以支持 Excel 打开
    }
  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({ success: false, message: '生成模板失败' });
  }
});

// 批量导入目标
app.post('/api/targets/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传文件' });
    }

    const fileName = req.file.originalname.toLowerCase();
    let targets = [];

    if (fileName.endsWith('.csv')) {
      const csvContent = req.file.buffer.toString('utf-8');
      targets = parseCSV(csvContent);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.wps')) {
      targets = parseExcel(req.file.buffer);
    } else {
      return res.status(400).json({ success: false, message: '不支持的文件格式，请上传 CSV、XLSX、XLS 或 WPS 文件' });
    }

    if (targets.length === 0) {
      return res.status(400).json({ success: false, message: '文件为空或格式不正确' });
    }

    const config = readConfig();
    const errors = [];
    let successCount = 0;
    let failedCount = 0;

    // 获取当前最大ID
    const maxId = config.targets.reduce((max, t) => Math.max(max, parseInt(t.id || 0)), 0);
    let currentId = maxId;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const rowNum = i + 2; // 文件行号（从2开始，第1行是表头）

      // 验证必填字段
      if (!target.url) {
        errors.push(`第${rowNum}行: URL不能为空`);
        failedCount++;
        continue;
      }

      // 验证URL格式
      if (!target.url.startsWith('http://') && !target.url.startsWith('https://')) {
        errors.push(`第${rowNum}行: URL必须以 http:// 或 https:// 开头`);
        failedCount++;
        continue;
      }

      // 检查URL是否已存在
      const exists = config.targets.some(t => t.url === target.url);
      if (exists) {
        errors.push(`第${rowNum}行: URL "${target.url}" 已存在，跳过`);
        failedCount++;
        continue;
      }

      currentId++;
      const newTarget = {
        id: String(currentId),
        url: target.url,
        service_name: target.service_name || target.url,
        owner: target.owner || '未分配',
        owner_email: target.owner_email || '',
        env: target.env || 'production',
        enabled: target.enabled === 'true' || target.enabled === true || target.enabled === '1' || target.enabled === 1,
        check_interval: parseInt(target.check_interval) || config.settings.default_check_interval || 180,
        timeout: parseInt(target.timeout) || config.settings.default_timeout || 30
      };
      
      // 如果提供了 agent_id，则添加到目标
      if (target.agent_id && String(target.agent_id).trim()) {
        newTarget.agent_id = String(target.agent_id).trim();
      }

      config.targets.push(newTarget);
      successCount++;
    }

    if (writeConfig(config)) {
      res.json({
        success: true,
        message: `导入完成`,
        data: {
          success: successCount,
          failed: failedCount,
          errors: errors
        }
      });
    } else {
      res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: '导入失败: ' + error.message });
  }
});

// 生成随机sessionId
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ==================== 飞书 Webhook API ====================

// 读取飞书配置
function readLarkConfig() {
  try {
    const config = readConfig();
    return config.settings?.lark_webhook || null;
  } catch (error) {
    console.error('Error reading Lark config:', error);
    return null;
  }
}

// 飞书告警消息模板
function buildLarkAlertCard(alerts) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const alertCards = alerts.map(alert => {
    const status = alert.status === 'resolved' ? '✅ 已解决' : '🚨 告警中';
    const severity = alert.labels?.severity === 'critical' ? '🔴 严重' : '🟡 警告';

    return {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${alert.labels?.alertname || '未知告警'}**\n\n${severity} ${status}\n\n📍 ${alert.labels?.service_name || alert.labels?.job || '未知服务'}\n⏰ 开始时间: ${new Date(alert.startsAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n${alert.endsAt !== '0001-01-01T00:00:00Z' ? `✅ 结束时间: ${new Date(alert.endsAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : ''}\n\n📋 **详情:**\n\`\`\`\n${alert.annotations?.description || alert.annotations?.summary || '无描述'}
\`\`\``
      }
    };
  });

  return {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: `🔔 SSL证书告警通知 (${alerts.length}条)`
        },
        template: alerts.some(a => a.labels?.severity === 'critical') ? 'red' : 'yellow'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `⏰ 通知时间: ${now}`
          }
        },
        { tag: 'hr' },
        ...alertCards,
        { tag: 'hr' },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '由 SSL Certificate Monitoring System 自动发送'
            }
          ]
        }
      ]
    }
  };
}

// 飞书 Webhook 端点
app.post('/api/webhooks/lark', async (req, res) => {
  try {
    const { webhook_url, secret } = readLarkConfig();

    if (!webhook_url) {
      return res.status(400).json({
        success: false,
        message: '飞书 Webhook 未配置，请先在 ssl_targets.json 中配置 lark_webhook'
      });
    }

    const alerts = req.body?.alerts || [];

    if (alerts.length === 0) {
      return res.json({ success: true, message: '无告警' });
    }

    const larkPayload = buildLarkAlertCard(alerts);

    // 发送飞书消息
    const response = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(larkPayload)
    });

    if (response.ok) {
      res.json({ success: true, message: '飞书通知发送成功' });
    } else {
      const error = await response.text();
      console.error('Lark webhook error:', error);
      res.status(500).json({ success: false, message: '飞书通知发送失败' });
    }
  } catch (error) {
    console.error('Lark webhook error:', error);
    res.status(500).json({ success: false, message: '飞书通知发送失败' });
  }
});

// 获取飞书配置
app.get('/api/webhooks/lark/config', (req, res) => {
  const config = readLarkConfig();
  res.json({
    success: true,
    data: {
      configured: !!config?.webhook_url,
      webhook_url: config?.webhook_url ? '***' + config.webhook_url.slice(-10) : null
    }
  });
});

// 更新飞书配置
app.put('/api/webhooks/lark/config', (req, res) => {
  const { webhook_url, secret } = req.body;

  if (!webhook_url) {
    return res.status(400).json({ success: false, message: 'Webhook URL 不能为空' });
  }

  try {
    const config = readConfig();
    if (!config.settings) {
      config.settings = {};
    }
    config.settings.lark_webhook = { webhook_url, secret: secret || '' };

    if (writeConfig(config)) {
      res.json({ success: true, message: '飞书配置更新成功' });
    } else {
      res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    console.error('Error updating Lark config:', error);
    res.status(500).json({ success: false, message: '更新配置失败' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务运行在 http://0.0.0.0:${PORT}`);
  console.log('API端点:');
  console.log('  === 验证码 ===');
  console.log('  GET  /api/captcha?sessionId=<sessionId> - 获取验证码');
  console.log('  POST /api/captcha/verify - 验证验证码');
  console.log('  === 登录验证 ===');
  console.log('  POST /api/auth/login - 验证登录');
  console.log('  GET  /api/auth/config - 获取管理员配置');
  console.log('  PUT  /api/auth/password - 修改密码');
  console.log('  === 目标管理 ===');
  console.log('  GET    /api/targets - 获取所有目标');
  console.log('  POST   /api/targets - 添加新目标');
  console.log('  PUT    /api/targets/:id - 更新目标');
  console.log('  DELETE /api/targets/:id - 删除目标');
  console.log('  PATCH  /api/targets/:id/toggle - 启用/禁用目标');
  console.log('  POST   /api/targets/reload - 重新加载配置');
  console.log('  GET    /api/targets/template - 下载导入模板 (CSV/Excel)');
  console.log('  POST   /api/targets/import - 批量导入目标');
  console.log('  GET    /health - 健康检查');
});
