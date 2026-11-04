import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');
  const [horizontalAlign, setHorizontalAlign] = useState<'left' | 'right'>('left');
  const [maxListHeight, setMaxListHeight] = useState<number>(224);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  // Calcula si debe abrir hacia arriba o abajo según el espacio en la ventana
  const updateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Si el espacio inferior es inferior a 280px y arriba hay más espacio que abajo, abrir hacia arriba (dropup)
    const shouldOpenUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    setOpenDirection(shouldOpenUp ? 'up' : 'down');

    // Alineación horizontal: si desbordaría por la derecha, anclar a la derecha
    const spaceRight = viewportWidth - rect.left;
    const shouldAlignRight = spaceRight < 220 && rect.right >= 200;
    setHorizontalAlign(shouldAlignRight ? 'right' : 'left');

    // Altura máxima del listado acorde al espacio libre restante (restando barra de búsqueda y márgenes de seguridad)
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
    const computedHeight = Math.max(120, Math.min(240, availableSpace - 68));
    setMaxListHeight(computedHeight);
  }, []);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      updateDropdownPosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Posicionamiento dinámico en scroll y resize mientras está abierto
  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();

    const handleScrollOrResize = () => {
      updateDropdownPosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updateDropdownPosition]);

  // Focus search input y scroll al elemento seleccionado al abrir
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setHighlightedIndex(-1);
      setTimeout(() => {
        inputRef.current?.focus();
        if (optionsListRef.current) {
          const selectedEl = optionsListRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
          if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
          }
        }
      }, 50);
    }
  }, [isOpen]);

  const filteredOptions = options.filter(
    o =>
      o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Navegación por teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        handleToggleOpen();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        onChange(filteredOptions[highlightedIndex].value);
        setIsOpen(false);
      } else if (filteredOptions.length === 1) {
        onChange(filteredOptions[0].value);
        setIsOpen(false);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${isOpen ? 'z-40' : 'z-auto'} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggleOpen}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all text-left ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white dark:bg-slate-950 border-orange-500 text-slate-900 dark:text-slate-100 ring-1 ring-orange-500/20'
            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <span className="truncate flex-1">
          {selectedOption ? selectedOption.label : <span className="text-slate-400 font-normal">{placeholder}</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 min-w-[200px] max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            horizontalAlign === 'right' ? 'right-0' : 'left-0'
          } ${
            openDirection === 'up'
              ? 'bottom-full mb-1.5 origin-bottom'
              : 'top-full mt-1.5 origin-top'
          }`}
        >
          {/* Search Field */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(-1);
              }}
              placeholder="Buscar..."
              className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 focus:outline-none placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setHighlightedIndex(-1);
                }}
                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div
            ref={optionsListRef}
            style={{ maxHeight: `${maxListHeight}px` }}
            className="overflow-y-auto p-1 divide-y divide-transparent overscroll-contain"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400 font-normal">
                Sin coincidencias
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={opt.value}
                    data-selected={isSelected ? 'true' : undefined}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      isSelected
                        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold'
                        : isHighlighted
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="truncate flex-1">
                      <div className="truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="text-[10px] text-slate-400 font-normal truncate">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
