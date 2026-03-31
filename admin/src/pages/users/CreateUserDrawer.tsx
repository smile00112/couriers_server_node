import { useCreate, useInvalidate, useNotification } from '@refinedev/core';
import { Drawer, Form, Input, Select, Button, Space, Modal, Grid } from 'antd';

const { useBreakpoint } = Grid;

interface CreateUserDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CreateUserDrawer({ open, onClose }: CreateUserDrawerProps) {
  const screens = useBreakpoint();
  const [form] = Form.useForm();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { mutate, mutation } = useCreate();

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
    void form.validateFields().then((values: Record<string, unknown>) => {
      mutate(
        { resource: 'api/v1/users', values },
        {
          onSuccess: () => {
            void invalidate({ resource: 'api/v1/users', invalidates: ['list'] });
            notify?.({ type: 'success', message: 'User created', description: '' });
            form.resetFields();
            onClose();
          },
          onError: (error) => {
            notify?.({
              type: 'error',
              message: 'Failed to create user',
              description: String((error as { message?: string }).message ?? error),
            });
          },
        },
      );
    });
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={screens.xs ? '100%' : 480}
      placement={screens.xs ? 'bottom' : 'right'}
      title="Create User"
      footer={
        <Space style={{ justifyContent: 'flex-end', display: 'flex' }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSave}>
            Save
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Email is required' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input type="email" />
        </Form.Item>
        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Role is required' }]}>
          <Select
            options={[
              { label: 'Manager', value: 'manager' },
              { label: 'Order Operator', value: 'order_operator' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[
            { required: true, message: 'Password is required' },
            { min: 8, message: 'Password must be at least 8 characters' },
          ]}
        >
          <Input.Password />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
