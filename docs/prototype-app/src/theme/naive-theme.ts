import type { GlobalThemeOverrides } from 'naive-ui';

export const imageGenColors = {
  bg: '#101014',
  chrome: '#101014',
  surface: '#18181c',
  control: '#232327',
  controlHover: '#2d2d31',
  controlActive: '#3a3a3e',
  border: '#343437',
  text: '#dbdbdc',
  textMuted: '#a0a0a3',
  textSoft: '#6f6f73',
  accent: '#64e36e',
  accentHover: '#7ee787',
  accentPressed: '#2a9332',
  accentStrong: '#5ccc65',
  warning: '#f2c97d',
  danger: '#e88080',
  info: '#70c0e8'
};

export const imageGenNaiveTheme = {
  common: {
    primaryColor: imageGenColors.accent,
    primaryColorHover: imageGenColors.accentHover,
    primaryColorPressed: imageGenColors.accentPressed,
    primaryColorSuppl: imageGenColors.accentStrong,
    bodyColor: imageGenColors.bg,
    cardColor: imageGenColors.surface,
    modalColor: imageGenColors.surface,
    popoverColor: imageGenColors.surface,
    borderColor: imageGenColors.border,
    dividerColor: imageGenColors.border,
    textColorBase: imageGenColors.text,
    textColor1: imageGenColors.text,
    textColor2: imageGenColors.textMuted,
    textColor3: imageGenColors.textSoft,
    borderRadius: '3px',
    borderRadiusSmall: '3px',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  Button: {
    borderRadiusTiny: '3px',
    borderRadiusSmall: '3px',
    borderRadiusMedium: '3px',
    heightTiny: '24px',
    heightSmall: '28px',
    heightMedium: '32px',
    colorSecondary: imageGenColors.control,
    colorSecondaryHover: imageGenColors.controlHover,
    colorSecondaryPressed: imageGenColors.controlActive,
    colorTertiary: imageGenColors.control,
    colorTertiaryHover: imageGenColors.controlHover,
    colorTertiaryPressed: imageGenColors.controlActive
  },
  Card: {
    borderRadius: '3px',
    color: imageGenColors.surface,
    colorModal: imageGenColors.surface
  },
  Input: {
    borderRadius: '3px',
    color: imageGenColors.control,
    colorFocus: imageGenColors.control,
    colorFocusError: imageGenColors.control,
    border: '1px solid transparent',
    borderHover: '1px solid transparent',
    borderFocus: `1px solid ${imageGenColors.accentStrong}`,
    heightMedium: '32px'
  },
  InputNumber: {
    borderRadius: '3px',
    color: imageGenColors.control,
    colorFocus: imageGenColors.control,
    border: '1px solid transparent',
    borderHover: '1px solid transparent',
    borderFocus: `1px solid ${imageGenColors.accentStrong}`,
    heightMedium: '32px'
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '3px',
        color: imageGenColors.control,
        colorActive: imageGenColors.control,
        border: '1px solid transparent',
        borderHover: '1px solid transparent',
        borderActive: `1px solid ${imageGenColors.accentStrong}`
      }
    }
  },
  Switch: {
    railColor: imageGenColors.controlActive,
    railColorActive: imageGenColors.accentStrong
  },
  Modal: {
    borderRadius: '3px',
    color: imageGenColors.surface
  },
  Popover: {
    borderRadius: '3px',
    color: imageGenColors.surface
  },
  Progress: {
    fillColor: imageGenColors.accent
  },
  Tag: {
    borderRadius: '3px'
  }
} as GlobalThemeOverrides;
