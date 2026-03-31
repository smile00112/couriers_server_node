import { useState } from 'react';
import { useTable } from '@refinedev/antd';
import { Table, Tag, Input, Select, Space, Typography, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { CrudFilters } from '@refinedev/core';
import { OrderDrawer } from './OrderDrawer';
import { BulkActionBar } from './BulkActionBar';

const STATUS_COLORS: Record<string, string> = {
  created: 'blue',
  assigned: 'orange',
  picked_up: 'purple',
  in_delivery: 'cyan',
  completed: 'green',
  cancelled: 'red',
};

const STATUS_OPTIONS = [
  { label: 'Created', value: 'created' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'In Delivery', value: 'in_delivery' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export function OrdersPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const { tableProps, setFilters } = useTable({
    resource: 'orders',
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

  const handleStatusFilter = (value: string | undefined) => {
    const filters: CrudFilters = [];
    if (value) {
      filters.push({ field: 'status', operator: 'eq', value });
    }
    setFilters(filters, 'replace');
  };

  const columns = [
    {
      title: 'Order #',
      dataIndex: 'order_number',
      key: 'order_number',
      sorter: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] ?? 'default'}>
          {status.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Client Phone',
      dataIndex: ['client', 'phone'],
      key: 'client_phone',
    },
    {
      title: 'Courier',
      key: 'courier_name',
      render: (_: unknown, record: Record<string, unknown>) => {
        const courier = record.courier as { first_name: string; last_name: string } | null;
        return courier ? `${courier.first_name} ${courier.last_name}` : '—';
      },
    },
    {
      title: 'Pickup Address',
      dataIndex: 'pickup_address',
      key: 'pickup_address',
      ellipsis: true,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: true,
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        Orders
      </Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search by order # or client phone"
          allowClear
          style={{ width: 280 }}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <Select
          placeholder="Filter by status"
          allowClear
          style={{ width: 180 }}
          options={STATUS_OPTIONS}
          onChange={handleStatusFilter}
        />
      </Space>

      {selectedRowKeys.length > 0 && (
        <BulkActionBar
          selectedRowKeys={selectedRowKeys}
          onClearSelection={() => setSelectedRowKeys([])}
        />
      )}

      {tableProps.dataSource?.length === 0 && !tableProps.loading && (
        <Empty description="No orders found" style={{ margin: '48px 0' }} />
      )}

      <Table
        {...tableProps}
        rowKey="id"
        columns={columns}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        onRow={(record) => ({
          onClick: () => setSelectedOrderId((record as { id: string }).id),
          style: { cursor: 'pointer' },
        })}
        scroll={{ x: 900 }}
      />

      <OrderDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
