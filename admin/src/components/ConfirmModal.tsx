import { Modal } from 'antd';
import type { ReactNode } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  content?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLoading?: boolean;
  okText?: string;
  okDanger?: boolean;
}

export function ConfirmModal({
  open,
  title,
  content,
  onConfirm,
  onCancel,
  confirmLoading,
  okText = 'Confirm',
  okDanger = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={okText}
      okButtonProps={{ danger: okDanger, loading: confirmLoading }}
      cancelText="Cancel"
      width={480}
    >
      {content}
    </Modal>
  );
}
