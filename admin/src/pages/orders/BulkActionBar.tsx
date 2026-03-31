import { useState } from 'react';
import { Space, Button, Typography } from 'antd';
import { BulkConfirmModal } from './BulkConfirmModal';

interface BulkActionBarProps {
  selectedRowKeys: string[];
  onClearSelection: () => void;
}

export function BulkActionBar({ selectedRowKeys, onClearSelection }: BulkActionBarProps) {
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  return (
    <>
      <div
        style={{
          background: '#e6f7ff',
          border: '1px solid #91d5ff',
          borderRadius: 6,
          padding: '8px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Typography.Text strong>
          {selectedRowKeys.length} order{selectedRowKeys.length > 1 ? 's' : ''} selected
        </Typography.Text>
        <Space>
          <Button danger size="small" onClick={() => setBulkModalOpen(true)}>
            Cancel Selected
          </Button>
          <Button size="small" onClick={onClearSelection}>
            Clear Selection
          </Button>
        </Space>
      </div>

      <BulkConfirmModal
        open={bulkModalOpen}
        orderIds={selectedRowKeys}
        onSuccess={() => {
          setBulkModalOpen(false);
          onClearSelection();
        }}
        onCancel={() => setBulkModalOpen(false)}
      />
    </>
  );
}
