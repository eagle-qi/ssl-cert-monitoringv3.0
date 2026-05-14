import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Search,
  CheckCircle,
  ExternalLink,
  Server,
  User,
  Globe,
  AlertCircle,
  Activity,
  Copy,
  Check,
  Wand2,
  X,
  Loader2,
} from 'lucide-react';

interface AgentTarget {
  id: string;
  url: string;
  service_name: string;
  owner: string;
  owner_email?: string;
  env?: string;
  agent_id?: string;
  check_interval?: number;
  timeout?: number;
  enabled: boolean;
  created_at?: string;
}

interface Agent {
  agent_id: string;
  hostname: string;
  ip: string;
  status: string;
  last_heartbeat?: string;
  metrics_count?: number;
  host?: string;
  name?: string;
}

export default function AgentTargets() {
  const [targets, setTargets] = useState<AgentTarget[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    agents: { total: number; online: number };
    targets: { total: number; enabled: number };
  }>({
    agents: { total: 0, online: 0 },
    targets: { total: 0, enabled: 0 }
  });

  // 自动发现相关状态
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    found: number;
    targets: AgentTarget[];
    error?: string;
  } | null>(null);

  // Agent Server 地址 (8090 端口)
  const AGENT_SERVER_URL = '/api/agent';

  const fetchAgents = async () => {
    try {
      const resp = await fetch(`${AGENT_SERVER_URL}/api/v1/agents`);
      const data = await resp.json();
      if (data.status === 'success') {
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const fetchTargets = async () => {
    try {
      setLoading(true);
      setError(null);
      // 调用 Agent Server 的 API 获取 Agent 管理的目标
      const response = await fetch('/api/agent/api/v1/agent-targets');
      const result = await response.json();
      
      if (result.status === 'success') {
        setTargets(result.targets || []);
      } else {
        setError(result.error || '获取目标列表失败');
      }
    } catch (err) {
      setError('获取目标列表失败，请检查网络连接');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // 获取 Agent 列表和状态
      const resp = await fetch(`${AGENT_SERVER_URL}/api/v1/agents`);
      const data = await resp.json();
      const agentsList = data.agents || [];
      
      // 获取 Agent 目标列表
      const targetsResp = await fetch(`${AGENT_SERVER_URL}/api/v1/agent-targets`);
      const targetsData = await targetsResp.json();
      const agentTargets = targetsData.targets || [];
      
      setStats({
        agents: { 
          total: agentsList.length, 
          online: agentsList.filter((a: Agent) => a.status === 'online').length 
        },
        targets: { 
          total: agentTargets.length, 
          enabled: agentTargets.filter((t: AgentTarget) => t.enabled).length 
        }
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchTargets();
    fetchStats();
    
    // 定期刷新
    const interval = setInterval(() => {
      fetchAgents();
      fetchStats();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const copyAgentId = (agentId: string) => {
    navigator.clipboard.writeText(agentId);
    setCopiedAgentId(agentId);
    setTimeout(() => setCopiedAgentId(null), 2000);
  };

  // 自动发现目标
  const handleDiscoverTargets = async (agentId: string) => {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const resp = await fetch(`${AGENT_SERVER_URL}/api/v1/agents/${encodeURIComponent(agentId)}/discover`, {
        method: 'POST',
      });
      const data = await resp.json();
      if (data.status === 'success') {
        setDiscoverResult({
          found: data.targets?.length || 0,
          targets: data.targets || [],
        });
      } else {
        setDiscoverResult({
          found: 0,
          targets: [],
          error: data.error || data.message || '自动发现失败',
        });
      }
    } catch (err) {
      setDiscoverResult({
        found: 0,
        targets: [],
        error: '网络错误，请检查 Agent 连接',
      });
    } finally {
      setDiscovering(false);
    }
  };

  const filteredTargets = targets.filter(target =>
    target.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    target.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    target.owner.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAgentName = (agentId?: string) => {
    if (!agentId) return '未分配';
    // 优先匹配 agent_id，然后匹配 host
    let agent = agents.find(a => a.agent_id === agentId);
    if (!agent) {
      // 如果 agent_id 不匹配，尝试匹配 host（因为有些配置可能使用 host 作为 agent_id）
      agent = agents.find(a => a.host === agentId || a.ip === agentId);
    }
    return agent ? (agent.hostname || agent.ip || agent.name || 'Agent') : agentId.substring(0, 8);
  };

  const getAgentStatus = (agentId?: string) => {
    if (!agentId) return null;
    let agent = agents.find(a => a.agent_id === agentId);
    if (!agent) {
      agent = agents.find(a => a.host === agentId || a.ip === agentId);
    }
    if (!agent) return 'offline';
    return agent.status;
  };

  if (loading && targets.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent 目标管理</h1>
          <p className="text-gray-500 mt-1">
            管理分配给 Agent 的监控目标
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setShowDiscoverModal(true);
              setDiscoverResult(null);
            }}
            className="btn-secondary flex items-center space-x-2"
            title="自动发现目标"
          >
            <Wand2 className="h-4 w-4" />
            <span>自动发现</span>
          </button>
          <button
            onClick={() => fetchTargets()}
            className="btn-secondary flex items-center space-x-2"
            title="刷新目标列表"
          >
            <RefreshCw className="h-4 w-4" />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-200 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-blue-50">
              <Server className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Agent 总数</p>
              <p className="text-2xl font-bold text-gray-900">{stats.agents.total}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-green-50">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">在线 Agent</p>
              <p className="text-2xl font-bold text-green-600">{stats.agents.online}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-purple-50">
              <Globe className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">监控目标</p>
              <p className="text-2xl font-bold text-gray-900">{stats.targets.total}</p>
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
              <p className="text-2xl font-bold text-gray-900">{stats.targets.enabled}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Agent List */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">在线 Agent</h2>
        </div>
        {agents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Server className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>暂无 Agent 注册</p>
            <p className="text-sm mt-1">部署 Agent 后将自动显示在这里</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="text-left">主机名</th>
                  <th className="text-left">IP 地址</th>
                  <th className="text-left">状态</th>
                  <th className="text-left">Agent ID</th>
                  <th className="text-left">最后心跳</th>
                  <th className="text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agent_id} className="border-t">
                    <td className="py-3">
                      <div className="flex items-center">
                        <Server className="h-5 w-5 text-gray-400 mr-2" />
                        <span className="font-medium">{agent.hostname || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="text-gray-600">{agent.ip || '-'}</td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        agent.status === 'online' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {agent.status === 'online' ? '在线' : '离线'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center space-x-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {agent.agent_id.substring(0, 8)}...
                        </code>
                        <button
                          onClick={() => copyAgentId(agent.agent_id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          title="复制完整ID"
                        >
                          {copiedAgentId === agent.agent_id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="text-gray-600 text-sm">
                      {agent.last_heartbeat 
                        ? new Date(agent.last_heartbeat).toLocaleString('zh-CN')
                        : '-'}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDiscoverTargets(agent.agent_id)}
                        className="text-primary-600 hover:text-primary-700 text-sm flex items-center space-x-1"
                        title="自动发现该 Agent 上的目标"
                      >
                        <Wand2 className="h-4 w-4 mr-1" />
                        发现
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索 URL、服务名、负责人..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Targets List */}
      <div className="space-y-4">
        {filteredTargets.length === 0 ? (
          <div className="card text-center py-12">
            <Globe className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {searchTerm ? '没有找到匹配的目标' : '暂无监控目标'}
            </h2>
            <p className="text-gray-500 mb-6">
              {searchTerm ? '请尝试调整搜索条件' : '暂无监控目标，请从 Agent 本地配置同步'}
            </p>

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

                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      {target.owner && (
                        <div className="flex items-center space-x-1">
                          <User className="h-4 w-4" />
                          <span>{target.owner}</span>
                        </div>
                      )}
                      {target.timeout && (
                        <div className="flex items-center space-x-1">
                          <span>超时 {target.timeout}s</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <Server className="h-4 w-4" />
                        <span>分配到: </span>
                        <span className={`font-medium ${
                          getAgentStatus(target.agent_id) === 'online' 
                            ? 'text-green-600' 
                            : 'text-gray-500'
                        }`}>
                          {getAgentName(target.agent_id)}
                        </span>
                        {target.agent_id && (
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {target.agent_id.substring(0, 8)}
                          </code>
                        )}
                      </div>
                    </div>
                  </div>
                </div>


              </div>
            </div>
          ))
        )}
      </div>

      {/* 自动发现 Modal */}
      {showDiscoverModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center space-x-3">
                <Wand2 className="h-5 w-5 text-primary-600" />
                <h3 className="text-lg font-semibold">自动发现目标</h3>
              </div>
              <button
                onClick={() => setShowDiscoverModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {discovering ? (
                <div className="text-center py-8">
                  <Loader2 className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
                  <p className="text-gray-600">正在扫描 Agent 上的 SSL 证书...</p>
                </div>
              ) : discoverResult ? (
                <div>
                  {discoverResult.error ? (
                    <div className="text-center py-8">
                      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                      <p className="text-red-600">{discoverResult.error}</p>
                    </div>
                  ) : discoverResult.found === 0 ? (
                    <div className="text-center py-8">
                      <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">未发现新的 SSL 证书目标</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-green-600 mb-4 font-medium">
                        发现 {discoverResult.found} 个 SSL 证书目标
                      </p>
                      <div className="max-h-60 overflow-y-auto border rounded-lg">
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-4 py-2 text-sm">URL</th>
                              <th className="text-left px-4 py-2 text-sm">服务名</th>
                              <th className="text-left px-4 py-2 text-sm">Agent</th>
                            </tr>
                          </thead>
                          <tbody>
                            {discoverResult.targets.map((target, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="px-4 py-2 text-sm">{target.url}</td>
                                <td className="px-4 py-2 text-sm">{target.service_name || '-'}</td>
                                <td className="px-4 py-2 text-sm">{target.agent_id?.substring(0, 8) || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => {
                        setShowDiscoverModal(false);
                        setDiscoverResult(null);
                        fetchTargets();
                        fetchStats();
                      }}
                      className="btn-secondary"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-600 mb-6">
                    选择一个 Agent 进行自动发现，系统将扫描该 Agent 本地配置中的 SSL 证书目标。
                  </p>
                  <div className="mb-6">
                    {agents.length === 0 ? (
                      <p className="text-gray-500">暂无可用的 Agent</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {agents.map((agent) => (
                          <button
                            key={agent.agent_id}
                            onClick={() => handleDiscoverTargets(agent.agent_id)}
                            className="w-full px-4 py-2 text-left border rounded-lg hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span>
                              <span className="font-medium">{agent.hostname || agent.ip}</span>
                              <span className="text-gray-500 text-sm ml-2">{agent.agent_id.substring(0, 8)}...</span>
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              agent.status === 'online' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {agent.status === 'online' ? '在线' : '离线'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowDiscoverModal(false)}
                    className="btn-secondary"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
