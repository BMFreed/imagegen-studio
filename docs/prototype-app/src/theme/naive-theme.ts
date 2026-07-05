import type { GlobalThemeOverrides } from 'naive-ui';

export const imageGenColors = {
  floatingSurface: '#3b3b40',
  primary: '#64e36e',
  primaryHover: '#7ee787',
  primaryMuted: '#2a9332',
  primarySuppl: '#5ccc65',
};

export const imageGenNaiveTheme = {
  Badge: {
    colorSuccess: imageGenColors.primaryMuted,
  },
  common: {
    popoverColor: imageGenColors.floatingSurface,
    primaryColor: imageGenColors.primary,
    primaryColorHover: imageGenColors.primaryHover,
    primaryColorPressed: imageGenColors.primaryMuted,
    primaryColorSuppl: imageGenColors.primarySuppl,
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
} satisfies GlobalThemeOverrides;
