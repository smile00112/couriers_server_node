import { useInvalidate, useCustomMutation, useNotification } from '@refinedev/core';
import { Modal, Typography } from 'antd';

interface CourierStatusModalProps {
  open: boolean;
  courierId: string;
  newStatus: 'available' | 'unavailable';
  onSuccess: () => void;
  onCancel: () => void;
}

export function CourierStatusModal({
  open,
  courierId,
  newStatus,
  onSuccess,
  onCancel,
}: CourierStatusModalProps) {
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { mutate, mutation } = useCustomMutation();

  const handleConfirm = () => {
    mutate(
      {
        url: `api/v1/couriers/${courierId}`,
        method: 'patch',
        values: { status: newStatus },
      },
      {
        onSuccess: () => {
          void invalidate({ resource: 'api/v1/couriers', invalidates: ['list', 'detail'] });
          notify?.({
            type: 'success',
            message: 'Courier status updated',
            description: `Status changed to ${newStatus}.`,
          });
          onSuccess();
        },
        onError: (error) => {
          notify?.({
            type: 'error',
            message: 'Failed to update status',
            description: String((error as { message?: string }).message ?? error),
          });
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      title="Change Courier Status"
      width={480}
      okText="Confirm"
      okButtonProps={{ loading: mutation.isPending }}
      cancelText="Cancel"
      onOk={handleConfirm}
      onCancel={onCancel}
    >
      <Typography.Paragraph>
        Change courier status to <strong>{newStatus}</strong>?
      </Typography.Paragraph>
    </Modal>
  );
}
