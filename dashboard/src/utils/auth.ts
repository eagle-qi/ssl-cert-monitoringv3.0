import { User } from '../types';

const STORAGE_KEY = 'ssl_cert_user';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24小时

const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

export function login(username: string, password: string): User | null {
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const user: User = {
      username,
      token: generateToken(),
      loginTime: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return user;
  }
  return null;
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getCurrentUser(): User | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    const user: User = JSON.parse(stored);
    
    // 检查会话是否过期
    if (Date.now() - user.loginTime > SESSION_TIMEOUT) {
      logout();
      return null;
    }
    
    return user;
  } catch {
    logout();
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
