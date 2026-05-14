import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, LayoutDashboard, FileText, LogOut, RefreshCw, Bell, Settings, Eye, Server } from 'lucide-react';
import { logout, getCurrentUser } from '../utils/auth';
import { useState, useEffect } from 'react';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const user = getCurrentUser();
    setIsAdmin(user?.role === 'admin');
  }, []);
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  const refreshPage = () => {
    setRefreshing(true);
    window.location.reload();
    setTimeout(() => setRefreshing(false), 1000);
  };
  
  const navItems = [
    { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
    { path: '/certificates', label: '证书列表', icon: FileText },
    { path: '/alerts', label: '告警管理', icon: Bell },
    ...(isAdmin ? [
      { path: '/targets', label: '目标管理', icon: Settings },
      { path: '/agent-targets', label: 'Agent目标', icon: Server }
    ] : []),
  ];
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900">SSL证书监控</span>
            </div>
            
            {/* 导航菜单 */}
            <div className="hidden md:flex space-x-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            
            {/* 右侧操作 */}
            <div className="flex items-center space-x-3">
              {/* 用户信息 */}
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                <span className="text-sm font-medium text-gray-700">{getCurrentUser()?.username}</span>
                {isAdmin ? (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded">管理员</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded flex items-center">
                    <Eye className="h-3 w-3 mr-1" />
                    只读
                  </span>
                )}
              </div>
              <button
                onClick={refreshPage}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="刷新页面"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>退出登录</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      {/* 移动端导航 */}
      <div className="md:hidden bg-white border-b border-gray-200">
        <div className="flex justify-around py-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center space-y-1 px-4 py-2 rounded-lg ${
                  isActive ? 'text-primary-600' : 'text-gray-600'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      
      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
