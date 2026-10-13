/** The close acknowledgement distinguishes a user's Cancel from an editor/storage failure. */
export const WINDOW_CLOSE_CANCELED_MESSAGE = 'Window close was canceled by the user.'

export class WindowCloseCanceledError extends Error {
  constructor() {
    super(WINDOW_CLOSE_CANCELED_MESSAGE)
    this.name = 'WindowCloseCanceledError'
  }
}
