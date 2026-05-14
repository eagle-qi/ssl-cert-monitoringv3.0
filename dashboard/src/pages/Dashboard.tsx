import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, TrendingUp, Clock, RefreshCw, Activity, Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { SSLCertData, DashboardStats } from '../types';
import { fetchMetrics, calculateStats } from '../utils/metrics';

const STATUS_CONFIG = {
  valid: { label: '正常', color: '#10b981', icon: CheckCircle, bgColor: 'bg-green-50' },
  warning: { label: '即将过期', color: '#f59e0b', icon: AlertTriangle, bgColor: 'bg-amber-50' },
  critical: { label: '紧急', color: '#ef4444', icon: XCircle, bgColor: 'bg-red-50' },
  expired: { label: '已过期', color: '#6b7280', icon: XCircle, bgColor: 'bg-gray-50' },
};

function exportToMarkdown(data: SSLCertData[], stats: DashboardStats | null) {
  const now = new Date().toLocaleString('zh-CN');
  const lines: string[] = [];

  lines.push('# SSL 证书监控报告');
  lines.push('');
  lines.push(`> 生成时间：${now}`);
  lines.push('');

  // 概览
  if (stats) {
    lines.push('## 概览统计');
    lines.push('');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 证书总数 | ${stats.total} |`);
    lines.push(`| 正常 | ${stats.valid} |`);
    lines.push(`| 即将过期 | ${stats.warning} |`);
    lines.push(`| 紧急 | ${stats.critical} |`);
    lines.push(`| 已过期 | ${stats.expired} |`);
    lines.push(`| 平均剩余天数 | ${stats.average_days_left} 天 |`);
    lines.push('');
  }

  // 即将过期 / 紧急 / 已过期
  const abnormalCerts = data
    .filter(cert => cert.status !== 'valid')
    .sort((a, b) => a.days_left - b.days_left);

  if (abnormalCerts.length > 0) {
    lines.push('## 异常证书');
    lines.push('');
    lines.push('| 状态 | 服务名称 | 主机 | 端口 | 团队 | 环境 | 剩余天数 | 到期日期 | 颁发者 |');
    lines.push('|------|----------|------|------|------|------|----------|----------|--------|');
    abnormalCerts.forEach(cert => {
      const statusLabel = STATUS_CONFIG[cert.status]?.label || cert.status;
      lines.push(`| ${statusLabel} | ${cert.service_name} | ${cert.hostname} | ${cert.port} | ${cert.owner} | ${cert.env} | ${cert.days_left} 天 | ${cert.not_after_date} | ${cert.issuer_org || cert.issuer_cn || '-'} |`);
    });
    lines.push('');
  }

  // 全部证书列表
  const sorted = [...data].sort((a, b) => a.days_left - b.days_left);
  lines.push('## 全部证书列表');
  lines.push('');
  lines.push('| 状态 | 服务名称 | 主机 | 端口 | 团队 | 环境 | 剩余天数 | 到期日期 | WebTrust |');
  lines.push('|------|----------|------|------|------|------|----------|----------|----------|');
  sorted.forEach(cert => {
    const statusLabel = STATUS_CONFIG[cert.status]?.label || cert.status;
    const webtrust = cert.is_webtrust ? '是' : '否';
    lines.push(`| ${statusLabel} | ${cert.service_name} | ${cert.hostname} | ${cert.port} | ${cert.owner} | ${cert.env} | ${cert.days_left} 天 | ${cert.not_after_date} | ${webtrust} |`);
  });
  lines.push('');

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `ssl-cert-report-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Dashboard() {
  const [data, setData] = useState<SSLCertData[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const metrics = await fetchMetrics();
      setData(metrics);
      setStats(calculateStats(metrics));
      setLastUpdate(new Date());
    } catch (err) {
      setError('获取数据失败，请检查网络连接');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);
  
  if (loading && !data.length) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }
  
  if (error && !data.length) {
    return (
      <div className="card text-center py-12">
        <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">加载失败</h2>
        <p className="text-gray-500 mb-6">{error}</p>
        <button onClick={loadData} className="btn-primary">
          重试
        </button>
      </div>
    );
  }
  
  // 饼图数据
  const pieData = [
    { name: '正常', value: stats?.valid || 0, color: '#10b981' },
    { name: '即将过期', value: stats?.warning || 0, color: '#f59e0b' },
    { name: '紧急', value: stats?.critical || 0, color: '#ef4444' },
    { name: '已过期', value: stats?.expired || 0, color: '#6b7280' },
  ].filter(item => item.value > 0);
  
  // 环境分布数据
  const envData = Object.entries(
    data.reduce((acc, cert) => {
      acc[cert.env] = (acc[cert.env] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));
  
  // 团队分布数据
  const ownerData = Object.entries(
    data.reduce((acc, cert) => {
      acc[cert.owner] = (acc[cert.owner] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));
  
  // 即将过期的证书
  const expiringCerts = data
    .filter(cert => cert.days_left <= 30)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 5);
  
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">仪表盘概览</h1>
          <p className="text-gray-500 mt-1">
            {lastUpdate && (
              <>最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}</>
            )}
          </p>
        </div>
        <button onClick={loadData} className="btn-secondary flex items-center space-x-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </button>
        <button
          onClick={() => exportToMarkdown(data, stats)}
          className="btn-primary flex items-center space-x-2"
          disabled={data.length === 0}
        >
          <Download className="h-4 w-4" />
          <span>导出报告</span>
        </button>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="证书总数"
          value={stats?.total || 0}
          icon={Shield}
          color="text-primary-600"
          bgColor="bg-primary-50"
        />
        <StatCard
          title="正常证书"
          value={stats?.valid || 0}
          icon={CheckCircle}
          color="text-green-600"
          bgColor="bg-green-50"
        />
        <StatCard
          title="即将过期"
          value={stats?.warning || 0}
          icon={AlertTriangle}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          title="紧急/过期"
          value={(stats?.critical || 0) + (stats?.expired || 0)}
          icon={XCircle}
          color="text-red-600"
          bgColor="bg-red-50"
        />
      </div>
      
      {/* 统计指标 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="平均剩余天数"
          value={stats?.average_days_left || 0}
          suffix="天"
          icon={TrendingUp}
          color="text-purple-600"
          bgColor="bg-purple-50"
        />
        <StatCard
          title="生产环境"
          value={data.filter(d => d.env === 'production').length}
          icon={Activity}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatCard
          title="测试环境"
          value={data.filter(d => d.env === 'test').length}
          icon={Clock}
          color="text-gray-600"
          bgColor="bg-gray-50"
        />
      </div>
      
      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 证书状态分布 */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">证书状态分布</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* 环境分布 */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">按环境分布</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={envData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* 团队分布 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">按团队分布</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ownerData} layout="vertical">
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* 即将过期告警 */}
      {expiringCerts.length > 0 && (
        <div className="card border-red-200">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">即将过期告警 (≤30天)</h3>
          </div>
          <div className="space-y-3">
            {expiringCerts.map((cert, index) => {
              const config = STATUS_CONFIG[cert.status];
              const StatusIcon = config.icon;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg ${config.bgColor}`}
                >
                  <div className="flex items-center space-x-4">
                    <StatusIcon className="h-5 w-5" style={{ color: config.color }} />
                    <div>
                      <p className="font-medium text-gray-900">{cert.service_name}</p>
                      <p className="text-sm text-gray-500">{cert.hostname}:{cert.port}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: config.color }}>
                      剩余 {cert.days_left} 天
                    </p>
                    <p className="text-sm text-gray-500">
                      到期: {cert.not_after_date}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

function StatCard({ title, value, suffix, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center space-x-4">
        <div className={`p-3 rounded-lg ${bgColor}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">
            {value}{suffix}
          </p>
        </div>
      </div>
    </div>
  );
}
