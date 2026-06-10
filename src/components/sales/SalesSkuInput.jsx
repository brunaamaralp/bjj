import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { ScanLine } from 'lucide-react';

const SalesSkuInput = forwardRef(function SalesSkuInput(
  { disabled, onSubmit, autoFocus = false },
  ref
) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => {
      if (inputRef.current) inputRef.current.value = '';
    },
    getValue: () => String(inputRef.current?.value || '').trim(),
  }));

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = String(inputRef.current?.value || '').trim();
    if (!code) return;
    onSubmit?.(code);
  };

  return (
    <div className="sales-sku-input form-group">
      <label htmlFor="sales-sku-field">Código / SKU</label>
      <div className="sales-sku-input__wrap">
        <ScanLine size={16} className="sales-sku-input__icon" aria-hidden />
        <input
          id="sales-sku-field"
          ref={inputRef}
          type="text"
          className="form-input sales-sku-input__field"
          placeholder="Escaneie ou digite o código e pressione Enter"
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
});

export default SalesSkuInput;
