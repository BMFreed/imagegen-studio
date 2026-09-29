/** View-only feedback; exporting a candidate never changes Project document state. */
export interface CandidateExportFeedback {
  kind: 'error' | 'success'
  message: string
}
