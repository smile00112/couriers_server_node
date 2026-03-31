import { useState } from 'react';
import { useTable } from '@refinedev/antd';
import { Table, Tag, Input, Space, Typography, Empty } from 'antd';
import { SearchOutlined, EditOutlined } from '@ant-design/icons';
import type { CrudFilters } from '@refinedev/core';
import { CourierDrawer } from './CourierDrawer';

const STATUS_COLORS: Record<string, string> = {
  available: 'green',
  unavailable: 'red',
};

export function CouriersPage() {
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view');

  const { tableProps, setFilters } = useTable({
    resource: 'api/v1/couriers',
    syncWithLocation: true,
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: 'created_at', order: 'desc' }] },
  });

  const handleSearch = (value: string) => {
    const filters: CrudFilters = [];
    if (value) {
      filters.push({ field: 'search', operator: 'contains', value });
    }
    setFilters(filters, 'replace');
  };

  const columns = [
    {
      title: 'Name',
      key: 'name',
      sorter: true,
      render: (_: unknown, record: Record<string, unknown>) =>
        `${record.first_name as string} ${record.last_name as string}`,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] ?? 'default'}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Login',
      dataIndex: 'login',
      key: 'login',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: true,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, record: Record<string, unknown>) => (
        <span className="row-actions" style={{ opacity: 0, transition: 'opacity 0.15s' }}>
          <EditOutlined
            style={{ cursor: 'pointer', color: '#1677ff' }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCourierId(record.id as string);
              setDrawerMode('edit');
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        Couriers
      </Typography.Title>

      <style>{`.ant-table-row:hover .row-actions { opacity: 1 !important; }`}</style>

      <Space style={{ marginBottom: 16 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search by name or phone"
          allowClear
          style={{ width: 280 }}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </Space>

      {tableProps.dataSource?.length === 0 && !tableProps.loading && (
        <Empty description="No couriers found" style={{ margin: '48px 0' }} />
      )}

      <Table
        {...tableProps}
        rowKey="id"
        columns={columns}
        onRow={(record) => ({
          onClick: () => {
            setSelectedCourierId((record as { id: string }).id);
            setDrawerMode('view');
          },
          style: { cursor: 'pointer' },
        })}
        scroll={{ x: 700 }}
      />

      <CourierDrawer
        courierId={selectedCourierId}
        initialMode={drawerMode}
        onClose={() => setSelectedCourierId(null)}
      />
    </div>
  );
}
