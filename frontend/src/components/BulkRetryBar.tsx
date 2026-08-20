interface BulkRetryBarProps {
  selectedCount: number;
  isRetrying: boolean;
  onRetry: () => void;
  onClear: () => void;
}

export function BulkRetryBar({ selectedCount, isRetrying, onRetry, onClear }: BulkRetryBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="bulk-retry-bar">
      <span>
        {selectedCount} job{selectedCount === 1 ? '' : 's'} selected
      </span>
      <div className="bulk-retry-bar__actions">
        <button type="button" onClick={onClear} disabled={isRetrying}>
          Clear selection
        </button>
        <button type="button" className="primary" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? 'Retrying…' : 'Retry selected'}
        </button>
      </div>
    </div>
  );
}
