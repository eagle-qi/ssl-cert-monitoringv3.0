export interface AlertLabel {
  alert_type?: string;
  alertname: string;
  env?: string;
  hostname?: string;
  instance?: string;
  job?: string;
  owner?: string;
  port?: string;
  service_name?: string;
  severity?: string;
  [key: string]: string | undefined;
}

export interface AlertAnnotation {
  description?: string;
  owner?: string;
  service?: string;
  summary?: string;
  [key: string]: string | undefined;
}

export interface Alert {
  labels: AlertLabel;
  annotations: AlertAnnotation;
  state: 'firing' | 'pending' | 'inactive';
  activeAt: string;
  value: string;
}

export interface AlertResponse {
  status: string;
  data: {
    alerts: Alert[];
  };
}

export interface AlertStats {
  total: number;
  firing: number;
  pending: number;
  inactive: number;
}
