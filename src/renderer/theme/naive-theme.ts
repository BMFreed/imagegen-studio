import type { GlobalThemeOverrides } from 'naive-ui'

// Keep the production shell aligned with the approved Vue prototype palette.
export const imageGenNaiveTheme = {
  common: {
    fontSize: '13px',
    fontSizeMedium: '13px',
    fontSizeSmall: '13px',
    fontSizeTiny: '12px',
    heightMedium: '30px',
    heightSmall: '26px',
    lineHeight: '1.5',
    primaryColor: '#64e36e',
    primaryColorHover: '#7ee787',
    primaryColorPressed: '#2a9332',
    primaryColorSuppl: '#5ccc65',
  },
  Tabs: {
    tabTextColorActiveCard: '#8dd9a2',
  },
} satisfies GlobalThemeOverrides
