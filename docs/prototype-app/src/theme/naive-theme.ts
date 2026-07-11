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
  Card: {
    titleFontWeight: '600',
  },
  common: {
    fontSize: '13px',
    fontSizeMedium: '13px',
    fontSizeSmall: '13px',
    fontSizeTiny: '12px',
    heightMedium: '30px',
    heightSmall: '26px',
    lineHeight: '1.5',
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
