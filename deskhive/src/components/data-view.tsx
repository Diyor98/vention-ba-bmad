import type { ReactNode } from 'react';

export type DataViewStatus = 'loading' | 'empty' | 'error' | 'loaded';

export type DataViewProps = {
  status: DataViewStatus;
  children: ReactNode;
  emptyMessage?: string;
  errorMessage?: string;
  loadingMessage?: string;
};

export function DataView({
  status,
  children,
  emptyMessage = 'No data available.',
  errorMessage = 'Something went wrong. Please try again.',
  loadingMessage = 'Loading…',
}: DataViewProps) {
  if (status === 'loading') {
    return <div className="text-sm text-gray-500">{loadingMessage}</div>;
  }
  if (status === 'empty') {
    return <div className="text-sm text-gray-600">{emptyMessage}</div>;
  }
  if (status === 'error') {
    return <div className="text-sm text-red-700">{errorMessage}</div>;
  }
  return <>{children}</>;
}
