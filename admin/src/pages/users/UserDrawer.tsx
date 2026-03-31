import { useEffect } from 'react';
import { useShow, useUpdate, useInvalidate, useGetIdentity, useNotification } from '@refinedev/core';
import {
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Space,
  Spin,
  Typography,
  Descriptions,
  Modal,
  Grid,
} from 'antd';

const { useBreakpoint } = Grid;

interface UserDrawerProps {
  userId: string | null;
  onClose: () => void;
}

export function UserDrawer({ userId, onClose }: UserDrawerProps) {
  const screens = useBreakpoint();
  const [form] = Form.useForm();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { data: identity } = useGetIdentity<{ role: string }>();
  const isOwner = identity?.role === 'owner';

  const { query } = useShow({
    resource: 'api/v1/users',
    id: userId ?? '',
    queryOptions: { enabled: !!userId },
  });

  const user = query.data?.data as Record<string, unknown> | undefined;
  const isLoading = query.isLoading;

  const { mutate, mutation } = useUpdate();

  useEffect(() => {
    if (user) {
      form.setFieldsValue({ name: user.name, role: user.role });
    }
  }, [user, form]);

  const handleClose = () => {
    if (form.isFieldsTouched()) {
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

  const handleSave = () => {
    if (!userId) return;
    void form.validateFields().then((values: Record<string, unknown>) => {
      mutate(
        { resource: 'api/v1/users', id: userId, values },
        {
          onSuccess: () => {
            void invalidate({ resource: 'api/v1/users', invalidates: ['list', 'detail'] });
            notify?.({ type: 'success', message: 'User updated', description: '' });
            form.resetFields();
            onClose();
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

  return (
    <Drawer
      open={!!userId}
      onClose={handleClose}
      width={screens.xs ? '100%' : 480}
      placement={screens.xs ? 'bottom' : 'right'}
      title={user ? (user.name as string) : 'User Detail'}
      footer={
        isOwner ? (
          <Space style={{ justifyContent: 'flex-end', display: 'flex' }}>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="primary" loading={mutation.isPending} onClick={handleSave}>
              Save
            </Button>
          </Space>
        ) : null
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : user ? (
        <>
          <section style={{ marginBottom: 24 }}>
            <Typography.Title level={5}>Account Info</Typography.Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Email">{String(user.email)}</Descriptions.Item>
              <Descriptions.Item label="Created At">
                {new Date(user.created_at as string).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
          </section>

          {isOwner ? (
            <Form form={form} layout="vertical">
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="role" label="Role">
                <Select
                  options={[
                    { label: 'Manager', value: 'manager' },
                    { label: 'Order Operator', value: 'order_operator' },
                  ]}
                />
              </Form.Item>
            </Form>
          ) : (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Name">{String(user.name)}</Descriptions.Item>
              <Descriptions.Item label="Role">{(user.role as string).replace('_', ' ')}</Descriptions.Item>
            </Descriptions>
          )}
        </>
      ) : null}
    </Drawer>
  );
}
