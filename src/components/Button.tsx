import styled, { css } from 'styled-components';

interface ButtonProps {
  $variant?: 'primary' | 'secondary';
}

const Button = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 1rem;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${({ $variant, theme }) =>
    $variant === 'secondary'
      ? css`
          background: ${theme.surface};
          color: ${theme.text};
          border: 1px solid ${theme.border};
          &:hover:not(:disabled) {
            background: ${theme.surfaceHover};
          }
        `
      : css`
          background: ${theme.accent};
          color: #fff;
          &:hover:not(:disabled) {
            background: ${theme.accentHover};
          }
        `}
`;

export default Button;
