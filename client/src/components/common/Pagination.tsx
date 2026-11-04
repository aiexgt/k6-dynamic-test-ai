import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  customTotalPages?: number;
  customStartItem?: number;
  customEndItem?: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className = '',
  customTotalPages,
  customStartItem,
  customEndItem
}) => {
  const totalPages = customTotalPages !== undefined
    ? Math.max(1, customTotalPages)
    : Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = customStartItem !== undefined
    ? customStartItem
    : (totalItems === 0 ? 0 : (validPage - 1) * pageSize + 1);
  const endItem = customEndItem !== undefined
    ? customEndItem
    : Math.min(validPage * pageSize, totalItems);

  if (totalItems === 0) return null;

  // Calculate page numbers to display with smart ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let left = Math.max(2, validPage - 1);
      let right = Math.min(totalPages - 1, validPage + 1);

      if (validPage <= 3) {
        right = 4;
      }
      if (validPage >= totalPages - 2) {
        left = totalPages - 3;
      }

      if (left > 2) pages.push('...');
      for (let i = left; i <= right; i++) pages.push(i);
      if (right < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 select-none ${className}`}
    >
      {/* Information text */}
      <div className="flex items-center gap-2">
        <span>
          Mostrando <strong className="font-semibold text-slate-800 dark:text-slate-200">{startItem}</strong> -{' '}
          <strong className="font-semibold text-slate-800 dark:text-slate-200">{endItem}</strong> de{' '}
          <strong className="font-semibold text-slate-800 dark:text-slate-200">{totalItems}</strong>
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2">
            <span>•</span>
            <select
              value={pageSize}
              onChange={e => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt} / pág
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Page Navigation Buttons */}
      <div className="flex items-center gap-1">
        {/* First Page Button */}
        <button
          onClick={() => onPageChange(1)}
          disabled={validPage <= 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Primera página"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        {/* Previous Page Button */}
        <button
          onClick={() => onPageChange(validPage - 1)}
          disabled={validPage <= 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Página anterior"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Page Number Buttons */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`dots-${idx}`} className="px-1.5 py-1 text-slate-400">
                  ...
                </span>
              );
            }
            const pageNum = p as number;
            const isActive = pageNum === validPage;
            return (
              <button
                key={`page-${pageNum}`}
                onClick={() => onPageChange(pageNum)}
                className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Page Button */}
        <button
          onClick={() => onPageChange(validPage + 1)}
          disabled={validPage >= totalPages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Página siguiente"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Last Page Button */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={validPage >= totalPages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Última página"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
