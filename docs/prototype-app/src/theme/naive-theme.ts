import type { GlobalThemeOverrides } from 'naive-ui';

export const imageGenColors = {
  primary: '#64e36e',
  primaryHover: '#7ee787',
  primaryPressed: '#2a9332',
  primarySuppl: '#5ccc65',
};

export const imageGenNaiveTheme = {
  common: {
    primaryColor: imageGenColors.primary,
    primaryColorHover: imageGenColors.primaryHover,
    primaryColorPressed: imageGenColors.primaryPressed,
    primaryColorSuppl: imageGenColors.primarySuppl,
  },
  Tag: {
    textColorPrimary: imageGenColors.primary,
    textColorSuccess: imageGenColors.primary,
  }
} satisfies GlobalThemeOverrides
