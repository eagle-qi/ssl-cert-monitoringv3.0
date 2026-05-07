import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  RefreshCw, 
  Bell,
  ChevronDown,
  ChevronUp,
  Shield,
  Server,
  User
} from 'lucide-react';
import { Alert, AlertStats } from '../types/alert';
import { 
  fetchAlerts, 
  calculateAlertStats, 
  getAlertSeverityColor,
  formatTimestamp,
  getTimeSince
} from '../utils/alerts';

const STATE_CONFIG = {
  firing: { 
    label: ' firing', 
    icon: XCircle, 
    bgColor: 'bg-red-50', 
    borderColor: 'border-red-200',
    iconColor: 'text-red-500',
    textColor: 'text-red-800'
  },
  pending: { 
    label: '待触发', 
    icon: Clock, 
    bgColor: 'bg-amber-50', 
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-500',
    textColor: 'text-amber-800'
  },
  inactive: { 
    label: '已解决', 
    icon: CheckCircle, 
    bgColor: 'bg-green-50', 
    borderColor: 'border-green-200',
    iconColor: 'text-green-500',
    textColor: 'text-green-800'
  },
};

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<string>('');
  const [severityFilter] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());

  const REFRESH_INTERVAL = 10000; // 10秒刷新

  const loadAlerts = async (isManual = false) => {
    try {
      if (!isManual) setLoading(true);
      setError(null);
      const alertData = await fetchAlerts();
      
      // 检测新增告警
      const currentIds = new Set(alerts.map(a => `${a.labels.alertname}-${a.labels.hostname}`));
      const newIds = new Set<string>();
      alertData.forEach(alert => {
        const id = `${alert.labels.alertname}-${alert.labels.hostname}`;
        if (!currentIds.has(id) && alerts.length > 0) {
          newIds.add(id);
        }
      });
      
      if (newIds.size > 0) {
        setNewAlertIds(newIds);
        setTimeout(() => setNewAlertIds(new Set()), 3000); // 3秒后清除高亮
      }
      
      setAlerts(alertData);
      setStats(calculateAlertStats(alertData));
      setLastUpdate(new Date());
    } catch (err) {
      setError('获取告警数据失败，请检查网络连接');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    if (!isAutoRefresh) return;
    
    const interval = setInterval(() => loadAlerts(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(!isAutoRefresh);
    if (!isAutoRefresh) {
      loadAlerts();
    }
  };

  const toggleAlert = (alertKey: string) => {
    const newExpanded = new Set(expandedAlerts);
    if (newExpanded.has(alertKey)) {
      newExpanded.delete(alertKey);
    } else {
      newExpanded.add(alertKey);
    }
    setExpandedAlerts(newExpanded);
  };

  const filteredAlerts = alerts.filter(alert => {
    if (stateFilter && alert.state !== stateFilter) return false;
    if (severityFilter && alert.labels.severity !== severityFilter) return false;
    return true;
  });

  const getAlertKey = (alert: Alert) => {
    return `${alert.labels.alertname}-${alert.labels.hostname || ''}-${alert.labels.port || ''}`;
  };

  if (loading && !alerts.length) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载告警数据中...</p>
        </div>
      </div>
    );
  }

  if (error && !alerts.length) {
    return (
      <div className="card text-center py-12">
        <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">加载失败</h2>
        <p className="text-gray-500 mb-6">{error}</p>
        <button onClick={() => loadAlerts()} className="btn-primary">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
            <span>告警管理</span>
            {newAlertIds.size > 0 && (
              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full animate-bounce">
                +{newAlertIds.size} 新增
              </span>
            )}
          </h1>
          <p className="text-gray-500 mt-1 flex items-center space-x-2">
            <span>实时监控 SSL 证书告警信息</span>
            {lastUpdate && (
              <span className="text-xs bg-gray-100 px-2 py-1 rounded flex items-center space-x-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isAutoRefresh ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span>最后更新: {lastUpdate.toLocaleTimeString()}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleAutoRefresh}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
              isAutoRefresh 
                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isAutoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span>{isAutoRefresh ? '自动刷新' : '已暂停'}</span>
          </button>
          <button onClick={() => loadAlerts(true)} className="btn-secondary flex items-center space-x-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            title="告警总数"
            value={stats.total}
            icon={Bell}
            color="text-blue-600"
            bgColor="bg-blue-50"
          />
          <StatCard
            title=" firing"
            value={stats.firing}
            icon={XCircle}
            color="text-red-600"
            bgColor="bg-red-50"
          />
          <StatCard
            title="待触发"
            value={stats.pending}
            icon={Clock}
            color="text-amber-600"
            bgColor="bg-amber-50"
          />
          <StatCard
            title="已解决"
            value={stats.inactive}
            icon={CheckCircle}
            color="text-green-600"
            bgColor="bg-green-50"
          />
        </div>
      )}

      {/* 筛选 */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-gray-700 mb-3">状态筛选</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStateFilter('')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !stateFilter 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setStateFilter('firing')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  stateFilter === 'firing' 
                    ? 'bg-red-600 text-white' 
                    : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                firing ({stats?.firing || 0})
              </button>
              <button
                onClick={() => setStateFilter('pending')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  stateFilter === 'pending' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                待触发 ({stats?.pending || 0})
              </button>
              <button
                onClick={() => setStateFilter('inactive')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  stateFilter === 'inactive' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                已解决 ({stats?.inactive || 0})
              </button>
            </div>
          </div>


        </div>
      </div>

      {/* 告警列表 */}
      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="card text-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">暂无告警</h2>
            <p className="text-gray-500">所有证书状态正常，没有活跃的告警</p>
          </div>
        ) : (
          filteredAlerts.map((alert, index) => {
            const config = STATE_CONFIG[alert.state];
            const StateIcon = config.icon;
            const alertKey = getAlertKey(alert);
            const isExpanded = expandedAlerts.has(alertKey);
            const severityColor = getAlertSeverityColor(alert.labels.severity);

            return (
              <div
                key={index}
                className={`card ${config.bgColor} ${config.borderColor} border-2 transition-all ${
                  newAlertIds.has(`${alert.labels.alertname}-${alert.labels.hostname}`) 
                    ? 'ring-4 ring-yellow-400 animate-pulse' 
                    : ''
                }`}
              >
                {/* 告警头部 */}
                <div 
                  className="flex items-start justify-between cursor-pointer"
                  onClick={() => toggleAlert(alertKey)}
                >
                  <div className="flex items-start space-x-4 flex-1">
                    <StateIcon className={`h-6 w-6 ${config.iconColor} mt-1`} />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {alert.labels.alertname}
                        </h3>
                        {alert.labels.severity && (
                          <span
                            className="px-2 py-1 rounded text-xs font-bold text-white"
                            style={{ backgroundColor: severityColor }}
                          >
                            {alert.labels.severity.toUpperCase()}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-gray-700 mb-3">
                        {alert.annotations.summary || alert.annotations.description}
                      </p>

                      {/* 快速信息 */}
                      <div className="flex flex-wrap gap-4 text-sm">
                        {alert.labels.service_name && (
                          <div className="flex items-center space-x-1 text-gray-600">
                            <Server className="h-4 w-4" />
                            <span>{alert.labels.service_name}</span>
                          </div>
                        )}
                        {alert.labels.hostname && (
                          <div className="flex items-center space-x-1 text-gray-600">
                            <Shield className="h-4 w-4" />
                            <span>{alert.labels.hostname}:{alert.labels.port}</span>
                          </div>
                        )}
                        {alert.labels.owner && (
                          <div className="flex items-center space-x-1 text-gray-600">
                            <User className="h-4 w-4" />
                            <span>{alert.labels.owner}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 ml-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        触发时间
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {getTimeSince(alert.activeAt)}前
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTimestamp(alert.activeAt)}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 告警详情 */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span>告警详情</span>
                        </h4>
                        <div className="space-y-3 text-sm">
                          {alert.annotations.description && (
                            <div>
                              <p className="text-gray-500 mb-1">描述：</p>
                              <p className="text-gray-900 bg-white p-3 rounded">
                                {alert.annotations.description}
                              </p>
                            </div>
                          )}
                          {alert.annotations.service && (
                            <div>
                              <p className="text-gray-500 mb-1">服务：</p>
                              <p className="text-gray-900">{alert.annotations.service}</p>
                            </div>
                          )}
                          {alert.annotations.owner && (
                            <div>
                              <p className="text-gray-500 mb-1">负责人：</p>
                              <p className="text-gray-900">{alert.annotations.owner}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 标签信息 */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                          <Bell className="h-4 w-4" />
                          <span>标签信息</span>
                        </h4>
                        <div className="bg-white rounded-lg p-4 space-y-2">
                          {Object.entries(alert.labels).map(([key, value]) => (
                            value && (
                              <div key={key} className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">{key}:</span>
                                <span className="text-gray-900 font-medium">{value}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 元数据 */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 mb-1">当前状态</p>
                          <p className={`font-semibold ${config.textColor}`}>
                            {config.label}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">触发时间</p>
                          <p className="text-gray-900">{formatTimestamp(alert.activeAt)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">告警值</p>
                          <p className="text-gray-900 font-mono">{alert.value}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

function StatCard({ title, value, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center space-x-4">
        <div className={`p-3 rounded-lg ${bgColor}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
