import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { login } from '../utils/auth';

// 使用相对路径，通过 Nginx 反向代理访问验证码服务
const CAPTCHA_API_URL = '';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const navigate = useNavigate();
  
  // 加载验证码
  const loadCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const response = await fetch(`${CAPTCHA_API_URL}/api/captcha?sessionId=${sessionId || ''}`);
      const data = await response.json();
      setCaptchaImage(data.captcha);
      setSessionId(data.sessionId);
    } catch (err) {
      setError('验证码服务连接失败');
    }
    setCaptchaLoading(false);
  };
  
  // 组件挂载时加载验证码
  useEffect(() => {
    loadCaptcha();
  }, []);
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    // 验证验证码
    try {
      const verifyResponse = await fetch(`${CAPTCHA_API_URL}/api/captcha/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, captcha })
      });
      const verifyData = await verifyResponse.json();
      
      if (!verifyData.success) {
        setError(verifyData.message || '验证码错误');
        setLoading(false);
        loadCaptcha();
        setCaptcha('');
        return;
      }
    } catch (err) {
      setError('验证码验证失败');
      setLoading(false);
      return;
    }
    
    // 验证用户名密码（通过API）
    const user = await login(username, password);
    
    if (user) {
      navigate('/dashboard');
    } else {
      setError('用户名或密码错误');
      loadCaptcha();
      setCaptcha('');
    }
    
    setLoading(false);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary-100 p-4 rounded-full mb-4">
            <Shield className="h-12 w-12 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SSL证书监控平台</h1>
          <p className="text-gray-500 mt-2">请登录以继续</p>
        </div>
        
        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center space-x-2 bg-red-50 text-red-700 p-3 rounded-lg">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              用户名
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="请输入用户名"
              required
              autoComplete="username"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              密码
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="请输入密码"
              required
              autoComplete="current-password"
            />
          </div>
          
          <div>
            <label htmlFor="captcha" className="block text-sm font-medium text-gray-700 mb-2">
              验证码
            </label>
            <div className="flex space-x-3">
              <input
                type="text"
                id="captcha"
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                className="input flex-1"
                placeholder="请输入验证码"
                required
                maxLength={4}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={loadCaptcha}
                disabled={captchaLoading}
                className="flex-shrink-0 p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                title="刷新验证码"
              >
                <RefreshCw className={`h-6 w-6 text-gray-600 ${captchaLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            {/* 验证码图片 */}
            {captchaImage && (
              <div 
                className="mt-3 cursor-pointer"
                onClick={loadCaptcha}
                title="点击刷新验证码"
                dangerouslySetInnerHTML={{ __html: captchaImage }}
              />
            )}
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>登录中...</span>
              </>
            ) : (
              <span>登录</span>
            )}
          </button>
        </form>
        
        {/* 提示信息 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>账号信息请查看环境变量配置</p>
        </div>
      </div>
    </div>
  );
}
