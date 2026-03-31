import { useState } from 'react';
import { useTable } from '@refinedev/antd';
import { Table, DatePicker, Space, Typography, Empty } from 'antd';
import type { CrudFilters } from '@refinedev/core';
import dayjs from 'dayjs';
import { RouteHistoryDrawer } from './RouteHistoryDrawer';

export function RouteHistoryPage() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { tableProps, setFilters } = useTable({
    resource: 'api/v1/route-history',
    syncWithLocation: true,
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: 'recorded_date', order: 'desc' }] },
  });

  const handleDateRange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    const filters: CrudFilters = [];
    if (dates?.[0]) {
      filters.push({ field: 'from', operator: 'gte', value: dates[0].toISOString() });
    }
    if (dates?.[1]) {
      filters.push({ field: 'to', operator: 'lte', value: dates[1].toISOString() });
    }
    setFilters(filters, 'replace');
  };

  const columns = [
    {
      title: 'Courier',
      dataIndex: 'courier_name',
      key: 'courier_name',
      sorter: true,
    },
    {
      title: 'Order #',
      dataIndex: 'order_number',
      key: 'order_number',
    },
    {
      title: 'Date',
      dataIndex: 'recorded_date',
      key: 'recorded_date',
      sorter: true,
      render: (v: string) => v,
    },
    {
      title: 'Distance (m)',
      dataIndex: 'total_distance_meters',
      key: 'total_distance_meters',
      render: (v: number) => Math.round(v),
    },
    {
      title: 'Points',
      dataIndex: 'point_count',
      key: 'point_count',
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        Route History
      </Typography.Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker
          onChange={(dates) =>
            handleDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)
          }
        />
      </Space>

      {tableProps.dataSource?.length === 0 && !tableProps.loading && (
        <Empty description="No route history found" style={{ margin: '48px 0' }} />
      )}

      <Table
        {...tableProps}
        rowKey={(record) =>
          `${(record as Record<string, string>).order_id}-${(record as Record<string, string>).courier_id}`
        }
        columns={columns}
        onRow={(record) => ({
          onClick: () => setSelectedOrderId((record as Record<string, string>).order_id),
          style: { cursor: 'pointer' },
        })}
        scroll={{ x: 600 }}
      />

      <RouteHistoryDrawer
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
