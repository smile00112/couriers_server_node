import { useEffect } from 'react';
import { Refine, Authenticated } from '@refinedev/core';
import { RefineThemes, useNotificationProvider } from '@refinedev/antd';
import {
  BrowserRouter,
  Route,
  Routes,
  Outlet,
  useNavigate,
  Navigate,
} from 'react-router';
import { ConfigProvider, App as AntApp } from 'antd';
import '@refinedev/antd/dist/reset.css';

import { authProvider } from './authProvider';
import { dataProvider } from './dataProvider';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/login/LoginPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { CouriersPage } from './pages/couriers/CouriersPage';
import { UsersPage } from './pages/users/UsersPage';
import { RouteHistoryPage } from './pages/route-history/RouteHistoryPage';
import routerBindings from './routerBindings';

// AppInner is rendered inside AntApp so useNotificationProvider
// can access Ant Design's notification context
function AppInner() {
  const notificationProvider = useNotificationProvider();

  return (
    <Refine
      authProvider={authProvider}
      dataProvider={dataProvider}
      routerProvider={routerBindings}
      notificationProvider={notificationProvider}
      resources={[
        {
          name: 'orders',
          list: '/orders',
          show: '/orders/:id',
          meta: { label: 'Orders' },
        },
        {
          name: 'couriers',
          list: '/couriers',
          edit: '/couriers/:id/edit',
          meta: { label: 'Couriers' },
        },
        {
          name: 'users',
          list: '/users',
          create: '/users/create',
          edit: '/users/:id/edit',
          meta: { label: 'Users' },
        },
        {
          name: 'route-history',
          list: '/route-history',
          show: '/route-history/:id',
          meta: { label: 'Route History' },
        },
      ]}
      options={{ syncWithLocation: true, warnWhenUnsavedChanges: false }}
    >
      <Routes>
        {/* Authenticated workspace — redirects to /login if not authenticated */}
        <Route
          element={
            <Authenticated key="authenticated-routes" fallback={<Navigate to="/login" />}>
              <AppLayout>
                <Outlet />
              </AppLayout>
            </Authenticated>
          }
        >
          {/* Default: redirect / → /orders */}
          <Route index element={<RedirectToOrders />} />

          {/* Orders */}
          <Route path="/orders" element={<OrdersPage />} />

          {/* Couriers */}
          <Route path="/couriers" element={<CouriersPage />} />

          {/* Users */}
          <Route path="/users" element={<UsersPage />} />

          {/* Route History */}
          <Route path="/route-history" element={<RouteHistoryPage />} />
        </Route>

        {/* Login — accessible without auth; redirects to /orders if already authenticated */}
        <Route
          path="/login"
          element={
            <Authenticated key="login-route" fallback={<LoginPage />}>
              <Navigate to="/orders" replace />
            </Authenticated>
          }
        />
      </Routes>
    </Refine>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider theme={RefineThemes.Blue}>
        <AntApp>
          <AppInner />
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

function RedirectToOrders() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/orders', { replace: true }); }, [navigate]);
  return null;
}

