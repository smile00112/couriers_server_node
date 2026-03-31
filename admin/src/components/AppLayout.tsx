import { ThemedLayout, ThemedSider } from '@refinedev/antd';
import { useMenu } from '@refinedev/core';
import { Menu } from 'antd';
import {
  FileTextOutlined,
  TeamOutlined,
  UserOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import type { ReactNode } from 'react';

const ICONS: Record<string, ReactNode> = {
  orders: <FileTextOutlined />,
  couriers: <TeamOutlined />,
  users: <UserOutlined />,
  'route-history': <EnvironmentOutlined />,
};

function AppSider() {
  const { menuItems, selectedKey } = useMenu();
  const navigate = useNavigate();

  const items = menuItems.map((item) => ({
    key: item.key,
    icon: ICONS[item.name] ?? null,
    label: item.label,
    onClick: () => navigate(item.route ?? `/${item.name}`),
  }));

  return (
    <ThemedSider
      render={() => (
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          style={{ borderRight: 0 }}
        />
      )}
    />
  );
}

export function AppLayout({ children }: { children?: ReactNode }) {
  return (
    <ThemedLayout Sider={AppSider}>
      {children}
    </ThemedLayout>
  );
}
