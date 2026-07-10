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

export const projectStatusTagTheme = {
  borderSuccess: '1px solid #287c3a',
  borderWarning: '1px solid #8a672d',
  colorSuccess: '#174d27',
  colorWarning: '#59401b',
  textColorSuccess: '#9af2a1',
  textColorWarning: '#f7d792',
} satisfies NonNullable<GlobalThemeOverrides['Tag']>;
