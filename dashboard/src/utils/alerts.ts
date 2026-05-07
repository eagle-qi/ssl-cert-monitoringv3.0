import { Alert, AlertLabel, AlertAnnotation, AlertStats } from '../types/alert';

const ALERT_API_URL = '/api/alerts';

// Alertmanager API 返回的告警格式
interface AlertmanagerAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: string;
  activeAt?: string;
  value?: string;
}

export async function fetchAlerts(): Promise<Alert[]> {
  try {
    const response = await fetch(ALERT_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const rawData = await response.json();
    
    // 兼容 v2 API 直接返回数组格式，也支持 Prometheus v1 API 格式
    const alertsData: AlertmanagerAlert[] = Array.isArray(rawData) 
      ? rawData 
      : (rawData.data?.alerts || []);
    
    // 转换为前端期望的格式
    return alertsData.map((alert) => ({
      labels: alert.labels as AlertLabel,
      annotations: alert.annotations as AlertAnnotation,
      state: (alert.state || 'inactive') as 'firing' | 'pending' | 'inactive',
      activeAt: alert.activeAt || new Date().toISOString(),
      value: alert.value || '1'
    }));
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    throw error;
  }
}

export function calculateAlertStats(alerts: Alert[]): AlertStats {
  return {
    total: alerts.length,
    firing: alerts.filter(a => a.state === 'firing').length,
    pending: alerts.filter(a => a.state === 'pending').length,
    inactive: alerts.filter(a => a.state === 'inactive').length,
  };
}

export function getAlertSeverityColor(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return '#ef4444';
    case 'error':
      return '#f97316';
    case 'warning':
      return '#f59e0b';
    case 'info':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
}

export function getAlertStateColor(state: string): { bg: string; text: string; color: string } {
  switch (state) {
    case 'firing':
      return { bg: 'bg-red-50', text: 'text-red-800', color: '#ef4444' };
    case 'pending':
      return { bg: 'bg-amber-50', text: 'text-amber-800', color: '#f59e0b' };
    case 'inactive':
      return { bg: 'bg-green-50', text: 'text-green-800', color: '#10b981' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-800', color: '#6b7280' };
  }
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function getTimeSince(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}天${diffHours % 24}小时`;
  } else if (diffHours > 0) {
    return `${diffHours}小时${diffMins % 60}分钟`;
  } else if (diffMins > 0) {
    return `${diffMins}分钟`;
  } else {
    return '刚刚';
  }
}
