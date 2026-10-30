import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileSpreadsheet,
  Upload,
  Trash2,
  Check,
  AlertCircle,
  FileText,
  Table
} from 'lucide-react';
import { CsvDataset } from '../../types';

interface CsvDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset?: CsvDataset;
  onApplyDataset: (dataset: CsvDataset | undefined) => void;
}

/**
 * Robust CSV parser supporting quotes, commas within quotes, and newlines
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, any>[] } {
  const clean = text.trim();
  if (!clean) return { headers: [], rows: [] };

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some(col => col.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  // Push last field & row if pending
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(col => col.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, any>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const rowValues = lines[r];
    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      let val = rowValues[idx] !== undefined ? rowValues[idx] : '';
      val = val.replace(/^["']|["']$/g, '').trim();
      // Auto convert numbers or booleans if exact match
      if (val !== '' && !isNaN(Number(val)) && !val.startsWith('0') || val === '0') {
        rowObj[h] = Number(val);
      } else if (val.toLowerCase() === 'true') {
        rowObj[h] = true;
      } else if (val.toLowerCase() === 'false') {
        rowObj[h] = false;
      } else {
        rowObj[h] = val;
      }
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

export const CsvDatasetModal: React.FC<CsvDatasetModalProps> = ({
  isOpen,
  onClose,
  dataset,
  onApplyDataset
}) => {
  const [rawText, setRawText] = useState('');
  const [datasetName, setDatasetName] = useState('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, any>[] }>({
    headers: [],
    rows: []
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  useEffect(() => {
    if (isOpen) {
      if (dataset && dataset.rows && dataset.rows.length > 0) {
        setDatasetName(dataset.name || 'Dataset CSV');
        if (dataset.rawCsv) {
          setRawText(dataset.rawCsv);
        } else {
          // Reconstruct CSV from dataset
          const headerLine = dataset.headers.join(',');
          const rowLines = dataset.rows.map(r =>
            dataset.headers.map(h => JSON.stringify(r[h] ?? '')).join(',')
          );
          setRawText([headerLine, ...rowLines].join('\n'));
        }
        setParsed({ headers: dataset.headers, rows: dataset.rows });
        setActiveTab('preview');
      } else {
        setDatasetName('Variables Matrix');
        const sampleCsv = `sku,quantity,couponCode\n24-MB01,1,DESCUENTO10\n24-MB02,2,ENVIOGRATIS\n24-WB04,1,`;
        setRawText(sampleCsv);
        const p = parseCsv(sampleCsv);
        setParsed(p);
        setActiveTab('editor');
      }
      setParseError(null);
    }
  }, [isOpen, dataset]);

  // Re-parse when text changes
  const handleTextChange = (text: string) => {
    setRawText(text);
    try {
      const p = parseCsv(text);
      if (p.headers.length === 0 && text.trim().length > 0) {
        setParseError('No se encontraron columnas válidas.');
      } else {
        setParsed(p);
        setParseError(null);
      }
    } catch (err: any) {
      setParseError(err.message || 'Error al analizar el formato CSV');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDatasetName(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        handleTextChange(content);
        setActiveTab('preview');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  const handleSave = () => {
    if (parsed.rows.length === 0) {
      onApplyDataset(undefined);
      onClose();
      return;
    }

    onApplyDataset({
      name: datasetName.trim() || 'Dataset CSV',
      headers: parsed.headers,
      rows: parsed.rows,
      rawCsv: rawText
    });
    onClose();
  };

  const handleClear = () => {
    onApplyDataset(undefined);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Matriz de Variables CSV (Data-Driven Testing)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inyecta datos dinámicos en cada paso del flujo por cada fila del CSV.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar / Controls */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={datasetName}
              onChange={e => setDatasetName(e.target.value)}
              placeholder="Nombre del dataset..."
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500 w-48 sm:w-56"
            />

            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-orange-500 text-slate-700 dark:text-slate-300 font-medium cursor-pointer transition-colors shadow-2xs">
              <Upload className="w-3.5 h-3.5 text-orange-500" />
              <span>Subir Archivo .CSV</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'editor'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Editor CSV</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Vista Previa ({parsed.rows.length} filas)</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'editor' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  La primera fila debe contener los nombres de las variables (ej: <code>sku,quantity,couponCode</code>):
                </span>
                {parsed.rows.length > 0 && (
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    ✓ {parsed.headers.length} columnas detectadas • {parsed.rows.length} filas
                  </span>
                )}
              </div>

              <textarea
                value={rawText}
                onChange={e => handleTextChange(e.target.value)}
                placeholder="sku,quantity,couponCode&#10;24-MB01,1,DESCUENTO10&#10;24-MB02,2,"
                rows={12}
                className="w-full font-mono text-xs p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 leading-relaxed resize-y"
              />

              {parseError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {parsed.rows.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No hay datos en el CSV aún.</p>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto max-h-[350px]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="px-3 py-2 w-12 text-center text-slate-400">#</th>
                          {parsed.headers.map(h => (
                            <th key={h} className="px-3.5 py-2">
                              <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold">
                                ${h}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono bg-white dark:bg-slate-900">
                        {parsed.rows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="px-3 py-2 text-center text-slate-400 font-sans text-[11px]">
                              {idx + 1}
                            </td>
                            {parsed.headers.map(h => (
                              <td key={h} className="px-3.5 py-2 text-slate-700 dark:text-slate-300">
                                {row[h] !== undefined && row[h] !== '' ? (
                                  String(row[h])
                                ) : (
                                  <span className="text-slate-400 italic">null</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>💡</span>
                <span>
                  Al ejecutar el flujo con este dataset, se ejecutarán <strong>{parsed.rows.length} iteraciones completas</strong> inyectando las columnas correspondientes en cada paso.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between gap-3">
          {dataset && dataset.rows && dataset.rows.length > 0 ? (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remover Dataset del Flujo</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>

            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition-all"
            >
              <Check className="w-4 h-4" />
              <span>
                {parsed.rows.length > 0
                  ? `Guardar Dataset (${parsed.rows.length} Filas)`
                  : 'Guardar sin Dataset'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
