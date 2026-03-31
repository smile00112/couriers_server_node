import { useState } from 'react';
import { useShow } from '@refinedev/core';
import {
  Drawer,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Grid,
} from 'antd';
import { CancelOrderModal } from './CancelOrderModal';

const { useBreakpoint } = Grid;

const STATUS_COLORS: Record<string, string> = {
  created: 'blue',
  assigned: 'orange',
  picked_up: 'purple',
  in_delivery: 'cyan',
  completed: 'green',
  cancelled: 'red',
};

const TERMINAL_STATUSES = ['completed', 'cancelled'];

interface OrderDrawerProps {
  orderId: string | null;
  onClose: () => void;
}

export function OrderDrawer({ orderId, onClose }: OrderDrawerProps) {
  const screens = useBreakpoint();
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const { query } = useShow({
    resource: 'orders',
    id: orderId ?? '',
    queryOptions: { enabled: !!orderId },
  });

  const order = query.data?.data as Record<string, unknown> | undefined;
  const isLoading = query.isLoading;

  const isTerminal = order
    ? TERMINAL_STATUSES.includes(order.status as string)
    : true;

  const itemColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60 },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (v: number) => `${v.toFixed(2)}`,
    },
  ];

  const auditColumns = [
    { title: 'Action', dataIndex: 'action', key: 'action' },
    { title: 'Actor Role', dataIndex: 'actor_role', key: 'actor_role' },
    {
      title: 'At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  return (
    <>
      <Drawer
        open={!!orderId}
        onClose={onClose}
        width={screens.xs ? '100%' : 720}
        placement={screens.xs ? 'bottom' : 'right'}
        title={order ? `Order ${order.order_number as string}` : 'Order Detail'}
        extra={
          !isTerminal && order ? (
            <Button danger onClick={() => setCancelModalOpen(true)}>
              Cancel Order
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : order ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <section>
              <Typography.Title level={5}>Order Info</Typography.Title>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Order #">
                  {String(order.order_number)}
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={STATUS_COLORS[order.status as string] ?? 'default'}>
                    {(order.status as string).replace('_', ' ').toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Pickup Address">
                  {String(order.pickup_address)}
                </Descriptions.Item>
                <Descriptions.Item label="Dropoff Address">
                  {String(order.dropoff_address)}
                </Descriptions.Item>
                <Descriptions.Item label="Delivery Fee">
                  {(order.delivery_fee as number).toFixed(2)}
                </Descriptions.Item>
                <Descriptions.Item label="Created At">
                  {new Date(order.created_at as string).toLocaleString()}
                </Descriptions.Item>
              </Descriptions>
            </section>

            {(order.items as unknown[])?.length > 0 && (
              <section>
                <Typography.Title level={5}>Items</Typography.Title>
                <Table
                  dataSource={order.items as Record<string, unknown>[]}
                  columns={itemColumns}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </section>
            )}

            {order.courier ? (
              <section>
                <Typography.Title level={5}>Courier</Typography.Title>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Name">
                    {`${(order.courier as Record<string, string>).first_name} ${(order.courier as Record<string, string>).last_name}`}
                  </Descriptions.Item>
                  <Descriptions.Item label="Phone">
                    {String((order.courier as Record<string, unknown>).phone)}
                  </Descriptions.Item>
                </Descriptions>
              </section>
            ) : null}

            <section>
              <Typography.Title level={5}>Lifecycle</Typography.Title>
              <Descriptions column={1} size="small" bordered>
                {order.assigned_at ? (
                  <Descriptions.Item label="Assigned At">
                    {new Date(order.assigned_at as string).toLocaleString()}
                  </Descriptions.Item>
                ) : null}
                {order.picked_up_at ? (
                  <Descriptions.Item label="Picked Up At">
                    {new Date(order.picked_up_at as string).toLocaleString()}
                  </Descriptions.Item>
                ) : null}
                {order.completed_at ? (
                  <Descriptions.Item label="Completed At">
                    {new Date(order.completed_at as string).toLocaleString()}
                  </Descriptions.Item>
                ) : null}
                {order.cancelled_at ? (
                  <Descriptions.Item label="Cancelled At">
                    {new Date(order.cancelled_at as string).toLocaleString()}
                  </Descriptions.Item>
                ) : null}
              </Descriptions>
            </section>

            {(order.audit_entries as unknown[])?.length > 0 && (
              <section>
                <Typography.Title level={5}>Audit Log</Typography.Title>
                <Table
                  dataSource={order.audit_entries as Record<string, unknown>[]}
                  columns={auditColumns}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </section>
            )}
          </Space>
        ) : null}
      </Drawer>

      {orderId && (
        <CancelOrderModal
          open={cancelModalOpen}
          orderId={orderId}
          onSuccess={() => {
            setCancelModalOpen(false);
            onClose();
          }}
          onCancel={() => setCancelModalOpen(false)}
        />
      )}
    </>
  );
}
