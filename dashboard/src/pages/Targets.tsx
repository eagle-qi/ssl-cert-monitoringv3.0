import { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  RefreshCw, 
  Search, 
  CheckCircle, 
  XCircle,
  ExternalLink,
  Settings,
  Server,
  User,
  Globe,
  AlertCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

interface Target {
  id: string;
  url: string;
  service_name: string;
  owner: string;
  env: string;
  enabled: boolean;
  check_interval?: number;
  timeout?: number;
}

export default function Targets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [envFilter, setEnvFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target | null>(null);
  const [formData, setFormData] = useState({
    url: '',
    service_name: '',
    owner: '',
    env: 'production',
    enabled: true,
    check_interval: 180,
    timeout: 30
  });
  const [saving, setSaving] = useState(false);
  const [reloadLoading, setReloadLoading] = useState(false);
  const [reloadMessage, setReloadMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const API_BASE = '/api/targets';

  const fetchTargets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(API_BASE);
      const result = await response.json();
      
      if (result.success) {
        setTargets(result.data.targets || []);
      } else {
        setError(result.message || '获取目标列表失败');
      }
    } catch (err) {
      setError('网络错误，请检查连接');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets();
  }, []);

  const handleReload = async () => {
    try {
      setReloadLoading(true);
      setReloadMessage(null);
      const response = await fetch(`${API_BASE}/reload`, { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        setReloadMessage({ type: 'success', text: `配置已重新加载！总目标: ${result.stats.total}, 启用: ${result.stats.enabled}, 禁用: ${result.stats.disabled}` });
        await fetchTargets();
      } else {
        setReloadMessage({ type: 'error', text: result.message || '重新加载失败' });
      }
    } catch (err) {
      setReloadMessage({ type: 'error', text: '重新加载失败，请检查服务状态' });
      console.error(err);
    } finally {
      setReloadLoading(false);
      setTimeout(() => setReloadMessage(null), 5000);
    }
  };

  const openAddModal = () => {
    setEditingTarget(null);
    setFormData({
      url: '',
      service_name: '',
      owner: '',
      env: 'production',
      enabled: true,
      check_interval: 180,
      timeout: 30
    });
    setShowModal(true);
  };

  const openEditModal = (target: Target) => {
    setEditingTarget(target);
    setFormData({
      url: target.url,
      service_name: target.service_name,
      owner: target.owner,
      env: target.env,
      enabled: target.enabled,
      check_interval: target.check_interval || 180,
      timeout: target.timeout || 30
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.url) {
      alert('URL不能为空');
      return;
    }

    if (!formData.url.startsWith('http://') && !formData.url.startsWith('https://')) {
      alert('URL必须以 http:// 或 https:// 开头');
      return;
    }

    try {
      setSaving(true);
      
      let response;
      if (editingTarget) {
        response = await fetch(`${API_BASE}/${editingTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        response = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }

      const result = await response.json();
      
      if (result.success) {
        setShowModal(false);
        await fetchTargets();
        await handleReload();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (err) {
      alert('操作失败，请重试');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个目标吗？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      const result = await response.json();
      
      if (result.success) {
        await fetchTargets();
        await handleReload();
      } else {
        alert(result.message || '删除失败');
      }
    } catch (err) {
      alert('删除失败，请重试');
      console.error(err);
    }
  };

  const handleToggle = async (target: Target) => {
    try {
      const response = await fetch(`${API_BASE}/${target.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !target.enabled })
      });
      const result = await response.json();
      
      if (result.success) {
        await fetchTargets();
        await handleReload();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (err) {
      alert('操作失败，请重试');
      console.error(err);
    }
  };

  const filteredTargets = targets.filter(target => {
    const matchesSearch = 
      target.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      target.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      target.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEnv = !envFilter || target.env === envFilter;
    return matchesSearch && matchesEnv;
  });

  const uniqueEnvs = [...new Set(targets.map(t => t.env))];

  if (loading && targets.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载目标配置中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">目标管理</h1>
          <p className="text-gray-500 mt-1">
            管理 SSL 证书监控目标，支持添加、编辑、删除和启用/禁用目标
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleReload}
            disabled={reloadLoading}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${reloadLoading ? 'animate-spin' : ''}`} />
            <span>重载配置</span>
          </button>
          <button onClick={openAddModal} className="btn-primary flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>添加目标</span>
          </button>
        </div>
      </div>

      {reloadMessage && (
        <div className={`p-4 rounded-lg ${
          reloadMessage.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-center">
            {reloadMessage.type === 'success' ? (
              <CheckCircle className="h-5 w-5 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 mr-2" />
            )}
            {reloadMessage.text}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-200 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-blue-50">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">目标总数</p>
              <p className="text-2xl font-bold text-gray-900">{targets.length}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-green-50">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已启用</p>
              <p className="text-2xl font-bold text-gray-900">
                {targets.filter(t => t.enabled).length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-gray-50">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">已禁用</p>
              <p className="text-2xl font-bold text-gray-900">
                {targets.filter(t => !t.enabled).length}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-purple-50">
              <Globe className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">环境数量</p>
              <p className="text-2xl font-bold text-gray-900">{uniqueEnvs.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索 URL、服务名、负责人..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">环境:</span>
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">全部</option>
              {uniqueEnvs.map(env => (
                <option key={env} value={env}>{env}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredTargets.length === 0 ? (
          <div className="card text-center py-12">
            <Server className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {searchTerm || envFilter ? '没有找到匹配的目标' : '暂无监控目标'}
            </h2>
            <p className="text-gray-500 mb-6">
              {searchTerm || envFilter ? '请尝试调整搜索条件' : '点击"添加目标"开始添加监控目标'}
            </p>
            {!searchTerm && !envFilter && (
              <button onClick={openAddModal} className="btn-primary">
                添加第一个目标
              </button>
            )}
          </div>
        ) : (
          filteredTargets.map((target) => (
            <div 
              key={target.id} 
              className={`card transition-all ${
                target.enabled 
                  ? 'bg-white border-gray-200' 
                  : 'bg-gray-50 border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1">
                  <div className={`p-2 rounded-lg ${
                    target.enabled ? 'bg-primary-50' : 'bg-gray-100'
                  }`}>
                    <Globe className={`h-6 w-6 ${
                      target.enabled ? 'text-primary-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {target.service_name}
                      </h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        target.env === 'production' 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {target.env}
                      </span>
                      {!target.enabled && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-600">
                          已禁用
                        </span>
                      )}
                    </div>
                    
                    <a 
                      href={target.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 text-sm flex items-center space-x-1 mb-3"
                    >
                      <span>{target.url}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    <div className="flex flex-wrap gap-4 text-sm">
                      {target.owner && (
                        <div className="flex items-center space-x-1 text-gray-600">
                          <User className="h-4 w-4" />
                          <span>{target.owner}</span>
                        </div>
                      )}
                      {target.check_interval && (
                        <div className="flex items-center space-x-1 text-gray-600">
                          <RefreshCw className="h-4 w-4" />
                          <span>{target.check_interval}s</span>
                        </div>
                      )}
                      {target.timeout && (
                        <div className="flex items-center space-x-1 text-gray-600">
                          <Settings className="h-4 w-4" />
                          <span>超时 {target.timeout}s</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleToggle(target)}
                    className={`p-2 rounded-lg transition-colors ${
                      target.enabled
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-gray-400 hover:bg-gray-100'
                    }`}
                    title={target.enabled ? '点击禁用' : '点击启用'}
                  >
                    {target.enabled ? (
                      <ToggleRight className="h-6 w-6" />
                    ) : (
                      <ToggleLeft className="h-6 w-6" />
                    )}
                  </button>
                  <button
                    onClick={() => openEditModal(target)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(target.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingTarget ? '编辑目标' : '添加目标'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  监控地址 (URL) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://www.example.com:443"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  必须以 http:// 或 https:// 开头
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  服务名称
                </label>
                <input
                  type="text"
                  value={formData.service_name}
                  onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                  placeholder="示例网站"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    负责人
                  </label>
                  <input
                    type="text"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="运维团队"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    环境
                  </label>
                  <select
                    value={formData.env}
                    onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="production">生产环境</option>
                    <option value="test">测试环境</option>
                    <option value="development">开发环境</option>
                    <option value="staging">预发布环境</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    检查间隔 (秒)
                  </label>
                  <input
                    type="number"
                    value={formData.check_interval}
                    onChange={(e) => setFormData({ ...formData, check_interval: parseInt(e.target.value) })}
                    min={60}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    超时时间 (秒)
                  </label>
                  <input
                    type="number"
                    value={formData.timeout}
                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
                    min={5}
                    max={120}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                  启用监控
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : (editingTarget ? '保存修改' : '添加目标')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
