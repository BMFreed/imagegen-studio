/**
 * Prevent physical desktop typing from activating a native smoke's focused controls. On the tested
 * Electron runtime, CDP keyboard input bypasses before-input-event and still drives the built DOM,
 * keyboard handlers and Canvas. Keep the real compositor visible for screenshots.
 */
export async function isolateNativeSmokeWindow(application) {
  const window = await application.firstWindow()
  await application.evaluate(({ BrowserWindow }) => {
    for (const nativeWindow of BrowserWindow.getAllWindows()) {
      nativeWindow.webContents.setBackgroundThrottling(false)
      nativeWindow.webContents.on('before-input-event', (event) => event.preventDefault())
    }
  })
  return window
}
