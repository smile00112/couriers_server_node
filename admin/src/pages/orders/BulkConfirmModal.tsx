import { useState } from 'react';
import { useInvalidate, useCustomMutation } from '@refinedev/core';
import { useNotification } from '@refinedev/core';
import { Modal, Typography, List } from 'antd';

interface BulkConfirmModalProps {
  open: boolean;
  orderIds: string[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function BulkConfirmModal({ open, orderIds, onSuccess, onCancel }: BulkConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { mutateAsync } = useCustomMutation();

  const handleConfirm = async () => {
    setLoading(true);
    const failed: string[] = [];

    for (const id of orderIds) {
      try {
        await mutateAsync({
          url: `orders/${id}/cancel`,
          method: 'post',
          values: {},
        });
      } catch {
        failed.push(id);
      }
    }

    await invalidate({ resource: 'orders', invalidates: ['list'] });
    setLoading(false);

    if (failed.length === 0) {
      notify?.({
        type: 'success',
        message: `${orderIds.length} orders cancelled successfully`,
        description: '',
      });
    } else {
      notify?.({
        type: 'error',
        message: `${orderIds.length - failed.length} cancelled, ${failed.length} failed`,
        description: `Failed IDs: ${failed.join(', ')}`,
      });
    }

    onSuccess();
  };

  return (
    <Modal
      open={open}
      title={`Cancel ${orderIds.length} Order${orderIds.length > 1 ? 's' : ''}`}
      width={480}
      okText="Confirm Cancel All"
      okButtonProps={{ danger: true, loading }}
      cancelText="Go Back"
      onOk={() => void handleConfirm()}
      onCancel={onCancel}
    >
      <Typography.Paragraph>
        The following {orderIds.length} order{orderIds.length > 1 ? 's' : ''} will be cancelled.
        This action cannot be undone.
      </Typography.Paragraph>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        <List
          size="small"
          dataSource={orderIds}
          renderItem={(id) => (
            <List.Item>
              <Typography.Text code>{id}</Typography.Text>
            </List.Item>
          )}
        />
      </div>
    </Modal>
  );
}
