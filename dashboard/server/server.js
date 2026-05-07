import express from 'express';
import svgCaptcha from 'svg-captcha';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    return true;
  } catch (error) {
    console.error('Error writing config:', error);
    return false;
  }
}

// 获取所有目标
app.get('/api/targets', (req, res) => {
  try {
    const config = readConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '读取配置失败' });
  }
});

// 添加新目标
app.post('/api/targets', (req, res) => {
  try {
    const { url, service_name, owner, env, enabled = true, check_interval, timeout } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL不能为空' });
    }

    // 验证URL格式
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ success: false, message: 'URL必须以 http:// 或 https:// 开头' });
    }

    const config = readConfig();
    
    // 生成新ID
    const maxId = config.targets.reduce((max, t) => Math.max(max, parseInt(t.id || 0)), 0);
    
    const newTarget = {
      id: String(maxId + 1),
      url,
      service_name: service_name || url,
      owner: owner || '未分配',
      env: env || 'production',
      enabled,
      check_interval: check_interval || config.settings.default_check_interval || 180,
      timeout: timeout || config.settings.default_timeout || 30
    };

    config.targets.push(newTarget);
    
    if (writeConfig(config)) {
      res.json({ success: true, message: '目标添加成功', data: newTarget });
    } else {
      res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '添加目标失败' });
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
      return res.status(404).json({ success: false, message: '目标不存在' });
    }

    // 验证URL格式（如果更新了URL）
    if (updates.url) {
      if (!updates.url.startsWith('http://') && !updates.url.startsWith('https://')) {
        return res.status(400).json({ success: false, message: 'URL必须以 http:// 或 https:// 开头' });
      }
    }

    // 更新目标
    config.targets[targetIndex] = {
      ...config.targets[targetIndex],
      ...updates,
      id // 确保ID不变
    };

    if (writeConfig(config)) {
      res.json({ success: true, message: '目标更新成功', data: config.targets[targetIndex] });
    } else {
      res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '更新目标失败' });
  }
});

// 删除目标
app.delete('/api/targets/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const config = readConfig();
    const targetIndex = config.targets.findIndex(t => t.id === id);
    
    if (targetIndex === -1) {
      return res.status(404).json({ success: false, message: '目标不存在' });
    }

    config.targets.splice(targetIndex, 1);

    if (writeConfig(config)) {
      res.json({ success: true, message: '目标删除成功' });
    } else {
      res.status(500).json({ success: false, message: '保存配置失败' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '删除目标失败' });
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
    
    // 生成Prometheus格式的目标文件
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

    // 写入Prometheus targets文件到共享数据目录
    // docker-compose 会将此文件挂载到 Prometheus 容器的 /etc/prometheus/ssl_targets.json
    const prometheusTargetsPath = '/app/data/prometheus_targets.json';
    fs.writeFileSync(prometheusTargetsPath, JSON.stringify(prometheusTargets, null, 2), 'utf-8');

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

// 生成随机sessionId
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务运行在 http://0.0.0.0:${PORT}`);
  console.log('API端点:');
  console.log('  === 验证码 ===');
  console.log('  GET  /api/captcha?sessionId=<sessionId> - 获取验证码');
  console.log('  POST /api/captcha/verify - 验证验证码');
  console.log('  === 目标管理 ===');
  console.log('  GET    /api/targets - 获取所有目标');
  console.log('  POST   /api/targets - 添加新目标');
  console.log('  PUT    /api/targets/:id - 更新目标');
  console.log('  DELETE /api/targets/:id - 删除目标');
  console.log('  PATCH  /api/targets/:id/toggle - 启用/禁用目标');
  console.log('  POST   /api/targets/reload - 重新加载配置');
  console.log('  GET    /health - 健康检查');
});
