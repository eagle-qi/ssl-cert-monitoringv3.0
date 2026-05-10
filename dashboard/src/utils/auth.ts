import { User } from '../types';

const STORAGE_KEY = 'ssl_cert_user';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24小时

// 通过API验证登录
export async function login(username: string, password: string): Promise<User | null> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    
    if (data.success) {
      const user: User = {
        username: data.user.username,
        token: generateToken(),
        loginTime: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return user;
    }
    return null;
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
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
