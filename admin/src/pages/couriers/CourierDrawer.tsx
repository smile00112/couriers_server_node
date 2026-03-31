import { useEffect, useState } from 'react';
import { useShow, useInvalidate, useCustomMutation, useNotification } from '@refinedev/core';
import {
  Drawer,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Grid,
  Form,
  Input,
  Select,
  Modal,
} from 'antd';
import { CourierStatusModal } from './CourierStatusModal';

const { useBreakpoint } = Grid;

interface CourierDrawerProps {
  courierId: string | null;
  initialMode?: 'view' | 'edit';
  onClose: () => void;
}

export function CourierDrawer({ courierId, initialMode = 'view', onClose }: CourierDrawerProps) {
  const screens = useBreakpoint();
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'available' | 'unavailable' | null>(null);
  const [form] = Form.useForm();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { mutate, mutation } = useCustomMutation();

  const { query } = useShow({
    resource: 'api/v1/couriers',
    id: courierId ?? '',
    queryOptions: { enabled: !!courierId },
  });

  const courier = query.data?.data as Record<string, unknown> | undefined;
  const isLoading = query.isLoading;

  useEffect(() => {
    if (courierId) {
      setMode(initialMode);
    }
  }, [courierId, initialMode]);

  useEffect(() => {
    if (courier && mode === 'edit') {
      form.setFieldsValue({
        first_name: courier.first_name,
        last_name: courier.last_name,
        phone: courier.phone,
        login: courier.login,
        telegram_chat_id: courier.telegram_chat_id,
        status: courier.status,
      });
    }
  }, [courier, mode, form]);

  const handleClose = () => {
    if (mode === 'edit' && form.isFieldsTouched()) {
      Modal.confirm({
        title: 'Discard changes?',
        content: 'You have unsaved changes. Are you sure you want to close?',
        okText: 'Discard',
        okButtonProps: { danger: true },
        onOk: () => {
          form.resetFields();
          onClose();
        },
      });
    } else {
      form.resetFields();
      onClose();
    }
  };

  const handleStatusChange = (value: string) => {
    const currentStatus = courier?.status as string;
    if (value !== currentStatus) {
      setPendingStatus(value as 'available' | 'unavailable');
      setStatusModalOpen(true);
      form.setFieldValue('status', currentStatus);
    }
  };

  const handleSave = () => {
    if (!courierId) return;
    void form.validateFields().then((values: Record<string, unknown>) => {
      mutate(
        {
          url: `api/v1/couriers/${courierId}`,
          method: 'patch',
          values,
        },
        {
          onSuccess: () => {
            void invalidate({ resource: 'api/v1/couriers', invalidates: ['list', 'detail'] });
            notify?.({ type: 'success', message: 'Courier updated', description: '' });
            form.resetFields();
            setMode('view');
          },
          onError: (error) => {
            notify?.({
              type: 'error',
              message: 'Update failed',
              description: String((error as { message?: string }).message ?? error),
            });
          },
        },
      );
    });
  };

  const drawerTitle = courier
    ? `${courier.first_name as string} ${courier.last_name as string}`
    : 'Courier Detail';

  const footerButtons = mode === 'edit' ? (
    <Space>
      <Button onClick={() => { form.resetFields(); setMode('view'); }}>Cancel</Button>
      <Button type="primary" loading={mutation.isPending} onClick={handleSave}>Save</Button>
    </Space>
  ) : (
    <Button type="primary" onClick={() => setMode('edit')}>Edit</Button>
  );

  return (
    <>
      <Drawer
        open={!!courierId}
        onClose={handleClose}
        width={screens.xs ? '100%' : 720}
        placement={screens.xs ? 'bottom' : 'right'}
        title={drawerTitle}
        footer={footerButtons}
        footerStyle={{ textAlign: 'right' }}
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : courier && mode === 'view' ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <section>
              <Typography.Title level={5}>Profile</Typography.Title>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Name">
                  {`${courier.first_name as string} ${courier.last_name as string}`}
                </Descriptions.Item>
                <Descriptions.Item label="Phone">{String(courier.phone)}</Descriptions.Item>
                <Descriptions.Item label="Login">{String(courier.login ?? '—')}</Descriptions.Item>
                <Descriptions.Item label="Telegram">{String(courier.telegram_chat_id ?? '—')}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={courier.status === 'available' ? 'green' : 'red'}>
                    {(courier.status as string).toUpperCase()}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </section>

            <section>
              <Typography.Title level={5}>Location</Typography.Title>
              {courier.current_position ? (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Lat">
                    {String((courier.current_position as Record<string, unknown>).lat)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Lng">
                    {String((courier.current_position as Record<string, unknown>).lng)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Recorded At">
                    {new Date((courier.current_position as Record<string, string>).recorded_at).toLocaleString()}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Typography.Text type="secondary">No location data</Typography.Text>
              )}
            </section>

            <section>
              <Typography.Title level={5}>Current Shift</Typography.Title>
              {courier.current_shift ? (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="Status">
                    <Tag color="green">
                      {(courier.current_shift as Record<string, string>).status.toUpperCase()}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Started At">
                    {new Date((courier.current_shift as Record<string, string>).started_at).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="Elapsed">
                    {String((courier.current_shift as Record<string, unknown>).elapsed_minutes)} min
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Typography.Text type="secondary">No active shift</Typography.Text>
              )}
            </section>
          </Space>
        ) : courier && mode === 'edit' ? (
          <Form form={form} layout="vertical">
            <Form.Item name="first_name" label="First Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Phone" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="login" label="Login">
              <Input />
            </Form.Item>
            <Form.Item name="telegram_chat_id" label="Telegram Chat ID">
              <Input />
            </Form.Item>
            <Form.Item name="status" label="Status">
              <Select
                options={[
                  { label: 'Available', value: 'available' },
                  { label: 'Unavailable', value: 'unavailable' },
                ]}
                onChange={handleStatusChange}
              />
            </Form.Item>
          </Form>
        ) : null}
      </Drawer>

      {courierId && pendingStatus && (
        <CourierStatusModal
          open={statusModalOpen}
          courierId={courierId}
          newStatus={pendingStatus}
          onSuccess={() => {
            setStatusModalOpen(false);
            setPendingStatus(null);
            void query.refetch();
          }}
          onCancel={() => {
            setStatusModalOpen(false);
            setPendingStatus(null);
          }}
        />
      )}
    </>
  );
}
