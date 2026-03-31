import { useLogin } from '@refinedev/core';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { mutate: login, isPending: isLoading, error } = useLogin<LoginForm>();
  const [form] = Form.useForm<LoginForm>();

  const onFinish = (values: LoginForm) => {
    login(values);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 380, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Admin Panel
          </Typography.Title>
          <Typography.Text type="secondary">Sign in to your account</Typography.Text>
        </div>

        {error && (
          <Alert
            message={(error as { message?: string }).message ?? 'Invalid credentials.'}
            type="error"
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email.' },
              { type: 'email', message: 'Please enter a valid email.' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="Email"
              size="large"
              type="email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password.' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              size="large"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={isLoading}
              block
              size="large"
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
