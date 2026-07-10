export const AppLayer = {
  appOverlay: 1000,
  content: 0,
  dialog: 2000,
  floatingControl: 100,
  notification: 4000,
  popover: 3000,
  stickyChrome: 10,
} as const;

export const appLayerCssVariables = {
  '--z-app-overlay': String(AppLayer.appOverlay),
  '--z-content': String(AppLayer.content),
  '--z-floating-control': String(AppLayer.floatingControl),
  '--z-sticky-chrome': String(AppLayer.stickyChrome),
};
