import { useCustom } from '@refinedev/core';
import { Drawer, Table, Typography, Spin, Grid } from 'antd';

const { useBreakpoint } = Grid;

interface RouteHistoryDrawerProps {
  orderId: string | null;
  onClose: () => void;
}

export function RouteHistoryDrawer({ orderId, onClose }: RouteHistoryDrawerProps) {
  const screens = useBreakpoint();

  const { query } = useCustom({
    url: `orders/${orderId}/route`,
    method: 'get',
    queryOptions: { enabled: !!orderId },
  });

  const routeData = query.data?.data as Record<string, unknown> | undefined;
  const isLoading = query.isLoading;
  const points = (routeData?.points as Record<string, unknown>[]) ?? [];

  const columns = [
    { title: '#', key: 'index', render: (_: unknown, __: unknown, idx: number) => idx + 1, width: 50 },
    { title: 'Lat', dataIndex: 'lat', key: 'lat', render: (v: number) => v.toFixed(6) },
    { title: 'Lng', dataIndex: 'lng', key: 'lng', render: (v: number) => v.toFixed(6) },
    { title: 'Distance (m)', dataIndex: 'distance_meters', key: 'distance_meters', render: (v: number) => Math.round(v) },
    {
      title: 'Recorded At',
      dataIndex: 'recorded_at',
      key: 'recorded_at',
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  return (
    <Drawer
      open={!!orderId}
      onClose={onClose}
      width={screens.xs ? '100%' : 720}
      placement={screens.xs ? 'bottom' : 'right'}
      title="Route Detail"
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {routeData && (
            <Typography.Paragraph>
              Total distance: <strong>{Math.round(routeData.total_distance_meters as number)} m</strong>
              {' · '}
              {points.length} points
            </Typography.Paragraph>
          )}
          <Table
            dataSource={points}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
            loading={isLoading}
            scroll={{ x: 500 }}
          />
        </>
      )}
    </Drawer>
  );
}
