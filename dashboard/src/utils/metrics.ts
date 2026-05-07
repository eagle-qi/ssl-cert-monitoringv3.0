import { SSLCertData, SSLCertMetric } from '../types';

// 使用相对路径，由Nginx反向代理
const METRICS_API_URL = '/api/metrics';

// 解析Prometheus格式的metrics数据
export function parseMetrics(text: string): SSLCertData[] {
  const lines = text.split('\n');
  const metrics: Map<string, SSLCertMetric> = new Map();
  const values: Map<string, { [key: string]: number | string }> = new Map();
  
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    
    // 匹配格式: metric_name{label1="value1",...} value
    const match = line.match(/^(\w+)\{([^}]+)\}\s+([\d.]+)$/);
    if (!match) continue;
    
    const [, metricName, labelsStr, valueStr] = match;
    const labels: { [key: string]: string } = {};
    
    // 解析标签
    const labelMatches = labelsStr.matchAll(/(\w+)="([^"]*)"/g);
    for (const [, key, value] of labelMatches) {
      labels[key] = value;
    }
    
    const value = metricName.includes('timestamp') || metricName === 'ssl_cert_check_success' || metricName === 'ssl_cert_sans_count' || metricName === 'ssl_cert_serial'
      ? parseInt(valueStr)
      : parseFloat(valueStr);
    
    // 使用hostname+port作为唯一标识
    const key = `${labels.hostname}:${labels.port}`;
    
    if (!metrics.has(key)) {
      metrics.set(key, {
        hostname: labels.hostname,
        port: labels.port,
        owner: labels.owner || '未知',
        env: labels.env || '未知',
        service_name: labels.service_name || labels.hostname,
        subject_cn: labels.subject_cn,
        issuer_cn: labels.issuer_cn,
        subject: labels.subject,
        issuer: labels.issuer,
        serial: labels.serial,
      });
    }
    
    if (!values.has(key)) {
      values.set(key, {});
    }
    
    const metricKey = metricName.replace('ssl_cert_', '');
    values.get(key)![metricKey] = value;
  }
  
  // 转换为完整的数据对象
  const result: SSLCertData[] = [];
  for (const [key, metric] of metrics) {
    const vals = values.get(key)!;
    
    const notAfterTimestamp = vals.not_after_timestamp as number;
    const notBeforeTimestamp = vals.not_before_timestamp as number;
    const daysLeft = vals.days_left as number;
    const checkSuccess = vals.check_success as number;
    const sansCount = vals.sans_count as number;
    
    // 计算状态
    let status: 'valid' | 'warning' | 'critical' | 'expired' = 'valid';
    let statusColor = '#10b981'; // green
    
    if (checkSuccess === 0) {
      status = 'expired';
      statusColor = '#ef4444'; // red
    } else if (daysLeft <= 7) {
      status = 'critical';
      statusColor = '#ef4444'; // red
    } else if (daysLeft <= 30) {
      status = 'warning';
      statusColor = '#f59e0b'; // amber
    }
    
    result.push({
      ...metric,
      days_left: daysLeft,
      not_after_timestamp: notAfterTimestamp,
      not_before_timestamp: notBeforeTimestamp,
      check_success: checkSuccess,
      sans_count: sansCount,
      serial_value: vals.serial as number,
      not_after_date: formatDate(notAfterTimestamp * 1000),
      not_before_date: formatDate(notBeforeTimestamp * 1000),
      days_until_expiry: daysLeft,
      status,
      status_color: statusColor,
    });
  }
  
  return result;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export async function fetchMetrics(): Promise<SSLCertData[]> {
  try {
    const response = await fetch(METRICS_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return parseMetrics(text);
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    throw error;
  }
}

export function calculateStats(data: SSLCertData[]) {
  const total = data.length;
  const valid = data.filter(d => d.status === 'valid').length;
  const warning = data.filter(d => d.status === 'warning').length;
  const critical = data.filter(d => d.status === 'critical').length;
  const expired = data.filter(d => d.status === 'expired').length;
  
  const averageDaysLeft = total > 0
    ? Math.round(data.reduce((sum, d) => sum + d.days_left, 0) / total)
    : 0;
  
  return { total, valid, warning, critical, expired, average_days_left: averageDaysLeft };
}

export function filterCertificates(data: SSLCertData[], filters: {
  owner?: string;
  env?: string;
  status?: string;
  search?: string;
}): SSLCertData[] {
  return data.filter(cert => {
    if (filters.owner && cert.owner !== filters.owner) return false;
    if (filters.env && cert.env !== filters.env) return false;
    if (filters.status && cert.status !== filters.status) return false;
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        cert.service_name.toLowerCase().includes(searchLower) ||
        cert.hostname.toLowerCase().includes(searchLower) ||
        cert.owner.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });
}

export function getUniqueValues(data: SSLCertData[], key: keyof SSLCertData): string[] {
  return [...new Set(data.map(d => String(d[key])))].sort();
}
