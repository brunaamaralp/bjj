import '../../styles/field-error.css';
import React from 'react';

/**
 * Mensagem de validação abaixo de um campo de formulário.
 */
export default function FieldError({ children, className = '', id }) {
  if (children == null || children === '') return null;
  return (
    <p id={id} className={`navi-field-error${className ? ` ${className}` : ''}`} role="alert">
      {children}
    </p>
  );
}
