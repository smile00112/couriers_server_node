import { useState } from 'react';
import { useTable } from '@refinedev/antd';
import { useGetIdentity, useDelete, useInvalidate } from '@refinedev/core';
import { Table, Tag, Button, Typography, Empty } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateUserDrawer } from './CreateUserDrawer';
import { UserDrawer } from './UserDrawer';

const ROLE_COLORS: Record<string, string> = {
  owner: 'gold',
  manager: 'blue',
  order_operator: 'green',
};

export function UsersPage() {
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { tableProps } = useTable({
    resource: 'api/v1/users',
    syncWithLocation: true,
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: 'created_at', order: 'desc' }] },
  });

  const { data: identity } = useGetIdentity<{ role: string }>();
  const isOwner = identity?.role === 'owner';
  const invalidate = useInvalidate();
  const { mutate: deleteUser, mutation: deleteMutation } = useDelete();

  const handleDelete = () => {
    if (!deleteTargetId) return;
    deleteUser(
      { resource: 'api/v1/users', id: deleteTargetId },
      {
        onSuccess: () => {
          void invalidate({ resource: 'api/v1/users', invalidates: ['list'] });
          setDeleteTargetId(null);
        },
      },
    );
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      sorter: true,
      render: (role: string) => (
        <Tag color={ROLE_COLORS[role] ?? 'default'}>
          {role.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: true,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    ...(isOwner
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: Record<string, unknown>) => (
              <span className="row-actions" style={{ opacity: 0, transition: 'opacity 0.15s' }}>
                <DeleteOutlined
                  style={{ cursor: 'pointer', color: '#ff4d4f' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTargetId(record.id as string);
                  }}
                />
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Users
        </Typography.Title>
        {isOwner && (
          <Button type="primary" onClick={() => setCreateDrawerOpen(true)}>
            Create User
          </Button>
        )}
      </div>

      <style>{`.ant-table-row:hover .row-actions { opacity: 1 !important; }`}</style>

      {tableProps.dataSource?.length === 0 && !tableProps.loading && (
        <Empty description="No users found" style={{ margin: '48px 0' }}>
          {isOwner && (
            <Button type="primary" onClick={() => setCreateDrawerOpen(true)}>
              Create first user
            </Button>
          )}
        </Empty>
      )}

      <Table
        {...tableProps}
        rowKey="id"
        columns={columns}
        onRow={(record) => ({
          onClick: () => setSelectedUserId((record as { id: string }).id),
          style: { cursor: isOwner ? 'pointer' : 'default' },
        })}
        scroll={{ x: 600 }}
      />

      <CreateUserDrawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
      />

      <UserDrawer
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />

      <ConfirmModal
        open={!!deleteTargetId}
        title="Delete User"
        content="Are you sure you want to delete this user? This action cannot be undone."
        okText="Delete"
        okDanger
        confirmLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
