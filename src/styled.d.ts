import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    bg: string;
    surface: string;
    surfaceHover: string;
    border: string;
    text: string;
    textDim: string;
    accent: string;
    accentHover: string;
    success: string;
    danger: string;
  }
}
