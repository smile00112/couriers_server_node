import { useState } from 'react';
import { useInvalidate, useCustomMutation } from '@refinedev/core';
import { useNotification } from '@refinedev/core';
import { Modal, Input, Typography } from 'antd';

interface CancelOrderModalProps {
  open: boolean;
  orderId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CancelOrderModal({ open, orderId, onSuccess, onCancel }: CancelOrderModalProps) {
  const [reason, setReason] = useState('');
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { mutate, mutation } = useCustomMutation();

  const handleConfirm = () => {
    mutate(
      {
        url: `orders/${orderId}/cancel`,
        method: 'post',
        values: reason ? { reason } : {},
      },
      {
        onSuccess: () => {
          void invalidate({ resource: 'orders', invalidates: ['list', 'detail'] });
          notify?.({
            type: 'success',
            message: 'Order cancelled successfully',
            description: `Order has been cancelled.`,
          });
          setReason('');
          onSuccess();
        },
        onError: (error) => {
          notify?.({
            type: 'error',
            message: 'Failed to cancel order',
            description: String((error as { message?: string }).message ?? error),
          });
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      title="Cancel Order"
      width={480}
      okText="Cancel Order"
      okButtonProps={{ danger: true, loading: mutation.isPending }}
      cancelText="Go Back"
      onOk={handleConfirm}
      onCancel={() => {
        setReason('');
        onCancel();
      }}
    >
      <Typography.Paragraph>
        Are you sure you want to cancel this order? This action cannot be undone.
      </Typography.Paragraph>
      <Input.TextArea
        placeholder="Reason (optional)"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}
