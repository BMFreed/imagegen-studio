import type { GlobalThemeOverrides } from 'naive-ui';

export const imageGenColors = {
  primary: '#64e36e',
  primaryHover: '#7ee787',
  primaryMuted: '#2a9332',
  primarySuppl: '#5ccc65',
  floatingSurface: '#3b3b40',
};

export const imageGenNaiveTheme = {
  common: {
    primaryColor: imageGenColors.primary,
    primaryColorHover: imageGenColors.primaryHover,
    primaryColorPressed: imageGenColors.primaryMuted,
    primaryColorSuppl: imageGenColors.primarySuppl,
    popoverColor: imageGenColors.floatingSurface,
  },
  Dropdown: {
    color: imageGenColors.floatingSurface,
  },
  Popover: {
    color: imageGenColors.floatingSurface,
  },
  Tag: {
    textColorPrimary: imageGenColors.primary,
    textColorSuccess: imageGenColors.primary,
  },
  Badge: {
    colorSuccess: imageGenColors.primaryMuted,
  }
} satisfies GlobalThemeOverrides
