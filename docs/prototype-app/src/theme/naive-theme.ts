import type { GlobalThemeOverrides } from 'naive-ui';

export const imageGenColors = {
  floatingSurface: '#3b3b40',
  primary: '#64e36e',
  primaryHover: '#7ee787',
  primaryPressed: '#2a9332',
  primarySuppl: '#5ccc65',
};

export const imageGenNaiveTheme = {
  Badge: {
    colorSuccess: imageGenColors.primaryPressed,
  },
  common: {
    popoverColor: imageGenColors.floatingSurface,
    primaryColor: imageGenColors.primary,
    primaryColorHover: imageGenColors.primaryHover,
    primaryColorPressed: imageGenColors.primaryPressed,
    primaryColorSuppl: imageGenColors.primarySuppl,
  },
  Menu: {
    itemHeight: '32px',
  },
  Tag: {
    textColorSuccess: imageGenColors.primary,
  },
} satisfies GlobalThemeOverrides;
